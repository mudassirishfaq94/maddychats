import { testMobileLayout } from "./test-mobile-layout.mjs";
import { testDeviceAccess } from "./test-device-access.mjs";
import { testAudioContacts } from "./test-audio-contacts.mjs";
import { testChatOpeningFixture } from "./test-chat-opening.mjs";
import { testDeviceRecoveryUI } from "./test-device-recovery-ui.mjs";
import { testEncryptionDevices } from "./test-encryption-devices.mjs";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { resolve } from "node:path";
import { cp, mkdir, unlink } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import bcrypt from "bcryptjs";
import webPush from "web-push";
import { testRestoredWorkflows } from "./test-restored-workflows.mjs";
import { testPwaNotifications } from "./test-pwa-notifications.mjs";

async function main() {
  const url = process.env.ITEM456_TEST_DATABASE_URL;
  assert(url, "Set ITEM456_TEST_DATABASE_URL to the disposable loopback database");
  const parsed = new URL(url); assert(["127.0.0.1", "localhost"].includes(parsed.hostname) && parsed.pathname === "/items456_quality_test");
  const adminUrl = new URL(url); adminUrl.pathname = "/postgres";
  const admin = new Pool({ connectionString: adminUrl.toString() });
  parsed.pathname = "/restored_workflows_test";
  const database = parsed.toString();
  if (!(await admin.query("select 1 from pg_database where datname='restored_workflows_test'")).rowCount) await admin.query('create database "restored_workflows_test"');
  await admin.end();
  const pool = new Pool({ connectionString: database }); const accounts: { id: string; username: string }[] = [];
  let conversation: string | undefined; let server: ReturnType<typeof spawn> | undefined;
  const base = "http://127.0.0.1:3120";
  const testSecret = "disposable-restored-workflows-only-secret-at-least-thirty-two";
  const pushKeys = webPush.generateVAPIDKeys();
  try {
    // This dedicated, verified loopback database prevents test users and limits leaking between runs.
    await mkdir(".freebuff/performance", { recursive: true });
    await pool.query("drop schema if exists drizzle cascade; drop schema public cascade; create schema public;");
    await migrate(drizzle(pool), { migrationsFolder: "drizzle" });
    await cp(resolve(".next/static"), resolve(".next/standalone/.next/static"), { recursive: true });
    await mkdir(resolve(".next/standalone/scripts"), { recursive: true });
    await cp(resolve("scripts/reconstruct-status-photo.mjs"), resolve(".next/standalone/scripts/reconstruct-status-photo.mjs"));
    await cp(resolve("public"), resolve(".next/standalone/public"), { recursive: true });
    const password = "Aa1" + randomBytes(20).toString("base64url"), hash = await bcrypt.hash(password, 12), tag = randomBytes(6).toString("hex");
    for (const suffix of ["a", "b"]) accounts.push((await pool.query("insert into users(username,display_name,email,password_hash,email_verified_at) values($1,$1,$2,$3,now()) returning id,username", [`restored_${tag}${suffix}`, `restored_${tag}${suffix}@example.invalid`, hash])).rows[0]);
    conversation = (await pool.query("insert into conversations(type,created_by_id) values('dm',$1) returning id", [accounts[0].id])).rows[0].id;
    await pool.query("insert into conversation_members(conversation_id,user_id,accepted_at) values($1,$2,now()),($1,$3,now())", [conversation, accounts[0].id, accounts[1].id]);
    server = spawn(process.execPath, [resolve(".next/standalone/server.js")], { windowsHide: true, stdio: "pipe", env: { ...process.env, DATABASE_URL: database, REALTIME_DATABASE_URL: database, PORT: "3120", HOSTNAME: "127.0.0.1", CLIENT_URL: base, JWT_SECRET: testSecret, STARTER_MODE: "1", CHAT_MEDIA_ENABLED: "1", SCHEDULED_MESSAGES_ENABLED: "1", SUPABASE_URL: "", SUPABASE_SERVICE_ROLE_KEY: "", RESEND_API_KEY: "", EMAIL_FROM: "", EMAIL_FROM_ADDRESS: "", CSP_ENFORCE: "1", VAPID_PUBLIC_KEY: pushKeys.publicKey, VAPID_PRIVATE_KEY: pushKeys.privateKey, VAPID_SUBJECT: "mailto:test@example.invalid" } });
    let output = ""; server.stdout?.on("data", d => output += d); server.stderr?.on("data", d => output += d);
    for (let i = 0; i < 100; i++) { try { if ((await fetch(base + "/api/health")).status === 204) break; } catch {} await new Promise(r => setTimeout(r, 200)); }
    if(process.env.APP_VERSION) {
      const version=await fetch(base+"/api/app-version").then(response=>response.json());
      assert.equal(version.version,process.env.APP_VERSION,"The packaged workflow must run the intended compiled release");
    }
    const robots = await fetch(base + "/robots.txt");
    assert.equal(robots.status, 200);
    assert((await robots.text()).includes("Sitemap: https://circlo.chat/sitemap.xml"));
    const sitemap = await fetch(base + "/sitemap.xml");
    assert.equal(sitemap.status, 200);
    const xml = await sitemap.text();
    assert.deepEqual(
      Array.from(xml.matchAll(/<loc>(.*?)<\/loc>/g), match => match[1]).sort(),
      ["/", "/privacy", "/terms", "/whatsapp-alternative", "/support", "/delete-account"]
        .map(path => `https://circlo.chat${path}`).sort(),
    );
    assert(!xml.includes("/app") && !xml.includes("/login"));
    try {
      if (process.env.AUTH_RETENTION_ONLY === "1") {
        const child = spawn(process.execPath, [resolve("node_modules/tsx/dist/cli.mjs"), resolve("scripts/test-auth-retention.ts")], { windowsHide: true, stdio: "inherit", env: { ...process.env, DATABASE_URL: database } });
        const [code] = await once(child, "exit"); assert.equal(code, 0, "Real sign-in retention regression");
      } else if (process.env.DEVICE_ACCESS_ONLY === "1") {
        await testDeviceAccess(base, pool, testSecret);
      } else if (process.env.AUDIO_ONLY === "1") {
        await testAudioContacts(base, pool, accounts[0], accounts[1], password, conversation!);
      } else if (process.env.DM_ROTATION_ONLY === "1" || process.env.DOCUMENT_FILES_ONLY === "1" || process.env.DISAPPEARING_MEDIA_ONLY === "1" || process.env.CHAT_RACE_ONLY === "1" || process.env.BACKUP_ONLY === "1" || process.env.STATUS_VIDEO_ONLY === "1" || process.env.CHAT_HANDOFF_ONLY === "1" || process.env.CHAT_SCROLL_ONLY === "1") {
        await testChatOpeningFixture(base, pool, accounts[0], accounts[1], password, conversation!);
      } else if (process.env.MOBILE_NAV_ONLY === "1") {
        console.log(await testMobileLayout(base, pool, { navigationOnly: true }));
      } else if (process.env.PWA_ONLY === "1") {
        console.log(await testPwaNotifications(base, pool));
      } else if (process.env.DEVICE_RECOVERY_ONLY === "1") {
        console.log(await testEncryptionDevices(base, pool, accounts[0], accounts[1], password, conversation!, testSecret));
      } else if (process.env.PROFILE_ONLY === "1") {
        await testDeviceAccess(base, pool, testSecret);
        await testDeviceRecoveryUI(base, pool);
      } else {
        if (process.env.GROUP_ONLY !== "1") await testAudioContacts(base, pool, accounts[0], accounts[1], password, conversation!);
        if (process.env.GROUP_ONLY !== "1") await testPwaNotifications(base, pool);
        if (process.env.GROUP_ONLY !== "1") await testDeviceRecoveryUI(base, pool);
        if (process.env.GROUP_ONLY !== "1") await testDeviceAccess(base, pool, testSecret);
        console.log(await testRestoredWorkflows(base, pool, accounts[0], accounts[1], password, conversation!, false, testSecret));
        if (process.env.GROUP_ONLY !== "1") console.log(await testMobileLayout(base, pool));
      }
    }
    catch (error) { console.error(output.slice(-5000)); throw error; }
  } finally {
    if (server && server.exitCode === null) { const exited = once(server, "exit"); server.kill(); await exited; }
    if (conversation) {
      const files = await pool.query("select a.path from message_attachments a join messages m on m.id=a.message_id where m.conversation_id=$1", [conversation]);
      for (const file of files.rows) { const target = resolve(".next/standalone/server/uploads", file.path); assert(target.startsWith(resolve(".next/standalone/server/uploads") + "/") || target.startsWith(resolve(".next/standalone/server/uploads") + "\\")); await unlink(target).catch(() => undefined); }
      await pool.query("delete from conversations where id=$1 and created_by_id=$2", [conversation, accounts[0]?.id]);
    }
    for (const account of accounts) await pool.query("delete from users where id=$1 and username=$2 and username like 'restored_%'", [account.id, account.username]);
    await pool.end();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
