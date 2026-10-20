import assert from "node:assert/strict";
import {chromium} from "playwright";
import {mkdir} from "node:fs/promises";
const base=process.env.PREVIEW_BASE??"http://127.0.0.1:3137";
assert(new URL(base).hostname==="127.0.0.1","Local preview only");
const browser=await chromium.launch();
try {
 await mkdir("test-artifacts",{recursive:true});
 for(const theme of ["light","dark"]){
  const context=await browser.newContext({viewport:{width:390,height:844}});
  await context.addInitScript(theme=>localStorage.setItem("maddy-theme",theme),theme);
  const page=await context.newPage();
  for(const route of ["login","signup"]){
   await page.goto(base+"/"+route);const entry=page.getByRole("link",{name:/Start a temporary chat/});await entry.waitFor();await page.waitForTimeout(400);
   const box=await entry.boundingBox();assert(box&&box.y+box.height<400,"Temporary chat visible before scrolling");
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),"No horizontal overflow");
   assert.equal(await page.evaluate(()=>document.activeElement?.tagName==="INPUT"),false,"Do not trigger a mobile keyboard before choosing a feature");
   assert.equal(await entry.getAttribute("href"),"/temporary");
   await page.screenshot({path:`test-artifacts/${route}-${theme}-mobile.png`,fullPage:true});
  }
  await page.setViewportSize({width:320,height:640});await page.goto(base+"/login");
  const small=await page.getByRole("link",{name:/Start a temporary chat/}).boundingBox();assert(small&&small.y+small.height<400);
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  await page.setViewportSize({width:1440,height:1000});await page.goto(base+"/login");await page.waitForTimeout(400);
  await page.screenshot({path:`test-artifacts/login-${theme}-desktop.png`,fullPage:true});await context.close();
 }
 console.log("PASS: real login/signup light/dark previews, 320px and 390px layout, temporary-chat destination, no automatic keyboard, desktop captures");
}finally{await browser.close();}
