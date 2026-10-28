import test from "node:test";
import assert from "node:assert/strict";
import { currentChatPreview } from "../src/lib/current-chat-preview";
import type { ConversationSummary } from "../src/lib/types";
const conversation = {id:"chat",name:"Friend",blocked:false,requestPending:false,lastMessage:{id:"message",text:"ciphertext",type:"text",encrypted:true,deletedAt:null,expiresAt:"2026-10-29T00:00:01.000Z"}} as ConversationSummary;
const clock={serverMs:Date.parse("2026-10-29T00:00:00.000Z"),receivedAt:100};
test("current inbox preview reuses verified text in memory and expires on the monotonic clock",()=>{
 const scope={};const preview=currentChatPreview(conversation,"account",scope,"Readable fixture",clock,200)!;
 assert.equal(preview.scope,scope);assert.equal(preview.text,"Readable fixture");assert.equal(preview.deadline,1100);
 assert.equal(currentChatPreview(conversation,"account",scope,"Readable fixture",clock,1100),undefined);
 assert.equal(currentChatPreview(conversation,"account",scope,undefined,clock,200),undefined);
 assert.equal(currentChatPreview(conversation,"account",scope,"Readable fixture",undefined,200),undefined);
});
test("current inbox preview excludes requests, blocks, hidden/deleted messages, and unsafe deadlines",()=>{
 for(const change of [{blocked:true},{requestPending:true},{lastMessage:{...conversation.lastMessage!,text:""}},{lastMessage:{...conversation.lastMessage!,deletedAt:"now"}},{lastMessage:{...conversation.lastMessage!,selfDestruct:true}},{lastMessage:{...conversation.lastMessage!,type:"file"}},{lastMessage:{...conversation.lastMessage!,expiresAt:"invalid"}}]){
  assert.equal(currentChatPreview({...conversation,...change},"account",{},"Readable fixture",clock,200),undefined);
 }
});
