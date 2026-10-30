import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { build } from "esbuild";
import { chromium } from "playwright";
const cryptoModule=await build({entryPoints:['src/lib/crypto.ts'],bundle:true,write:false,format:'esm',platform:'browser'});
const user='dddddddd-dddd-4ddd-8ddd-dddddddddddd',chat='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',device='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
let ciphertext,status=200,requests=0;
const server=createServer(async(req,res)=>{
  const path=new URL(req.url,'http://localhost').pathname;
  if(path==='/fixture-crypto.js'){res.setHeader('Content-Type','text/javascript');res.end(cryptoModule.outputFiles[0].contents);return;}
  if(path===`/api/conversations/${chat}/open`){requests++;res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify({viewerId:user,conversation:{id:chat,members:[{id:user}],blocked:false,requestPending:false},initial:{serverNow:new Date().toISOString(),messages:[{id:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',senderId:user,type:'text',encrypted:true,text:ciphertext,createdAt:new Date().toISOString(),expiresAt:new Date(Date.now()+700).toISOString()}]}}));return;}
  if(!['/offline.html','/startup.html','/startup.css','/startup.js','/startup-reader.js','/offline.css','/offline-store.js','/icons/circlo-mark.svg'].includes(path)){res.writeHead(404).end();return;}
  res.setHeader('Content-Type',path.endsWith('.js')?'text/javascript':path.endsWith('.css')?'text/css':path.endsWith('.svg')?'image/svg+xml':'text/html');res.end(await readFile('public'+path));
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const browser=await chromium.launch();
try{
 const page=await browser.newPage({viewport:{width:390,height:844}}),errors=[];page.on('pageerror',e=>errors.push(e.message));const base=`http://127.0.0.1:${server.address().port}`;
 await page.goto(base+'/offline.html');
 ciphertext=await page.evaluate(async({user,chat,device})=>{
  const c=await import('/fixture-crypto.js'),s=await import('/offline-store.js'),pair=await c.generateKeyPair(),key=await c.generateConversationKey();
  const factor=crypto.randomUUID();localStorage.setItem('e2ee_device_id',device);localStorage.setItem(`e2ee_recovery_${user}_${device}`,factor);
  localStorage.setItem(`e2ee_keypair_${user}`,JSON.stringify({encryptedPrivateKey:'v2:'+await c.encryptPrivateKeyForStorage(await c.exportPrivateKey(pair.privateKey),factor)}));
  localStorage.setItem(`e2ee_sentkeys_${user}_${chat}`,JSON.stringify([{wrapped:await c.encryptKeyForUser(key,pair.publicKey)}]));
  await s.rememberChats(user,[{id:chat,name:'Fixture friend'}]);await s.rememberHistory(user,chat,[{id:'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',kind:'message',text:'Previous saved fixture',createdAt:new Date().toISOString()}],true);
  return c.encryptMessage('Fresh encrypted fixture',key);
 },{user,chat,device});
 await page.addInitScript(user=>{window.hint=user;window.calls=[];window.CircloStartup={accountHint:()=>window.hint,cacheReady(){},unavailable:()=>window.calls.push('denied'),openChat(){},openPage(){},newChat(){}};},user);
 await page.goto(base+'/startup.html');await page.getByRole('listitem').click();
 const externalBlocked=await page.evaluate(async()=>{window.blockedConnect=false;document.addEventListener('securitypolicyviolation',event=>{if(event.effectiveDirective==='connect-src'&&event.blockedURI.startsWith('https://blocked.invalid'))window.blockedConnect=true;});try{await fetch('https://blocked.invalid/probe');return false;}catch{return true;}});
 assert.equal(externalBlocked,true);await page.waitForFunction(()=>window.blockedConnect===true);
 try{await page.getByText('Fresh encrypted fixture',{exact:true}).waitFor({timeout:5000});}catch(error){console.error({requests,errors,reader:await page.evaluate(async({user,chat})=>{try{const r=await(await import('/startup-reader.js')).createStartupReader(user,()=>true).read(chat,new AbortController().signal);return {rows:r?.length??null,visible:document.visibilityState};}catch(e){return {error:e.message};}},{user,chat})});throw error;}
 assert.equal(requests,1,'One selected chat starts one authorized refresh');
 assert.equal(await page.locator('#messages').getByText('Previous saved fixture',{exact:true}).count(),0,'Fresh authorized page replaces the local snapshot');
 const persisted=await page.evaluate(async({user,chat})=>(await(await import('/offline-store.js')).offlineHistory(user,chat)).messages.some(row=>row.text==='Fresh encrypted fixture'),{user,chat});
 assert.equal(persisted,false,'Fresh disappearing text is never written to offline history');
 await page.evaluate(()=>{window.hiddenFixture=true;Object.defineProperty(document,'visibilityState',{configurable:true,get:()=>window.hiddenFixture?'hidden':'visible'});document.dispatchEvent(new Event('visibilitychange'));});
 assert.equal(await page.getByText('Fresh encrypted fixture',{exact:true}).count(),0,'Backgrounding hides the fresh in-memory surface');
 await page.waitForTimeout(850);await page.evaluate(()=>{window.hiddenFixture=false;document.dispatchEvent(new Event('visibilitychange'));});
 assert.equal(await page.getByText('Fresh encrypted fixture',{exact:true}).count(),0,'Foregrounding cannot revive expired text');
 status=403;await page.goto(base+'/startup.html');await page.getByRole('listitem').click();await page.waitForFunction(()=>window.calls.includes('denied'));
 assert.equal(await page.locator('#messages').getByText('Previous saved fixture',{exact:true}).count(),0,'Fresh authorization denial removes old cached text');
 assert.deepEqual(errors,[]);console.log('PASS actual packaged startup reader: real encrypted response/local keys, one authorized read, server reconciliation, no ephemeral disk persistence, expiry/background protection and denied-access cleanup');
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
