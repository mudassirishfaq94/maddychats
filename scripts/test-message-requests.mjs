import assert from "node:assert/strict";
import { chromium } from "playwright";

/** Real browser encryption, offline sender recovery, approval, and reply. */
export async function testMessageRequests(base, senderCookie, recipientCookie, conversationId, ownedLive = false) {
  if (!["127.0.0.1", "localhost"].includes(new URL(base).hostname) && !(ownedLive && base === "https://maddychats.onrender.com")) throw new Error("Only isolated or explicitly owned live fixtures are allowed");
  const browser = await chromium.launch();
  const errors = [];
  const contexts = [];
  const makePage = async cookie => {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: "block" });
    contexts.push(context);
    await context.addCookies(cookie.split("; ").map(value => {
      const index = value.indexOf("=");
      return { name: value.slice(0, index), value: value.slice(index + 1), url: base, httpOnly: true, sameSite: "Lax" };
    }));
    const page = await context.newPage();
    page.on("pageerror", error => errors.push(error.message));
    return page;
  };
  const url = `${base}/app/chats/${conversationId}`;
  const introduction = "Hello from my circle — please approve this introduction";
  try {
    const sender = await makePage(senderCookie);
    await sender.goto(`${base}/app/profile`);
    await sender.getByText("This device: Trusted", { exact: true }).waitFor({ timeout: 60000 });
    await sender.goto(url);
    await sender.getByText("Start with a message request", { exact: true }).waitFor();
    const composer = sender.getByRole("textbox", { name: "Message text" });
    await composer.fill(introduction);
    const sent = sender.waitForResponse(response => response.request().method() === "POST" && response.url().endsWith(`/conversations/${conversationId}/messages`), { timeout: 30000 });
    await composer.press("Enter");
    const sentResponse = await sent.catch(async cause => {
      throw new Error(`Introduction did not send: ${await sender.locator("body").innerText()}`, { cause });
    });
    assert.equal(sentResponse.status(), 201);
    await sender.getByText("Message request sent", { exact: true }).waitFor();
    assert.equal(await composer.isDisabled(), true);
    assert.equal(await sender.getByRole("region", { name: "Conversation", exact: true }).getByText(introduction, { exact: true }).count(), 1);
    assert.equal(await sender.getByText("Encryption keys are not ready", { exact: false }).count(), 0);
    // Retain the device key, but take the sender offline before the recipient
    // registers. The ciphertext must remain queued and recover on reconnect.
    await sender.goto("about:blank");
    const recipient = await makePage(recipientCookie);
    await recipient.goto(url);
    await recipient.getByRole("button", { name: "Accept", exact: true }).waitFor({ timeout: 60000 });
    assert.equal(await recipient.getByRole("textbox", { name: "Message text" }).isDisabled(), true);
    await recipient.getByText("Encrypted introduction — waiting for secure delivery", { exact: true }).waitFor({ timeout: 15000 }).catch(async cause => {
      throw new Error(`Recipient delivery state: ${await recipient.locator("body").innerText()}`, { cause });
    });
    const notifications = await recipient.context().request.get(`${base}/api/notifications`);
    assert.equal(notifications.status(), 200);
    const notificationData = await notifications.json();
    assert(notificationData.notifications.some(entry => entry.data?.conversationId === conversationId && entry.data?.preview?.includes("Message request")));
    // Reconnect the same trusted sender on another app route: key delivery
    // must work even when the sender does not reopen this specific chat.
    await sender.goto(`${base}/app/profile`);
    await recipient.getByRole("region", { name: "Conversation", exact: true }).getByText(introduction, { exact: true }).waitFor({ timeout: 60000 });
    await recipient.getByRole("button", { name: "Accept", exact: true }).click();
    await recipient.getByRole("textbox", { name: "Message text" }).waitFor();
    await recipient.waitForFunction(() => !document.querySelector('textarea[aria-label="Message text"]')?.disabled);
    await sender.goto(url);
    assert.equal(await sender.getByRole("textbox", { name: "Message text" }).isDisabled(), false);
    const reply = "Approved — welcome to my circle";
    await recipient.getByRole("textbox", { name: "Message text" }).fill(reply);
    const replied = recipient.waitForResponse(response => response.request().method() === "POST" && response.url().endsWith(`/conversations/${conversationId}/messages`), { timeout: 60000 });
    await recipient.getByRole("textbox", { name: "Message text" }).press("Enter");
    assert.equal((await replied).status(), 201);
    await sender.getByRole("region", { name: "Conversation", exact: true }).getByText(reply, { exact: true }).waitFor({ timeout: 60000 });
    assert.deepEqual(errors, [], "First-contact and approval must not produce browser errors");
    await Promise.all([sender, recipient].map(page => page.waitForLoadState("networkidle")));
    return { encryptedIntroduction: true, durableNotification: true, offlineRecovery: true, approvalAndReply: true, browserErrors: 0 };
  } finally { await browser.close(); }
}
