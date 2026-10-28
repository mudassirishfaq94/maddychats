import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { createServer } from "node:http";
import { build } from "esbuild";
import { chromium } from "playwright";

// Execute the actual production effect in a controlled React host. Deferred
// decrypts model a fast visible row and an unrelated missing-key/history read.
const rawSource = process.argv.includes("--before")
  ? execFileSync("git", ["show", "56a07e8:src/components/chats/chat-view.tsx"], { encoding: "utf8" })
  : await readFile("src/components/chats/chat-view.tsx", "utf8");
const source = rawSource.replace(/\r\n/g, "\n");
const begin = source.indexOf('  useEffect(() => {\n    if (!e2ee.initialized) return;\n    const bounds');
const finish = source.indexOf('  /** Plaintext for a message:', begin);
assert(begin > 0 && finish > begin, "Locate the production message-decryption effect");
const effect = source.slice(begin, finish);
const bundle = await build({ bundle: true, write: false, format: "iife", platform: "browser", jsx: "automatic", stdin: {
  loader: "tsx", resolveDir: process.cwd(), contents: `
    import React,{useState,useRef,useEffect,startTransition} from 'react';
    import {createRoot} from 'react-dom/client';
    import {mapWithConcurrency} from './src/lib/async';
    const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
    window.fast=deferred();window.slow=deferred();window.calls=0;
    const e2ee={initialized:true},conversationId='fixture',chatPerf=()=>{},cacheDecryptedMessage=()=>{};
    const decrypt=text=>{if(text==='fast'){window.calls++;return window.fast.promise;}return window.slow.promise;};
    function Host(){
      const [items,setItems]=useState([{id:'fast',text:'fast',encrypted:true,createdAt:'2026-10-28T01:00:01Z'},{id:'slow',text:'slow',encrypted:true,createdAt:'2026-10-28T01:00:00Z'}]);
      const [texts,setDecryptedTexts]=useState(new Map());const [,setDecryptedReplies]=useState(new Map());
      const [,setUnavailableMessageIds]=useState(new Set());const [decryptRetry,setDecryptRetry]=useState(0);
      const scrollRef=useRef(null),nodeRefs=useRef(new Map()),serverClockOffset=useRef(0);
      const decryptedTextsRef=useRef(texts),decryptedRepliesRef=useRef(new Map()),failedDecryptionRef=useRef(new Map());
      const missingMessageKeys=useRef(new Set()),arrivalTimesRef=useRef(new Map()),retryTimerRef=useRef(null);
      const decryptingRef=useRef(new Set()),decryptingRepliesRef=useRef(new Set()),decryptConversationRef=useRef(conversationId);
      useEffect(()=>{decryptedTextsRef.current=texts;},[texts]);
      window.refresh=()=>setItems(rows=>[...rows]);window.remove=()=>setItems([]);
      ${effect}
      return <div>{items.filter(row=>texts.has(row.id)).map(row=><p key={row.id}>{texts.get(row.id)}</p>)}</div>;
    }
    const root=createRoot(document.getElementById('root'));root.render(<Host/>);
    window.signOut=()=>root.render(<div>Signed out</div>);
  `,
} });
const server = createServer((req, res) => {
  if (req.url === "/bundle.js") { res.setHeader("Content-Type", "text/javascript"); res.end(bundle.outputFiles[0].contents); }
  else res.end('<!doctype html><div id="root"></div><script src="/bundle.js"></script>');
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page.waitForFunction(() => window.calls === 1);
  await page.evaluate(() => window.refresh());
  await page.waitForFunction(() => window.calls >= 2, undefined, { timeout: 2000 });
  await page.evaluate(() => window.fast.resolve('Readable fixture'));
  await page.getByText('Readable fixture', {exact:true}).waitFor({timeout:2000});
  // The unrelated decrypt is deliberately still unresolved: ready text must
  // not wait for the cancelled generation's entire history batch to finish.
  assert.equal(await page.getByText('Slow fixture',{exact:true}).count(),0);
  await page.evaluate(() => window.signOut());
  await page.getByText('Signed out',{exact:true}).waitFor();
  await page.evaluate(() => window.slow.resolve('Slow fixture'));
  await page.waitForTimeout(100);
  assert.equal(await page.getByText('Readable fixture',{exact:true}).count(),0);
  assert.equal(await page.getByText('Slow fixture',{exact:true}).count(),0);
  console.log('PASS production decrypt effect: history refresh does not strand fast rows behind an unresolved old batch; logout rejects late results');
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
