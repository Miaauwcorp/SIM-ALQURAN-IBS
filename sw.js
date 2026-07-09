const APP_VERSION = "20260710-v20";
const CACHE_NAME = "sim-murojaah-ibs-" + APP_VERSION;

const APP_SHELL = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./app.js",
  "./icon-192-v11.png",
  "./icon-512-v11.png",
  "./Download/",
  "./Download/index.html"
];

function isSameOrigin(request) {
  try {
    return new URL(request.url).origin === self.location.origin;
  } catch (err) {
    return false;
  }
}

function isCriticalAsset(url) {
  return (
    url.pathname.endsWith("/index.html") ||
    url.pathname.endsWith("/manifest.webmanifest") ||
    url.pathname.endsWith("/app.js") ||
    url.pathname.endsWith("/icon-192-v11.png") ||
    url.pathname.endsWith("/icon-512-v11.png")
  );
}

async function networkFirst(request, fallbackUrl) {
  try {
    const response = await fetch(request, { cache: "no-store" });

    if (response && response.ok && isSameOrigin(request)) {
      const cache = await caches.open(CACHE_NAME);
      await cache.put(request, response.clone());
    }

    return response;
  } catch (err) {
    const cached = await caches.match(request);
    if (cached) return cached;

    if (fallbackUrl) {
      const fallback = await caches.match(fallbackUrl);
      if (fallback) return fallback;
    }

    return Response.error();
  }
}

async function staleWhileRevalidate(request) {
  const cached = await caches.match(request);

  const fetchPromise = fetch(request)
    .then(async function (response) {
      if (response && response.ok && isSameOrigin(request)) {
        const cache = await caches.open(CACHE_NAME);
        await cache.put(request, response.clone());
      }

      return response;
    })
    .catch(function () {
      return cached || Response.error();
    });

  return cached || fetchPromise;
}

self.addEventListener("install", function (event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function (cache) {
      return cache.addAll(
        APP_SHELL.map(function (url) {
          return new Request(url, { cache: "reload" });
        })
      );
    })
  );

  self.skipWaiting();
});

self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches.keys()
      .then(function (keys) {
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
      .then(function () {
        return self.clients.claim();
      })
      .then(function () {
        return self.clients.matchAll({
          type: "window",
          includeUncontrolled: true
        });
      })
      .then(function (clientList) {
        clientList.forEach(function (client) {
          client.postMessage({
            type: "SIM_SW_ACTIVATED",
            version: APP_VERSION
          });
        });
      })
  );
});

self.addEventListener("message", function (event) {
  const data = event.data || {};

  if (data.type === "SIM_SKIP_WAITING") {
    self.skipWaiting();
  }
});

self.addEventListener("fetch", function (event) {
  const request = event.request;

  if (request.method !== "GET") return;

  const url = new URL(request.url);

  if (!isSameOrigin(request)) {
    return;
  }

  if (url.pathname.endsWith("/sw.js")) {
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(networkFirst(request, "./index.html"));
    return;
  }

  if (isCriticalAsset(url)) {
    event.respondWith(networkFirst(request));
    return;
  }

  event.respondWith(staleWhileRevalidate(request));
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
    "./icon-192-v11.png";

  const badge =
    data.badge ||
    "./icon-192-v11.png";

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

  const targetUrl =
    event.notification && event.notification.data && event.notification.data.url
      ? event.notification.data.url
      : "./";

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
