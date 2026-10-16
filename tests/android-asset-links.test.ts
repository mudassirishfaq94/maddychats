import assert from "node:assert/strict";
import test from "node:test";
import { androidAssetLinks } from "../src/lib/android-asset-links";
import { GET } from "../src/app/.well-known/assetlinks.json/route";

const fingerprint = Array.from({ length: 32 }, (_, i) => i.toString(16).padStart(2, "0")).join(":");
const env = { TWA_DAL_ENABLED: "1", TWA_ANDROID_PACKAGE_ID: "chat.circlo.app", TWA_CERT_SHA256: fingerprint };

test("DAL publishes only explicit valid package/certificate input and deduplicates approved rotation certificates", () => {
  assert.equal(androidAssetLinks({}), null);
  assert.equal(androidAssetLinks({ ...env, TWA_DAL_ENABLED: "0" }), null);
  for (const value of ["", "PLACEHOLDER", "00:".repeat(31) + "00", fingerprint + ",", "https://attacker.invalid"]) assert.equal(androidAssetLinks({ ...env, TWA_CERT_SHA256: value }), null);
  assert.equal(androidAssetLinks({ ...env, TWA_ANDROID_PACKAGE_ID: "com.example.app" }), null);
  const links = androidAssetLinks({ ...env, TWA_CERT_SHA256: `${fingerprint},${fingerprint.toUpperCase()}` });
  assert.deepEqual(links, [{ relation: ["delegate_permission/common.handle_all_urls"], target: { namespace: "android_app", package_name: "chat.circlo.app", sha256_cert_fingerprints: [fingerprint.toUpperCase()] } }]);
});

test("public DAL handler fails closed without deployment approval and emits JSON for explicit configuration", async () => {
  const keys = ["TWA_DAL_ENABLED", "TWA_ANDROID_PACKAGE_ID", "TWA_CERT_SHA256"];
  const previous = keys.map(key => process.env[key]);
  try {
    keys.forEach(key => delete process.env[key]);
    const unavailable = GET();
    assert.equal(unavailable.status, 503);
    assert.equal(unavailable.headers.get("cache-control"), "no-store");
    Object.assign(process.env, env);
    const configured = GET();
    assert.equal(configured.status, 200);
    assert.match(configured.headers.get("content-type")!, /application\/json/);
    assert.equal(configured.headers.get("cache-control"), "public, max-age=300");
    assert.deepEqual(await configured.json(), androidAssetLinks(env));
  } finally {
    keys.forEach((key, index) => { if (previous[index] === undefined) delete process.env[key]; else process.env[key] = previous[index]; });
  }
});
