import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

async function main() {
  assert(process.env.DATABASE_URL, "Disposable database required");
  const url = new URL(process.env.DATABASE_URL);
  assert(["127.0.0.1", "localhost"].includes(url.hostname) && url.pathname === "/restored_workflows_test", "Refusing a non-test database");
  const { pool } = await import("../src/db/index");
  const { cleanupExpiredAuthentication } = await import("../src/server/auth-maintenance");
  const { getLoginHistory } = await import("../src/server/privacy");
  const tag = randomUUID().replaceAll("-", ""), ids = Array.from({length:4},()=>randomUUID());
  let user: string | undefined;
  try {
    user = (await pool.query("insert into users(username,display_name,email,password_hash,email_verified_at) values($1,$1,$2,'fixture-not-a-login-hash',now()) returning id",["retention_"+tag,"retention_"+tag+"@example.invalid"])).rows[0].id;
    assert(user, "Owned fixture user created");
    await pool.query("insert into login_history(id,user_id,identifier,success,ip_address,user_agent,created_at) values ($1,$5,'old-account',false,'192.0.2.1','fixture',now()-interval '31 days'),($2,null,'old-unregistered',false,'192.0.2.2','fixture',now()-interval '31 days'),($3,$5,'recent-account',false,'192.0.2.3','fixture',now()-interval '1 hour'),($4,$5,'boundary-account',true,'192.0.2.4','fixture',now()-interval '30 days'+interval '1 minute')",[...ids,user]);
    const active = (await pool.query("insert into device_sessions(user_id,refresh_hash,user_agent,auth_time,mfa_time,expires_at,approval_required) values($1,'fixture-session-digest','fixture',0,0,now()+interval '1 day',false) returning id",[user])).rows[0].id;
    assert.equal((await getLoginHistory(user)).length,2,"Reads exclude logs outside the owner-approved retention window before cleanup runs");
    await cleanupExpiredAuthentication();
    assert.equal((await pool.query('select id from login_history where id=any($1::uuid[])',[ids.slice(0,2)])).rowCount,0,"Old associated and unregistered sign-in records are deleted");
    assert.equal((await pool.query('select id from login_history where id=any($1::uuid[])',[ids.slice(2)])).rowCount,2,"Recent failed attempts and the in-window boundary remain");
    assert.equal((await pool.query('select id from device_sessions where id=$1 and revoked_at is null',[active])).rowCount,1,"An active session remains valid");
    console.log('PASS real 30-day sign-in retention: old account/unknown-attempt logs removed; recent failures, boundary and active sessions retained');
  } finally {
    await pool.query('delete from login_history where id=any($1::uuid[])',[ids]);
    if(user)await pool.query("delete from users where id=$1 and username=$2",[user,"retention_"+tag]);
    await pool.end();
  }
}
main().catch(error=>{console.error('Sign-in retention regression failed: '+(error instanceof assert.AssertionError?error.message:error?.code??error?.name??'unknown error'));process.exit(1);});
