import assert from "node:assert/strict";
import {mkdir,writeFile} from "node:fs/promises";

// Real click-to-paint timings. Page headings and usable controls are measured separately.
async function measure(page,link,path,selector,text,readySelector=selector,readyText=text) {
 const result=page.evaluate(({path,selector,text,readySelector,readyText})=>new Promise((resolve,reject)=>{
  let started=0,paint=null,queued=false;
  const visible=(selector,text)=>[...document.querySelectorAll(selector)].some(node=>node.checkVisibility()&&(!text||node.textContent?.trim()===text)&&!node.disabled);
  const finish=()=>{if(!started||location.pathname!==path||!visible(selector,text)||queued)return;queued=true;
   requestAnimationFrame(()=>requestAnimationFrame(()=>{queued=false;if(location.pathname!==path||!visible(selector,text))return;
    paint??=performance.now()-started;
    if(visible(readySelector,readyText)){cleanup();resolve({paintMs:paint,usableMs:performance.now()-started});}
   }));
  };
  const clicked=()=>{started=performance.now();finish();};
  const observer=new MutationObserver(finish);observer.observe(document,{subtree:true,childList:true,attributes:true});
  document.addEventListener("click",clicked,{capture:true,once:true});
  const interval=setInterval(finish,16),timeout=setTimeout(()=>{cleanup();reject(new Error(`Navigation did not become usable: ${path}`));},30000);
  function cleanup(){observer.disconnect();clearInterval(interval);clearTimeout(timeout);document.removeEventListener("click",clicked,true);}
 }),{path,selector,text,readySelector,readyText});
 await link.click();return result;
}
const summarize=rows=>{
 const percentile=(values,p)=>values.toSorted((a,b)=>a-b)[Math.ceil(values.length*p)-1];
 return {samples:rows.length,paintMedianMs:Math.round(percentile(rows.map(r=>r.paintMs),.5)),paintP95Ms:Math.round(percentile(rows.map(r=>r.paintMs),.95)),usableP95Ms:Math.round(percentile(rows.map(r=>r.usableMs),.95))};
};
export async function testNavigationLatency(context,base,conversationId) {
 const page=await context.newPage();page.setDefaultTimeout(30000);await page.setViewportSize({width:390,height:844});
 const requests=[];page.on("request",request=>{if(new URL(request.url()).searchParams.has("_rsc"))requests.push({url:request.url(),time:Date.now()});});
 const rows=[],additionalTabs=[];const cdp=await context.newCDPSession(page);
 try{
  await page.goto(base+"/app");await page.getByLabel("Search conversations",{exact:true}).waitFor();
  const sidebar=page.getByRole("complementary",{name:"Conversations",exact:true});
  const help=await sidebar.getByRole("link",{name:"Open Circlo Help",exact:true}).boundingBox();
  const listBottom=await sidebar.getByRole("list").first().evaluate(list=>list.parentElement.getBoundingClientRect().bottom);
  assert(help&&help.width>=44&&help.height>=44,"Help remains an accessible touch target");
  assert(listBottom>help.y+help.height,"Chat scrolling must extend behind Help without a full-width footer cutting off the list");
  await page.waitForTimeout(2000);
  for(const scenario of ["normal","mobile-100ms-4xCPU"]){
   if(scenario!=="normal"){
    await cdp.send("Network.enable");await cdp.send("Network.emulateNetworkConditions",{offline:false,latency:100,downloadThroughput:1250000,uploadThroughput:625000});
    await cdp.send("Emulation.setCPUThrottlingRate",{rate:4});
   }
   for(let round=0;round<3;round++){
    const nav=()=>page.getByRole("navigation",{name:"Mobile navigation",exact:true});
    for(const target of [
     {name:"Status",path:"/app/status",selector:"h1",text:"Status",readySelector:"h2",readyText:"My Status"},
     {name:"Settings",path:"/app/settings",selector:"h1",text:"Settings"},
     {name:"Chats",path:"/app/chats",selector:"h1",text:"Chats"},
    ]){
     const before=requests.length;const timing=await measure(page,nav().getByRole("link",{name:target.name,exact:true}),target.path,target.selector,target.text,target.readySelector,target.readyText);
     rows.push({scenario,round,route:target.name,...timing,rscRequests:requests.length-before});
     await page.waitForTimeout(250);
    }
    const chat=page.locator(`a.chat-list-row[href="/app/chats/${conversationId}"]`);await chat.waitFor();
    const before=requests.length;const timing=await measure(page,chat,`/app/chats/${conversationId}`,'textarea[aria-label="Message text"]',null);
    if(process.env.NAV_BASELINE!=="1")assert(requests.slice(before).some(request=>new URL(request.url).pathname===`/app/chats/${conversationId}`),"Opening a chat must fetch authorized current history, not reuse a full-route snapshot");
    rows.push({scenario,round,route:"Open chat",...timing,rscRequests:requests.length-before});
    await nav().getByRole("link",{name:"Chats",exact:true}).click();await page.getByLabel("Search conversations",{exact:true}).waitFor();await page.waitForTimeout(250);
   }
   for(let round=0;round<2;round++)for(const target of [
    {name:"Calls",path:"/app/calls",text:"Calls"},
    {name:"People",path:"/app/people",text:"Your people"},
    {name:"Communities",path:"/app/communities",text:"Communities"},
   ]){
    const link=page.getByRole("navigation",{name:"Mobile navigation",exact:true}).getByRole("link",{name:target.name,exact:true});
    additionalTabs.push({scenario,round,route:target.name,...await measure(page,link,target.path,"h1",target.text)});
    await page.waitForTimeout(250);
   }
  }
  const summary=Object.fromEntries(["normal","mobile-100ms-4xCPU"].map(scenario=>[scenario,summarize(rows.filter(row=>row.scenario===scenario&&row.round>0))]));
  await mkdir("test-artifacts",{recursive:true});await writeFile(`test-artifacts/navigation-latency-${process.env.NAV_BASELINE==="1"?"before":"after"}.json`,JSON.stringify({conditions:{browser:"Chromium production build",mobileViewport:"390x844",network:"normal loopback; then 100ms HTTP latency and 4x CPU slowdown",measure:"real click to two animation frames; Status usable waits for My Status; chat usable waits for fresh composer; other tabs measure page appearance"},summary,rows,additionalTabs},null,2));
  console.log("NAVIGATION LATENCY:",JSON.stringify(summary));
  assert(rows.every(row=>Number.isFinite(row.paintMs)&&Number.isFinite(row.usableMs)),"Every navigation must paint and become usable");
  if(process.env.NAV_BASELINE!=="1")assert(summary.normal.paintP95Ms<500,"Warm navigation must remain within the controlled 500ms regression budget; report actual timings against the 100–300ms target");
  await cdp.send("Emulation.setCPUThrottlingRate",{rate:1});
  await cdp.send("Network.emulateNetworkConditions",{offline:false,latency:0,downloadThroughput:-1,uploadThroughput:-1});
  await page.locator('header button[aria-haspopup="menu"]').last().click();
  await page.getByRole("menuitem",{name:"Sign out",exact:true}).click();await page.waitForURL(/\/login/);
  await page.goBack();await page.waitForURL(/\/login/);
  assert.equal(await page.getByLabel("Search conversations",{exact:true}).count(),0,"Logout must invalidate private route prefetches, including browser back");
  assert.equal((await context.request.get(base+"/api/auth/me")).status(),401,"Prefetching must not bypass the server session check");
  console.log("PASS navigation paint/readiness measurement and prefetched-page isolation after sign-out");
 }finally{await cdp.detach();await page.close();}
}
