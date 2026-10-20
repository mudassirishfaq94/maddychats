import assert from "node:assert/strict";
import {test} from "node:test";
import {offlineHistoryRows} from "../src/lib/offline-history";
import type {MessageDTO} from "../src/lib/types";
const message=(extra:Partial<MessageDTO>={}):MessageDTO=>({id:"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",senderId:"me",sender:{displayName:"Alex"},createdAt:"2026-10-19T12:00:00Z",encrypted:true,text:"ciphertext",type:"text",expiresAt:null,...extra} as MessageDTO);
test("offline history includes only successfully decrypted regular messages and minimal fields",()=>{
 const row=message();const result=offlineHistoryRows([row],new Map([[row.id,"Ready at six"]]),"me");assert.equal(result[0].text,"Ready at six");assert.equal(result[0].mine,true);assert.equal("replyTo" in result[0],false);assert.equal("attachments" in result[0],false);
 assert.deepEqual(offlineHistoryRows([row],new Map(),"me"),[]);
 assert.deepEqual(offlineHistoryRows([message({sendStatus:"queued"})],new Map([[row.id,"pending"]]),"me"),[]);
});
test("self-destruct, disappearing, deleted and media content cannot enter offline history",()=>{
 const row=message();for(const extra of [{selfDestruct:true},{expiresAt:"2026-10-20T12:00:00Z"},{deletedAt:"2026-10-19T12:00:01Z"},{type:"image"}]){const result=offlineHistoryRows([message(extra)],new Map([[row.id,"PRIVATE CONTENT"]]),"me");assert.equal(result[0].text,"");assert(!JSON.stringify(result).includes("PRIVATE CONTENT"));}
 assert.equal(offlineHistoryRows([row],new Map([[row.id,"private"]]),"me",true)[0].text,"");
 assert.deepEqual(offlineHistoryRows([message({deletedForMe:true})],new Map([[row.id,"private"]]),"me"),[]);
});
