import assert from 'node:assert/strict';

/** Reload the real chat while its original ciphertext decrypt is deliberately
 * held. The authenticated device cache must render the saved text independently. */
export async function testCachedChatHistory(page, userId, conversationId, message, plaintext) {
 const key=`${userId}:${conversationId}:${message.id}`;
 const deadline=Date.now()+10000;let persisted=false;
 while(Date.now()<deadline){
  persisted=await page.evaluate(async key=>{
   const db=await new Promise((resolve,reject)=>{const request=indexedDB.open('circlo-verified-message-cache',1);request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
   try{return await new Promise(resolve=>{if(!db.objectStoreNames.contains('messages'))return resolve(false);const request=db.transaction('messages').objectStore('messages').get(key);request.onsuccess=()=>resolve(Boolean(request.result?.ciphertext));});}finally{db.close();}
  },key);
  if(persisted)break;await page.waitForTimeout(100);
 }
 assert(persisted,'Verified history must be persisted before the reload test');
 const target=[...Buffer.from(message.text,'base64').subarray(12)];
 await page.addInitScript(target=>{
  if(sessionStorage.getItem('hold-history-decrypt')!=='1')return;
  sessionStorage.removeItem('hold-history-decrypt');
  const original=crypto.subtle.decrypt.bind(crypto.subtle);let release;
  const gate=new Promise(resolve=>release=resolve);window.historyDecryptCompleted=false;
  window.releaseHistoryDecrypt=()=>{release();crypto.subtle.decrypt=original;};
  crypto.subtle.decrypt=async function(algorithm,key,data){
   const bytes=ArrayBuffer.isView(data)?new Uint8Array(data.buffer,data.byteOffset,data.byteLength):new Uint8Array(data);
   const held=algorithm.name==='AES-GCM'&&!algorithm.additionalData&&bytes.length===target.length&&target.every((byte,index)=>bytes[index]===byte);
   if(held)await gate;
   const result=await original(algorithm,key,data);if(held)window.historyDecryptCompleted=true;return result;
  };
 },target);
 await page.evaluate(()=>sessionStorage.setItem('hold-history-decrypt','1'));
 try{
  await page.reload();
  await page.getByRole('region',{name:'Messages',exact:true}).getByText(plaintext,{exact:true}).waitFor();
  assert.equal(await page.evaluate(()=>window.historyDecryptCompleted),false,'Saved text renders before original ciphertext decryption completes');
 }finally{await page.evaluate(()=>window.releaseHistoryDecrypt?.());}
 console.log('PASS: real chat reload displays authenticated cached text while original ciphertext decryption is held');
}
