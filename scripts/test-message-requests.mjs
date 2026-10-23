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
    await sender.goto(`${base}/app/profile#encryption-devices`);
    await sender.getByText("This device: Linked", { exact: true }).waitFor({ timeout: 60000 });
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
    await recipient.getByRole("region", { name: "Conversation", exact: true }).getByRole("status").getByText("Waiting…", { exact: true }).waitFor({ timeout: 15000 }).catch(async cause => {
      throw new Error(`Recipient delivery state: ${await recipient.locator("body").innerText()}`, { cause });
    });
    const notifications = await recipient.context().request.get(`${base}/api/notifications`);
    assert.equal(notifications.status(), 200);
    const notificationData = await notifications.json();
    assert(notificationData.notifications.some(entry => entry.data?.conversationId === conversationId && entry.data?.preview?.includes("Message request")));
    // Reconnect the same trusted sender on another app route: key delivery
    // must work even when the sender does not reopen this specific chat.
    await sender.goto(`${base}/app/profile#encryption-devices`);
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
    // Established chats must queue encryption waits calmly and survive reload,
    // then deliver exactly once using the original id when keys are ready.
    const peersUrl = `${base}/api/e2ee/peers?**`;
    await sender.route(peersUrl, async route => {
      const response = await route.fetch();
      const data = await response.json();
      for (const peer of data.peers ?? []) peer.devices = [];
      await route.fulfill({ response, json: data });
    });
    const queuedText = "Queued established chat — preserve my circle securely";
    await sender.getByRole("textbox", { name: "Message text" }).fill(queuedText);
    await sender.getByRole("textbox", { name: "Message text" }).press("Enter");
    await sender.getByLabel("Queued", { exact: true }).waitFor();
    assert.equal(await sender.getByLabel("Failed to send", { exact: true }).count(), 0);
    await sender.getByText("Saved. It will send automatically when secure chat setup is ready.", { exact: true }).waitFor();
    await sender.waitForTimeout(500);
    const hint = await sender.getByRole("status").filter({ hasText: "Saved. It will send automatically" }).boundingBox();
    const input = await sender.getByRole("textbox", { name: "Message text" }).boundingBox();
    assert(hint && input && hint.y + hint.height <= input.y + 2, "Queued status and its actions must remain visible above the composer");
    const queuedId = await sender.evaluate(async conversationId => {
      const names = (await indexedDB.databases()).map(database => database.name).filter(name => name?.startsWith("circlo-outbox:"));
      const records = await Promise.all(names.map(name => new Promise((resolve, reject) => {
        const request = indexedDB.open(name);
        request.onsuccess = () => {
          const read = request.result.transaction("messages").objectStore("messages").getAll();
          read.onsuccess = () => { request.result.close(); resolve(read.result); };
          read.onerror = () => reject(read.error);
        };
        request.onerror = () => reject(request.error);
      })));
      // Drafts share this encrypted store; select the conversation's outbox entry.
      const entry = records.flat().find(record => record.id.startsWith(conversationId + ":"));
      if (!entry?.ciphertext || entry.plain) throw new Error("Queued text must be encrypted at rest");
      return entry.id;
    }, conversationId);
    await sender.reload();
    await sender.getByLabel("Queued", { exact: true }).waitFor();
    assert.equal(await sender.getByRole("region", { name: "Conversation", exact: true }).locator("p").filter({ hasText: queuedText }).count(), 1);
    const newerDraft = "Keep this newer draft";
    let releaseRetry, retryPosted;
    const retryGate = new Promise(resolve => { releaseRetry = resolve; });
    const retryStarted = new Promise(resolve => { retryPosted = resolve; });
    const retryBodies = [];
    const messagesUrl = `${base}/api/conversations/${conversationId}/messages`;
    await sender.route(messagesUrl, async route => {
      if (route.request().method() !== "POST") return route.continue();
      retryBodies.push(route.request().postDataJSON());
      retryPosted(); await retryGate; await route.continue();
    });
    await sender.unroute(peersUrl);
    const delivered = sender.waitForResponse(response => response.request().method() === "POST" && response.url().endsWith(`/conversations/${conversationId}/messages`), { timeout: 60000 });
    await sender.evaluate(() => window.dispatchEvent(new Event("focus")));
    await Promise.race([retryStarted, sender.waitForTimeout(30000).then(() => { throw new Error("Queued retry did not reach the test transport"); })]);
    // Repeated Enter during the automatic retry must reuse the waiting send,
    // rather than create a second id for the still-visible draft.
    await sender.getByRole("textbox", { name: "Message text" }).press("Enter");
    await sender.getByRole("textbox", { name: "Message text" }).fill(newerDraft);
    releaseRetry();
    const delivery = await delivered;
    await sender.unroute(messagesUrl);
    assert.equal(retryBodies.length, 1, "Repeated send during queue delivery must not create duplicate messages");
    assert.equal(delivery.status(), 201);
    assert.equal(delivery.request().postDataJSON().clientMessageId, queuedId.slice(conversationId.length + 1));
    assert.notEqual(delivery.request().postDataJSON().text, queuedText);
    await recipient.getByRole("region", { name: "Conversation", exact: true }).getByText(queuedText, { exact: true }).waitFor({ timeout: 60000 });
    assert.equal(await sender.getByRole("textbox", { name: "Message text" }).inputValue(), newerDraft);
    assert.equal(await sender.getByLabel("Queued", { exact: true }).count(), 0);
    // A changed peer device still needs explicit safety verification. Queuing
    // must never silently approve it or publish to the changed device.
    await sender.route(peersUrl, async route => {
      const response = await route.fetch();
      const data = await response.json();
      const peer = data.peers?.find(entry => entry.devices.length);
      if (!peer) throw new Error("A trusted peer fixture is required");
      peer.devices.push({ ...peer.devices[0], deviceId: "unverified-peer-test-device" });
      await route.fulfill({ response, json: data });
    });
    await sender.getByRole("textbox", { name: "Message text" }).fill("Safety verification must remain required");
    await sender.getByRole("textbox", { name: "Message text" }).press("Enter");
    await sender.getByLabel("Queued", { exact: true }).waitFor();
    await sender.getByText("Saved. Confirm the new phone’s safety number in this chat. It will send after confirmation.", { exact: true }).waitFor();
    assert.equal(await sender.getByLabel("Failed to send", { exact: true }).count(), 0);
    const cancelQueuedMessage = sender.getByRole("button", { name: "Cancel message", exact: true });
    if (!await cancelQueuedMessage.isVisible()) await sender.getByRole("button", { name: "Show queued message options", exact: true }).click();
    await cancelQueuedMessage.click();
    await sender.getByLabel("Queued", { exact: true }).waitFor({ state: "hidden" });
    await sender.unroute(peersUrl);
    await sender.reload();
    await sender.waitForTimeout(2500);
    assert.equal(await sender.getByLabel("Queued", { exact: true }).count(), 0, "Cancelled messages must not return after reload");
    assert.deepEqual(errors, [], "First-contact and approval must not produce browser errors");
    // Realtime chat deliberately keeps a stream open. Check the actual UI
    // readiness instead of waiting for a network-idle state it may never reach.
    await Promise.all([sender, recipient].map(async page => {
      await page.waitForLoadState("domcontentloaded");
      await page.getByRole("textbox", { name: "Message text" }).waitFor();
    }));
    return { encryptedIntroduction: true, durableNotification: true, offlineRecovery: true, approvalAndReply: true, queuedEstablishedDelivery: true, encryptedOutboxReload: true, browserErrors: 0 };
  } finally { await browser.close(); }
}
