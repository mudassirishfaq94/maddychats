import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";

async function main() {
  const url = new URL(process.env.LOAD_TEST_ADMIN_URL ?? "");
  assert.equal(url.hostname, "127.0.0.1");
  assert.equal(url.pathname, "/postgres");
  const admin = new Pool({ connectionString: url.toString() });
  const name = `session_query_${randomUUID().replaceAll("-", "")}_test`;
  let local: Pool | undefined;
  let appPool: Pool | undefined;
  let created = false;
  try {
    await admin.query(`CREATE DATABASE "${name}"`); created = true;
    url.pathname = `/${name}`;
    process.env.DATABASE_URL = url.toString();
    process.env.JWT_SECRET = "isolated-session-query-test-secret-32chars";
    local = new Pool({ connectionString: url.toString() });
    await migrate(drizzle(local), { migrationsFolder: "drizzle" });
    const { resolveSessionToken, resolveSessionAccess } = await import("../src/server/session");
    const { signSessionToken } = await import("../src/server/jwt");
    appPool = (await import("../src/db/index")).pool;
    const id = randomUUID(), sid = randomUUID(), other = randomUUID();
    const now = Date.now();
    await local.query("INSERT INTO users(id,username,display_name,email,password_hash,email_verified_at) VALUES ($1,'session_test','Test','session@example.invalid','unused',now()),($2,'other_test','Other','other@example.invalid','unused',now())", [id, other]);
    await local.query("INSERT INTO device_sessions(id,user_id,refresh_hash,user_agent,auth_time,mfa_time,expires_at,approval_required) VALUES ($1,$2,'test','Local test',$3,$3,now()+interval '1 day',false)", [sid,id,now]);
    const token = await signSessionToken(id,"session_test",now,now,sid);
    assert.equal((await resolveSessionToken(token))?.id,id);
    assert.equal(await resolveSessionToken(await signSessionToken(id,"session_test",now,now)),null,"Sessionless legacy cookies cannot bypass device verification");
    await local.query("UPDATE device_sessions SET approval_required=true WHERE id=$1",[sid]);
    assert.equal(await resolveSessionToken(token),null,"A token without a pending claim still cannot bypass persisted device approval");
    assert.equal((await resolveSessionAccess(token))?.approvalRequired,true);
    await local.query("UPDATE device_sessions SET approval_required=false WHERE id=$1",[sid]);
    await local.query("UPDATE device_sessions SET revoked_at=now() WHERE id=$1",[sid]);
    assert.equal(await resolveSessionToken(token),null,"revocation remains immediate");
    await local.query("UPDATE device_sessions SET revoked_at=null, user_id=$1 WHERE id=$2",[other,sid]);
    assert.equal(await resolveSessionToken(token),null,"device must belong to user");
    await local.query("UPDATE device_sessions SET user_id=$1, expires_at=now()-interval '1 second' WHERE id=$2",[id,sid]);
    assert.equal(await resolveSessionToken(token),null,"expired device is rejected");
    await local.query("UPDATE device_sessions SET expires_at=now()+interval '1 day' WHERE id=$1",[sid]);
    await local.query("UPDATE users SET suspended_at=now() WHERE id=$1",[id]);
    assert.equal(await resolveSessionToken(token),null,"suspension is immediate");
    await local.query("UPDATE users SET suspended_at=null,token_invalid_before_at=now()+interval '1 second' WHERE id=$1",[id]);
    assert.equal(await resolveSessionToken(token),null,"logout watermark is honored");
    await local.query("UPDATE users SET token_invalid_before_at=null WHERE id=$1",[id]);
    await local.query("INSERT INTO user_2fa(user_id,secret,enabled,enabled_at) VALUES($1,'unused',true,now()+interval '1 second')",[id]);
    assert.equal(await resolveSessionToken(token),null,"new MFA enrollment invalidates old session");
    await local.query("UPDATE user_2fa SET enabled_at=$1 WHERE user_id=$2",[new Date(now-1000),id]);
    assert.equal((await resolveSessionToken(token))?.id,id,"MFA-authenticated eligible session works");
    assert.equal(await resolveSessionToken("bad-token"),null);
    console.log("PASS: valid session, immediate device revocation, ownership, expiry, suspension, logout and MFA checks.");
    const conversation = randomUUID(), message = randomUUID(), second = randomUUID();
    await local.query("INSERT INTO conversations(id,type,created_by_id) VALUES($1,'dm',$2)",[conversation,id]);
    await local.query("INSERT INTO conversation_members(conversation_id,user_id,accepted_at) VALUES($1,$2,now()),($1,$3,now())",[conversation,id,other]);
    await local.query("INSERT INTO messages(id,conversation_id,sender_id,text,encrypted) VALUES($1,$2,$3,'first',true),($4,$2,$3,'second',true)",[message,conversation,id,second]);
    await local.query("INSERT INTO message_stars(message_id,user_id) VALUES($1,$2),($3,$4)",[message,id,second,other]);
    await local.query("INSERT INTO message_deletions(message_id,user_id) VALUES($1,$2)",[second,other]);
    await local.query("INSERT INTO pinned_messages(message_id,conversation_id,pinned_by) VALUES($1,$2,$3)",[message,conversation,id]);
    const { listMessages, getMyStars, getMyDeletions, getPinnedIds } = await import("../src/server/chat");
    for(const viewer of [id,other]) {
      const page = await listMessages(conversation,null,30,viewer);
      const ids = page.messages.map(m => m.id);
      assert.equal(ids.length,2);
      const stars=await getMyStars(ids,viewer), deletions=await getMyDeletions(ids,viewer), pins=await getPinnedIds(ids,conversation);
      for(const item of page.messages) {
        assert.equal(item.starred,stars.has(item.id));
        assert.equal(item.deletedForMe,deletions.has(item.id));
        assert.equal(item.pinned,pins.has(item.id));
        assert.equal(item.encrypted,true);
      }
    }
    const { decodeCursor } = await import("../src/server/chat");
    const first = await listMessages(conversation,null,1,id);
    assert(first.hasMore && first.nextCursor);
    const next = await listMessages(conversation,decodeCursor(first.nextCursor),1,id);
    assert.equal(next.messages.length,1);
    assert.notEqual(first.messages[0].id,next.messages[0].id,"cursor works when timestamps tie");
    await local.query("DELETE FROM message_stars WHERE user_id=$1",[id]);
    assert((await listMessages(conversation,null,30,id)).messages.every(m=>!m.starred),"compiled queries do not cache results");
    await local.query("UPDATE messages SET expires_at=now()-interval '1 second' WHERE id=$1",[second]);
    const expired=(await listMessages(conversation,null,30,id)).messages.find(m=>m.id===second)!;
    assert.equal(expired.text,""); assert(expired.deletedAt);
    const { scheduleMessage, processScheduledMessages } = await import("../src/server/scheduled-messages");
    const scheduled=await scheduleMessage({ senderId:id,conversationId:conversation,text:"scheduled encrypted fixture",encrypted:true,scheduledFor:new Date(Date.now()-1000) });
    const { startStarterMaintenance } = await import("../src/server/starter-maintenance");
    startStarterMaintenance();
    for(let attempt=0;attempt<100;attempt++) {
      if((await local.query("SELECT sent FROM scheduled_messages WHERE id=$1",[scheduled.id])).rows[0].sent) break;
      await new Promise(resolve=>setTimeout(resolve,100));
    }
    await processScheduledMessages();
    assert.equal((await local.query("SELECT sent FROM scheduled_messages WHERE id=$1",[scheduled.id])).rows[0].sent,true);
    assert.equal((await local.query("SELECT count(*)::int AS count FROM messages WHERE conversation_id=$1 AND text='scheduled encrypted fixture'",[conversation])).rows[0].count,1);
    console.log("PASS: history flags equal the original queries for two users; scheduled delivery persists exactly once.");
    const { listConversationsFor } = await import("../src/server/chat");
    for(const viewer of [id,other]) {
      const list=await listConversationsFor(viewer);
      assert.equal(list.length,1); assert.equal(list[0].id,conversation);
      assert.equal(list[0].memberCount,2); assert.equal(list[0].hasPinnedMessages,true);
      assert.equal(list[0].otherMember?.id,viewer===id?other:id);
      assert.equal(list[0].unreadCount,viewer===id?0:2);
      assert.equal(list[0].lastMessage?.text,"scheduled encrypted fixture");
    }
    assert.deepEqual(await listConversationsFor(randomUUID()),[]);
    console.log("PASS: conversation membership, peers, unread totals, pins and latest messages preserved.");
    const { NextRequest } = await import("next/server");
    const { issueDeviceSession } = await import("../src/server/device-sessions");
    await local.query("UPDATE user_2fa SET enabled=false WHERE user_id=$1",[id]);
    const credentials=await issueDeviceSession(new NextRequest("http://localhost/login",{headers:{"user-agent":"Atomic login fixture","x-forwarded-for":"127.0.0.1"}}),{id,username:"session_test"},0);
    assert.equal(await resolveSessionToken(credentials.access),null,"A new sign-in has no app access before device proof");
    assert.equal((await resolveSessionAccess(credentials.access))?.approvalRequired,true);
    await local.query("update device_sessions set approval_required=false where id=$1",[JSON.parse(Buffer.from(credentials.access.split('.')[1],'base64url').toString()).sid]);
    assert.equal((await resolveSessionToken(credentials.access))?.id,id);
    const audit=(await local.query("SELECT identifier,success,ip_address,user_agent FROM login_history WHERE user_id=$1",[id])).rows;
    assert.equal(audit.length,1); assert.equal(audit[0].identifier,"session_test");
    assert.equal(audit[0].success,true); assert.equal(audit[0].user_agent,"Atomic login fixture");
    const presence=(await local.query("SELECT last_seen_at FROM users WHERE id=$1",[id])).rows[0].last_seen_at;
    const sessionCount=(await local.query("SELECT count(*)::int AS n FROM device_sessions WHERE user_id=$1",[id])).rows[0].n;
    await local.query("ALTER TABLE login_history ADD CONSTRAINT test_audit_failure CHECK(user_agent IS DISTINCT FROM 'Reject audit fixture')");
    await assert.rejects(issueDeviceSession(new NextRequest("http://localhost/login",{headers:{"user-agent":"Reject audit fixture"}}),{id,username:"session_test"},0));
    assert.equal((await local.query("SELECT count(*)::int AS n FROM device_sessions WHERE user_id=$1",[id])).rows[0].n,sessionCount,"failed audit cannot persist a session");
    assert.equal((await local.query("SELECT last_seen_at FROM users WHERE id=$1",[id])).rows[0].last_seen_at.getTime(),presence.getTime(),"failed statement rolls back presence");
    await local.query("INSERT INTO device_sessions(user_id,refresh_hash,user_agent,auth_time,mfa_time,expires_at) SELECT $1,'expired','Cleanup fixture',0,0,now()-interval '1 day' FROM generate_series(1,1005)",[other]);
    await local.query("INSERT INTO mfa_challenges(token_hash,user_id,expires_at) SELECT 'expired-'||g,$1,now()-interval '1 day' FROM generate_series(1,1005) g",[other]);
    const { cleanupExpiredAuthentication } = await import("../src/server/auth-maintenance");
    assert.deepEqual(await cleanupExpiredAuthentication(),{challenges:1000,sessions:1000});
    assert.equal((await resolveSessionToken(credentials.access))?.id,id,"active sessions survive cleanup");
    assert.deepEqual(await cleanupExpiredAuthentication(),{challenges:5,sessions:5});
    console.log("PASS: atomic login audit, presence and session; rollback on failure; bounded expiry cleanup preserves active sessions.");
    const { consumePasswordReset } = await import("../src/server/password-reset");
    const { verifyPassword } = await import("../src/server/password");
    const resetToken=randomUUID(); const digest=(value:string)=>createHash("sha256").update(value).digest("hex");
    await local.query("INSERT INTO password_reset_tokens(user_id,token_hash,expires_at) VALUES($1,$2,now()+interval '1 day')",[id,digest(resetToken)]);
    const password="ResetCompatibility99!";
    const resetResults=await Promise.all([consumePasswordReset(resetToken,password),consumePasswordReset(resetToken,password)]);
    assert.equal(resetResults.filter(Boolean).length,1,"reset token remains single-use under concurrent requests");
    const hash=(await local.query("SELECT password_hash FROM users WHERE id=$1",[id])).rows[0].password_hash;
    assert.equal(await verifyPassword(password,hash),true);
    assert.equal(await resolveSessionToken(token),null,"password reset still revokes old sessions");
    const expiring=randomUUID();
    await local.query("INSERT INTO password_reset_tokens(user_id,token_hash,expires_at) VALUES($1,$2,now()+interval '1 day')",[id,digest(expiring)]);
    const changing=consumePasswordReset(expiring,"ExpiredResetPassword99!");
    const workState=globalThis as typeof globalThis & {__passwordWork?:{active:number}};
    for(let i=0;i<100 && !workState.__passwordWork?.active;i++) await new Promise(resolve=>setTimeout(resolve,5));
    assert(workState.__passwordWork?.active,"hashing begins before the expiry change");
    await local.query("UPDATE password_reset_tokens SET expires_at=now()-interval '1 second' WHERE token_hash=$1",[digest(expiring)]);
    assert.equal(await changing,false,"expiry is checked again after off-thread hashing");
    assert.equal((await local.query("SELECT password_hash FROM users WHERE id=$1",[id])).rows[0].password_hash,hash);
    console.log("PASS: reset race consumes once, revokes sessions, and rechecks expiry after hashing.");
    const { findUserByIdentifier } = await import("../src/server/users");
    assert.equal((await findUserByIdentifier(" SeSsIoN_TeSt "))?.id,id);
    assert.equal((await findUserByIdentifier(" SESSION@EXAMPLE.INVALID "))?.id,id);
    await local.query("UPDATE users SET display_name='Fresh lookup' WHERE id=$1",[id]);
    assert.equal((await findUserByIdentifier("session_test"))?.displayName,"Fresh lookup","SQL reuse never caches account rows");
    process.env.CLIENT_URL="http://127.0.0.1:3200";
    process.env.STARTER_MODE="1"; process.env.RESEND_API_KEY="";
    const { POST: login } = await import("../src/app/api/auth/login/route");
    const attempt=(value=password)=>login(new NextRequest("http://127.0.0.1:3200/api/auth/login",{method:"POST",headers:{origin:process.env.CLIENT_URL!,"content-type":"application/json","x-forwarded-for":"198.18.7.1"},body:JSON.stringify({ acceptTerms: true, acceptPrivacy: true, identifier:"session_test",password:value})}));
    assert.equal((await attempt("incorrect password")).status,401);
    assert.equal((await attempt()).status,200);
    await local.query("UPDATE users SET suspended_at=now() WHERE id=$1",[id]);
    const suspended=await attempt(); assert.equal(suspended.status,403); assert.equal(suspended.cookies.get("maddy_session"),undefined);
    await local.query("UPDATE users SET email_verified_at=null WHERE id=$1",[id]);
    assert.equal((await attempt()).status,403,"suspended unverified users remain blocked before proof work");
    assert.equal((await local.query("SELECT count(*)::int AS n FROM email_verification_tokens WHERE user_id=$1",[id])).rows[0].n,0);
    await local.query("UPDATE users SET suspended_at=null WHERE id=$1",[id]);
    const unverified=await attempt(); assert.equal(unverified.status,403); assert.equal((await unverified.json()).verificationRequired,true);
    await local.query("UPDATE users SET email_verified_at=now() WHERE id=$1",[id]);
    await local.query("UPDATE user_2fa SET enabled=true WHERE user_id=$1",[id]);
    const factor=await attempt(); assert.equal(factor.status,200); assert.equal((await factor.json()).mfaRequired,true);
    assert(factor.cookies.get("maddy_mfa_challenge")?.value); assert.equal(factor.cookies.get("maddy_session")?.value,"");
    console.log("PASS: fresh case-insensitive lookups; actual login verifies credentials, suspension, email proof and MFA without bypasses.");
  } finally {
    const state=globalThis as typeof globalThis & { __scheduledMaintenance?:ReturnType<typeof setInterval>; __starterMaintenance?:ReturnType<typeof setInterval> };
    clearInterval(state.__scheduledMaintenance); clearInterval(state.__starterMaintenance);
    await appPool?.end(); await local?.end();
    if (created) {
      // Pool.end resolves before PostgreSQL necessarily observes every socket
      // closing. Do not FORCE-drop and terminate those retiring connections.
      let connections = 0;
      for (let attempt = 0; attempt < 100; attempt++) {
        connections = (await admin.query<{ n: number }>("SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname=$1", [name])).rows[0].n;
        if (connections === 0) break;
        await new Promise(resolve => setTimeout(resolve, 50));
      }
      assert.equal(connections, 0, "All fixture connections close before database removal");
      await admin.query(`DROP DATABASE "${name}"`);
    }
    await admin.end();
  }
}
main().catch(error => { console.error(error); process.exitCode=1; });
