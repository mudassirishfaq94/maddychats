const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const ts=require('typescript');
async function run(overrides={}) {
 const actions=[]; const tasks=[];
 const detail={type:'dm',slowModeSeconds:0,deletedAt:null,...overrides.detail};
 const dependencies={
  'next/server':{after:fn=>tasks.push(fn),NextResponse:{json:(body,init)=>Response.json(body,init)}},
  'drizzle-orm':{eq:()=>null}, '@/db/schema':{conversations:{}},
  '@/db':{db:{select:()=>({from:()=>({where:()=>({limit:async()=>[detail]})})})}},
  '@/lib/schemas':{sendMessageSchema:{safeParse:()=>({success:true,data:{text:'ciphertext',encrypted:true}})}},
  '@/server/rate-limit':{AUTH_RATE_LIMIT:{limit:10,windowMs:1000},rateLimit:()=>({allowed:true})},
  '@/server/http':{guardSameOrigin:()=>null,clientIp:()=>'',readJson:async()=>({}),jsonError:(status,error)=>Response.json({error},{status})},
  '@/server/session':{getSessionUser:async()=>({id:'sender',displayName:'Sender'})},
  '@/server/users':{isUuid:()=>true},
  '@/server/realtime':{publishToUsers:async()=>actions.push('publish')},
  '@/server/presence':{onlineMembersOf:async()=>['receiver']},
  '@/server/chat':{
   getMembership:async()=>overrides.noMembership?null:{role:'member'},
   memberIdsOf:async()=>['sender','receiver'],isBlockedBetween:async()=>!!overrides.blocked,
   createMessage:async()=>{actions.push('create');return {id:'message'}},
   markMessageDelivered:async()=>{actions.push('delivered');return new Date()},
  },
  '@/server/notifications':{notifyNewMessage:async()=>{actions.push('notify');throw new Error('push unavailable')}},
  '@/server/spam-detection':{isSpammingMessages:async()=>({allowed:!overrides.spam}),isDuplicateMessage:async()=>false},
 };
 const exports={};
 vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/app/api/conversations/[id]/messages/route.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,require:n=>dependencies[n],Response,Date});
 const response=await exports.POST({}, {params:Promise.resolve({id:'chat'})});
 return {response,actions,tasks};
}
(async()=>{
 const ok=await run();assert.equal(ok.response.status,201);assert.deepEqual(ok.actions,['create','delivered','publish']);assert.equal(ok.tasks.length,1);
 await assert.rejects(ok.tasks[0](),/push unavailable/);assert.equal(ok.response.status,201);
 for(const [input,status] of [[{noMembership:true},404],[{blocked:true},403],[{spam:true},429],[{detail:{type:'group',adminOnlyMessaging:true}},403],[{detail:{type:'group',slowModeSeconds:60,lastMessageAt:new Date()}},429],[{detail:{deletedAt:new Date()}},404]]) {
  const result=await run(input);assert.equal(result.response.status,status);assert.equal(result.actions.length,0);assert.equal(result.tasks.length,0);
 }
 console.log('PASS: durable send precedes response; notification failure does not fail send; membership/block/spam/group/slow-mode/deleted checks remain enforced');
})().catch(e=>{console.error(e);process.exitCode=1});
