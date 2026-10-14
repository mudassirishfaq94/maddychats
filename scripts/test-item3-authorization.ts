/** Production HTTP authorization checks, restricted to one disposable loopback DB. */
import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import { SignJWT } from "jose";
import { spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { mkdir, writeFile, unlink, readFile, cp } from "node:fs/promises";
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
  let runtimePool: Pool | undefined;
  let runtimeRoleCreated = false;
  let untrustedRoleCreated = false;
  const fileName = `item3-${randomUUID()}.bin`;
  const filePath = resolve(".next/standalone/server/uploads/files", fileName);
  try {
    await admin.query("DROP DATABASE IF EXISTS item3_authorization_test WITH (FORCE)");
    await admin.query("CREATE DATABASE item3_authorization_test");
    await migrate(drizzle(sql), { migrationsFolder: "drizzle" });
    await sql.query(await readFile("docs/database/runtime-role.sql", "utf8"));
    assert.equal((await sql.query("select has_table_privilege('circlo_runtime','admin_audit_log','UPDATE') or has_table_privilege('circlo_runtime','admin_audit_log','DELETE') or has_table_privilege('circlo_runtime','admin_audit_log','TRUNCATE') as mutable")).rows[0].mutable, false, "Runtime cannot rewrite audit history");
    runtimeRoleCreated = true;
    await sql.query("ALTER ROLE circlo_runtime LOGIN PASSWORD 'disposable-item3-runtime-only'");
    const runtimeUrl = new URL(url); runtimeUrl.username = "circlo_runtime"; runtimeUrl.password = "disposable-item3-runtime-only";
    runtimePool = new Pool({ connectionString: runtimeUrl.toString() });
    const capabilities = (await runtimePool.query("select rolsuper,rolcreatedb,rolcreaterole,rolbypassrls from pg_roles where rolname=current_user")).rows[0];
    assert.deepEqual(capabilities, { rolsuper: false, rolcreatedb: false, rolcreaterole: false, rolbypassrls: false });
    await assert.rejects(runtimePool.query("CREATE TABLE public.permission_probe(id int)"), /permission denied/);
    await assert.rejects(runtimePool.query("TRUNCATE users"), /permission denied/);
    await assert.rejects(runtimePool.query("UPDATE admin_audit_log SET action='tamper' WHERE false"), /permission denied/);
    await assert.rejects(runtimePool.query("DELETE FROM admin_audit_log WHERE false"), /permission denied/);
    await assert.rejects(runtimePool.query("TRUNCATE admin_audit_log"), /permission denied/);
    await assert.rejects(runtimePool.query(`SET ROLE "${parsed.username.replace(/"/g, '""')}"`), /permission denied/, "Runtime cannot become the database owner");
    const password = "IsolatedItem3Password9";
    const passwordHash = await hashPassword(password);
    const account = async (name: string) => (await sql.query("insert into users(username,display_name,email,password_hash,email_verified_at) values($1,$1,$2,$3,now()) returning id,username", [name, `${name}@example.invalid`, passwordHash])).rows[0];
    const alice = await account("item3_alice"), bob = await account("item3_bob"), outsider = await account("item3_outsider");
    assert.equal((await runtimePool.query("select count(*)::int n from users")).rows[0].n, 3);
    await sql.query("CREATE ROLE item3_untrusted NOLOGIN; GRANT USAGE ON SCHEMA public TO item3_untrusted; GRANT SELECT ON users TO item3_untrusted");
    untrustedRoleCreated = true;
    const untrusted = await sql.connect();
    try {
      await untrusted.query("BEGIN; SET LOCAL ROLE item3_untrusted");
      assert.equal((await untrusted.query("select count(*)::int n from users")).rows[0].n, 0, "A different role with SELECT remains blocked by RLS");
    } finally { await untrusted.query("ROLLBACK"); untrusted.release(); }
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
    const env = { ...process.env, NODE_ENV: "production" as const, DATABASE_URL: runtimeUrl.toString(), REALTIME_DATABASE_URL: runtimeUrl.toString(), HOSTNAME: "127.0.0.1", PORT: "3109", CLIENT_URL: base,
      JWT_SECRET: "item3-disposable-test-secret-at-least-thirty-two-characters", HEALTHCHECK_SECRET: "item3-health", CRON_SECRET: "item3-cron",
      SUPABASE_URL: "", SUPABASE_SERVICE_ROLE_KEY: "", RESEND_API_KEY: "", VAPID_PRIVATE_KEY: "", FIREBASE_PROJECT_ID: "", FIREBASE_CLIENT_EMAIL: "", FIREBASE_PRIVATE_KEY: "" };
    await cp(resolve(".next/static"), resolve(".next/standalone/.next/static"), { recursive: true });
    await cp(resolve("public"), resolve(".next/standalone/public"), { recursive: true });
    server = spawn(process.execPath, [resolve(".next/standalone/server.js")], { env, stdio: "pipe", windowsHide: true });
    let output = ""; server.stdout?.on("data", (c) => output += c); server.stderr?.on("data", (c) => output += c);
    let ready = false;
    for (let i = 0; i < 100; i++) {
      try { ready = (await fetch(`${base}/api/health`)).status === 204; } catch { /* starting */ }
      if (ready || server.exitCode !== null) break; await sleep(200);
    }
    assert(ready, output);
    assert.equal((await fetch(`${base}/api/ready`, { headers: { authorization: "Bearer item3-health" } })).status, 200, "Limited runtime credentials pass schema and realtime readiness");
    const api = (path: string, cookie = "", method = "GET", body?: unknown, headers: Record<string, string> = {}) => fetch(`${base}${path}`, {
      method, headers: { cookie, origin: base, "content-type": "application/json", ...headers },
      body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(15000),
    });
    for (const acceptance of [{}, { acceptTerms: true }, { acceptPrivacy: true }, { acceptTerms: "true", acceptPrivacy: true }]) {
      const refused = await api("/api/auth/login", "", "POST", { identifier: "consent-negative-fixture", password, ...acceptance });
      assert.equal(refused.status, 422, "Both explicit policy acceptances are required server-side");
      assert.equal(refused.headers.getSetCookie().length, 0, "Missing consent cannot issue a session");
    }
    const login = async (username: string) => {
      const response = await api("/api/auth/login", "", "POST", { acceptTerms: true, acceptPrivacy: true, identifier: username, password });
      assert.equal(response.status, 200);
      const cookie = response.headers.getSetCookie().find((c) => c.startsWith("maddy_session="))?.split(";")[0];
      assert(cookie); return cookie;
    };
    const aliceCookie = await login(alice.username), bobCookie = await login(bob.username), outsiderCookie = await login(outsider.username);
    const verifier = "a".repeat(43);
    const ticket = await new SignJWT({ policyVersion: "2026-10-14", usr: alice.username, codeChallenge: createHash("sha256").update(verifier).digest("base64url") })
      .setProtectedHeader({ alg: "HS256", typ: "JWT" }).setSubject(alice.id).setIssuer("circlo").setAudience("circlo-google-mobile-handoff").setIssuedAt().setExpirationTime("120s")
      .sign(new TextEncoder().encode(env.JWT_SECRET));
    assert.equal((await api("/api/auth/google/native", "", "POST", { acceptTerms: true, acceptPrivacy: true, ticket, verifier: "b".repeat(43) })).status, 401);
    assert.equal((await api("/api/auth/google/native", "", "POST", { acceptTerms: true, acceptPrivacy: true, ticket, verifier })).status, 200);
    assert.equal((await api("/api/auth/google/native", "", "POST", { acceptTerms: true, acceptPrivacy: true, ticket, verifier })).status, 409, "Google mobile handoff can establish authentication only once");
    const pushToken = "disposable-native-push-device-token-no-real-delivery";
    assert.equal((await api("/api/push/register", aliceCookie, "POST", { token: pushToken })).status, 200);
    assert.equal((await api("/api/push/register", bobCookie, "POST", { token: pushToken })).status, 200);
    assert.equal((await sql.query("select user_id from fcm_tokens where token=$1", [pushToken])).rows[0].user_id, bob.id, "A shared device switching accounts must not retain the previous user's notification routing");
    assert.equal((await api("/api/push/register", bobCookie, "DELETE", undefined, { origin: "https://attacker.example.invalid" })).status, 403);
    assert.equal((await api("/api/push/register", aliceCookie, "DELETE")).status, 200);
    assert.equal((await sql.query("select count(*)::int n from fcm_tokens where token=$1", [pushToken])).rows[0].n, 1, "Previous account cannot unregister the new account's token");
    assert.equal((await api("/api/push/register", bobCookie, "DELETE")).status, 200);
    const privateCommunityResponse = await api("/api/communities", aliceCookie, "POST", { name: "Private audit fixture", isPublic: false });
    assert.equal(privateCommunityResponse.status, 201);
    const privateCommunity = (await privateCommunityResponse.json()).community;
    assert.equal((await api(`/api/communities/${privateCommunity.id}`, outsiderCookie)).status, 404);
    assert.equal((await api(`/api/communities/${privateCommunity.id}`, outsiderCookie, "POST", { action: "join" })).status, 400);
    assert.equal((await api(`/api/communities/${privateCommunity.id}`, outsiderCookie, "POST", { action: "create_channel", name: "Forbidden" })).status, 404, "Private communities conceal their existence from outsiders");
    const creationKey = `community-create:${alice.id}`, mutationKey = `community-mutation:${alice.id}`;
    await sql.query("insert into rate_limit_buckets(key,window_started_at,count) values($1,now(),20),($2,now(),60) on conflict(key) do update set count=excluded.count,window_started_at=excluded.window_started_at", [creationKey, mutationKey]);
    const limitedCommunity = await api("/api/communities", aliceCookie, "POST", { name: "Must not create" });
    assert.equal(limitedCommunity.status, 429); assert(Number(limitedCommunity.headers.get("retry-after")) > 0);
    assert.equal((await api(`/api/communities/${privateCommunity.id}`, aliceCookie, "POST", { action: "create_channel", name: "Must not create" })).status, 429);
    assert.equal((await sql.query("select count(*)::int n from communities where name='Must not create'")).rows[0].n, 0);
    await sql.query("delete from rate_limit_buckets where key in ($1,$2)", [creationKey, mutationKey]);
    const historyPath = `/api/conversations/${conversation.id}/messages`;
    assert.equal((await api("/api/reports", outsiderCookie, "POST", { type: "message", reason: "spam", targetMessageId: message.id })).status, 404, "Only visible messages can be reported");
    assert.equal((await api("/api/reports", bobCookie, "POST", { type: "message", reason: "invalid-reason", targetMessageId: message.id })).status, 422);
    const reportResponse = await api("/api/reports", bobCookie, "POST", { type: "message", reason: "spam", targetMessageId: message.id, targetUserId: outsider.id });
    assert.equal(reportResponse.status, 201);
    assert.equal((await reportResponse.json()).targetUserId, alice.id, "Message reports derive the sender instead of accepting a forged accusation target");
    const revokedConversation = (await sql.query("insert into conversations(type,name,created_by_id) values('group','Revoked edit fixture',$1) returning id", [alice.id])).rows[0];
    await sql.query("insert into conversation_members(conversation_id,user_id,role) values($1,$2,'owner')", [revokedConversation.id, alice.id]);
    const revokedMessage = (await sql.query("insert into messages(conversation_id,sender_id,text) values($1,$2,'unchanged-after-removal') returning id", [revokedConversation.id, bob.id])).rows[0];
    assert.equal((await api(`/api/messages/${revokedMessage.id}`, bobCookie, "PATCH", { text: "unauthorized-edit", encrypted: true })).status, 404);
    assert.equal((await sql.query("select text from messages where id=$1", [revokedMessage.id])).rows[0].text, "unchanged-after-removal", "A removed sender cannot mutate a message before the endpoint rejects membership");
    assert.equal((await api(`/api/messages/${revokedMessage.id}`, bobCookie, "DELETE", { mode: "for_everyone" })).status, 404);
    assert.equal((await sql.query("select deleted_at from messages where id=$1", [revokedMessage.id])).rows[0].deleted_at, null, "Removed senders cannot delete conversation messages for everyone");
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
    assert.equal(media.headers.get("cache-control"), "private, no-store", "Private media must reauthorize every request");
    assert.equal(media.status, 200); assert.equal(await media.text(), "isolated-private-attachment");
    assert.equal((await api(historyPath, aliceCookie, "POST", { text: "ciphertext", encrypted: true }, { origin: "https://evil.example" })).status, 403);
    const adminPage = await api("/app/admin", bobCookie);
    const adminHtml = await adminPage.text();
    assert(!adminHtml.includes("Admin Dashboard v1.0"), "Regular users never receive the admin shell");
    assert.equal((await api("/api/admin/stats", bobCookie)).status, 403);
    await sql.query("update users set role='moderator' where id=$1", [bob.id]);
    assert(!(await (await api("/app/admin", bobCookie)).text()).includes("Admin Dashboard v1.0"), "Moderators without enrolled MFA do not receive the admin shell");
    assert.equal((await api("/api/admin/stats", bobCookie)).status, 403, "Moderators must enroll MFA before administrative reads");
    await sql.query("update users set role='user' where id=$1", [bob.id]);
    assert.equal((await api("/api/admin/stats", bobCookie)).status, 403, "Role changes are checked freshly");
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
    const passwordUser = await account("item3_password_ui");
    await sql.query("insert into oauth_accounts(user_id,provider,provider_account_id) values($1,'google','disposable-password-ui-google')", [passwordUser.id]);
    const passwordCookie = await login(passwordUser.username);
    const changeBody = { currentPassword: password, password: "ChangedPassword92", confirmPassword: "ChangedPassword92" };
    assert.equal((await api("/api/auth/change-password", "", "POST", changeBody)).status, 401);
    assert.equal((await api("/api/auth/change-password", passwordCookie, "POST", changeBody, { origin: "https://attacker.example.invalid" })).status, 403);
    const { chromium } = await import("playwright");
    const passwordBrowser = await chromium.launch();
    try {
      const context = await passwordBrowser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: "block" });
      const [cookieName, cookieValue] = passwordCookie.split("=");
      await context.addCookies([{ name: cookieName, value: cookieValue, url: base, httpOnly: true, sameSite: "Lax" }]);
      const page = await context.newPage();
      await page.goto(base + "/app/profile#account-security");
      await page.getByRole("button", { name: "Email me a password setup link", exact: true }).waitFor();
      let resetRequested = false;
      await page.route("**/api/auth/forgot-password", async route => {
        assert.equal(route.request().postDataJSON().email, passwordUser.username + "@example.invalid");
        resetRequested = true; await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) });
      });
      await page.getByRole("button", { name: "Email me a password setup link", exact: true }).click();
      await page.getByRole("status").filter({ hasText: "reset email has been requested" }).waitFor();
      assert(resetRequested); await page.unroute("**/api/auth/forgot-password");
      await page.getByLabel("Current Circlo password", { exact: true }).fill("WrongPassword91");
      await page.getByLabel("New password", { exact: true }).fill("ChangedPassword92");
      await page.getByLabel("Confirm new password", { exact: true }).fill("ChangedPassword92");
      await page.getByRole("button", { name: "Change password", exact: true }).click();
      await page.getByRole("status").filter({ hasText: "current password is incorrect" }).waitFor();
      assert.equal((await sql.query("select password_hash from users where id=$1", [passwordUser.id])).rows[0].password_hash, passwordHash);
      await page.getByLabel("Current Circlo password", { exact: true }).fill(password);
      await page.getByRole("button", { name: "Change password", exact: true }).click();
      await page.waitForURL("**/login?passwordChanged=1");
      await page.getByRole("status").filter({ hasText: "Password updated" }).waitFor();
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    } finally { await passwordBrowser.close(); }
    assert.equal((await api("/api/auth/me", passwordCookie)).status, 401, "Password changes revoke the old session");
    assert.equal((await api("/api/auth/login", "", "POST", { acceptTerms: true, acceptPrivacy: true, identifier: passwordUser.username, password })).status, 401);
    const newLogin = await api("/api/auth/login", "", "POST", { acceptTerms: true, acceptPrivacy: true, identifier: passwordUser.username, password: "ChangedPassword92" });
    assert.equal(newLogin.status, 200);
    const newCookie = newLogin.headers.getSetCookie().find(c => c.startsWith("maddy_session="))!.split(";")[0];
    const recoveryCode = "b".repeat(32);
    await sql.query("insert into user_2fa(user_id,secret,enabled,recovery_code_hashes) values($1,'JBSWY3DPEHPK3PXP',true,$2)", [passwordUser.id, JSON.stringify([createHash("sha256").update(recoveryCode).digest("hex")])]);
    const mfaChange = { currentPassword: "ChangedPassword92", password: "MfaProtectedPassword93", confirmPassword: "MfaProtectedPassword93", mfaCode: "invalid" };
    assert.equal((await api("/api/auth/change-password", newCookie, "POST", mfaChange)).status, 401, "Enabling MFA rejects the previous unverified session");
    const challengeLogin = await api("/api/auth/login", "", "POST", { acceptTerms: true, acceptPrivacy: true, identifier: passwordUser.username, password: "ChangedPassword92" });
    const challengeCookie = challengeLogin.headers.getSetCookie().find(c => c.startsWith("maddy_mfa_challenge="))!.split(";")[0];
    process.env.DATABASE_URL = url;
    const { generateTOTP } = await import("../src/server/two-factor");
    const mfaLogin = await api("/api/auth/mfa", challengeCookie, "POST", { code: generateTOTP("JBSWY3DPEHPK3PXP", Math.floor(Date.now() / 30000)) });
    assert.equal(mfaLogin.status, 200);
    const mfaCookie = mfaLogin.headers.getSetCookie().find(c => c.startsWith("maddy_session="))!.split(";")[0];
    assert.equal((await api("/api/auth/change-password", mfaCookie, "POST", mfaChange)).status, 403, "Correct current password does not bypass enabled MFA");
    assert.equal((await api("/api/auth/change-password", mfaCookie, "POST", { ...mfaChange, mfaCode: recoveryCode })).status, 200);
    console.log("PASS mobile profile password UI: Google setup option, wrong-password rejection without mutation, successful change, old-session revocation, new-password login, CSRF and MFA enforcement.");
    console.log("Authorization checks passed: membership, CSRF, blocking, group roles, cursor boundaries, private media, deletion, and session revocation");
  } finally {
    if (server && server.exitCode === null && server.signalCode === null) {
      const stopped = once(server, "exit"); server.kill(); await stopped;
    }
    await unlink(filePath).catch(() => undefined);
    await runtimePool?.end();
    if (untrustedRoleCreated) await sql.query("DROP OWNED BY item3_untrusted; DROP ROLE item3_untrusted");
    if (runtimeRoleCreated) await sql.query("DROP OWNED BY circlo_runtime; DROP ROLE circlo_runtime");
    await sql.end(); await admin.end();
  }
}
main().catch((error: unknown) => { console.error(error); process.exitCode = 1; });
