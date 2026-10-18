import { createHash, createPublicKey, timingSafeEqual } from "node:crypto";
import type { PoolClient } from "pg";
import { pool } from "@/db";
export type RoomRole="host"|"guest";
export class TemporaryRoomError extends Error {constructor(public status:number,message:string){super(message);}}
type Room={id:string;invite_hash:string;host_credential_hash:string;guest_credential_hash:string|null;host_public_key:string;guest_public_key:string|null;created_at:Date;expires_at:Date;extension_id:string|null;extension_by:RoomRole|null;extension_minutes:number|null;extension_at:Date|null};
export const credentialHash=(value:string)=>createHash("sha256").update(value).digest("hex");
export const roomCookie=(id:string,role:RoomRole)=>`circlo-room-${id}-${role}`;
const equal=(a:string,b:string)=>a.length===b.length&&timingSafeEqual(Buffer.from(a),Buffer.from(b));
function publicKey(value:string){try{if(value.length>200)throw Error();const key=createPublicKey({key:Buffer.from(value,"base64"),format:"der",type:"spki"});if(key.asymmetricKeyType!=="ec"||key.asymmetricKeyDetails?.namedCurve!=="prime256v1")throw Error();}catch{throw new TemporaryRoomError(422,"Invalid room encryption identity.");}}
function roleFor(room:Room,credential:string):RoomRole {const hash=credentialHash(credential);if(equal(room.host_credential_hash,hash))return "host";if(room.guest_credential_hash&&equal(room.guest_credential_hash,hash))return "guest";throw new TemporaryRoomError(404,"Room unavailable or expired.");}
export async function authorizeTemporaryRoom(id:string,credential:string){const room=(await pool.query<Room>("SELECT * FROM temporary_rooms WHERE id=$1 AND expires_at>now()",[id])).rows[0];if(!room)throw new TemporaryRoomError(410,"This room has ended or expired.");return roleFor(room,credential);}
async function transaction<T>(work:(client:PoolClient)=>Promise<T>):Promise<T>{const client=await pool.connect();try{await client.query("BEGIN");await client.query("SET LOCAL lock_timeout='3s'");await client.query("SET LOCAL statement_timeout='10s'");const result=await work(client);await client.query("COMMIT");return result;}catch(error){await client.query("ROLLBACK");throw error;}finally{client.release();}}
async function changed(client:PoolClient,id:string){await client.query("SELECT pg_notify('circlo_temporary',$1)",[id]);}
function presentation(room:Room,role:RoomRole,now:Date){return {id:room.id,role,hostPublicKey:room.host_public_key,guestPublicKey:room.guest_public_key,expiresAt:room.expires_at.toISOString(),serverNow:now.toISOString(),extension:room.extension_id&&room.extension_at&&now.getTime()-room.extension_at.getTime()<60000?{id:room.extension_id,by:room.extension_by,minutes:room.extension_minutes}:null};}
export async function createTemporaryRoom(input:{id:string;inviteHash:string;publicKey:string;credential:string;minutes:number}) {
 publicKey(input.publicKey);
 return transaction(async client=>{
  await client.query("SELECT pg_advisory_xact_lock(847221911)");
  const active=(await client.query("SELECT count(*)::int AS count FROM temporary_rooms WHERE expires_at>now() AND id<>$1",[input.id])).rows[0].count;
  if(active>=20)throw new TemporaryRoomError(429,"Temporary rooms are busy. Please try again later.");
  await client.query("INSERT INTO temporary_rooms(id,invite_hash,host_credential_hash,host_public_key,expires_at) VALUES($1,$2,$3,$4,now()+$5*interval '1 minute') ON CONFLICT(id) DO NOTHING",[input.id,input.inviteHash,credentialHash(input.credential),input.publicKey,input.minutes]);
  const room=(await client.query<Room>("SELECT * FROM temporary_rooms WHERE id=$1 AND expires_at>now() FOR UPDATE",[input.id])).rows[0];
  if(!room||roleFor(room,input.credential)!=="host"||room.invite_hash!==input.inviteHash||room.host_public_key!==input.publicKey)throw new TemporaryRoomError(409,"Create a new room and try again.");
  return presentation(room,"host",new Date());
 });
}
export async function joinTemporaryRoom(input:{inviteHash:string;publicKey:string;credential:string}) {
 publicKey(input.publicKey);
 return transaction(async client=>{
  const room=(await client.query<Room>("SELECT * FROM temporary_rooms WHERE invite_hash=$1 AND expires_at>now() FOR UPDATE",[input.inviteHash])).rows[0];
  if(!room)throw new TemporaryRoomError(404,"Code unavailable, used or expired.");
  if(room.guest_public_key){if(room.guest_public_key!==input.publicKey||roleFor(room,input.credential)!=="guest")throw new TemporaryRoomError(409,"This one-time code has already been used.");}
  else {const updated=(await client.query<Room>("UPDATE temporary_rooms SET guest_public_key=$2,guest_credential_hash=$3 WHERE id=$1 RETURNING *",[room.id,input.publicKey,credentialHash(input.credential)])).rows[0];Object.assign(room,updated);await changed(client,room.id);}
  return presentation(room,"guest",new Date());
 });
}
export async function readTemporaryRoom(id:string,credential:string,after?:{at:string;id:string}) {
 return transaction(async client=>{
  const room=(await client.query<Room>("SELECT * FROM temporary_rooms WHERE id=$1 AND expires_at>now() FOR SHARE",[id])).rows[0];
  if(!room)throw new TemporaryRoomError(410,"This room has ended or expired.");
  const role=roleFor(room,credential);
  const candidates=(await client.query<{id:string;bytes:number}>(`SELECT id,octet_length(ciphertext) AS bytes FROM temporary_room_messages WHERE room_id=$1 AND ($2::timestamptz IS NULL OR (created_at,id)>($2::timestamptz,$3::uuid)) ORDER BY created_at,id LIMIT 50`,[id,after?.at??null,after?.id??null])).rows;
  const ids:string[]=[];let bytes=0;for(const row of candidates){if(bytes+row.bytes>12000000)break;ids.push(row.id);bytes+=row.bytes;}
  const messages=(await client.query<{id:string;sender:RoomRole;ciphertext:string;createdAt:string}>(`SELECT id,sender,ciphertext,to_char(created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS "createdAt" FROM temporary_room_messages WHERE room_id=$1 AND id=ANY($2::uuid[]) ORDER BY created_at,id`,[id,ids])).rows;
  return {...presentation(room,role,new Date()),messages,hasMore:ids.length<candidates.length||candidates.length===50};
 });
}
export async function actOnTemporaryRoom(id:string,credential:string,input:{action:string;messageId?:string;ciphertext?:string;minutes?:number;requestId?:string}) {
 return transaction(async client=>{
  const room=(await client.query<Room>("SELECT * FROM temporary_rooms WHERE id=$1 AND expires_at>now() FOR UPDATE",[id])).rows[0];
  if(!room)throw new TemporaryRoomError(410,"This room has ended or expired.");const role=roleFor(room,credential);
  if(input.action==="end"){await client.query("DELETE FROM temporary_rooms WHERE id=$1",[id]);await changed(client,id);return {ended:true};}
  if(input.action==="message"){
   if(!room.guest_public_key)throw new TemporaryRoomError(409,"Wait for the other person to join.");
   const existing=(await client.query("SELECT sender,ciphertext FROM temporary_room_messages WHERE room_id=$1 AND id=$2",[id,input.messageId])).rows[0];
   if(existing){if(existing.sender!==role||existing.ciphertext!==input.ciphertext)throw new TemporaryRoomError(409,"Message identifier is already in use.");return {sent:true};}
   const size=(await client.query("SELECT count(*)::int AS count,coalesce(sum(octet_length(ciphertext)),0)::bigint AS bytes FROM temporary_room_messages WHERE room_id=$1",[id])).rows[0];
   if(size.count>=2000||Number(size.bytes)+(input.ciphertext?.length??0)>20*1024*1024)throw new TemporaryRoomError(413,"This room reached its temporary storage limit. End it and create a new room.");
   await client.query("INSERT INTO temporary_room_messages(id,room_id,sender,ciphertext,created_at) VALUES($1,$2,$3,$4,greatest(clock_timestamp(),coalesce((select max(created_at)+interval '1 microsecond' from temporary_room_messages where room_id=$2),clock_timestamp())))",[input.messageId,id,role,input.ciphertext]);await changed(client,id);return {sent:true};
  }
  if(input.action==="extend"){
   const updated=(await client.query<Room>("UPDATE temporary_rooms SET extension_id=gen_random_uuid(),extension_by=$2,extension_minutes=$3,extension_at=now() WHERE id=$1 RETURNING *",[id,role,input.minutes])).rows[0];await changed(client,id);return presentation(updated,role,new Date());
  }
  if(!room.extension_id||input.requestId!==room.extension_id||!room.extension_at||Date.now()-room.extension_at.getTime()>60000)throw new TemporaryRoomError(409,"This extension request is no longer current.");
  if(input.action==="approve"){
   if(room.extension_by===role)throw new TemporaryRoomError(403,"The other person must approve extra time.");
   const updated=(await client.query<Room>("UPDATE temporary_rooms SET expires_at=least(expires_at+extension_minutes*interval '1 minute',created_at+interval '24 hours'),extension_id=NULL,extension_by=NULL,extension_minutes=NULL,extension_at=NULL WHERE id=$1 RETURNING *",[id])).rows[0];await changed(client,id);return presentation(updated,role,new Date());
  }
  if(input.action==="reject"){await client.query("UPDATE temporary_rooms SET extension_id=NULL,extension_by=NULL,extension_minutes=NULL,extension_at=NULL WHERE id=$1",[id]);await changed(client,id);return {cancelled:true};}
  throw new TemporaryRoomError(422,"Unsupported room action.");
 });
}
export async function cleanupTemporaryRooms(){const result=await pool.query("WITH due AS (SELECT id FROM temporary_rooms WHERE expires_at<=now() ORDER BY expires_at LIMIT 100 FOR UPDATE SKIP LOCKED) DELETE FROM temporary_rooms r USING due WHERE r.id=due.id RETURNING r.id");return result.rowCount??0;}
