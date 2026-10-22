import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

// This suite refuses remote databases; it must never mutate production fixtures.
const url = process.env.DATABASE_URL;
if (!url || new URL(url).hostname !== "127.0.0.1" || new URL(url).pathname !== "/circlo_audit") throw new Error("Use the disposable localhost circlo_audit database.");
let pool: typeof import("../../src/db").pool;
let chat: typeof import("../../src/server/chat");
let schedules: typeof import("../../src/server/scheduled-messages");
let lifetime: typeof import("../../src/server/message-lifetime");
const ids = Array.from({ length: 5 }, () => randomUUID());
const [owner, member, extra, outsider, another] = ids;
let group: string;

test.before(async () => {
  ({ pool } = await import("../../src/db"));
  chat = await import("../../src/server/chat");
  schedules = await import("../../src/server/scheduled-messages");
  lifetime = await import("../../src/server/message-lifetime");
  for (const [i,id] of ids.entries()) await pool.query("insert into users(id,username,display_name,email,password_hash) values($1,$2,$2,$3,'test-only')", [id,`audit_${id.replaceAll("-", "").slice(0,16)}`,`${id}@example.invalid`]);
  group = (await chat.createGroupConversation({ creatorId: owner, name: "Audit group", memberIds: [member] })).id;
});
test.after(async () => { await pool.query("delete from conversations where created_by_id=any($1::uuid[])",[ids]); await pool.query("delete from users where id=any($1::uuid[])",[ids]); await pool.end(); });

test("single-message reads enforce membership and cleared/deleted visibility", async () => {
  const message = (await pool.query("insert into messages(conversation_id,sender_id,text) values($1,$2,'visibility-regression') returning id,created_at", [group, owner])).rows[0];
  assert.equal((await chat.getMessageDTO(message.id, member))?.text, "visibility-regression");
  assert.equal(await chat.getMessageDTO(message.id, outsider), null, "A known message ID is not authorization");
  // Keep PostgreSQL's microsecond precision for the exact equality boundary.
  await pool.query("update conversation_members set cleared_at=(select created_at from messages where id=$3) where conversation_id=$1 and user_id=$2", [group, member, message.id]);
  try {
    assert.equal(await chat.getMessageDTO(message.id, member), null, "The clear watermark includes messages at its timestamp");
    assert.equal((await chat.getMessageDTO(message.id, owner))?.text, "visibility-regression");
  } finally { await pool.query("update conversation_members set cleared_at=null where conversation_id=$1 and user_id=$2", [group, member]); }
  await pool.query("insert into message_deletions(message_id,user_id) values($1,$2)", [message.id, member]);
  assert.equal(await chat.getMessageDTO(message.id, member), null);
  assert.equal((await chat.getMessageDTO(message.id, owner))?.text, "visibility-regression");
});

