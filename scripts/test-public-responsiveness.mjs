import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {chromium} from 'playwright';
import {writeFile} from 'node:fs/promises';
// Sequential public-page samples only: no load test, logins, mail or third-party API calls.
const base=process.env.PUBLIC_QA_BASE_URL || 'http://127.0.0.1:3000';
const target=new URL(base);
assert(['127.0.0.1','localhost','circlo.chat'].includes(target.hostname));
assert(!target.username && !target.password);
const label=process.env.PUBLIC_QA_LABEL || 'public-responsiveness';
assert(/^[a-z0-9-]{1,60}$/.test(label));
const browser=await chromium.launch();const results=[];
try {
for(const width of [390,1440]) {
 const context=await browser.newContext({viewport:{width,height:900},isMobile:width===390,hasTouch:width===390,serviceWorkers:'block'});
 const page=await context.newPage();const cdp=await context.newCDPSession(page);
 if(width===390){await cdp.send('Emulation.setCPUThrottlingRate',{rate:4});await cdp.send('Network.enable');await cdp.send('Network.emulateNetworkConditions',{offline:false,latency:80,downloadThroughput:200000,uploadThroughput:100000});}
 await page.addInitScript(()=>{window.__qa={lcp:0,cls:0};new PerformanceObserver(l=>{for(const e of l.getEntries())window.__qa.lcp=e.startTime;}).observe({type:'largest-contentful-paint',buffered:true});new PerformanceObserver(l=>{for(const e of l.getEntries())if(!e.hadRecentInput)window.__qa.cls+=e.value;}).observe({type:'layout-shift',buffered:true});});
 for(const route of ['/','/login','/signup','/forgot-password','/privacy','/terms'])for(const pass of ['first','repeat']){
  const errors=[];const listener=e=>errors.push(e.message.slice(0,120));page.on('pageerror',listener);
  const response=await page.goto(base+route,{waitUntil:'load',timeout:90000});await page.waitForTimeout(1500);
  const metrics=await page.evaluate(()=>{const n=performance.getEntriesByType('navigation')[0];return {...window.__qa,ttfb:n.responseStart-n.requestStart,load:n.loadEventEnd-n.startTime,overflow:document.documentElement.scrollWidth>innerWidth+1,buttons:[...document.querySelectorAll('button')].filter(b=>b.getBoundingClientRect().width>0).length};});
  assert.equal(response.status(),200,route);
  assert.equal(metrics.overflow,false,`${route} horizontal overflow at ${width}px`);
  assert.deepEqual(errors,[],`${route} browser errors`);
  if(route==='/login'||route==='/signup') {
   const action=page.getByRole('button',{name:route==='/login'?'Sign in':'Create account',exact:true});
   assert.equal(await action.isEnabled(),false);
   await page.getByRole('checkbox',{name:/Terms and Conditions/}).check();
   assert.equal(await action.isEnabled(),false);
   await page.getByRole('checkbox',{name:/Privacy Policy/}).check();
   assert.equal(await action.isEnabled(),true);
   const google=page.getByRole('link',{name:'Continue with Google',exact:true});
   assert.match(await google.getAttribute('href'),/terms=1&privacy=1/);
   await page.getByRole('checkbox',{name:/Terms and Conditions/}).uncheck();
   assert.equal(await action.isEnabled(),false);
   assert.equal(await google.getAttribute('aria-disabled'),'true');
   await page.getByLabel('Password',{exact:true}).fill('visibility-probe');
   await page.getByRole('button',{name:'Show password',exact:true}).click();
   assert.equal(await page.getByLabel('Password',{exact:true}).getAttribute('type'),'text');
   const box=await page.getByRole('button',{name:'Hide password',exact:true}).boundingBox();
   assert(box.width>=44 && box.height>=44,'Password touch target');
   await page.getByRole('button',{name:'Hide password',exact:true}).click();
  }
  results.push({width,route,pass,status:response.status(),...metrics,errors});page.off('pageerror',listener);
 }
 await context.close();
}
}finally{await browser.close();}
await mkdir('.freebuff/performance',{recursive:true});
await writeFile('.freebuff/performance/'+label+'.json',JSON.stringify({generatedAt:new Date().toISOString(),conditions:'single cold/warm sample per route; mobile Chromium 4x CPU/80ms/1.6Mbps; not field p95',results},null,2));
console.log(JSON.stringify(results.map(({width,route,pass,ttfb,load,lcp,cls,overflow,errors})=>({width,route,pass,ttfb:Math.round(ttfb),load:Math.round(load),lcp:Math.round(lcp),cls:+cls.toFixed(3),overflow,errors})),null,2));
