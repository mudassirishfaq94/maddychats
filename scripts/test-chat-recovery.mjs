import { openDeviceTools } from "./device-ui-tools.mjs";
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";

/** Real browser/device keys and server trust flow; only the message transport is fault-injected. */
export async function testChatRecovery(base, cookieHeader, conversationId) {
  if (!["127.0.0.1", "localhost"].includes(new URL(base).hostname)) throw new Error("Recovery tests require loopback staging");
  const browser = await chromium.launch();
  const contexts = [];
  const errors = [];
  const context = async () => {
    const value = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: "block" });
    contexts.push(value);
    await value.addCookies(cookieHeader.split("; ").map(cookie => {
      const index = cookie.indexOf("=");
      return { name: cookie.slice(0, index), value: cookie.slice(index + 1), url: base, httpOnly: true, sameSite: "Lax" };
    }));
    const page = await value.newPage();
    page.on("pageerror", error => errors.push(error.message));
    return page;
  };
  const chatUrl = `${base}/app/chats/${conversationId}`;
  const activeName = "Private chat protection is on. View details";
  try {
    const source = await context();
    await source.goto(chatUrl);
    await source.getByRole("button", { name: activeName, exact: true }).waitFor({ timeout: 30000 });
    const composer = source.getByRole("textbox", { name: "Message text" });
    const cdp = await source.context().newCDPSession(source);
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
    await source.evaluate(() => {
      window.__typingSamples = [];
      document.addEventListener("input", event => {
        if (event.target instanceof HTMLTextAreaElement) {
          const start = performance.now();
          requestAnimationFrame(() => window.__typingSamples.push(performance.now() - start));
        }
      });
    });
    const submitted = "Typing stays complete under CPU throttling";
    await composer.pressSequentially(submitted, { delay: 20 });
    assert.equal(await composer.inputValue(), submitted);
    let release;
    const gate = new Promise(resolve => { release = resolve; });
    let received;
    const posted = new Promise(resolve => { received = resolve; });
    const messageUrl = `**/api/conversations/${conversationId}/messages`;
    const delayedSend = async route => {
      if (route.request().method() !== "POST") return route.continue();
      const body = route.request().postDataJSON();
      assert.equal(body.encrypted, true);
      assert.notEqual(body.text, submitted);
      received(); await gate; await route.continue();
    };
    await source.route(messageUrl, delayedSend);
    await composer.press("Enter");
    await Promise.race([posted, source.waitForTimeout(20000).then(() => { throw new Error("Encrypted send did not reach the test transport"); })]);
    const nextDraft = "Keep my newer draft";
    await composer.fill(nextDraft);
    const confirmed = source.waitForResponse(response => response.request().method() === "POST" && response.url().endsWith(`/conversations/${conversationId}/messages`));
    release();
    await confirmed;
    await source.unroute(messageUrl, delayedSend);
    await source.waitForTimeout(300);
    assert.equal(await composer.inputValue(), nextDraft, "A send confirmation must not erase newer input");

    // A temporary 503 now queues durably and clears the input by design.
    // Use a permanent rejection to exercise unsent-draft retention here;
    // transient outage/reconnect behavior has its own real browser suite.
    const failSend = route => route.request().method() === "POST" ? route.fulfill({ status: 403, contentType: "application/json", body: JSON.stringify({ error: "Recovery test transport rejected" }) }) : route.continue();
    await source.route(messageUrl, failSend);
    await composer.press("Enter");
    await source.getByText("Recovery test transport rejected", { exact: true }).waitFor();
    assert.equal(await composer.inputValue(), nextDraft, "A failed send must preserve the draft");
    await source.unroute(messageUrl, failSend);
    const typingSamples = await source.evaluate(() => window.__typingSamples);
    // Throttling measures typing only; recovery waits should use normal CPU.
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
    await source.reload();
    await source.waitForFunction(text => document.querySelector('textarea[aria-label="Message text"]')?.value === text, nextDraft, { timeout: 30000 });
    await source.getByRole("button", { name: activeName, exact: true }).click();
    await source.getByRole("button", { name: "Share chat access with my devices", exact: true }).click();
    await source.getByRole("status").filter({ hasText: "No linked phone is ready yet" }).waitFor({ timeout: 10000 }).catch(async cause => {
      throw new Error(`Restore status: ${await source.getByRole("status").allTextContents()}; modal: ${await source.locator(".card-glass").last().innerText()}`, { cause });
    });
    await source.getByRole("button", { name: "Close", exact: true }).click();

    const target = await context();
    await target.goto(`${base}/app/profile#encryption-devices`);
    await target.getByText("This device: Waiting for approval", { exact: true }).waitFor({ timeout: 30000 });
    await openDeviceTools(target);
    const pendingText = "A new device waits safely for approval";
    await target.goto(chatUrl);
    await target.getByRole("textbox", { name: "Message text" }).fill(pendingText);
    await target.getByRole("textbox", { name: "Message text" }).press("Enter");
    await target.getByLabel("Queued", { exact: true }).waitFor();
    assert.equal(await target.getByLabel("Failed to send", { exact: true }).count(), 0);
    const queuedNotice = target.getByRole("status").filter({ hasText: "approve this phone" });
    await queuedNotice.waitFor();
    await queuedNotice.waitFor({ state: "hidden", timeout: 12000 });
    await target.getByLabel("Queued", { exact: true }).waitFor();
    await target.getByRole("button", { name: "Show queued message options", exact: true }).waitFor();
    await source.goto(`${base}/app/profile#encryption-devices`);
    await target.goto(`${base}/app/profile#encryption-devices`);
    const linkResponse = target.waitForResponse(response => {
      let request = response.request();
      while (request.redirectedFrom()) request = request.redirectedFrom();
      return new URL(request.url()).pathname.replace(/\/+$/, "") === "/api/e2ee/devices/link" && request.method() === "POST";
    }).then(response => ({ response }), cause => ({ cause }));
    await target.getByRole("button", { name: /^Show (a device-link QR code|a QR code to link this device)$/ }).click();
    const linkResult = await linkResponse;
    if ("cause" in linkResult) throw new Error(`Device-link request did not finish; status: ${await target.getByRole("status").allTextContents()}`, { cause: linkResult.cause });
    const linkCreated = linkResult.response;
    assert.equal(linkCreated.status(), 201);
    const { id: requestId, token } = await linkCreated.json();
    assert.match(token, /^[A-Za-z0-9_-]{43}$/);
    const qrPayload = JSON.stringify({ kind: "circlo-device-link", version: 1, requestId, token });
    await target.getByRole("img", { name: "Temporary secure device-link QR code" }).waitFor();
    await source.evaluate(`(() => {
      const payload = ${JSON.stringify(qrPayload)};
      Object.defineProperty(window, "BarcodeDetector", { configurable: true, value: function () {} });
      Object.defineProperty(window.BarcodeDetector, "getSupportedFormats", { value: function () { return Promise.resolve(["qr_code"]); } });
      Object.defineProperty(window.BarcodeDetector.prototype, "detect", { value: function () { return Promise.resolve([{ rawValue: payload }]); } });
      Object.defineProperty(navigator.mediaDevices, "getUserMedia", { configurable: true, value: async () => new MediaStream() });
      HTMLMediaElement.prototype.play = async () => {};
    })()`);
    await source.getByRole("button", { name: "Scan QR on your new device", exact: true }).click();
    await source.getByText("Check number:").waitFor();
    await target.getByText("Device details", { exact: true }).click();
    await source.getByText("Show full check number", { exact: true }).click();
    await source.getByLabel("I compared this number with the new phone and it matches.").check();
    const approvalResponse = source.waitForResponse(response => {
      if (new URL(response.url()).pathname !== "/api/e2ee/devices/approve" || response.request().method() !== "POST") return false;
      try { return response.request().postDataJSON()?.action === "approve"; } catch { return false; }
    });
    await source.getByRole("button", { name: "Approve this device", exact: true }).click();
    const approval = await approvalResponse;
    assert.equal(approval.status(), 200, `Trusted device approval request failed: ${await approval.text()}`);
    const linkedDeviceId = await source.evaluate(async requestId => {
      const response = await fetch("/api/e2ee/devices/link", { cache: "no-store" });
      const data = await response.json();
      return data.requests.find(item => item.id === requestId)?.deviceId;
    }, requestId);
    assert(linkedDeviceId, "The pending request remains associated with its new device");
    await source.waitForFunction(async deviceId => {
      const response = await fetch("/api/e2ee/keys", { cache: "no-store" });
      if (!response.ok) return false;
      const data = await response.json();
      return data.keys.some(key => key.deviceId === deviceId && key.trustedAt);
    }, linkedDeviceId, { timeout: 15000 });
    await source.goto(chatUrl);
    await source.getByRole("button", { name: activeName, exact: true }).click();
    const peersUrl = "**/api/e2ee/peers?**";
    const unavailablePeers = route => route.fulfill({ status: 503, contentType: "application/json", body: "{}" });
    await source.route(peersUrl, unavailablePeers);
    await source.getByRole("button", { name: "Share chat access with my devices", exact: true }).click();
    await source.getByRole("status").filter({ hasText: "Couldn't find your linked phone. Check your connection and try again." }).waitFor();
    assert.equal(await source.getByRole("button", { name: "Share chat access with my devices", exact: true }).isEnabled(), true, "A failed restore must stop its spinner");
    await source.unroute(peersUrl, unavailablePeers);
    await source.getByRole("button", { name: "Share chat access with my devices", exact: true }).click();
    await source.getByRole("status").filter({ hasText: "Chat history sent to your linked phone." }).waitFor();
    // Return to the new device's chat after approval. Key restoration must
    // release its queued message without replacing keys.
    // Retries pause in background tabs, so bring this browser to the front.
    await target.goto(chatUrl);
    await target.bringToFront();
    await target.getByRole("region", { name: "Conversation", exact: true }).getByText(submitted, { exact: true }).waitFor({ timeout: 30000 });
    await source.getByRole("region", { name: "Conversation", exact: true }).getByText(pendingText, { exact: true }).waitFor({ timeout: 60000 });
    assert.equal(await target.getByLabel("Queued", { exact: true }).count(), 0);
    assert.deepEqual(errors, [], "Recovery must not produce browser errors");
    await mkdir(".freebuff/performance", { recursive: true });
    await writeFile(".freebuff/performance/chat-recovery.json", JSON.stringify({ typingConditions: "Chromium, 390px viewport, 4x CPU, real keystrokes at 20ms intervals", inputToFrameMs: typingSamples, verified: ["encrypted sends", "newer drafts preserved", "failed drafts survive reload", "trusted private-key device approval", "existing keys restore on a second device", "failed restore releases spinner"] }, null, 2));
  } finally {
    for (const value of contexts) await value.close();
    await browser.close();
  }
}
