import assert from "node:assert/strict";
import { createServer } from "node:http";
import { build } from "esbuild";
import { chromium } from "playwright";
const bundle = await build({bundle:true,write:false,format:"iife",platform:"browser",jsx:"automatic",stdin:{resolveDir:process.cwd(),loader:"jsx",contents:`
import React from 'react';import {createRoot} from 'react-dom/client';import {ChatsLayout} from './src/components/chats/chats-layout';import * as store from './public/offline-store.js';
window.ready=(async()=>{const user={id:'dddddddd-dddd-4ddd-8ddd-dddddddddddd',displayName:'Owner',username:'owner'};const scope={};window.fixtureAuth={user,status:'authenticated',requestScope:scope};
const conversation={id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',type:'dm',name:'Fixture friend',otherMember:{id:'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',displayName:'Fixture friend',username:'friend',avatarUrl:null},createdAt:new Date().toISOString(),lastMessageAt:new Date().toISOString(),memberCount:2,unreadCount:0,blocked:false,requestPending:false,lastMessage:{id:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',senderId:'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',type:'text',encrypted:true,text:'not-readable-ciphertext',createdAt:new Date().toISOString(),expiresAt:new Date(Date.now()+60000).toISOString(),deletedAt:null}};
window.conversationList={snapshot:{viewerId:user.id,conversations:[conversation],clock:{serverMs:Date.now(),receivedAt:performance.now()}},seed(){}};
await store.rememberChats(user.id,[{id:conversation.id,name:conversation.name}]);window.decryptCalls=0;window.tapResolvers=[];
window.encryption={initialized:true,getCachedDecryptedMessage(){},cacheDecryptedMessage(){},loadCachedDecryptedMessages:async()=>new Map(),decrypt:(_text,_id,options)=>{if(!options?.localOnly)throw Error('Selected preview must not fetch keys');window.decryptCalls++;return new Promise(resolve=>{if(window.decryptCalls>1)window.tapResolvers.push(resolve);});}};
createRoot(document.getElementById('root')).render(<ChatsLayout><p>Choose a chat</p></ChatsLayout>);})();
`},plugins:[{name:"tap-fixtures",setup(builder){
builder.onResolve({filter:/^(next\/link|next\/image|next\/navigation|@\/components\/providers\/.*|@\/components\/avatar|@\/components\/brand\/logo|\.\/new-chat-dialog|\.\/conversation-menu|\.\/save-chats-reminder|\.\.\/\.\.\/app\/app\/chats\/\[id\]\/chat-route)$/},args=>({path:args.path,namespace:"fixture"}));
builder.onLoad({filter:/.*/,namespace:"fixture"},args=>({loader:"jsx",resolveDir:process.cwd(),contents:
args.path==='next/navigation'?"import {useSyncExternalStore} from 'react';const subscribe=f=>{window.addEventListener('popstate',f);return()=>window.removeEventListener('popstate',f);};export const usePathname=()=>useSyncExternalStore(subscribe,()=>location.pathname);export const useParams=()=>({});"
:args.path==='next/link'?"import React from 'react';export default function Link({onNavigate,prefetch,children,...props}){return <a {...props} onClick={e=>{e.preventDefault();onNavigate?.({preventDefault(){}});window.dispatchEvent(new Event('popstate'));}}>{children}</a>;}"
:args.path==='next/image'?"import React from 'react';export default function Image({unoptimized,...props}){return <img {...props}/>;}"
:args.path.endsWith('auth-provider')?"export const useAuth=()=>window.fixtureAuth;"
:args.path.endsWith('e2ee-provider')?"export const useSharedE2EE=()=>window.encryption;"
:args.path.endsWith('conversation-list-provider')?"export const useConversationList=()=>window.conversationList;"
:args.path.endsWith('realtime-provider')?"const subscribe=()=>()=>{};export const useRealtime=()=>({subscribe});export const usePresenceMap=()=>({});"
:args.path.endsWith('chat-route')?"import React from 'react';import {SavedChatOpening} from './src/components/chats/saved-chat-opening';export const ChatRoute=props=><SavedChatOpening {...props}/>;"
:"export const Avatar=()=>null;export const LogoMark=()=>null;export const NewChatDialog=()=>null;export const ConversationMenu=()=>null;export const SaveChatsReminder=()=>null;"}));
}}]});
const server=createServer((req,res)=>{if(req.url==='/bundle.js'){res.setHeader('Content-Type','text/javascript');res.end(bundle.outputFiles[0].contents);}else res.end('<div id="root"></div><script src="/bundle.js"></script>');});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const browser=await chromium.launch();
try{const page=await browser.newPage({viewport:{width:390,height:844}}),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.route('**/api/**',()=>{});
await page.goto(`http://127.0.0.1:${server.address().port}/app/chats`);await page.waitForFunction(()=>window.decryptCalls===1);
await page.locator('.chat-list-row').first().click();await page.waitForFunction(()=>window.tapResolvers.length>0);
assert.equal(await page.getByText('Tapped readable fixture',{exact:true}).count(),0);
await page.evaluate(()=>window.tapResolvers.splice(0).forEach(resolve=>resolve('Tapped readable fixture')));
await page.getByLabel('Saved messages',{exact:true}).getByText('Tapped readable fixture',{exact:true}).waitFor();
assert.deepEqual(errors,[]);console.log('PASS real inbox pointer-down prioritizes local decryption despite a stalled background preview; text paints with API responses held');
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
