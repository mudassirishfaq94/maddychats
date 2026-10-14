import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import { Pool } from "pg";
async function main() {
  const url = process.env.ITEM1_TEST_DATABASE_URL;
  assert(url && new URL(url).hostname === "127.0.0.1" && new URL(url).pathname === "/item1_security_test", "Use the disposable loopback security database only");
  process.env.DATABASE_URL = url; process.env.CLIENT_URL = "http://127.0.0.1:3107";
  process.env.RESEND_API_KEY = "mock-only"; process.env.EMAIL_FROM_ADDRESS = "test@example.invalid";
  const sql = new Pool({ connectionString: url });
  const { pool } = await import("../src/db");
  const { hashPassword, verifyPassword } = await import("../src/server/password");
  const { issuePasswordReset, consumePasswordReset } = await import("../src/server/password-reset");
  const name = "reset_" + randomUUID().replaceAll("-", "").slice(0, 12);
  const [user] = (await sql.query("insert into users(username,display_name,email,password_hash) values($1,'<svg onload=alert(1)>',$2,$3) returning *", [name, name + "@example.invalid", await hashPassword("OldPassword91")])).rows;
  const { findUserById } = await import("../src/server/users");
  const account = (await findUserById(user.id))!;
  const savedFetch = globalThis.fetch; let transportStatus = 200, mail: { html: string; text: string; to: string[]; from: string } | null = null, calls = 0;
  globalThis.fetch = (async (target: unknown, options?: RequestInit) => {
    assert.equal(String(target), "https://api.resend.com/emails"); calls++;
    mail = JSON.parse(String(options?.body)); return new Response("{}", { status: transportStatus });
  }) as typeof fetch;
  const token = () => new URL(mail!.text.match(/http:\/\/127\.0\.0\.1:3107\/reset-password\?token=\S+/)![0]).searchParams.get("token")!;
  try {
    await sql.query("insert into oauth_accounts(user_id,provider,provider_account_id) values($1,'google',$2)", [user.id, "disposable-google-" + name]);
    assert.equal(await issuePasswordReset(account), true);
    const first = token(); assert.deepEqual(mail!.to, [account.email]); assert(mail!.html.includes("&lt;svg")); assert(!mail!.html.includes("<svg onload"));
    const stored = (await sql.query("select token_hash,expires_at,used_at from password_reset_tokens where user_id=$1", [user.id])).rows[0];
    assert.equal(stored.token_hash, createHash("sha256").update(first).digest("hex")); assert.notEqual(stored.token_hash, first); assert(stored.expires_at > new Date());
    assert.equal(await issuePasswordReset(account), false); assert.equal(calls, 1, "Cooldown preserves the existing link without emailing again");
    const results = await Promise.all([consumePasswordReset(first, "NewPassword92"), consumePasswordReset(first, "NewPassword93")]); assert.equal(results.filter(Boolean).length, 1);
    assert.equal(await consumePasswordReset(first, "ReplayPassword94"), false);
    const updated = (await findUserById(user.id))!; assert(updated.emailVerifiedAt); assert(await verifyPassword("NewPassword92", updated.passwordHash) || await verifyPassword("NewPassword93", updated.passwordHash));
    assert.equal((await sql.query("select count(*)::int n from oauth_accounts where user_id=$1 and provider='google'", [user.id])).rows[0].n, 1, "Password setup keeps Google connected");
    transportStatus = 503; assert.equal(await issuePasswordReset(updated), false);
    const failed = (await sql.query("select used_at from password_reset_tokens where user_id=$1", [user.id])).rows[0]; assert(failed.used_at); assert.equal(await consumePasswordReset(token(), "BlockedPassword95"), false);
    await sql.query("update password_reset_tokens set created_at=now()-interval '2 minutes' where user_id=$1", [user.id]);
    transportStatus = 200; assert.equal(await issuePasswordReset(updated), true);
    await sql.query("update password_reset_tokens set expires_at=now()-interval '1 second' where user_id=$1", [user.id]); assert.equal(await consumePasswordReset(token(), "ExpiredPassword96"), false);
    console.log("PASS password-reset Resend envelope (mocked), sender fallback, escaped template, hashed/single-use/expired links, concurrency, cooldown, provider failure invalidation, and Google password setup without unlinking.");
  } finally { globalThis.fetch = savedFetch; await sql.query("delete from users where id=$1 and username=$2", [user.id, name]); await pool.end(); await sql.end(); }
}
main().catch(error => { console.error(error instanceof Error ? error.message : "Password reset test failed"); process.exitCode = 1; });