test("bookmarks, pins, galleries and reply previews share per-viewer visibility", async () => {
  const conversation = (await chat.createGroupConversation({ creatorId: owner, name: "Visibility boundary", memberIds: [member] })).id;
  const parent = (await pool.query("insert into messages(conversation_id,sender_id,text) values($1,$2,'https://example.invalid/private') returning id,created_at", [conversation, owner])).rows[0];
  const { currentMessageEvent } = await import("../../src/server/realtime-visibility");
  const original = (await chat.getMessageDTO(parent.id,member))!;
  const retained = {type:"message:new" as const,conversationId:conversation,message:original};
  assert.equal((await currentMessageEvent(member,retained))?.type,"message:new");
  await pool.query("insert into message_stars(message_id,user_id) values($1,$2),($1,$3)", [parent.id, member, owner]);
  await pool.query("insert into pinned_messages(conversation_id,message_id,pinned_by) values($1,$2,$3)", [conversation,parent.id,owner]);
  await pool.query("insert into message_attachments(message_id,original_name,stored_name,mime_type,size,path,kind) values($1,'photo.png','visibility.png','image/png',10,'images/visibility.png','image'),($1,'private.txt','visibility.txt','text/plain',10,'files/visibility.txt','file')", [parent.id]);
  assert.equal((await chat.listPinnedMessages(conversation,member)).length,1);
  assert.equal((await chat.listConversationMedia(conversation,member)).length,1);
  assert.equal((await chat.listConversationFiles(conversation,member)).length,1);
  assert.equal((await chat.listConversationLinks(conversation,member)).length,1);
  await pool.query("update conversation_members set cleared_at=(select created_at from messages where id=$3) where conversation_id=$1 and user_id=$2", [conversation,member,parent.id]);
  assert.equal(await currentMessageEvent(member,retained),null,"A retained stream event cannot restore cleared content");
  assert(!(await chat.listStarredMessages(member)).some(row=>row.messageId===parent.id));
  assert.equal((await chat.listPinnedMessages(conversation,member)).length,0);
  assert.equal((await chat.listConversationMedia(conversation,member)).length,0);
  assert.equal((await chat.listConversationFiles(conversation,member)).length,0);
  assert.equal((await chat.listConversationLinks(conversation,member)).length,0);
  assert.equal((await chat.listPinnedMessages(conversation,owner)).length,1);
  const reply = (await pool.query("insert into messages(conversation_id,sender_id,text,reply_to_message_id,created_at) values($1,$2,'later reply',$3,$4::timestamptz+interval '1 second') returning id", [conversation,owner,parent.id,parent.created_at])).rows[0];
  assert.equal((await chat.getMessageDTO(reply.id,member))?.replyTo,null,"A newer reply cannot restore its cleared parent");
  assert.equal((await chat.getMessageDTO(reply.id,owner))?.replyTo?.id,parent.id);
  await pool.query("update conversation_members set cleared_at=null where conversation_id=$1 and user_id=$2", [conversation,member]);
  await pool.query("insert into message_deletions(message_id,user_id) values($1,$2)", [parent.id,member]);
  assert.equal((await chat.getMessageDTO(reply.id,member))?.replyTo,null);
  assert.equal((await chat.listPinnedMessages(conversation,member)).length,0);
  await pool.query("delete from conversation_members where conversation_id=$1 and user_id=$2", [conversation,member]);
  assert.equal(await currentMessageEvent(member,retained),null,"Stream replay rechecks revoked membership");
  assert(!(await chat.listStarredMessages(member)).some(row=>row.messageId===parent.id));
  assert((await chat.listStarredMessages(owner)).some(row=>row.messageId===parent.id));
});

test("backend group policy allows ordinary additions and blocks restricted/nonmember mutation", async () => {
  assert.equal(await chat.addGroupMember(group, member, extra), "ok");
  assert.equal(await chat.addGroupMember(group, outsider, another), "not_found");
  await pool.query("update conversations set admin_only_adding_members=true where id=$1",[group]);
  assert.equal(await chat.addGroupMember(group, member, another), "forbidden");
  assert.equal(await chat.addGroupMember(group, owner, another), "ok");
  assert.equal(await chat.changeGroupRole(group, member, extra, "admin"), "forbidden");
  assert.equal(await chat.removeGroupMember(group, member, owner), "forbidden");
  const info = await chat.getConversationForUser(group, member); assert.equal(info?.members.length, 4);
});

test("self-destruct reveal is recipient-only, atomic, fixed and cannot restart after refresh", async () => {
  const created = await chat.createMessage(group,owner,"opaque-self",null,false,true,{ selfDestruct: true, disappearingSeconds: 1, clientMessageId: randomUUID(), realtimeRecipients: [] });
  const id = created.message.id;
  assert.equal(created.message.expiresAt,null);
  assert.equal((await chat.getMessageDTO(id,member))?.text, "");
  assert.equal(await lifetime.revealSelfDestruct(id,owner), null);
  assert.equal(await lifetime.revealSelfDestruct(id,outsider), null);
  const revealed = await Promise.all([lifetime.revealSelfDestruct(id,member),lifetime.revealSelfDestruct(id,extra)]);
  assert.equal(revealed[0]?.text, "opaque-self");
  assert.equal(revealed[0]?.expiresAt, revealed[1]?.expiresAt);
  assert.equal(Date.parse(revealed[0]!.expiresAt!) - Date.parse(revealed[0]!.revealedAt!), 5000);
  assert.equal((await lifetime.revealSelfDestruct(id,member))?.expiresAt, revealed[0]?.expiresAt);
  assert(!(await chat.searchMessages(member,"opaque-self")).length);
  // Advance the stored deadline as a test fixture; production cannot extend it.
  await pool.query("update messages set revealed_at=now()-interval '6 seconds',expires_at=now()-interval '1 second' where id=$1",[id]);
  assert.equal((await chat.getMessageDTO(id,member))?.text, "");
  assert.equal(await lifetime.revealSelfDestruct(id,member), null);
  await lifetime.cleanupExpiredMessages();
  const row = (await pool.query("select text,deleted_at from messages where id=$1",[id])).rows[0];
  assert.equal(row.text, ""); assert(row.deleted_at);
});

