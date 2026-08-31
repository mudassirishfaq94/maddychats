/**
 * Local development PostgreSQL manager.
 *
 * Runs a REAL, local PostgreSQL 18 cluster using the binaries shipped by the
 * `@embedded-postgres/linux-x64` package (installed via npm) — no system
 * install required. This is a genuine PostgreSQL server (not a mock) that
 * Prisma connects to over TCP.
 *
 * We drive the binaries with `pg_ctl`, which daemonizes the server so it stays
 * running after this one-shot script exits.
 *
 * In production you would NOT use this: point DATABASE_URL at your own managed
 * PostgreSQL instance and never run this script.
 *
 * Usage:
 *   tsx scripts/db.ts start
 *   tsx scripts/db.ts stop
 *   tsx scripts/db.ts status
 */
import path from "node:path";
import fs from "node:fs";
import net from "node:net";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { Client } from "pg";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverRoot = path.resolve(__dirname, "..");

const DATA_DIR = path.join(serverRoot, ".pgdata");
const LOG_FILE = path.join(serverRoot, ".pglog.txt");
const PORT = 5432;
const HOST = "127.0.0.1";
const USER = "postgres";
const PASSWORD = "postgres";
const DB_NAME = "maddy_chats";

// Resolve the platform-specific binary directory provided by embedded-postgres.
function binDir(): string {
  const candidates = [
    path.join(
      serverRoot,
      "node_modules",
      "@embedded-postgres",
      "linux-x64",
      "native",
      "bin"
    ),
    path.join(
      serverRoot,
      "..",
      "node_modules",
      "@embedded-postgres",
      "linux-x64",
      "native",
      "bin"
    ),
  ];
  for (const dir of candidates) {
    if (fs.existsSync(path.join(dir, "pg_ctl"))) return dir;
  }
  throw new Error(
    "Could not locate embedded PostgreSQL binaries. Run `npm install` in server/."
  );
}

function bin(name: string): string {
  return path.join(binDir(), name);
}

function isPortInUse(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.connect({ host: HOST, port }, () => {
      socket.destroy();
      resolve(true);
    });
    socket.on("error", () => resolve(false));
    socket.setTimeout(1000, () => {
      socket.destroy();
      resolve(false);
    });
  });
}

function run(cmd: string, args: string[]) {
  const result = spawnSync(cmd, args, {
    stdio: "inherit",
    env: { ...process.env, PGPASSWORD: PASSWORD },
  });
  if (result.status !== 0) {
    throw new Error(`${path.basename(cmd)} exited with code ${result.status}`);
  }
}

function initCluster() {
  console.log("• Initializing new PostgreSQL cluster…");
  const pwFile = path.join(serverRoot, ".pgpw.tmp");
  fs.writeFileSync(pwFile, PASSWORD, "utf8");
  try {
    run(bin("initdb"), [
      "-D",
      DATA_DIR,
      "-U",
      USER,
      "--auth=md5",
      `--pwfile=${pwFile}`,
      "--encoding=UTF8",
    ]);
  } finally {
    fs.rmSync(pwFile, { force: true });
  }
}

async function ensureDatabase() {
  const client = new Client({
    host: HOST,
    port: PORT,
    user: USER,
    password: PASSWORD,
    database: "postgres",
  });
  await client.connect();
  const exists = await client.query(
    "SELECT 1 FROM pg_database WHERE datname = $1",
    [DB_NAME]
  );
  if (exists.rowCount === 0) {
    await client.query(`CREATE DATABASE ${DB_NAME}`);
    console.log(`✔ Created database "${DB_NAME}".`);
  } else {
    console.log(`✔ Database "${DB_NAME}" already exists.`);
  }
  await client.end();
}

async function waitForPort(timeoutMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await isPortInUse(PORT)) return;
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error("PostgreSQL did not start listening in time.");
}

async function start() {
  if (await isPortInUse(PORT)) {
    console.log(`✔ PostgreSQL already running on port ${PORT}.`);
    await ensureDatabase();
    return;
  }

  if (!fs.existsSync(path.join(DATA_DIR, "PG_VERSION"))) {
    initCluster();
  }

  // pg_ctl start daemonizes postgres; it keeps running after this script exits.
  run(bin("pg_ctl"), [
    "-D",
    DATA_DIR,
    "-l",
    LOG_FILE,
    "-o",
    `-p ${PORT} -h ${HOST} -k ${DATA_DIR}`,
    "-w",
    "start",
  ]);

  await waitForPort();
  console.log(`✔ PostgreSQL started on ${HOST}:${PORT}.`);
  await ensureDatabase();
  console.log("✔ Local database ready.");
}

function stop() {
  if (!fs.existsSync(path.join(DATA_DIR, "PG_VERSION"))) {
    console.log("• No cluster to stop.");
    return;
  }
  run(bin("pg_ctl"), ["-D", DATA_DIR, "-m", "fast", "stop"]);
  console.log("✔ PostgreSQL stopped.");
}

async function status() {
  console.log((await isPortInUse(PORT)) ? "● running" : "○ stopped");
}

const cmd = process.argv[2];
(async () => {
  switch (cmd) {
    case "start":
      await start();
      break;
    case "stop":
      stop();
      break;
    case "status":
      await status();
      break;
    default:
      console.error("Usage: tsx scripts/db.ts <start|stop|status>");
      process.exit(1);
  }
})().catch((err) => {
  console.error("Database script failed:", err);
  process.exit(1);
});
