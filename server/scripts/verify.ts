/**
 * Automated acceptance test suite for Maddy Chats — Step 1.
 *
 * Verifies the 13 acceptance criteria end-to-end against a live server + real
 * PostgreSQL database. It:
 *   1. ensures the local DB is running and migrated,
 *   2. boots the compiled/dev server on a test port,
 *   3. exercises the auth API over HTTP (with cookie handling),
 *   4. checks the DB directly to confirm password hashing,
 *   5. tears everything down.
 *
 * Run with: npm run verify
 */
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import path from "node:path";
import net from "node:net";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { Client } from "pg";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverRoot = path.resolve(__dirname, "..");
dotenv.config({ path: path.join(serverRoot, ".env") });

const PORT = 4123;
const BASE = `http://127.0.0.1:${PORT}`;
const JWT_SECRET = "verify-suite-secret-key-please-change-in-real-use";
const DATABASE_URL = process.env.DATABASE_URL!;

let passed = 0;
let failed = 0;

function ok(name: string) {
  passed++;
  console.log(`  \x1b[32m✔\x1b[0m ${name}`);
}
function fail(name: string, detail?: unknown) {
  failed++;
  console.log(`  \x1b[31m✗\x1b[0m ${name}`);
  if (detail) console.log("      ", detail);
}
function assert(cond: boolean, name: string, detail?: unknown) {
  if (cond) ok(name);
  else fail(name, detail);
}

function waitForPort(port: number, timeoutMs = 20000): Promise<void> {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const tick = () => {
      const socket = net.connect({ host: "127.0.0.1", port }, () => {
        socket.destroy();
        resolve();
      });
      socket.on("error", () => {
        socket.destroy();
        if (Date.now() - start > timeoutMs) reject(new Error("server timeout"));
        else setTimeout(tick, 250);
      });
    };
    tick();
  });
}

// Minimal cookie jar.
function makeJar() {
  const cookies = new Map<string, string>();
  return {
    apply(headers: Headers) {
      const setCookie = headers.getSetCookie?.() ?? [];
      for (const c of setCookie) {
        const [pair] = c.split(";");
        const eq = pair.indexOf("=");
        const name = pair.slice(0, eq).trim();
        const value = pair.slice(eq + 1).trim();
        if (value === "" || /Expires=Thu, 01 Jan 1970/i.test(c)) {
          cookies.delete(name);
        } else {
          cookies.set(name, value);
        }
      }
    },
    header(): string {
      return [...cookies.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
    },
    get(name: string) {
      return cookies.get(name);
    },
  };
}

type Jar = ReturnType<typeof makeJar>;

async function call(
  method: string,
  path: string,
  body?: unknown,
  jar?: Jar
) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (jar) {
    const cookie = jar.header();
    if (cookie) headers.Cookie = cookie;
  }
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (jar) jar.apply(res.headers);
  let json: any = null;
  const text = await res.text();
  if (text) {
    try {
      json = JSON.parse(text);
    } catch {
      json = text;
    }
  }
  return { status: res.status, json };
}

