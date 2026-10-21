import assert from "node:assert/strict";
import { build } from "esbuild";
import { chromium } from "playwright";
import { createServer } from "node:http";
import { once } from "node:events";
import { resolve } from "node:path";

// Exercise the real component with browser layout/ResizeObserver, without a database or product test route.
const wave=Buffer.alloc(44+160000);wave.write('RIFF');wave.writeUInt32LE(wave.length-8,4);wave.write('WAVEfmt ',8);
wave.writeUInt32LE(16,16);wave.writeUInt16LE(1,20);wave.writeUInt16LE(1,22);wave.writeUInt32LE(8000,24);
wave.writeUInt32LE(16000,28);wave.writeUInt16LE(2,32);wave.writeUInt16LE(16,34);wave.write('data',36);wave.writeUInt32LE(160000,40);
const fixture = `
import React, { useLayoutEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { createPortal } from 'react-dom';
import { VirtualMessageHistory } from './src/components/chats/virtual-message-history';
import { useRetainHistoryRow } from './src/components/chats/history-row-retention';
function Row({msg,expanded}) {
  const [open,setOpen]=useState(false);useRetainHistoryRow(msg.id,open);
  return <div data-message-id={msg.id} style={{height:expanded&&msg.id==='999'?400:50+Number(msg.id.replace('older-',''))%4*25,border:'1px solid black',boxSizing:'border-box'}}>Message {msg.id}
    {msg.id==='500'?<><audio muted loop src="data:audio/wav;base64,${wave.toString('base64')}"/><button onClick={()=>setOpen(true)}>Open viewer</button></>:null}
    {open?createPortal(<div role="dialog" aria-label="Retained viewer"><button onClick={()=>setOpen(false)}>Close viewer</button></div>,document.body):null}
  </div>;
}
function App() {
  const small = new URLSearchParams(location.search).has('small');
  const [items, setItems] = useState(Array.from({length:small?50:1000}, (_,i)=>({msg:{id:String(i+(small?475:0)),attachments:[]},showDate:false,sameSenderPrev:false})));
  const [expanded,setExpanded]=useState(false);
  const [scrollElement,setScrollElement]=useState(null);
  const scrollRef=useRef(null),contentRef=useRef(null),historyRef=useRef(null);
  useLayoutEffect(()=>{historyRef.current.scrollToEnd();window.historyFixture={
    jump:id=>historyRef.current.scrollToMessage(id),
    prepend:()=>setItems(current=>[...Array.from({length:100},(_,i)=>({msg:{id:'older-'+i,attachments:[]}})),...current]),
    expand:()=>setExpanded(true), latest:()=>historyRef.current.scrollToEnd(),
  };},[]);
  return <div ref={node=>{scrollRef.current=node;setScrollElement(node);}} data-testid="viewport" style={{height:500,width:360,overflow:'auto',position:'relative',overflowAnchor:'none'}}>
    <VirtualMessageHistory items={items} scrollRef={scrollRef} scrollElement={scrollElement} contentRef={contentRef} historyRef={historyRef} editingId={null}
      renderItem={({msg})=><Row msg={msg} expanded={expanded}/>} />
  </div>;
}
createRoot(document.getElementById('root')).render(<App/>);`;
const bundled = await build({ stdin: { contents:fixture, resolveDir:resolve('.'), sourcefile:'virtual-history-fixture.tsx', loader:'tsx' },
  bundle:true, write:false, format:'iife', platform:'browser', define:{'process.env.NODE_ENV':'"production"'}, tsconfig:'tsconfig.json' });
