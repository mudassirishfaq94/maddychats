import { encryptMessage, generateConversationKey } from "../src/lib/crypto";
import { SignJWT } from "jose";
import { createHash, randomUUID } from "node:crypto";
import { hashPassword } from "../src/server/password";
/** Destructive only to three explicitly named, loopback-only disposable databases. */
import { fixtureAppSession } from "./fixture-app-session.mjs";
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { is, Table } from "drizzle-orm";
import { getTableConfig } from "drizzle-orm/pg-core";
import * as schema from "../src/db/schema";

async function main() {
  const url = process.env.ITEM2_TEST_DATABASE_URL;
  assert(url, "Set ITEM2_TEST_DATABASE_URL to loopback /item2_deployment_test");
  const parsed = new URL(url);
  assert(["127.0.0.1", "localhost"].includes(parsed.hostname) && parsed.pathname === "/item2_deployment_test", "Refusing non-test database");
  const temp = await mkdtemp(join(tmpdir(), "circlo-item2-"));
  const adminUrl = new URL(url); adminUrl.pathname = "/postgres";
  const admin = new Pool({ connectionString: adminUrl.toString() });
  const pools: Pool[] = [];
  const children: ChildProcess[] = [];
  const names = ["item2_deployment_test", "item2_upgrade_test", "item2_restore_test"];
  const run = async (script: string, env: Record<string, string | undefined>, args: string[] = [], expectedCode = 0) => {
    const child = spawn(process.execPath, [script, ...args, ...((env.BACKUP_ACTION && env.BACKUP_FILE) ? [env.BACKUP_ACTION, env.BACKUP_FILE] : [])], { env: { ...process.env, ...env }, stdio: "pipe", windowsHide: true });
    let output = ""; child.stdout?.on("data", (c) => output += c); child.stderr?.on("data", (c) => output += c);
    const [code] = await once(child, "exit");
    assert.equal(code, expectedCode, output);
  };
  const verifySchema = async (pool: Pool) => {
    const columns = (await pool.query("select table_name,column_name,is_nullable from information_schema.columns where table_schema='public'")).rows;
    for (const table of Object.values(schema)) {
      if (!is(table, Table)) continue;
      const config = getTableConfig(table);
      for (const column of config.columns) {
        const actual = columns.find((c) => c.table_name === config.name && c.column_name === column.name);
        assert(actual, `Missing ${config.name}.${column.name}`);
        assert.equal(actual.is_nullable, column.notNull ? "NO" : "YES", `Nullability ${config.name}.${column.name}`);
      }
    }
  };
  try {
    for (const name of names) {
      await admin.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
      await admin.query(`CREATE DATABASE ${name}`);
      const next = new URL(url); next.pathname = `/${name}`;
      pools.push(new Pool({ connectionString: next.toString() }));
      pools[pools.length - 1].on("error", () => undefined); // intentional outage below
    }
    const [fresh, upgrade, restored] = pools;
    await migrate(drizzle(fresh), { migrationsFolder: "drizzle" });
    await verifySchema(fresh);
    await migrate(drizzle(fresh), { migrationsFolder: "drizzle" });
    const journal = JSON.parse(await readFile("drizzle/meta/_journal.json", "utf8"));
    const legacy = join(temp, "legacy"); await mkdir(join(legacy, "meta"), { recursive: true });
    const entries = journal.entries.filter((e: { tag: string; idx: number }) => e.idx < 32);
    await writeFile(join(legacy, "meta/_journal.json"), JSON.stringify({ ...journal, entries }));
    for (const e of entries) await writeFile(join(legacy, `${e.tag}.sql`), await readFile(`drizzle/${e.tag}.sql`));
    await migrate(drizzle(upgrade), { migrationsFolder: legacy });
    // Production had manually applied feature DDL while its journal stopped
    // at 0013. Replaying those features must preserve existing schema/data.
    await upgrade.query("delete from drizzle.__drizzle_migrations where created_at > 1788465600000");
    const user = (await upgrade.query("insert into users(username,display_name,email,password_hash) values('upgrade_user','Upgrade','upgrade@example.invalid','test-hash') returning id")).rows[0];
    await upgrade.query("insert into e2ee_keys(user_id,device_id,public_key,encrypted_private_key) values($1,'legacy','public','opaque')", [user.id]);
    await migrate(drizzle(upgrade), { migrationsFolder: "drizzle" });
    await verifySchema(upgrade);
    assert.equal((await upgrade.query("select count(*)::int as count from users where id=$1", [user.id])).rows[0].count, 1);
    assert((await upgrade.query("select trusted_at from e2ee_keys where device_id='legacy'")).rows[0].trusted_at);
    await upgrade.query("insert into e2ee_keys(user_id,device_id,public_key,encrypted_private_key) values($1,'pending','public','opaque')", [user.id]);
    await upgrade.query(await readFile("drizzle/0032_e2ee_trusted_devices.sql", "utf8"));
    await upgrade.query(await readFile("drizzle/0034_deployment_schema_repair.sql", "utf8"));
    assert.equal((await upgrade.query("select trusted_at from e2ee_keys where device_id='pending'")).rows[0].trusted_at, null);
    await fresh.query("BEGIN");
    try {
      await fresh.query("ALTER TYPE report_status RENAME VALUE 'pending' TO 'incompatible'");
      await assert.rejects(fresh.query(await readFile("drizzle/0010_privacy_safety.sql", "utf8")), /Incompatible existing report_status enum/);
    } finally { await fresh.query("ROLLBACK"); }
    await fresh.query("BEGIN");
    try {
      await fresh.query('ALTER TABLE e2ee_signal_prekeys DROP CONSTRAINT e2ee_signal_prekeys_device_kind_key_unique');
      await fresh.query('ALTER TABLE e2ee_signal_prekeys ADD CONSTRAINT e2ee_signal_prekeys_device_kind_key_unique UNIQUE (id)');
      await assert.rejects(fresh.query(await readFile("drizzle/0027_signal_prekey_kind_unique.sql", "utf8")), /Incompatible existing Signal prekey uniqueness constraint/);
    } finally { await fresh.query("ROLLBACK"); }
    console.log("Fresh and upgraded migrations preserve data and pending device trust; schema parity passed");

    const base = "http://127.0.0.1:3108";
    const testEnv = { ...process.env, DATABASE_URL: url, NODE_ENV: "production" as const, HOSTNAME: "127.0.0.1", PORT: "3108", CLIENT_URL: base, JWT_SECRET: "item2-test-only-at-least-thirty-two-characters", HEALTHCHECK_SECRET: "test-readiness", CRON_SECRET: "test-cron", RESEND_API_KEY: "", VAPID_PRIVATE_KEY: "", FIREBASE_PROJECT_ID: "", SUPABASE_URL: "", SUPABASE_SERVICE_ROLE_KEY: "" };
    const server = spawn(process.execPath, [resolve(".next/standalone/server.js")], { env: testEnv, stdio: "pipe", windowsHide: true });
    children.push(server);
    let serverOutput = ""; server.stdout?.on("data", (c) => serverOutput += c); server.stderr?.on("data", (c) => serverOutput += c);
    let alive = false;
    for (let i = 0; i < 100; i++) {
      try { alive = (await fetch(`${base}/api/health`)).status === 204; } catch { /* startup */ }
      if (alive) break; await sleep(200);
    }
    assert(alive, serverOutput);
    assert.equal((await fetch(`${base}/api/ready`)).status, 401);
    const ready = () => fetch(`${base}/api/ready`, { headers: { authorization: "Bearer test-readiness" } });
    assert.equal((await ready()).status, 200);
    await fresh.query('alter table e2ee_key_history rename to unavailable_history');
    assert.equal((await ready()).status, 503);
    assert.equal((await fetch(`${base}/api/health`)).status, 204);
    await fresh.query('alter table unavailable_history rename to e2ee_key_history');
    try {
      await admin.query("ALTER DATABASE item2_deployment_test ALLOW_CONNECTIONS false");
      await admin.query("select pg_terminate_backend(pid) from pg_stat_activity where datname='item2_deployment_test'");
      assert.equal((await ready()).status, 503, "Readiness must fail during a real DB outage");
      assert.equal((await fetch(`${base}/api/health`)).status, 204, "Web process must survive idle connection loss");
    } finally {
      await admin.query("ALTER DATABASE item2_deployment_test ALLOW_CONNECTIONS true");
    }
    assert.equal((await ready()).status, 200, "Readiness recovers after DB outage");
    await fresh.query("update drizzle.__drizzle_migrations set created_at=0 where created_at=1791590400000");
    assert.equal((await ready()).status, 503, "Reachable DB with missing release migration is not ready");
    await fresh.query("update drizzle.__drizzle_migrations set created_at=1791590400000 where created_at=0");
    await run("scripts/readiness.mjs", testEnv);
    assert.equal((await fetch(`${base}/api/cron/process-scheduled`)).status, 401);
    const sender = (await fresh.query("insert into users(username,display_name,email,password_hash) values('worker_sender','Sender','worker@example.invalid','test-hash') returning id")).rows[0];
    const conversation = (await fresh.query("insert into conversations(type,created_by_id) values('dm',$1) returning id", [sender.id])).rows[0];
    await fresh.query("insert into conversation_members(conversation_id,user_id) values($1,$2)", [conversation.id, sender.id]);
    const scheduledCipher = await encryptMessage("Independent delivery", await generateConversationKey());
    await fresh.query("insert into scheduled_messages(conversation_id,sender_id,text,encrypted,scheduled_for) values($1,$2,$3,true,now()-interval '1 minute')", [conversation.id, sender.id, scheduledCipher]);
    const recipient = (await fresh.query("insert into users(username,display_name,email,password_hash) values('worker_recipient','Recipient','worker_recipient@example.invalid','test-hash') returning id")).rows[0];
    const pendingConversation = (await fresh.query("insert into conversations(type,created_by_id) values('dm',$1) returning id", [sender.id])).rows[0];
    await fresh.query("insert into conversation_members(conversation_id,user_id,accepted_at) values($1,$2,now()),($1,$3,null)", [pendingConversation.id,sender.id,recipient.id]);
    await fresh.query("insert into scheduled_messages(conversation_id,sender_id,text,encrypted,scheduled_for) values($1,$2,'ciphertext-pending-introduction',true,now()-interval '1 minute')", [pendingConversation.id,sender.id]);
    const heartbeat = join(temp, "heartbeat");
    const workerEnv = { ...testEnv, SCHEDULED_BASE_URL: base, SCHEDULED_INTERVAL_MS: "1000", WORKER_HEARTBEAT_FILE: heartbeat };
    const worker = spawn(process.execPath, ["scripts/scheduled-worker.mjs"], { env: workerEnv, stdio: "pipe", windowsHide: true }); children.push(worker);
    let sent = false;
    for (let i = 0; i < 100; i++) {
      sent = (await fresh.query("select sent from scheduled_messages where conversation_id=$1", [conversation.id])).rows[0]?.sent;
      if (sent) break; await sleep(200);
    }
    assert(sent, "Worker must deliver without a logged-in client");
    await sleep(2200);
    assert.equal((await fresh.query("select count(*)::int as count from messages where text=$1", [scheduledCipher])).rows[0].count, 1);
    assert.equal((await fresh.query("select sent from scheduled_messages where conversation_id=$1", [pendingConversation.id])).rows[0].sent, false, "Worker must retain a pending request without sending it");
    assert.equal((await fresh.query("select count(*)::int as n from messages where conversation_id=$1", [pendingConversation.id])).rows[0].n, 0);
    await fresh.query("update conversation_members set accepted_at=now() where conversation_id=$1 and user_id=$2", [pendingConversation.id,recipient.id]);
    let approvedSent = false;
    for (let i=0;i<50;i++) { approvedSent = (await fresh.query("select sent from scheduled_messages where conversation_id=$1", [pendingConversation.id])).rows[0].sent; if (approvedSent) break; await sleep(200); }
    assert(approvedSent, "Worker must resume the retained message after approval");
    const workerStopped = once(worker, "exit");
    worker.kill();
    await workerStopped;
    await run("scripts/scheduled-worker.mjs", workerEnv, ["--healthcheck"]);
    await writeFile(heartbeat, "1");
    await run("scripts/scheduled-worker.mjs", workerEnv, ["--healthcheck"], 1);
    console.log("Private readiness, degraded schema, liveness, and independent scheduled delivery passed");

    const backupFile = join(temp, "application.dump");
    await run("scripts/database-backup.mjs", { DATABASE_URL: url, BACKUP_ACTION: "backup", BACKUP_FILE: backupFile });
    const restoreUrl = new URL(url); restoreUrl.pathname = "/item2_restore_test";
    await run("scripts/database-backup.mjs", { RESTORE_DATABASE_URL: restoreUrl.toString(), BACKUP_ACTION: "restore", BACKUP_FILE: backupFile });
    await verifySchema(restored);
    assert.equal((await restored.query("select count(*)::int as count from messages where text=$1", [scheduledCipher])).rows[0].count, 1);
    assert.equal((await restored.query("select count(*)::int as count from drizzle.__drizzle_migrations")).rows[0].count, journal.entries.length);
    await run("scripts/database-backup.mjs", { RESTORE_DATABASE_URL: restoreUrl.toString(), BACKUP_ACTION: "restore", BACKUP_FILE: backupFile }, [], 1);
    console.log("Custom-format backup restoration preserved schema, message data, and migration history");
    const starterBase = "http://127.0.0.1:3109";
    const starter = spawn(process.execPath, [resolve(".next/standalone/server.js")], {
      env: { ...testEnv, PORT: "3109", CLIENT_URL: starterBase, STARTER_MODE: "1", CSP_ENFORCE: "1" }, stdio: "pipe", windowsHide: true,
    });
    children.push(starter);
    let starterReady = false;
    for (let i = 0; i < 100; i++) {
      try { starterReady = (await fetch(`${starterBase}/api/health`)).status === 204; } catch { /* startup */ }
      if (starterReady) break; await sleep(200);
    }
    assert(starterReady);
    for (const path of ["/api/upload/message", "/api/upload/avatar", "/api/e2ee/signal/devices"]) {
      const response = await fetch(starterBase + path, { method: "POST", headers: { Origin: starterBase }, body: "unparsed" });
      assert.equal(response.status, 503);
      assert.match((await response.json()).error, /paused/);
    }
    const pending = (await fresh.query("insert into scheduled_messages(conversation_id,sender_id,text,scheduled_for) values($1,$2,'Paused starter delivery',now()-interval '1 minute') returning id", [conversation.id, sender.id])).rows[0];
    const paused = await fetch(`${starterBase}/api/cron/process-scheduled`, { headers: { authorization: "Bearer test-cron" } });
    assert.equal(paused.status, 200);
    assert.equal((await paused.json()).processed, 0);
    assert.equal((await fresh.query("select sent from scheduled_messages where id=$1", [pending.id])).rows[0].sent, false);
    console.log("Starter API blocks uploads and preserves paused scheduled messages");
    const password = "Starter-test-password-2026";
    const passwordHash = await hashPassword(password);
    const proofUser = (await fresh.query("insert into users(username,display_name,email,password_hash) values('proof_user','Proof','proof@example.invalid',$1) returning id", [passwordHash])).rows[0];
    const proof = await new SignJWT({ emailHash: createHash("sha256").update("proof@example.invalid").digest("hex") })
      .setProtectedHeader({ alg: "HS256", typ: "JWT" }).setSubject(proofUser.id)
      .setIssuer("maddy-chats").setAudience("maddy-chats-email-verification")
      .setJti(randomUUID()).setIssuedAt().setExpirationTime("5m")
      .sign(new TextEncoder().encode(testEnv.JWT_SECRET));
    const login = (secret: string, cookie = proof) => fetch(`${starterBase}/api/auth/login`, {
      method: "POST", headers: { Origin: starterBase, "Content-Type": "application/json", Cookie: `maddy_google_email_proof=${cookie}` },
      body: JSON.stringify({ acceptTerms: true, acceptPrivacy: true, identifier: "proof_user", password: secret }),
    });
    assert.equal((await login("Wrong-password-2026")).status, 401);
    assert.equal((await fresh.query("select email_verified_at from users where id=$1", [proofUser.id])).rows[0].email_verified_at, null);
    assert.equal((await login(password, "forged")).status, 403);
    const verifiedLogin = await login(password);
    assert.equal(verifiedLogin.status, 200);
    await fixtureAppSession(fresh, verifiedLogin);
    assert((await fresh.query("select email_verified_at from users where id=$1", [proofUser.id])).rows[0].email_verified_at);
    assert.equal((await fresh.query("select count(*)::int as count from oauth_accounts where user_id=$1", [proofUser.id])).rows[0].count, 0, "Email proof must not silently link a Google account");
    const proofCookie = verifiedLogin.headers.getSetCookie().find(value => value.startsWith("maddy_session="))!.split(";")[0];
    const historyConversation = (await fresh.query("insert into conversations(type,created_by_id) values('dm',$1) returning id", [proofUser.id])).rows[0];
    await fresh.query("insert into conversation_members(conversation_id,user_id,accepted_at) values($1,$2,now())", [historyConversation.id, proofUser.id]);
    await fresh.query("insert into e2ee_keys(user_id,device_id,public_key,encrypted_private_key,trusted_at) values($1,'history-device','test-public','test-only-backup',now())", [proofUser.id]);
    await fresh.query(`insert into e2ee_key_history(conversation_id,user_id,device_id,recipient_device_id,encrypted_key,key_fingerprint,key_version)
      select $1,$2,'history-source','history-device','wrapped-'||n,'12345 12345 12345 12345 12345 12345',n from generate_series(1,410) n`, [historyConversation.id, proofUser.id]);
    await fresh.query(`insert into e2ee_key_history(conversation_id,user_id,device_id,recipient_device_id,encrypted_key,key_fingerprint,key_version)
      select $1,$2,'history-source',null,'legacy-'||n,null,n from generate_series(411,413) n`, [historyConversation.id, proofUser.id]);
    const signalRegistration = {
      deviceId: randomUUID(), registrationId: 1234, protocolDeviceId: 1,
      identityKey: "A".repeat(44), signingKey: "B".repeat(44),
      signedPrekey: { keyId: 0xffff_ffff, publicKey: "C".repeat(44), signature: "D".repeat(88) },
      kyberPrekey: { keyId: 0x8000_0000, publicKey: "E".repeat(44), signature: "F".repeat(88) },
      oneTimePrekeys: [{ keyId: 0x8000_0001, publicKey: "G".repeat(44) }],
    };
    const signalRegister = (body: unknown) => fetch(`${base}/api/e2ee/signal/devices`, {
      method: "POST", headers: { Origin: base, Cookie: proofCookie, "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    assert.equal((await signalRegister(signalRegistration)).status, 200, "Full uint32 IDs must not overflow PostgreSQL storage");
    assert.equal((await signalRegister({ ...signalRegistration, signedPrekey: { ...signalRegistration.signedPrekey, keyId: -1 } })).status, 422);
    assert.equal((await signalRegister({ ...signalRegistration, signedPrekey: { ...signalRegistration.signedPrekey, keyId: 0x1_0000_0000 } })).status, 422);
    const bundlePath = `/api/e2ee/signal/bundle?conversationId=${historyConversation.id}&userId=${proofUser.id}`;
    const bundleResponse = await fetch(base + bundlePath, { headers: { Origin: base, Cookie: proofCookie } });
    assert.equal(bundleResponse.status, 200);
    const bundle = (await bundleResponse.json()).bundles[0];
    assert.equal(bundle.signedPrekey.keyId, 0xffff_ffff);
    assert.equal(bundle.kyberPrekey.keyId, 0x8000_0000);
    assert.equal(bundle.oneTimePrekey.keyId, 0x8000_0001, "Raw bigint query results must retain the numeric wire format");
    assert.equal((await fetch(starterBase + bundlePath, { headers: { Origin: starterBase, Cookie: proofCookie } })).status, 503);
    assert.equal((await fresh.query("select data_type from information_schema.columns where table_name='e2ee_signal_prekeys' and column_name='key_id'")).rows[0].data_type, "bigint");
    console.log("Full uint32 prekeys round-trip as numbers; invalid IDs are rejected and unused starter provisioning is paused");
    const historyUrl = `${starterBase}/api/e2ee/key-rotation/history?conversationId=${historyConversation.id}&deviceId=history-device`;
    const historyRequest = (extra = "") => fetch(historyUrl + extra, { headers: { Origin: starterBase, Cookie: proofCookie } });
    const compactHistory = await historyRequest("&compact=1");
    assert.equal(compactHistory.status, 200);
    const compactBody = await compactHistory.json();
    assert.equal(compactBody.history.length, 4, "Repeated exact-device fingerprints compact without dropping unknown legacy copies");
    assert.equal(compactBody.nextCursor, null);
    assert(compactBody.history.some((row: { keyVersion: number }) => row.keyVersion === 410));
    const recoveredIds = new Set<string>(); let cursor: string | null = null;
    do {
      const response = await historyRequest(cursor ? `&cursor=${encodeURIComponent(cursor)}` : "");
      assert.equal(response.status, 200);
      const body = await response.json(); assert(body.history.length <= 200);
      for (const row of body.history) { assert(!recoveredIds.has(row.id)); recoveredIds.add(row.id); }
      cursor = body.nextCursor;
    } while (cursor);
    assert.equal(recoveredIds.size, 413, "Raw fallback preserves every historical key with no pagination gaps");
    assert.equal((await historyRequest("&cursor=invalid")).status, 422);
    assert.equal((await fetch(historyUrl.replace("history-device", "other-device"), { headers: { Origin: starterBase, Cookie: proofCookie } })).status, 403);
    console.log("Key history bounds responses, compacts repeated wraps, preserves legacy keys and all raw fallback pages");
    await fresh.query("update users set email_verified_at=null where id=$1", [proofUser.id]);
    assert.equal((await login(password)).status, 403, "Consumed ownership proof must not replay");
    console.log("Starter Google email proof requires the password, rejects forgery/replay, and does not auto-link accounts");


  } finally {
    for (const child of children.reverse()) {
      if (child.exitCode === null && child.signalCode === null) {
        const stopped = once(child, "exit"); child.kill(); await stopped;
      }
    }
    await Promise.all(pools.map((p) => p.end()));
    await admin.end();
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
