import assert from 'node:assert/strict';
import { mkdir,writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const base=process.env.PUBLIC_PREVIEW_URL??'http://127.0.0.1:3138';
assert(['127.0.0.1','localhost'].includes(new URL(base).hostname),'Use a local preview; this test is not a production crawler');
const routes=['/','/privacy','/terms','/support','/delete-account','/whatsapp-alternative'];
const widths=[320,375,390,768,1024,1440];
const output='.freebuff/performance/privacy-pages';await mkdir(output,{recursive:true});
const browser=await chromium.launch({headless:true});const errors=[];const results=[];const links=new Set();
try {
 const page=await browser.newPage();page.on('pageerror',error=>errors.push(error.message));
 for(const route of routes){
  const response=await page.goto(base+route,{waitUntil:'networkidle'});assert.equal(response.status(),200,route);
  assert.equal(await page.locator('h1').count(),1,route+' has one main heading');
  assert(await page.title(),route+' has a page title');
  const description=await page.locator('meta[name="description"]').getAttribute('content');assert(description?.length>20,route+' has a description');
  for(const width of widths){
   await page.setViewportSize({width,height:844});
   const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1);
   assert.equal(overflow,false,`${route} has no horizontal overflow at ${width}px`);
   results.push({route,width,status:200,overflow});
   if(width===390){
    await page.screenshot({path:`${output}/${route==='/'?'home':route.slice(1)}-390.png`,fullPage:true});
    await page.screenshot({path:`${output}/${route==='/'?'home':route.slice(1)}-390-first-screen.png`});
   }
  }
  for(const href of await page.locator('a[href]').evaluateAll(elements=>elements.map(el=>el.getAttribute('href')))){
   if(href.startsWith('#'))assert.equal(await page.locator(`[id="${href.slice(1)}"]`).count(),1,'Anchor exists: '+href);
   if(href.startsWith('/'))links.add(href);
  }
  const text=await page.locator('main').innerText();
  assert(!text.includes('word-based recovery phrase are not available yet'),'No obsolete phrase claim');
  assert(!text.includes('100% guaranteed'),'No absolute security promise');
 }
 for(const href of links){const response=await page.request.get(base+href);assert(response.status()<400,`${href} returns ${response.status()}`);}
 await page.goto(base+'/privacy');const privacy=await page.locator('main').innerText();
 assert.match(privacy,/24-word phrase/);assert.match(privacy,/Status updates.*access controls rather than end-to-end encryption/s);
 assert.match(privacy,/Circlo delivers encrypted copies/,'Distinguish encrypted delivery from readable message text');
 assert.doesNotMatch(privacy,/Neon|Bluehost|Cloudflare|Supabase|Firebase|Resend/,'Explain service purposes without publishing the technology inventory');
 await page.goto(base+'/support');assert.equal(await page.getByRole('link',{name:'mudassarmalak090@gmail.com',exact:true}).count(),1);
 assert.deepEqual(errors,[],'Public pages produce no browser JavaScript errors');
 await writeFile(output+'/results.json',JSON.stringify({results,internalLinks:[...links],browserErrors:errors},null,2));
 console.log(`PASS ${routes.length} public routes at ${widths.length} widths; ${links.size} internal links; titles, descriptions, heading structure, anchors, recovery/status disclosures and zero browser errors`);
}finally{await browser.close();}
