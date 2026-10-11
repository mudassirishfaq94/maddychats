import assert from "node:assert/strict";

/** Exercise the real attachment viewer with an already-delivered fixture image. */
export async function testImageViewer(page, name) {
  const previousViewport = page.viewportSize();
  const thumbnail = page.getByRole("button", { name: `View ${name}`, exact: true });
  try {
    for (const viewport of [{ width: 390, height: 844 }, { width: 844, height: 390 }, { width: 1366, height: 768 }]) {
      await page.setViewportSize(viewport);
      await thumbnail.click();
      const dialog = page.getByRole("dialog", { name, exact: true });
      await dialog.waitFor();
      await dialog.getByRole("button", { name: "Zoom image", exact: true }).waitFor({ state: "visible" });
      await page.waitForFunction(name => {
        const image = document.querySelector('[role="dialog"] img');
        return image?.alt === name && image.complete && image.naturalWidth > 0 && getComputedStyle(image).visibility === "visible";
      }, name);
      const fit = await dialog.evaluate(node => {
        const image = node.querySelector("img");
        const frame = node.getBoundingClientRect();
        const bounds = image.getBoundingClientRect();
        return { portal: node.parentElement === document.body, x: frame.x, y: frame.y, width: frame.width, height: frame.height,
          imageInside: bounds.x >= 0 && bounds.y >= 0 && bounds.right <= innerWidth + 1 && bounds.bottom <= innerHeight + 1,
          ratio: bounds.width / bounds.height, naturalRatio: image.naturalWidth / image.naturalHeight,
          scrollLocked: document.body.style.overflow === "hidden" };
      });
      assert(fit.portal && fit.imageInside && fit.scrollLocked);
      assert.equal(fit.x, 0); assert.equal(fit.y, 0);
      assert.equal(fit.width, viewport.width); assert.equal(fit.height, viewport.height);
      assert(Math.abs(fit.ratio - fit.naturalRatio) < 0.01, "The entire image preserves its aspect ratio");
      await dialog.getByRole("button", { name: "Zoom image", exact: true }).click();
      await dialog.getByRole("button", { name: "Fit image to screen", exact: true }).waitFor();
      assert(await dialog.locator("img").evaluate(image => image.getBoundingClientRect().width > innerWidth));
      await dialog.getByRole("button", { name: "Fit image to screen", exact: true }).click();
      await page.keyboard.press("Escape");
      await dialog.waitFor({ state: "detached" });
      assert(await thumbnail.evaluate(node => document.activeElement === node), "Closing restores focus to the thumbnail");
      assert.equal(await page.evaluate(() => document.body.style.overflow), "");
    }
    await thumbnail.click();
    await page.getByRole("dialog", { name, exact: true }).getByRole("button", { name: "Close", exact: true }).click();
    await page.getByRole("dialog", { name, exact: true }).waitFor({ state: "detached" });
  } finally {
    await page.setViewportSize(previousViewport);
  }
}
