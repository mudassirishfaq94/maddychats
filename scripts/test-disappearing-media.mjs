import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import sharp from 'sharp';

export async function testDisappearingMedia(base,pool,owner,peer,sender,recipient,conversationId){
  assert.equal(new URL(base).hostname,'127.0.0.1');
  const controls=async seconds=>{
    await sender.getByRole('button',{name:'Chat options',exact:true}).click();
    const saved=sender.waitForResponse(r=>r.url().endsWith('/controls')&&r.request().method()==='POST');
    await sender.getByLabel('Disappearing message duration',{exact:true}).selectOption(String(seconds));
    assert.equal((await saved).status(),200);
    await sender.getByRole('button',{name:'Chat options',exact:true}).click();
    await sender.waitForFunction(seconds=>document.querySelector('select[aria-label="Disappearing message duration"]')?.value===String(seconds),seconds);
    await sender.getByRole('button',{name:'Chat options',exact:true}).click();
  };
  const sendText=async text=>{
    const saved=sender.waitForResponse(r=>r.url().endsWith('/messages')&&r.request().method()==='POST');
    await sender.getByRole('textbox',{name:'Message text',exact:true}).fill(text);
    await sender.getByRole('button',{name:'Send message',exact:true}).click();
    const response=await saved;assert.equal(response.status(),201);return (await response.json()).message;
  };
  await controls(86400);
  const text=await sendText('Timed encrypted fixture');
  await recipient.getByText('Timed encrypted fixture',{exact:true}).waitFor();
  assert(Math.abs(Date.parse(text.expiresAt)-Date.parse(text.createdAt)-86400000)<1000,'Text expiry follows the 24-hour policy within timestamp/transaction clock precision');
  const fakeId=randomUUID(),paths=Array.from({length:51},()=>`statuses/capacity-fixture-${randomUUID()}`);
  try{
    // Inventory-only fixtures simulate old shared caps without storing 400 MB
    // or broadcasting statuses. They belong solely to this disposable database.
    await pool.query("insert into message_attachments(id,message_id,original_name,stored_name,mime_type,size,path,kind,encrypted) values($1,$2,'capacity.bin','capacity.bin','application/octet-stream',419430401,'files/capacity-fixture','file',true)",[fakeId,text.id]);
    await sender.locator('input[type="file"]').first().setInputFiles({name:'timed-fixture.txt',mimeType:'text/plain',buffer:Buffer.from('Encrypted attachment expiry fixture')});
    const uploaded=sender.waitForResponse(r=>r.url().endsWith('/api/upload/message')&&r.request().method()==='POST');
    await sender.getByRole('button',{name:'Send attachments',exact:true}).click();
    const response=await uploaded;assert.equal(response.status(),201,await response.text());
    const media=(await response.json()).message;
    assert(Math.abs(Date.parse(media.expiresAt)-Date.parse(media.createdAt)-86400000)<1000,'Media receives the 24-hour timer within timestamp/transaction clock precision');
    const attachment=media.attachments[0];
    assert.equal((await recipient.request.get(base+'/api/media/'+attachment.id)).status(),200);
    await recipient.getByRole('button',{name:'Download timed-fixture.txt',exact:true}).waitFor();
    // Accelerate only fixture deadlines, keeping production's allowed durations.
    const deadline=new Date(Date.now()+1500).toISOString();
    await pool.query('update messages set expires_at=$1 where id=any($2::uuid[])',[deadline,[text.id,media.id]]);
    for(const user of [owner,peer])for(const id of [text.id,media.id])await pool.query('insert into realtime_events(user_id,payload) values($1,$2::jsonb)',[user.id,JSON.stringify({type:'message:lifetime',conversationId,messageId:id,expiresAt:deadline,serverNow:new Date().toISOString()})]);
    await recipient.getByRole('button',{name:'Download timed-fixture.txt',exact:true}).waitFor({state:'hidden',timeout:10000});
    await recipient.getByText('Timed encrypted fixture',{exact:true}).waitFor({state:'hidden',timeout:10000});
    assert.equal((await recipient.request.get(base+'/api/media/'+attachment.id)).status(),404,'Expired bytes cannot be fetched');
    await recipient.reload();await recipient.getByRole('textbox',{name:'Message text',exact:true}).waitFor();
    assert.equal(await recipient.getByText('Timed encrypted fixture',{exact:true}).count(),0);
    await controls(0);
    const untimed=await sendText('Timer disabled fixture');assert.equal(untimed.expiresAt,null);
    assert.equal((await pool.query('select expires_at from messages where id=$1',[text.id])).rows[0].expires_at.toISOString(),deadline,'Turning off does not extend older deadlines');
    await sender.getByLabel('Self-destruct message · 5 seconds after first reveal',{exact:true}).check();
    const selfDestruct=await sendText('Five second reveal fixture');
    assert.equal(await recipient.getByText('Five second reveal fixture',{exact:true}).count(),0,'Reveal is required before plaintext appears');
    const reveal=recipient.getByRole('button',{name:'Reveal · disappears in 5 seconds',exact:true});await reveal.click();
    await recipient.getByText('Five second reveal fixture',{exact:true}).waitFor();
    const lifetime=(await pool.query('select expires_at,revealed_at from messages where id=$1',[selfDestruct.id])).rows[0];
    assert.equal(lifetime.expires_at.getTime()-lifetime.revealed_at.getTime(),5000);
    await recipient.getByText('Five second reveal fixture',{exact:true}).waitFor({state:'hidden',timeout:10000});
    await pool.query('insert into stored_uploads(path) select unnest($1::text[])',[paths]);
    const image=await sharp({create:{width:40,height:40,channels:3,background:'blue'}}).png().toBuffer();
    const status=await sender.request.post(base+'/api/status',{headers:{Origin:base},multipart:{file:{name:'status-fixture.png',mimeType:'image/png',buffer:image},privacy:'selected',selectedUserIds:JSON.stringify([peer.id])}});
    assert.equal(status.status(),201,await status.text());
    const result=await status.json();assert.equal((await recipient.request.get(base+result.status.mediaUrl)).status(),200);
    assert.equal((await sender.request.delete(base+'/api/status/'+result.status.id,{headers:{Origin:base}})).status(),200);
    console.log('PASS real encrypted text/media expiry while open and after reload; media access denied after expiry; timer controls refresh; five-second reveal; uploads beyond former global status/chat caps');
  }finally{await pool.query('delete from message_attachments where id=$1',[fakeId]);await pool.query('delete from stored_uploads where path=any($1::text[])',[paths]);}
}
