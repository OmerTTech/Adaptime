/* Adaptime service worker — kabuk önbelleği + arka plan bildirimleri. */
const CACHE = "adaptime-shell-v4";
// API yanıtları ayrı önbellekte: app shell güncellenirken silinmesin.
const API_CACHE = "adaptime-api-v1";
const SHELL = ["/", "/index.html", "/manifest.webmanifest", "/favicon.svg"];
// Bu uçlar önbelleğe alınmaz (oturum, abonelik, cron).
const API_NO_CACHE = ["/api/auth/", "/api/push/", "/api/cron/"];
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
          keys
            .filter((key) => key !== CACHE && key !== API_CACHE)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

/** Aynı URL'i farklı oturumlar için ayrı önbellekler: token'ın kısa hash'i. */
async function apiCacheKey(request) {
  const auth = request.headers.get("authorization") || "anon";
  let hash = 5381;
  for (let i = 0; i < auth.length; i += 1) {
    hash = (hash * 33) ^ auth.charCodeAt(i);
  }
  const url = new URL(request.url);
  url.searchParams.set("__u", String(hash >>> 0));
  return new Request(url.toString(), { method: "GET" });
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  // Geliştirme modunda ağ her zaman kazanır.
  if (DEV) return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // API: önce ağ, olmazsa son başarılı yanıt (network-first + cache-fallback).
  // Önbellek anahtarı token'a göre ayrılır; aynı tarayıcıda hesap değişince
  // yeni kullanıcı eski kullanıcının verisini görmez.
  if (url.pathname.startsWith("/api/")) {
    if (API_NO_CACHE.some((prefix) => url.pathname.startsWith(prefix))) return;
    event.respondWith(
      (async () => {
        try {
          const response = await fetch(request);
          if (response.ok) {
            const cache = await caches.open(API_CACHE);
            cache.put(await apiCacheKey(request), response.clone());
          }
          return response;
        } catch {
          const cached = await caches.match(await apiCacheKey(request));
          if (cached) return cached;
          return new Response(
            JSON.stringify({ error: "Çevrimdışı", offline: true }),
            {
              status: 503,
              headers: { "Content-Type": "application/json" },
            },
          );
        }
      })(),
    );
    return;
  }

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
    actions: [],
    actionUrls: {},
  };

  try {
    if (event.data) payload = { ...payload, ...event.data.json() };
  } catch {
    if (event.data) payload.body = event.data.text();
  }

  const actions = Array.isArray(payload.actions)
    ? payload.actions.slice(0, 2)
    : [];

  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      tag: payload.tag,
      icon: "/favicon.svg",
      badge: "/favicon.svg",
      // Düğme hedefleri click olayında kullanılır (tamamla / 10 dk daha).
      data: {
        url: payload.url || "/",
        actionUrls: payload.actionUrls || {},
      },
      ...(actions.length > 0 ? { actions } : {}),
      vibrate: [80, 40, 80],
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const data = event.notification.data || {};
  const actionUrls = data.actionUrls || {};
  // Düğmeye basıldıysa onun hedefi, yoksa bildirimin kendi adresi açılır.
  const target =
    (event.action && actionUrls[event.action]) || data.url || "/";

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
