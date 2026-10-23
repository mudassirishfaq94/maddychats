/** Isolated loopback browser test: actual worker/HTML/CSP, no DB or production requests. */
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
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
  } else if (["/offline.html", "/offline.css", "/offline-store.js", "/offline-compose.js", "/icons/circlo-mark.svg"].includes(req.url ?? "")) {
    const path = req.url!;
    res.setHeader("Content-Type", path.endsWith(".js") ? "application/javascript" : path.endsWith(".css") ? "text/css" : path.endsWith(".svg") ? "image/svg+xml" : "text/html; charset=utf-8");
    void readFile("public" + path).then(bytes => res.end(bytes));
  } else {
    res.setHeader("Content-Security-Policy", policy);
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    if (req.url === "/outage") res.statusCode = 503;
    res.end("<!doctype html><title>Online fixture</title><h1>Connected</h1>");
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
    const userId = randomUUID(), chatId = randomUUID(), lockedId = randomUUID(), secondId = randomUUID();
    await page.evaluate(async ({userId,chatId,lockedId,secondId}) => {
      const store = await import(/* webpackIgnore: true */ ("/offline-store.js" as string));
      await store.rememberChats(userId,[{id:chatId,name:"Saved chat",type:"dm",favorited:true},{id:lockedId,name:"Private locked chat"},{id:secondId,name:"Team chat",type:"group",unreadCount:2}]);
      await store.rememberHistory(userId,chatId,[{id:crypto.randomUUID(),senderId:"peer",senderName:"Alex",createdAt:new Date().toISOString(),kind:"message",text:"Saved conversation history",mine:false},{id:crypto.randomUUID(),senderId:"peer",senderName:"Alex",createdAt:new Date().toISOString(),kind:"ephemeral",text:"NEVER SAVE THIS",mine:false}]);
      const history=await store.offlineHistory(userId,chatId);
      if(history.messages.some((message:{text:string})=>message.text==="NEVER SAVE THIS"))throw new Error("Ephemeral content leaked into offline history");
      await store.rememberHistory(userId,secondId,[{id:crypto.randomUUID(),senderId:"peer",senderName:"Alex",createdAt:new Date().toISOString(),kind:"message",text:"Deleted private text",mine:false}]);
      await store.rememberHistory(userId,secondId,[],true);
      if((await store.offlineHistory(userId,secondId)).messages.length)throw new Error("Fresh history must remove stale snapshots");
      if((await store.offlineChats(userId)).find((chat:{id:string})=>chat.id===secondId)?.preview)throw new Error("Cleared history preview must be erased");
      localStorage.setItem("maddy:locked-chats",JSON.stringify([lockedId]));
      localStorage.setItem("maddy-theme","light");
    },{userId,chatId,lockedId,secondId});
    await context.setOffline(true);
    await page.goto(`${origin}/app/chats`);
    await page.getByRole("heading",{name:"Chats",exact:true}).waitFor();
    await page.getByRole("listitem",{name:"Saved chat",exact:true}).waitFor();
    await page.getByRole("listitem",{name:"Team chat",exact:true}).waitFor();
    assert.equal(await page.getByText("Private locked chat",{exact:true}).count(),0);
    await page.getByRole("button",{name:"Favorites",exact:true}).click();
    await page.getByRole("listitem",{name:"Team chat",exact:true}).waitFor({state:"hidden"});
    await page.getByRole("button",{name:"All",exact:true}).click();
    await page.getByRole("listitem",{name:"Saved chat",exact:true}).click();
    await page.getByRole("region",{name:"Messages",exact:true}).getByText("Saved conversation history",{exact:true}).waitFor();
    assert.equal(await page.getByText("NEVER SAVE THIS",{exact:true}).count(),0);
    await page.getByRole("textbox",{name:"Message text"}).fill("Offline draft survives switching");
    await page.getByRole("button",{name:"Back to chats",exact:true}).click();
    await page.getByRole("listitem",{name:"Saved chat",exact:true}).click();
    await page.waitForFunction(()=>document.querySelector<HTMLTextAreaElement>("#text")?.value==="Offline draft survives switching");
    await page.getByRole("textbox",{name:"Message text"}).fill("Offline fixture message");
    await page.getByRole("textbox",{name:"Message text"}).press("Enter");
    await page.getByRole("region",{name:"Messages",exact:true}).getByText("Offline fixture message",{exact:true}).waitFor();
    await page.reload();await page.getByRole("region",{name:"Messages",exact:true}).getByText("Offline fixture message",{exact:true}).waitFor();
    const cancelQueued = page.getByRole("button",{name:"Cancel message",exact:true});
    if (!await cancelQueued.isVisible()) await page.getByRole("button",{name:"Show queued message options",exact:true}).click();
    await cancelQueued.click();
    await page.getByRole("region",{name:"Messages",exact:true}).getByText("Offline fixture message",{exact:true}).waitFor({state:"hidden"});
    await page.getByRole("button",{name:"Back to chats",exact:true}).click();
    await page.getByRole("listitem",{name:"Locked chat",exact:true}).click();
    await page.waitForFunction(()=>document.querySelector<HTMLTextAreaElement>("#text")?.disabled===true);
    await page.evaluate(async id => { const store=await import(/* webpackIgnore: true */ ("/offline-store.js" as string));await store.forgetOffline(id); },userId);
    await page.goto(origin+"/app/chats");await page.getByText("Connect and sign in once to save your conversations on this device.",{exact:true}).waitFor();
    const cached = await page.evaluate(async () => {
      const entries: string[] = [];
      for (const name of await caches.keys()) for (const request of await (await caches.open(name)).keys()) entries.push(new URL(request.url).pathname);
      return entries;
    });
    assert.deepEqual(cached.sort(),["/offline.html","/offline.css","/offline-compose.js","/offline-store.js","/icons/circlo-mark.svg"].sort());
    await context.setOffline(false);
    await page.goto(origin+"/outage");
    await page.getByRole("heading",{name:"Chats",exact:true}).waitFor();
    assert.deepEqual(policyErrors,[]);
    console.log("PASS: normal offline chat list, filters, saved history, draft switching, Enter/send/reload/cancel, sign-out cleanup, public-only cache, no CSP violations (360px touch viewport).");
    await context.close();
  } finally { await browser.close(); }
} finally { await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); }
}

void main().catch(error => { console.error(error); process.exitCode = 1; });
