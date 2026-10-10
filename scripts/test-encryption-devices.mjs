import assert from "node:assert/strict";
import { chromium } from "playwright";
import { createHash } from "node:crypto";
import { SignJWT } from "jose";
import { Secret, TOTP } from "otpauth";

/** Recovery fixtures are restricted to disposable test accounts, including on live. */
export async function testEncryptionDevices(base, pool, owner, peer, password, conversationId, jwtSecret, existing) {
  assert(["127.0.0.1", "localhost", "maddychats.onrender.com"].includes(new URL(base).hostname));
  assert(/^(restored_|releaseqa_wf_)/.test(owner.username));
  assert(/^(restored_|releaseqa_wf_)/.test(peer.username));
  const browser = await chromium.launch();
  const errors = [];
  const api = (cookies, body) => fetch(base + "/api/e2ee/devices/approve", { method: "POST", headers: { Origin: base, Cookie: cookies, "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const login = async account => {
    const r = await fetch(base + "/api/auth/login", { method: "POST", headers: { Origin: base, "Content-Type": "application/json" }, body: JSON.stringify({ identifier: account.username, password }) });
    assert.equal(r.status, 200);
    const cookies = r.headers.getSetCookie().filter(c => /^(maddy_session|maddy_refresh)=/.test(c)).map(c => c.split(";")[0]).join("; ");
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: "block" });
    await context.addCookies(cookies.split("; ").map(c => { const i = c.indexOf("="); return { name: c.slice(0, i), value: c.slice(i + 1), url: base, httpOnly: true, sameSite: "Lax" }; }));
    const page = await context.newPage(); page.on("pageerror", e => errors.push(e.message));
    return { page, cookies };
  };
  try {
    let device, contact;
    if (existing) ({ device, contact } = existing);
    else {
      const original = await login(owner); contact = await login(peer);
      for (const client of [original, contact]) { await client.page.goto(base + "/app/profile"); await client.page.getByText("This device: Trusted", { exact: true }).waitFor(); }
      for (const client of [original, contact]) { await client.page.goto(base + "/app/chats/" + conversationId); await client.page.getByRole("textbox", { name: "Message text" }).waitFor(); }
      await original.page.getByRole("textbox", { name: "Message text" }).fill("Recovery baseline ciphertext");
      await original.page.getByRole("textbox", { name: "Message text" }).press("Enter");
      await contact.page.getByRole("region", { name: "Conversation", exact: true }).getByText("Recovery baseline ciphertext", { exact: true }).waitFor();
      await original.page.close(); device = await login(owner);
    }
    // Negative protocol cases consume the real limiter too. Respect its window;
    // never clear production buckets or change limits to make tests pass.
    const bucket = (await pool.query("select count,greatest(0,extract(epoch from window_started_at + interval '60 seconds' - now())*1000)::int as wait_ms from rate_limit_buckets where key=$1", ["e2ee-approval:" + owner.id])).rows[0];
    if (bucket?.count > 8 && bucket.wait_ms > 0) await new Promise(resolve => setTimeout(resolve, bucket.wait_ms + 100));
    await device.page.goto(base + "/app/profile#encryption-devices");
    await device.page.getByText("This device: Waiting for approval", { exact: true }).waitFor();
    assert.equal(await device.page.getByRole("button", { name: "Approve encryption device", exact: true }).count(), 0, "Pending browsers do not offer impossible approval controls");
    assert(await device.page.getByText("Trusted encryption key", { exact: true }).count() > 0, "Lost anchors are visible");
    const fingerprint = await device.page.getByLabel("This device fingerprint").innerText();
    const target = (await pool.query("select device_id,session_id,public_key from e2ee_keys where user_id=$1 and trusted_at is null order by created_at desc limit 1", [owner.id])).rows[0]; assert(target);
    assert.equal(createHash("sha256").update(target.public_key).digest("hex"), fingerprint);
    const recovery = { action: "challenge", decision: "recover", sourceDeviceId: target.device_id, targetDeviceId: target.device_id, targetFingerprint: fingerprint, confirmation: "RESET ENCRYPTION TRUST" };
    assert.equal((await api(device.cookies, { ...recovery, confirmation: "yes" })).status, 422);
    assert.equal((await api(contact.cookies, recovery)).status, 403, "Recovery is account scoped");
    // A known fixture factor and signed stale fixture session exercise fresh auth;
    // neither a real account's factor nor private key is read or changed.
    const factor = new Secret({ size: 20 }), enabledAt = Date.now() - 20 * 60000;
    await pool.query("insert into user_2fa(user_id,secret,enabled,enabled_at) values($1,$2,true,$3)", [owner.id, factor.base32, new Date(enabledAt)]);
    const token = async authTime => new SignJWT({ usr: owner.username, iatMs: Date.now(), authTime, mfaTime: enabledAt + 1, sid: target.session_id }).setProtectedHeader({ alg: "HS256", typ: "JWT" }).setSubject(owner.id).setIssuer("maddy-chats").setAudience("maddy-chats-web").setIssuedAt().setExpirationTime("15m").sign(new TextEncoder().encode(jwtSecret));
    const staleToken = await token(Date.now() - 10 * 60000);
    device.cookies = "maddy_session=" + staleToken;
    await device.page.context().addCookies([{ name: "maddy_session", value: staleToken, url: base, httpOnly: true, sameSite: "Lax" }]);
    assert.equal((await api(device.cookies, recovery)).status, 403, "Old cookies cannot recover trust");
    assert.equal((await api(device.cookies, { ...recovery, password: "WrongPassword1" })).status, 403);
    assert.equal((await api(device.cookies, { ...recovery, password, mfaCode: "invalid" })).status, 403, "MFA cannot be bypassed");
    const before = (await pool.query("select id,text,encrypted from messages where conversation_id=$1 order by id", [conversationId])).rows;
    const wrapsBefore = (await pool.query("select count(*)::int as n from e2ee_conversation_keys where conversation_id=$1", [conversationId])).rows[0].n;
    await device.page.reload(); await device.page.getByLabel("This device fingerprint").waitFor();
    await device.page.getByRole("button", { name: "I cannot access a trusted device", exact: true }).click();
    const section = device.page.locator("#encryption-devices");
    await section.getByLabel("Encryption recovery confirmation").fill("RESET ENCRYPTION TRUST");
    await section.getByLabel("Current password", { exact: true }).fill(password);
    await section.getByLabel("Authenticator or recovery code (if enabled)").fill(new TOTP({ secret: factor }).generate());
    const proofResponse = device.page.waitForResponse(r => r.url().endsWith("/api/e2ee/devices/approve") && r.request().postDataJSON()?.action === "approve");
    await section.getByRole("button", { name: "Recover encryption on this browser", exact: true }).click();
    const approved = await proofResponse; assert.equal(approved.status(), 200);
    const proof = approved.request().postDataJSON();
    assert.equal((await api(device.cookies, { ...proof, proof: "A".repeat(43) })).status, 403, "A cookie cannot substitute for private-key proof");
    await section.getByText("This device: Trusted", { exact: true }).waitFor();
    const trusted = (await pool.query("select device_id from e2ee_keys where user_id=$1 and trusted_at is not null", [owner.id])).rows;
    assert.deepEqual(trusted.map(k => k.device_id), [target.device_id], "Only the proven recovery key is enrolled");
    assert.equal((await api(device.cookies, proof)).status, 409);
    assert.deepEqual((await pool.query("select id,text,encrypted from messages where conversation_id=$1 order by id", [conversationId])).rows, before, "Recovery never rewrites history");
    assert.equal((await pool.query("select count(*)::int as n from e2ee_conversation_keys where conversation_id=$1", [conversationId])).rows[0].n, wrapsBefore, "Recovery never replaces conversation keys");
    // An existing contact explicitly verifies the changed identity before sharing keys.
    await contact.page.goto(base + "/app/chats/" + conversationId);
    await contact.page.getByRole("textbox", { name: "Message text" }).waitFor();
    const changed = contact.page.getByRole("button", { name: /Encryption device keys changed/ });
    await changed.waitFor(); await changed.click();
    await contact.page.getByRole("textbox", { name: "Message text" }).fill("Encrypted recovery verification");
    await contact.page.getByRole("textbox", { name: "Message text" }).press("Enter");
    await device.page.goto(base + "/app/chats/" + conversationId);
    await device.page.getByRole("region", { name: "Conversation", exact: true }).getByText("Encrypted recovery verification", { exact: true }).waitFor({ timeout: 45000 });
    assert((await pool.query("select encrypted,text from messages where conversation_id=$1 and sender_id=$2 order by created_at desc limit 1", [conversationId, peer.id])).rows[0].encrypted);
    // Zero trusted rows must also provide an authenticated path, not a dead end.
    await pool.query("update e2ee_keys set trusted_at=null where user_id=$1", [owner.id]);
    const freshToken = await token(Date.now()); device.cookies = "maddy_session=" + freshToken;
    const enrollmentRegistration = await fetch(base + "/api/e2ee/keys", { method: "POST", headers: { Origin: base, Cookie: device.cookies, "Content-Type": "application/json" }, body: JSON.stringify({ deviceId: "recovery-no-anchor-fixture", publicKey: target.public_key, encryptedPrivateKey: "fixture-wrapped-private-key" }) });
    assert.equal(enrollmentRegistration.status, 200);
    assert.equal((await enrollmentRegistration.json()).pendingApproval, true, "Historical keys require explicit recovery even when all trust is revoked");
    await device.page.context().addCookies([{ name: "maddy_session", value: freshToken, url: base, httpOnly: true, sameSite: "Lax" }]);
    await device.page.goto(base + "/app/profile#encryption-devices");
    await device.page.getByText(/No trusted encryption device is registered/).waitFor();
    await device.page.getByRole("button", { name: "I cannot access a trusted device", exact: true }).click();
    await device.page.getByLabel("Encryption recovery confirmation").fill("RESET ENCRYPTION TRUST");
    const enrollment = device.page.waitForResponse(r => r.url().endsWith("/api/e2ee/devices/approve") && r.request().postDataJSON()?.action === "challenge");
    const enrollmentProof = device.page.waitForResponse(r => r.url().endsWith("/api/e2ee/devices/approve") && r.request().postDataJSON()?.action === "approve");
    await device.page.getByRole("button", { name: "Recover encryption on this browser", exact: true }).click();
    const enrolled = await enrollment; assert.equal(enrolled.status(), 200, await enrolled.text());
    const proven = await enrollmentProof; assert.equal(proven.status(), 200, await proven.text());
    await device.page.getByText("This device: Trusted", { exact: true }).waitFor();
    assert.equal(await device.page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    assert.deepEqual(errors, []);
    return { lostTrustedBrowserRecovery: true, noTrustedDeviceRecovery: true, privateKeyProof: true, staleSessionRejected: true, wrongPasswordRejected: true, mfaRequired: true, crossAccountRejected: true, replayRejected: true, historyPreserved: true, encryptedDelivery: true, mobileOverflow: false, browserErrors: 0 };
  } finally { await browser.close(); }
}
