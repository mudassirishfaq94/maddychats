import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';
// Offline inspection only. Never connects to a database or changes a ledger.
const input=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
const ledger=Array.isArray(input)?input:input.ledger;
if(!Array.isArray(ledger))throw Error('Expected a ledger array or an object containing ledger');
const journal=JSON.parse(fs.readFileSync('drizzle/meta/_journal.json','utf8')).entries;
const hash=s=>crypto.createHash('sha256').update(s).digest('hex');
const historicalDirectory=process.argv[3];
const historicalEquivalent=[];
const expected=journal.map(e=>{const raw=fs.readFileSync(path.join('drizzle',e.tag+'.sql'),'utf8');return {tag:e.tag,time:String(e.when),raw:hash(raw),lf:hash(raw.replaceAll('\r\n','\n'))}});
const missing=[],mismatched=[],lineEndingOnly=[],duplicateTimes=[];
for(const e of expected){const rows=ledger.filter(x=>String(x.created_at)===e.time);if(!rows.length)missing.push(e.tag);else if(rows.length>1)duplicateTimes.push(e.time);else if(rows[0].hash===e.raw){}else if(rows[0].hash===e.lf)lineEndingOnly.push(e.tag);else if(historicalDirectory){const file=path.join(historicalDirectory,e.tag+'.sql');const saved=fs.existsSync(file)?fs.readFileSync(file,'utf8'):null;if(saved!==null&&hash(saved)===rows[0].hash&&hash(saved.replaceAll('\r\n','\n'))===e.lf)historicalEquivalent.push(e.tag);else mismatched.push(e.tag)}else mismatched.push(e.tag)}
const unexpected=ledger.filter(x=>!expected.some(e=>e.time===String(x.created_at))).map(x=>({id:x.id,created_at:String(x.created_at)}));
const result={expectedCount:expected.length,actualCount:ledger.length,missing,mismatched,unexpected,duplicateTimes,lineEndingOnly,historicalEquivalent,note:'LF-equivalent historical hashes are distinguished from actual content mismatches. No normalization or ledger mutation is performed.'};
console.log(JSON.stringify(result,null,2));if(missing.length||mismatched.length||unexpected.length||duplicateTimes.length)process.exitCode=1;
