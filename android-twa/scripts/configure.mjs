import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { buildConfiguration } from './config.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
try {
  const input = JSON.parse(await readFile(resolve(root,'.local/release-inputs.json'),'utf8'));
  const config = buildConfiguration(input, resolve(root,'..'));
  await mkdir(resolve(root,'project'),{recursive:true});
  await mkdir(resolve(root,'.local'),{recursive:true});
  // These are ignored local preparation files. No keys, Android project or deployment is created.
  await writeFile(resolve(root,'project/twa-manifest.json'),JSON.stringify(config.manifest,null,2)+'\n',{mode:0o600});
  await writeFile(resolve(root,'.local/assetlinks.json'),JSON.stringify(config.assetlinks,null,2)+'\n',{mode:0o600});
  console.log('Prepared ignored local configuration and DAL candidate. Not generated, signed, trusted, deployed or release-ready.');
} catch (error) {
  console.error(error.code === 'ENOENT' ? 'Create .local/release-inputs.json using the example after confirming Play package/signing details.' : error.message);
  process.exitCode=1;
}
