import assert from "node:assert/strict";
import { testChatPolish } from "./test-chat-polish.mjs";

/** Owned conversation only: actual UI staging, encryption and recipient animation. */
export async function testComposerMedia(base, source, recipient, pool, conversationId) {
  const page = source.page, previous = page.viewportSize();
  const input = page.getByRole("textbox", { name: "Message text", exact: true });
  try {
    await testChatPolish(page, recipient.page);
    for (const width of [320, 360, 390, 412, 1280]) {
      await page.setViewportSize({ width, height: 740 }); await input.fill("Short draft");
      await page.waitForTimeout(180);
      const sizes = await page.locator(".composer-row .composer-icon").evaluateAll(controls => controls.map(node => ({ label: node.getAttribute("aria-label"), width: node.getBoundingClientRect().width, height: node.getBoundingClientRect().height })));
      const before = await input.boundingBox();
      const long = "A long message should only grow the text field. ".repeat(25);
      await input.fill(long); await page.waitForTimeout(180);
      assert.equal(await input.inputValue(), long);
      const after = await input.boundingBox(); assert(after.height > before.height && after.height <= 96.1);
      for (const size of sizes) { const control = page.getByRole("button", { name: size.label, exact: true }); const box = await control.boundingBox(); assert.equal(box.width, 44); assert.equal(box.height, 44); }
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      await page.getByRole("button", { name: "Emoji", exact: true }).click();
      const tray = page.getByRole("dialog", { name: "Emoji, stickers and GIFs", exact: true }); await tray.waitFor(); await page.waitForTimeout(60);
      const bounds = await tray.boundingBox(); assert(bounds.x >= 0 && bounds.y >= 0 && bounds.x + bounds.width <= width + 1);
      await tray.getByRole("tab", { name: "GIFs", exact: true }).click();
      assert.equal(await tray.getByRole("button", { name: /Add .* GIF$/ }).count(), 6);
      await page.keyboard.press("Escape"); await tray.waitFor({ state: "detached" });
    }
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.getByRole("button", { name: "Emoji", exact: true }).click();
    const reducedTray = page.getByRole("dialog", { name: "Emoji, stickers and GIFs", exact: true });
    await reducedTray.getByRole("tab", { name: "GIFs", exact: true }).click();
    assert(await reducedTray.locator("img").evaluateAll(images => images.every(image => image.src.endsWith(".png"))), "Reduced-motion previews remain still");
    await page.keyboard.press("Escape"); await page.emulateMedia({ reducedMotion: "no-preference" });
    await input.fill(""); await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole("button", { name: "Emoji", exact: true }).click();
    const catalogTray = page.getByRole("dialog", { name: "Emoji, stickers and GIFs", exact: true });
    await catalogTray.getByRole("tab", { name: "Stickers", exact: true }).click();
    const stickers = await catalogTray.locator("button[aria-label^='Add ']").evaluateAll(buttons => buttons.map(button => button.getAttribute("aria-label")));
    await catalogTray.getByRole("tab", { name: "GIFs", exact: true }).click();
    const gifs = await catalogTray.locator("button[aria-label^='Add ']").evaluateAll(buttons => buttons.map(button => button.getAttribute("aria-label")));
    assert.equal(stickers.length, 6); assert.equal(gifs.length, 6);
    assert(!gifs.some(label => stickers.includes(label.replace(" GIF", " sticker"))), "GIFs and stickers expose different packs");
    await catalogTray.getByLabel("Search animations").fill("rocket");
    assert.equal(await catalogTray.locator("button[aria-label^='Add ']").count(), 1);
    await catalogTray.getByRole("button", { name: "Add On my way GIF", exact: true }).waitFor();
    await page.keyboard.press("Escape");
    for (const kind of ["Stickers", "GIFs"]) {
      await page.getByRole("button", { name: "Emoji", exact: true }).click();
      const tray = page.getByRole("dialog", { name: "Emoji, stickers and GIFs", exact: true }); await tray.getByRole("tab", { name: kind, exact: true }).click();
      await tray.getByRole("button", { name: `Add ${kind === "GIFs" ? "Hey there GIF" : "Hello sticker"}`, exact: true }).click();
      const name = kind === "GIFs" ? "circlo-orbit.gif" : "circlo-hello.webp";
      await page.getByRole("img", { name, exact: true }).waitFor();
      const upload = page.waitForResponse(r => r.url().endsWith("/api/upload/message") && r.request().method() === "POST");
      await page.getByRole("button", { name: "Send attachments", exact: true }).click(); const response = await upload; assert.equal(response.status(), 201);
      const result = await response.json(); const id = (await pool.query("select id from message_attachments where message_id=$1", [result.message.id])).rows[0].id;
      const cookies = (await recipient.page.context().cookies()).map(c => c.name + "=" + c.value).join("; ");
      const encrypted = await fetch(base + "/api/media/" + id, { headers: { Cookie: cookies } }); assert.equal(encrypted.status, 200);
      const opaque = Buffer.from(await encrypted.arrayBuffer()); assert(!opaque.subarray(0, 6).toString().startsWith("GIF") && opaque.subarray(0, 4).toString() !== "RIFF");
      await recipient.page.getByRole("button", { name: `View ${name}`, exact: true }).waitFor();
      await recipient.page.waitForFunction(name => Array.from(document.images).some(image => image.alt === name && image.src.startsWith("blob:") && image.complete && image.naturalWidth > 0), name);
      const image = recipient.page.getByRole("img", { name, exact: true });
      const frames = new Set();
      for (let frame = 0; frame < 12; frame++) {
        frames.add((await image.screenshot({ animations: "allow" })).toString("base64"));
        await recipient.page.waitForTimeout(100);
      }
      assert(frames.size > 1, "Recipient animation must visibly play under enforced CSP");
    }
  } finally { await input.fill(""); await page.setViewportSize(previous); await page.emulateMedia({ reducedMotion: "no-preference" }); }
}