test("disappearing content is denied before cleanup and erased with both participants offline", async () => {
  const created = await chat.createMessage(group,owner,"opaque-disappearing",null,false,true,{ disappearingSeconds: 1, clientMessageId: randomUUID() });
  await pool.query("update messages set expires_at=now()-interval '1 second' where id=$1",[created.message.id]);
  assert.equal((await chat.getMessageDTO(created.message.id,member))?.text, "");
  assert.equal((await chat.searchMessages(member,"opaque-disappearing")).length,0);
  await lifetime.cleanupExpiredMessages();
  assert.equal((await pool.query("select text from messages where id=$1",[created.message.id])).rows[0].text, "");
});

test("history masks expired text and attachments without a cleanup write", async () => {
  const conversation = (await chat.createGroupConversation({creatorId:owner,name:"Read-only history",memberIds:[member]})).id;
  const expired = await chat.createMessage(conversation, owner, "cipher-expired", null, false, true, { disappearingSeconds:1, clientMessageId:randomUUID() });
  await pool.query("update messages set expires_at=now()-interval '1 second' where id=$1", [expired.message.id]);
  const current = await chat.createMessage(conversation, member, "cipher-current", expired.message.id, false, true, {clientMessageId:randomUUID()});
  const history = await chat.listMessages(conversation, null, 30, member);
  const old = history.messages.find(message=>message.id===expired.message.id)!;
  assert.equal(old.text, ""); assert.deepEqual(old.attachments, []); assert(old.deletedAt);
  const reply = history.messages.find(message=>message.id===current.message.id)!;
  assert.equal(reply.replyTo?.text, ""); assert.equal(reply.replyTo?.deleted, true);
  const stored = (await pool.query("select text,deleted_at from messages where id=$1", [expired.message.id])).rows[0];
  assert.equal(stored.text, "cipher-expired"); assert.equal(stored.deleted_at, null, "History does not wait on a cleanup UPDATE");
  const summaries = await chat.listConversationsFor(owner);
  assert.equal(summaries.find(item=>item.id===conversation)?.lastMessage?.id, current.message.id);
});

test("scheduled delivery uses locked latest job, rejects plaintext and never duplicates concurrent/restarted workers", async () => {
  await assert.rejects(schedules.scheduleMessage({ senderId:owner,conversationId:group,text:"plaintext",scheduledFor:new Date(Date.now()+60000),encrypted:false }));
  const job = await schedules.scheduleMessage({ senderId:owner,conversationId:group,text:"opaque-before",scheduledFor:new Date(Date.now()+60000),encrypted:true });
  await schedules.editScheduledMessage(job.id,owner,group,{ text:"opaque-after",scheduledFor:new Date(Date.now()+120000) });
  assert.equal(await schedules.editScheduledMessage(job.id,outsider,group,{ text:"unauthorized",scheduledFor:new Date() }),null);
  await pool.query("update scheduled_messages set scheduled_for=now()-interval '1 second' where id=$1",[job.id]);
  // A blocked group peer must not suppress normal group scheduling.
  await pool.query("insert into blocks(blocker_id,blocked_id) values($1,$2)",[owner,member]);
  await Promise.all([schedules.processScheduledMessages(),schedules.processScheduledMessages()]);
  await pool.query("delete from blocks where blocker_id=$1 and blocked_id=$2",[owner,member]);
  await schedules.processScheduledMessages();
  const {spawnSync}=await import("node:child_process");
  const restarted=spawnSync(process.execPath,["--import","tsx","-e","require('./src/server/scheduled-messages.ts').processScheduledMessages().then(()=>require('./src/db/index.ts').pool.end()).catch(()=>process.exit(1))"],{cwd:process.cwd(),env:{...process.env,DATABASE_POOL_MAX:"2"},windowsHide:true,timeout:15000});
  assert.equal(restarted.status,0,"A separate worker process must reuse committed scheduling state");
  const sent = (await pool.query("select sent,sent_message_id,text from scheduled_messages where id=$1",[job.id])).rows[0];
  assert(sent.sent); assert.equal(sent.text, "");
  const messages = await pool.query("select text from messages where id=$1",[sent.sent_message_id]);
  assert.equal(messages.rows[0].text,"opaque-after");
  assert.equal((await pool.query("select count(*) from messages where text='opaque-after'")).rows[0].count,"1");
  assert.equal(await schedules.cancelScheduledMessage(job.id,owner,group),false);
  const pending = await schedules.scheduleMessage({ senderId:owner,conversationId:group,text:"opaque-cancel",scheduledFor:new Date(Date.now()+60000),encrypted:true });
  assert.equal(await schedules.cancelScheduledMessage(pending.id,owner,group),true);
  assert.equal((await pool.query("select count(*) from messages where text='opaque-cancel'")).rows[0].count,"0");
});


