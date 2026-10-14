const CACHE_NAME = "circlo-offline-notifications-v3";
const OFFLINE_URL = "/offline.html";

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.add(OFFLINE_URL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(Promise.all([
    clients.claim(),
    caches.keys().then(keys => Promise.all(keys
      .filter(key => (key.startsWith("ziptalk-offline-") || key.startsWith("circlo-offline-")) && key !== CACHE_NAME)
      .map(key => caches.delete(key)))),
  ]));
});

// Cache only the public offline screen. Chats, API responses, decrypted
// media, and authenticated HTML must never enter the service-worker cache.
self.addEventListener("fetch", (event) => {
  if (event.request.mode !== "navigate" || event.request.method !== "GET") return;
  if (new URL(event.request.url).origin !== self.location.origin) return;
  event.respondWith(fetch(event.request).catch(async () => {
    const fallback = await caches.match(OFFLINE_URL);
    return fallback || new Response("You are offline. Reconnect and reload Circlo.", {
      status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }));
});


const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const appPath = value => {
  try {
    const url = new URL(value, self.location.origin);
    if (url.origin !== self.location.origin || url.username || url.password) return null;
    if (url.pathname === "/app/chats") return "/app/chats";
    const id = url.pathname.match(/^\/app\/chats\/([^/]+)$/)?.[1];
    return id && uuid.test(id) ? `/app/chats/${id}?latest=1` : null;
  } catch { return null; }
};
const appWindows = async () => (await self.clients.matchAll({ type: "window", includeUncontrolled: true }))
  .filter(client => { try { const url = new URL(client.url); return url.origin === self.location.origin && (url.pathname === "/app" || url.pathname.startsWith("/app/")); } catch { return false; } });
const clearAlerts = async () => {
  for (const notification of await self.registration.getNotifications()) notification.close();
};
self.addEventListener("message", event => {
  if (!event.source?.url || new URL(event.source.url).origin !== self.location.origin) return;
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
  if (event.data?.type === "CIRCLO_APP_VISIBLE" || event.data?.type === "CIRCLO_SIGNED_OUT") event.waitUntil(clearAlerts());
});

// Serialize same-chat replacements so simultaneous pushes cannot lose counts
// or create duplicate cards. Private responses never enter the offline cache.
let pushWork = Promise.resolve();
self.addEventListener("push", event => {
  let data;
  try { data = event.data?.json(); } catch { return; }
  if (!data || !uuid.test(data.notificationId) || !uuid.test(data.recipientId)) return;
  const deliver = async () => {
    if ((await appWindows()).some(client => client.visibilityState === "visible")) { await clearAlerts(); return; }
    let detail;
    try {
      const response = await fetch(`/api/notifications/push/delivery?id=${encodeURIComponent(data.notificationId)}`, { credentials: "same-origin", cache: "no-store", signal: AbortSignal.timeout(10000) });
      if (response.status === 401 || response.status === 403 || response.status === 404 || response.status === 422) return;
      if (!response.ok) throw new Error("delivery_unavailable");
      detail = await response.json();
      if (detail.recipientId !== data.recipientId || !uuid.test(detail.conversationId) || !uuid.test(detail.messageId)) return;
    } catch {
      // Offline: preserve a generic alert without disclosing account or sender.
      detail = { title: "Circlo", body: "New activity. Open Circlo to check your messages.", silent: false };
    }
    // The user can foreground the app while the authenticated lookup runs.
    if ((await appWindows()).some(client => client.visibilityState === "visible")) { await clearAlerts(); return; }
    const url = detail.conversationId ? `/app/chats/${detail.conversationId}?latest=1` : "/app/chats";
    const tag = detail.conversationId ? `circlo-${data.recipientId}-${detail.conversationId}` : "circlo-activity";
    const previous = (await self.registration.getNotifications({ tag }))[0];
    const ids = previous?.data?.messageIds ?? [];
    if (detail.messageId && ids.includes(detail.messageId)) return;
    const count = Math.min(99, (previous?.data?.count ?? 0) + 1);
    const now = Date.now();
    const alertAgain = !previous || now - (previous.data?.lastAlertAt ?? 0) > 5000;
    await self.registration.showNotification(detail.title || "Circlo", {
      body: count > 1 && detail.conversationId ? `${count} new encrypted messages. Open Circlo to read them.` : detail.body,
      icon: "/icons/circlo-192.png?v=linked-c-2", badge: "/icons/circlo-badge-96.png",
      tag, renotify: Boolean(previous && alertAgain), silent: Boolean(detail.silent),
      ...(!detail.silent ? { vibrate: [100, 50, 100] } : {}),
      actions: [{ action: "open", title: "Open chat" }, { action: "dismiss", title: "Dismiss" }],
      data: { url, count, recipientId: data.recipientId, messageIds: [...ids, detail.messageId].filter(Boolean).slice(-20), lastAlertAt: alertAgain ? now : previous.data.lastAlertAt },
    });

  };
  pushWork = pushWork.catch(() => {}).then(deliver);
  event.waitUntil(pushWork);
});

self.addEventListener("notificationclick", event => {
  event.notification.close();
  if (event.action === "dismiss") return;
  const path = appPath(event.notification.data?.url) || "/app/chats";
  const full = new URL(path, self.location.origin).href;
  event.waitUntil((async () => {
    const windows = await appWindows();
    const existing = windows.find(client => new URL(client.url).pathname === new URL(full).pathname) || windows[0];
    if (existing) {
      try { await existing.navigate(full); await existing.focus(); return; } catch { /* Fall back to opening a fresh app window. */ }
    }
    await self.clients.openWindow(full);
  })());
});
