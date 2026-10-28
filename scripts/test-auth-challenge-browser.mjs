import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { build } from 'esbuild';
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
const source=`import React from 'react'; import { createRoot } from 'react-dom/client'; import { useSecurityCheck } from './src/components/auth/security-check'; function Form(){const check=useSecurityCheck('login');return <form onSubmit={e=>{e.preventDefault();if(check.ready){window.sent=check.token;check.reset();}}}>{check.field}<button disabled={!check.ready}>Sign in</button></form>} createRoot(document.getElementById('root')).render(<Form/>);`;
const bundle=await build({stdin:{contents:source,loader:'tsx',resolveDir:process.cwd()},bundle:true,write:false,format:'iife',platform:'browser',define:{'process.env.NODE_ENV':'"production"'}});
const server=createServer((req,res)=>{if(req.url==='/bundle.js'){res.setHeader('content-type','text/javascript');res.end(bundle.outputFiles[0].text);}else{res.setHeader('content-type','text/html');res.setHeader('Content-Security-Policy',"script-src 'nonce-fixture' 'strict-dynamic'; frame-src https://challenges.cloudflare.com");res.end('<div id="root"></div><script nonce="fixture" src="/bundle.js"></script>');}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch();
let assertions=0;
try{
 for(const scenario of ['enabled','disabled','config-error','provider-error']){
  const context=await browser.newContext({viewport:{width:360,height:780}}); const page=await context.newPage();const violations=[];
  await page.exposeFunction('recordViolation',value=>violations.push(value));
  await page.addInitScript(()=>document.addEventListener('securitypolicyviolation',e=>window.recordViolation(e.effectiveDirective)));
  await page.route('**/api/auth/challenge',r=>r.fulfill({status:scenario==='config-error'?503:200,contentType:'application/json',body:JSON.stringify({enabled:scenario!=='disabled',siteKey:'fixture-site'})}));
  await page.route('https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit',r=>scenario==='provider-error'?r.abort():r.fulfill({contentType:'text/javascript',body:`window.turnstile={render(el,o){window.solve=()=>o.callback('fixture-proof');window.expire=()=>o['expired-callback']();window.actions=o;return 'widget';},reset(){window.resets=(window.resets||0)+1;},remove(){}};`}));
  await page.goto(base);const button=page.getByRole('button',{name:'Sign in',exact:true});
  if(scenario==='disabled'){await button.waitFor();await page.waitForFunction(()=>!document.querySelector('form button').disabled);await button.click();assert.equal(await page.evaluate(()=>window.sent),'');assertions++;}
  else if(scenario.endsWith('error')){await page.getByRole('alert').waitFor();assert(await button.isDisabled());assert.equal(await page.evaluate(()=>window.sent),undefined);assertions+=2;}
  else{
   await page.waitForFunction(()=>Boolean(window.solve));assert(await button.isDisabled());await page.evaluate(()=>window.solve());await page.waitForFunction(()=>!document.querySelector('form button').disabled);await page.evaluate(()=>window.expire());assert(await button.isDisabled());await page.evaluate(()=>window.solve());await button.click();assert.equal(await page.evaluate(()=>window.sent),'fixture-proof');assert(await button.isDisabled());assert.equal(await page.evaluate(()=>window.resets),1);assert.equal(await page.evaluate(()=>window.actions.action),'login');assertions+=6;
  }
  assert.deepEqual(violations,[]);assertions++;await context.close();
 }
 console.log(`PASS ${assertions} browser assertions: proof required, expired proof, retry reset, provider/config outage, disabled configuration, nonce CSP. Provider is a labelled test double.`);
 await mkdir('.freebuff/performance',{recursive:true});await writeFile('.freebuff/performance/auth-challenge-browser.json',JSON.stringify({assertions,provider:'test double',width:360,passed:true},null,2));
}finally{await browser.close();await new Promise(r=>server.close(r));}
