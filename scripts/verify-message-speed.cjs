const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert=require('node:assert/strict');
const base=process.env.QA_BASE||'https://ziptalks.vercel.app';
(async()=>{
 const browser=await chromium.launch({headless:true,channel:'chrome'});
 try {
 const contexts=await Promise.all([browser.newContext(),browser.newContext()]);
 const users=[]; const stamp=Date.now().toString(36);
 for(let i=0;i<2;i++){
 const response=await contexts[i].request.post(base+'/api/auth/register',{headers:{Origin:base},data:{displayName:'Media QA '+i,username:'med'+stamp+i,email:'med'+stamp+i+'@test.dev',password:'TestPass!2026',confirmPassword:'TestPass!2026'}});
 assert.equal(response.status(),201,await response.text()); users.push((await response.json()).user);
 }
 const response=await contexts[0].request.post(base+'/api/conversations',{headers:{Origin:base},data:{userId:users[1].id}});
 const data=await response.json(); const id=(data.conversation??data).id;
 const pages=await Promise.all(contexts.map(c=>c.newPage()));
 await Promise.all(pages.map(p=>p.goto(base+'/app/chats/'+id)));
 await pages[0].waitForTimeout(12000);
 
 
 await pages[0].reload(); await pages[0].waitForTimeout(6000);
 let pageRefreshes=0;
 for (const page of pages) page.on('request', request => {
   if (request.url().includes('/app/chats/') && request.headers().rsc === '1') pageRefreshes++;
 });
 const results=[];
 for(let i=0;i<4;i++) {
   const text='Speed check '+stamp+' '+i;
   const payload=await pages[0].locator('textarea').first();
   await payload.fill(text);
   const start=Date.now();
   const responsePromise=pages[0].waitForResponse(r=>r.url().endsWith('/messages')&&r.request().method()==='POST');
   await pages[0].getByRole('button',{name:'Send message',exact:true}).click();
   const sent=await responsePromise;
   const responseMs=Date.now()-start;
   assert.equal(sent.status(),201);
   await pages[1].getByText(text,{exact:true}).waitFor({timeout:30000});
   results.push({responseMs,recipientMs:Date.now()-start});
   await pages[0].waitForTimeout(1500);
 }
 console.log(JSON.stringify({label:process.env.QA_LABEL||'current',results,pageRefreshes}));
 assert.equal(pageRefreshes,0,'message events must not refresh the entire chat page');
 const notifications=await contexts[1].request.get(base+'/api/notifications');
 assert.equal(notifications.status(),200);
 const body=await notifications.json();
 assert.ok(body.notifications?.some(n=>n.type==='message'),'notifications must still be delivered');
 console.log('PASS: both browsers receive messages, no full-page refreshes, background notifications delivered');
 } finally {await browser.close()}
})().catch(e=>{console.error(e.stack);process.exitCode=1});
