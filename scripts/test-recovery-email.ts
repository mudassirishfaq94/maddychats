import assert from "node:assert/strict";
import { createHmac, randomBytes } from "node:crypto";
import { Pool } from "pg";

async function main() {
  const url = process.env.ITEM456_TEST_DATABASE_URL;
  assert(url && new URL(url).hostname === "127.0.0.1" && new URL(url).pathname.endsWith("_test"), "Disposable local database required");
  process.env.DATABASE_URL = url;
  process.env.JWT_SECRET = "disposable-recovery-transport-secret-at-least-thirty-two";
  process.env.CLIENT_URL = "http://localhost:3120";
  process.env.RESEND_API_KEY = "mock-recovery-provider";
  process.env.EMAIL_FROM_ADDRESS = "test@example.invalid";
  const sql = new Pool({ connectionString: url });
  const { pool } = await import("../src/db");
  const { issueDeviceRecoveryEmailCode, consumeDeviceRecoveryEmailCode } = await import("../src/server/device-recovery-email");
  const tag = "recoverymail_" + randomBytes(6).toString("hex");
  let userId: string | undefined;
  const originalFetch = globalThis.fetch;
  const mails: Array<{ to: string[]; text: string }> = [];
  let failing = false;
  globalThis.fetch = async (input, init) => {
    assert.equal(input, "https://api.resend.com/emails");
    mails.push(JSON.parse(String(init?.body)));
    assert((init?.headers as Record<string, string>)["Idempotency-Key"]);
    return Response.json(failing ? { error: "provider unavailable" } : { id: "mock-provider-id" }, { status: failing ? 503 : 200 });
  };
  try {
    userId = (await sql.query("insert into users(username,display_name,email,password_hash,email_verified_at) values($1,$1,$2,'not-a-login',now()) returning id", [tag, tag + "@example.invalid"])).rows[0].id;
    const sessionId = (await sql.query("insert into device_sessions(user_id,refresh_hash,user_agent,auth_time,mfa_time,expires_at) values($1,$2,'fixture',0,0,now()+interval '1 hour') returning id", [userId, tag])).rows[0].id;
    const input = { user: { id: userId!, email: tag + "@example.invalid", emailVerifiedAt: new Date() }, sessionId, deviceId: "fixture-browser", fingerprint: "a".repeat(64) };
    assert.equal(await issueDeviceRecoveryEmailCode(input), "sent");
    assert.deepEqual(mails[0].to, [input.user.email]);
    const code = mails[0].text.match(/code is: (\d{6})/)![1];
    const hash = createHmac("sha256", process.env.JWT_SECRET).update(`device-recovery-email:v1:${userId}:${input.deviceId}:${sessionId}:${input.fingerprint}:${code}`).digest("hex");
    const stored = (await sql.query("select code_hash,expires_at,created_at from device_recovery_email_codes where user_id=$1", [userId])).rows[0];
    assert.equal(stored.code_hash, hash);
    assert.equal(stored.expires_at - stored.created_at, 600000);
    assert.equal(await issueDeviceRecoveryEmailCode(input), "cooldown");
    assert.equal(mails.length, 1);
    const proof = { userId: userId!, deviceId: input.deviceId, sessionId, fingerprint: input.fingerprint, code };
    assert.equal(await consumeDeviceRecoveryEmailCode({ ...proof, deviceId: "wrong-browser" }), false);
    assert.equal(await consumeDeviceRecoveryEmailCode(proof), true);
    assert.equal(await consumeDeviceRecoveryEmailCode(proof), false);
    await sql.query("update device_recovery_email_codes set created_at=now()-interval '2 minutes' where user_id=$1", [userId]);
    failing = true;
    assert.equal(await issueDeviceRecoveryEmailCode(input), "failed", "Provider rejection never reports a successful send");
    assert.equal(await issueDeviceRecoveryEmailCode({ ...input, user: { ...input.user, emailVerifiedAt: null } }), "failed");
    console.log("PASS recovery email transport: verified recipient, template/code, HMAC-only storage, 10-minute expiry, cooldown, browser binding, replay, and provider failure; no real emails sent.");
  } finally {
    globalThis.fetch = originalFetch;
    if (userId) await sql.query("delete from users where id=$1 and username=$2", [userId, tag]);
    await sql.end(); await pool.end();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
