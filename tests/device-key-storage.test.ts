import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { runInNewContext } from "node:vm";
import type { RecoveryBundle } from "../src/lib/device-recovery-file";
import type * as Recovery from "../src/lib/device-recovery-file";
import type * as Storage from "../src/lib/device-key-storage";

// Exercise the real storage and recovery modules with isolated browser/plugin I/O.
const compiled = build({
  stdin: {
    contents: 'export * from "./src/lib/device-key-storage"; export * from "./src/lib/device-recovery-file";',
    resolveDir: process.cwd(),
  },
  bundle: true, write: false, platform: "node", format: "cjs",
  plugins: [{ name: "storage-fixtures", setup(builder) {
    builder.onResolve({ filter: /^(client-only|@capacitor\/core|@aparajita\/capacitor-secure-storage)$/ }, args => ({ path: args.path, namespace: "fixture" }));
    builder.onLoad({ filter: /.*/, namespace: "fixture" }, args => ({ contents:
      args.path === "client-only" ? "" : args.path === "@capacitor/core"
        ? "export const Capacitor = { isNativePlatform: () => globalThis.nativePlatform };"
        : "export const SecureStorage = globalThis.secureStorage;",
    }));
  } }],
});

async function fixture(native: boolean) {
  const browser = new Map<string, string>(), protectedValues = new Map<string, string>();
  const target = native ? protectedValues : browser;
  let failKey: string | undefined;
  const failure = new Error("synthetic storage failure");
  function write(values: Map<string, string>, key: string, value: string) {
    values.set(key, value);
    // Native writes may mutate storage before their readback fails.
    if (key === failKey) { failKey = undefined; throw failure; }
  }
  const loadedModule = { exports: {} };
  runInNewContext((await compiled).outputFiles[0].text, {
    module: loadedModule, nativePlatform: native,
    localStorage: {
      getItem: (key: string) => browser.get(key) ?? null,
      setItem: (key: string, value: string) => write(browser, key, value),
      removeItem: (key: string) => browser.delete(key),
    },
    secureStorage: {
      setKeyPrefix: async () => undefined,
      get: async (key: string) => protectedValues.get(key) ?? null,
      set: async (key: string, value: string) => write(protectedValues, key, value),
      remove: async (key: string) => protectedValues.delete(key),
    },
  });
  return { api: loadedModule.exports as typeof Recovery & typeof Storage, browser, protectedValues, target, failure,
    failNextWrite: (key: string) => { failKey = key; } };
}

const bundle: RecoveryBundle = { version: 1, userId: "owner", deviceId: "device", keypair: "new-pair", secret: "new-secret", keys: {} };
const pairKey = "e2ee_keypair_owner", secretKey = "e2ee_recovery_owner_device";

for (const native of [false, true]) {
  test(`${native ? "native" : "browser"} recovery restores both prior entries after either write fails`, async () => {
    for (const failingKey of [pairKey, secretKey]) {
      for (const oldPair of [null, "", "old-pair"]) {
        for (const oldSecret of [null, "", "old-secret"]) {
          const { api, target, failure, failNextWrite } = await fixture(native);
          if (oldPair !== null) target.set(pairKey, oldPair);
          if (oldSecret !== null) target.set(secretKey, oldSecret);
          const before = new Map(target);
          failNextWrite(failingKey);
          await assert.rejects(api.writeRecoveryIdentity(bundle), error => error === failure);
          assert.deepEqual(target, before);
        }
      }
    }
  });
  test(`${native ? "native" : "browser"} recovery saves a complete identity`, async () => {
    const { api, target } = await fixture(native);
    await api.writeRecoveryIdentity(bundle);
    assert.equal(target.get(pairKey), bundle.keypair);
    assert.equal(target.get(secretKey), bundle.secret);
  });
}

test("native reads clean up only matching browser copies and return the protected value unchanged", async () => {
  for (const stored of ["protected-pair", ""]) {
    for (const legacy of [null, stored, "different-pair"]) {
      const { api, browser, protectedValues } = await fixture(true);
      protectedValues.set(pairKey, stored);
      if (legacy !== null) browser.set(pairKey, legacy);
      assert.equal(await api.readDeviceKeyMaterial(pairKey), stored);
      assert.equal(browser.get(pairKey) ?? null, legacy === stored ? null : legacy);
      assert.equal(protectedValues.get(pairKey), stored);
    }
  }
});
