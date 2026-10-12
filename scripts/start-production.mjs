import { spawn } from "node:child_process";
import { resolve } from "node:path";

// The web process receives only runtime credentials. Migrations run first with
// the separately configured owner connection, preserving existing boot order.
const migrationEnv = { ...process.env };
if (migrationEnv.MIGRATION_DATABASE_URL) migrationEnv.DATABASE_URL = migrationEnv.MIGRATION_DATABASE_URL;
const npm = process.env.npm_execpath;
if (!npm) throw new Error("Start this application with npm start.");
let child;
let stopping = false;
for (const signal of ["SIGTERM", "SIGINT"]) process.on(signal, () => { stopping = true; child?.kill(signal); });
const run = (args, env) => new Promise((resolveExit, reject) => {
  child = spawn(process.execPath, args, { env, stdio: "inherit", windowsHide: true });
  child.once("error", reject);
  child.once("exit", (code, signal) => resolveExit(code ?? (signal ? 1 : 0)));
});
const migrationCode = await run([npm, "run", "db:migrate"], migrationEnv);
if (migrationCode !== 0 || stopping) process.exit(migrationCode || 1);
if (process.env.MIGRATION_DATABASE_URL && new URL(process.env.DATABASE_URL).username === "circlo_runtime") {
  const grantCode = await run([resolve("scripts/sync-runtime-role.mjs")], process.env);
  if (grantCode !== 0 || stopping) process.exit(grantCode || 1);
}
const runtimeEnv = { ...process.env };
delete runtimeEnv.MIGRATION_DATABASE_URL;
process.exit(await run([resolve("node_modules/next/dist/bin/next"), "start"], runtimeEnv));
