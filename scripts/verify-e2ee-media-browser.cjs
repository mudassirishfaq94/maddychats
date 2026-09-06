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
 const png=Buffer.from(await pages[0].evaluate(() => {const c=document.createElement('canvas');c.width=700;c.height=700;const ctx=c.getContext('2d');const im=ctx.createImageData(700,700);for(let i=0;i<im.data.length;i+=4){im.data[i]=Math.random()*256;im.data[i+1]=Math.random()*256;im.data[i+2]=Math.random()*256;im.data[i+3]=255;}ctx.putImageData(im,0,0);return c.toDataURL('image/png').split(',')[1];}), 'base64');console.log('UPLOAD BYTES',png.length);
 await pages[0].locator('input[type=file]').first().setInputFiles({name:'pixel.png',mimeType:'image/png',buffer:png});

 await pages[0].getByRole('button',{name:'Send message',exact:true}).click();
 for (let i=0;i<2;i++) {
   await pages[i].waitForFunction(() => [...document.images].some(im => im.src.startsWith('blob:') && im.complete && im.naturalWidth === 700), undefined, { timeout: 30000 });
   assert.equal(await pages[i].getByText('Media unavailable',{exact:true}).count(), 0);
 }
 console.log('PASS: 1.7 MB encrypted PNG renders on sender and recipient in Chrome');
 await Promise.all(pages.map(p=>p.reload()));
 for (const page of pages) {
   await page.waitForFunction(() => [...document.images].some(im => im.src.startsWith('blob:') && im.complete && im.naturalWidth === 700), undefined, { timeout: 30000 });
 }
 console.log('PASS: image still renders for both accounts after reload');
 } finally {await browser.close()}
})().catch(e=>{console.error(e.stack);process.exitCode=1});
