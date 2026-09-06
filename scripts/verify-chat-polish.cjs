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
 const errors=[];
 for (const page of pages) {
   page.on('pageerror', error => { if (!error.message.includes('#418')) errors.push(error.message); });
   await page.route('**/api/media/**', async route => { await new Promise(resolve=>setTimeout(resolve,1000)); await route.continue(); });
 }
 const input=pages[0].getByRole('textbox',{name:'Message text'});
 await input.fill('🤩');
 const sendResponse=pages[0].waitForResponse(r=>r.url().endsWith('/messages')&&r.request().method()==='POST');
 await pages[0].getByRole('button',{name:'Send message',exact:true}).click();
 const message=(await (await sendResponse).json()).message;
 assert.equal(message.encrypted,true,'text must be encrypted');
 for (const page of pages) {
   const emoji=page.locator('p').filter({hasText:/^🤩$/}).first();
   await emoji.waitFor({timeout:30000});
   assert.ok(await emoji.evaluate(node=>parseFloat(getComputedStyle(node).fontSize)>=48));
   await page.getByRole('complementary',{name:'Conversations'}).getByText('🤩',{exact:true}).waitFor({timeout:30000});
 }
 await input.focus();
 assert.equal(await input.evaluate(node=>getComputedStyle(node).outlineStyle),'none');
 console.log('PASS: encrypted text and locally decrypted previews, large single emoji, no composer outline');
 const samples=16000;const wav=Buffer.alloc(44+samples*2);
 wav.write('RIFF',0);wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(16000,24);wav.writeUInt32LE(32000,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(samples*2,40);
 for(let i=0;i<samples;i++)wav.writeInt16LE(Math.sin(i*2*Math.PI*440/16000)*3000,44+i*2);
 await pages[0].locator('input[type=file]').first().setInputFiles({name:'voice.wav',mimeType:'audio/wav',buffer:wav});
 const upload=pages[0].waitForResponse(r=>r.url().endsWith('/api/upload/message')&&r.request().method()==='POST');
 await pages[0].getByRole('button',{name:'Send message',exact:true}).click();
 const attachment=(await (await upload).json()).message.attachments[0];
 assert.equal(attachment.encrypted,true);
 for (const page of pages) {
   await page.getByRole('button',{name:'Play voice message',exact:true}).waitFor({timeout:30000});
   await page.getByRole('button',{name:'Play voice message',exact:true}).click();
   await page.getByRole('button',{name:'Pause voice message',exact:true}).waitFor({timeout:5000});
 }
 await Promise.all(pages.map(page=>page.reload()));
 for (const page of pages) await page.getByRole('button',{name:'Play voice message',exact:true}).waitFor({timeout:30000});
 assert.deepEqual(errors,[]);
 console.log('PASS: delayed encrypted voice loads, plays, and reopens for both users without crashes');
 } finally {await browser.close()}
})().catch(e=>{console.error(e.stack);process.exitCode=1});
