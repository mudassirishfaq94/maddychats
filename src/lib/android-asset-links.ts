/** Public certificate hashes only. Private signing keys never belong on the web server. */
export function androidAssetLinks(env: Record<string, string | undefined>) {
  if (env.TWA_DAL_ENABLED !== "1") return null;
  const packageId = env.TWA_ANDROID_PACKAGE_ID;
  if (!packageId || !/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*){2,}$/.test(packageId) || /example|placeholder|confirm/i.test(packageId)) return null;
  const raw = env.TWA_CERT_SHA256?.split(",").map(value => value.trim().toUpperCase()) ?? [];
  if (!raw.length || raw.length > 4 || raw.some(value => !/^(?:[0-9A-F]{2}:){31}[0-9A-F]{2}$/.test(value) || new Set(value.split(":")).size < 4)) return null;
  return [{ relation: ["delegate_permission/common.handle_all_urls"], target: {
    namespace: "android_app", package_name: packageId, sha256_cert_fingerprints: [...new Set(raw)],
  } }];
}