test("cloud backup persistence requires trusted live session, preserves revisions and owner isolation",async()=>{
 const recovery=await import("../../src/server/recovery-backups");
 const session=randomUUID(),device="audit-recovery-device",id=randomUUID();
 await pool.query("insert into device_sessions(id,user_id,refresh_hash,user_agent,auth_time,mfa_time,expires_at,approval_required) values($1,$2,$3,'audit',0,0,now()+interval '1 hour',false)",[session,owner,randomUUID()]);
 await pool.query("insert into e2ee_keys(user_id,device_id,public_key,encrypted_private_key,session_id,trusted_at) values($1,$2,'public-test','v2:opaque',$3,now())",[owner,device,session]);
 const input={id,deviceId:device,revision:0,confirmed:true,envelope:{format:"circlo-cloud-recovery-v1" as const,kdf:"HKDF-SHA-256" as const,salt:"A".repeat(43),iv:"A".repeat(16),ciphertext:"opaque-encrypted-fixture"}};
 assert.equal(await recovery.saveRecoveryBackup(owner,randomUUID(),input),null);
 assert.deepEqual(await recovery.saveRecoveryBackup(owner,session,input),{revision:1});
 assert.equal(await recovery.saveRecoveryBackup(owner,session,input),null);
 assert.equal(await recovery.readRecoveryBackup(outsider,id),null);
 assert.equal((await recovery.listRecoveryBackups(owner)).length,1);
 assert.deepEqual(await recovery.saveRecoveryBackup(owner,session,{...input,revision:1}),{revision:2});
 await pool.query("update device_sessions set revoked_at=now() where id=$1",[session]);
 assert.equal(await recovery.saveRecoveryBackup(owner,session,{...input,revision:2}),null);
 assert.equal((await recovery.readRecoveryBackup(owner,id))?.revision,2);
});

test("additive migrations apply in isolation and database rejects altered self-destruct durations",async()=>{
 const {readFile}=await import("node:fs/promises"); const connection=await pool.connect();
 try {
  await connection.query("BEGIN");
  await connection.query("create schema audit_migration_check;set local search_path to audit_migration_check,public;create table users(id uuid primary key);create table conversations(id uuid primary key);create table messages(id uuid primary key,text text,expires_at timestamptz,deleted_at timestamptz)");
  for(const name of ["0052_group_permissions","0053_message_lifetime","0054_encrypted_recovery_backups"]) await connection.query(await readFile(`drizzle/${name}.sql`,"utf8"));
  const id=randomUUID();
  await connection.query("insert into messages(id,self_destruct,revealed_at,expires_at) values($1,true,now(),now()+interval '5 seconds')",[id]);
  await connection.query("savepoint invalid_duration");
  await assert.rejects(connection.query("update messages set expires_at=revealed_at+interval '6 seconds' where id=$1",[id]));
  await connection.query("rollback to invalid_duration");
  const backupOwner=randomUUID(),backupId=randomUUID(),role=`recovery_rls_audit_${process.pid}`;
  await connection.query(`create role ${role} nologin; grant usage on schema audit_migration_check to ${role}; grant select,insert,update,delete on recovery_backups to ${role}`);
  await connection.query("insert into users(id) values($1)",[backupOwner]);
  await connection.query("insert into recovery_backups(id,user_id,device_id,envelope) values($1,$2,'fixture','{}')",[backupId,backupOwner]);
  await connection.query(`set local role ${role}`);
  assert.equal((await connection.query("select count(*) from recovery_backups")).rows[0].count,"0");
  assert.equal((await connection.query("update recovery_backups set confirmed=true")).rowCount,0);
  assert.equal((await connection.query("delete from recovery_backups")).rowCount,0);
  await connection.query("savepoint denied_backup_insert");
  await assert.rejects(connection.query("insert into recovery_backups(id,user_id,device_id,envelope) values($1,$2,'fixture','{}')",[randomUUID(),backupOwner]));
  await connection.query("rollback to denied_backup_insert;reset role");
  const rls=await connection.query("select relrowsecurity from pg_class where oid='audit_migration_check.recovery_backups'::regclass");assert.equal(rls.rows[0].relrowsecurity,true);
 } finally {await connection.query("ROLLBACK");connection.release();}
});


