import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';

/** Hold the real attachment chunk: the surrounding chat must remain mounted. */
export async function testChatHandoff(base,pool,page,owner,conversationId,baseline) {
  assert.equal(new URL(base).hostname,'127.0.0.1');
  const message=(await pool.query('select id from messages where conversation_id=$1 order by created_at desc limit 1',[conversationId])).rows[0];
  for(let n=0;n<24;n++)await pool.query("insert into messages(conversation_id,sender_id,text,created_at) values($1,$2,$3,now()-($4::text||' minutes')::interval)",[conversationId,owner.id,'Older handoff fixture '+n,n+1]);
  const file=randomUUID();
  await pool.query("insert into message_attachments(id,message_id,original_name,stored_name,mime_type,size,path,kind) values($1,$2,'handoff-fixture.txt',$3,'text/plain',10,$4,'file')",[file,message.id,file+'.txt','files/'+file+'.txt']);
  let release,held;
  const gate=new Promise(resolve=>{release=resolve;}),requested=new Promise(resolve=>{held=resolve;});
  let cursorReads=0;
  const track=request=>{if(request.url().includes('/messages?cursor='))cursorReads++;};
  page.on('request',track);
  const hold=async route=>{
    const response=await route.fetch(),body=await response.body();
    if(body.includes(Buffer.from('Loading your image, please wait'))){held();await gate;}
    await route.fulfill({response,body});
  };
  await page.route('**/_next/static/chunks/**/*.js',hold);
  try {
    await page.setViewportSize({width:390,height:2400});
    await page.reload({waitUntil:'domcontentloaded'});
    await Promise.race([requested,page.waitForTimeout(15000).then(()=>{throw new Error('The real attachment chunk was not requested');})]);
    await page.getByRole('textbox',{name:'Message text',exact:true}).waitFor();
    const text=page.getByRole('region',{name:'Messages',exact:true}).getByText(baseline,{exact:true});
    await text.waitFor();
    assert.equal(await page.getByLabel('Opening conversation',{exact:true}).count(),0,'A suspended attachment cannot replace the whole chat');
    const header=await page.getByRole('region',{name:'Conversation',exact:true}).locator('header').first().boundingBox();
    const composer=await page.getByRole('textbox',{name:'Message text',exact:true}).boundingBox();
    await page.evaluate(()=>{window.__handoffFallbacks=0;window.__handoffObserver=new MutationObserver(()=>{if(document.querySelector('[aria-label="Opening conversation"]'))window.__handoffFallbacks++;});window.__handoffObserver.observe(document,{childList:true,subtree:true});});
    await page.waitForTimeout(350);
    assert.equal(cursorReads,0,'Short newest pages must not paginate before user intent');
    release();await page.getByRole('link',{name:'Open handoff-fixture.txt',exact:true}).waitFor();
    const afterHeader=await page.getByRole('region',{name:'Conversation',exact:true}).locator('header').first().boundingBox();
    const afterComposer=await page.getByRole('textbox',{name:'Message text',exact:true}).boundingBox();
    assert(Math.abs(afterHeader.y-header.y)<1&&Math.abs(afterComposer.y-composer.y)<1,'Attachment loading keeps header and composer anchored');
    assert.equal(await page.evaluate(()=>window.__handoffFallbacks),0,'Loaded controls never return to the temporary chat surface');
    const older=page.waitForResponse(response=>response.url().includes('/messages?cursor='));
    await page.getByRole('region',{name:'Messages',exact:true}).focus();await page.keyboard.press('Home');
    assert.equal((await older).status(),200);
    await page.waitForTimeout(150);assert.equal(cursorReads,1,'One user gesture starts one older-page request');
    console.log('PASS real lazy attachment held: chat remains mounted, header/composer stay anchored, no unsolicited pagination; keyboard history loading works once');
  } finally {
    release();page.off('request',track);await page.unroute('**/_next/static/chunks/**/*.js',hold);
    await page.evaluate(()=>window.__handoffObserver?.disconnect()).catch(()=>{});
  }
}
