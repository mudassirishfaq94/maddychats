import assert from "node:assert/strict";
import { randomUUID, randomBytes } from "node:crypto";
import { Pool } from "pg";

async function main() {
  const url=process.env.ITEM456_TEST_DATABASE_URL;
  assert(url && new URL(url).hostname==="127.0.0.1" && new URL(url).pathname.endsWith("_test"));
  process.env.DATABASE_URL=url;
  const sql=new Pool({connectionString:url});
  const {pool}=await import("../src/db");
  const {createMessage}=await import("../src/server/chat");
  const {findUserById,toSafeUser}=await import("../src/server/users");
  const owned:string[]=[];let conversation:string|undefined;
  try {
    const tag="sendqa_"+randomBytes(5).toString("hex");
    for(const suffix of ["a","b"])owned.push((await sql.query("insert into users(username,display_name,email,password_hash,email_verified_at) values($1,$1,$2,'not-a-login-password',now()) returning id",[tag+suffix,tag+suffix+"@example.invalid"])).rows[0].id);
    conversation=(await sql.query("insert into conversations(type,created_by_id) values('dm',$1) returning id",[owned[0]])).rows[0].id;
    await sql.query("insert into conversation_members(conversation_id,user_id,accepted_at) values($1,$2,now()),($1,$3,now())",[conversation, ...owned]);
    const clientMessageId=randomUUID();const sender=toSafeUser((await findUserById(owned[0]))!);
    const options={clientMessageId,sender,realtimeRecipients:owned};
    const results=await Promise.all(Array.from({length:6},()=>createMessage(conversation!,owned[0],"opaque-encrypted-packet",null,false,true,options)));
    assert.equal(results.filter(r=>r.created).length,1);
    assert.equal(new Set(results.map(r=>r.message.id)).size,1);
    const rows=(await sql.query("select payload from realtime_events where payload->>'conversationId'=$1 and payload->>'type'='message:new'",[conversation])).rows;
    assert.equal(rows.length,2);assert(rows.every(r=>r.payload.message.encrypted && r.payload.message.sender.id===owned[0] && !r.payload.message.sender.email));
    await sql.query("insert into message_reads(message_id,user_id,read_at) values($1,$2,now())",[results[0].message.id,owned[1]]);
    const retry=await createMessage(conversation!,owned[0],"different-retry-packet",null,false,true,options);
    assert.equal(retry.created,false);assert.equal(retry.message.text,"opaque-encrypted-packet");assert.equal(retry.message.readBy.length,1);
    console.log("Atomic message/event commit passed: concurrent retries persist one message, one event per member, ciphertext and accurate retry receipts.");
  } finally {
    if(conversation)await sql.query("delete from conversations where id=$1 and created_by_id=$2",[conversation,owned[0]]);
    for(const id of owned)await sql.query("delete from users where id=$1 and username like 'sendqa_%'",[id]);
    await sql.end();await pool.end();
  }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
