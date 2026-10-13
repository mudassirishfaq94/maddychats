import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { Pool } from "pg";

async function main() {
  const url = process.env.ITEM456_TEST_DATABASE_URL;
  assert(url && new URL(url).hostname === "127.0.0.1" && new URL(url).pathname.endsWith("_test"), "Isolated local database required");
  process.env.DATABASE_URL = url;
  process.env.JWT_SECRET = "disposable-code-tests-only-secret-at-least-thirty-two";
  process.env.CLIENT_URL = "http://localhost:3120";
  process.env.RESEND_API_KEY = "disposable-provider-transport-test";
  process.env.EMAIL_FROM = "Circlo <test@example.invalid>";
  const sql = new Pool({connectionString:url});
  const {pool} = await import("../src/db");
  const {issueEmailVerification,consumeEmailVerificationCode,consumeEmailVerification} = await import("../src/server/email-verification");
  const {findUserById} = await import("../src/server/users");
  const name = "codeqa_" + randomBytes(5).toString("hex");
  let id: string | undefined;
  const originalFetch = globalThis.fetch;
  const mail: Array<{to:string[];html:string;text:string}> = [];
  let rejectDelivery = false;
  globalThis.fetch = async (input, init) => {
    assert.equal(input,"https://api.resend.com/emails");
    mail.push(JSON.parse(String(init?.body)));
    return new Response("{}",{status:rejectDelivery?503:200});
  };
  const lastCode = () => mail.at(-1)!.text.match(/code: (\d{6})/)![1];
  try {
    id=(await sql.query("insert into users(username,display_name,email,password_hash) values($1,$1,$2,'not-a-login-password') returning id",[name,name+"@example.invalid"])).rows[0].id;
    const user=(await findUserById(id!))!;
    assert(await issueEmailVerification(user));
    assert.deepEqual(mail[0].to,[user.email]);
    assert(mail[0].html.includes("/brand/circlo-email.png") && mail[0].html.includes("#151719") && mail[0].html.includes("10 minutes"));
    assert.equal(mail[0].html.includes("App by Mudassir"),false);
    assert.equal((await sql.query("select token_hash from email_verification_tokens where user_id=$1",[id])).rows[0].token_hash.includes(lastCode()),false);
    assert.equal(await issueEmailVerification(user),false,"Resend cooldown enforced");
    assert.equal(mail.length,1);
    const wrong=lastCode()==="000000"?"000001":"000000";
    assert.equal(await consumeEmailVerificationCode(user.email,wrong),"invalid");
    assert.equal(await consumeEmailVerificationCode("missing@example.invalid",lastCode()),"invalid");
    assert.equal(await consumeEmailVerificationCode(user.email,lastCode()),"verified");
    assert.equal(await consumeEmailVerificationCode(user.email,lastCode()),"invalid");
    await sql.query("update users set email_verified_at=null where id=$1",[id]);
    await sql.query("update email_verification_tokens set created_at=now()-interval '2 minutes' where user_id=$1",[id]);
    const old=lastCode();assert(await issueEmailVerification(user));
    assert.equal(await consumeEmailVerificationCode(user.email,old),"invalid");
    await sql.query("update email_verification_tokens set expires_at=now()-interval '1 second' where user_id=$1",[id]);
    assert.equal(await consumeEmailVerificationCode(user.email,lastCode()),"expired");
    assert.equal(await consumeEmailVerificationCode(user.email,lastCode()),"limited");
    rejectDelivery=true;
    await sql.query("update email_verification_tokens set created_at=now()-interval '2 minutes' where user_id=$1",[id]);
    assert.equal(await issueEmailVerification(user),false,"Provider errors cannot report delivery");
    assert.equal(await consumeEmailVerification("invalid-existing-link"),"invalid");
    console.log("Verification-code integration passed: recipient/template, hashing, cooldown, invalid, cross-account, valid-once, replacement, expiry, attempts, provider failure. Transport intercepted; no real email delivery claimed.");
  } finally {
    globalThis.fetch=originalFetch;
    if(id)await sql.query("delete from users where id=$1 and username=$2",[id,name]);
    await sql.end(); await pool.end();
  }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
