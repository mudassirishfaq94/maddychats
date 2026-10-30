import assert from "node:assert/strict";

export async function testStartupInbox(base, source, conversationId) {
  const page = source.page, requests = [];
  const track = request => {
    if (request.method() !== "GET" || !/\/api\/conversations\/[^/]+\/(?:messages|open)(?:\?|$)/.test(request.url())) return;
    // This page was previously an open chat. Its final background reads can
    // start while goto is replacing that document; they are not inbox work.
    const referer = request.headers().referer;
    if (referer && new URL(referer).pathname !== "/app/chats") return;
    requests.push(request);
  };
  page.on("request", track);
  let releaseList;
  const listGate = new Promise(resolve => { releaseList = resolve; });
  const heldRequests = [];
  const holdList = route => {
    const pending = listGate.then(() => route.continue());
    heldRequests.push(pending);
    return pending;
  };
  await page.route("**/api/conversations", holdList);
  try {
    const response = await page.goto(base + "/app/chats");
    assert.equal(response.status(), 200);
    await page.locator(".chat-list-row:visible").first().waitFor();
    // The API is deliberately still blocked. Visible rows must come from the
    // authorized index response, not a later fetch or previous document cache.
    assert(await page.locator(".chat-list-row:visible").count() > 0, "The authorized initial snapshot renders while the list API is pending");
    await page.waitForTimeout(2500);
    assert.equal(requests.length, 0, "Opening the inbox cannot download histories of unopened chats");
    await page.locator(`.chat-list-row[href="/app/chats/${conversationId}"]`).click();
    await page.getByRole("textbox", { name: "Message text", exact: true }).waitFor();
    await page.getByRole("region", { name: "Conversation", exact: true }).getByText("Real encrypted delivery baseline", { exact: true }).waitFor();
    assert(requests.some(request => new URL(request.url()).pathname.startsWith(`/api/conversations/${conversationId}/`)), "Actual row interaction still loads the selected conversation's authorized history");
    console.log("PASS authorized initial inbox without an API waterfall, no unsolicited history downloads, and intent-driven chat opening");
  } finally {
    releaseList();
    await Promise.all(heldRequests);
    await page.unroute("**/api/conversations", holdList);
    page.off("request", track);
  }
}
