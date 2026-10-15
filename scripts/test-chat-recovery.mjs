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
  const activeName = "End-to-end encryption is active. View details";
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

    const failSend = route => route.request().method() === "POST" ? route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "Recovery test transport unavailable" }) }) : route.continue();
    await source.route(messageUrl, failSend);
    await composer.press("Enter");
    await source.getByText("Recovery test transport unavailable", { exact: true }).waitFor();
    assert.equal(await composer.inputValue(), nextDraft, "A failed send must preserve the draft");
    await source.unroute(messageUrl, failSend);
    const typingSamples = await source.evaluate(() => window.__typingSamples);
    // Throttling measures typing only; recovery waits should use normal CPU.
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
    await source.reload();
    await source.waitForFunction(text => document.querySelector('textarea[aria-label="Message text"]')?.value === text, nextDraft, { timeout: 30000 });
    await source.getByRole("button", { name: activeName, exact: true }).click();
    await source.getByRole("button", { name: "Restore my other devices", exact: true }).click();
    await source.getByRole("status").filter({ hasText: "No other trusted devices found" }).waitFor({ timeout: 10000 }).catch(async cause => {
      throw new Error(`Restore status: ${await source.getByRole("status").allTextContents()}; modal: ${await source.locator(".card-glass").last().innerText()}`, { cause });
    });
    await source.getByRole("button", { name: "Close", exact: true }).click();

    const target = await context();
    await target.goto(`${base}/app/profile#encryption-devices`);
    await target.getByText("This device: Waiting for approval", { exact: true }).waitFor({ timeout: 30000 });
    const targetId = await target.evaluate(() => localStorage.getItem("e2ee_device_id"));
    await openDeviceTools(target);
    await openDeviceTools(target);
    const targetFingerprint = await target.getByLabel("This device fingerprint").innerText();
    const pendingText = "A new device waits safely for approval";
    await target.goto(chatUrl);
    await target.getByRole("textbox", { name: "Message text" }).fill(pendingText);
    await target.getByRole("textbox", { name: "Message text" }).press("Enter");
    await target.getByLabel("Queued", { exact: true }).waitFor();
    assert.equal(await target.getByLabel("Failed to send", { exact: true }).count(), 0);
    await target.getByRole("status").filter({ hasText: "This device needs approval" }).waitFor();
    await source.goto(`${base}/app/profile#encryption-devices`);
    const pending = source.locator("li").filter({ hasText: `New device: ${targetId}` });
    await pending.waitFor();
    assert.equal(await pending.locator("code").innerText(), targetFingerprint, "Verify the fingerprint on both real devices");
    await pending.getByRole("checkbox").check();
    await pending.getByRole("button", { name: "Approve encryption device" }).click();
    await source.getByRole("status").filter({ hasText: "Device approved." }).waitFor();
    await source.goto(chatUrl);
    await source.getByRole("button", { name: activeName, exact: true }).click();
    const peersUrl = "**/api/e2ee/peers?**";
    const unavailablePeers = route => route.fulfill({ status: 503, contentType: "application/json", body: "{}" });
    await source.route(peersUrl, unavailablePeers);
    await source.getByRole("button", { name: "Restore my other devices", exact: true }).click();
    await source.getByRole("status").filter({ hasText: "Unable to check trusted devices" }).waitFor();
    assert.equal(await source.getByRole("button", { name: "Restore my other devices", exact: true }).isEnabled(), true, "A failed restore must stop its spinner");
    await source.unroute(peersUrl, unavailablePeers);
    await source.getByRole("button", { name: "Restore my other devices", exact: true }).click();
    await source.getByRole("status").filter({ hasText: "Shared" }).waitFor();
    // Keep the new device on the same page: approval and key restoration
    // must release its queued message without reloading or replacing keys.
    // Retries intentionally pause in background tabs. Return to the new
    // browser as a user would after approving it on the trusted browser.
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
