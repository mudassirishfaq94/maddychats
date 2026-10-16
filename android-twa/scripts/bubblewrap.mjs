/** Keep generation inside the ignored project; fail closed before loading release tooling. */
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
const root=fileURLToPath(new URL('..',import.meta.url));
const args=process.argv.slice(2);
const command=args[0];
if (!['help','doctor','validate','update','build'].includes(command) || (command==='build' && !args.includes('--skipSigning')) || args.some(arg=>/^--(?:directory|manifest|signingKey|serviceAccount)/.test(arg))) {
  console.error('Only help/doctor/validate/update/unsigned build are supported. Paths are fixed to the ignored project. Signing and Play publishing require a separately reviewed procedure.');
  process.exit(1);
}
if (!process.env.npm_execpath) { console.error('Run this wrapper through npm run bubblewrap.'); process.exit(1); }
const audit=spawnSync(process.execPath,[process.env.npm_execpath,'audit','--json'],{cwd:root,encoding:'utf8',timeout:60000,maxBuffer:8*1024*1024});
let counts;
try { counts=JSON.parse(audit.stdout).metadata.vulnerabilities; } catch { /* network/config failure must not authorize release tooling */ }
if (!counts || counts.high>0 || counts.critical>0 || audit.status!==0) {
  console.error(`STOP: tooling audit not clean${counts?` (${counts.high} high, ${counts.critical} critical, ${counts.moderate} moderate)`:''}. Bubblewrap was not loaded; no SDK download, signing or generation started.`);
  process.exit(1);
}
const result=spawnSync(process.execPath,[resolve(root,'node_modules/@bubblewrap/cli/bin/bubblewrap.js'),...args],{cwd:['update','build'].includes(command)?resolve(root,'project'):root,stdio:'inherit',shell:false});
if(result.error) console.error('Could not start the isolated Bubblewrap toolchain; inspect local installation/project.');
process.exitCode=result.status??1;
