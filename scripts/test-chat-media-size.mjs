import assert from 'node:assert/strict';
import sharp from 'sharp';
import {execFileSync} from 'node:child_process';

/** Actual encrypted image/video delivery with the ciphertext response held. */
export async function testChatMediaSize(base,sender,recipient){
  assert.equal(new URL(base).hostname,'127.0.0.1');
  const image=await sharp({create:{width:1280,height:960,channels:3,background:'#4f7192'}}).png().toBuffer();
  const video=execFileSync('ffmpeg',['-v','error','-f','lavfi','-i','testsrc2=size=320x240:rate=4','-t','1','-c:v','libvpx','-f','webm','pipe:1'],{maxBuffer:2*1024*1024,windowsHide:true});
  const original=recipient.viewportSize();
  try{
    for(const file of [{name:'circlo-photo.png',mimeType:'image/png',buffer:image},{name:'circlo-video.webm',mimeType:'video/webm',buffer:video}]){
      let release,cleaning=false;const pending=new Set();const gate=new Promise(resolve=>release=resolve);
      const hold=route=>{const work=(async()=>{await gate;try{await route.continue();}catch(error){if(!cleaning)throw error;}})();pending.add(work);void work.finally(()=>pending.delete(work)).catch(()=>{});return work;};await recipient.route('**/api/media/**',hold);
      try{
        await sender.locator('input[type="file"]').first().setInputFiles(file);
        const accepted=sender.waitForResponse(response=>response.url().endsWith('/api/upload/message')&&response.request().method()==='POST');
        await sender.getByRole('button',{name:'Send attachments',exact:true}).click();
        const response=await accepted;assert.equal(response.status(),201,await response.text());
        const attachment=(await response.json()).message.attachments[0];
        const view=recipient.getByRole('button',{name:'View '+attachment.originalName,exact:true});await view.waitFor();
        for(const width of [320,390,1366]){
          await recipient.setViewportSize({width,height:844});
          const box=await view.boundingBox();assert(box&&box.width>=180,`A ${attachment.kind} must reserve readable width before download at ${width}px: ${JSON.stringify(box)}`);
          assert(Math.abs(box.width/box.height-4/3)<0.05,'A single media preview keeps a consistent 4:3 frame');
        }
        await recipient.setViewportSize({width:390,height:844});const before=await view.boundingBox();release();
        await view.locator(attachment.kind==='image'?'img':'video').waitFor();
        await view.locator(attachment.kind==='image'?'img':'video').evaluate(element=>new Promise((resolve,reject)=>{
          if(element instanceof HTMLImageElement&&element.complete&&element.naturalWidth>0)return resolve();
          if(element instanceof HTMLVideoElement&&element.readyState>=2)return resolve();
          const timer=setTimeout(()=>reject(new Error('Media decode did not finish')),15000);
          element.addEventListener(element instanceof HTMLImageElement?'load':'loadeddata',()=>{clearTimeout(timer);resolve();},{once:true});
          element.addEventListener('error',()=>{clearTimeout(timer);reject(new Error('Media decode failed'));},{once:true});
        }));
        const after=await view.boundingBox();assert(Math.abs(before.width-after.width)<=1&&Math.abs(before.height-after.height)<=1,'Decryption and decoding cannot resize the reserved frame');
        await view.click();await recipient.getByRole('dialog',{name:attachment.originalName,exact:true}).waitFor();
        await recipient.getByRole('button',{name:'Close',exact:true}).click();
      }finally{cleaning=true;release();await Promise.allSettled([...pending]);await recipient.unroute('**/api/media/**',hold);}
    }
    await recipient.screenshot({path:'.freebuff/performance/chat-media-size.png'});
    console.log('PASS real encrypted photo/video sizing: readable 4:3 previews at 320/390/1366px, no decode shift, full viewer opens');
  }finally{await recipient.setViewportSize(original);}
}
