import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";

const base = new URL(process.env.SPEED_BASE_URL || "https://ziptalks.vercel.app/");
if (!["ziptalks.vercel.app", "127.0.0.1", "localhost"].includes(base.hostname)) throw new Error("Unexpected measurement host");
const results = [];
for (let run = 0; run < 3; run++) {
  // A new browser process avoids hidden disk/memory cache reuse between runs.
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: "block" });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const cdp = await context.newCDPSession(page);
    await cdp.send("Network.enable");
    await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
    await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 80, downloadThroughput: 200000, uploadThroughput: 100000 });
    await page.addInitScript(() => {
      window.speedSample = { lcp: 0, cls: 0, longTasks: [] };
      new PerformanceObserver((list) => { for (const e of list.getEntries()) window.speedSample.lcp = e.startTime; }).observe({ type: "largest-contentful-paint", buffered: true });
      new PerformanceObserver((list) => { for (const e of list.getEntries()) if (!e.hadRecentInput) window.speedSample.cls += e.value; }).observe({ type: "layout-shift", buffered: true });
      new PerformanceObserver((list) => { for (const e of list.getEntries()) window.speedSample.longTasks.push(e.duration); }).observe({ type: "longtask", buffered: true });
    });
    const response = await page.goto(base.href, { waitUntil: "load", timeout: 90000 });
    await page.waitForTimeout(2500);
    const measurement = await page.evaluate(() => {
      const n = performance.getEntriesByType("navigation")[0];
      return { ...window.speedSample, ttfb: n.responseStart - n.requestStart, load: n.loadEventEnd,
        resources: performance.getEntriesByType("resource").map(r => ({ path: new URL(r.name).pathname, type: r.initiatorType, start: r.startTime, duration: r.duration, encodedBytes: r.encodedBodySize, decodedBytes: r.decodedBodySize })) };
    });
    results.push({ run, status: response.status(), errors, ...measurement });
    console.log(JSON.stringify({ run, status: response.status(), lcp: Math.round(measurement.lcp), ttfb: Math.round(measurement.ttfb), cls: measurement.cls, scriptBytes: measurement.resources.filter(r => r.path.endsWith(".js")).reduce((sum,r)=>sum+r.encodedBytes,0), errors }));
  } finally { await browser.close(); }
}
await mkdir(".freebuff/performance", { recursive: true });
await writeFile(`.freebuff/performance/public-speed-${process.env.SPEED_LABEL || "live"}.json`, JSON.stringify({ base: base.href, conditions: "fresh Chromium process per run; cache disabled; 4x CPU; 80ms latency; 1.6Mbps download; service worker blocked", results }, null, 2));
