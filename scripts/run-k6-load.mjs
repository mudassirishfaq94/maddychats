/** Creates a fresh local DB and fake accounts; never uses .env or production credentials. */
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { randomBytes, randomUUID, createCipheriv } from 'node:crypto';
import { createServer, request } from 'node:http';
import { cp, mkdir, writeFile, readFile, access } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import { resolve, join } from 'node:path';
import { cpus, freemem, totalmem, platform } from 'node:os';
import pg from 'pg';
import bcrypt from 'bcryptjs';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';

const adminUrl = process.env.LOAD_TEST_ADMIN_URL;
assert(adminUrl, 'Set LOAD_TEST_ADMIN_URL to your local PostgreSQL admin connection (example in docs/performance/load-testing.md).');
const parsed = new URL(adminUrl);
assert.equal(parsed.hostname, '127.0.0.1', 'Only a loopback database is permitted.');
assert.equal(parsed.pathname, '/postgres', 'Use the local postgres admin database; the runner creates its own isolated DB.');
const profile = process.env.LOAD_PROFILE || 'full';
assert(['full', 'smoke', 'steady'].includes(profile));
const k6Candidates = [process.env.K6_BINARY, 'k6', 'C:/Program Files/k6/k6.exe', resolve('.freebuff/tools/k6/k6-v2.2.0-windows-amd64/k6.exe')].filter(Boolean);
const k6 = k6Candidates.find(bin => spawnSync(bin, ['version'], { windowsHide: true }).status === 0);
assert(k6, 'Install k6: winget install --id GrafanaLabs.k6 --exact --source winget');
await access('.next/standalone/server.js');
// Refuse occupied ports before starting anything: never mistake an existing
// local app (which might use real data) for the server owned by this run.
for (const port of [3190, 3191]) {
  const probe = createServer();
  await new Promise((ready, reject) => {
    probe.once('error', reject); probe.listen(port, '127.0.0.1', ready);
  });
  await new Promise(r => probe.close(r));
}
const runId = randomBytes(8).toString('hex');
const dbName = 'circlo_k6_' + runId + '_test';
const directory = resolve('.freebuff/k6/' + runId);
await mkdir(directory, { recursive: true });
const output = resolve('docs/performance/k6-' + profile + '-results.json');
const baseUrl = 'http://127.0.0.1:3190';
const dbParsed = new URL(adminUrl); dbParsed.pathname = '/' + dbName;
const databaseUrl = dbParsed.toString();
const admin = new pg.Pool({ connectionString: adminUrl, max: 1 });
let sql, server, gateway, monitor;
let databaseCreated = false;
let k6Process;
const samples = [];
let appLog = '';
let externalBlocked = false;
try {
  // The generated, validated identifier is the only database we create/remove.
  assert(/^circlo_k6_[a-f0-9]{16}_test$/.test(dbName));
  await admin.query('CREATE DATABASE ' + dbName);
  databaseCreated = true;
  sql = new pg.Pool({ connectionString: databaseUrl, max: 2 });
  await migrate(drizzle(sql), { migrationsFolder: 'drizzle' });
  for (const statement of (await readFile('drizzle/online/0041_undelivered_messages.up.sql', 'utf8')).split('--> statement-breakpoint')) {
    if (statement.trim()) await sql.query(statement);
  }
  const password = randomBytes(20).toString('base64url');
  const hash = await bcrypt.hash(password, 12);
  const accounts = [];
  // 100 independent users + peers, 10 chats each, 50 historical messages/chat.
  for (let i = 0; i < 100; i++) {
    const username = 'k6_' + runId.slice(0, 6) + '_' + i;
    const actor = (await sql.query('INSERT INTO users(username,display_name,email,password_hash,email_verified_at) VALUES($1,$1,$2,$3,now()) RETURNING id', [username, username + '@example.invalid', hash])).rows[0];
    const peer = (await sql.query('INSERT INTO users(username,display_name,email,password_hash,email_verified_at) VALUES($1,$1,$2,$3,now()) RETURNING id', [username + '_peer', username + '_peer@example.invalid', hash])).rows[0];
    const key = randomBytes(32), iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    const ciphertext = Buffer.concat([iv, cipher.update('Synthetic local-only chat payload'), cipher.final(), cipher.getAuthTag()]).toString('base64');
    const conversations = [];
    for (let c = 0; c < 10; c++) {
      const conversation = (await sql.query("INSERT INTO conversations(type,created_by_id,last_message_at) VALUES('dm',$1,now()-interval '1 day') RETURNING id", [actor.id])).rows[0].id;
      conversations.push(conversation);
      await sql.query("INSERT INTO conversation_members(conversation_id,user_id,accepted_at) VALUES($1,$2,now()),($1,$3,now())", [conversation, actor.id, peer.id]);
      await sql.query("INSERT INTO messages(conversation_id,sender_id,text,encrypted,created_at,delivered_at) SELECT $1,$2,$3,true,now()-interval '1 day'+g*interval '1 second',now()-interval '1 day' FROM generate_series(1,50) g", [conversation, peer.id, ciphertext]);
    }
    const community = (await sql.query('INSERT INTO communities(name,created_by,is_public) VALUES($1,$2,false) RETURNING id', ['Private fixture ' + i, actor.id])).rows[0].id;
    await sql.query("INSERT INTO community_members(community_id,user_id,role) VALUES($1,$2,'owner')", [community, actor.id]);
    accounts.push({ id: actor.id, username, conversations, ciphertext, ip: '198.18.0.' + (i + 1) });
  }
  await sql.query("INSERT INTO communities(name,is_public) SELECT 'Public synthetic circle '||g,true FROM generate_series(1,1000) g");
  await sql.query('ANALYZE');
  const fixtureFile = join(directory, 'fixture.json');
  await writeFile(fixtureFile, JSON.stringify({ environment: 'isolated-local-k6', runId, baseUrl, password, accounts }));
  await cp('.next/static', '.next/standalone/.next/static', { recursive: true });
  await cp('public', '.next/standalone/public', { recursive: true });
  // Fetch, HTTP(S), and socket traffic in the server is restricted to loopback.
  const env = { ...process.env, DATABASE_URL: databaseUrl, REALTIME_DATABASE_URL: databaseUrl,
    JWT_SECRET: randomBytes(32).toString('hex'), CLIENT_URL: baseUrl, HOSTNAME: '127.0.0.1', PORT: '3191',
    RESEND_API_KEY: '', VAPID_PRIVATE_KEY: '', VAPID_SUBJECT: '', NEXT_PUBLIC_VAPID_PUBLIC_KEY: '',
    FIREBASE_PRIVATE_KEY: '', FIREBASE_CLIENT_EMAIL: '', FIREBASE_PROJECT_ID: '', GOOGLE_APPLICATION_CREDENTIALS: '',
    GOOGLE_CLIENT_SECRET: '', GOOGLE_CLIENT_ID: '', SUPABASE_SERVICE_ROLE_KEY: '', SUPABASE_URL: '',
    OPENAI_API_KEY: '', STRIPE_SECRET_KEY: '', CSP_ENFORCE: '1',
    STARTER_MODE: '1', SCHEDULED_MESSAGES_ENABLED: '1', DATABASE_POOL_MAX: '5',
    NODE_OPTIONS: '',
  };
  server = spawn(process.execPath, ['--require', resolve('scripts/load-test-network-guard.cjs'), resolve('.next/standalone/server.js')], { windowsHide: true, stdio: 'pipe', env });
  server.stdout.on('data', data => { appLog += data; });
  server.stderr.on('data', data => { appLog += data; });
  let ready = false;
  for (let i = 0; i < 100; i++) {
    assert.equal(server.exitCode, null, 'The server owned by this load test exited during startup.');
    try { if ((await fetch('http://127.0.0.1:3191/api/health')).status === 204) { ready = true; break; } } catch {}
    await new Promise(r => setTimeout(r, 200));
  }
  assert(ready, 'Local app failed to start: ' + appLog);
  gateway = createServer((req, res) => {
    const upstream = request({ hostname: '127.0.0.1', port: 3191, path: req.url, method: req.method,
      headers: { ...req.headers, host: '127.0.0.1:3190', 'x-forwarded-host': '127.0.0.1:3190', 'x-forwarded-proto': 'http' } }, response => {
      res.writeHead(response.statusCode, { ...response.headers, 'x-load-test-environment': runId });
      response.pipe(res);
    });
    upstream.on('error', () => { if (!res.headersSent) res.writeHead(502); res.end('Local upstream unavailable'); });
    req.pipe(upstream);
  });
  await new Promise((resolveListen, reject) => { gateway.once('error', reject); gateway.listen(3190, '127.0.0.1', resolveListen); });
  // Verify the external-connection guard without sending a network request.
  const probe = spawnSync(process.execPath, ['--require', resolve('scripts/load-test-network-guard.cjs'), '-e', "try { fetch('https://example.invalid'); process.exit(1); } catch { process.exit(0); }"], { windowsHide: true });
  externalBlocked = probe.status === 0;
  assert(externalBlocked);
  console.log(`Running ${profile} profile, only at ${baseUrl}; 200 fake users, 1,000 chats, 50,000 historical messages; outbound network blocked.`);
  // Warm real authenticated route modules so the ramp measures steady traffic
  // rather than mistaking one-time module initialization for user capacity.
  const warmUser = accounts[0];
  const warmLogin = await fetch(baseUrl + '/api/auth/login', {
    method: 'POST', headers: { Origin: baseUrl, 'Content-Type': 'application/json', 'X-Forwarded-For': warmUser.ip },
    body: JSON.stringify({ identifier: warmUser.username, password }),
  });
  assert.equal(warmLogin.status, 200);
  assert.equal((await warmLogin.json()).user.id, warmUser.id, 'The app must authenticate against this run\'s fake database.');
  const warmCookie = warmLogin.headers.getSetCookie().map(cookie => cookie.split(';')[0]).join('; ');
  for (const path of ['/app/chats', '/api/conversations', '/api/communities', '/api/conversations/' + warmUser.conversations[0] + '/messages?limit=30']) {
    const response = await fetch(baseUrl + path, { headers: { Cookie: warmCookie, 'X-Forwarded-For': warmUser.ip } });
    assert.equal(response.status, 200); await response.arrayBuffer();
  }
  const warmSend = await fetch(baseUrl + '/api/conversations/' + warmUser.conversations[0] + '/messages', {
    method: 'POST', headers: { Cookie: warmCookie, Origin: baseUrl, 'Content-Type': 'application/json', 'X-Forwarded-For': warmUser.ip },
    body: JSON.stringify({ encrypted: true, text: warmUser.ciphertext, clientMessageId: randomUUID() }),
  });
  assert.equal(warmSend.status, 201); await warmSend.arrayBuffer();
  if (profile === 'steady') {
    console.log('Preparing 100 returning-user sessions through real sequential password logins (outside measurement)...');
    for (let i = 0; i < accounts.length; i++) {
      const account = accounts[i];
      const response = await fetch(baseUrl + '/api/auth/login', {
        method: 'POST', headers: { Origin: baseUrl, 'Content-Type': 'application/json', 'X-Forwarded-For': account.ip },
        body: JSON.stringify({ identifier: account.username, password }),
      });
      assert.equal(response.status, 200);
      assert.equal((await response.json()).user.id, account.id);
      account.authCookies = response.headers.getSetCookie().map(raw => {
        const cookie = raw.split(';')[0]; const separator = cookie.indexOf('=');
        return { name: cookie.slice(0, separator), value: cookie.slice(separator + 1) };
      }).filter(cookie => cookie.value);
      if ((i + 1) % 20 === 0) console.log(`Prepared ${i + 1}/100 real sessions.`);
    }
    await writeFile(fixtureFile, JSON.stringify({ environment: 'isolated-local-k6', runId, baseUrl, password, accounts }));
  }
  const cpuBefore = cpus();
  const startedAt = Date.now();
  let monitoring = false;
  monitor = setInterval(async () => {
    if (monitoring) return; monitoring = true;
    try {
      const activity = (await sql.query("SELECT state,wait_event_type,wait_event,count(*)::int AS count FROM pg_stat_activity WHERE datname=$1 GROUP BY state,wait_event_type,wait_event", [dbName])).rows;
      samples.push({ seconds: (Date.now() - startedAt) / 1000, freeMemoryMiB: freemem() / 1048576, activity });
    } catch {} finally { monitoring = false; }
  }, 5000);
  const summaryFile = join(directory, 'summary.json');
  const pointsFile = join(directory, 'points.json');
  k6Process = spawn(k6, ['run', '--no-usage-report', '--quiet', '--out', 'json=' + pointsFile, resolve('tests/load/chat.k6.js')], { windowsHide: true, stdio: 'pipe', env: {
    ...process.env, K6_NO_USAGE_REPORT: 'true', BASE_URL: baseUrl, K6_FIXTURE_FILE: fixtureFile,
    K6_SUMMARY_FILE: summaryFile, LOAD_PROFILE: profile,
  } });
  let testLog = '';
  k6Process.stdout.on('data', d => { testLog += d; });
  k6Process.stderr.on('data', d => { testLog += d; });
  const exitCode = await new Promise((res, rej) => { k6Process.once('error', rej); k6Process.once('exit', res); });
  clearInterval(monitor); monitor = undefined;
  const aggregates = new Map();
  const bucket = (stage, action) => {
    const key = stage + '/' + action;
    if (!aggregates.has(key)) aggregates.set(key, { stage, action, durations: [], failures: 0, requests: 0, semanticFailures: 0, statuses: {} });
    return aggregates.get(key);
  };
  for await (const line of createInterface({ input: createReadStream(pointsFile), crlfDelay: Infinity })) {
    const point = JSON.parse(line);
    if (point.type !== 'Point') continue;
    const { tags = {}, value } = point.data;
    const rows = [bucket(tags.stage || 'other', tags.action || 'other'), bucket(tags.stage || 'other', 'all')];
    if (point.metric === 'http_req_duration') for (const row of rows) {
      row.durations.push(value); row.requests++; row.statuses[tags.status] = (row.statuses[tags.status] || 0) + 1;
    }
    if (point.metric === 'http_req_failed') for (const row of rows) row.failures += value;
    if (point.metric === 'journey_failed') bucket(tags.stage || 'other', 'all').semanticFailures += value;
  }
  const measurements = [...aggregates.values()].filter(row => row.requests).map(row => {
    row.durations.sort((a,b) => a-b);
    const percentile = p => row.durations[Math.min(row.durations.length-1, Math.ceil(p * row.durations.length)-1)];
    const result = { stage: row.stage, action: row.action, requests: row.requests, p95Ms: percentile(0.95), p99Ms: percentile(0.99), failureRate: row.failures / row.requests, statuses: row.statuses, semanticFailures: row.semanticFailures };
    result.passes = result.p95Ms < 500 && result.failureRate < 0.01 && result.semanticFailures === 0;
    return result;
  });
  const summary = JSON.parse(await readFile(summaryFile, 'utf8'));
  const result = { timestamp: new Date().toISOString(), profile, target: baseUrl, environment: 'local production standalone build; generator and database on same machine',
    hardware: { platform: platform(), logicalCpus: cpuBefore.length, totalMemoryMiB: totalmem()/1048576 },
    fixture: { users: 200, conversations: 1000, messages: 50000, publicCommunities: 1000, bcryptCost: 12, appPoolMax: 5 },
    thirdPartyConnectionsBlocked: externalBlocked, k6Version: spawnSync(k6, ['version'], { encoding: 'utf8', windowsHide: true }).stdout.trim(),
    thresholdsPassed: exitCode === 0, exitCode, measurements, summary, databaseSamples: samples,
    serverErrorLines: appLog.split(/\r?\n/).filter(line => /error|blocked|failed|timeout/i.test(line)).slice(0,30),
  };
  await mkdir('docs/performance', { recursive: true });
  await writeFile(output, JSON.stringify(result, null, 2) + '\n');
  await writeFile(join(directory, 'k6.log'), testLog);
  console.log(measurements.filter(row => row.action === 'all').map(row => `${row.stage}: p95=${row.p95Ms.toFixed(1)}ms failures=${(row.failureRate*100).toFixed(2)}% requests=${row.requests}`).join('\n'));
  console.log(`k6 exit ${exitCode}; report ${output}`);
  if (exitCode !== 0) process.exitCode = exitCode;
} finally {
  clearInterval(monitor);
  k6Process?.kill();
  gateway?.closeAllConnections();
  if (gateway) await new Promise(r => gateway.close(r));
  if (server && server.exitCode === null) {
    const exited = new Promise(r => server.once('exit', r)); server.kill(); await exited;
  }
  await sql?.end();
  // This exact generated DB belongs to this run; no existing DB is removed.
  if (databaseCreated) await admin.query('DROP DATABASE IF EXISTS ' + dbName + ' WITH (FORCE)');
  await admin.end();
}
