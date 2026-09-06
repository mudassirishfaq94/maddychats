const CACHE_NAME = "maddychats-v1";

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(clients.claim());
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

/**
 * Web Push handler. Without this the browser drops every incoming push
 * silently — notifications never appear on desktop or Android, and Android
 * shows no heads-up banner because no Notification is ever constructed.
 *
 * Payload (from /api web-push sender):
 *   { title, body, url, tag }
 */
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : "" };
  }

  const title = data.title || "New message";
  const options = {
    body: data.body || "",
    tag: data.tag || "message",
    // Reuse the app icon; badge is the monochrome Android status-bar glyph.
    icon: data.icon || "/icons/ziptalk-192.png",
    badge: "/icons/ziptalk-192.png",
    data: { url: data.url || "/app" },
    // Android: replace rather than stack per message; keep it after tap.
    renotify: Boolean(data.tag),
    requireInteraction: false,
    vibrate: [100, 50, 100],
  };

  event.waitUntil(
    self.registration.showNotification(title, options),
  );
});

/** Tapping the notification focuses an existing window or opens a new one. */
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || "/app";
  const full = new URL(target, self.location.origin).href;

  event.waitUntil(
    (async () => {
      const clientList = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of clientList) {
        if (client.url.startsWith(self.location.origin) && "focus" in client) {
          await client.focus();
          if ("navigate" in client) {
            try {
              await client.navigate(full);
            } catch {
              // Older browsers: focus alone is fine.
            }
          }
          return;
        }
      }
      await self.clients.openWindow(full);
    })(),
  );
});
