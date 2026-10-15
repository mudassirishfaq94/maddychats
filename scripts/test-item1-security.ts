/** Isolated integration checks. Never accepts a remote or ordinary application database. */
import assert from "node:assert/strict";
import { randomBytes, createHash } from "node:crypto";
import { spawn, type ChildProcess } from "node:child_process";
import { readFileSync } from "node:fs";
import { Pool } from "pg";
import { NextRequest } from "next/server";

async function main() {
  const url = process.env.ITEM1_TEST_DATABASE_URL;
  assert(url, "Set ITEM1_TEST_DATABASE_URL to an isolated PostgreSQL database.");
  const parsed = new URL(url);
  assert(["127.0.0.1", "localhost"].includes(parsed.hostname) && parsed.pathname === "/item1_security_test", "Refusing a non-test database.");
  process.env.DATABASE_URL = url;
  process.env.JWT_SECRET = "item1-test-secret-only-at-least-thirty-two-characters";
  process.env.CLIENT_URL = "http://localhost:3107";
  const sql = new Pool({ connectionString: url });
  let server: ChildProcess | undefined;
  let serverOutput = "";
  const { pool } = await import("../src/db/index");
  try {
    // Verify the new migration against the preceding schema shape.
    await sql.query("DROP TABLE IF EXISTS mfa_challenges; ALTER TABLE users DROP COLUMN IF EXISTS email_verified_at; ALTER TABLE user_2fa DROP COLUMN IF EXISTS recovery_code_hashes; ALTER TABLE user_2fa DROP COLUMN IF EXISTS last_used_step;");
    await sql.query(readFileSync("drizzle/0033_account_security.sql", "utf8"));
    const { hashPassword } = await import("../src/server/password");
    const { generateTOTP, matchingTOTPStep, newRecoveryCodes, verifyTOTPLogin } = await import("../src/server/two-factor");
    const { beginSignIn, completeMfaChallenge, recentlyAuthenticated } = await import("../src/server/authentication");
    const { signSessionToken, verifySessionToken } = await import("../src/server/jwt");
    const password = "Item1SecurePassword9";
    const passwordHash = await hashPassword(password);
    const account = async (name: string, verified = true) => (await sql.query("INSERT INTO users(username, display_name, email, password_hash, email_verified_at) VALUES ($1,$1,$2,$3,$4) RETURNING *", [name, `${name}@example.invalid`, passwordHash, verified ? new Date() : null])).rows[0];
    await sql.query("DELETE FROM users; TRUNCATE rate_limit_buckets;");
    const alice = await account("item1_alice");
    const bob = await account("item1_bob");
    const stranger = await account("item1_stranger");
    const unverified = await account("item1_unverified", false);
    const toUser = async (id: string) => (await import("../src/server/users")).findUserById(id);
    const request = new NextRequest("http://localhost:3107/api/auth/login", { method: "POST" });
    assert.equal(generateTOTP("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ", 1), "287082", "RFC 6238 vector");
    assert.equal(matchingTOTPStep("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ", "287082", 59_000), 1);
    assert.equal(matchingTOTPStep("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ", "287082x", 59_000), null);
    assert(!recentlyAuthenticated(Date.now() - 300_001));
    assert(!recentlyAuthenticated(Date.now() + 1000));
    assert(recentlyAuthenticated(Date.now() - 1000));
    const originalAuth = Date.now() - 360_000;
    assert.equal((await verifySessionToken(await signSessionToken(alice.id, alice.username, originalAuth)))?.authTime, originalAuth);
    const secret = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";
    const recovery = newRecoveryCodes();
    assert.equal(new Set(recovery.codes).size, 10);
    assert(!recovery.hashes.includes(recovery.codes[0]));
    await sql.query("INSERT INTO user_2fa(user_id,secret,enabled,enabled_at,recovery_code_hashes) VALUES($1,$2,true,now(),$3)", [alice.id, secret, JSON.stringify(recovery.hashes)]);
    // Render's internal request origin must never leak into OAuth completion redirects.
    const publicOrigin = "https://maddychats.onrender.com";
    process.env.CLIENT_URL = publicOrigin;
    try {
      const proxyRequest = new NextRequest("http://localhost:10000/api/auth/google/callback", {
        headers: { host: "attacker.invalid", "x-forwarded-host": "attacker.invalid", "x-forwarded-proto": "https" },
      });
      const pending = await beginSignIn(proxyRequest, (await toUser(alice.id))!, "/app?tab=chat");
      const location = new URL(pending.headers.get("location")!);
      assert.equal(location.origin, publicOrigin);
      assert.equal(location.pathname, "/login");
      assert.equal(location.searchParams.get("mfa"), "1");
      assert.equal(location.searchParams.get("next"), "/app?tab=chat");
      assert(pending.cookies.get("maddy_mfa_challenge")?.value);
      assert.equal(pending.cookies.get("maddy_session")?.value, "");
      assert.equal(pending.cookies.get("maddy_refresh")?.value, "");
      assert.equal(pending.headers.get("cache-control"), "no-store");
      const signedIn = await beginSignIn(proxyRequest, (await toUser(bob.id))!, "/app");
      assert.equal(signedIn.headers.get("location"), `${publicOrigin}/app`);
      assert(signedIn.cookies.get("maddy_session")?.value);
      for (const path of ["https://attacker.invalid/app", "//attacker.invalid", "/\\attacker.invalid"]) {
        await assert.rejects(beginSignIn(proxyRequest, (await toUser(bob.id))!, path), /application origin/);
      }
    } finally {
      process.env.CLIENT_URL = "http://localhost:3107";
    }
    const primary = await beginSignIn(request, (await toUser(alice.id))!);
    assert.equal((await primary.json()).mfaRequired, true);
    assert.equal(primary.cookies.get("maddy_session")?.value, "");
    const challenge = primary.cookies.get("maddy_mfa_challenge")!.value;
    assert.equal(await verifySessionToken(challenge), null);
    assert.equal(await completeMfaChallenge(challenge, "wrong"), null);
    const code = generateTOTP(secret, Math.floor(Date.now() / 30_000));
    assert.equal((await completeMfaChallenge(challenge, code))?.id, alice.id);
    assert.equal(await completeMfaChallenge(challenge, code), null);
    assert.equal((await verifyTOTPLogin(alice.id, code)).valid, false, "TOTP replay rejected");
    const recoveryResults = await Promise.all([verifyTOTPLogin(alice.id, recovery.codes[0]), verifyTOTPLogin(alice.id, recovery.codes[0])]);
    assert.equal(recoveryResults.filter((r) => r.valid).length, 1, "Concurrent recovery consumption is single-use");
    const expired = randomBytes(32).toString("base64url");
    await sql.query("INSERT INTO mfa_challenges(token_hash,user_id,expires_at) VALUES($1,$2,now()-interval '1 second')", [createHash("sha256").update(expired).digest("hex"), alice.id]);
    assert.equal(await completeMfaChallenge(expired, recovery.codes[1]), null);
    const revoked = (await beginSignIn(request, (await toUser(alice.id))!)).cookies.get("maddy_mfa_challenge")!.value;
    await sql.query("UPDATE users SET token_invalid_before_at=now() WHERE id=$1", [alice.id]);
    assert.equal(await completeMfaChallenge(revoked, recovery.codes[1]), null);
    await sql.query("UPDATE users SET token_invalid_before_at=NULL WHERE id=$1", [alice.id]);
    await sql.query("UPDATE users SET suspended_at=now() WHERE id=$1", [alice.id]);
    assert.equal((await beginSignIn(request, (await toUser(alice.id))!)).status, 403);
    await sql.query("UPDATE users SET suspended_at=NULL WHERE id=$1", [alice.id]);

    // Registration delivery is mocked locally; no email or provider network request.
    const register = (await import("../src/app/api/auth/register/route")).POST;
    const savedFetch = globalThis.fetch;
    process.env.RESEND_API_KEY = "test-only"; process.env.EMAIL_FROM = "Circlo <test@example.invalid>";
    let mail = "";
    globalThis.fetch = (async (_url: unknown, init: RequestInit) => { mail = String(init.body); return new Response("{}", { status: 200 }); }) as typeof fetch;
    let registered;
    try {
      registered = await register(new NextRequest("http://localhost:3107/api/auth/register", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: "item1_new", displayName: "New User", email: "new@example.invalid", password, confirmPassword: password, acceptTerms: true, acceptPrivacy: true }) }));
    } finally { globalThis.fetch = savedFetch; process.env.RESEND_API_KEY = ""; }
    assert.equal(registered.status, 201);
    assert.equal((await registered.json()).verificationRequired, true);
    assert(!registered.cookies.get("maddy_session"));
    const verificationMail = JSON.parse(mail);
    assert.deepEqual(verificationMail.to,["new@example.invalid"]);
    assert(/verification code: \d{6}/i.test(verificationMail.text));
    assert(verificationMail.html.includes("/brand/circlo-email.png"));
    assert(verificationMail.text.includes("10 minutes"));
    assert.equal((await sql.query("SELECT email_verified_at FROM users WHERE username='item1_new'")).rows[0].email_verified_at, null);

    // API cases exercise real Next request/cookie handling against the isolated server.
    const base = "http://127.0.0.1:3107";
    server = spawn(process.execPath, [".next/standalone/server.js"], {
      env: { ...process.env, NODE_ENV: "production", HOSTNAME: "127.0.0.1", PORT: "3107", DATABASE_URL: url, CLIENT_URL: base, RESEND_API_KEY: "", EMAIL_FROM: "", EMAIL_FROM_ADDRESS: "" },
      stdio: ["ignore", "pipe", "pipe"], windowsHide: true,
    });
    server.stdout?.on("data", (chunk) => { serverOutput = (serverOutput + chunk).slice(-5000); });
    server.stderr?.on("data", (chunk) => { serverOutput = (serverOutput + chunk).slice(-5000); });
    let ready = false;
    for (let i = 0; i < 100; i++) {
      if (server.exitCode !== null) throw new Error(`Test server exited: ${serverOutput}`);
      try { if ((await fetch(base + "/api/health")).ok) { ready = true; break; } } catch { /* startup */ }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    assert(ready, `Test server did not become ready: ${serverOutput}`);
    const cookie = async (user: { id: string; username: string }, fresh = true, mfaTime = 0) => {
      const authTime = fresh ? Date.now() : Date.now() - 360_000;
      const session = (await sql.query("insert into device_sessions(user_id,refresh_hash,user_agent,auth_time,mfa_time,expires_at,approval_required) values($1,$2,'item1-fixture',$3,$4,now()+interval '30 days',false) returning id", [user.id, randomBytes(32).toString("hex"), authTime, mfaTime])).rows[0];
      return `maddy_session=${await signSessionToken(user.id, user.username, authTime, mfaTime, session.id)}`;
    };
    const api = async (path: string, body?: unknown, session?: string, method = "POST") => {
      const response = await fetch(base + path, { method, headers: { "Content-Type": "application/json", ...(session ? { Cookie: session } : {}) }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
      const data = await response.json().catch(() => null);
      if (response.status >= 500) throw new Error(`API ${path} failed: ${serverOutput}`);
      return { response, data };
    };
    assert.equal((await api("/api/auth/login", { acceptTerms: true, acceptPrivacy: true, identifier: unverified.username, password })).response.status, 403);
    const token = randomBytes(32).toString("base64url");
    await sql.query("INSERT INTO email_verification_tokens(user_id,token_hash,expires_at) VALUES($1,$2,now()+interval '1 hour')", [unverified.id, createHash("sha256").update(token).digest("hex")]);
    const consumed = await Promise.all([api("/api/auth/verify-email", { token }), api("/api/auth/verify-email", { token })]);
    assert.deepEqual(consumed.map((r) => r.response.status).sort(), [200,400]);
    assert((await sql.query("SELECT email_verified_at FROM users WHERE id=$1", [unverified.id])).rows[0].email_verified_at);
    assert.equal((await api("/api/auth/login", { acceptTerms: true, acceptPrivacy: true, identifier: unverified.username, password })).response.status, 200);

    const oldBobCookie = await cookie(bob, false);
    const oldAuthTime = (await verifySessionToken(oldBobCookie.slice("maddy_session=".length)))!.authTime;
    const renewed = await api("/api/auth/me", undefined, oldBobCookie, "GET");
    assert.equal(renewed.response.status, 200);
    assert.equal(renewed.response.headers.getSetCookie().length, 0, "An identity read cannot overwrite a newer login cookie");
    assert.equal((await verifySessionToken(oldBobCookie.slice("maddy_session=".length)))!.authTime, oldAuthTime, "Identity reads cannot create fresh authentication");
    assert.equal((await api("/api/privacy/2fa/setup", {}, oldBobCookie)).response.status, 403);
    assert.equal((await api("/api/privacy/2fa/setup", { password: "wrong" }, oldBobCookie)).response.status, 403);
    const setup = await api("/api/privacy/2fa/setup", { password }, oldBobCookie);
    assert.equal(setup.response.status, 200);
    const enrollment = await api("/api/privacy/2fa/verify", { password, code: generateTOTP(setup.data.secret, Math.floor(Date.now()/30_000)) }, oldBobCookie);
    assert.equal(enrollment.response.status, 200);
    assert.equal(enrollment.data.recoveryCodes.length, 10);
    assert.equal((await api("/api/auth/me", undefined, oldBobCookie, "GET")).response.status, 401, "Old sessions revoked by MFA enrollment");
    const mfaLogin = await api("/api/auth/login", { acceptTerms: true, acceptPrivacy: true, identifier: bob.username, password });
    assert.equal(mfaLogin.data.mfaRequired, true);
    const pendingCookie = mfaLogin.response.headers.getSetCookie().find((v) => v.startsWith("maddy_mfa_challenge="))!.split(";")[0];
    const mfaDone = await api("/api/auth/mfa", { code: enrollment.data.recoveryCodes[0] }, pendingCookie);
    assert.equal(mfaDone.response.status, 200);
    assert.equal((await api("/api/auth/mfa", { code: enrollment.data.recoveryCodes[0] }, pendingCookie)).response.status, 401);
    const enabledAt = (await sql.query("SELECT enabled_at FROM user_2fa WHERE user_id=$1",[bob.id])).rows[0].enabled_at.getTime();
    const staleBob = await cookie(bob, false, enabledAt+1);
    assert.equal((await api("/api/privacy/2fa/verify", {}, staleBob, "DELETE")).response.status, 403);
    assert.equal((await api("/api/privacy/2fa/verify", { password, mfaCode: enrollment.data.recoveryCodes[1] }, staleBob, "DELETE")).response.status, 200);

    const conv = (await sql.query("INSERT INTO conversations(type,name) VALUES('group','Test') RETURNING id")).rows[0].id;
    await sql.query("INSERT INTO conversation_members(conversation_id,user_id,role) VALUES($1,$2,'owner'),($1,$3,'member')", [conv,alice.id,bob.id]);
    const msg = (await sql.query("INSERT INTO messages(conversation_id,sender_id,text,type) VALUES($1,$2,'Voice','audio') RETURNING id", [conv,alice.id])).rows[0].id;
    const attachment = (await sql.query("INSERT INTO message_attachments(message_id,kind,path,stored_name,original_name,mime_type,size) VALUES($1,'audio','files/test.webm','test.webm','test.webm','audio/webm',10) RETURNING id",[msg])).rows[0].id;
    const aliceCookie = await cookie(alice,true,Date.now());
    const bobCookie = await cookie(bob);
    const strangerCookie = await cookie(stranger);
    assert.equal((await api("/api/messages/transcribe", { attachmentId: attachment })).response.status, 401);
    assert.equal((await api("/api/messages/transcribe", { attachmentId: attachment }, strangerCookie)).response.status, 404);
    assert.equal((await api("/api/messages/transcribe", { attachmentId: attachment, transcript: "changed" }, bobCookie)).response.status, 403);
    assert.equal((await api("/api/messages/transcribe", { attachmentId: attachment, transcript: "Original" }, aliceCookie)).response.status, 200);
    assert.equal((await api("/api/messages/transcribe", { attachmentId: attachment }, bobCookie)).data.transcript, "Original");
    await sql.query("UPDATE message_attachments SET encrypted=true WHERE id=$1",[attachment]);
    assert.equal((await api("/api/messages/transcribe", { attachmentId: attachment, transcript: "secret" }, aliceCookie)).response.status, 422);
    await sql.query("UPDATE message_attachments SET encrypted=false WHERE id=$1;",[attachment]);
    await sql.query("UPDATE messages SET encrypted=true WHERE id=$1",[msg]);
    assert.equal((await api("/api/messages/transcribe", { attachmentId: attachment }, aliceCookie)).response.status, 422);
    await sql.query("UPDATE messages SET encrypted=false WHERE id=$1",[msg]);
    await sql.query("UPDATE messages SET expires_at=now()-interval '1 second' WHERE id=$1",[msg]);
    assert.equal((await api("/api/messages/transcribe", { attachmentId: attachment }, bobCookie)).response.status, 404);
    await sql.query("UPDATE messages SET expires_at=NULL WHERE id=$1",[msg]);
    await sql.query("UPDATE conversation_members SET cleared_at=now() WHERE conversation_id=$1 AND user_id=$2",[conv,bob.id]);
    assert.equal((await api("/api/messages/transcribe", { attachmentId: attachment }, bobCookie)).response.status, 404);
    await sql.query("UPDATE conversation_members SET cleared_at=NULL WHERE conversation_id=$1 AND user_id=$2",[conv,bob.id]);
    await sql.query("INSERT INTO message_deletions(message_id,user_id) VALUES($1,$2)",[msg,bob.id]);
    assert.equal((await api("/api/messages/transcribe", { attachmentId: attachment }, bobCookie)).response.status, 404);
    await sql.query("UPDATE messages SET deleted_at=now() WHERE id=$1",[msg]);
    assert.equal((await api("/api/messages/transcribe", { attachmentId: attachment }, aliceCookie)).response.status, 404);
    const staleStranger = await cookie(stranger,false);
    assert.equal((await api("/api/privacy/delete-account", { confirm: "DELETE" }, staleStranger)).response.status, 403);
    assert.equal((await api("/api/privacy/delete-account", { confirm: "DELETE", password: "wrong" }, staleStranger)).response.status, 403);
    assert.equal((await api("/api/privacy/delete-account", { confirm: "DELETE", password }, staleStranger)).response.status, 200);
    assert.equal((await sql.query("SELECT id FROM users WHERE id=$1", [stranger.id])).rowCount, 0);
    assert.equal((await sql.query("SELECT admin_id FROM admin_audit_log WHERE action='account_self_deleted'")).rows[0].admin_id, null);
    console.log("Item #1 security integration checks passed.");
  } finally { server?.kill(); await pool.end(); await sql.end(); }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
