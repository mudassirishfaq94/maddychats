import { fixtureAppSession } from "./fixture-app-session.mjs";
import { testAuthFields } from "./test-auth-fields.mjs";
import { testPublicPages } from "./test-public-pages.mjs";
/** Production HTTP authorization checks, restricted to one disposable loopback DB. */
import assert from "node:assert/strict";
import { randomUUID, randomBytes, createHash, generateKeyPairSync } from "node:crypto";
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
import { testPlayCompliance } from "./test-play-compliance.mjs";

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
    const reader=await sql.connect();
    const writer=await sql.connect();
    try {
      await reader.query("BEGIN");await reader.query("SELECT id FROM users LIMIT 1");
      await writer.query("BEGIN");await writer.query("SET LOCAL lock_timeout='300ms'");
      await writer.query(await readFile("docs/database/runtime-role.sql","utf8"));
      await writer.query("COMMIT");
    } finally {await writer.query("ROLLBACK");writer.release();await reader.query("ROLLBACK");reader.release();}
    const policyClient=await sql.connect();
    await policyClient.query("BEGIN");
    try {
      await policyClient.query("ALTER POLICY circlo_runtime_server_access ON users USING(false)");
      await assert.rejects(policyClient.query(await readFile("docs/database/runtime-role.sql","utf8")),/Unexpected runtime policy/);
    } finally {await policyClient.query("ROLLBACK");policyClient.release();}
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
    const googlePair = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const googlePublic = { ...googlePair.publicKey.export({ format: "jwk" }), kid: "disposable-google-jwk", alg: "RS256", use: "sig" };
    const env = { ...process.env, NODE_ENV: "production" as const, DATABASE_URL: runtimeUrl.toString(), REALTIME_DATABASE_URL: runtimeUrl.toString(), HOSTNAME: "127.0.0.1", PORT: "3109", CLIENT_URL: base,
      TEST_GOOGLE_PRIVATE_KEY: googlePair.privateKey.export({ type: "pkcs8", format: "pem" }).toString(), TEST_GOOGLE_PUBLIC_JWK: JSON.stringify(googlePublic), JWT_SECRET: randomBytes(32).toString("hex"), GOOGLE_CLIENT_ID: "disposable-google-client", GOOGLE_CLIENT_SECRET: "disposable-google-secret", CLIENT_IP_TRUSTED_HOPS: "1", HEALTHCHECK_SECRET: "item3-health", CRON_SECRET: "item3-cron",
      SUPABASE_URL: "", SUPABASE_SERVICE_ROLE_KEY: "", RESEND_API_KEY: "", VAPID_PRIVATE_KEY: "", FIREBASE_PROJECT_ID: "", FIREBASE_CLIENT_EMAIL: "", FIREBASE_PRIVATE_KEY: "", TWA_DAL_ENABLED: "0" };
    await cp(resolve(".next/static"), resolve(".next/standalone/.next/static"), { recursive: true });
    await cp(resolve("public"), resolve(".next/standalone/public"), { recursive: true });
    server = spawn(process.execPath, ["--require", resolve("scripts/mock-google-provider.cjs"), resolve(".next/standalone/server.js")], { env, stdio: "pipe", windowsHide: true });
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
    await testPublicPages(base);
    const dal = await api("/.well-known/assetlinks.json", "maddy_session=invalid; maddy_refresh=invalid");
    assert.equal(dal.status, 503, "Public DAL fails closed when not configured, without redirecting an expired-cookie visitor to login");
    assert.match(dal.headers.get("content-type")!, /application\/json/);
    await testAuthFields(base, sql, alice.username, password);
    const login = async (username: string) => {
      const response = await api("/api/auth/login", "", "POST", { acceptTerms: true, acceptPrivacy: true, identifier: username, password });
      assert.equal(response.status, 200);
      const cookie = response.headers.getSetCookie().find((c) => c.startsWith("maddy_session="))?.split(";")[0];
      assert(cookie); await fixtureAppSession(sql,response); return cookie;
    };
    const aliceCookie = await login(alice.username), bobCookie = await login(bob.username), outsiderCookie = await login(outsider.username);
    const googleStart = "/api/auth/google?mode=link&next=/app/profile";
    const startLink = await fetch(base + googleStart, { headers: { Cookie: aliceCookie, Origin: base }, redirect: "manual" });
    assert.equal(startLink.status, 307);
    const googleState = new URL(startLink.headers.get("location")!).searchParams.get("state");
    assert(googleState);
    const oauthCookies = startLink.headers.getSetCookie().map(cookie => cookie.split(";")[0]).join("; ");
    assert(oauthCookies.includes("google_oauth_link="));
    const switchedCallback = await fetch(base + "/api/auth/google/callback?code=disposable-never-exchanged&state=" + googleState, {
      headers: { Cookie: bobCookie + "; " + oauthCookies }, redirect: "manual",
    });
    assert.equal(switchedCallback.status, 307);
    assert.match(switchedCallback.headers.get("location")!, /auth_error=google_link_expired/, "An account switch rejects linking before contacting Google");
    assert.equal((await sql.query("select count(*)::int n from oauth_accounts")).rows[0].n, 0);
    const callbackWithoutBinding = await fetch(base + "/api/auth/google/callback?code=disposable-never-exchanged&state=" + googleState, {
      headers: { Cookie: aliceCookie + "; " + oauthCookies.split("; ").filter(cookie => !cookie.startsWith("google_oauth_link=")).join("; ") }, redirect: "manual",
    });
    assert.match(callbackWithoutBinding.headers.get("location")!, /auth_error=google_link_expired/);
    const crossSiteStart = await fetch(base + googleStart, { headers: { Cookie: aliceCookie, "sec-fetch-site": "cross-site" }, redirect: "manual" });
    assert.equal(crossSiteStart.status, 403);
    process.env.JWT_SECRET = env.JWT_SECRET;
    const { signSessionToken } = await import("../src/server/jwt");
    const sid = JSON.parse(Buffer.from(aliceCookie.split("=")[1].split(".")[1], "base64url").toString()).sid;
    const oldCookie = "maddy_session=" + await signSessionToken(alice.id, alice.username, Date.now() - 360000, 0, sid);
    const staleStart = await fetch(base + googleStart, { headers: { Cookie: oldCookie, Origin: base }, redirect: "manual" });
    assert.match(staleStart.headers.get("location")!, /reauth=1/);
    for (const [stage, ip] of [["start", "198.18.7.55"], ["callback", "198.18.7.56"]]) {
      await sql.query("insert into rate_limit_buckets(key,window_started_at,count) values($1,now(),25) on conflict(key) do update set count=25,window_started_at=now()", [`google-${stage}:${ip}`]);
      const oauthUrl: string = stage === "start" ? googleStart : "/api/auth/google/callback?code=disposable-never-exchanged&state=" + googleState;
      const denied: Response = await fetch(base + oauthUrl, { headers: { Cookie: aliceCookie + "; " + oauthCookies, Origin: base, "x-forwarded-for": ip }, redirect: "manual" });
      assert.equal(denied.status, 429); assert(denied.headers.get("Retry-After"));
      assert(!denied.headers.getSetCookie().some(cookie => /^maddy_(session|refresh)=/.test(cookie)));
    }
    const oauthRoundTrip = async (mode: string, kind = "valid") => {
      const start = await fetch(base + "/api/auth/google?terms=1&privacy=1" + mode, { headers: { Cookie: mode ? aliceCookie : "", Origin: base }, redirect: "manual" });
      assert.equal(start.status, 307);
      const cookies = start.headers.getSetCookie().map(cookie => cookie.split(";")[0]);
      const nonce = cookies.find(cookie => cookie.startsWith("google_oauth_nonce="))!.split("=")[1];
      const state = new URL(start.headers.get("location")!).searchParams.get("state");
      return fetch(base + "/api/auth/google/callback?code=" + encodeURIComponent(`fixture-${kind}:${nonce}`) + "&state=" + state, {
        headers: { Cookie: (mode ? aliceCookie + "; " : "") + cookies.join("; "), "sec-fetch-site": "cross-site" }, redirect: "manual",
      });
    };
    for (const kind of ["wrong-nonce", "wrong-audience"]) {
      const denied = await oauthRoundTrip("&mode=link", kind);
      assert.match(denied.headers.get("location")!, /error=google_/);
      assert.equal((await sql.query("select count(*)::int n from oauth_accounts")).rows[0].n, 0);
    }
    const linked = await oauthRoundTrip("&mode=link");
    assert.match(linked.headers.get("location")!, /auth_linked=google/);
    assert.equal((await sql.query("select user_id from oauth_accounts where provider_account_id='disposable-google-identity'")).rows[0].user_id, alice.id);
    const signedInWithGoogle = await oauthRoundTrip("");
    assert.equal(signedInWithGoogle.status, 307);
    assert.equal(new URL(signedInWithGoogle.headers.get("location")!).pathname, "/app/device-access", "Google offers device choices only after verified sign-in");
    const googleSession = signedInWithGoogle.headers.getSetCookie().find(cookie => cookie.startsWith("maddy_session="));
    assert(googleSession);
    assert.equal(JSON.parse(Buffer.from(googleSession.split("=")[1].split(".")[1], "base64url").toString()).sub, alice.id);
    await sql.query("delete from oauth_accounts where provider_account_id='disposable-google-identity'");
    console.log("PASS Google OAuth linking/sign-in with verified fixture JWTs; nonce/audience rejection, start/callback quotas, cross-site start rejection and account-bound state. Google responses mocked; no third-party calls.");
    const verifier = "a".repeat(43);
    const ticket = await new SignJWT({ policyVersion: "2026-10-14", usr: alice.username, codeChallenge: createHash("sha256").update(verifier).digest("base64url") })
      .setProtectedHeader({ alg: "HS256", typ: "JWT" }).setSubject(alice.id).setIssuer("circlo").setAudience("circlo-google-mobile-handoff").setIssuedAt().setExpirationTime("120s")
      .sign(new TextEncoder().encode(env.JWT_SECRET));
    assert.equal((await api("/api/auth/google/native", "", "POST", { acceptTerms: true, acceptPrivacy: true, ticket, verifier: "b".repeat(43) })).status, 401);
    assert.equal((await api("/api/auth/google/native", "", "POST", { acceptTerms: true, acceptPrivacy: true, ticket, verifier })).status, 200);
    assert.equal((await api("/api/auth/google/native", "", "POST", { acceptTerms: true, acceptPrivacy: true, ticket, verifier })).status, 409, "Google mobile handoff can establish authentication only once");
    const pushToken = "disposable-native-push-device-token-no-real-delivery";
    assert.equal((await api("/api/push/register", aliceCookie, "POST", { token: pushToken })).status, 200);
    assert.deepEqual(await (await api("/api/push/register", aliceCookie)).json(), { registered: true });
    assert.deepEqual(await (await api("/api/push/register", bobCookie)).json(), { registered: false });
    assert.equal((await api("/api/push/register", bobCookie, "POST", { token: pushToken })).status, 200);
    assert.deepEqual(await (await api("/api/push/register", aliceCookie)).json(), { registered: false });
    assert.deepEqual(await (await api("/api/push/register", bobCookie)).json(), { registered: true });
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
    const forbiddenUnstar = await api(`/api/messages/${message.id}/star`, outsiderCookie, "DELETE");
    const forbiddenBody = await forbiddenUnstar.json();
    assert.equal(forbiddenUnstar.status, 404, "Unstar must not read a message from another conversation");
    assert.equal(forbiddenBody.message, undefined, "Unauthorized responses contain no message DTO");
    assert.equal((await api(`/api/messages/${message.id}/star`, bobCookie, "POST")).status, 200);
    await sql.query("insert into pinned_messages(conversation_id,message_id,pinned_by) values($1,$2,$3)", [conversation.id, message.id, alice.id]);
    const notice = (await sql.query("insert into notifications(user_id,actor_id,type,data) values($1,$2,'message',$3::jsonb) returning id", [bob.id, alice.id, JSON.stringify({conversationId:conversation.id,messageId:message.id,actorName:"Fixture",preview:"fixture-only"})])).rows[0];
    const deliveryPath = `/api/notifications/push/delivery?id=${notice.id}`;
    assert.equal((await api(deliveryPath, bobCookie)).status, 200);
    await sql.query("update conversation_members set cleared_at=now() where conversation_id=$1 and user_id=$2", [conversation.id, bob.id]);
    try {
      assert.equal((await api(`/api/media/${attachment.id}`, bobCookie)).status, 404, "Cleared attachments cannot be retrieved by an old URL");
      assert.equal((await api(`/api/media/${attachment.id}`, aliceCookie)).status, 200, "Another member retains access");
      assert.equal((await api(deliveryPath, bobCookie)).status, 404, "Old pushes cannot restore cleared content");
      for (const [path,key] of [[`/api/users/me/starred-messages`,"starred"],[`/api/conversations/${conversation.id}/pinned-messages`,"pins"],[`/api/conversations/${conversation.id}/files`,"files"]]) {
        const response=await api(path,bobCookie);assert.equal(response.status,200);
        assert.equal((await response.json())[key].length,0,`${key} respects cleared history`);
      }
    } finally { await sql.query("update conversation_members set cleared_at=null where conversation_id=$1 and user_id=$2", [conversation.id,bob.id]); }
    assert.equal((await api(`/api/messages/${message.id}/star`, bobCookie, "DELETE")).status, 200);
    await sql.query("delete from pinned_messages where conversation_id=$1 and message_id=$2", [conversation.id,message.id]);
    await sql.query("delete from notifications where id=$1", [notice.id]);
    assert.equal((await api(historyPath, aliceCookie, "POST", { text: "ciphertext", encrypted: true }, { origin: "https://evil.example" })).status, 403);
    const adminPage = await api("/app/admin", bobCookie);
    const adminHtml = await adminPage.text();
    assert(adminHtml.includes("Administrator access required"), "Signed-in regular users receive clear permission guidance");
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
    assert.equal((await api(`/api/users/${alice.id}/block`, bobCookie, "POST")).status, 200, "Blocking persists through the authenticated API");
    assert.equal((await api(historyPath, aliceCookie, "POST", { text: "ciphertext", encrypted: true })).status, 403);
    assert.equal((await api(historyPath, bobCookie, "POST", { text: "ciphertext", encrypted: true })).status, 403, "Blocking is symmetric");
    assert.equal((await api(`/api/conversations/${conversation.id}/typing`, aliceCookie, "POST", { typing: true })).status, 403);
    assert.equal((await api("/api/calls", aliceCookie, "POST", { action: "invite", conversationId: conversation.id, clientId: randomUUID(), sdp: "v=0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\n" })).status, 403);
    assert.equal((await api(`/api/users/${alice.id}/block`, bobCookie, "DELETE")).status, 200);
    assert.equal((await api(`/api/conversations/${group.id}/messages`, bobCookie, "POST", { text: "ciphertext", encrypted: true })).status, 403);
    assert.equal((await api(`/api/groups/${group.id}/settings`, aliceCookie, "PATCH", { adminOnlyAddingMembers: true })).status, 200, "Owner can explicitly restrict participant additions");
    assert.equal((await api(`/api/groups/${group.id}/members`, bobCookie, "POST", { userId: outsider.id })).status, 403);
    const settingsPath = `/api/groups/${group.id}/settings`;
    assert.equal((await api(settingsPath, bobCookie, "PATCH", { name: "Forbidden" })).status, 403);
    assert.equal((await api(settingsPath, outsiderCookie, "PATCH", { name: "Forbidden" })).status, 404);
    assert.equal((await api(`/api/groups/${conversation.id}/settings`, aliceCookie, "PATCH", { name: "Not a group" })).status, 404);
    for (const invalid of [{ name: " " }, { name: null }, { description: {} }, { adminOnlyMessaging: "false" }, { slowModeSeconds: -1 }, { role: "owner" }]) {
      assert.equal((await api(settingsPath, aliceCookie, "PATCH", invalid)).status, 422);
    }
    const renamed = await api(settingsPath, aliceCookie, "PATCH", { name: "  Renamed group  ", description: "Updated description" });
    assert.equal(renamed.status, 200);
    assert.equal((await sql.query("select name,description from conversations where id=$1", [group.id])).rows[0].name, "Renamed group");
    const ownerPeers = await api(`/api/e2ee/peers?conversationId=${group.id}`, aliceCookie);
    const firstRevision = (await ownerPeers.json()).groupRevision;
    assert(firstRevision);
    assert.equal((await api(`/api/conversations/${group.id}`, bobCookie, "DELETE")).status, 403);
    assert.equal((await api(`/api/groups/${group.id}/members`, aliceCookie, "POST", { userId: outsider.id })).status, 200);
    assert.notEqual((await (await api(`/api/e2ee/peers?conversationId=${group.id}`, aliceCookie)).json()).groupRevision, firstRevision);
    const inviteGroup = (await sql.query("insert into conversations(type,name,created_by_id) values('group','Invite concurrency fixture',$1) returning id", [alice.id])).rows[0];
    await sql.query("insert into conversation_members(conversation_id,user_id,role) values($1,$2,'owner')", [inviteGroup.id, alice.id]);
    const invitePath = `/api/groups/${inviteGroup.id}/invites`;
    assert.equal((await api(invitePath, aliceCookie, "POST", { maxUses: -1 })).status, 422);
    const inviteResponse = await api(invitePath, aliceCookie, "POST", { maxUses: 1 });
    assert.equal(inviteResponse.status, 201);
    const invite = (await inviteResponse.json()).link;
    assert.equal(invite.code.length, 32);
    assert.equal((await api(`/invite/${invite.code}`, bobCookie)).status, 200);
    assert.equal((await sql.query("select count(*)::int n from conversation_members where conversation_id=$1", [inviteGroup.id])).rows[0].n, 1, "Reading an invite cannot enroll the visitor");
    const joinResults = await Promise.all([bobCookie, outsiderCookie].map(cookie => api("/api/groups/join", cookie, "POST", { code: invite.code })));
    assert.deepEqual(joinResults.map(result => result.status).sort(), [200, 409], "A one-use invite admits exactly one concurrent visitor");
    assert.equal((await sql.query("select use_count from group_invite_links where id=$1", [invite.id])).rows[0].use_count, 1);
    assert.equal((await api("/api/groups/join", aliceCookie, "POST", { code: invite.code }, { "sec-fetch-site": "cross-site" })).status, 403);
    await sql.query("update conversations set deleted_at=now() where id=$1", [inviteGroup.id]);
    assert.equal((await api("/api/groups/join", aliceCookie, "POST", { code: invite.code })).status, 409, "Deleted groups cannot be rejoined using old links");
    await sql.query("delete from conversations where id=$1", [inviteGroup.id]);

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
      await page.getByText("Password", { exact: true }).click();
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
    await fixtureAppSession(sql,mfaLogin);
    const mfaCookie = mfaLogin.headers.getSetCookie().find(c => c.startsWith("maddy_session="))!.split(";")[0];
    assert.equal((await api("/api/auth/change-password", mfaCookie, "POST", mfaChange)).status, 403, "Correct current password does not bypass enabled MFA");
    assert.equal((await api("/api/auth/change-password", mfaCookie, "POST", { ...mfaChange, mfaCode: recoveryCode })).status, 200);
    console.log("PASS mobile profile password UI: Google setup option, wrong-password rejection without mutation, successful change, old-session revocation, new-password login, CSRF and MFA enforcement.");
    await testPlayCompliance({ base, sql, api, account, login });
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
