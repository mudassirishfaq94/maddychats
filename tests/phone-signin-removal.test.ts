import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const repositoryFile = (path: string) => new URL(`../${path}`, import.meta.url);

test("the phone authentication route and browser Firebase client are absent", async () => {
  for (const path of ["src/app/api/auth/phone/route.ts", "src/lib/firebase-client.ts"]) {
    await assert.rejects(access(repositoryFile(path)), { code: "ENOENT" });
  }
});

test("package manifests remove browser Firebase while retaining Firebase Admin", async () => {
  const manifest = JSON.parse(await readFile(repositoryFile("package.json"), "utf8"));
  const lock = JSON.parse(await readFile(repositoryFile("package-lock.json"), "utf8"));
  for (const entry of [manifest, lock.packages[""]]) {
    for (const field of ["dependencies", "devDependencies", "optionalDependencies"]) {
      assert.equal(entry[field]?.firebase, undefined, `${field} must not install the browser SDK`);
    }
    assert.equal(typeof entry.dependencies["firebase-admin"], "string");
  }
  for (const path of ["node_modules/firebase", "node_modules/@firebase/auth", "node_modules/@firebase/auth-compat"]) {
    assert.equal(lock.packages[path], undefined, `${path} must not remain in the lockfile`);
  }
  assert(lock.packages["node_modules/firebase-admin"]);
});

for (const path of [".env.example", "Dockerfile", "docker-compose.yml"]) {
  test(`${path} no longer configures the removed browser Firebase SDK`, async () => {
    const source = await readFile(repositoryFile(path), "utf8");
    assert.doesNotMatch(source, /NEXT_PUBLIC_FIREBASE_/);
    assert.match(source, /NEXT_PUBLIC_VAPID_PUBLIC_KEY/, "Web push configuration is retained");
    if (path === ".env.example") {
      for (const name of ["FIREBASE_PROJECT_ID", "FIREBASE_CLIENT_EMAIL", "FIREBASE_PRIVATE_KEY"]) {
        assert.match(source, new RegExp(`^${name}=`, "m"), "Native push keeps its server credentials");
      }
    }
  });
}
