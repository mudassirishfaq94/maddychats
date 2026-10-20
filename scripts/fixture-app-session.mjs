import assert from "node:assert/strict";

/** Seed an already-approved app session for feature-only integration fixtures.
 * Never used by production or device-gate tests; only a disposable loopback DB.
 */
export async function fixtureAppSession(pool, responseOrCookies) {
  const url = new URL(pool.options?.connectionString ?? "");
  assert(["127.0.0.1", "localhost"].includes(url.hostname) && url.pathname.endsWith("_test"), "Session fixtures require an isolated local test database");
  let cookies = responseOrCookies;
  if (typeof cookies !== "string") {
    cookies = typeof responseOrCookies.headersArray === "function"
      ? (await responseOrCookies.headersArray()).filter(h=>h.name.toLowerCase()==="set-cookie").map(h=>h.value).join("; ")
      : responseOrCookies.headers.getSetCookie().join("; ");
  }
  const token = /(?:^|;\s*)maddy_session=([^;]+)/.exec(cookies)?.[1];
  assert(token, "Fixture requires a successfully authenticated device session");
  const claims = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString());
  assert(/^[a-f0-9-]{36}$/.test(claims.sid) && /^[a-f0-9-]{36}$/.test(claims.sub));
  const result = await pool.query("update device_sessions set approval_required=false where id=$1 and user_id=$2 and revoked_at is null returning id", [claims.sid,claims.sub]);
  assert.equal(result.rowCount,1);
}
