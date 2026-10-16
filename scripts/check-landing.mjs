import { chromium } from "playwright";
import { createServer } from "node:http";
import { readFile, mkdir } from "node:fs/promises";
import assert from "node:assert/strict";

const html = await readFile(new URL("../tests/fixtures/circlo-landing.html", import.meta.url));
const server = createServer((req, res) => {
  if (req.url !== "/") { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  res.end(html);
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const url = `http://127.0.0.1:${server.address().port}/`;
let browser;
try {
  browser = await chromium.launch();
  await mkdir("landing-preview", { recursive: true });
  for (const width of [360, 390, 768, 1280]) {
    const page = await browser.newPage({ viewport: { width, height: 900 }, deviceScaleFactor: 1 });
    const failures = [];
    page.on("pageerror", error => failures.push(error.message));
    await page.goto(url);
    await page.getByRole("heading", { name: "Keep your circle close." }).waitFor();
    assert.equal(await page.title(), "Circlo — Keep your circle close");
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false, `Overflow at ${width}px`);
    for (const anchor of await page.locator("a").all()) {
      const href = await anchor.getAttribute("href");
      assert.ok(href && (href.startsWith("https://circlo.chat/") || href.startsWith("#")), `Unexpected link: ${href}`);
      if (href.startsWith("#")) assert.equal(await page.locator(href).count(), 1, `Missing target: ${href}`);
    }
    for (const summary of await page.locator("summary").all()) {
      await summary.click();
      assert.equal(await summary.evaluate(element => element.parentElement.open), true);
      await summary.click();
    }
    assert.equal(await page.locator("script, img[src], link[rel=stylesheet]").count(), 0);
    assert.deepEqual(failures, []);
    await page.screenshot({ path: `landing-preview/circlo-${width}.png`, fullPage: true });
    await page.close();
    console.log(`PASS: ${width}px layout, links, FAQ and screenshot`);
  }
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}
