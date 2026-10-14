/**
 * End-to-end check of device trust and the trusted-device linking code.
 *
 * Run against a server whose database you are willing to touch:
 *   next dev -p 3111        (or a deployed environment)
 *   node scripts/test-device-trust.mjs
 *   SMOKE_BASE=https://host node scripts/test-device-trust.mjs
 *
 * It creates one throwaway account, exercises registration, the linking code,
 * revocation and the device list, and deletes the account again. It writes no
 * other rows, so it is safe to point at a development database.
 */
import { config } from "dotenv";
import pg from "pg";
import bcrypt from "bcryptjs";
import { randomUUID, createHash } from "node:crypto";

config({ quiet: true });
const BASE = process.env.SMOKE_BASE || "http://127.0.0.1:3111";
const USERNAME = "device_smoke_" + randomUUID().slice(0, 8);
const EMAIL = `${USERNAME}@example.invalid`;
const PASSWORD = "Smoke-test-password-12345!";
const results = [];
const record = (name, ok, detail = "") => {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? " :: " + detail : ""}`);
};

const client = new pg.Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 10000, ssl: { rejectUnauthorized: false } });
let userId = null;

function cookieHeader(response) {
  const raw = typeof response.headers.getSetCookie === "function" ? response.headers.getSetCookie() : [];
  return raw.map((value) => value.split(";")[0]).join("; ");
}

async function call(path, { method = "GET", body, cookies } = {}) {
  const response = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      ...(body ? { "Content-Type": "application/json" } : {}),
      "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
      ...(cookies ? { cookie: cookies } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* non-JSON body */ }
  return { status: response.status, json, text, cookies: cookieHeader(response) };
}

const fakeKey = (seed) => Buffer.from(`device-key-${seed}`).toString("base64");
const fingerprint = (publicKey) => createHash("sha256").update(publicKey).digest("hex");

try {
  await client.connect();
  const inserted = await client.query(
    `insert into users (username, display_name, email, email_verified_at, password_hash)
     values ($1, $2, $3, now(), $4) returning id`,
    [USERNAME, "Device Smoke", EMAIL, await bcrypt.hash(PASSWORD, 12)],
  );
  userId = inserted.rows[0].id;
  record("throwaway account created", Boolean(userId));

  const login = await call("/api/auth/login", { method: "POST", body: { acceptTerms: true, acceptPrivacy: true, identifier: EMAIL, password: PASSWORD } });
  record("sign in creates a session", login.status === 200, `status=${login.status} ${login.text.slice(0, 120)}`);
  const sessionA = login.cookies;
  if (!sessionA) throw new Error("no session cookie returned");

  // First device of an account bootstraps as trusted.
  const deviceA = "smoke-device-a";
  const keyA = fakeKey("a");
  const registerA = await call("/api/e2ee/keys", { method: "POST", cookies: sessionA, body: { deviceId: deviceA, publicKey: keyA, encryptedPrivateKey: "v2:placeholder" } });
  record("first device registers", registerA.status === 200, `status=${registerA.status} ${registerA.text.slice(0, 160)}`);
  record("first device is trusted", registerA.json?.pendingApproval === false, JSON.stringify(registerA.json));

  // A second device stays untrusted until a trusted device links it.
  const deviceB = "smoke-device-b";
  const keyB = fakeKey("b");
  const registerB = await call("/api/e2ee/keys", { method: "POST", cookies: sessionA, body: { deviceId: deviceB, publicKey: keyB, encryptedPrivateKey: "v2:placeholder" } });
  record("second device registers as pending", registerB.status === 200 && registerB.json?.pendingApproval === true, JSON.stringify(registerB.json));

  // The new device cannot mint a code for itself.
  const selfCode = await call("/api/e2ee/devices/link/code", { method: "POST", cookies: sessionA, body: { deviceId: deviceA } });
  record("a trusted device cannot link itself", selfCode.status === 422, `status=${selfCode.status} ${selfCode.text.slice(0, 120)}`);

  const codeResponse = await call("/api/e2ee/devices/link/code", { method: "POST", cookies: sessionA, body: { deviceId: deviceB } });
  const code = codeResponse.json?.code;
  record("trusted device generates a linking code", codeResponse.status === 201 && typeof code === "string" && code.length === 8, `status=${codeResponse.status} code=${code}`);

  const wrongCode = await call("/api/e2ee/devices/link/verify", { method: "POST", cookies: sessionA, body: { code: "00000000", deviceId: deviceB } });
  record("a wrong code is rejected", wrongCode.status === 403, `status=${wrongCode.status}`);

  const verify = await call("/api/e2ee/devices/link/verify", { method: "POST", cookies: sessionA, body: { code: code.toLowerCase(), deviceId: deviceB, deviceName: "Work laptop — Chrome" } });
  record("the new device redeems the code", verify.status === 200, `status=${verify.status} ${verify.text.slice(0, 160)}`);

  const reuse = await call("/api/e2ee/devices/link/verify", { method: "POST", cookies: sessionA, body: { code, deviceId: deviceB } });
  record("the code is single use", reuse.status === 403, `status=${reuse.status}`);

  const afterLinks = await call("/api/e2ee/devices/link", { cookies: sessionA });
  const linkedRow = afterLinks.json?.requests?.find((row) => row.deviceId === deviceB);
  record("the linking request is recorded as approved", linkedRow?.status === "approved", JSON.stringify(linkedRow));

  const list = await call("/api/privacy/devices", { cookies: sessionA });
  const devices = list.json?.devices ?? [];
  const rowA = devices.find((device) => device.deviceId === deviceA);
  const rowB = devices.find((device) => device.deviceId === deviceB);
  record("the device list returns both devices", list.status === 200 && Boolean(rowA) && Boolean(rowB), `status=${list.status} count=${devices.length}`);
  record("trust is read from the device row", Boolean(rowA?.trusted) && Boolean(rowB?.trusted), JSON.stringify({ a: rowA?.trusted, b: rowB?.trusted }));
  record("devices carry a readable label", Boolean(rowA?.label) && rowB?.label === "Work laptop — Chrome", JSON.stringify({ a: rowA?.label, b: rowB?.label }));
  record("devices report platform and country fields", typeof rowA?.platform === "string" && typeof rowA?.countryName === "string", JSON.stringify({ platform: rowA?.platform, country: rowA?.countryName }));
  record("devices expose the browser session list", Array.isArray(rowA?.sessions) && rowA.sessions.length >= 1, JSON.stringify(rowA?.sessions?.length));

  // Signing in again must not undo an approval (the reported bug).
  const reLogin = await call("/api/auth/login", { method: "POST", body: { acceptTerms: true, acceptPrivacy: true, identifier: EMAIL, password: PASSWORD } });
  record("same account signs in again", reLogin.status === 200, `status=${reLogin.status}`);
  const sessionB = reLogin.cookies;
  const afterRelogin = await call("/api/privacy/devices", { cookies: sessionB });
  const reloginRowA = (afterRelogin.json?.devices ?? []).find((device) => device.deviceId === deviceA);
  record("an approved device is still trusted after signing in again", Boolean(reloginRowA?.trusted), JSON.stringify({ trusted: reloginRowA?.trusted, trustedAt: reloginRowA?.trustedAt }));

  const keysList = await call("/api/e2ee/keys", { cookies: sessionB });
  const keyRowB = keysList.json?.keys?.find((key) => key.deviceId === deviceB);
  record("the linked device exposes its public key", Boolean(keyRowB?.publicKey), JSON.stringify({ found: Boolean(keyRowB) }));

  // Revoking the session removes that device's encryption approval.
  // The browser used for the second sign-in must still be visible: either bound
  // to its device or listed as a signed-in session that has no key yet.
  const currentSession =
    (afterRelogin.json?.devices ?? []).flatMap((device) => device.sessions).find((session) => session.current) ??
    (afterRelogin.json?.unboundSessions ?? []).find((session) => session.current);
  record("the browser in use is listed after signing in again", Boolean(currentSession), JSON.stringify({ currentSessionId: afterRelogin.json?.currentSessionId, listed: Boolean(currentSession) }));

  // Captured before any revocation, so the assertions describe the state the
  // linking flow itself produced.
  const linkRow = await client.query("select status, used_at, source_device_id, code_hash from device_link_requests where user_id=$1", [userId]);
  record("only the code hash is stored", linkRow.rows.length === 1 && linkRow.rows[0].status === "approved" && Boolean(linkRow.rows[0].used_at) && linkRow.rows[0].source_device_id === deviceA && linkRow.rows[0].code_hash !== code, JSON.stringify(linkRow.rows[0]));

  const sessionId = currentSession?.id;
  if (sessionId) {
    // Extra sign-ins provide a session that is neither the one this test uses
    // (sessionId) nor the one it is acting from, so revoking it is safe.
    const thirdLogin = await call("/api/auth/login", { method: "POST", body: { acceptTerms: true, acceptPrivacy: true, identifier: EMAIL, password: PASSWORD } });
    const fourthLogin = await call("/api/auth/login", { method: "POST", body: { acceptTerms: true, acceptPrivacy: true, identifier: EMAIL, password: PASSWORD } });
    const list = await call("/api/privacy/devices", { cookies: fourthLogin.cookies });
    const unbound = list.json?.unboundSessions ?? [];
    const spare = unbound.find((session) => !session.current && session.id !== sessionId);
    record("signed-in sessions with no key are listed as unbound", unbound.length >= 3 && Boolean(spare), `unbound=${unbound.length} spare=${Boolean(spare)} third=${Boolean(thirdLogin.cookies)}`);

    const revoked = spare
      ? await call("/api/privacy/devices", { method: "DELETE", cookies: fourthLogin.cookies, body: { id: spare.id } })
      : { status: 0, text: "no spare session" };
    record("a session can be revoked", revoked.status === 200, `status=${revoked.status} ${revoked.text.slice(0, 120)}`);
    // Revoking a session that was never bound to a device must not disturb a
    // trusted device's approval.
    const afterRevoke = await client.query("select device_id, trusted_at from e2ee_keys where user_id=$1 order by device_id", [userId]);
    record(
      "revoking an unbound session leaves device trust intact",
      afterRevoke.rows.every((row) => row.trusted_at !== null),
      JSON.stringify(afterRevoke.rows),
    );

    const boundSessionId = reloginRowA?.sessions?.[0]?.id;
    if (boundSessionId) {
      const revokeBound = await call("/api/privacy/devices", { method: "DELETE", cookies: sessionB, body: { id: boundSessionId } });
      const boundRevokedRow = await client.query("select device_id, trusted_at from e2ee_keys where user_id=$1 order by device_id", [userId]);
      record(
        "revoking a device's signed-in session drops its trust",
        revokeBound.status === 200 && boundRevokedRow.rows.find((row) => row.device_id === deviceA)?.trusted_at === null,
        `status=${revokeBound.status} ${JSON.stringify(boundRevokedRow.rows)}`,
      );
    } else {
      record("revoking a device's signed-in session drops its trust", false, "no bound session was listed");
    }
  } else {
    record("a session can be revoked", false, "current session was not listed for device A");
  }

  const stored = await client.query("select device_id, trusted_at, device_name, platform from e2ee_keys where user_id=$1 order by device_id", [userId]);
  record("device identity is stored with the key", stored.rows.some((row) => row.device_id === deviceB && row.device_name === "Work laptop — Chrome" && row.platform), JSON.stringify(stored.rows));

  const unauth = await call("/api/privacy/devices");
  record("the device list requires a session", unauth.status === 401, `status=${unauth.status}`);
} catch (error) {
  record("smoke run completed", false, error instanceof Error ? error.message : String(error));
} finally {
  try {
    if (userId) {
      await client.query("delete from users where id=$1", [userId]);
      const left = await client.query("select (select count(*) from e2ee_keys where user_id=$1) as keys, (select count(*) from device_link_requests where user_id=$1) as links, (select count(*) from device_sessions where user_id=$1) as sessions", [userId]);
      console.log("cleanup: " + JSON.stringify(left.rows[0]));
    }
    await client.end();
  } catch { /* cleanup is best effort */ }
  const failed = results.filter((result) => !result.ok);
  console.log(`SUMMARY ${results.length - failed.length}/${results.length} passed`);
  process.exit(failed.length ? 1 : 0);
}