test("missed call cleanup finalizes persisted signaling without an online browser",async()=>{
 const {cleanupExpiredCalls}=await import("../../src/server/call-push");
 const callId=randomUUID();
 await pool.query("insert into audio_calls(id,conversation_id,caller_id,callee_id,caller_client,offer,expires_at) values($1,$2,$3,$4,$5,'ephemeral offer',now()-interval '1 second')",[callId,group,owner,member,randomUUID()]);
 await pool.query("insert into notifications(user_id,actor_id,type,data) values($1,$2,'call',$3::jsonb)",[member,owner,JSON.stringify({callId,conversationId:group})]);
 await cleanupExpiredCalls();
 assert.equal((await pool.query("select count(*) from audio_calls where id=$1",[callId])).rows[0].count,"0");
 const notice=(await pool.query("select data from notifications where user_id=$1 and data->>'callId'=$2",[member,callId])).rows[0];
 assert.equal(notice.data.callOutcome,"missed");
});

test("call alerts are independent of message toggles and respect sender privacy and master push",async()=>{
 const {callPushDetail}=await import("../../src/server/call-push");
 const {getNotificationPreferences,updateNotificationPreferences}=await import("../../src/server/notification-preferences");
 const previous=await getNotificationPreferences(member);
 assert.equal(previous.pushNotifications,true,"New account push preference starts enabled");
 const conversation=randomUUID(),callId=randomUUID(),notice=randomUUID();
 await pool.query("insert into conversations(id,type,created_by_id) values($1,'dm',$2)",[conversation,owner]);
 for(const user of [owner,member])await pool.query("insert into conversation_members(conversation_id,user_id,accepted_at) values($1,$2,now())",[conversation,user]);
 await pool.query("insert into audio_calls(id,conversation_id,caller_id,callee_id,caller_client,offer,expires_at) values($1,$2,$3,$4,$5,'ephemeral',now()+interval '30 seconds')",[callId,conversation,owner,member,randomUUID()]);
 await pool.query("insert into notifications(id,user_id,actor_id,type,data) values($1,$2,$3,'call',$4::jsonb)",[notice,member,owner,JSON.stringify({callId,conversationId:conversation})]);
 try {
  await updateNotificationPreferences(member,{messageNotifications:false,showNotificationDetails:false});
  assert.equal((await getNotificationPreferences(member)).pushNotifications,true,"Changing other options preserves the push choice");
  assert.equal((await callPushDetail(notice,member))?.title,"Circlo");
  await updateNotificationPreferences(member,{showNotificationDetails:true});
  const caller=(await pool.query("select display_name from users where id=$1",[owner])).rows[0].display_name;
  assert.equal((await callPushDetail(notice,member))?.title,`${caller} · Circlo`);
  assert.equal(await callPushDetail(notice,outsider),null);
  await updateNotificationPreferences(member,{pushNotifications:false});
  assert.equal(await callPushDetail(notice,member),null);
 } finally {await updateNotificationPreferences(member,previous);}
});


test("group information policy, invitations and ownership transfer enforce role changes transactionally",async()=>{
 const invites=await import("../../src/server/group-invites");
 assert.equal(await chat.saveGroupSettings(group,member,{name:"denied"}),null);
 assert(await chat.saveGroupSettings(group,owner,{adminOnlyEditingInfo:false}));
 assert(await chat.saveGroupSettings(group,member,{name:"member-edited"}));
 assert.equal(await chat.saveGroupSettings(group,member,{adminOnlyAddingMembers:false}),null);
 await assert.rejects(invites.createGroupInviteLink(group,member));
 const link=await invites.createGroupInviteLink(group,owner);
 assert.equal(await invites.revokeGroupInviteLink(link.id,member,group),false);
 assert.equal(await chat.changeGroupRole(group,owner,extra,"admin"),"ok");
 assert.equal(await invites.revokeGroupInviteLink(link.id,extra,group),true);
 // Two requests by the old owner must not produce two owners.
 assert.equal(await chat.leaveGroup(group,owner),"owner_must_transfer");
 await chat.applyConversationControl(group,member,"mute");
 assert((await chat.getMembership(group,member))?.mutedAt);assert.equal((await chat.getMembership(group,owner))?.mutedAt,null);
 const results=await Promise.all([chat.transferGroupOwnership(group,owner,member),chat.transferGroupOwnership(group,owner,extra)]);
 assert.equal(results.filter(result=>result==="ok").length,1);
 assert.equal((await pool.query("select count(*) from conversation_members where conversation_id=$1 and role='owner'",[group])).rows[0].count,"1");
 const [current]=(await pool.query("select user_id from conversation_members where conversation_id=$1 and role='owner'",[group])).rows;
 assert.equal(await chat.transferGroupOwnership(group,current.user_id,owner),"ok");
 assert.equal(await chat.leaveGroup(group,another),"ok");
 assert.equal(await chat.getMembership(group,another),null);
});


