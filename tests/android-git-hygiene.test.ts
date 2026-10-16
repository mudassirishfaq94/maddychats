import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import test from "node:test";

test("Android signing material and generated releases stay outside Git while reviewed sources remain visible", () => {
  const ignored = ["release.keystore", "android-twa/signing/upload.jks", "android-twa/project/app/build/outputs/bundle/release/app.aab", "release.apk", "android-twa/key.properties", "android-twa/project/local.properties", "android-twa/twa-manifest.json", "android-twa/bubblewrap-config.json"];
  const tracked = ["android-twa/README.md", "android-twa/package.json", "android-twa/twa-manifest.example.json", "android-twa/assetlinks.example.json", "android-twa/scripts/prepare.mjs"];
  const matches = execFileSync("git", ["check-ignore", "--no-index", "--stdin"], { input: [...ignored, ...tracked].join("\n") + "\n", encoding: "utf8" }).trim().split(/\r?\n/);
  assert.deepEqual(matches, ignored);
});
