/* Adaptime service worker — kabuk önbelleği + arka plan bildirimleri. */
const CACHE = "adaptime-shell-v2";
const SHELL = ["/", "/index.html", "/manifest.webmanifest", "/favicon.svg"];
// Geliştirme modunda kayıt ?dev=1 ile yapılır: önbellek kullanılmaz, yalnızca push çalışır.
const DEV = new URL(self.location.href).searchParams.get("dev") === "1";

self.addEventListener("install", (event) => {
  if (DEV) {
    self.skipWaiting();
    return;
  }
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(SHELL))
      .catch(() => undefined)
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  // Geliştirme modunda ağ her zaman kazanır.
  if (DEV) return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  // API çağrılarını önbelleğe alma; çevrimdışıyken uygulama kendi durumunu kullanır.
  if (url.pathname.startsWith("/api/")) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(() =>
        caches.match("/index.html").then((hit) => hit || Response.error()),
      ),
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((hit) => {
      if (hit) return hit;
      return fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => hit || Response.error());
    }),
  );
});

/* ---------- Arka plan bildirimleri (Web Push) ---------- */

self.addEventListener("push", (event) => {
  let payload = {
    title: "Adaptime",
    body: "Yeni bir hatırlatma var.",
    url: "/",
    tag: "adaptime",
  };

  try {
    if (event.data) payload = { ...payload, ...event.data.json() };
  } catch {
    if (event.data) payload.body = event.data.text();
  }

  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      tag: payload.tag,
      icon: "/favicon.svg",
      badge: "/favicon.svg",
      data: { url: payload.url || "/" },
      vibrate: [80, 40, 80],
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || "/";

  event.waitUntil(
    clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((list) => {
        for (const client of list) {
          if ("focus" in client) {
            client.focus();
            if ("navigate" in client) client.navigate(target);
            return undefined;
          }
        }
        return clients.openWindow(target);
      }),
  );
});
