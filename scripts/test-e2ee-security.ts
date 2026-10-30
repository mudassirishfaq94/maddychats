/** Execute real active-path assertions. This is not a ratchet/audit certification. */
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { createRequire } from "node:module";

const cli=createRequire(import.meta.url).resolve("tsx/cli");
const result=spawnSync(process.execPath,[cli,"--test",resolve("tests/e2ee-active-crypto.test.ts")],{stdio:"inherit",windowsHide:true});
if(result.error)throw result.error;
process.exitCode=result.status??1;
