const CACHE_NAME = "circlo-offline-notifications-v7";
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
    if (!id || !uuid.test(id)) return null;
    const call = url.searchParams.get("call");
    if (call && uuid.test(call)) return `/app/chats/${id}?call=${call}`;
    const message = url.searchParams.get("message");
    return `/app/chats/${id}?${message && uuid.test(message) ? `message=${message}` : "latest=1"}`;
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
      if (response.status === 401 || response.status === 403 || response.status === 404 || response.status === 422) {
        if (uuid.test(data.callId)) for (const alert of await self.registration.getNotifications({ tag: `circlo-call-${data.recipientId}-${data.callId}` })) alert.close();
        return;
      }
      if (!response.ok) throw new Error("delivery_unavailable");
      detail = await response.json();
      if (uuid.test(data.callId)) {
        if (detail.recipientId !== data.recipientId || detail.callId !== data.callId || !uuid.test(detail.conversationId) || !Number.isFinite(Date.parse(detail.expiresAt)) || Date.parse(detail.expiresAt) <= Date.now()) return;
        if ((await appWindows()).some(client => client.visibilityState === "visible")) return;
        await self.registration.showNotification(detail.title || "Circlo", {
          body: detail.body, icon: "/icons/circlo-192.png?v=linked-c-2", badge: "/icons/circlo-badge-96.png",
          tag: `circlo-call-${data.recipientId}-${data.callId}`, silent: Boolean(detail.silent),
          ...(!detail.silent ? { vibrate: [200,100,200] } : {}),
          actions: [{ action: "open", title: "Open call" }, { action: "decline", title: "Decline" }],
          data: { url: `/app/chats/${detail.conversationId}?call=${data.callId}`, callId: data.callId, notificationId: data.notificationId, recipientId: data.recipientId },
        });
        return;
      }
      if (detail.recipientId !== data.recipientId || !uuid.test(detail.conversationId) || !uuid.test(detail.messageId)) return;
    } catch {
      if (uuid.test(data.callId)) return; // Never invent a ringing call without a live, authorized lookup.
      // Offline: preserve a generic alert without disclosing account or sender.
      // Permission to deliver does not establish permission to interrupt: a
      // failed lookup cannot tell us whether this conversation is muted.
      detail = { title: "Circlo", body: "New activity. Open Circlo to check your messages.", silent: true };
    }
    // The user can foreground the app while the authenticated lookup runs.
    if ((await appWindows()).some(client => client.visibilityState === "visible")) { await clearAlerts(); return; }
    const url = detail.conversationId ? `/app/chats/${detail.conversationId}?message=${detail.messageId}` : "/app/chats";
    const tag = detail.conversationId ? `circlo-${data.recipientId}-${detail.conversationId}` : "circlo-activity";
    const previous = (await self.registration.getNotifications({ tag }))[0];
    const notificationIds = previous?.data?.notificationIds ?? [];
    if (notificationIds.includes(data.notificationId)) return;
    const ids = previous?.data?.messageIds ?? [];
    if (detail.messageId && ids.includes(detail.messageId)) return;
    const count = Math.min(99, (previous?.data?.count ?? 0) + 1);
    const now = Date.now();
    const alertAgain = !previous || now - (previous.data?.lastAlertAt ?? 0) > 5000;
    await self.registration.showNotification(detail.title || "Circlo", {
      body: count > 1 && detail.conversationId ? `${count} new encrypted messages. Open Circlo to read them.` : detail.body,
      icon: "/icons/circlo-192.png?v=linked-c-2", badge: "/icons/circlo-badge-96.png",
      tag, renotify: Boolean(!detail.silent && previous && alertAgain), silent: Boolean(detail.silent),
      ...(!detail.silent ? { vibrate: [100, 50, 100] } : {}),
      actions: [{ action: "open", title: "Open chat" }, { action: "dismiss", title: "Dismiss" }],
      data: { url, notificationId: data.notificationId, notificationIds: [...notificationIds, data.notificationId].slice(-100), count, recipientId: data.recipientId, messageIds: [...ids, detail.messageId].filter(Boolean).slice(-20), lastAlertAt: !detail.silent && alertAgain ? now : previous?.data?.lastAlertAt ?? 0 },
    });

  };
  pushWork = pushWork.catch(() => {}).then(deliver);
  event.waitUntil(pushWork);
});

async function openChatFromNotification(data) {
    let path = appPath(data?.url) || "/app/chats";
    // A push received offline has no private routing details. Retry the
    // authenticated lookup on tap, without trusting a URL from the payload.
    if (path === "/app/chats" && uuid.test(data?.notificationId)) {
      try {
        const response = await fetch(`/api/notifications/push/delivery?id=${encodeURIComponent(data.notificationId)}`, { credentials: "same-origin", cache: "no-store", signal: AbortSignal.timeout(3000) });
        if (response.ok) {
          const detail = await response.json();
          if (detail.recipientId === data.recipientId && uuid.test(detail.conversationId) && uuid.test(detail.messageId)) path = `/app/chats/${detail.conversationId}?message=${detail.messageId}`;
        }
      } catch { /* Opening the inbox still works offline. */ }
    }
    const full = new URL(path, self.location.origin).href;
    const windows = await appWindows();
    const existing = windows.find(client => new URL(client.url).pathname === new URL(full).pathname) || windows[0];
    if (existing) {
      // Focus before navigation: navigation can destroy the original client.
      // Focus failure must not discard a successful navigation, or vice versa.
      try { await existing.focus(); } catch { /* Still attempt navigation. */ }
      try {
        const navigated = await existing.navigate(full);
        if (navigated) { try { await navigated.focus(); } catch {} return; }
      } catch { /* Fall back to opening a fresh app window. */ }
    }
    const opened = await self.clients.openWindow(full);
    if (opened) { try { await opened.focus(); } catch {} }
}

self.addEventListener("notificationclick", event => {
  event.notification.close();
  if (event.action === "dismiss") return;
  if (event.action === "decline" && uuid.test(event.notification.data?.callId)) {
    const data = event.notification.data;
    event.waitUntil((async () => {
      try {
        const response = await fetch(`/api/notifications/push/delivery?id=${encodeURIComponent(data.notificationId)}`, { credentials: "same-origin", cache: "no-store", signal: AbortSignal.timeout(5000) });
        if (!response.ok) return;
        const detail = await response.json();
        if (detail.recipientId !== data.recipientId || detail.callId !== data.callId) return;
        await fetch("/api/calls", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "end", id: data.callId, clientId: crypto.randomUUID() }), signal: AbortSignal.timeout(5000) });
      } catch { /* A stale or offline call cannot be declined remotely. */ }
    })());
    return;
  }
  event.waitUntil(openChatFromNotification(event.notification.data));
});
