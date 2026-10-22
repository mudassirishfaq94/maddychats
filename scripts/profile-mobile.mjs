import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

/** Small, reproducible lab sample; use real phones for release acceptance. */
export async function profileMobile(base, cookieHeader = "", conversationId, quick = false) {
  const origin = new URL(base);
  if (!["localhost", "127.0.0.1"].includes(origin.hostname)) throw new Error("Mobile lab accepts loopback staging only");
  const browser = await chromium.launch({ headless: true });
  const results = [];
  try {
    for (const width of quick ? [360] : [360, 412]) {
      const context = await browser.newContext({ viewport: { width, height: 800 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2, timezoneId: width === 360 ? "Asia/Dubai" : "America/New_York" });
      if (cookieHeader) await context.addCookies(cookieHeader.split("; ").filter(Boolean).map((cookie) => {
        const index = cookie.indexOf("="); return { name: cookie.slice(0, index), value: cookie.slice(index + 1), url: base, httpOnly: true, sameSite: "Lax" };
      }));
      const page = await context.newPage();
      let finalSamples;
      await page.exposeFunction("__circloSaveVitals", (samples) => { finalSamples = samples; });
      const cdp = await context.newCDPSession(page);
      await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
      await cdp.send("Network.enable");
      await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 80, downloadThroughput: 200000, uploadThroughput: 100000 });
      await page.addInitScript(() => {
        window.__labCsp = [];
        window.addEventListener("securitypolicyviolation", (event) => { if (window.__labCsp.length < 50) window.__labCsp.push({ directive: event.effectiveDirective, disposition: event.disposition, source: new URL(event.sourceFile || location.href).pathname.startsWith("/app/") ? "app" : "other", line: event.lineNumber, blocked: event.blockedURI.split(":")[0] }); });
      });
      for (const path of quick ? ["/app/profile"] : conversationId ? ["/app", "/app/profile", `/app/chats/${conversationId}`] : ["/", "/login"]) {
        const routeName = path.startsWith("/app/chats/") ? "chat" : path.replace(/^\/+|\/+$/g, "") || "home";
        finalSamples = undefined;
        const errors = [];
        const collectError = () => errors.push(true);
        page.on("pageerror", collectError);
        const response = await page.goto(new URL(`${path}?profile=1`, base).toString(), { waitUntil: "load", timeout: 90000 });
        await page.waitForFunction(() => window.__circloVitalsRegistered === true, undefined, { timeout: 15000 });
        await page.waitForTimeout(3500);
        const input = page.locator('input[type="search"]:not(:disabled):visible, input[placeholder*="Search"]:not(:disabled):visible, textarea:not(:disabled):visible, input[name="identifier"]:not(:disabled):visible, input[autocomplete="current-password"]:not(:disabled):visible').first();
        if (await input.isVisible().catch(() => false) && await input.isEditable()) { await input.click(); await input.pressSequentially("lab input", { delay: 80, timeout: 5000 }); await input.fill(""); }
        else { const button = page.locator("button:not(:disabled):visible").first(); if (await button.isVisible().catch(() => false)) await button.click(); }
        if (path.startsWith("/app/chats/")) {
          const composer = page.getByRole("textbox", { name: "Message text" });
          await composer.fill("composition probe");
          await composer.evaluate(node => node.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", isComposing: true, bubbles: true })));
          assert.equal(await composer.inputValue(), "composition probe", "IME confirmation must not send the draft");
          const immediateDraft = `last-keystroke-${width}-complete`;
          const postedBodies = [];
          const collectPost = request => {
            if (request.method() === "POST" && new URL(request.url()).pathname === `/api/conversations/${conversationId}/messages`) postedBodies.push(request.postDataJSON());
          };
          page.on("request", collectPost);
          // Input and Enter happen in one browser task, before the deferred
          // UI render. The optimistic bubble must include the final character.
          await composer.evaluate((node, text) => {
            Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set.call(node, text);
            node.dispatchEvent(new Event("input", { bubbles: true }));
            node.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
          }, immediateDraft);
          await page.getByText(immediateDraft, { exact: true }).first().waitFor({ state: "visible" });
          await page.getByRole("status").filter({ hasText: /secure delivery|device needs approval/i }).waitFor();
          assert.equal(await page.getByLabel("Queued", { exact: true }).count(), 1, "Encryption setup waits are queued, not failed");
          assert.equal(await page.getByLabel("Failed to send", { exact: true }).count(), 0);
          // A securely queued send now clears the composer after its durable
          // write. Verify the complete final keystroke survives in that queue.
          await page.waitForFunction(async text => {
            const store = await import("/offline-store.js");
            const account = store.activeAccount();
            return account && (await store.queuedTexts(account)).some(entry => entry.text === text);
          }, immediateDraft);
          assert.equal(await composer.inputValue(), "", "A durable queued send clears the composer");
          await page.waitForTimeout(500);
          for (const body of postedBodies) {
            assert.equal(body.encrypted, true, "Performance changes must preserve encrypted sends");
            assert.notEqual(body.text, immediateDraft, "Plaintext must not leave the browser");
          }
          page.off("request", collectPost);
        }
        await page.evaluate(() => window.scrollBy(0, 500));
        // Backgrounding flushes Web Vitals (including interaction latency).
        const background = await context.newPage(); await background.bringToFront(); await page.waitForTimeout(500);
        const measurement = await page.evaluate(() => ({
          samples: window.__circloPerformance || [], csp: window.__labCsp || [],
          horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth + 1,
          navigation: performance.getEntriesByType("navigation").map((entry) => ({ ttfb: entry.responseStart - entry.requestStart, load: entry.loadEventEnd - entry.startTime })),
        }));
        const summarize = (values) => {
          const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
          if (!sorted.length) return null;
          return { count: sorted.length, minMs: Number(sorted[0].toFixed(1)), medianMs: Number(sorted[Math.floor((sorted.length - 1) / 2)].toFixed(1)), p95Ms: Number(sorted[Math.ceil(sorted.length * 0.95) - 1].toFixed(1)) };
        };
        const requestSamples = measurement.samples.filter(sample => sample.kind === "request");
        const requestCategories = Object.fromEntries([...new Set(requestSamples.map(sample => sample.name))].sort().map(name => [name, summarize(requestSamples.filter(sample => sample.name === name).map(sample => sample.value))]));
        measurement.requestCounts = { total: requestSamples.length, byCategory: Object.fromEntries(Object.entries(requestCategories).map(([name, summary]) => [name, summary.count])) };
        measurement.requestTimingMs = requestCategories;
        measurement.serverTimingMs = measurement.samples.filter(sample => sample.kind === "server").map(({ name, value }) => ({ name, durationMs: Number(value.toFixed(1)) }));
        delete measurement.samples;
        await mkdir(resolve(".freebuff/performance"), { recursive: true });
        await page.screenshot({ path: resolve(`.freebuff/performance/mobile-${width}-${routeName.replace(/[^a-z0-9]/gi, "-") || "home"}.png`) });
        await background.close(); await page.bringToFront();
        // Real pagehide finalizes CLS/INP even when headless tab switches don't
        // change visibility. Register after the framework's metrics listeners.
        await page.evaluate(() => window.addEventListener("pagehide", () => window.__circloSaveVitals(window.__circloPerformance || []), { once: true }));
        await page.evaluate(() => document.addEventListener("visibilitychange", () => {
          if (document.visibilityState === "hidden") window.__circloSaveVitals(window.__circloPerformance || []);
        }));
        await page.goto("about:blank");
        if (finalSamples) measurement.vitals = finalSamples.filter(sample => sample.kind === "vital").map(({ name, value }) => ({ name, value: Number(value.toFixed(1)) }));
        results.push({ width, route: routeName, status: response?.status(), ...measurement, pageErrorCount: errors.length });
        page.off("pageerror", collectError);
      }
      await context.close();
    }
  } finally { await browser.close(); }
  await mkdir(resolve(".freebuff/performance"), { recursive: true });
  await writeFile(resolve(".freebuff/performance/mobile-lab.json"), JSON.stringify({ generatedAt: new Date().toISOString(), kind: "emulated Chromium lab; 4x CPU, 80ms latency, 1.6Mbps download; single sample per route and width", physicalDeviceValidation: "not run; requires the Poco X7 Pro attached over USB debugging", results }, null, 2));
  return results;
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  profileMobile(
    process.env.PROFILE_BASE_URL || "http://127.0.0.1:3000",
    process.env.PROFILE_COOKIE || "",
    process.env.PROFILE_CONVERSATION_ID,
    process.env.PROFILE_QUICK === "1",
  ).then(() => console.log("Saved .freebuff/performance/mobile-lab.json"))
    .catch((error) => { console.error(error.message); process.exitCode = 1; });
}
