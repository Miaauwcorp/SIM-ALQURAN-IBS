const CACHE_NAME = "sim-presensi-ibs-v10-fcm";

const APP_SHELL = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./icon-192.png",
  "./icon-512.png",
  "./Download/",
  "./Download/index.html"
];

self.addEventListener("install", function (event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function (cache) {
      return cache.addAll(APP_SHELL);
    })
  );

  self.skipWaiting();
});

self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(
        keys
          .filter(function (key) {
            return key !== CACHE_NAME;
          })
          .map(function (key) {
            return caches.delete(key);
          })
      );
    })
  );

  self.clients.claim();
});

self.addEventListener("fetch", function (event) {
  const request = event.request;

  if (request.method !== "GET") return;

  event.respondWith(
    caches.match(request).then(function (cached) {
      return cached || fetch(request).catch(function () {
        if (request.mode === "navigate") {
          return caches.match("./index.html");
        }

        return Response.error();
      });
    })
  );
});

/* =========================
   FCM BACKGROUND PUSH
========================= */

function safeJsonFromPush(event) {
  try {
    if (!event.data) return {};
    return event.data.json();
  } catch (err) {
    return {};
  }
}

self.addEventListener("push", function (event) {
  const payload = safeJsonFromPush(event);

  const data = payload.data || {};
  const notification = payload.notification || {};

  const title =
    notification.title ||
    data.title ||
    "SIM Murojaah IBS";

  const body =
    notification.body ||
    data.body ||
    "Ada notifikasi baru.";

  const url =
    data.url ||
    data.link ||
    "./";

  const icon =
    data.icon ||
    "./icon-192.png";

  const badge =
    data.badge ||
    "./icon-192.png";

  const options = {
    body,
    icon,
    badge,
    data: {
      url
    },
    tag: data.tag || "sim-murojaah-notification",
    renotify: true,
    requireInteraction: data.requireInteraction === "true"
  };

  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

self.addEventListener("notificationclick", function (event) {
  event.notification.close();

  const targetUrl = event.notification?.data?.url || "./";

  event.waitUntil(
    clients.matchAll({
      type: "window",
      includeUncontrolled: true
    }).then(function (clientList) {
      for (const client of clientList) {
        if ("focus" in client) {
          client.focus();
          client.postMessage({
            type: "SIM_NOTIFICATION_CLICK",
            url: targetUrl
          });
          return;
        }
      }

      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});
