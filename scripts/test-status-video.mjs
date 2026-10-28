import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';

/** Actual browser picker -> scanner -> storage -> authorized recipient video. */
export async function testStatusVideo(base,pool,owner,peer,source,recipient) {
  assert.equal(new URL(base).hostname,'127.0.0.1');
  assert(process.env.CLAMAV_HOST,'Video regression requires the real scanner');
  const bytes=execFileSync('ffmpeg',['-v','error','-f','lavfi','-i','color=c=blue:s=160x120:r=10','-t','2','-c:v','libvpx','-f','webm','pipe:1']);
  let status;
  try {
    await source.goto(base+'/app/status');
    await source.getByRole('button',{name:'Add status',exact:true}).click();
    await source.getByRole('button',{name:'Video',exact:true}).click();
    await source.getByLabel('Choose video',{exact:true}).setInputFiles({name:'fixture.webm',mimeType:'video/webm',buffer:bytes});
    const publishing=source.waitForResponse(r=>r.url().endsWith('/api/status')&&r.request().method()==='POST');
    await source.getByRole('button',{name:'Share status',exact:true}).click();
    const response=await publishing,result=await response.json();assert.equal(response.status(),201,result.error??'Video upload must succeed');
    status=result.status;assert.equal(status.type,'video');
    const stored=(await pool.query('select privacy,media_mime_type from statuses where id=$1',[status.id])).rows[0];
    assert.equal(stored.privacy,'selected');assert.equal(stored.media_mime_type,'video/webm');
    const media=await recipient.request.get(base+status.mediaUrl);assert.equal(media.status(),200);
    assert((await media.body()).equals(bytes));
    assert.equal((await fetch(base+status.mediaUrl)).status,401);
    await recipient.goto(base+'/app/status');
    await recipient.getByRole('button',{name:new RegExp(owner.username)}).click();
    await recipient.waitForFunction(()=>[...document.querySelectorAll('video')].some(video=>video.readyState>=2&&video.videoWidth===160));
    await recipient.getByRole('button',{name:'Close status',exact:true}).click();
    console.log('PASS Status video: phone-sized picker, real scanner/upload/storage, private chat audience, authorized video decode, anonymous denial');
  } finally {
    if(status)assert.equal((await source.request.delete(base+'/api/status/'+status.id,{headers:{Origin:base}})).status(),200);
  }
}
