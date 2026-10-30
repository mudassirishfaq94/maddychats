import { test } from "node:test";
import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import { build } from "esbuild";
import { runInNewContext } from "node:vm";
import { generateKeyPair, exportPrivateKey, encryptPrivateKeyForStorage, generateConversationKey, encryptKeyForUser, encryptMessage } from "../src/lib/crypto";
import type * as Reader from "../src/lib/startup-chat-reader";

const user = "dddddddd-dddd-4ddd-8ddd-dddddddddddd", chat = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", device = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const serverNow = "2026-10-30T00:00:00.000Z";
const compiled = build({ stdin: { contents: 'export * from "./src/lib/startup-chat-reader";', resolveDir: process.cwd() }, bundle: true, write: false, format: "cjs", platform: "node" });
const material = (async () => {
  const pair = await generateKeyPair(), key = await generateConversationKey();
  const factor = "random-test-factor-never-uploaded";
  return { factor, envelope: `v2:${await encryptPrivateKeyForStorage(await exportPrivateKey(pair.privateKey), factor)}`, wrapped: await encryptKeyForUser(key, pair.publicKey), ciphertext: await encryptMessage("Readable encrypted fixture", key) };
})();
async function fixture() {
  const keys = await material;
  const values = new Map<string,string>([
    [`e2ee_keypair_${user}`, JSON.stringify({ encryptedPrivateKey: keys.envelope })], ["e2ee_device_id", device],
    [`e2ee_recovery_${user}_${device}`, keys.factor], [`e2ee_sentkeys_${user}_${chat}`, JSON.stringify([{ wrapped: keys.wrapped }])],
  ]);
  const state = { current: true, clock: 1000, calls: 0, hold: false, release: () => {}, body: {
    viewerId: user, conversation: { id: chat, members: [{id:user}], blocked:false, requestPending:false, awaitingApproval:false },
    initial: { serverNow: serverNow as string | undefined, messages: [{id:"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",senderId:user,type:"text",encrypted:true,text:keys.ciphertext,createdAt:serverNow,expiresAt:null as string|null,deletedAt:null as string|null,selfDestruct:false,deletedForMe:false}] },
  } };
  const loaded = { exports: {} };
  runInNewContext((await compiled).outputFiles[0].text, {
    module:loaded, crypto:webcrypto, TextEncoder, TextDecoder, atob, btoa, AbortSignal, navigator:{onLine:true}, performance:{now:()=>state.clock},
    localStorage:{ getItem:(key:string)=>values.get(key)??null, setItem:()=>{throw Error("Reader must never persist plaintext or keys");} },
    fetch:async (url:string,options:RequestInit)=>{
      state.calls++;assert.equal(url,`/api/conversations/${chat}/open`);assert.equal(options.credentials,"same-origin");assert.equal(options.cache,"no-store");assert.equal(options.body,undefined);
      if(state.hold)await new Promise<void>(resolve=>{state.release=resolve;});
      state.clock=1200;return new Response(JSON.stringify(state.body),{status:200});
    },
  });
  return {state,values,api:loaded.exports as typeof Reader};
}
test("APK reader uses actual existing private/wrapped keys and never returns ciphertext",async()=>{
  const {state,api}=await fixture();const rows=await api.createStartupReader(user,()=>state.current).read(chat,new AbortController().signal);
  assert.equal(rows?.length,1);assert.equal(rows?.[0].text,"Readable encrypted fixture");assert.equal(rows?.[0].mine,true);assert.equal(state.calls,1);
});
test("APK reader enforces the fresh server account, membership and message-request controls",async()=>{
  for(const change of ["account","conversation","membership","blocked","requestPending","awaitingApproval"]){
    const {state,api}=await fixture();
    if(change==="account")state.body.viewerId="other";
    else if(change==="conversation")state.body.conversation.id="other";
    else if(change==="membership")state.body.conversation.members=[];
    else state.body.conversation[change as "blocked"|"requestPending"|"awaitingApproval"]=true;
    await assert.rejects(api.createStartupReader(user,()=>state.current).read(chat,new AbortController().signal),error=>error instanceof api.StartupAccessError);
  }
});
test("APK reader drops expired, deleted, locally hidden and self-destruct messages",async()=>{
  for(const change of ["expired","deleted","hidden","selfDestruct"]){
    const {state,api}=await fixture(),row=state.body.initial.messages[0];
    if(change==="expired")row.expiresAt="2026-10-29T23:59:59.000Z";
    if(change==="deleted")row.deletedAt=serverNow;if(change==="hidden")row.deletedForMe=true;if(change==="selfDestruct")row.selfDestruct=true;
    assert.equal((await api.createStartupReader(user,()=>state.current).read(chat,new AbortController().signal))?.length,0);
  }
});
test("fresh disappearing text gets a conservative in-memory deadline, never a disk record",async()=>{
  const {state,api}=await fixture();state.body.initial.messages[0].expiresAt="2026-10-30T00:00:01.000Z";
  const rows=await api.createStartupReader(user,()=>state.current).read(chat,new AbortController().signal);
  assert.equal(rows?.[0].deadline,2000,"Subtract the whole 200ms request round trip from the server deadline");
});
test("APK reader refuses disappearing text without a trusted server clock",async()=>{
  const {state,api}=await fixture();state.body.initial.messages[0].expiresAt="2026-10-30T00:00:01.000Z";state.body.initial.serverNow=undefined;
  assert.equal((await api.createStartupReader(user,()=>state.current).read(chat,new AbortController().signal))?.length,0);
});
test("account changes during a held request cannot return the previous account's text",async()=>{
  const {state,api}=await fixture();state.hold=true;
  const pending=api.createStartupReader(user,()=>state.current).read(chat,new AbortController().signal);
  while(!state.calls)await new Promise(resolve=>setTimeout(resolve,1));state.current=false;state.release();
  await assert.rejects(pending,error=>error instanceof api.StartupAccessError);
});
test("missing or unreadable device material never generates an identity or fetches key history",async()=>{
  for(const broken of ["missing","wrong-factor","bad-wrap"]){
    const {state,values,api}=await fixture();
    if(broken==="missing")values.delete(`e2ee_keypair_${user}`);
    if(broken==="wrong-factor")values.set(`e2ee_recovery_${user}_${device}`,"incorrect");
    if(broken==="bad-wrap")values.set(`e2ee_sentkeys_${user}_${chat}`,JSON.stringify([{wrapped:"corrupted"}]));
    const rows=await api.createStartupReader(user,()=>state.current).read(chat,new AbortController().signal);
    assert.equal(rows?.length??0,0);assert.equal(state.calls,broken==="bad-wrap"?1:0);
  }
});
