import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {Pool} from 'pg';
import {drizzle} from 'drizzle-orm/node-postgres';
import {migrate} from 'drizzle-orm/node-postgres/migrator';
async function main(){
 const url=new URL(process.env.LOAD_TEST_ADMIN_URL??'');assert.equal(url.hostname,'127.0.0.1');assert.equal(url.pathname,'/postgres');
 const admin=new Pool({connectionString:url.toString()}),name=`status_audience_${randomUUID().replaceAll('-','')}_test`;let appPool:Pool|undefined;let local:Pool|undefined;
 try{await admin.query(`CREATE DATABASE "${name}"`);url.pathname=`/${name}`;process.env.DATABASE_URL=url.toString();local=new Pool({connectionString:url.toString()});await migrate(drizzle(local),{migrationsFolder:'drizzle'});
 const {statusChatAudienceIds,createStatus,canViewStatus,visibleRecipientIds}=await import('../src/server/status');appPool=(await import('../src/db')).pool;
 const ids=Array.from({length:6},()=>randomUUID());
 for(let i=0;i<ids.length;i++)await local.query('INSERT INTO users(id,username,display_name,email,password_hash,email_verified_at) VALUES($1,$2,$3,$4,$5,now())',[ids[i],`audience_${i}`,'Fixture',`audience_${i}@example.invalid`,'unused']);
 for(let i=1;i<=4;i++){const id=randomUUID();await local.query('INSERT INTO conversations(id,type,created_by_id,deleted_at) VALUES($1,$2,$3,$4)',[id,i===3?'group':'dm',ids[0],i===4?new Date():null]);await local.query('INSERT INTO conversation_members(conversation_id,user_id,accepted_at) VALUES($1,$2,now()),($1,$3,$4)',[id,ids[0],ids[i],i===2?null:new Date()]);}
 assert.deepEqual(await statusChatAudienceIds(ids[0]),[ids[1]],'Only accepted direct chats; pending requests, groups, deleted chats and strangers excluded');
 const status=await createStatus({userId:ids[0],type:'text',text:'Fixture status',privacy:'selected',selectedUserIds:await statusChatAudienceIds(ids[0])});
 assert.equal(await canViewStatus(status,ids[1]),true);for(const id of ids.slice(2))assert.equal(await canViewStatus(status,id),false);
 await local.query('INSERT INTO blocks(blocker_id,blocked_id) VALUES($1,$2)',[ids[1],ids[0]]);assert.deepEqual(await statusChatAudienceIds(ids[0]),[]);assert.equal(await canViewStatus(status,ids[1]),false);assert.deepEqual(await visibleRecipientIds(status),[ids[0]]);
 const own=await createStatus({userId:ids[0],type:'text',text:'Only me',privacy:'selected',selectedUserIds:[]});assert.equal(await canViewStatus(own,ids[5]),false);assert.equal(await canViewStatus({...status,expiresAt:new Date(0)},ids[0]),false);

 }finally{
  await appPool?.end();await local?.end();
  try{
   let active=0;
   for(let attempt=0;attempt<100;attempt++){
    active=Number((await admin.query("select count(*)::int as n from pg_stat_activity where datname=$1",[name])).rows[0].n);
    if(active===0)break;
    await new Promise(resolve=>setTimeout(resolve,50));
   }
   assert.equal(active,0,"Disposable database clients must close before deletion");
   await admin.query(`DROP DATABASE IF EXISTS "${name}"`);
  }finally{await admin.end();}
 }
 console.log('PASS status audience: accepted direct chats only; blocks, requests, deletion, strangers and expiry enforced; empty audience stays private; database cleanup completed');
}
main().catch(error=>{console.error('Status audience regression failed:',error instanceof Error?error.message:'unknown error');process.exitCode=1;});