const fixtureCss='.relative{position:relative}.absolute{position:absolute}.left-0{left:0}.top-0{top:0}.w-full{width:100%}.flow-root{display:flow-root}.pb-4{padding-bottom:16px}';
const server=createServer((request,response)=>{response.setHeader('Content-Type',request.url==='/fixture.js'?'text/javascript':'text/html');response.end(request.url==='/fixture.js'?bundled.outputFiles[0].contents:`<!doctype html><style>${fixtureCss}</style><div id="root"></div><script src="/fixture.js"></script>`);});
server.listen(0,'127.0.0.1');await once(server,'listening');
let browser, page; const errors=[];
try {
  browser=await chromium.launch(process.env.CHROMIUM_CHANNEL ? {channel:process.env.CHROMIUM_CHANNEL} : {});
  page=await browser.newPage();page.on('pageerror',error=>errors.push(error.message));
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page.locator('[data-message-id="999"]').waitFor();
  assert(await page.locator('[data-message-id]').count()<60,'1000 loaded messages must not mount 1000 rows');
  await page.evaluate(()=>window.historyFixture.jump('500'));
  await page.locator('[data-message-id="500"]').waitFor();
  await page.waitForTimeout(200);
  const before=await page.locator('[data-message-id="500"]').evaluate(node=>node.getBoundingClientRect().top);
  await page.evaluate(()=>window.historyFixture.prepend());await page.waitForTimeout(250);
  const after=await page.locator('[data-message-id="500"]').evaluate(node=>node.getBoundingClientRect().top);
  assert(Math.abs(before-after)<3,`Prepend must preserve the visible keyed message: ${before} -> ${after}`);
  await page.locator('[data-message-id="500"] audio').evaluate(audio=>audio.play());
  await page.evaluate(()=>window.historyFixture.latest());await page.locator('[data-message-id="999"]').waitFor();
  assert.equal(await page.locator('[data-message-id="500"] audio').evaluate(audio=>audio.paused),false,'Scrolling must not interrupt voice playback');
  await page.locator('[data-message-id="500"] audio').evaluate(audio=>audio.pause());
  await page.locator('[data-message-id="500"]').waitFor({state:'detached'});
  await page.evaluate(()=>window.historyFixture.jump('500'));await page.getByRole('button',{name:'Open viewer',exact:true}).click();
  await page.getByRole('dialog',{name:'Retained viewer',exact:true}).waitFor();
  await page.evaluate(()=>window.historyFixture.latest());await page.locator('[data-message-id="999"]').waitFor();
  assert.equal(await page.getByRole('dialog',{name:'Retained viewer',exact:true}).count(),1,'A portalled media viewer must survive scrolling past its row');
  await page.getByRole('button',{name:'Close viewer',exact:true}).click();await page.locator('[data-message-id="500"]').waitFor({state:'detached'});
  await page.evaluate(()=>window.historyFixture.jump('older-0'));await page.locator('[data-message-id="older-0"]').waitFor();
  await page.evaluate(()=>window.historyFixture.latest());await page.locator('[data-message-id="999"]').waitFor();
  await page.evaluate(()=>window.historyFixture.expand());await page.waitForTimeout(250);
  assert(await page.locator('[data-message-id]').count()<60,'Dynamic resizing must keep the DOM bounded');
  await page.goto(`http://127.0.0.1:${server.address().port}/?small=1`);
  await page.waitForFunction(()=>Boolean(window.historyFixture));
  await page.evaluate(()=>window.historyFixture.jump('500'));
  await page.locator('[data-message-id="500"] audio').evaluate(async audio=>{window.originalAudio=audio;await audio.play();});
  await page.evaluate(()=>window.historyFixture.prepend());
  await page.locator('[data-virtualized="true"]').waitFor();
  const transition=await page.locator('[data-message-id="500"] audio').evaluate(audio=>({same:audio===window.originalAudio,paused:audio.paused,originalConnected:window.originalAudio.isConnected,originalPaused:window.originalAudio.paused}));
  assert(transition.same&&!transition.paused,'Switching from normal HTML to a virtual window must preserve the active audio element: '+JSON.stringify(transition));
  assert.deepEqual(errors,[]);
  console.log('PASS virtual history: bounded DOM, offscreen jumps, keyed prepend anchoring, playback/viewer retention, normal-to-window transition and dynamic heights (1100 messages)');
} catch (error) {
  console.error({errors,layout:await page?.evaluate(()=>({html:document.getElementById('root')?.innerHTML.slice(0,1200),top:document.querySelector('[data-testid="viewport"]')?.scrollTop,height:document.querySelector('[data-testid="viewport"]')?.scrollHeight}))});
  throw error;
} finally {await browser?.close();server.close();await once(server,'close');}
