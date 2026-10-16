/** Isolated loopback browser test: actual worker/HTML/CSP, no DB or production requests. */
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import type { AddressInfo } from "node:net";
import { chromium } from "playwright";
import { contentSecurityPolicy } from "../src/lib/content-security-policy";

async function main() {
const offline = await readFile("public/offline.html");
const worker = await readFile("public/sw.js");
const policy = contentSecurityPolicy(randomBytes(18).toString("base64"), false);
const server = createServer((req, res) => {
  res.setHeader("Cache-Control", "no-store");
  if (req.url === "/sw.js") {
    res.setHeader("Content-Type", "application/javascript");
    res.end(worker);
  } else {
    res.setHeader("Content-Security-Policy", policy);
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.end(req.url === "/offline.html" ? offline : "<!doctype html><title>Online fixture</title><h1>Connected</h1>");
  }
});
await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
try {
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({ viewport: { width: 360, height: 800 }, isMobile: true, hasTouch: true });
    const page = await context.newPage();
    const policyErrors: string[] = [];
    page.on("console", message => { if (/violates.*Content Security Policy|Refused to/i.test(message.text())) policyErrors.push(message.text()); });
    await page.goto(origin);
    await page.evaluate(async () => { await navigator.serviceWorker.register("/sw.js"); await navigator.serviceWorker.ready; });
    await page.reload();
    await page.evaluate(async () => {
      if (!navigator.serviceWorker.controller) await new Promise<void>(resolve => navigator.serviceWorker.addEventListener("controllerchange", () => resolve(), { once: true }));
    });
    await context.setOffline(true);
    await page.goto(`${origin}/app/chats/test-conversation`);
    await page.getByRole("heading", { name: "You're offline" }).waitFor();
    await Promise.all([page.waitForEvent("framenavigated", { predicate: frame => frame === page.mainFrame() }), page.getByRole("button", { name: "Try again" }).click()]);
    assert.equal(new URL(page.url()).pathname, "/app/chats/test-conversation");
    await page.getByRole("heading", { name: "You're offline" }).waitFor();
    const cached = await page.evaluate(async () => {
      const entries: string[] = [];
      for (const name of await caches.keys()) for (const request of await (await caches.open(name)).keys()) entries.push(new URL(request.url).pathname);
      return entries;
    });
    assert.deepEqual(cached, ["/offline.html"]);
    await context.setOffline(false);
    await Promise.all([page.waitForNavigation(), page.getByRole("button", { name: "Try again" }).click()]);
    await page.getByRole("heading", { name: "Connected" }).waitFor();
    assert.equal(new URL(page.url()).pathname, "/app/chats/test-conversation");
    assert.deepEqual(policyErrors, []);
    console.log("PASS: enforced production CSP; offline Retry navigates; reconnect restores same chat route; cache contains only public fallback; no CSP refusals (360px touch viewport).");
    await context.close();
  } finally { await browser.close(); }
} finally { await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); }
}

void main().catch(error => { console.error(error); process.exitCode = 1; });
