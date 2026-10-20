/** Online migration 0041. Standard Drizzle migrations are transactional;
 * CREATE/DROP INDEX CONCURRENTLY must use this dedicated autocommit runner.
 * DATABASE_URL=... node scripts/migrate-online-index.mjs up|down
 */
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import pg from 'pg';
import assert from 'node:assert/strict';
const expected={
 messages_undelivered_conversation_idx:'CREATE INDEX messages_undelivered_conversation_idx ON public.messages USING btree (conversation_id, sender_id) WHERE (delivered_at IS NULL)',
};
export async function migrateOnline(client,direction='up'){
 assert(['up','down'].includes(direction),'Use up or down');
 // Serialize only this migration; avoid waiting indefinitely on another runner.
 const lock=(await client.query('select pg_try_advisory_lock(847221946) locked')).rows[0].locked;
 assert(lock,'Another online-index migration is running');
 try{
 const inspect=async name=>(await client.query('select i.indisvalid,pg_get_indexdef(i.indexrelid) definition from pg_index i where i.indexrelid=to_regclass($1)',['public.'+name])).rows[0];
 for(const [name,definition] of Object.entries(expected)){
 const existing=await inspect(name);
 if(existing){assert.equal(existing.definition,definition,'Index name belongs to a different definition');if(direction==='up')assert(existing.indisvalid,'Invalid index from interrupted build: run down before retrying');}
 }
 const file=new URL(`../drizzle/online/0041_undelivered_messages.${direction}.sql`,import.meta.url);
 const statements=fs.readFileSync(file,'utf8').split('--> statement-breakpoint').map(x=>x.trim()).filter(Boolean);
 for(const statement of statements)await client.query(statement);
 for(const [name,definition] of Object.entries(expected)){
 const after=await inspect(name);
 if(direction==='up'){assert(after?.indisvalid);assert.equal(after.definition,definition);}else assert(!after);
 }
 console.log(`Online migration 0041 ${direction}: verified.`);
 }finally{
 await client.query('reset lock_timeout');await client.query('reset statement_timeout');
 await client.query('select pg_advisory_unlock(847221946)');
 }
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
 const connectionString=process.env.MIGRATION_DATABASE_URL || process.env.DATABASE_URL;
 assert(connectionString,'Migration database URL required');
 const pool=new pg.Pool({connectionString,max:1,connectionTimeoutMillis:15000});
 const client=await pool.connect();try{await migrateOnline(client,process.argv[2]??'up');}finally{client.release();await pool.end();}
}
