/** Called only by the isolated item3_authorization_test runner; never production. */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile, access, unlink } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

export async function testPlayCompliance({base,sql,api,account,login}) {
  assert(['127.0.0.1','localhost'].includes(new URL(base).hostname));
  assert.equal((await sql.query('select current_database() db')).rows[0].db,'item3_authorization_test');
  const owner=await account('play_delete_owner'), peer=await account('play_delete_peer');
  const cookie=await login(owner.username);
  const peerCookie=await login(peer.username);
  const dm=(await sql.query("insert into conversations(type,created_by_id) values('dm',$1) returning id",[owner.id])).rows[0];
  await sql.query('insert into conversation_members(conversation_id,user_id,accepted_at) values($1,$2,now()),($1,$3,now())',[dm.id,owner.id,peer.id]);
  const browser=await chromium.launch();
  try {
    const context=await browser.newContext({viewport:{width:320,height:740},serviceWorkers:'block'});
    const [name,...value]=cookie.split('='); await context.addCookies([{name,value:value.join('='),url:base,httpOnly:true,sameSite:'Lax'}]);
    const page=await context.newPage();
    let reports=0,blockAttempts=0;
    page.on('request',request=>{if(new URL(request.url()).pathname==='/api/reports' && request.method()==='POST') reports++;});
    await page.route(`**/api/users/${peer.id}/block`,async route=>{
      blockAttempts++;
      if(blockAttempts===1) await route.fulfill({status:503,contentType:'application/json',body:'{"error":"fixture block failure"}'});
      else await route.continue();
    });
    await page.goto(`${base}/app/chats/${dm.id}`);
    await page.getByRole('button',{name:'Chat options',exact:true}).click();
    await page.getByRole('menuitem',{name:'Report contact',exact:true}).click();
    const dialog=page.getByRole('dialog',{name:'Report',exact:true});
    await dialog.getByRole('button',{name:'Spam',exact:true}).click();
    await dialog.getByRole('switch',{name:'Block this user',exact:true}).click();
    await dialog.getByRole('button',{name:'Submit Report',exact:true}).click();
    await dialog.getByRole('alert').filter({hasText:'was not blocked'}).waitFor();
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Report dialog fits320px');
    await dialog.getByRole('button',{name:'Try blocking again',exact:true}).click();
    await dialog.getByRole('status').filter({hasText:'This person is blocked'}).waitFor();
    assert.equal(reports,1,'Retrying a block does not duplicate the successful report');
    assert.equal((await sql.query('select count(*)::int n from blocks where blocker_id=$1 and blocked_id=$2',[owner.id,peer.id])).rows[0].n,1);
    console.log('PASS320px report UI: report persisted once, failed block explained, retry persisted block without duplicate report.');
  } finally {await browser.close();}
  const group=(await sql.query("insert into conversations(type,name,created_by_id) values('group','Deletion fixture',$1) returning id",[owner.id])).rows[0];
  await sql.query("insert into conversation_members(conversation_id,user_id,role) values($1,$2,'owner'),($1,$3,'member')",[group.id,owner.id,peer.id]);
  const message=async id=>(await sql.query("insert into messages(conversation_id,sender_id,text,encrypted) values($1,$2,'encrypted-test-fixture',true) returning id",[group.id,id])).rows[0];
  const own=await message(owner.id), other=await message(peer.id);
  await sql.query("insert into oauth_accounts(user_id,provider,provider_account_id) values($1,'google',$2)",[owner.id,'fake-play-delete-'+randomUUID()]);
  const names=[`play-owned-${randomUUID()}.bin`,`play-shared-${randomUUID()}.bin`];
  const root=resolve('.next/standalone/server/uploads/files');
  await mkdir(root,{recursive:true});
  try {
    for(const name of names) {
      await writeFile(resolve(root,name),'disposable-encrypted-bytes');
      await sql.query("insert into stored_uploads(path,created_at) values($1,now()-interval '2 days')",['files/'+name]);
      await sql.query("insert into message_attachments(message_id,original_name,stored_name,mime_type,size,path,kind,encrypted) values($1,$2,$2,'application/octet-stream',26,$3,'file',true)",[own.id,name,'files/'+name]);
    }
    await sql.query("insert into message_attachments(message_id,original_name,stored_name,mime_type,size,path,kind,encrypted) values($1,$2,$2,'application/octet-stream',26,$3,'file',true)",[other.id,names[1],'files/'+names[1]]);
    assert.equal((await api('/api/privacy/delete-account','','POST',{confirm:'DELETE'})).status,401);
    assert.equal((await api('/api/privacy/delete-account',cookie,'POST',{confirm:'DELETE'},{origin:'https://attacker.invalid'})).status,403);
    assert.equal((await api('/api/privacy/delete-account',cookie,'POST',{confirm:'NO'})).status,422);
    const response=await api('/api/privacy/delete-account',cookie,'POST',{confirm:'DELETE'});
    assert.equal(response.status,200);
    for(const name of ['maddy_session','maddy_refresh']) assert(response.headers.getSetCookie().some(c=>c.startsWith(name+'=;') && /Max-Age=0/i.test(c)),name+' is expired');
    for(const [table,column] of [['users','id'],['messages','sender_id'],['device_sessions','user_id'],['oauth_accounts','user_id'],['e2ee_keys','user_id']]) assert.equal((await sql.query(`select count(*)::int n from ${table} where ${column}=$1`,[owner.id])).rows[0].n,0,table);
    assert.equal((await sql.query('select count(*)::int n from messages where id=$1',[other.id])).rows[0].n,1,'Other participant message survives');
    assert.equal((await api('/api/auth/me',cookie)).status,401,'Deleted access token is unusable');
    assert.equal((await sql.query("select count(*)::int n from admin_audit_log where action='account_self_deleted' and details->>'actorUserId'=$1",[owner.id])).rows[0].n,0,'New self-delete event contains no retained actor UUID');
    const cleaned=await fetch(base+'/api/cron/process-scheduled',{headers:{authorization:'Bearer item3-cron'}});
    assert.equal(cleaned.status,200);
    const cleanup=await cleaned.json(); assert(cleanup.retention.removed>=1);
    await assert.rejects(access(resolve(root,names[0])),'Unreferenced owned file is removed');
    await access(resolve(root,names[1]));
    assert.equal((await sql.query('select count(*)::int n from stored_uploads where path=$1',['files/'+names[1]])).rows[0].n,1,'Shared file inventory survives');
    assert.equal((await api(`/api/conversations/${group.id}/messages`,peerCookie)).status,200);
    console.log('PASS isolated deletion: CSRF/auth/confirmation, both cookies expired, identities/sessions/messages cascaded, stale token refused, owned orphan file purged, shared recipient file/message preserved.');
  } finally {for(const name of names) await unlink(resolve(root,name)).catch(()=>{});}
}
