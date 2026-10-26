import assert from "node:assert/strict";

export async function testStartupInbox(base, source, conversationId) {
  const page = source.page, requests = [];
  const track = request => { if (request.method() === "GET" && /\/api\/conversations\/[^/]+\/(?:messages|open)(?:\?|$)/.test(request.url())) requests.push(request); };
  page.on("request", track);
  try {
    const response = await page.goto(base + "/app/chats");
    const html = await response.text();
    assert(html.includes('class="chat-list-row '), "Authorized inbox rows must be in the document, without a client list-fetch waterfall");
    await page.locator(".chat-list-row:visible").first().waitFor();
    await page.waitForTimeout(2500);
    assert.equal(requests.length, 0, "Opening the inbox cannot download histories of unopened chats");
    await page.locator(`.chat-list-row[href="/app/chats/${conversationId}"]`).click();
    await page.getByRole("textbox", { name: "Message text", exact: true }).waitFor();
    await page.getByRole("region", { name: "Conversation", exact: true }).getByText("Real encrypted delivery baseline", { exact: true }).waitFor();
    assert(requests.length > 0, "Actual row interaction still loads authorized history");
    console.log("PASS server-rendered authorized inbox, no unsolicited history downloads, and intent-driven chat opening");
  } finally { page.off("request", track); }
}
