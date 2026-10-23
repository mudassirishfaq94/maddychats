import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { resolve } from 'node:path';
import { readFile, mkdir } from 'node:fs/promises';
import postcss from 'postcss';
import tailwind from '@tailwindcss/postcss';

// Real client components and WebCrypto/IndexedDB; no production test route or backend.
const fixture=`
import React from 'react';
import {createRoot} from 'react-dom/client';
import {CircloHelp} from './src/components/help/circlo-help';
import {PhoneDiscovery} from './src/components/profile/phone-discovery';
import * as cache from './src/lib/e2ee-message-cache';
import {InlineMedia} from './src/components/chats/attachments';
window.cache=cache;
function App(){return location.search==='?media'?<InlineMedia attachment={{id:'video',kind:'video',originalName:'Clip.webm'}}/>:location.search==='?phone'?<main className="mx-auto max-w-md px-4 py-6"><h1 className="text-xl font-semibold">Phone discovery</h1><PhoneDiscovery/></main>:<CircloHelp/>;}
createRoot(document.getElementById('root')).render(<App/>);`;
const bundle=await build({stdin:{contents:fixture,resolveDir:resolve('.'),loader:'tsx',sourcefile:'mobile-experience-fixture.tsx'},jsx:'automatic',bundle:true,write:false,format:'iife',platform:'browser',tsconfig:'tsconfig.json',define:{'process.env':'{}','process.env.NODE_ENV':'"production"'},plugins:[{name:'client-marker',setup(build){build.onResolve({filter:/^\.\/e2ee-context$/},()=>({path:'media-url',namespace:'media'}));build.onLoad({filter:/.*/,namespace:'media'},()=>({contents:"export function useEncryptedAttachmentUrl(){return {url:sessionStorage.getItem('fixtureMedia'),failed:false}}"}));build.onResolve({filter:/^client-only$/},()=>({path:'client-only',namespace:'empty'}));build.onLoad({filter:/.*/,namespace:'empty'},()=>({contents:''}));}}]});
const css=await postcss([tailwind()]).process(await readFile('src/app/globals.css','utf8'),{from:resolve('src/app/globals.css')});
const server=createServer((request,response)=>{if(request.url==='/api/contacts/phone'){response.setHeader('Content-Type','application/json');response.end(JSON.stringify({phone:'+971501234567',enabled:false}));return;}const js=request.url==='/fixture.js',style=request.url==='/style.css';response.setHeader('Content-Type',js?'text/javascript':style?'text/css':'text/html');response.end(js?bundle.outputFiles[0].contents:style?css.css:'<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"><div id="root"></div><script src="/fixture.js"></script>');});
server.listen(0,'127.0.0.1');await once(server,'listening');
let browser;const errors=[];
try{
 browser=await chromium.launch(process.env.CHROMIUM_CHANNEL?{channel:process.env.CHROMIUM_CHANNEL}:{});
 const page=await browser.newPage({viewport:{width:360,height:800}});page.on('pageerror',error=>{errors.push(error.message);console.error('Browser error:',error.message);});
 const base=`http://127.0.0.1:${server.address().port}`;
 await page.goto(base);
 await page.getByRole('button',{name:'How do I add a contact?',exact:true}).click();
 await page.getByRole('status',{name:'Circlo Help is typing'}).waitFor();
 assert.equal(await page.getByRole('article',{name:'Help answer'}).count(),0);
 await page.getByRole('article',{name:'Help answer'}).waitFor();
 await page.getByRole('heading',{name:'Add a contact or scan a QR code'}).waitFor();
 for(const width of [320,390,1280]){
  await page.setViewportSize({width,height:844});
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`Help fits ${width}px`);
  assert(await page.getByRole('textbox',{name:'Ask Circlo Help'}).isVisible());
  await mkdir('test-artifacts',{recursive:true});await page.screenshot({path:`test-artifacts/help-guide-${width}.png`,animations:'disabled'});
 }
 await page.goto(base+'?phone');const phone=page.getByRole('combobox',{name:'Phone number'});await phone.waitFor();await page.waitForFunction(()=>!document.querySelector('[role=combobox]').disabled);
 assert.equal(await page.locator('input:not([type=checkbox])').count(),1,'Only one phone/country input');
 await page.getByRole('button',{name:'Choose country calling code'}).click();await phone.fill('United Kingdom');await phone.press('Enter');
 assert.equal(await phone.inputValue(),'+44501234567','Changing country preserves the national number');
 await phone.fill('+971501234567');await phone.press('ArrowDown');await phone.fill('France');await phone.press('Escape');
 assert.equal(await phone.inputValue(),'+971501234567','Cancelling country search preserves the saved number');
 await page.getByRole('button',{name:'Choose country calling code'}).click();await phone.fill('+49');await phone.press('Enter');
 assert.equal(await phone.inputValue(),'+49501234567');
 await page.getByRole('button',{name:'Choose country calling code'}).click();await phone.fill('+971501234567');await phone.press('Enter');
 assert.equal(await phone.inputValue(),'+971501234567','A full number entered during country search becomes the phone value');
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:'test-artifacts/phone-field-mobile.png'});
 await page.getByRole('button',{name:'Choose country calling code'}).click();await phone.fill('United');await page.screenshot({path:'test-artifacts/phone-country-search-mobile.png'});await phone.press('Escape');
 await page.evaluate(async()=>{
  const canvas=document.createElement('canvas');canvas.width=160;canvas.height=90;const ctx=canvas.getContext('2d');ctx.fillStyle='#00cc44';ctx.fillRect(0,0,160,90);
  const stream=canvas.captureStream(10),recorder=new MediaRecorder(stream,{mimeType:'video/webm;codecs=vp8'}),chunks=[];
  recorder.ondataavailable=event=>chunks.push(event.data);const stopped=new Promise(resolve=>recorder.onstop=resolve);recorder.start();const drawing=setInterval(()=>ctx.fillRect(0,0,160,90),40);await new Promise(resolve=>setTimeout(resolve,350));recorder.stop();await Promise.race([stopped,new Promise((_,reject)=>setTimeout(()=>reject(new Error('Video fixture recorder stalled')),5000))]);clearInterval(drawing);stream.getTracks().forEach(track=>track.stop());
  const data=await new Promise(resolve=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.readAsDataURL(new Blob(chunks,{type:'video/webm'}));});sessionStorage.setItem('fixtureMedia',data);
 });
 await page.goto(base+'?media');const video=page.getByLabel('Video thumbnail');await video.waitFor();
 assert.equal(await video.getAttribute('preload'),'metadata','Video previews should decode a thumbnail without eagerly initializing full playback');
 await page.waitForFunction(()=>{const video=document.querySelector('video');return video?.readyState>=2&&video.videoWidth>0;});
 assert(await video.evaluate(video=>{const canvas=document.createElement('canvas');canvas.width=1;canvas.height=1;const ctx=canvas.getContext('2d');ctx.drawImage(video,0,0,1,1);const pixel=ctx.getImageData(0,0,1,1).data;return pixel[1]>120&&pixel[0]<80&&video.paused&&!video.controls;}),'Video preview must display a decoded frame without a play-button-only control');
 const cacheResult=await page.evaluate(async()=>{
  const key=await crypto.subtle.generateKey({name:'AES-GCM',length:256},false,['encrypt','decrypt']);
  await window.cache.writeVerifiedMessage(key,'alice','chat','slow','cipher-1','Slow verified text');
  await window.cache.writeVerifiedMessage(key,'alice','chat','fast','cipher-2','Ready verified text');
  await window.cache.writeVerifiedMessage(key,'alice','chat','stale','cipher-3','Must not persist',()=>false);
  const original=crypto.subtle.decrypt.bind(crypto.subtle);let release;const gate=new Promise(resolve=>release=resolve);
  crypto.subtle.decrypt=async function(algorithm,...args){if(new TextDecoder().decode(algorithm.additionalData).includes('\u0000slow\u0000'))await gate;return original(algorithm,...args);};
  const seen=[];let ready;const first=new Promise(resolve=>ready=resolve);
  const reading=window.cache.readVerifiedMessages(key,'alice','chat',[{id:'slow',text:'cipher-1'},{id:'fast',text:'cipher-2'}],(id,text)=>{seen.push([id,text]);if(id==='fast')ready();});
  try{
   await Promise.race([first,new Promise((_,reject)=>setTimeout(()=>reject(new Error('Ready cache row blocked by slow row')),3000))]);
   const progressive=seen.length===1&&seen[0][0]==='fast';release();await reading;
   const changed=await window.cache.readVerifiedMessage(key,'alice','chat','fast','edited-cipher');
   const otherAccount=await window.cache.readVerifiedMessage(key,'bob','chat','fast','cipher-2');
   const stale=await window.cache.readVerifiedMessage(key,'alice','chat','stale','cipher-3');
   const db=await new Promise((resolve,reject)=>{const request=indexedDB.open('circlo-verified-message-cache',1);request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
   const record=await new Promise(resolve=>{const request=db.transaction('messages').objectStore('messages').get('alice:chat:fast');request.onsuccess=()=>resolve(request.result);});db.close();
   return {progressive,changed,otherAccount,stale,encrypted:record.ciphertext instanceof ArrayBuffer&&!JSON.stringify(record).includes('Ready verified text')};
  }finally{release();crypto.subtle.decrypt=original;}
 });
 assert.deepEqual(cacheResult,{progressive:true,changed:undefined,otherAccount:undefined,stale:undefined,encrypted:true});
 assert.deepEqual(errors,[]);
 console.log('PASS: responsive help conversation, typing/reply, one phone field with country selection/cancellation, decoded video thumbnail, progressive encrypted cache, ciphertext/account isolation and stale-write guard');
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
