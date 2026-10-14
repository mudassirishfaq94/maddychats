import assert from "node:assert/strict";
import { chromium } from "playwright";

/** Close the SSR-to-live-stream gap deterministically using owned fixtures. */
export async function testChatOpeningRace(sender, recipient) {
  const text = "Opening-window encrypted delivery " + Date.now();
  let release, requested;
  const gate = new Promise(resolve => { release = resolve; });
  const started = new Promise(resolve => { requested = resolve; });
  await recipient.route("**/api/realtime/stream", async route => { requested(); await gate; await route.continue(); });
  try {
    await recipient.reload();
    await recipient.getByRole("textbox", { name: "Message text", exact: true }).waitFor();
    await started;
    const previousRows = await recipient.locator(".message-history-row").count();
    await recipient.getByRole("textbox", { name: "Message text", exact: true }).fill("Keep my unsent draft");
    const saved = sender.waitForResponse(response => /\/api\/conversations\/[^/]+\/messages$/.test(response.url()) && response.request().method() === "POST", { timeout: 30000 });
    await sender.getByRole("textbox", { name: "Message text", exact: true }).fill(text);
    await sender.getByRole("textbox", { name: "Message text", exact: true }).press("Enter");
    const response = await saved; assert.equal(response.status(), 201);
    assert((await response.json()).message.encrypted);
    // Initial SSE replay covers only the last second. This event is older
    // than that window before the recipient establishes its live stream.
    await new Promise(resolve => setTimeout(resolve, 1500)); release();
    await recipient.getByRole("region", { name: "Conversation", exact: true }).getByText(text, { exact: true }).waitFor({ timeout: 10000 });
    assert.equal(await recipient.getByRole("textbox", { name: "Message text", exact: true }).inputValue(), "Keep my unsent draft");
    assert(await recipient.locator(".message-history-row").count() >= previousRows + 1);
    console.log("PASS message committed between history rendering and stream connection arrives without manual reload");
  } finally { release(); await recipient.unroute("**/api/realtime/stream"); await recipient.getByRole("textbox", { name: "Message text", exact: true }).fill(""); }
}

export async function testChatOpeningFixture(base, owner, peer, password, conversationId) {
  assert(["localhost", "127.0.0.1"].includes(new URL(base).hostname));
  const browser = await chromium.launch(); const pages = [];
  try {
    for (const account of [owner, peer]) {
      const context = await browser.newContext({ serviceWorkers: "block", viewport: { width: 390, height: 844 } });
      const response = await context.request.post(base + "/api/auth/login", { headers: { Origin: base }, data: { identifier: account.username, password, acceptTerms: true, acceptPrivacy: true } });
      assert.equal(response.status(), 200);
      const page = await context.newPage(); page.setDefaultTimeout(30000);
      await page.goto(base + "/app/profile#encryption-devices"); await page.getByText("This device: Trusted", { exact: true }).waitFor(); pages.push(page);
    }
    for (const page of pages) { await page.goto(base + "/app/chats/" + conversationId); await page.getByRole("textbox", { name: "Message text", exact: true }).waitFor(); }
    await pages[0].getByRole("textbox", { name: "Message text", exact: true }).fill("Opening race baseline");
    await pages[0].getByRole("textbox", { name: "Message text", exact: true }).press("Enter");
    await pages[1].getByRole("region", { name: "Conversation", exact: true }).getByText("Opening race baseline", { exact: true }).waitFor();
    await testChatOpeningRace(pages[0], pages[1]);
  } finally { await browser.close(); }
}
