import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { spawn } from "node:child_process";

test("production startup separates migration credentials and never serves after migration failure", async () => {
  const root = await mkdtemp(join(tmpdir(), "circlo-start-security-"));
  try {
    const next = join(root, "node_modules/next/dist/bin"); await mkdir(next, { recursive: true });
    const npm = join(root, "fixture-npm.cjs");
    await writeFile(npm, `require('fs').writeFileSync(process.env.FIXTURE_MIGRATION,JSON.stringify({owner:process.env.DATABASE_URL===process.env.MIGRATION_DATABASE_URL}));process.exit(Number(process.env.FIXTURE_EXIT||0));`);
    await writeFile(join(next, "next"), `require('fs').writeFileSync(process.env.FIXTURE_RUNTIME,JSON.stringify({runtime:process.env.DATABASE_URL==='postgresql://runtime-fixture',ownerRemoved:!('MIGRATION_DATABASE_URL' in process.env)}));`);
    const migration = join(root, "migration.json"), runtime = join(root, "runtime.json");
    const start = (fail: boolean) => new Promise<number | null>((resolveExit, reject) => {
      const child = spawn(process.execPath, [resolve("scripts/start-production.mjs")], { cwd: root, windowsHide: true, stdio: "pipe", env: { ...process.env, npm_execpath: npm, DATABASE_URL: "postgresql://runtime-fixture", MIGRATION_DATABASE_URL: "postgresql://owner-fixture", FIXTURE_MIGRATION: migration, FIXTURE_RUNTIME: runtime, FIXTURE_EXIT: fail ? "1" : "0" } });
      child.on("error", reject); child.on("exit", resolveExit);
    });
    assert.equal(await start(false), 0);
    assert.deepEqual(JSON.parse(await readFile(migration, "utf8")), { owner: true });
    assert.deepEqual(JSON.parse(await readFile(runtime, "utf8")), { runtime: true, ownerRemoved: true });
    await rm(runtime);
    assert.equal(await start(true), 1);
    await assert.rejects(readFile(runtime), { code: "ENOENT" });
  } finally {
    assert.equal(dirname(resolve(root)), resolve(tmpdir()));
    await rm(root, { recursive: true, force: true });
  }
});
