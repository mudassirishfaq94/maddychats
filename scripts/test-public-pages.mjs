import assert from "node:assert/strict";
import { chromium } from "playwright";

/** Read-only public crawler. No form submissions or external-link requests. */
export async function testPublicPages(base, { live = false } = {}) {
  const origin = new URL(base).origin;
  assert(["127.0.0.1", "localhost"].includes(new URL(base).hostname) || (live && origin === "https://circlo.chat"));
  const paths = ["/", "/privacy", "/terms", "/whatsapp-alternative", "/support", "/delete-account"];
  const browser = await chromium.launch(); const errors = []; const links = new Set(); let layouts = 0;
  try {
    const page = await browser.newPage(); page.on("pageerror", error => errors.push(error.message));
    for (const path of paths) {
      for (const width of [320, 390, 1280]) {
        await page.setViewportSize({ width, height: 844 });
        const response = await page.goto(origin + path); assert.equal(response.status(), 200, path);
        assert.equal(new URL(await page.locator('link[rel="canonical"]').getAttribute("href")).href, "https://circlo.chat" + path);
        assert((await page.locator('meta[name="description"]').getAttribute("content")).length > 30);
        assert.equal(await page.locator("h1").count(), 1);
        assert(!/noindex/i.test(response.headers()["x-robots-tag"] ?? ""));
        assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `Overflow ${path} ${width}`);
        const anchors = await page.locator("a[href]").evaluateAll(items => items.map(item => item.getAttribute("href")));
        for (const href of anchors) {
          const url = new URL(href, page.url());
          if (url.origin !== origin) continue;
          links.add(url.pathname + url.search);
          if (url.hash && url.pathname === path) assert(await page.evaluate(hash => Boolean(document.getElementById(decodeURIComponent(hash.slice(1)))), url.hash), `Missing fragment ${path}${url.hash}`);
        }
        layouts++;
      }
    }
    for (const path of links) assert.equal((await page.request.get(origin + path)).status(), 200, `Broken local link ${path}`);
    for (const path of ["/login", "/signup", "/forgot-password", "/reset-password", "/verify-email"]) {
      const response = await page.request.get(origin + path); assert.equal(response.status(), 200, path);
      assert.match(response.headers()["x-robots-tag"] ?? "", /noindex/i, path);
    }
    const alias = await page.request.get(origin + "/register", { maxRedirects: 0 }); assert.equal(alias.status(), 308);
    assert.equal(new URL(alias.headers().location, origin).pathname, "/signup");
    const preview = await page.request.get(origin + "/circlo-landing.html", { maxRedirects: 0 }); assert.equal(preview.status(), 308);
    assert.equal(new URL(preview.headers().location, origin).pathname, "/");
    assert.match((await page.request.get(origin + "/offline.html")).headers()["x-robots-tag"] ?? "", /noindex/i);
    for (const width of [320, 390, 1280]) {
      await page.setViewportSize({ width, height: 740 });
      const missing = await page.goto(origin + "/not-a-real-circlo-page"); assert.equal(missing.status(), 404);
      await page.getByRole("heading", { name: "We couldn’t find that page", exact: true }).waitFor();
      assert.equal(await page.getByRole("link", { name: "Go to homepage", exact: true }).getAttribute("href"), "/");
      assert.equal(await page.getByRole("link", { name: "Open my chats", exact: true }).getAttribute("href"), "/app/chats");
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    }
    const adminAlias = await page.request.get(origin + "/admin", { maxRedirects: 0 }); assert.equal(adminAlias.status(), 307);
    assert.equal(new URL(adminAlias.headers().location, origin).pathname, "/app/admin");
    const sitemap = await page.request.get(origin + "/sitemap.xml"); assert.equal(sitemap.status(), 200);
    const locations = [...(await sitemap.text()).matchAll(/<loc>([^<]+)<\/loc>/g)].map(match => match[1]);
    assert.deepEqual(locations, paths.map(path => "https://circlo.chat" + path));
    const robots = await page.request.get(origin + "/robots.txt"); assert.equal(robots.status(), 200);
    assert.match(await robots.text(), /Sitemap: https:\/\/circlo.chat\/sitemap.xml/);
    const image = await page.request.get(origin + "/brand/social-card.png"); assert.equal(image.status(), 200); assert.match(image.headers()["content-type"], /image\/png/);
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ publicPages: paths.length, layouts, internalLinks: links.size, brokenLinks: 0, browserErrors: 0, authPagesNoindex: true, sitemap: "passed", robots: "passed" }));
  } finally { await browser.close(); }
}