test("delivery requires a recipient device acknowledgment, is owner-isolated and atomic",async()=>{
 const {acknowledgeDelivery}=await import("../../src/server/delivery");
 const conversation=randomUUID();await pool.query("insert into conversations(id,type,created_by_id) values($1,'dm',$2)",[conversation,owner]);
 try{
  for(const user of [owner,member])await pool.query("insert into conversation_members(conversation_id,user_id,accepted_at) values($1,$2,now())",[conversation,user]);
  const message=(await pool.query("insert into messages(conversation_id,sender_id,text,encrypted) values($1,$2,'opaque-device-envelope',true) returning id,delivered_at",[conversation,owner])).rows[0];assert.equal(message.delivered_at,null);
  const presence=await import("../../src/server/presence");await presence.addConnection(member);assert.equal((await pool.query("select delivered_at from messages where id=$1",[message.id])).rows[0].delivered_at,null,"Presence cannot imply delivery");await presence.removeConnection(member);
  assert.deepEqual(await acknowledgeDelivery(owner,[message.id]),[]);assert.deepEqual(await acknowledgeDelivery(outsider,[message.id]),[]);
  assert.deepEqual(await acknowledgeDelivery(member,[message.id]),[message.id]);const stamp=(await pool.query("select delivered_at from messages where id=$1",[message.id])).rows[0].delivered_at;
  assert(stamp);assert.deepEqual(await acknowledgeDelivery(member,[message.id]),[]);assert.equal((await pool.query("select delivered_at from messages where id=$1",[message.id])).rows[0].delivered_at.toISOString(),stamp.toISOString());
  assert.equal((await pool.query("select count(*)::int as n from realtime_events where user_id=$1 and payload->>'type'='message:delivered' and payload->>'conversationId'=$2",[owner,conversation])).rows[0].n,1);
  const expired=(await pool.query("insert into messages(conversation_id,sender_id,text,encrypted,expires_at) values($1,$2,'expired',true,now()-interval '1 second') returning id",[conversation,owner])).rows[0].id;assert.deepEqual(await acknowledgeDelivery(member,[expired]),[]);
 }finally{await pool.query("delete from conversations where id=$1",[conversation]);}
});

