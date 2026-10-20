import { isAbsolute, relative, resolve } from 'node:path';

export function buildConfiguration(input, repositoryRoot) {
  const allowed = ['packageId', 'appVersion', 'appVersionCode', 'signingKeyPath', 'signingKeyAlias', 'appSigningSha256'];
  if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(key => !allowed.includes(key))) throw new Error('Only documented release inputs are permitted; never put passwords or credentials in JSON.');
  const {packageId, appVersion, appVersionCode, signingKeyPath, signingKeyAlias, appSigningSha256} = input;
  if (typeof packageId !== 'string' || !/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*){2,}$/.test(packageId) || /example|placeholder|confirm/.test(packageId)) throw new Error('Confirm the real Play package identity first.');
  if (typeof appVersion !== 'string' || !/^\d+\.\d+\.\d+(?:[.-][a-zA-Z0-9.-]+)?$/.test(appVersion)) throw new Error('Set an explicit version name.');
  if (!Number.isSafeInteger(appVersionCode) || appVersionCode < 1 || appVersionCode > 2100000000) throw new Error('Set a valid, previously unused Play versionCode.');
  if (packageId === 'app.ziptalks.android' && appVersionCode <= 12) throw new Error('The existing Android source already uses versionCode 12; verify Play and use a higher code.');
  if (typeof signingKeyPath !== 'string' || !isAbsolute(signingKeyPath)) throw new Error('Signing key path must be absolute and outside this repository.');
  const keyRelative = relative(resolve(repositoryRoot), resolve(signingKeyPath));
  if (keyRelative === '' || (!keyRelative.startsWith('..') && !isAbsolute(keyRelative))) throw new Error('Keep signing keys outside the repository.');
  if (typeof signingKeyAlias !== 'string' || !/^[a-zA-Z0-9_.-]{1,80}$/.test(signingKeyAlias) || /confirm|placeholder/i.test(signingKeyAlias)) throw new Error('Set the confirmed key alias.');
  if (typeof appSigningSha256 !== 'string' || !/^(?:[0-9a-fA-F]{2}:){31}[0-9a-fA-F]{2}$/.test(appSigningSha256) || new Set(appSigningSha256.split(':').map(x=>x.toUpperCase())).size < 4) throw new Error('Provide the real SHA-256 Play app-signing fingerprint, not a placeholder.');
  const fingerprint = appSigningSha256.toUpperCase();
  return {
    manifest: {
      packageId, host:'circlo.chat', name:'Circlo', launcherName:'Circlo', display:'standalone',
      themeColor:'#151719', themeColorDark:'#151719', navigationColor:'#151719', navigationColorDark:'#151719', backgroundColor:'#151719',
      enableNotifications:true, startUrl:'/app/chats', fullScopeUrl:'https://circlo.chat/',
      iconUrl:'https://circlo.chat/icons/circlo-512.png?v=linked-c-2', maskableIconUrl:'https://circlo.chat/icons/circlo-maskable-512.png?v=linked-c-2',
      splashScreenFadeOutDuration:300, signingKey:{path:signingKeyPath,alias:signingKeyAlias},
      appVersion, appVersionCode, webManifestUrl:'https://circlo.chat/manifest.webmanifest',
      fallbackType:'customtabs', orientation:'default', minSdkVersion:24,
      enableSiteSettingsShortcut:true, additionalTrustedOrigins:[], features:{},
      fingerprints:[{name:'Play app signing certificate',value:fingerprint}]
    },
    assetlinks:[{relation:['delegate_permission/common.handle_all_urls'],target:{namespace:'android_app',package_name:packageId,sha256_cert_fingerprints:[fingerprint]}}]
  };
}
