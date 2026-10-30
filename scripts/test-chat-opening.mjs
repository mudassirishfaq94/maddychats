import { fixtureAppSession } from "./fixture-app-session.mjs";
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { testLocalChatBackup } from "./test-local-chat-backup.mjs";
import { testStatusVideo } from "./test-status-video.mjs";
import { testChatHandoff } from "./test-chat-handoff.mjs";
import { testChatScroll } from "./test-chat-scroll.mjs";
import { testDisappearingMedia } from "./test-disappearing-media.mjs";
import { testDocumentDelivery } from "./test-document-delivery.mjs";
import { testDmDeviceRotation } from "./test-dm-device-rotation.mjs";

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
    await recipient.getByRole("textbox", { name: "Message text", exact: true }).fill("Keep my unsent draft");
    const saved = sender.waitForResponse(response => /\/api\/conversations\/[^/]+\/messages$/.test(response.url()) && response.request().method() === "POST", { timeout: 30000 });
    await sender.getByRole("textbox", { name: "Message text", exact: true }).fill(text);
    await sender.getByRole("textbox", { name: "Message text", exact: true }).press("Enter");
    const response = await saved; assert.equal(response.status(), 201);
    assert((await response.json()).message.encrypted);
    // Initial SSE replay covers only the last second. This event is older
    // than that window before the recipient establishes its live stream.
    await new Promise(resolve => setTimeout(resolve, 1500)); release();
    const delivered = recipient.getByRole("region", { name: "Conversation", exact: true }).getByText(text, { exact: true });
    await delivered.waitFor({ timeout: 10000 });
    assert.equal(await recipient.getByRole("textbox", { name: "Message text", exact: true }).inputValue(), "Keep my unsent draft");
    assert.equal(await delivered.count(), 1, "The realtime message committed during chat startup must appear exactly once");
    console.log("PASS message committed between history rendering and stream connection arrives without manual reload");
  } finally { release(); await recipient.unroute("**/api/realtime/stream"); await recipient.getByRole("textbox", { name: "Message text", exact: true }).fill(""); }
}

export async function testChatOpeningFixture(base, pool, owner, peer, password, conversationId) {
  assert(["localhost", "127.0.0.1"].includes(new URL(base).hostname));
  const browser = await chromium.launch({args:["--use-fake-device-for-media-stream","--use-fake-ui-for-media-stream"]}); const pages = [];
  try {
    for (const account of [owner, peer]) {
      const context = await browser.newContext({ serviceWorkers: "block", viewport: { width: 390, height: 844 } });
      const response = await context.request.post(base + "/api/auth/login", { headers: { Origin: base }, data: { identifier: account.username, password, acceptTerms: true, acceptPrivacy: true } });
      assert.equal(response.status(), 200);
      await fixtureAppSession(pool,response);
      const page = await context.newPage(); page.setDefaultTimeout(30000);
      await page.goto(base + "/app/settings#privacy"); await page.getByText("Your phones and sign-in", { exact: true }).click(); await page.getByText("This device: Linked", { exact: true }).waitFor(); pages.push(page);
    }
    for (const page of pages) { await page.goto(base + "/app/chats/" + conversationId); await page.getByRole("textbox", { name: "Message text", exact: true }).waitFor(); }
    const baseline=process.env.BACKUP_ONLY==='1'?'Real encrypted delivery baseline':'Opening race baseline';
    await pages[0].getByRole("textbox", { name: "Message text", exact: true }).fill(baseline);
    await pages[0].getByRole("textbox", { name: "Message text", exact: true }).press("Enter");
    await pages[1].getByRole("region", { name: "Conversation", exact: true }).getByText(baseline, { exact: true }).waitFor();
    if(process.env.DM_ROTATION_ONLY==='1')await testDmDeviceRotation(base,pool,owner,peer,pages[0],pages[1],conversationId,baseline);
    else if(process.env.DOCUMENT_FILES_ONLY==='1')await testDocumentDelivery(base,pages[0],pages[1]);
    else if(process.env.DISAPPEARING_MEDIA_ONLY==='1')await testDisappearingMedia(base,pool,owner,peer,pages[0],pages[1],conversationId);
    else if(process.env.CHAT_SCROLL_ONLY==='1')await testChatScroll(base,{page:pages[0]},{page:pages[1]},pool,conversationId);
    else if(process.env.CHAT_HANDOFF_ONLY==='1')await testChatHandoff(base,pool,pages[1],owner,conversationId,baseline);
    else if(process.env.STATUS_VIDEO_ONLY==='1')await testStatusVideo(base,pool,owner,peer,pages[0],pages[1]);
    else if(process.env.BACKUP_ONLY==='1')await testLocalChatBackup(base,pool,{page:pages[0]},owner,password,conversationId);
    else await testChatOpeningRace(pages[0], pages[1]);
  } finally { await browser.close(); }
}
