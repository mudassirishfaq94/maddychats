self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data?.json() || {};
  } catch {
    payload = { body: event.data?.text() || "You have a new message." };
  }
  event.waitUntil(self.registration.showNotification(payload.title || "ZipTalk", {
    body: payload.body || "You have a new message.",
    icon: "/icons/ziptalk-192.png",
    badge: "/icons/ziptalk-192.png",
    tag: payload.tag || "ziptalk-message",
    data: { url: payload.url || "/app/chats" },
    vibrate: [180, 80, 180],
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = event.notification.data?.url || "/app/chats";
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const client of windows) {
      if ("focus" in client) {
        await client.navigate(target);
        return client.focus();
      }
    }
    return self.clients.openWindow(target);
  })());
});