async function main() {
  console.log("\n\x1b[1mMaddy Chats — Step 1 acceptance suite\x1b[0m\n");

  // Ensure DB is running & migrated.
  console.log("Preparing database…");
  spawnSync("tsx", [path.join(serverRoot, "scripts", "db.ts"), "start"], {
    stdio: "ignore",
    cwd: serverRoot,
  });
  spawnSync("tsx", [path.join(serverRoot, "scripts", "migrate.ts")], {
    stdio: "ignore",
    cwd: serverRoot,
  });

  // 1. PostgreSQL connects.
  const dbClient = new Client({ connectionString: DATABASE_URL });
  try {
    await dbClient.connect();
    await dbClient.query("SELECT 1");
    ok("1. PostgreSQL connects");
  } catch (e) {
    fail("1. PostgreSQL connects", (e as Error).message);
    process.exit(1);
  }

  // 2. Prisma migration works (users table + _prisma_migrations exist).
  const tbl = await dbClient.query(
    "SELECT to_regclass('public.users') AS users, to_regclass('public._prisma_migrations') AS mig"
  );
  assert(
    tbl.rows[0].users === "users" && tbl.rows[0].mig === "_prisma_migrations",
    "2. Prisma migration works (users + _prisma_migrations tables present)"
  );

  // Boot the server.
  console.log("\nStarting API server…");
  const server: ChildProcess = spawn(
    "tsx",
    [path.join(serverRoot, "src", "index.ts")],
    {
      cwd: serverRoot,
      env: {
        ...process.env,
        PORT: String(PORT),
        JWT_SECRET,
        NODE_ENV: "development",
        CLIENT_URL: "http://localhost:5173",
      },
      stdio: "ignore",
    }
  );

  const cleanup = async () => {
    server.kill("SIGTERM");
    await dbClient.end().catch(() => {});
  };

  try {
    await waitForPort(PORT);

    const unique = crypto.randomBytes(4).toString("hex");
    const user = {
      displayName: "Verify User",
      username: `verify_${unique}`,
      email: `verify_${unique}@example.com`,
      password: "supersecret123",
      confirmPassword: "supersecret123",
    };

    console.log("\nRunning API checks…");

    // 3. Register works.
    const jar = makeJar();
    const reg = await call("POST", "/api/auth/register", user, jar);
    assert(
      reg.status === 201 && reg.json?.user?.username === user.username,
      "3. Register works",
      reg.status !== 201 ? reg.json : undefined
    );

    // passwordHash never in API response.
    assert(
      reg.json?.user && !("passwordHash" in reg.json.user),
      "   ↳ passwordHash absent from register response"
    );

    // Cookie set.
    assert(!!jar.get("maddy_token"), "   ↳ auth cookie set on register");

    // 4. Password is hashed (check DB directly).
    const dbUser = await dbClient.query(
      'SELECT "passwordHash" FROM users WHERE email = $1',
      [user.email]
    );
    const hash = dbUser.rows[0]?.passwordHash as string | undefined;
    assert(
      !!hash && hash !== user.password && /^\$2[aby]\$/.test(hash),
      "4. Password is hashed with bcrypt (never plaintext)",
      hash
    );

    // 5. Duplicate email rejected.
    const dupEmail = await call("POST", "/api/auth/register", {
      ...user,
      username: `other_${unique}`,
    });
    assert(
      dupEmail.status === 409 && !!dupEmail.json?.error?.details?.fields?.email,
      "5. Duplicate email rejected",
      dupEmail.status
    );

    // 6. Duplicate username rejected.
    const dupUser = await call("POST", "/api/auth/register", {
      ...user,
      email: `other_${unique}@example.com`,
    });
    assert(
      dupUser.status === 409 &&
        !!dupUser.json?.error?.details?.fields?.username,
      "6. Duplicate username rejected",
      dupUser.status
    );

    // Validation: password mismatch & short password.
    const mismatch = await call("POST", "/api/auth/register", {
      displayName: "X",
      username: `mm_${unique}`,
      email: `mm_${unique}@example.com`,
      password: "password1",
      confirmPassword: "password2",
    });
    assert(
      mismatch.status === 400 &&
        !!mismatch.json?.error?.details?.fields?.confirmPassword,
      "   ↳ password confirmation mismatch rejected"
    );
    const shortPw = await call("POST", "/api/auth/register", {
      displayName: "X",
      username: `sp_${unique}`,
      email: `sp_${unique}@example.com`,
      password: "short",
      confirmPassword: "short",
    });
    assert(
      shortPw.status === 400 &&
        !!shortPw.json?.error?.details?.fields?.password,
      "   ↳ short password (<8) rejected"
    );

    // 7. Login works (with fresh jar, by email and by username).
    const loginJar = makeJar();
    const login = await call(
      "POST",
      "/api/auth/login",
      { identifier: user.email, password: user.password },
      loginJar
    );
    assert(
      login.status === 200 && login.json?.user?.email === user.email,
      "7. Login works (by email)",
      login.status
    );
    assert(
      login.json?.user && !("passwordHash" in login.json.user),
      "   ↳ passwordHash absent from login response"
    );
    const loginByUsername = await call("POST", "/api/auth/login", {
      identifier: user.username,
      password: user.password,
    });
    assert(
      loginByUsername.status === 200,
      "   ↳ login also works by username"
    );

    // 8. Invalid password rejected.
    const badLogin = await call("POST", "/api/auth/login", {
      identifier: user.email,
      password: "wrongpassword",
    });
    assert(
      badLogin.status === 401,
      "8. Invalid password rejected",
      badLogin.status
    );

    // 9. /api/auth/me works when authenticated.
    const me = await call("GET", "/api/auth/me", undefined, loginJar);
    assert(
      me.status === 200 && me.json?.user?.username === user.username,
      "9. /api/auth/me works when authenticated",
      me.status
    );
    assert(
      me.json?.user && !("passwordHash" in me.json.user),
      "   ↳ passwordHash absent from /me response"
    );

    // 10. Protected route blocks unauthenticated requests.
    const meNoAuth = await call("GET", "/api/auth/me");
    assert(
      meNoAuth.status === 401,
      "10. Protected route blocks unauthenticated users (401)",
      meNoAuth.status
    );

    // 11. Logout works (clears cookie; subsequent /me is 401).
    const logout = await call("POST", "/api/auth/logout", undefined, loginJar);
    assert(logout.status === 200, "11. Logout works", logout.status);
    const meAfterLogout = await call(
      "GET",
      "/api/auth/me",
      undefined,
      loginJar
    );
    assert(
      meAfterLogout.status === 401,
      "   ↳ session invalid after logout"
    );

    // 12. "Refresh preserves authentication": a stored cookie still authorizes
    // a brand-new client (simulating a page refresh with the HttpOnly cookie).
    const persistentJar = makeJar();
    await call(
      "POST",
      "/api/auth/login",
      { identifier: user.email, password: user.password },
      persistentJar
    );
    const token = persistentJar.get("maddy_token")!;
    const freshJar = makeJar();
    freshJar.apply(
      new Headers({ "set-cookie": `maddy_token=${token}; Path=/` })
    );
    const meRefresh = await call("GET", "/api/auth/me", undefined, freshJar);
    assert(
      meRefresh.status === 200 && meRefresh.json?.user?.email === user.email,
      "12. Refresh preserves authentication (cookie re-verified by backend)",
      meRefresh.status
    );

    // Security: health, forgot-password honesty, rate limiting.
    const health = await call("GET", "/api/health");
    assert(
      health.status === 200 && health.json?.database === "connected",
      "   ↳ health endpoint reports DB connected"
    );
    const forgot = await call("POST", "/api/auth/forgot-password", {
      email: user.email,
    });
    assert(
      forgot.status === 200 && forgot.json?.emailConfigured === false,
      "   ↳ forgot-password is honest (no fake email sending)"
    );

    // Clean up test users.
    await dbClient.query("DELETE FROM users WHERE email LIKE $1", [
      `%_${unique}@example.com`,
    ]);
  } finally {
    await cleanup();
  }

  // 13. Production build works.
  console.log("\nChecking production builds…");
  const serverBuild = spawnSync("npm", ["run", "build"], {
    cwd: serverRoot,
    stdio: "ignore",
  });
  const clientBuild = spawnSync("npm", ["run", "build"], {
    cwd: path.resolve(serverRoot, "..", "client"),
    stdio: "ignore",
  });
  assert(
    serverBuild.status === 0 && clientBuild.status === 0,
    "13. Production build works (server + client)",
    { server: serverBuild.status, client: clientBuild.status }
  );

  console.log(
    `\n\x1b[1mResults:\x1b[0m ${passed} passed, ${failed} failed\n`
  );
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error("Verification crashed:", err);
  process.exit(1);
});
