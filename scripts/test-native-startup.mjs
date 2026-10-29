import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import {chromium} from 'playwright';

const account='dddddddd-dddd-4ddd-8ddd-dddddddddddd', chat='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const server=createServer(async(req,res)=>{
  const path=new URL(req.url,'http://localhost').pathname;
  if(!['/startup.html','/startup.css','/startup.js','/offline.css','/offline-store.js','/icons/circlo-mark.svg'].includes(path)){res.writeHead(404).end();return;}
  res.setHeader('Content-Type',path.endsWith('.js')?'text/javascript':path.endsWith('.css')?'text/css':path.endsWith('.svg')?'image/svg+xml':'text/html');
  res.end(await readFile('public'+path));
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const browser=await chromium.launch();
try{
  const page=await browser.newPage({viewport:{width:390,height:844}}),errors=[],api=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(r.url().includes('/api/'))api.push(r.url());});
  const base=`http://127.0.0.1:${server.address().port}`;
  await page.goto(base+'/offline.css');
  await page.evaluate(async({account,chat})=>{
    const store=await import('/offline-store.js');
    await store.rememberChats(account,[{id:chat,name:'Fixture friend',unreadCount:2}]);
    await store.rememberHistory(account,chat,[
      {id:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',kind:'message',text:'Saved fixture',createdAt:new Date().toISOString()},
      {id:'cccccccc-cccc-4ccc-8ccc-cccccccccccc',kind:'ephemeral',text:'Secret expired fixture',createdAt:new Date().toISOString()},
    ],true);
  },{account,chat});
  await page.addInitScript(account=>{window.hint=account;window.calls=[];window.CircloStartup={accountHint:()=>window.hint,cacheReady:()=>window.calls.push('ready'),unavailable:()=>window.calls.push('unavailable'),openChat:id=>window.calls.push(id),openPage:()=>{},newChat:()=>{}};},account);
  await page.goto(base+'/startup.html');
  await page.getByRole('listitem').getByText('Fixture friend',{exact:true}).waitFor();
  assert.equal(await page.locator('.row-preview').innerText(),'Open to see messages');
  await page.getByRole('listitem').click();
  await page.getByText('Saved fixture',{exact:true}).waitFor();
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'Phone layout stays within the screen');
  await mkdir('.freebuff/performance',{recursive:true});
  await page.screenshot({path:'.freebuff/performance/startup-fixture-chat.png'});
  assert.equal(await page.getByText('Secret expired fixture',{exact:true}).count(),0);
  assert.equal(await page.locator('textarea,input:not([type=search])').count(),0,'Snapshot cannot send drafts before fresh authorization');
  await page.goBack();assert.equal(await page.locator('#conversation').isVisible(),false);
  await page.getByRole('listitem').click();
  await page.evaluate(()=>{localStorage.setItem('maddy:locked-chats',JSON.stringify(['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa']));window.dispatchEvent(new StorageEvent('storage',{key:'maddy:locked-chats'}));});
  await page.getByText('Saved fixture',{exact:true}).waitFor({state:'hidden'});
  await page.evaluate(()=>{localStorage.setItem('circlo:offline-account','eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee');window.dispatchEvent(new StorageEvent('storage',{key:'circlo:offline-account'}));});
  assert.equal(await page.locator('.chat-list-row,.saved-bubble').count(),0);
  await page.reload();assert.equal(await page.locator('.chat-list-row,.saved-bubble').count(),0);
  await page.evaluate(()=>{localStorage.removeItem('circlo:offline-account');window.dispatchEvent(new StorageEvent('storage',{key:'circlo:offline-account'}));});
  assert.equal(await page.locator('.chat-list-row,.saved-bubble').count(),0);
  assert.deepEqual(api,[]);assert.deepEqual(errors,[]);
  console.log('PASS APK startup: real encrypted cache, cached messages without network, no ephemeral text, read-only controls, Back, locks, account switch and logout');
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
