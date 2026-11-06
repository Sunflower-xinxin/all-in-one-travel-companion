const CACHE_NAME = "luxia-travel-master-v7";
const APP_SHELL = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./styles.css?v=20261104-4",
  "./ledger.css?v=20261104-2",
  "./apple-polish.css?v=20261105-8",
  "./template-shell.css?v=20261106-3",
  "./product-modules.css?v=20261106-1",
  "./product-platform.css?v=20261106-2",
  "./template-manager.js?v=20261106-4",
  "./platform-services.js?v=20261106-2",
  "./outfit-weather.js?v=20261106-1",
  "./runtime-storage.js?v=20260910-2",
  "./overview-map.js?v=20260910-2",
  "./route-ui.js?v=20260910-2",
  "./rental-manager.js?v=20261106-1",
  "./reservations.js?v=20261106-2",
  "./app.js?v=20261106-1",
  "./trip-editor.js?v=20261105-3",
  "./outfit.js?v=20261106-1",
  "./ticket-pdf-preview.js?v=20260910-2",
  "./ledger.js?v=20261104-3",
  "./apple-date-picker.js?v=20261105-1",
  "./site-navigation.js?v=20261106-1",
  "./apple-polish.js?v=20261104-1",
  "./pwa-register.js?v=20261105-1",
  "./assets/icons/apple-touch-icon.png",
  "./assets/icons/app-icon-192.png",
  "./assets/icons/app-icon-512.png",
  "./assets/maps/templates/template-07-compact-basin.svg"
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(
    keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
  )));
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  if (event.request.mode === "navigate") {
    event.respondWith(fetch(event.request)
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put("./index.html", copy));
        return response;
      })
      .catch(() => caches.match("./index.html")));
    return;
  }

  event.respondWith(fetch(event.request).then((response) => {
    const copy = response.clone();
    caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
    return response;
  }).catch(() => caches.match(event.request)));
});
