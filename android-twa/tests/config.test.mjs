import assert from 'node:assert/strict';
import test from 'node:test';
import { resolve } from 'node:path';
import { buildConfiguration } from '../scripts/config.mjs';
const root=resolve('..');
const input={packageId:'chat.circlo.testfixture',appVersion:'1.0.0',appVersionCode:1,signingKeyPath:resolve(root,'../outside-repository-fixture.jks'),signingKeyAlias:'upload',appSigningSha256:Array.from({length:32},(_,i)=>i.toString(16).padStart(2,'0')).join(':')};

test('configuration stays on canonical browser origin without native permissions, tracking or extra trusted origins',()=>{
  const {manifest,assetlinks}=buildConfiguration(input,root);
  assert.equal(manifest.host,'circlo.chat');
  assert.equal(manifest.startUrl,'/app/chats');
  assert.equal(manifest.enableNotifications,true);
  assert.equal(manifest.fallbackType,'customtabs');
  assert.deepEqual(manifest.additionalTrustedOrigins,[]);
  assert.deepEqual(manifest.features,{});
  assert.equal(assetlinks[0].target.package_name,input.packageId);
  assert.deepEqual(assetlinks[0].target.sha256_cert_fingerprints,[input.appSigningSha256.toUpperCase()]);
});

test('rejects placeholders, keys inside checkout, old versionCode, credentials in JSON and invalid fingerprints',()=>{
  for(const changes of [{packageId:'CONFIRM_PACKAGE'}, {signingKeyPath:resolve(root,'android-twa/upload.jks')}, {packageId:'app.ziptalks.android',appVersionCode:12}, {password:'never-store-this'}, {appSigningSha256:'00:'.repeat(31)+'00'}, {appSigningSha256:'invalid'}, {appVersionCode:0}]) assert.throws(()=>buildConfiguration({...input,...changes},root));
});
