import assert from 'node:assert/strict';
import {randomUUID,randomBytes,createHash} from 'node:crypto';
import {generateKeyPair,exportPublicKey,exportPrivateKey,encryptPrivateKeyForStorage,decryptPrivateKeyFromStorage,importPrivateKey,decryptKeyFromSender,decryptMessage} from '../src/lib/crypto.ts';

/** Owned loopback fixture: replace a peer device, retaining its actual old AES keys. */
export async function testDmDeviceRotation(base,pool,owner,peer,sender,recipient,conversationId,baseline){
 assert.equal(new URL(base).hostname,'127.0.0.1');
 const local=await recipient.evaluate(id=>{const device=localStorage.getItem('e2ee_device_id');return {device,pair:localStorage.getItem(`e2ee_keypair_${id}`),secret:localStorage.getItem(`e2ee_recovery_${id}_${device}`)};},peer.id);
 const old=JSON.parse(local.pair);assert(old.encryptedPrivateKey.startsWith('v2:')&&local.secret);
 const privateKey=await importPrivateKey(await decryptPrivateKeyFromStorage(old.encryptedPrivateKey.slice(3),local.secret));
 const wraps=(await pool.query('select encrypted_key from e2ee_conversation_keys where conversation_id=$1 and user_id=$2 and recipient_device_id=$3',[conversationId,peer.id,local.device])).rows;
 const oldKeys=await Promise.all(wraps.map(row=>decryptKeyFromSender(row.encrypted_key,privateKey)));
 const before=(await pool.query('select id,text from messages where conversation_id=$1 and sender_id=$2 order by created_at desc limit 1',[conversationId,owner.id])).rows[0];
 const countBefore=(await pool.query('select count(*)::int n from messages where conversation_id=$1',[conversationId])).rows[0].n;
 assert((await Promise.all(oldKeys.map(key=>decryptMessage(before.text,key).catch(()=>null)))).includes(baseline),'Retained keys genuinely decrypt the baseline');
 await recipient.close();
 const replacement=await generateKeyPair(),publicKey=await exportPublicKey(replacement.publicKey),device='replacement-'+randomUUID();
 const encrypted='v2:'+await encryptPrivateKeyForStorage(await exportPrivateKey(replacement.privateKey),randomBytes(32).toString('hex'));
 const prior=(await pool.query('select trusted_at from e2ee_keys where user_id=$1 and device_id=$2',[peer.id,local.device])).rows[0].trusted_at;
 try{
  await pool.query('update e2ee_keys set trusted_at=null where user_id=$1 and device_id=$2',[peer.id,local.device]);
  await pool.query('insert into e2ee_keys(user_id,device_id,public_key,encrypted_private_key,trusted_at) values($1,$2,$3,$4,now())',[peer.id,device,publicKey,encrypted]);
  const text='DM after explicit replacement verification';
  await sender.getByRole('textbox',{name:'Message text',exact:true}).fill(text);await sender.getByRole('textbox',{name:'Message text',exact:true}).press('Enter');
  await sender.getByRole('button').filter({hasText:'Confirm this is still them before you send.'}).click();
  assert.equal((await pool.query('select count(*)::int n from messages where conversation_id=$1',[conversationId])).rows[0].n,countBefore,'Device change blocks sending before explicit review');
  const review=sender.getByRole('dialog',{name:'Check the safety numbers',exact:true});await review.waitFor();
  assert.equal((await review.getByLabel('Participant check number').textContent()).trim(),createHash('sha256').update(publicKey).digest('hex'));
  const approve=review.getByRole('button',{name:'Approve',exact:true});assert.equal(await approve.isEnabled(),false);
  const accepted=sender.waitForResponse(r=>r.url().endsWith(`/api/conversations/${conversationId}/messages`)&&r.request().method()==='POST');
  await review.getByRole('checkbox').check();await approve.click();assert.equal((await accepted).status(),201);
  const after=(await pool.query('select id,text from messages where conversation_id=$1 and sender_id=$2 order by created_at desc limit 1',[conversationId,owner.id])).rows[0];
  assert.notEqual(after.id,before.id);
  assert((await Promise.all(oldKeys.map(key=>decryptMessage(after.text,key).catch(()=>null)))).every(value=>value===null),'Removed device retains no usable key for the new message');
  const next=(await pool.query('select encrypted_key from e2ee_conversation_keys where conversation_id=$1 and user_id=$2 and recipient_device_id=$3',[conversationId,peer.id,device])).rows;
  assert(next.length>0);const current=await Promise.all(next.map(row=>decryptKeyFromSender(row.encrypted_key,replacement.privateKey)));
  assert((await Promise.all(current.map(key=>decryptMessage(after.text,key).catch(()=>null)))).includes(text),'Replacement can open the new epoch');
  assert((await Promise.all(current.map(key=>decryptMessage(before.text,key).catch(()=>null)))).every(value=>value===null),'Peer replacement approval does not grant prior history');
  console.log('PASS actual DM device replacement: explicit fingerprint review, pre-approval send blocked, retained old keys excluded, replacement decrypts new epoch without old history');
 }finally{await pool.query('delete from e2ee_keys where user_id=$1 and device_id=$2',[peer.id,device]);await pool.query('update e2ee_keys set trusted_at=$3 where user_id=$1 and device_id=$2',[peer.id,local.device,prior]);}
}
