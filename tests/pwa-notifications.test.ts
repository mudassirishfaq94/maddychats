import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const user = "11111111-1111-4111-8111-111111111111";
const chat = "22222222-2222-4222-8222-222222222222";
const notice = "33333333-3333-4333-8333-333333333333";
const message = "44444444-4444-4444-8444-444444444444";
function harness() {
  const handlers: Record<string, (event: any) => void> = {};
  const cards: any[] = [], opened: string[] = [];
  let windows: any[] = [];
  let detail: any = { recipientId: user, conversationId: chat, messageId: message, title: "Alex · Circlo", body: "New encrypted message", silent: false };
  let status = 200, offline = false;
  const self = {
    location: { origin: "https://circlo.chat" }, navigator: {}, skipWaiting() {},
    addEventListener(name: string, handler: (event: any) => void) { handlers[name] = handler; },
    clients: { matchAll: async () => windows, openWindow: async (url: string) => { opened.push(url); } },
    registration: {
      getNotifications: async (options?: { tag?: string }) => cards.filter(card => !options?.tag || card.tag === options.tag),
      showNotification: async (title: string, options: any) => {
        const previous = cards.findIndex(card => card.tag === options.tag);
        if (previous >= 0) cards.splice(previous, 1);
        const card = { title, ...options, close() { const i = cards.indexOf(card); if (i >= 0) cards.splice(i, 1); } }; cards.push(card);
      },
    },
  };
  vm.runInNewContext(readFileSync("public/sw.js", "utf8"), { self, clients: self.clients, URL, AbortSignal, Date,
    fetch: async () => { if (offline) throw new Error("offline"); return { status, ok: status === 200, json: async () => detail }; },
  });
  const dispatch = async (name: string, extra: any) => { let done: Promise<unknown> = Promise.resolve(); handlers[name]({ ...extra, waitUntil(p: Promise<unknown>) { done = p; } }); await done; };
  return { cards, opened, setWindows: (value: any[]) => { windows = value; }, setDetail: (value: any) => { detail = { ...detail, ...value }; }, setStatus: (value: number) => { status = value; }, setOffline: () => { offline = true; },
    push: () => dispatch("push", { data: { json: () => ({ notificationId: notice, recipientId: user }) } }),
    click: (notification: any, action = "open") => dispatch("notificationclick", { notification, action }),
    visible: () => dispatch("message", { source: { url: "https://circlo.chat/app/profile" }, data: { type: "CIRCLO_APP_VISIBLE" } }),
  };
}

test("push is quiet on every visible app screen, but displays with hidden or closed clients", async () => {
  const h = harness();
  h.setWindows([{ visibilityState: "visible", url: "https://circlo.chat/app/profile" }]); await h.push(); assert.equal(h.cards.length, 0);
  h.setWindows([{ visibilityState: "hidden", url: "https://circlo.chat/app/profile" }]); await h.push(); assert.equal(h.cards.length, 1);
  assert.equal(h.cards[0].title, "Alex · Circlo"); assert.equal(h.cards[0].badge, "/icons/circlo-badge-96.png");
  await h.visible(); assert.equal(h.cards.length, 0);
  h.setWindows([]); await h.push(); assert.equal(h.cards.length, 1);
});

test("per-chat cards coalesce, deduplicate delivery, respect silent mode and safe navigation", async () => {
  const h = harness(); await h.push(); await h.push(); assert.equal(h.cards[0].data.count, 1);
  h.setDetail({ messageId: notice, silent: true }); await h.push();
  assert.equal(h.cards.length, 1); assert.equal(h.cards[0].data.count, 2); assert.equal(h.cards[0].silent, true); assert.equal(h.cards[0].vibrate, undefined);
  await h.click(h.cards[0]); assert.equal(h.opened[0], `https://circlo.chat/app/chats/${chat}?latest=1`);
  await h.click({ data: { url: "https://evil.invalid/app/chats" }, close() {} });
  assert.equal(h.opened[1], "https://circlo.chat/app/chats");
});

test("stale account, logged-out, read, muted and unavailable deliveries never expose sender details", async () => {
  for (const status of [401, 403, 404, 422]) { const h = harness(); h.setStatus(status); await h.push(); assert.equal(h.cards.length, 0); }
  const swapped = harness(); swapped.setDetail({ recipientId: chat }); await swapped.push(); assert.equal(swapped.cards.length, 0);
  const offline = harness(); offline.setOffline(); await offline.push(); assert.equal(offline.cards[0].title, "Circlo");
  assert(!offline.cards[0].body.includes("Alex"));
  await offline.click(offline.cards[0], "dismiss"); assert.equal(offline.opened.length, 0);
});
