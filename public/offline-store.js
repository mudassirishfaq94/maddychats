// Device-encrypted offline data shared by the app and public shell. Never E2EE private keys.
let damagedRecord=false;
export function offlineStorageWarning(){return damagedRecord?"Some saved data could not be read. Reconnect to restore your conversation history.":null;}
const epochs=new Map();
const active = "circlo:offline-account";
const uuid = /^[0-9a-f]{8}-[0-9a-f-]{27}$/i;
function database(userId) {
  if (!uuid.test(userId)) throw new Error("Open Circlo online first.");
  return new Promise((resolve, reject) => {
    const r = indexedDB.open(`circlo-compose:${userId}`, 1);
    r.onupgradeneeded = () => { r.result.createObjectStore("records"); r.result.createObjectStore("keys"); };
    r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error);
  });
}
function request(db, store, mode, run) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, mode); const r = run(tx.objectStore(store));
    tx.oncomplete = () => resolve(r.result); tx.onerror = tx.onabort = () => reject(tx.error);
  });
}
async function deviceKey(db) {
  const old = await request(db,"keys","readonly",s=>s.get("device")); if(old)return old;
  const key = await crypto.subtle.generateKey({name:"AES-GCM",length:256},false,["encrypt","decrypt"]);
  try { await request(db,"keys","readwrite",s=>s.add(key,"device")); return key; }
  catch { const winner=await request(db,"keys","readonly",s=>s.get("device"));if(!winner)throw new Error("Device storage unavailable.");return winner; }
}
async function write(userId,id,value) {
  const epoch=epochs.get(userId)??0;const db=await database(userId);
  try { const iv=crypto.getRandomValues(new Uint8Array(12));const ciphertext=await crypto.subtle.encrypt({name:"AES-GCM",iv,additionalData:new TextEncoder().encode(id)},await deviceKey(db),new TextEncoder().encode(JSON.stringify(value)));
    if((epochs.get(userId)??0)===epoch)await request(db,"records","readwrite",s=>s.put({id,iv,ciphertext},id));
  } finally {db.close();}
}
async function readGroups(userId,prefixes) {
  const db=await database(userId);
  try {
    const [groups,key]=await Promise.all([Promise.all(prefixes.map(prefix=>request(db,"records","readonly",s=>s.getAll(IDBKeyRange.bound(prefix,prefix+"\uffff"))))),deviceKey(db)]);
    return await Promise.all(groups.map(async records=>{const result=[];for(const r of records){try{const bytes=await crypto.subtle.decrypt({name:"AES-GCM",iv:r.iv,additionalData:new TextEncoder().encode(r.id)},key,r.ciphertext);result.push(JSON.parse(new TextDecoder().decode(bytes)));}catch{damagedRecord=true;}}return result;}));
  } finally {db.close();}
}
async function read(userId,prefix){return (await readGroups(userId,[prefix]))[0];}
export function activeAccount(){try{return typeof localStorage==="undefined"?null:localStorage.getItem(active);}catch{return null;}}
export async function rememberChats(userId,chats){const epoch=epochs.get(userId)??0;await write(userId,"contacts",chats);if((epochs.get(userId)??0)===epoch)localStorage.setItem(active,userId);}
export function chatLocked(id){try{const ids=JSON.parse(localStorage.getItem("maddy:locked-chats")??"[]");return !Array.isArray(ids)||ids.some(value=>typeof value!=="string")||ids.includes(id);}catch{return true;}}
export async function offlineChats(userId){const [previewRows,contacts]=await readGroups(userId,["preview:","contacts"]);const previews=new Map(previewRows.map(value=>[value.conversationId,value]));return (contacts[0]??[]).map(chat=>chatLocked(chat.id)?{id:chat.id,name:"Locked chat",locked:true}:{...chat,preview:previews.get(chat.id)});}
const historyWork=new Map();
export async function rememberHistory(userId,conversationId,messages,replace=false,removedIds=[]){
  const epoch=epochs.get(userId)??0;const id="history:"+conversationId,queueId=userId+":"+id;
  const previous=historyWork.get(queueId)??Promise.resolve();
  const work=previous.catch(()=>{}).then(async()=>{
    if(chatLocked(conversationId)||(epochs.get(userId)??0)!==epoch)return;
    const old=(await read(userId,id))[0]??{messages:[]};
    const merged=new Map(replace?[]:old.messages.map(message=>[message.id,message]));
    for(const removedId of removedIds)merged.delete(removedId);
    for(const message of messages){
      if(!uuid.test(message.id))continue;
      // Ephemeral bodies and media bytes never enter persistent offline history.
      merged.set(message.id,{id:message.id,senderId:message.senderId,senderName:message.senderName,createdAt:message.createdAt,kind:message.kind,text:message.kind==="message"?message.text.slice(0,2000):"",mine:message.mine===true});
    }
    const rows=[...merged.values()].sort((a,b)=>a.createdAt.localeCompare(b.createdAt)).slice(-500);
    if(!chatLocked(conversationId)&&(epochs.get(userId)??0)===epoch){
      await write(userId,id,{messages:rows,syncedAt:new Date().toISOString()});
      const last=rows.at(-1);if(last&&!chatLocked(conversationId)&&(epochs.get(userId)??0)===epoch)await write(userId,"preview:"+conversationId,{conversationId,text:last.text,kind:last.kind,createdAt:last.createdAt});
      else if(!last){const db=await database(userId);try{await request(db,"records","readwrite",s=>s.delete("preview:"+conversationId));}finally{db.close();}}
    }
  });
  historyWork.set(queueId,work);try{await work;}finally{if(historyWork.get(queueId)===work)historyWork.delete(queueId);}
}
export async function offlineHistory(userId,conversationId){if(chatLocked(conversationId))return {messages:[]};const result=(await read(userId,"history:"+conversationId))[0]??{messages:[]};return chatLocked(conversationId)?{messages:[]}:result;}
export async function forgetHistory(userId,conversationId){await historyWork.get(userId+":history:"+conversationId)?.catch(()=>{});const db=await database(userId);try{await request(db,"records","readwrite",s=>s.delete("history:"+conversationId));await request(db,"records","readwrite",s=>s.delete("preview:"+conversationId));}finally{db.close();}}
export async function enqueueText(userId,conversationId,text){
  if(chatLocked(conversationId)||activeAccount()!==userId||!uuid.test(conversationId)||!text.trim()||text.length>2000)throw new Error("Message could not be queued.");
  const entry={id:crypto.randomUUID(),conversationId,text:text.trim(),createdAt:new Date().toISOString()};await write(userId,"queue:"+entry.id,entry);return entry;
}
function chatDatabase(userId){
  return new Promise((resolve,reject)=>{const r=indexedDB.open(`circlo-outbox:${userId}`);r.onupgradeneeded=()=>{for(const name of ["keys","messages"])if(!r.result.objectStoreNames.contains(name))r.result.createObjectStore(name);};r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
}
async function chatQueue(userId){
  const db=await chatDatabase(userId);
  try {const key=await request(db,"keys","readonly",s=>s.get("device"));if(!key)return [];const records=await request(db,"messages","readonly",s=>s.getAll());const entries=[];
    for(const r of records){if(r.id.startsWith("draft:"))continue;try{const bytes=await crypto.subtle.decrypt({name:"AES-GCM",iv:r.iv,additionalData:new TextEncoder().encode(r.id)},key,r.ciphertext);const entry=JSON.parse(new TextDecoder().decode(bytes));
      if(entry.message?.senderId===userId&&!entry.message.selfDestruct&&uuid.test(entry.message.clientMessageId)&&typeof entry.plain==="string")entries.push({id:entry.message.clientMessageId,conversationId:entry.message.conversationId,text:entry.plain,createdAt:entry.message.createdAt,replyToMessageId:entry.message.replyToMessageId,failed:entry.message.sendStatus==="failed",reason:entry.message.queueReason,source:"chat"});
    }catch{damagedRecord=true;}}return entries;
  }finally{db.close();}
}
export async function queuedTexts(userId){return [...(await read(userId,"queue:")).map(entry=>({...entry,source:"offline",replyToMessageId:null})),...await chatQueue(userId)].sort((a,b)=>a.createdAt.localeCompare(b.createdAt));}
export async function removeText(userId,id){
  const originals=(await chatQueue(userId)).filter(entry=>entry.id===id);
  const db=await database(userId);try{await request(db,"records","readwrite",s=>s.delete("queue:"+id));}finally{db.close();}
  if(originals.length){const legacy=await chatDatabase(userId);try{for(const entry of originals)await request(legacy,"messages","readwrite",s=>s.delete(`${entry.conversationId}:${id}`));}finally{legacy.close();}}
}
export async function forgetOffline(userId){
  epochs.set(userId,(epochs.get(userId)??0)+1);
  if(activeAccount()===userId)localStorage.removeItem(active);
  const chat=await chatDatabase(userId);try{await request(chat,"messages","readwrite",s=>s.clear());await request(chat,"keys","readwrite",s=>s.clear());}finally{chat.close();}
  const db=await database(userId);try{await request(db,"records","readwrite",s=>s.clear());await request(db,"keys","readwrite",s=>s.clear());}finally{db.close();}
}

const draftWork=new Map();
export async function saveOfflineDraft(userId,conversationId,text){
  const id="draft:"+conversationId,queueId=userId+":"+id,epoch=epochs.get(userId)??0;
  const work=(draftWork.get(queueId)??Promise.resolve()).catch(()=>{}).then(async()=>{
    if(chatLocked(conversationId)||(epochs.get(userId)??0)!==epoch)return;
    const db=await chatDatabase(userId);try{
      if(!text){await request(db,"messages","readwrite",s=>s.delete(id));return;}
      const iv=crypto.getRandomValues(new Uint8Array(12));const ciphertext=await crypto.subtle.encrypt({name:"AES-GCM",iv,additionalData:new TextEncoder().encode(id)},await deviceKey(db),new TextEncoder().encode(text.slice(0,2000)));
      if(!chatLocked(conversationId)&&(epochs.get(userId)??0)===epoch)await request(db,"messages","readwrite",s=>s.put({id,iv,ciphertext},id));
    }finally{db.close();}
  });draftWork.set(queueId,work);try{await work;}finally{if(draftWork.get(queueId)===work)draftWork.delete(queueId);}
}
export async function offlineDraft(userId,conversationId){
  if(chatLocked(conversationId))return "";await draftWork.get(userId+":draft:"+conversationId)?.catch(()=>{});
  const db=await chatDatabase(userId);try{const record=await request(db,"messages","readonly",s=>s.get("draft:"+conversationId));if(!record)return "";const key=await request(db,"keys","readonly",s=>s.get("device"));if(!key)return "";const bytes=await crypto.subtle.decrypt({name:"AES-GCM",iv:record.iv,additionalData:new TextEncoder().encode(record.id)},key,record.ciphertext);return chatLocked(conversationId)?"":new TextDecoder().decode(bytes);}finally{db.close();}
}
