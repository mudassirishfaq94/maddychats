/** Production browser/API checks; exclusively a disposable loopback test DB. */
import assert from 'node:assert/strict';
import { randomUUID, randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { mkdir, writeFile, cp, readdir, readFile } from 'node:fs/promises';
import { Pool } from 'pg';
import { SignJWT } from 'jose';
import { chromium } from 'playwright';

const dbUrl = process.env.CACHE_TEST_DATABASE_URL;
assert(dbUrl && new URL(dbUrl).hostname === '127.0.0.1' && new URL(dbUrl).pathname.endsWith('_test'));
const origin = process.env.CACHE_TEST_ORIGIN || 'http://localhost:3187';
assert(['localhost', '127.0.0.1'].includes(new URL(origin).hostname));
const secret = randomBytes(32).toString('hex');
const db = new Pool({ connectionString: dbUrl });
const tag = 'cacheqa_' + randomUUID().replaceAll('-', '');
const users = [];
const contexts = [];
let browser;
let server;
const report = { dataset: '100,000 synthetic public communities; local production server', checks: [] };
const check = text => { report.checks.push(text); console.log(text); };
try {
  await cp('.next/static', '.next/standalone/.next/static', { recursive: true });
  await cp('public', '.next/standalone/public', { recursive: true });
  server = spawn(process.execPath, [resolve('.next/standalone/server.js')], {
    windowsHide: true, stdio: 'pipe', env: { ...process.env,
      DATABASE_URL: dbUrl, REALTIME_DATABASE_URL: dbUrl, JWT_SECRET: secret,
      PORT: new URL(origin).port, HOSTNAME: new URL(origin).hostname, CLIENT_URL: origin,
      RESEND_API_KEY: '', VAPID_PRIVATE_KEY: '', FIREBASE_PRIVATE_KEY: '',
      CSP_ENFORCE: '1',
    },
  });
  let serverOutput = '';
  server.stdout.on('data', d => { serverOutput += d; });
  server.stderr.on('data', d => { serverOutput += d; });
  let ready = false;
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(origin + '/api/health')).ok) { ready = true; break; } } catch {}
    await new Promise(r => setTimeout(r, 200));
  }
  assert(ready, serverOutput);
  for (const suffix of ['a', 'b']) {
    const user = (await db.query("INSERT INTO users(username,display_name,email,password_hash,email_verified_at) VALUES($1,$1,$2,'test-only',now()) RETURNING id,username", [tag + suffix, tag + suffix + '@example.invalid'])).rows[0];
    users.push(user);
    const now = Date.now();
    const session = (await db.query("INSERT INTO device_sessions(user_id,refresh_hash,user_agent,auth_time,mfa_time,expires_at,approval_required) VALUES($1,$2,'Cache QA browser',$3,0,now()+interval '1 hour',false) RETURNING id", [user.id, randomUUID(), now])).rows[0];
    user.token = await new SignJWT({ usr: user.username, iatMs: now, authTime: now, mfaTime: 0, sid: session.id }).setProtectedHeader({ alg: 'HS256', typ: 'JWT' }).setSubject(user.id).setIssuer('maddy-chats').setAudience('maddy-chats-web').setIssuedAt().setExpirationTime('15m').sign(new TextEncoder().encode(secret));
    const privateCommunity = (await db.query("INSERT INTO communities(name,created_by,is_public) VALUES($1,$2,false) RETURNING id", [tag + suffix + '_private', user.id])).rows[0];
    await db.query("INSERT INTO community_members(community_id,user_id,role) VALUES($1,$2,'owner')", [privateCommunity.id, user.id]);
  }
  await db.query("INSERT INTO communities(name,created_by,is_public,created_at) SELECT $1 || g,$2,true,now()-g*interval '1 millisecond' FROM generate_series(1,100000) g", [tag, users[0].id]);
  await db.query('ANALYZE communities');
  browser = await chromium.launch({ headless: true });
  for (const user of users) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true });
    contexts.push(context);
    await context.addCookies([{ name: 'maddy_session', value: user.token, url: origin }]);
  }
  const page = await contexts[0].newPage();
  // A creation through the real API expires any cache left by an earlier run.
  const request = contexts[0].request;
  const created = await request.post(origin + '/api/communities', { data: { name: tag + '_initial' }, headers: { Origin: origin } });
  assert.equal(created.status(), 201, await created.text());
  const firstResponse = page.waitForResponse(r => r.url() === origin + '/api/communities' && r.request().method() === 'GET');
  const started = performance.now();
  await page.goto(origin + '/app/communities');
  const first = await firstResponse;
  const firstData = await first.json();
  await page.getByRole('link', { name: tag + 'a_private', exact: true }).waitFor();
  const coldScreenMs = performance.now() - started;
  const secondResponse = page.waitForResponse(r => r.url() === origin + '/api/communities' && r.request().method() === 'GET');
  const restarted = performance.now();
  await page.reload();
  const second = await secondResponse;
  assert.deepEqual(await second.json(), firstData);
  await page.getByRole('link', { name: tag + 'a_private', exact: true }).waitFor();
  const warmScreenMs = performance.now() - restarted;
  assert.equal(second.headers()['cache-control'], 'private, no-store');
  check('Actual mobile Communities screen opened twice; cached and uncached response data identical.');
  const coldApiMs = (await first.finished(), (await first.request().timing()).responseEnd - (await first.request().timing()).requestStart);
  const warmApiMs = (await second.finished(), (await second.request().timing()).responseEnd - (await second.request().timing()).requestStart);
  report.timings = { coldScreenMs, warmScreenMs, coldApiMs, warmApiMs };
  const entries = await readdir('.next/standalone/.next/cache/fetch-cache');
  let cachedDirectory;
  for (const entry of entries) {
    const value = JSON.parse(await readFile('.next/standalone/.next/cache/fetch-cache/' + entry, 'utf8'));
    const body = value.data?.body;
    if (body?.includes(tag + '_initial')) cachedDirectory = JSON.parse(body);
  }
  assert(cachedDirectory?.rows?.length === 20);
  assert(!cachedDirectory.rows.some(c => c.name.endsWith('_private')));
  check('Next persisted the public-only directory in its real framework data cache.');
  // Warm the process and browser first so these pairs isolate a data-cache miss
  // from a hit, rather than attributing module startup to caching.
  const pairs = [];
  for (let i = 0; i < 5; i++) {
    const invalidate = await request.post(origin + '/api/communities', { data: { name: tag + '_pair' + i }, headers: { Origin: origin } });
    assert.equal(invalidate.status(), 201);
    const missStart = performance.now();
    const miss = await request.get(origin + '/api/communities');
    const missData = await miss.json();
    const missMs = performance.now() - missStart;
    const hitStart = performance.now();
    const hit = await request.get(origin + '/api/communities');
    assert.deepEqual(await hit.json(), missData);
    pairs.push({ missMs, hitMs: performance.now() - hitStart });
  }
  report.warmedProcessPairs = pairs;
  const median = key => pairs.map(p => p[key]).sort((a, b) => a - b)[2];
  report.timings.medianMissMs = median('missMs');
  report.timings.medianHitMs = median('hitMs');
  const userB = await contexts[1].request.get(origin + '/api/communities');
  assert.equal(userB.status(), 200);
  const b = await userB.json();
  assert(firstData.myCommunities.every(c => c.createdBy === users[0].id));
  assert(b.myCommunities.every(c => c.createdBy === users[1].id));
  assert(!b.myCommunities.some(c => c.id === firstData.myCommunities[0].id));
  const currentA = await (await request.get(origin + '/api/communities')).json();
  assert.deepEqual(b.publicCommunities, currentA.publicCommunities);
  assert(!b.publicCommunities.some(c => c.name.endsWith('_private')));
  const pageB = await contexts[1].newPage();
  await pageB.goto(origin + '/app/communities');
  await pageB.getByRole('link', { name: tag + 'b_private', exact: true }).waitFor();
  assert.equal(await pageB.getByRole('link', { name: tag + 'a_private', exact: true }).count(), 0);
  check('Two real device sessions: private memberships isolated; public cache shared without private rows.');
  const changed = await request.post(origin + '/api/communities', { data: { name: tag + '_changed' }, headers: { Origin: origin } });
  assert.equal(changed.status(), 201);
  const changedRow = (await changed.json()).community;
  const refreshed = await (await contexts[1].request.get(origin + '/api/communities')).json();
  assert(refreshed.publicCommunities.some(c => c.id === changedRow.id));
  await pageB.reload();
  await pageB.getByRole('link', { name: tag + 'b_private', exact: true }).waitFor();
  await pageB.getByRole('button', { name: /^Browse/ }).click();
  await pageB.getByRole('link', { name: tag + '_changed', exact: true }).waitFor();
  check('Creation invalidation: other account sees new public community on its very next request.');
  await db.query("UPDATE communities SET name=$1 WHERE id=$2", [tag + '_external_edit', changedRow.id]);
  console.log('Waiting for the real 60-second cache TTL to expire...');
  await new Promise(resolve => setTimeout(resolve, 61_000));
  const expired = await (await request.get(origin + '/api/communities')).json();
  assert(expired.publicCommunities.some(c => c.id === changedRow.id && c.name === tag + '_external_edit'));
  check('Direct database edit visible on first request after TTL; stale-while-revalidate never exceeds our age limit.');
  const deleted = await request.post(origin + '/api/privacy/delete-account', { data: { confirm: 'DELETE' }, headers: { Origin: origin } });
  assert.equal(deleted.status(), 200, await deleted.text());
  const afterDeletion = await (await contexts[1].request.get(origin + '/api/communities')).json();
  assert(afterDeletion.publicCommunities.some(c => c.id === changedRow.id && c.createdBy === null));
  check('Account deletion immediately invalidates cached creator IDs after the foreign-key update.');
  const anonymous = await fetch(origin + '/api/communities');
  assert.equal(anonymous.status, 401);
  await db.query('UPDATE device_sessions SET revoked_at=now() WHERE user_id=$1', [users[1].id]);
  assert.equal((await contexts[1].request.get(origin + '/api/communities')).status(), 401);
  check('Warm cache cannot bypass authentication: anonymous and revoked device denied.');
  const asset = await fetch(origin + '/brand/circlo-dark.svg');
  assert.equal(asset.status, 200);
  assert.match(asset.headers.get('cache-control'), /public, max-age=3600/);
  check('Public brand asset has one-hour HTTP caching; private combined API remains no-store.');
  await mkdir('docs/performance', { recursive: true });
  await writeFile('docs/performance/cache-verification.json', JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report.timings));
} finally {
  await browser?.close();
  server?.kill();
  await db.query('DELETE FROM communities WHERE name LIKE $1', [tag + '%']);
  for (const user of users) await db.query('DELETE FROM users WHERE id=$1 AND username LIKE $2', [user.id, tag + '%']);
  await db.end();
}
