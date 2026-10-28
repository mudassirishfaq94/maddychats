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
  if(width===390 && pass==='first' && (route==='/login' || route==='/signup')) {
   await mkdir('.freebuff/performance',{recursive:true});
   await page.screenshot({path:`.freebuff/performance/${route.slice(1)}-390.png`,fullPage:true});
  }
  if(route==='/' && pass==='first' && width===390) {
   await page.getByRole('heading',{name:'Private chat for you and your people.',exact:true}).waitFor();
   await page.getByRole('heading',{name:'What works today',exact:true}).waitFor();
   assert.equal(await page.locator('#status li').count(),5);
   assert.equal(await page.locator('#features article').count(),6);
   assert.equal(await page.locator('details').count(),4,'Landing page has four short answers');
   assert.equal(await page.getByRole('button',{name:'Android app'}).isDisabled(),true,'Android button stays disabled until a Play Store listing exists');
   assert.equal(await page.getByText('Coming soon to Google Play',{exact:true}).count(),1);
   assert.equal(await page.getByRole('link',{name:'Use in browser',exact:true}).count(),2);
   assert.equal(await page.getByRole('link',{name:'Log in',exact:true}).count(),2);
   assert.equal(await page.getByText('JoinGet started',{exact:true}).count(),0);
   assert.equal(await page.getByText('Find your circle',{exact:true}).count(),0);
   assert.equal(await page.getByText('Join Circlo',{exact:true}).count(),0);
   assert.equal(await page.getByText('010',{exact:true}).count(),0);
   assert.equal(await page.getByText('Example chats · names are made up',{exact:true}).count(),1);
   assert.equal(await page.getByRole('heading',{name:'Weekend plans',exact:true}).count(),1);
   assert.equal(await page.getByRole('link',{name:'Contact',exact:true}).getAttribute('href'),'/support');
   assert.equal(await page.locator('#roadmap').count(),0,'Long roadmap section has been removed');
   const metadata=await page.evaluate(()=>({title:document.title,canonical:document.querySelector('link[rel="canonical"]')?.getAttribute('href'),ogImage:document.querySelector('meta[property="og:image"]')?.getAttribute('content'),twitterCard:document.querySelector('meta[name="twitter:card"]')?.getAttribute('content')}));
   assert.match(metadata.title,/Circlo — Private chat for you and your people/);
   assert(metadata.canonical && metadata.ogImage && metadata.twitterCard,'Social and canonical metadata remains present');
   for(const paragraph of await page.locator('main p').allTextContents()) {
    const words=paragraph.trim().split(/\s+/).filter(Boolean);
    const sentences=paragraph.trim().split(/[.!?]+/).filter(sentence=>sentence.trim());
    assert(words.length<=32,`Landing paragraph should stay brief: ${paragraph}`);
    assert(sentences.length<=2,`Landing paragraph should contain at most two sentences: ${paragraph}`);
   }
   for(const anchor of await page.locator('a[href^="#"]').all()) assert.equal(await page.locator(await anchor.getAttribute('href')).count(),1);
   await mkdir('.freebuff/performance',{recursive:true});
   for(const size of [320,360,390,412,768,1440]) {
    await page.setViewportSize({width:size,height:900});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,`Landing overflow at ${size}px`);
    for(const control of await page.getByRole('navigation',{name:'Main navigation'}).locator('a:visible, button:visible').all()) {
     const box=await control.boundingBox();
     assert(box && box.x>=0 && box.x+box.width<=size+1,`Clipped navigation control at ${size}px`);
    }
    await page.screenshot({path:`.freebuff/performance/landing-${size}.png`,fullPage:true});
   }
   await page.setViewportSize({width,height:900});
   for(const summary of await page.locator('#questions summary').all()) {
    await summary.click();assert(await summary.evaluate(node=>node.parentElement.open));
    await summary.click();assert.equal(await summary.evaluate(node=>node.parentElement.open),false);
   }
   await page.evaluate(()=>scrollTo(0,0));
  }
  if(route==='/login'||route==='/signup') {
   const action=page.getByRole('button',{name:route==='/login'?'Sign in':'Create account',exact:true});
   const checkboxes=page.getByRole('checkbox');
   if(route==='/signup') {
    assert.equal(await checkboxes.count(),2,'Signup asks for both policy choices');
    assert(await page.evaluate(() => {
     const form=document.querySelector('form');
     const fields=[...form.querySelectorAll('input:not([type="checkbox"])')];
     const checkbox=form.querySelector('input[type="checkbox"]');
     const submit=form.querySelector('button[type="submit"]');
     return !!checkbox && !!submit && !!(fields.at(-1).compareDocumentPosition(checkbox)&Node.DOCUMENT_POSITION_FOLLOWING) && !!(checkbox.compareDocumentPosition(submit)&Node.DOCUMENT_POSITION_FOLLOWING);
    }),'Signup agreement follows fields and precedes submit');
    assert.equal(await action.isEnabled(),false);
    await page.getByRole('checkbox',{name:/Terms and Conditions/}).check();
    assert.equal(await action.isEnabled(),false);
    await page.getByRole('checkbox',{name:/Privacy Policy/}).check();
    assert.equal(await action.isEnabled(),true);
   } else {
    assert.equal(await checkboxes.count(),0,'Returning sign-in does not ask for signup consent again');
    await page.getByText(/By signing in, you confirm/).waitFor();
    assert.equal(await action.isEnabled(),true);
   }
   const google=page.getByRole('link',{name:'Continue with Google',exact:true});
   if(route==='/signup') {
    assert.equal(await google.count(),0,'New accounts use the first-party email and password form');
    assert.equal(await page.getByRole('button',{name:'Create account',exact:true}).count(),1);
   } else {
    assert.match(await google.getAttribute('href'),/^\/api\/auth\/google\?/,'Existing Google-linked users can still sign in');
    assert.equal(await page.getByText(/New here\? Continue with Google|continue with Google first/).count(),0,'New users are directed to email signup, not Google account creation');
   }
   if(route==='/signup') {
    await page.getByRole('checkbox',{name:/Terms and Conditions/}).uncheck();
    assert.equal(await action.isEnabled(),false);
   }
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
