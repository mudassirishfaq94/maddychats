import assert from "node:assert/strict";
import { createServer } from "node:http";
import { build } from "esbuild";
import { chromium } from "playwright";

// Only authentication/router/realtime are test doubles. Offline records use
// the production IndexedDB encryption and the actual React transition surface.
const bundle = await build({ bundle: true, write: false, format: "iife", platform: "browser", jsx: "automatic", stdin: {
  resolveDir: process.cwd(), loader: "jsx", contents: `
    import React from 'react'; import {createRoot} from 'react-dom/client';
    import {SavedInboxList} from './src/components/chats/saved-inbox-list';
    import {ConversationListProvider,useConversationList} from './src/components/providers/conversation-list-provider';
    import {SavedChatOpening} from './src/components/chats/saved-chat-opening';
    import {ChatRoute} from './src/app/app/chats/[id]/chat-route';
    import * as store from './public/offline-store.js';
    function Inbox(){const {snapshot}=useConversationList();return snapshot?<p>Authorized inbox {snapshot.conversations.length}</p>:<SavedInboxList filter='' onPrepare={()=>{}}/>;}
    window.showInbox=auth=>{window.fixtureAuth=auth;root.render(<ConversationListProvider><Inbox/></ConversationListProvider>);};
    window.store=store; const root=createRoot(document.getElementById('root'));
    window.openChat=()=>root.render(<ChatRoute conversationId='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' me={window.fixtureAuth.user}/>);
    window.showLive=(auth,ttl)=>{window.fixtureAuth=auth;root.render(<SavedChatOpening preview={{userId:auth.user?.id,scope:auth.requestScope,conversationId:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',name:'Fixture circle',messageId:'11111111-1111-4111-8111-111111111111',sourceCiphertext:'fixture-cipher',text:'Current inbox fixture',deadline:performance.now()+ttl}}/>);};
    window.show=(auth)=>{window.fixtureAuth=auth;root.render(<SavedChatOpening key={auth.requestScope.key}/>);};
  `,
}, plugins: [{ name: "fixture-providers", setup(builder) {
  builder.onResolve({filter:/^(@\/components\/chats\/chat-view|next\/link|lucide-react)$/},args=>({path:args.path,namespace:'route-fixture'}));
  builder.onLoad({filter:/.*/,namespace:'route-fixture'},args=>({contents: args.path.endsWith('chat-view') ? `import React from 'react';export const ChatView=()=> <p>Authorized server fixture</p>;` : args.path==='next/link' ? `import React from 'react';export default function Link({children,...props}){return <a {...props}>{children}</a>;}` : `import React from 'react';export const Ghost=()=>null;`,loader:'jsx',resolveDir:process.cwd()}));
  builder.onResolve({filter:/^\.\/(auth-provider|realtime-provider)$/},args=>({path:args.path,namespace:"fixture"}));
  builder.onResolve({ filter: /^(next\/navigation|@\/components\/providers\/(auth-provider|realtime-provider|e2ee-provider))$/ }, args => ({ path: args.path, namespace: "fixture" }));
  builder.onLoad({ filter: /.*/, namespace: "fixture" }, args => ({ contents: args.path === "next/navigation"
    ? `export const useParams=()=>({id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'});`
    : args.path.endsWith("auth-provider") ? `export const useAuth=()=>window.fixtureAuth;`
    : args.path.endsWith("e2ee-provider") ? `const loadCachedDecryptedMessages=async()=>new Map();export const useSharedE2EE=()=>({loadCachedDecryptedMessages});`
    : `const subscribe=handler=>{window.eventHandler=handler;return ()=>{};};export const useRealtime=()=>({subscribe});` }));
} }] });
const server = createServer((req, res) => {
  if (req.url === "/bundle.js") { res.setHeader("Content-Type", "text/javascript"); res.end(bundle.outputFiles[0].contents); }
  else res.end('<!doctype html><div id="root"></div><script src="/bundle.js"></script>');
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  const errors = []; page.on("pageerror", error => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page.waitForFunction(() => window.store && window.show);
  await page.evaluate(async () => {
    const id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    await window.store.rememberChats('dddddddd-dddd-4ddd-8ddd-dddddddddddd', [{id,name:'Fixture circle'}]);
    await window.store.rememberHistory('dddddddd-dddd-4ddd-8ddd-dddddddddddd',id,[
      {id:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',senderId:'peer',senderName:'Fixture',createdAt:new Date().toISOString(),kind:'message',text:'Saved readable fixture',mine:false},
      {id:'cccccccc-cccc-4ccc-8ccc-cccccccccccc',senderId:'peer',senderName:'Fixture',createdAt:new Date(Date.now()-1000).toISOString(),kind:'ephemeral',text:'Never show this',mine:false},
    ],true);
    window.show({user:{id:'dddddddd-dddd-4ddd-8ddd-dddddddddddd'},status:'authenticated',requestScope:{key:'a'}});
  });
  await page.getByText('Saved readable fixture', {exact:true}).waitFor();
  assert.equal(await page.getByText('Never show this', {exact:true}).count(),0);
  const inboxRequests=[];
  await page.route('**/api/conversations',route=>inboxRequests.push(route));
  const authA={user:{id:'dddddddd-dddd-4ddd-8ddd-dddddddddddd'},status:'authenticated',requestScope:{key:'inbox-a'}};
  await page.evaluate(auth=>window.showInbox(auth),authA);
  await page.getByRole('list',{name:'Saved conversations'}).getByText('Fixture circle',{exact:true}).waitFor();
  await page.getByText('Saved readable fixture',{exact:true}).waitFor();
  assert(inboxRequests.length>0,'Saved list and preview paint while the authorized list response is withheld');
  await page.evaluate(()=>window.showInbox({user:{id:'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'},status:'authenticated',requestScope:{key:'inbox-b'}}));
  assert.equal(await page.getByText('Fixture circle',{exact:true}).count(),0);
  assert.equal(await page.getByText('Saved readable fixture',{exact:true}).count(),0);
  await page.evaluate(()=>window.showInbox({user:null,status:'unauthenticated',requestScope:{key:'inbox-out'}}));
  assert.equal(await page.getByText('Fixture circle',{exact:true}).count(),0);
  for(const request of inboxRequests.splice(0))await request.fulfill({status:200,contentType:'application/json',body:JSON.stringify({viewerId:authA.user.id,conversations:[]})});
  await page.evaluate(auth=>window.showInbox(auth),authA);
  await page.getByText('Fixture circle',{exact:true}).waitFor();
  for(let attempt=0;attempt<100&&!inboxRequests.length;attempt++)await page.waitForTimeout(10);
  assert(inboxRequests.length,'A returning account must refresh its list');
  await inboxRequests.shift().fulfill({status:200,contentType:'application/json',body:JSON.stringify({viewerId:authA.user.id,conversations:[]})});
  await page.getByText('Authorized inbox 0',{exact:true}).waitFor();
  assert.equal(await page.getByText('Fixture circle',{exact:true}).count(),0,'Authorized removal wins over saved rows');
  await page.evaluate(auth=>window.show(auth),authA);
  await page.getByText('Saved readable fixture',{exact:true}).waitFor();
  await page.evaluate(auth=>window.showInbox(auth),authA);
  await page.getByText('Fixture circle',{exact:true}).waitFor();
  for(let attempt=0;attempt<100&&!inboxRequests.length;attempt++)await page.waitForTimeout(10);
  assert(inboxRequests.length);
  await inboxRequests.shift().fulfill({status:401,contentType:'application/json',body:'{}'});
  await page.getByText('Authorized inbox 0',{exact:true}).waitFor();
  assert.equal(await page.getByText('Fixture circle',{exact:true}).count(),0,'A rejected session hides saved rows immediately');
  await page.evaluate(auth=>window.show(auth),authA);
  let pendingHistory;
  await page.route('**/api/conversations/*/open', route => {pendingHistory=route;});
  await page.evaluate(() => window.openChat());
  await page.waitForFunction(() => document.querySelector('[aria-label="Saved messages"]')?.textContent.includes('Saved readable fixture'));
  await page.waitForTimeout(50);
  assert(pendingHistory, 'The actual ChatRoute starts the authorized request while saved messages remain readable');
  await pendingHistory.fulfill({status:200,contentType:'application/json',body:JSON.stringify({
    viewerId:'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
    conversation:{id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',members:[{id:'dddddddd-dddd-4ddd-8ddd-dddddddddddd'}]},
    initial:{messages:[],nextCursor:null,hasMore:false},
  })});
  await page.getByText('Authorized server fixture',{exact:true}).waitFor();

  await page.evaluate(() => window.show({user:{id:'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'},status:'authenticated',requestScope:{key:'b'}}));
  await page.getByText('Opening…',{exact:true}).waitFor();
  assert.equal(await page.getByText('Saved readable fixture',{exact:true}).count(),0);
  await page.evaluate(() => window.show({user:{id:'dddddddd-dddd-4ddd-8ddd-dddddddddddd'},status:'authenticated',requestScope:{key:'a-again'}}));
  await page.getByText('Saved readable fixture',{exact:true}).waitFor();
  await page.evaluate(() => window.show({user:null,status:'unauthenticated',requestScope:{key:'out'}}));
  await page.getByText('Opening…',{exact:true}).waitFor();
  assert.equal(await page.getByText('Saved readable fixture',{exact:true}).count(),0);
  await page.evaluate(() => {
    localStorage.removeItem('maddy:locked-chats');
    window.show({user:{id:'dddddddd-dddd-4ddd-8ddd-dddddddddddd'},status:'authenticated',requestScope:{key:'events'}});
  });
  await page.getByText('Saved readable fixture',{exact:true}).waitFor();
  await page.evaluate(() => window.eventHandler({type:'message:new',conversationId:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'}));
  assert.equal(await page.getByText('Saved readable fixture',{exact:true}).count(),1,'A new message must not blank readable saved history');
  await page.evaluate(() => window.eventHandler({type:'message:deleted',conversationId:'ffffffff-ffff-4fff-8fff-ffffffffffff'}));
  assert.equal(await page.getByText('Saved readable fixture',{exact:true}).count(),1,'Another chat changing must not blank this saved history');
  await page.evaluate(() => window.eventHandler({type:'message:deleted'}));
  await page.getByText('Opening…',{exact:true}).waitFor();
  assert.equal(await page.getByText('Saved readable fixture',{exact:true}).count(),0);
  await page.evaluate(() => {
    localStorage.setItem('maddy:locked-chats',JSON.stringify(['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa']));
    window.show({user:{id:'dddddddd-dddd-4ddd-8ddd-dddddddddddd'},status:'authenticated',requestScope:{key:'locked'}});
  });
  await page.getByText('Opening…',{exact:true}).waitFor();
  assert.equal(await page.getByText('Saved readable fixture',{exact:true}).count(),0);
  await page.evaluate(()=>{localStorage.removeItem('maddy:locked-chats');window.showLive({user:{id:'dddddddd-dddd-4ddd-8ddd-dddddddddddd'},status:'authenticated',requestScope:{key:'live'}},250);});
  await page.getByText('Current inbox fixture',{exact:true}).waitFor();
  await page.getByText('Current inbox fixture',{exact:true}).waitFor({state:'hidden'});
  await page.evaluate(()=>window.showLive({user:{id:'dddddddd-dddd-4ddd-8ddd-dddddddddddd'},status:'authenticated',requestScope:{key:'live-change'}},10000));
  await page.getByText('Current inbox fixture',{exact:true}).waitFor();
  await page.evaluate(()=>window.eventHandler({type:'message:update',conversationId:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'}));
  await page.getByText('Current inbox fixture',{exact:true}).waitFor({state:'hidden'});
  const persisted=await page.evaluate(async()=> (await window.store.offlineHistory('dddddddd-dddd-4ddd-8ddd-dddddddddddd','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')).messages.some(row=>row.text==='Current inbox fixture'));
  assert.equal(persisted,false,'Current disappearing previews must never enter persistent history');
  assert.deepEqual(errors,[]);
  console.log('PASS saved inbox/provider and ChatRoute with held server responses, 401/removal reconciliation: real encrypted offline history before the server response, ephemeral exclusion, account switch, logout and locked chat');
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
