import assert from "node:assert/strict";
import { chromium } from "playwright";
import { createHash, createHmac } from "node:crypto";
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
    if (existing) {
      ({ device, contact } = existing);
      for (const client of [device, contact]) client.page.on("pageerror", e => errors.push(e.message));
      // The preceding workflow revokes a session as part of its negative
      // cases. Use a fresh disposable login so these recovery assertions test
      // the authenticated, pending-browser path rather than a revoked cookie.
      device = await login(owner);
      await device.page.goto(base + "/app/profile#encryption-devices");
      await device.page.getByText("This device: Waiting for approval", { exact: true }).waitFor();
    }
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
    await pool.query("update e2ee_keys set trusted_at=null where user_id=$1", [owner.id]);
    await device.page.goto(base + "/app/profile#encryption-devices");
    await device.page.getByText("This device: Waiting for approval", { exact: true }).waitFor();
    assert.equal(await device.page.getByRole("button", { name: "Approve encryption device", exact: true }).count(), 0, "Pending browsers do not offer impossible approval controls");
    await device.page.getByText(/No trusted encryption device is registered/).waitFor();
    const fingerprint = await device.page.getByLabel("This device fingerprint").innerText();
    const target = (await pool.query("select device_id,session_id,public_key from e2ee_keys where user_id=$1 and trusted_at is null order by created_at desc limit 1", [owner.id])).rows[0]; assert(target);
    assert.equal(createHash("sha256").update(target.public_key).digest("hex"), fingerprint);
    const emailCode = "381529";
    const codeHash = createHmac("sha256", jwtSecret).update(`device-recovery-email:v1:${owner.id}:${target.device_id}:${target.session_id}:${fingerprint}:${emailCode}`).digest("hex");
    await pool.query("insert into device_recovery_email_codes(user_id,device_id,session_id,fingerprint,code_hash,expires_at) values($1,$2,$3,$4,$5,now()+interval '10 minutes')", [owner.id,target.device_id,target.session_id,fingerprint,codeHash]);
    const recovery = { action: "challenge", decision: "recover", sourceDeviceId: target.device_id, targetDeviceId: target.device_id, targetFingerprint: fingerprint, confirmation: "RESET ENCRYPTION TRUST" };
    assert.equal((await api(device.cookies, { ...recovery, confirmation: "yes" })).status, 422);
    assert.equal((await api(contact.cookies, recovery)).status, 403, "Recovery is account scoped");
    assert.equal((await api(device.cookies, recovery)).status, 422, "Verified-email accounts must supply the recovery code");
    // A known fixture factor and signed stale fixture session exercise fresh auth;
    // neither a real account's factor nor private key is read or changed.
    const factor = new Secret({ size: 20 }), enabledAt = Date.now() - 20 * 60000;
    await pool.query("insert into user_2fa(user_id,secret,enabled,enabled_at) values($1,$2,true,$3)", [owner.id, factor.base32, new Date(enabledAt)]);
    const token = async authTime => new SignJWT({ usr: owner.username, iatMs: Date.now(), authTime, mfaTime: enabledAt + 1, sid: target.session_id }).setProtectedHeader({ alg: "HS256", typ: "JWT" }).setSubject(owner.id).setIssuer("maddy-chats").setAudience("maddy-chats-web").setIssuedAt().setExpirationTime("15m").sign(new TextEncoder().encode(jwtSecret));
    const currentToken = await token(Date.now());
    device.cookies = "maddy_session=" + currentToken;
    await device.page.context().addCookies([{ name: "maddy_session", value: currentToken, url: base, httpOnly: true, sameSite: "Lax" }]);
    assert.equal((await api(device.cookies, { ...recovery, emailCode: "000000" })).status, 403, "A wrong mailbox code cannot enroll the browser");
    const staleToken = await token(Date.now() - 10 * 60000);
    const legacyToken = await new SignJWT({ usr: owner.username, iatMs: Date.now(), authTime: Date.now() - 10 * 60000, mfaTime: enabledAt + 1 }).setProtectedHeader({ alg: "HS256", typ: "JWT" }).setSubject(owner.id).setIssuer("maddy-chats").setAudience("maddy-chats-web").setIssuedAt().setExpirationTime("15m").sign(new TextEncoder().encode(jwtSecret));
    device.cookies = "maddy_session=" + staleToken;
    await device.page.context().addCookies([{ name: "maddy_session", value: staleToken, url: base, httpOnly: true, sameSite: "Lax" }]);
    assert.equal((await api(device.cookies, recovery)).status, 403, "Old cookies cannot recover trust");
    assert.equal((await api(device.cookies, { ...recovery, password, mfaCode: "invalid" })).status, 403, "MFA cannot be bypassed");
    device.cookies = "maddy_session=" + currentToken;
    await device.page.context().addCookies([{ name: "maddy_session", value: currentToken, url: base, httpOnly: true, sameSite: "Lax" }]);
    const before = (await pool.query("select id,text,encrypted from messages where conversation_id=$1 order by id", [conversationId])).rows;
    const wrapsBefore = (await pool.query("select count(*)::int as n from e2ee_conversation_keys where conversation_id=$1", [conversationId])).rows[0].n;
    await device.page.reload(); await device.page.getByLabel("This device fingerprint").waitFor();
    await device.page.getByRole("button", { name: "Emergency recovery: no trusted device or recovery file", exact: true }).click();
    const section = device.page.locator("#encryption-devices");
    await section.getByLabel("Encryption recovery confirmation").fill("RESET ENCRYPTION TRUST");
    await section.getByLabel("Email recovery code").fill(emailCode);
    await section.getByLabel("Current password", { exact: true }).fill(password);
    await section.getByLabel("Authenticator or recovery code (if enabled)").fill(new TOTP({ secret: factor }).generate());
    const approvalActions = [];
    device.page.on("response", response => {
      if (response.url().endsWith("/api/e2ee/devices/approve")) approvalActions.push({ action: response.request().postDataJSON()?.action, status: response.status(), body: response.text().catch(() => "") });
    });
    const proofResponse = device.page.waitForResponse(r => r.url().endsWith("/api/e2ee/devices/approve") && r.request().postDataJSON()?.action === "approve", { timeout: 10000 }).catch(() => null);
    await section.getByRole("button", { name: /Confirm email and recover this browser/ }).click();
    const approved = await proofResponse;
    if (!approved) {
      const statuses = await section.getByRole("status").allInnerTexts();
      throw new Error(`Recovery never submitted its key proof; UI status=${JSON.stringify(statuses)}; API=${JSON.stringify(await Promise.all(approvalActions.map(async item => ({ action: item.action, status: item.status, body: await item.body }))))}; page errors=${JSON.stringify(errors)}`);
    }
    assert.equal(approved.status(), 200, await approved.text());
    const proof = approved.request().postDataJSON();
    device.cookies = (await device.page.context().cookies()).filter(cookie => /^(maddy_session|maddy_refresh)$/.test(cookie.name)).map(cookie => `${cookie.name}=${cookie.value}`).join("; ");
    assert.equal((await api(device.cookies, { ...proof, proof: "A".repeat(43) })).status, 403, "A cookie cannot substitute for private-key proof");
    assert.equal((await pool.query("select used_at from device_recovery_email_codes where code_hash=$1", [codeHash])).rows[0].used_at !== null, true, "Mailbox code is consumed exactly once");
    await section.getByText("This device: Trusted", { exact: true }).waitFor();
    const trusted = (await pool.query("select device_id from e2ee_keys where user_id=$1 and trusted_at is not null", [owner.id])).rows;
    assert.deepEqual(trusted.map(k => k.device_id), [target.device_id], "Only the proven recovery key is enrolled");
    const activeSessions = (await pool.query("select id from device_sessions where user_id=$1 and revoked_at is null and expires_at>now()", [owner.id])).rows;
    assert.deepEqual(activeSessions.map(session => session.id), [target.session_id], "Older browser sessions cannot retain cached authorization after recovery");
    for (const revoked of [staleToken, legacyToken]) assert.equal((await fetch(base + "/api/auth/me", { headers: { Cookie: "maddy_session=" + revoked } })).status, 401, "Recovery revokes older session cookies, including legacy cookies without a session ID");
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
    await device.page.getByRole("textbox", { name: "Message text" }).fill("Recovered browser encrypted reply");
    await device.page.getByRole("textbox", { name: "Message text" }).press("Enter");
    await contact.page.getByRole("region", { name: "Conversation", exact: true }).getByText("Recovered browser encrypted reply", { exact: true }).waitFor({ timeout: 45000 });
    const sent = (await pool.query("select encrypted,text from messages where conversation_id=$1 and sender_id=$2 order by created_at desc limit 1", [conversationId, owner.id])).rows[0];
    assert(sent.encrypted); assert(!sent.text.includes("Recovered browser encrypted reply"));
    assert.equal(await device.page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    assert.deepEqual(errors, []);
    return { olderSessionsAndLegacyCookiesRevoked: true, lostTrustedBrowserRecovery: true, noTrustedDeviceRecovery: true, privateKeyProof: true, staleSessionRejected: true, wrongPasswordRejected: true, mfaRequired: true, crossAccountRejected: true, replayRejected: true, historyPreserved: true, encryptedDelivery: true, mobileOverflow: false, browserErrors: 0 };
  } finally { await browser.close(); }
}
