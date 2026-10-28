import assert from "node:assert/strict";
import { createServer } from "node:http";
import { build } from "esbuild";
import { chromium } from "playwright";

// Only authentication/router/realtime are test doubles. Offline records use
// the production IndexedDB encryption and the actual React transition surface.
const bundle = await build({ bundle: true, write: false, format: "iife", platform: "browser", jsx: "automatic", stdin: {
  resolveDir: process.cwd(), loader: "jsx", contents: `
    import React from 'react'; import {createRoot} from 'react-dom/client';
    import {SavedChatOpening} from './src/components/chats/saved-chat-opening';
    import * as store from './public/offline-store.js';
    window.store=store; const root=createRoot(document.getElementById('root'));
    window.show=(auth)=>{window.fixtureAuth=auth;root.render(<SavedChatOpening key={auth.requestScope.key}/>);};
  `,
}, plugins: [{ name: "fixture-providers", setup(builder) {
  builder.onResolve({ filter: /^(next\/navigation|@\/components\/providers\/(auth-provider|realtime-provider))$/ }, args => ({ path: args.path, namespace: "fixture" }));
  builder.onLoad({ filter: /.*/, namespace: "fixture" }, args => ({ contents: args.path === "next/navigation"
    ? `export const useParams=()=>({id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'});`
    : args.path.endsWith("auth-provider") ? `export const useAuth=()=>window.fixtureAuth;`
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
      {id:'cccccccc-cccc-4ccc-8ccc-cccccccccccc',senderId:'peer',senderName:'Fixture',createdAt:new Date().toISOString(),kind:'ephemeral',text:'Never show this',mine:false},
    ],true);
    window.show({user:{id:'dddddddd-dddd-4ddd-8ddd-dddddddddddd'},status:'authenticated',requestScope:{key:'a'}});
  });
  await page.getByText('Saved readable fixture', {exact:true}).waitFor();
  assert.equal(await page.getByText('Never show this', {exact:true}).count(),0);
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
  await page.evaluate(() => window.eventHandler({type:'message:deleted'}));
  await page.getByText('Opening…',{exact:true}).waitFor();
  assert.equal(await page.getByText('Saved readable fixture',{exact:true}).count(),0);
  await page.evaluate(() => {
    localStorage.setItem('maddy:locked-chats',JSON.stringify(['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa']));
    window.show({user:{id:'dddddddd-dddd-4ddd-8ddd-dddddddddddd'},status:'authenticated',requestScope:{key:'locked'}});
  });
  await page.getByText('Opening…',{exact:true}).waitFor();
  assert.equal(await page.getByText('Saved readable fixture',{exact:true}).count(),0);
  assert.deepEqual(errors,[]);
  console.log('PASS saved-chat transition: real encrypted offline history, no server request, ephemeral exclusion, account switch, logout and locked chat');
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