test("temporary rooms enforce one-time joins, device credentials, mutual extensions, replay safety and offline expiry",async()=>{
 const rooms=await import("../../src/server/temporary-rooms");const crypto=await import("../../src/lib/temporary-room-crypto");
 const host=await crypto.newRoomIdentity(),guest=await crypto.newRoomIdentity(),other=await crypto.newRoomIdentity(),code=crypto.newRoomCode(),id=randomUUID();
 const credential=()=>crypto.newRoomCode()+crypto.newRoomCode()+crypto.newRoomCode().slice(0,16);
 const hostCredential=credential(),guestCredential=credential(),otherCredential=credential(),second=randomUUID();
 try{
  const room=await rooms.createTemporaryRoom({id,inviteHash:await crypto.roomCodeHash(code),publicKey:host.publicKey,credential:hostCredential,minutes:30});
  assert.equal(room.role,"host");assert.equal(Math.round((Date.parse(room.expiresAt)-Date.parse(room.serverNow))/60000),30);
  const joins=await Promise.allSettled([rooms.joinTemporaryRoom({inviteHash:await crypto.roomCodeHash(code),publicKey:guest.publicKey,credential:guestCredential}),rooms.joinTemporaryRoom({inviteHash:await crypto.roomCodeHash(code),publicKey:other.publicKey,credential:otherCredential})]);
  assert.equal(joins.filter(result=>result.status==="fulfilled").length,1);const winner=joins[0].status==="fulfilled"?guestCredential:otherCredential;
  await assert.rejects(rooms.readTemporaryRoom(id,credential()),/unavailable/);
  const proposal=await rooms.actOnTemporaryRoom(id,hostCredential,{action:"extend",minutes:15});assert("extension" in proposal&&proposal.extension);
  if(!("extension" in proposal)||!proposal.extension)throw Error("Expected extension request");
  await assert.rejects(rooms.actOnTemporaryRoom(id,hostCredential,{action:"approve",requestId:proposal.extension.id}),/other person/);
  await rooms.actOnTemporaryRoom(id,winner,{action:"approve",requestId:proposal.extension.id});
  const extended=await rooms.readTemporaryRoom(id,hostCredential);assert.equal(Date.parse(extended.expiresAt)-Date.parse(room.expiresAt),15*60000);
  await assert.rejects(rooms.actOnTemporaryRoom(id,winner,{action:"approve",requestId:proposal.extension.id}),/no longer current/);
  const messageId=randomUUID(),ciphertext="AAAAAAAAAAAAAAAA."+"B".repeat(64);
  await rooms.actOnTemporaryRoom(id,hostCredential,{action:"message",messageId,ciphertext});await rooms.actOnTemporaryRoom(id,hostCredential,{action:"message",messageId,ciphertext});
  assert.equal((await pool.query("select count(*)::int as count from temporary_room_messages where room_id=$1",[id])).rows[0].count,1);
  assert.equal((await rooms.readTemporaryRoom(id,winner)).messages[0].ciphertext,ciphertext);
  const first=(await rooms.readTemporaryRoom(id,winner)).messages[0];
  assert.match(first.createdAt,/\.\d{6}Z$/);assert.equal((await rooms.readTemporaryRoom(id,winner,{at:first.createdAt,id:first.id})).messages.length,0,"Full-precision cursor must not replay its own last message");
  await Promise.all([rooms.actOnTemporaryRoom(id,hostCredential,{action:"message",messageId:randomUUID(),ciphertext}),rooms.actOnTemporaryRoom(id,winner,{action:"message",messageId:randomUUID(),ciphertext})]);
  assert.equal((await rooms.readTemporaryRoom(id,winner,{at:first.createdAt,id:first.id})).messages.length,2,"Concurrent commits cannot fall behind a delivered cursor");
  await assert.rejects(rooms.actOnTemporaryRoom(id,winner,{action:"message",messageId,ciphertext}),/already in use/);
  await rooms.actOnTemporaryRoom(id,winner,{action:"end"});await assert.rejects(rooms.readTemporaryRoom(id,hostCredential),/ended or expired/);
  assert.equal((await pool.query("select count(*)::int as count from temporary_room_messages where room_id=$1",[id])).rows[0].count,0);
  await rooms.createTemporaryRoom({id:second,inviteHash:await crypto.roomCodeHash(crypto.newRoomCode()),publicKey:host.publicKey,credential:hostCredential,minutes:5});
  await pool.query("update temporary_rooms set expires_at=now()-interval '1 second' where id=$1",[second]);
  await assert.rejects(rooms.readTemporaryRoom(second,hostCredential),/ended or expired/);await assert.rejects(rooms.actOnTemporaryRoom(second,hostCredential,{action:"extend",minutes:30}),/ended or expired/);
  await rooms.cleanupTemporaryRooms();assert.equal((await pool.query("select count(*)::int as count from temporary_rooms where id=$1",[second])).rows[0].count,0);
 }finally{await pool.query("delete from temporary_rooms where id=any($1::uuid[])",[[id,second]]);}
});

test("presence privacy enforces all audiences, contact direction, selected contacts and blocks",async()=>{
 const {canSeePresence,visiblePresenceIds}=await import("../../src/server/presence-privacy");
 assert.deepEqual(await visiblePresenceIds(member,[undefined as unknown as string,"invalid"]),[]);
 assert.deepEqual(await visiblePresenceIds("invalid",[another]),[]);
 try{
  await pool.query("insert into user_contacts(owner_id,contact_id) values($1,$2) on conflict do nothing",[another,member]);
  for(const [mode,selected,expected] of [["everyone",[],true],["contacts",[],true],["specific",[],false],["specific",[member],true],["nobody",[],false]] as const){
   await pool.query("insert into privacy_settings(user_id,last_seen_visibility,last_seen_contacts) values($1,$2,$3::jsonb) on conflict(user_id) do update set last_seen_visibility=$2,last_seen_contacts=$3::jsonb",[another,mode,JSON.stringify(selected)]);
   assert.equal(await canSeePresence(member,another),expected);assert.equal(await canSeePresence(another,another),true);
   if(mode!=="everyone")assert.equal(await canSeePresence(outsider,another),false);
  }
  await pool.query("update privacy_settings set last_seen_visibility='everyone' where user_id=$1",[another]);
  for(const [blocker,blocked] of [[another,member],[member,another]]){await pool.query("insert into blocks(blocker_id,blocked_id) values($1,$2)",[blocker,blocked]);assert.equal(await canSeePresence(member,another),false);await pool.query("delete from blocks where blocker_id=$1 and blocked_id=$2",[blocker,blocked]);}
 }finally{await pool.query("delete from privacy_settings where user_id=$1",[another]);await pool.query("delete from user_contacts where owner_id=$1",[another]);}
});

