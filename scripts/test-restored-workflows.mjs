import {testChatScroll} from "./test-chat-scroll.mjs";
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { readFile } from "node:fs/promises";
import { randomBytes, createHash, createHmac } from "node:crypto";
import bcrypt from "bcryptjs";
import { testMobilePerformance } from "./test-mobile-performance.mjs";
import { testStatusPhoto } from "./test-status-photo.mjs";
import { testEncryptionDevices } from "./test-encryption-devices.mjs";
import { testImageViewer } from "./test-image-viewer.mjs";
import sharp from "sharp";
import { testProfilePhotos } from "./test-profile-photos.mjs";
import { resolve } from "node:path";
import { unlink } from "node:fs/promises";
import { testComposerMedia } from "./test-composer-media.mjs";

/** Positive workflows use actual browser keys, recording, storage and database delivery. */
export async function testRestoredWorkflows(base, pool, owner, peer, password, conversationId, ownedLive = false, jwtSecret) {
  const hostname = new URL(base).hostname;
  if (!["localhost", "127.0.0.1"].includes(hostname) && !(ownedLive && hostname === "maddychats.onrender.com")) throw new Error("Owned staging fixtures required");
  const browser = await chromium.launch({ args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"] });
  const pages = []; const errors = []; let registered; let unrelatedCookie;
  const registerName = "restreg_" + randomBytes(6).toString("hex");
  const login = async account => {
    const response = await fetch(base + "/api/auth/login", { method: "POST", headers: { Origin: base, "Content-Type": "application/json" }, body: JSON.stringify({ identifier: account.username, password }) });
    assert.equal(response.status, 200);
    const cookies = response.headers.getSetCookie().filter(cookie => /^(maddy_session|maddy_refresh)=/.test(cookie)).map(cookie => cookie.split(";")[0]).join("; ");
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: "block", permissions: ["microphone"] });
    await context.addInitScript(() => { window.__workflowCsp = []; document.addEventListener("securitypolicyviolation", event => window.__workflowCsp.push(event.violatedDirective)); });
    await context.addCookies(cookies.split("; ").map(cookie => { const i = cookie.indexOf("="); return { name: cookie.slice(0, i), value: cookie.slice(i + 1), url: base, httpOnly: true, sameSite: "Lax" }; }));
    const page = await context.newPage(); page.on("pageerror", error => errors.push(error.message)); pages.push(page);
    return { page, cookies };
  };
  const api = async (route, cookies, body, method = "POST") => fetch(base + route, { method, headers: { Origin: base, Cookie: cookies, "Content-Type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const profile = async page => { await page.goto(base + "/app/profile"); await page.getByLabel("This device fingerprint").waitFor({ timeout: 30000 }); };
  const chat = async page => { await page.goto(base + "/app/chats/" + conversationId); await page.getByRole("textbox", { name: "Message text" }).waitFor(); };
  const refresh = async page => { await page.getByRole("button", { name: "Refresh encryption devices", exact: true }).click(); await page.getByText("Encryption devices refreshed.", { exact: true }).waitFor(); };
  let sessionRaceChecked = false;
  const renewSession = async device => {
    let releaseIdentity; let identityDone; let oldIdentity;
    if (!sessionRaceChecked) {
      sessionRaceChecked = true;
      let ready;
      const prepared = new Promise(resolve => { ready = resolve; });
      const release = new Promise(resolve => { releaseIdentity = resolve; });
      let finished;
      identityDone = new Promise(resolve => { finished = resolve; });
      let intercepted = false;
      await device.page.route("**/api/auth/me", async route => {
        if (intercepted) return route.continue();
        intercepted = true;
        const identity = await route.fetch();
        ready(); await release;
        await route.fulfill({ response: identity }); finished();
      });
      oldIdentity = device.page.evaluate(() => fetch("/api/auth/me", { cache: "no-store" }).then(r => r.status));
      await prepared;
    }
    const response = await api("/api/auth/login", "", { identifier: owner.username, password }); assert.equal(response.status, 200);
    device.cookies = response.headers.getSetCookie().filter(cookie => /^(maddy_session|maddy_refresh)=/.test(cookie)).map(cookie => cookie.split(";")[0]).join("; ");
    await device.page.context().addCookies(device.cookies.split("; ").map(cookie => { const i = cookie.indexOf("="); return { name: cookie.slice(0, i), value: cookie.slice(i + 1), url: base, httpOnly: true, sameSite: "Lax" }; }));
    if (releaseIdentity) {
      releaseIdentity(); await identityDone; await oldIdentity;
      await device.page.unroute("**/api/auth/me");
      const identity = await device.page.request.get(base + "/api/auth/me");
      assert.equal(identity.status(), 200);
      assert.equal(identity.headers()["set-cookie"], undefined, "Valid identity responses cannot overwrite a newer login");
      const desired = JSON.parse(Buffer.from(device.cookies.match(/maddy_session=([^;]+)/)[1].split(".")[1], "base64url")).sid;
      const actual = await device.page.request.get(base + "/api/privacy/devices");
      assert.equal((await actual.json()).devices.find(row => row.current)?.id, desired, "A delayed identity response preserves the newer browser session");
    }
    await profile(device.page);
    const sessions = await (await api("/api/privacy/devices", device.cookies, null, "GET")).json();
    const current = sessions.devices.find(session => session.current); assert(current);
    return current.id;
  };
  try {
    const registrationContext = await browser.newContext({ serviceWorkers: "block" });
    await registrationContext.addInitScript(() => { window.__workflowCsp = []; document.addEventListener("securitypolicyviolation", event => window.__workflowCsp.push(event.violatedDirective)); });
    const registrationPage = await registrationContext.newPage();
    pages.push(registrationPage);
    registrationPage.on("pageerror", error => errors.push(error.message));
    await registrationPage.goto(base + "/signup");
    await registrationPage.getByLabel("Display name", { exact: true }).fill("Workflow registration");
    await registrationPage.getByLabel("Username", { exact: true }).fill(registerName);
    await registrationPage.getByLabel("Email", { exact: true }).fill(registerName + "@example.invalid");
    await registrationPage.getByLabel("Password", { exact: true }).fill(password);
    await registrationPage.getByLabel("Confirm password", { exact: true }).fill(password);
    await registrationPage.getByRole("button", { name: "Create account", exact: true }).click();
    await registrationPage.waitForURL("**/verify-email?delivery=unavailable");
    registered = (await pool.query("select id,username,email,password_hash,email_verified_at from users where username=$1", [registerName])).rows[0];
    assert(registered); assert.equal(registered.email_verified_at, null); assert(await bcrypt.compare(password, registered.password_hash));
    const registration = { displayName: "Workflow registration", username: registerName, email: registered.email, password, confirmPassword: password };
    assert.equal((await api("/api/auth/register", "", registration)).status, 409);
    assert.equal((await api("/api/auth/register", "", { ...registration, email: "invalid" })).status, 422);
    assert.equal((await api("/api/auth/login", "", { identifier: registerName, password })).status, 403);
    // Owned verification-token fixture tests consumption and login, not unavailable external mail delivery.
    const verificationCode = "827194";
    const verificationHash = createHmac("sha256", jwtSecret ?? "disposable-restored-workflows-only-secret-at-least-thirty-two").update(`email-verification:${registered.id}:${verificationCode}`).digest("hex");
    await pool.query("insert into email_verification_tokens(user_id,token_hash,expires_at) values($1,$2,now()-interval '1 second')",[registered.id,verificationHash]);
    assert.equal((await api("/api/auth/verify-email","",{email:registered.email,code:"111111"})).status,400);
    assert.equal((await api("/api/auth/verify-email","",{email:registered.email,code:verificationCode})).status,400);
    await pool.query("update email_verification_tokens set expires_at=now()+interval '10 minutes' where token_hash=$1",[verificationHash]);
    await registrationPage.goto(base+"/verify-email");
    await registrationPage.getByLabel("Email address",{exact:true}).fill(registered.email);
    await registrationPage.getByLabel("Verification code",{exact:true}).fill(verificationCode);
    await registrationPage.getByRole("button",{name:"Verify email",exact:true}).click();
    await registrationPage.getByRole("heading",{name:"Email Verified!",exact:true}).waitFor();
    assert.equal((await registrationPage.context().cookies()).some(cookie=>cookie.name==="maddy_session"),false,"Verification must not grant a session");
    assert.equal((await api("/api/auth/verify-email","",{email:registered.email,code:verificationCode})).status,400);
    // Restore only this owned fixture to test compatibility with existing links.
    await pool.query("update users set email_verified_at=null where id=$1",[registered.id]);
    const verificationToken = randomBytes(32).toString("base64url");
    await pool.query("insert into email_verification_tokens(user_id,token_hash,expires_at) values($1,$2,now()+interval '1 hour')", [registered.id, createHash("sha256").update(verificationToken).digest("hex")]);
    await registrationPage.goto(base + "/verify-email?token=" + verificationToken);
    await registrationPage.getByRole("heading", { name: "Email Verified!", exact: true }).waitFor();
    assert.equal((await api("/api/auth/verify-email", "", { token: verificationToken })).status, 400);
    const verifiedLogin = await api("/api/auth/login", "", { identifier: registerName, password }); assert.equal(verifiedLogin.status, 200);
    unrelatedCookie = verifiedLogin.headers.getSetCookie().filter(cookie => /^(maddy_session|maddy_refresh)=/.test(cookie)).map(cookie => cookie.split(";")[0]).join("; ");
    assert.equal((await api("/api/auth/login", "", { identifier: registerName, password: "IncorrectPassword1" })).status, 401);
    const source = await login(owner), recipient = await login(peer);
    await profile(source.page); await profile(recipient.page);
    await source.page.getByText("This device: Trusted", { exact: true }).waitFor();
    assert.equal(await source.page.getByText(/App (by|My) Mudassir/).count(), 0);
    await source.page.setViewportSize({ width: 1440, height: 1000 });
    assert.equal(await source.page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    const statusChecks = await testStatusPhoto(base, pool, owner, peer, source, recipient, unrelatedCookie);
    await source.page.setViewportSize({ width: 390, height: 844 });
    let capabilityFailures = 0;
    await source.page.route("**/api/chat-capabilities", async route => {
      if (capabilityFailures++ === 0) await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "Temporary interruption" }) });
      else await route.continue();
    });
    const capabilityRecovery = source.page.waitForResponse(response => response.url().endsWith("/api/chat-capabilities") && response.status() === 200);
    await chat(source.page); await chat(recipient.page);
    await capabilityRecovery;
    await source.page.waitForFunction(() => {
      const button = document.querySelector('button[title="Record voice message"]');
      return button instanceof HTMLButtonElement && !button.disabled;
    });
    assert(capabilityFailures >= 2, "Media capability request recovers after a transient failure");
    await source.page.unroute("**/api/chat-capabilities");
    // An unreadable encrypted fixture must explain recovery rather than render
    // an empty lock bubble. Removal is restricted to this owned conversation.
    const unreadable = (await pool.query("insert into messages(conversation_id,sender_id,text,type,encrypted) values($1,$2,'unreadable-owned-fixture','text',true) returning id", [conversationId, peer.id])).rows[0].id;
    try {
      await source.page.reload();
      await source.page.getByText("Message not available yet", { exact: true }).waitFor({ timeout: 45000 });
      await source.page.getByRole("button", { name: "Try loading again", exact: true }).click();
      await source.page.getByText("Message not available yet", { exact: true }).waitFor({ timeout: 45000 });
      assert.equal(await source.page.getByRole("button", { name: "Security & recovery", exact: true }).count(), 1);
      assert.equal(await source.page.getByText("unreadable-owned-fixture", { exact: true }).count(), 0, "Ciphertext is never displayed");
    } finally {
      await pool.query("delete from messages where id=$1 and conversation_id=$2", [unreadable, conversationId]);
      await source.page.reload();
    }
    const composer = source.page.getByRole("textbox", { name: "Message text" });
    let sendAttempts = 0;
    const clientIds = new Set();
    await source.page.route("**/api/conversations/*/messages", async route => {
      if (route.request().method() !== "POST") return route.continue();
      const packet=route.request().postDataJSON(); clientIds.add(packet.clientMessageId); sendAttempts++;
      if(sendAttempts===1) {
        await new Promise(resolve=>setTimeout(resolve,300));
        return route.fulfill({status:503,contentType:"application/json",body:JSON.stringify({error:"Disposable test send failure"})});
      }
      if(sendAttempts===2) {const accepted=await route.fetch();if(!accepted.ok()){console.log("Retry acceptance:",accepted.status(),await accepted.text());return route.fulfill({response:accepted});}return route.abort("failed");}
      return route.continue();
    });
    await composer.fill("Real encrypted delivery baseline"); await composer.press("Enter");
    await source.page.locator("p").filter({hasText:"Real encrypted delivery baseline"}).waitFor();
    await source.page.getByRole("button",{name:"Retry failed message",exact:true}).click();

    await recipient.page.getByRole("region", { name: "Conversation", exact: true }).getByText("Real encrypted delivery baseline", { exact: true }).waitFor({ timeout: 30000 });
    await source.page.waitForFunction(()=>!document.querySelector('button[aria-label="Retry failed message"]'));
    await source.page.unroute("**/api/conversations/*/messages");
    assert.equal(clientIds.size,1,"Failed/lost-response retries preserve identity");
    for(let attempt=0;attempt<30 && sendAttempts<3;attempt++)await source.page.waitForTimeout(100);
    assert.equal(sendAttempts,3);
    // Recipient delivery can precede the sender's retry acknowledgement. Wait
    // for that acknowledgement and its durable draft clear before reloading.
    await source.page.waitForFunction(() => document.querySelector('textarea[aria-label="Message text"]')?.value === "");
    let draftCleared = false;
    const draftDeadline = Date.now() + 15000;
    while (!draftCleared && Date.now() < draftDeadline) {
      draftCleared = await source.page.evaluate(async ({ userId, conversationId }) => {
      const db = await new Promise((resolve, reject) => {
        const request = indexedDB.open(`circlo-outbox:${userId}`);
        request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
      });
      try {
        const record = await new Promise((resolve, reject) => {
          const request = db.transaction("messages").objectStore("messages").get(`draft:${conversationId}`);
          request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
        });
        return record === undefined;
      } finally { db.close(); }
    }, { userId: owner.id, conversationId });
      if (!draftCleared) await source.page.waitForTimeout(100);
    }
    assert(draftCleared, "Acknowledged delivery durably clears the encrypted draft");
    const committed=(await pool.query("select id from messages where conversation_id=$1",[conversationId])).rows;
    assert.equal(committed.length,1,"Retries persist one message");
    assert.equal((await pool.query("select count(*)::int as count from realtime_events where payload->>'type'='message:new' and payload->'message'->>'id'=$1",[committed[0].id])).rows[0].count,2,"Each member receives exactly one durable new-message event");
    const mobileChecks = await testMobilePerformance(base, pool, source, owner, conversationId);
    const sourceSession = await renewSession(source);
    for (let attempt = 0; attempt < 50; attempt++) {
      if ((await pool.query("select trusted_at from e2ee_keys where user_id=$1 and session_id=$2", [owner.id, sourceSession])).rows[0]?.trusted_at) break;
      await source.page.waitForTimeout(200);
    }
    assert((await pool.query("select trusted_at from e2ee_keys where user_id=$1 and session_id=$2", [owner.id, sourceSession])).rows[0]?.trusted_at, "An existing private key rebinds after sign-in without replacement");
    const target = await login(owner); await chat(target.page);
    await target.page.getByRole("textbox", { name: "Message text" }).fill("Queued new device delivery");
    await target.page.getByRole("textbox", { name: "Message text" }).press("Enter");
    await target.page.getByText("Queued", { exact: true }).waitFor();
    await target.page.getByRole("button", { name: "Try now", exact: true }).click();
    await target.page.waitForURL("**/app/profile#encryption-devices");
    await target.page.getByLabel("This device fingerprint").waitFor();
    await target.page.getByRole("button", { name: "Request device linking", exact: true }).click();
    const code = await target.page.getByLabel("Device linking code").innerText();
    const [request] = (await pool.query("select id,device_id,fingerprint,session_id from device_link_requests where user_id=$1 and status='pending'", [owner.id])).rows;
    assert(request); assert.match(code, /^[A-F0-9]{16}$/);
    const sourceId = (await pool.query("select device_id from e2ee_keys where user_id=$1 and trusted_at is not null", [owner.id])).rows[0].device_id;
    const challenge = { action: "challenge", sourceDeviceId: sourceId, targetDeviceId: request.device_id, targetFingerprint: request.fingerprint, linkId: request.id, code };
    assert.equal((await api("/api/e2ee/devices/approve", recipient.cookies, challenge)).status, 403);
    assert.equal((await api("/api/e2ee/devices/approve", source.cookies, { ...challenge, code: "BAD" })).status, 403);
    await profile(source.page); await refresh(source.page);
    await source.page.getByLabel(`Linking code for ${request.device_id}`).fill(code);
    await source.page.getByLabel("I compared this fingerprint with Profile on my new device and they match.").check();
    const proofResponse = source.page.waitForResponse(response => response.url().endsWith("/api/e2ee/devices/approve") && response.request().postDataJSON()?.action === "approve");
    await source.page.getByRole("button", { name: "Approve encryption device", exact: true }).click();
    const proof = (await proofResponse).request().postDataJSON();
    await source.page.getByText(/Device approved\. Restore/).waitFor();
    assert.equal((await pool.query("select status from device_link_requests where id=$1", [request.id])).rows[0].status, "approved");
    assert.equal((await api("/api/e2ee/devices/approve", source.cookies, challenge)).status, 409);
    assert.equal((await api("/api/e2ee/devices/approve", source.cookies, proof)).status, 409);
    await refresh(target.page); await target.page.getByText("This device: Trusted", { exact: true }).waitFor();
    await chat(source.page);
    await source.page.getByRole("button", { name: "End-to-end encryption is active. View details", exact: true }).click();
    await source.page.getByRole("button", { name: "Restore my other devices", exact: true }).click();
    await source.page.getByText(/Shared \d+ existing key/).waitFor({ timeout: 30000 });
    await chat(target.page);
    await recipient.page.getByRole("region", { name: "Conversation", exact: true }).getByText("Queued new device delivery", { exact: true }).waitFor({ timeout: 45000 });
    await chat(source.page);
    // A real file is encrypted by the composer and decrypted by the recipient.
    const fileContent = "Authorized encrypted attachment verification\n";
    await source.page.locator('input[type="file"]').first().setInputFiles({ name: "workflow-check.txt", mimeType: "text/plain", buffer: Buffer.from(fileContent) });
    const upload = source.page.waitForResponse(response => response.url().endsWith("/api/upload/message") && response.request().method() === "POST");
    await source.page.getByRole("button", { name: "Send message", exact: true }).click();
    const fileResponse = await upload; assert.equal(fileResponse.status(), 201);
    const fileMessage = (await fileResponse.json()).message;
    const download = recipient.page.getByRole("link", { name: "Download workflow-check.txt", exact: true });
    await download.waitFor(); await recipient.page.waitForFunction(() => document.querySelector('a[aria-label="Download workflow-check.txt"]')?.href.startsWith("blob:"));
    const downloaded = recipient.page.waitForEvent("download"); await download.click();
    assert.equal(await readFile(await (await downloaded).path(), "utf8"), fileContent);
    const stored = (await pool.query("select id from message_attachments where message_id=$1", [fileMessage.id])).rows[0].id;
    assert.equal((await fetch(base + "/api/media/" + stored)).status, 401);
    const authorizedMedia = await fetch(base + "/api/media/" + stored, { headers: { Cookie: recipient.cookies } }); assert.equal(authorizedMedia.status, 200);
    assert(!Buffer.from(await authorizedMedia.arrayBuffer()).includes(Buffer.from(fileContent)), "The server and storage return ciphertext, not readable file bytes");
    assert.equal((await fetch(base + "/api/media/" + stored, { headers: { Cookie: unrelatedCookie } })).status, 404);
    // A decrypted photo must open outside message-row containment and fit every viewport.
    const photo = await sharp({ create: { width: 1200, height: 900, channels: 3, background: "#343042" } }).png().toBuffer();
    await source.page.locator('input[type="file"]').first().setInputFiles({ name: "viewer-check.png", mimeType: "image/png", buffer: photo });
    const photoUpload = source.page.waitForResponse(response => response.url().endsWith("/api/upload/message") && response.request().method() === "POST");
    await source.page.getByRole("button", { name: "Send message", exact: true }).click();
    assert.equal((await photoUpload).status(), 201);
    await testImageViewer(recipient.page, "viewer-check.png");
    await testComposerMedia(base, source, recipient, pool, conversationId);
    await testChatScroll(base, source, recipient, pool, conversationId);
    // Chromium generates a microphone stream; the application's MediaRecorder performs real recording.
    await source.page.getByRole("button", { name: "Record voice message", exact: true }).click();
    await source.page.getByRole("button", { name: "Stop recording", exact: true }).waitFor();
    await source.page.waitForTimeout(1600); await source.page.getByRole("button", { name: "Stop recording", exact: true }).click();
    const voiceUpload = source.page.waitForResponse(response => response.url().endsWith("/api/upload/message") && response.request().method() === "POST");
    await source.page.getByRole("button", { name: "Send voice message", exact: true }).click();
    assert.equal((await voiceUpload).status(), 201);
    const ownVoice = source.page.getByRole("button", { name: "Play voice message", exact: true }).first();
    await ownVoice.waitFor();
    const contrast = await ownVoice.evaluate(new Function("button", String.raw`
      const bubble = button.parentElement;
      const rgb = value => value.match(/[\d.]+/g).slice(0, 3).map(Number);
      const luminance = value => rgb(value).map(v => v / 255).map(v => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4).reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0);
      const foreground = luminance(getComputedStyle(button).color);
      const background = luminance(getComputedStyle(bubble).backgroundColor);
      return (Math.max(foreground, background) + 0.05) / (Math.min(foreground, background) + 0.05);
    `));
    assert(contrast >= 4.5, "Voice controls must have readable contrast on their bubble");
    await recipient.page.getByRole("button", { name: "Play voice message", exact: true }).click();
    await recipient.page.getByRole("button", { name: "Pause voice message", exact: true }).waitFor();
    await recipient.page.waitForFunction(() => Array.from(document.querySelectorAll('[aria-valuenow]')).some(waveform => Number(waveform.getAttribute("aria-valuenow")) > 0));
    // No cron HTTP request is injected: the existing processor must deliver the persisted job.
    await composer.fill("Actual scheduled encrypted delivery");
    await source.page.getByRole("button", { name: "Schedule message", exact: true }).click();
    const due = new Date(Date.now() + 15000);
    const localDate = new Date(due.getTime() - due.getTimezoneOffset() * 60000).toISOString().slice(0, 19).replace(/:00$/, ""); // Match datetime-local normalization of zero seconds.
    await source.page.locator('input[type="datetime-local"]').fill(localDate);
    const scheduledResponse = source.page.waitForResponse(response => response.url().endsWith(`/conversations/${conversationId}/scheduled`) && response.request().method() === "POST");
    await source.page.getByRole("button", { name: "Schedule", exact: true }).click();
    const scheduled = await scheduledResponse; assert.equal(scheduled.status(), 201); const job = (await scheduled.json()).scheduled;
    assert.notEqual(job.text, "Actual scheduled encrypted delivery");
    // All authenticated browser pages close before delivery; no client can pump the scheduler.
    const sourceContext = source.page.context(), recipientContext = recipient.page.context();
    for (const page of [source.page, recipient.page, target.page]) { assert.deepEqual(await page.evaluate(() => window.__workflowCsp), []); await page.close(); }
    let completed;
    // A session lock left on a pooled backend must not stall delivery.
    // This fixture holds and releases the legacy lock on its own connection.
    const legacyLock = await pool.connect();
    let legacyLocked = false;
    try {
      legacyLocked = (await legacyLock.query("select pg_try_advisory_lock(847221903) as locked")).rows[0].locked;
      for (let attempt = 0; attempt < 90; attempt++) {
        completed = (await pool.query("select sent,sent_message_id from scheduled_messages where id=$1", [job.id])).rows[0];
        if (completed?.sent) break;
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    } finally {
      if (legacyLocked) await legacyLock.query("select pg_advisory_unlock(847221903)");
      legacyLock.release();
    }
    assert(completed?.sent, "The server delivers the scheduled job with every chat browser closed");
    source.page = await sourceContext.newPage(); recipient.page = await recipientContext.newPage();
    for (const page of [source.page, recipient.page]) { page.on("pageerror", error => errors.push(error.message)); pages.push(page); }
    await chat(source.page); await chat(recipient.page);
    await recipient.page.getByRole("region", { name: "Conversation", exact: true }).getByText("Actual scheduled encrypted delivery", { exact: true }).waitFor({ timeout: 45000 });
    const delivered = (await pool.query("select sent,sent_message_id from scheduled_messages where id=$1", [job.id])).rows[0]; assert(delivered.sent); assert(delivered.sent_message_id);
    assert.equal((await api(`/api/conversations/${conversationId}/scheduled`, source.cookies, { text: job.text, encrypted: false, scheduledFor: new Date(Date.now() + 60000).toISOString() })).status, 422);
    assert.equal((await api(`/api/conversations/${conversationId}/scheduled`, source.cookies, { text: job.text, encrypted: true, scheduledFor: new Date(Date.now() - 60000).toISOString() })).status, 422);
    assert.equal((await api(`/api/conversations/${conversationId}/scheduled`, unrelatedCookie, { text: job.text, encrypted: true, scheduledFor: new Date(Date.now() + 60000).toISOString() })).status, 404);
    // Rejected and expired requests remain untrusted.
    const rejected = await login(owner); await profile(rejected.page);
    await rejected.page.getByRole("button", { name: "Request device linking" }).click(); await rejected.page.getByLabel("Device linking code").waitFor();
    const [rejectRequest] = (await pool.query("select id,device_id,fingerprint from device_link_requests where user_id=$1 and status='pending'", [owner.id])).rows;
    await profile(source.page); await refresh(source.page); await source.page.getByRole("button", { name: "Reject device linking", exact: true }).click();
    await source.page.getByText("Device linking rejected. No encryption access was granted.", { exact: true }).waitFor();
    assert.equal((await pool.query("select status from device_link_requests where id=$1", [rejectRequest.id])).rows[0].status, "rejected");
    const pendingSession = await renewSession(rejected);
    assert.equal((await pool.query("select trusted_at from e2ee_keys where user_id=$1 and session_id=$2", [owner.id, pendingSession])).rows[0].trusted_at, null, "Rebinding an untrusted key never approves it");
    const renewedLink = rejected.page.waitForResponse(response => response.url().endsWith("/api/e2ee/devices/link") && response.request().method() === "POST");
    await rejected.page.getByRole("button", { name: "Request device linking" }).click();
    const renewal = await renewedLink; assert.equal(renewal.status(), 201);
    const renewedRequest = await renewal.json();
    const expired = (await pool.query("update device_link_requests set expires_at=now()-interval '1 second' where id=$1 and user_id=$2 and status='pending' returning id,device_id,fingerprint", [renewedRequest.id, owner.id])).rows[0];
    assert(expired); assert.equal((await api("/api/e2ee/devices/approve", source.cookies, { ...challenge, linkId: expired.id, targetDeviceId: expired.device_id, targetFingerprint: expired.fingerprint })).status, 409);
    assert.equal((await api("/api/privacy/devices", source.cookies, { id: request.session_id }, "DELETE")).status, 200);
    assert.equal((await api("/api/auth/me", target.cookies, null, "GET")).status, 401);
    assert.equal((await pool.query("select trusted_at from e2ee_keys where user_id=$1 and device_id=$2", [owner.id, request.device_id])).rows[0].trusted_at, null);
    for (const page of pages.filter(page => !page.isClosed())) assert.deepEqual(await page.evaluate(() => window.__workflowCsp), [], "No CSP violations in the actual workflow");
    assert.deepEqual(errors, []);
    if (!ownedLive) {
      const photos = await testProfilePhotos(base, pool, owner, peer, source, unrelatedCookie, recipient.cookies);
      await pool.query("delete from conversations where id=$1 and created_by_id=$2", [photos.groupId, owner.id]);
      for (const file of photos.paths) {
        const target = resolve(".next/standalone/server/uploads", file);
        assert(target.startsWith(resolve(".next/standalone/server/uploads") + "/") || target.startsWith(resolve(".next/standalone/server/uploads") + "\\"));
        await unlink(target); await pool.query("delete from stored_uploads where path=$1", [file]);
      }
    }
    assert.deepEqual(errors, []);
    const recovery = jwtSecret ? await testEncryptionDevices(base, pool, owner, peer, password, conversationId, jwtSecret, { device: rejected, contact: recipient }) : {};
    return { ...recovery, ...statusChecks, ...mobileChecks, tryNow: true, refresh: true, codeApproval: true, rejected: true, expired: true, replay: true, wrongAccount: true, revocation: true, sessionRebinding: true, attachment: true, voicePlayback: true, mediaCapabilityRetry: true, voiceContrast: true, scheduler: true, branding: true, registration: true, verificationTokenAndLogin: true, verificationCodeUI: true, failedSendAndLostResponseRetry: true, externalEmailDelivery: false, browserErrors: 0 };
  } finally {
    await browser.close();
    if (registered) await pool.query("delete from users where id=$1 and username=$2 and username like 'restreg_%'", [registered.id, registered.username]);
    else await pool.query("delete from users where username=$1 and email=$2 and username like 'restreg_%'", [registerName, registerName + "@example.invalid"]);
  }
}
