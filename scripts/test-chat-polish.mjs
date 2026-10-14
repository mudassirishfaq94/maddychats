import assert from "node:assert/strict";
import { readFile, mkdir } from "node:fs/promises";

/** Owned fixture pages only. Geometry + hit testing catches paint-containment regressions. */
export async function testChatPolish(page, recipient) {
  const previous = page.viewportSize();
  const hitTest = async popup => {
    assert(await popup.evaluate(element => {
      const rect = element.getBoundingClientRect();
      if (rect.left < 0 || rect.top < 0 || rect.right > innerWidth + 1 || rect.bottom > innerHeight + 1) return false;
      return Array.from(element.querySelectorAll("button")).filter(button => {
        const b = button.getBoundingClientRect(); return b.top >= rect.top && b.bottom <= rect.bottom;
      }).every(button => { const b = button.getBoundingClientRect(); return element.contains(document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2)); });
    }), "Every visible menu item must be inside the viewport and above messages");
  };
  try {
    await page.setViewportSize({ width: 1280, height: 740 });
    const rows = page.locator('.message-history-row').filter({ has: page.getByRole("button", { name: "More actions", exact: true }) });
    const count = await rows.count(); assert(count > 1);
    const inspector = await page.context().newCDPSession(page);
    const documentObject = await inspector.send("Runtime.evaluate", { expression: "document" });
    const { listeners } = await inspector.send("DOMDebugger.getEventListeners", { objectId: documentObject.result.objectId });
    for (const type of ["mousedown", "keydown"]) assert(listeners.filter(listener => listener.type === type).length < 15, "Closed message actions cannot install global listeners per history row");
    for (const index of [...new Set([0, Math.floor(count / 2), count - 1])]) {
      const row = rows.nth(index); await row.scrollIntoViewIfNeeded(); await row.hover();
      await row.getByRole("button", { name: "More actions", exact: true }).click();
      const menu = page.getByRole("dialog", { name: "Message actions", exact: true }); await menu.waitFor(); await hitTest(menu);
      await page.keyboard.press("Escape"); await menu.waitFor({ state: "detached" });
      await row.getByRole("button", { name: "Add reaction", exact: true }).click();
      const reactions = page.getByRole("dialog", { name: "Message reactions", exact: true }); await reactions.waitFor(); await hitTest(reactions);
      await page.keyboard.press("Escape");
    }
    await mkdir(".freebuff/performance", { recursive: true });
    await rows.last().scrollIntoViewIfNeeded(); await rows.last().hover(); await rows.last().getByRole("button", { name: "More actions", exact: true }).click();
    await page.screenshot({ path: ".freebuff/performance/message-menu-polish.png" }); await page.keyboard.press("Escape");
    for (const viewport of [{ width: 320, height: 390 }, { width: 390, height: 844 }]) {
      await page.setViewportSize(viewport); await page.getByRole("button", { name: "Chat options", exact: true }).click();
      const menu = page.getByRole("menu", { name: "Chat options", exact: true }); await menu.waitFor(); await hitTest(menu);
      await menu.getByRole("menuitem", { name: "Close chat", exact: true }).scrollIntoViewIfNeeded(); await hitTest(menu);
      await page.keyboard.press("Escape"); await menu.waitFor({ state: "detached" });
    }
    await page.route("**/api/conversations/*/controls", route => route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "temporary" }) }));
    const beforeFailure = page.url();
    await page.getByRole("button", { name: "Chat options", exact: true }).click();
    await page.getByRole("menuitem", { name: "Close chat", exact: true }).click();
    await page.getByRole("menu", { name: "Chat options", exact: true }).getByRole("alert").waitFor();
    assert.equal(page.url(), beforeFailure, "A failed archive must not silently navigate away");
    await page.keyboard.press("Escape"); await page.unroute("**/api/conversations/*/controls");
    const bubble = page.locator(".message-history-row .inline-block.rounded-2xl").last(); await bubble.scrollIntoViewIfNeeded();
    const box = await bubble.boundingBox();
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: box.x + box.width / 2, y: box.y + box.height / 2 }] });
    await page.getByRole("dialog", { name: "Message options", exact: true }).waitFor();
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await page.keyboard.press("Escape"); await page.getByRole("dialog", { name: "Message options", exact: true }).waitFor({ state: "detached" });
    const files = page.locator('input[type="file"]').first();
    const photo = await readFile(new URL("../public/icons/circlo-192.png", import.meta.url));
    await files.setInputFiles([{ name: "polish-preview.png", mimeType: "image/png", buffer: photo }, { name: "polish-note.txt", mimeType: "text/plain", buffer: Buffer.from("Owned review fixture") }]);
    const review = page.getByRole("dialog", { name: "Review attachments", exact: true }); await review.waitFor();
    const caption = review.getByRole("textbox", { name: "Attachment caption", exact: true });
    await caption.fill("A caption worth keeping");
    await review.getByRole("button", { name: "Preview polish-note.txt", exact: true }).click();
    await review.getByRole("button", { name: "Remove polish-note.txt", exact: true }).click();
    assert.equal(await caption.inputValue(), "A caption worth keeping");
    for (const viewport of [{ width: 320, height: 740 }, { width: 844, height: 390 }, { width: 1280, height: 800 }]) {
      await page.setViewportSize(viewport);
      assert(await review.evaluate(element => element.scrollWidth <= element.clientWidth + 1 && element.scrollHeight <= element.clientHeight + 1), "Review must fit portrait and landscape");
      await hitTest(review);
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: ".freebuff/performance/attachment-review-polish.png" });
    await page.route("**/api/upload/message", route => route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "Temporary upload interruption. Your selection is safe." }) }));
    await review.getByRole("button", { name: "Send attachments", exact: true }).click();
    await review.getByRole("alert").getByText("Temporary upload interruption. Your selection is safe.", { exact: true }).waitFor();
    assert.equal(await caption.inputValue(), "A caption worth keeping");
    await page.unroute("**/api/upload/message");
    await page.evaluate(() => { const encrypt = crypto.subtle.encrypt.bind(crypto.subtle); window.polishOriginalEncrypt = encrypt; crypto.subtle.encrypt = async (...args) => { await new Promise(resolve => setTimeout(resolve, 800)); return encrypt(...args); }; });
    let uploads = 0; const track = request => { if (request.url().endsWith("/api/upload/message") && request.method() === "POST") uploads++; }; page.on("request", track);
    await review.getByRole("button", { name: "Send attachments", exact: true }).click();
    await review.getByRole("button", { name: "Cancel upload", exact: true }).click();
    await page.waitForFunction(() => !document.querySelector('button[aria-label="Send attachments"]')?.disabled);
    page.off("request", track); assert.equal(uploads, 0, "Cancelling encryption must prevent a later request");
    await page.evaluate(() => { crypto.subtle.encrypt = window.polishOriginalEncrypt; delete window.polishOriginalEncrypt; });
    await page.keyboard.press("Escape"); await review.waitFor({ state: "detached" });
    assert.equal(await page.getByRole("textbox", { name: "Message text", exact: true }).inputValue(), "A caption worth keeping");
    await page.getByRole("textbox", { name: "Message text", exact: true }).fill("");
    const video = await page.evaluate(async () => {
      const canvas = document.createElement("canvas"); canvas.width = 240; canvas.height = 160;
      const paint = canvas.getContext("2d"), stream = canvas.captureStream(10), chunks = [];
      const recorder = new MediaRecorder(stream, { mimeType: "video/webm" });
      recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
      const stopped = new Promise(resolve => { recorder.onstop = resolve; }); recorder.start(100);
      for (let frame = 0; frame < 6; frame++) { paint.fillStyle = frame % 2 ? "#343042" : "#74543a"; paint.fillRect(0, 0, 240, 160); paint.fillStyle = "white"; paint.font = "24px sans-serif"; paint.fillText("Private video", 35, 85); await new Promise(resolve => setTimeout(resolve, 100)); }
      recorder.stop(); await stopped; stream.getTracks().forEach(track => track.stop());
      return Array.from(new Uint8Array(await new Blob(chunks, { type: "video/webm" }).arrayBuffer()));
    });
    await files.setInputFiles({ name: "polish-video.webm", mimeType: "video/webm", buffer: Buffer.from(video) });
    await review.waitFor(); await review.locator("video").waitFor();
    await page.waitForFunction(() => document.querySelector('dialog[aria-label="Review attachments"] video')?.readyState >= 1);
    await review.getByRole("textbox", { name: "Attachment caption", exact: true }).fill("An encrypted video caption");
    const accepted = page.waitForResponse(response => response.url().endsWith("/api/upload/message") && response.request().method() === "POST");
    await review.getByRole("button", { name: "Send attachments", exact: true }).click();
    const response = await accepted; assert.equal(response.status(), 201);
    const packet = await response.json(); assert(packet.message.encrypted); assert(!packet.message.text.includes("An encrypted video caption"));
    await recipient.getByText("An encrypted video caption", { exact: true }).waitFor();
    await recipient.getByRole("button", { name: "View polish-video.webm", exact: true }).click();
    const player = recipient.getByRole("dialog", { name: "polish-video.webm", exact: true }).locator("video"); await player.waitFor();
    await player.evaluate(async element => { await element.play(); });
    await recipient.waitForFunction(() => document.querySelector('div[role="dialog"][aria-label="polish-video.webm"] video')?.currentTime > 0);
    await recipient.keyboard.press("Escape");
    console.log("PASS unclipped message/reaction/header menus with hit testing, responsive media review, caption retention, failed upload recovery and pre-upload cancellation");
  } finally { await page.unroute("**/api/upload/message"); await page.setViewportSize(previous); }
}