test("community counts, concurrent joins, roles and underlying group permissions are real",async()=>{
 const community=await import("../../src/server/communities");const created=await community.createCommunity({name:"Counted community",createdBy:owner});let channel:string|null=null;
 try{
  assert.equal((await community.listUserCommunities(owner)).find(row=>row.id===created.id)?.memberCount,1);
  await Promise.all([community.joinCommunity(created.id,member),community.joinCommunity(created.id,member)]);
  assert.equal((await community.getCommunity(created.id))?.memberCount,2);
  const group=await community.createChannel({communityId:created.id,name:"Private group",type:"announcement",createdBy:owner});channel=group.conversationId;
  assert(channel);assert.equal((await chat.getConversationForUser(channel,member))?.adminOnlyMessaging,true);
  await assert.rejects(community.createChannel({communityId:created.id,name:"Denied",createdBy:member}),/forbidden/);
  assert.equal(await community.manageCommunity(created.id,member,{action:"role",userId:owner,role:"member"}),false);
  assert.equal(await community.manageCommunity(created.id,owner,{action:"role",userId:member,role:"admin"}),true);
  assert.equal((await chat.getMembership(channel,member))?.role,"admin");
  assert.equal(await community.manageCommunity(created.id,member,{action:"remove",userId:owner}),false);
  assert.equal(await community.manageCommunity(created.id,owner,{action:"edit",description:"Be kind. Keep discussions relevant."}),true);
  assert.equal((await community.getCommunity(created.id))?.description,"Be kind. Keep discussions relevant.");
  assert.equal(await community.leaveCommunity(created.id,owner),false);
  assert.equal(await community.manageCommunity(created.id,member,{action:"transfer",userId:owner}),false);
  assert.equal(await community.manageCommunity(created.id,owner,{action:"transfer",userId:member}),true);
  assert.equal((await community.getCommunityMembership(created.id,member))?.role,"owner");
  assert.equal(await community.manageCommunity(created.id,member,{action:"transfer",userId:owner}),true);
  assert.equal(await community.leaveCommunity(created.id,member),true);assert.equal(await chat.getMembership(channel,member),null);
  assert.equal((await community.getCommunity(created.id))?.memberCount,1);
 }finally{await pool.query("delete from communities where id=$1",[created.id]);if(channel)await pool.query("delete from conversations where id=$1",[channel]);}
});

test("disappearing policy changes create one authoritative notice for both members",async()=>{
 const conversation=randomUUID();await pool.query("insert into conversations(id,type,created_by_id) values($1,'dm',$2)",[conversation,owner]);
 try{
  for(const user of [owner,member])await pool.query("insert into conversation_members(conversation_id,user_id,accepted_at) values($1,$2,now())",[conversation,user]);
  assert.equal(await chat.setDisappearingMessages(conversation,outsider,86400),false);
  assert.equal(await chat.setDisappearingMessages(conversation,owner,86400),true);
  assert.equal(await chat.setDisappearingMessages(conversation,owner,86400),true);
  const notice=(await pool.query("select id,text,encrypted from messages where conversation_id=$1 and type='system'",[conversation])).rows;
  assert.equal(notice.length,1);assert.match(notice[0].text,/24 hours/);assert.equal(notice[0].encrypted,false,"Only fixed policy metadata is plaintext");
  assert.equal(await chat.editMessage(notice[0].id,owner,"forged notice",false),"forbidden");
  for(const user of [owner,member])assert.equal((await pool.query("select count(*)::int as n from realtime_events where user_id=$1 and payload->>'type'='message:new' and payload->>'conversationId'=$2",[user,conversation])).rows[0].n,1);
  assert.equal(await chat.setDisappearingMessages(conversation,member,0),true);
  assert.equal((await pool.query("select disappearing_seconds from conversations where id=$1",[conversation])).rows[0].disappearing_seconds,0);
 }finally{await pool.query("delete from conversations where id=$1",[conversation]);}
});
