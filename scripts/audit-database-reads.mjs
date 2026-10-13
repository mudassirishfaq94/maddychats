/** Usage: DATABASE_URL=... node scripts/audit-database-reads.mjs report.json
 * SELECT-only EXPLAIN ANALYZE in a read-only repeatable-read transaction.
 * Reports contain plans, timings and result hashes, never rows or bindings.
 */
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import pg from 'pg';
import {mainScreenReads} from './database-read-catalog.mjs';
export const fingerprint=rows=>createHash('sha256').update(JSON.stringify(rows.map(r=>JSON.stringify(r)).sort())).digest('hex');
export function nodes(plan){return [plan,...(plan.Plans??[]).flatMap(nodes)];}
export async function audit(client,repeats=5,onlyIds=null,userOverride=null){
 await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
 try{
 await client.query("SET LOCAL statement_timeout='30s'");
 const nullId='00000000-0000-0000-0000-000000000000';
 const history=(await client.query('select conversation_id,user_id,recipient_device_id from e2ee_key_history where recipient_device_id is not null limit 1')).rows[0];
 const userId=userOverride??history?.user_id??(await client.query('select id from users limit 1')).rows[0]?.id??nullId;
 const memberRows=(await client.query('select conversation_id from conversation_members where user_id=$1',[userId])).rows;
 const conversationIds=memberRows.map(r=>r.conversation_id);
 const conversationId=history?.conversation_id??conversationIds[0]??nullId;
 const ms=(await client.query('select id,created_at from messages where conversation_id=$1 order by created_at desc,id desc limit 51',[conversationId])).rows;
 const p={userId,conversationId,conversationIds:conversationIds.length?conversationIds:[conversationId],messageIds:ms.map(r=>r.id),
 cursorId:ms.at(-1)?.id??nullId,cursorTime:ms.at(-1)?.created_at??new Date(),now:new Date(),since:new Date(Date.now()-600000),
 sessionId:(await client.query('select id from device_sessions where user_id=$1 limit 1',[userId])).rows[0]?.id??nullId,
 statusIds:(await client.query('select id from statuses limit 100')).rows.map(r=>r.id),communityIds:(await client.query('select id from communities limit 20')).rows.map(r=>r.id),
 historyConversation:history?.conversation_id??conversationId,historyUser:history?.user_id??userId,historyDevice:history?.recipient_device_id??'unknown-device',
 dmKey:(await client.query('select dm_key from conversations where id=$1',[conversationId])).rows[0]?.dm_key??'unknown'};
 p.statusIds=p.statusIds.length?p.statusIds:[nullId];p.communityIds=p.communityIds.length?p.communityIds:[nullId];
 const statView=(await client.query("select to_regclass('pg_stat_statements') view")).rows[0].view;
 let statementStatistics=null;
 if(statView){
  await client.query('savepoint statement_statistics');
  try{statementStatistics=(await client.query("select calls,total_exec_time,mean_exec_time,rows,query from pg_stat_statements where dbid=(select oid from pg_database where datname=current_database()) order by total_exec_time desc limit 100")).rows.map(r=>({...r,query:r.query.replace(/'[^']*'/g,"'<redacted>'")}));}
  catch{await client.query('rollback to savepoint statement_statistics');}
  await client.query('release savepoint statement_statistics');
 }
 const indexStatistics=(await client.query("select s.relname,s.indexrelname,s.idx_scan,pg_relation_size(s.indexrelid) bytes,i.indisunique,i.indisprimary,i.indisvalid,pg_get_indexdef(s.indexrelid) definition from pg_stat_user_indexes s join pg_index i on i.indexrelid=s.indexrelid where s.schemaname='public' order by s.relname,s.indexrelname")).rows;
 const reads=mainScreenReads(p).filter(r=>!onlyIds||onlyIds.includes(r.id)),results=[];
 for(const read of reads){
 if(!/^(select|with copies as)\b/i.test(read.sql)||/\b(insert|update|delete|for update)\b/i.test(read.sql))throw Error('Non-read query rejected');
 const samples=[];let plan;
 // Warm-up excluded; do not force planner settings or alter statistics.
 for(let i=0;i<=repeats;i++){
  const data=(await client.query('EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) '+read.sql,read.params)).rows[0]['QUERY PLAN'][0];
  if(i)samples.push(data['Execution Time']);plan=data;
 }
 const rows=(await client.query(read.sql,read.params)).rows;
 const all=nodes(plan.Plan);
 results.push({id:read.id,screen:read.screen,source:read.source,sql:read.sql,samplesMs:samples,medianMs:samples.toSorted((a,b)=>a-b)[Math.floor(samples.length/2)],
 rows:rows.length,resultHash:fingerprint(rows),wholeTableScans:all.filter(n=>/Seq Scan/.test(n['Node Type'])).map(n=>n['Relation Name']),
 indexes:[...new Set(all.map(n=>n['Index Name']).filter(Boolean))],plan:JSON.parse(JSON.stringify(plan).replace(/'[^']*'/g,"'<redacted>'"))});
 console.log(`${read.id}: ${results.at(-1).medianMs.toFixed(3)} ms`);
 }
 const metadata=(await client.query('select version(),pg_database_size(current_database()) bytes,stats_reset from pg_stat_database where datname=current_database()')).rows[0];
 await client.query('COMMIT');return {recordedAt:new Date().toISOString(),repeats,warmupExcluded:true,readOnly:true,metadata,statementStatistics,indexStatistics,results};
 }catch(e){await client.query('ROLLBACK');throw e;}
}
if(process.argv[1]?.endsWith('audit-database-reads.mjs')){
 if(!process.env.DATABASE_URL)throw Error('DATABASE_URL required');
 const pool=new pg.Pool({connectionString:process.env.DATABASE_URL,max:1});
 const client=await pool.connect();try{fs.writeFileSync(process.argv[2]??'database-read-audit.json',JSON.stringify(await audit(client,5,null,process.env.DATABASE_AUDIT_USER_ID??null),null,2)+'\n');}finally{client.release();await pool.end();}
}
