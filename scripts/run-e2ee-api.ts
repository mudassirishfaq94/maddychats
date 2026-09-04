/**
 * Registers two fresh QA accounts via the API using fetch (no curl),
 * then runs the E2EE API verification.
 */
const BASE = "http://localhost:49696";
const J = ".freebuff/qa";

async function main() {
  const { mkdirSync, readFileSync, writeFileSync } = await import("node:fs");
  mkdirSync(J, { recursive: true });

  const ts = Math.floor(Date.now() / 1000);
  const pass = "QaPassword123!";

  async function register(displayName: string, username: string, email: string, cookieFile: string) {
    const body = { displayName, username, email, password: pass, confirmPassword: pass };
    const res = await fetch(`${BASE}/api/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    // Extract Set-Cookie header for maddy_session
    const setCookie = res.headers.getSetCookie?.() ?? [];
    const sessionCookie = setCookie
      .find((c) => c.startsWith("maddy_session="))
      ?.split(";")[0];
    const json = await res.json() as { user?: { id: string }; error?: string };
    if (!sessionCookie || !json.user) {
      throw new Error(`Registration failed for ${username}: ${JSON.stringify(json)}`);
    }
    writeFileSync(`${J}/${username}.txt`, sessionCookie);
    writeFileSync(`${J}/${username}.json`, JSON.stringify(json));
    console.log(`Registered ${username} (${json.user.id})`);
    return { id: json.user.id, cookie: sessionCookie };
  }

  const alice = await register("QA Alice", `qa_alice_${ts}`, `qa.alice.${ts}@e2ee.local`, "a.txt");
  const bob = await register("QA Bob", `qa_bob_${ts}`, `qa.bob.${ts}@e2ee.local`, "b.txt");

  // Pass to the API verification script
  process.argv = [
    "node", "scripts/verify-e2ee-api.ts",
    BASE,
    `${J}/qa_alice.txt`,
    `${J}/qa_bob.txt`,
    alice.id,
    bob.id,
  ];
  await import("./verify-e2ee-api.js");
}

main().catch((err) => { console.error(err); process.exit(1); });
