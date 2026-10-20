import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildConfiguration } from './config.mjs';

const root=fileURLToPath(new URL('..',import.meta.url));
const problems=[];
try {
  const inputs=JSON.parse(await readFile(resolve(root,'.local/release-inputs.json'),'utf8'));
  const expected=buildConfiguration(inputs,resolve(root,'..'));
  const actual=JSON.parse(await readFile(resolve(root,'project/twa-manifest.json'),'utf8'));
  for (const key of Object.keys(expected.manifest)) if(JSON.stringify(actual[key])!==JSON.stringify(expected.manifest[key])) problems.push(`Review configuration mismatch: ${key}`);
  const gradle=await readFile(resolve(root,'project/app/build.gradle'),'utf8');
  if (!/targetSdk(?:Version)?\s*(?:=\s*)?(?:3[6-9]|[4-9]\d)\b/.test(gradle)) problems.push('Generated app must target SDK36 or newer.');
  if (!/compileSdk(?:Version)?\s*(?:=\s*)?(?:3[6-9]|[4-9]\d)\b/.test(gradle)) problems.push('Generated app must compile with SDK36 or newer.');
  const manifest=await readFile(resolve(root,'project/app/src/main/AndroidManifest.xml'),'utf8');
  if (/READ_MEDIA_|READ_EXTERNAL_STORAGE|WRITE_EXTERNAL_STORAGE|USE_FULL_SCREEN_INTENT|FOREGROUND_SERVICE|RECEIVE_BOOT_COMPLETED|USE_BIOMETRIC/.test(manifest)) problems.push('Unexpected broad Android permissions: inspect before building.');
  if (/android:debuggable\s*=\s*"true"|android:usesCleartextTraffic\s*=\s*"true"/.test(manifest)) problems.push('Unsafe Android debug/cleartext setting.');
  if (!/LauncherActivity|TrustedWebActivity/.test(manifest)) problems.push('Generated launcher is not identified as TWA.');
} catch(error) { problems.push(error.code==='ENOENT'?'Local inputs or generated project are missing. Follow README; this is not a built TWA.':error.message); }
for(const problem of problems) console.error(`FAIL: ${problem}`);
console.log('NOT VERIFIED: compiled/merged AAB manifest, signing identity, live DAL, real-device functionality, Play forms and reviewer access.');
process.exitCode=problems.length ? 1 : 0;
