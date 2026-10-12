/** Production HTTP authorization checks, restricted to one disposable loopback DB. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { mkdir, writeFile, unlink } from "node:fs/promises";
import { resolve, join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { hashPassword } from "../src/server/password";

async function main() {
  const url = process.env.ITEM3_TEST_DATABASE_URL;
  assert(url, "Set ITEM3_TEST_DATABASE_URL to loopback /item3_authorization_test");
  const parsed = new URL(url);
  assert(["localhost", "127.0.0.1"].includes(parsed.hostname) && parsed.pathname === "/item3_authorization_test", "Refusing a non-test database");
  const adminUrl = new URL(url); adminUrl.pathname = "/postgres";
  const admin = new Pool({ connectionString: adminUrl.toString() });
  const sql = new Pool({ connectionString: url });
  let server: ChildProcess | undefined;
  const fileName = `item3-${randomUUID()}.bin`;
  const filePath = resolve(".next/standalone/server/uploads/files", fileName);
  try {
    await admin.query("DROP DATABASE IF EXISTS item3_authorization_test WITH (FORCE)");
    await admin.query("CREATE DATABASE item3_authorization_test");
    await migrate(drizzle(sql), { migrationsFolder: "drizzle" });
    const password = "IsolatedItem3Password9";
    const passwordHash = await hashPassword(password);
    const account = async (name: string) => (await sql.query("insert into users(username,display_name,email,password_hash,email_verified_at) values($1,$1,$2,$3,now()) returning id,username", [name, `${name}@example.invalid`, passwordHash])).rows[0];
    const alice = await account("item3_alice"), bob = await account("item3_bob"), outsider = await account("item3_outsider");
    const conversation = (await sql.query("insert into conversations(type,created_by_id) values('dm',$1) returning id", [alice.id])).rows[0];
    await sql.query("insert into conversation_members(conversation_id,user_id,accepted_at) values($1,$2,now()),($1,$3,now())", [conversation.id, alice.id, bob.id]);
    await sql.query("insert into messages(conversation_id,sender_id,text,created_at) select $1,$2,'history-'||n,now()-n*interval '1 minute' from generate_series(1,75) n", [conversation.id, alice.id]);
    const message = (await sql.query("select id from messages order by created_at desc limit 1")).rows[0];
    await mkdir(resolve(".next/standalone/server/uploads/files"), { recursive: true });
    await writeFile(filePath, "isolated-private-attachment");
    const attachment = (await sql.query("insert into message_attachments(message_id,original_name,stored_name,mime_type,size,path,kind) values($1,'private.bin',$2,'application/octet-stream',27,$3,'file') returning id", [message.id, fileName, `files/${fileName}`])).rows[0];
    const group = (await sql.query("insert into conversations(type,name,created_by_id,admin_only_messaging) values('group','Quality test',$1,true) returning id", [alice.id])).rows[0];
    await sql.query("insert into conversation_members(conversation_id,user_id,role) values($1,$2,'owner'),($1,$3,'member')", [group.id, alice.id, bob.id]);

    const base = "http://127.0.0.1:3109";
    const env = { ...process.env, NODE_ENV: "production" as const, DATABASE_URL: url, HOSTNAME: "127.0.0.1", PORT: "3109", CLIENT_URL: base,
      JWT_SECRET: "item3-disposable-test-secret-at-least-thirty-two-characters", HEALTHCHECK_SECRET: "item3-health", CRON_SECRET: "item3-cron",
      SUPABASE_URL: "", SUPABASE_SERVICE_ROLE_KEY: "", RESEND_API_KEY: "", VAPID_PRIVATE_KEY: "", FIREBASE_PROJECT_ID: "", FIREBASE_CLIENT_EMAIL: "", FIREBASE_PRIVATE_KEY: "" };
    server = spawn(process.execPath, [resolve(".next/standalone/server.js")], { env, stdio: "pipe", windowsHide: true });
    let output = ""; server.stdout?.on("data", (c) => output += c); server.stderr?.on("data", (c) => output += c);
    let ready = false;
    for (let i = 0; i < 100; i++) {
      try { ready = (await fetch(`${base}/api/health`)).status === 204; } catch { /* starting */ }
      if (ready || server.exitCode !== null) break; await sleep(200);
    }
    assert(ready, output);
    const api = (path: string, cookie = "", method = "GET", body?: unknown, headers: Record<string, string> = {}) => fetch(`${base}${path}`, {
      method, headers: { cookie, origin: base, "content-type": "application/json", ...headers },
      body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(15000),
    });
    const login = async (username: string) => {
      const response = await api("/api/auth/login", "", "POST", { identifier: username, password });
      assert.equal(response.status, 200);
      const cookie = response.headers.getSetCookie().find((c) => c.startsWith("maddy_session="))?.split(";")[0];
      assert(cookie); return cookie;
    };
    const aliceCookie = await login(alice.username), bobCookie = await login(bob.username), outsiderCookie = await login(outsider.username);
    const historyPath = `/api/conversations/${conversation.id}/messages`;
    assert.equal((await api(historyPath)).status, 401);
    assert.equal((await api(historyPath, outsiderCookie)).status, 404);
    assert.equal((await api(`/api/conversations/${conversation.id}`, outsiderCookie)).status, 404);
    const first = await (await api(`${historyPath}?limit=99999`, aliceCookie)).json();
    assert.equal(first.messages.length, 50, "History is bounded even when an excessive limit is supplied");
    assert(first.nextCursor);
    const second = await (await api(`${historyPath}?limit=50&cursor=${encodeURIComponent(first.nextCursor)}`, aliceCookie)).json();
    assert.equal(second.messages.length, 25);
    assert.equal(new Set([...first.messages, ...second.messages].map((m: { id: string }) => m.id)).size, 75, "Cursor pages cannot duplicate or omit messages");

    assert.equal((await api(`/api/media/${attachment.id}`)).status, 401);
    assert.equal((await api(`/api/media/${attachment.id}`, outsiderCookie)).status, 404);
    const media = await api(`/api/media/${attachment.id}`, bobCookie);
    assert.equal(media.status, 200); assert(media.headers.get("cache-control")?.includes("no-store")); assert.equal(await media.text(), "isolated-private-attachment");
    assert.equal((await api(historyPath, aliceCookie, "POST", { text: "ciphertext", encrypted: true }, { origin: "https://evil.example" })).status, 403);
    assert.equal((await api(`/api/conversations/${conversation.id}`, aliceCookie, "DELETE", undefined, { "sec-fetch-site": "cross-site" })).status, 403);
    assert.equal((await sql.query("select count(*)::int as count from conversations where id=$1", [conversation.id])).rows[0].count, 1);
    assert.equal((await api(historyPath, outsiderCookie, "POST", { text: "ciphertext", encrypted: true })).status, 404);
    await sql.query("insert into blocks(blocker_id,blocked_id) values($1,$2)", [bob.id, alice.id]);
    assert.equal((await api(historyPath, aliceCookie, "POST", { text: "ciphertext", encrypted: true })).status, 403);
    await sql.query("delete from blocks where blocker_id=$1", [bob.id]);
    assert.equal((await api(`/api/conversations/${group.id}/messages`, bobCookie, "POST", { text: "ciphertext", encrypted: true })).status, 403);
    assert.equal((await api(`/api/groups/${group.id}/members`, bobCookie, "POST", { userId: outsider.id })).status, 403);
    assert.equal((await api(`/api/conversations/${group.id}`, bobCookie, "DELETE")).status, 403);
    assert.equal((await api(`/api/groups/${group.id}/members`, aliceCookie, "POST", { userId: outsider.id })).status, 200);

    assert.equal((await api(`/api/messages/${message.id}`, bobCookie, "DELETE", { mode: "for_everyone" })).status, 403);
    assert.equal((await api(`/api/messages/${message.id}`, outsiderCookie, "DELETE", { mode: "for_me" })).status, 404);
    assert.equal((await api(`/api/messages/${message.id}`, bobCookie, "DELETE", { mode: "for_me" })).status, 200);
    const retries = await Promise.all([1, 2].map(() => api(`/api/messages/${message.id}`, bobCookie, "DELETE", { mode: "for_me" })));
    assert.deepEqual(retries.map((response) => response.status), [200, 200], "Concurrent delete-for-me retries are idempotent");
    assert.equal((await sql.query("select count(*)::int as count from message_deletions where message_id=$1 and user_id=$2", [message.id, bob.id])).rows[0].count, 1);
    assert.equal((await api(`/api/media/${attachment.id}`, bobCookie)).status, 404);
    assert.equal((await api(`/api/media/${attachment.id}`, aliceCookie)).status, 200);
    assert.equal((await api(`/api/messages/${message.id}`, aliceCookie, "DELETE", { mode: "for_everyone" })).status, 200);
    assert.equal((await api(`/api/media/${attachment.id}`, aliceCookie)).status, 404);
    assert((await sql.query("select deleted_at from messages where id=$1", [message.id])).rows[0].deleted_at);
    await sql.query("update users set token_invalid_before_at=now()+interval '1 second' where id=$1", [bob.id]);
    assert.equal((await api(historyPath, bobCookie)).status, 401);
    console.log("Authorization checks passed: membership, CSRF, blocking, group roles, cursor boundaries, private media, deletion, and session revocation");
  } finally {
    if (server && server.exitCode === null && server.signalCode === null) {
      const stopped = once(server, "exit"); server.kill(); await stopped;
    }
    await unlink(filePath).catch(() => undefined);
    await sql.end(); await admin.end();
  }
}
main().catch((error: unknown) => { console.error(error); process.exitCode = 1; });
