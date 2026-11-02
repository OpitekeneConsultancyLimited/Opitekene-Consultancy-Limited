const CACHE_NAME = "taxcomp-app-v20";
const APP_SHELL = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./app-install.js",
  "./tax-advisory.js",
  "./tax-rules.js",
  "./tax-calculator.js",
  "./multi-tax-analysis.js",
  "./tax-chat.js",
  "./international-tax.js",
  "./audit-health.js",
  "./manifest.webmanifest",
  "./icons/taxcomp-180.png",
  "./icons/taxcomp-192.png",
  "./icons/taxcomp-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys
          .filter((key) => key.startsWith("taxcomp-app-") && key !== CACHE_NAME)
          .map((key) => caches.delete(key)),
      ))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const requestUrl = new URL(request.url);
  if (requestUrl.origin !== self.location.origin) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cachedResponse = await cache.match(request, { ignoreSearch: true });
    const refreshFromNetwork = request.mode === "navigate" ||
      request.destination === "script";
    if (cachedResponse && !refreshFromNetwork) return cachedResponse;

    try {
      const response = await fetch(request);
      if (response.ok && response.type === "basic") {
        await cache.put(request, response.clone());
      }
      if (!response.ok && cachedResponse) return cachedResponse;
      return response;
    } catch (error) {
      if (cachedResponse) return cachedResponse;
      if (request.mode === "navigate") {
        const offlinePage = await cache.match("./index.html");
        if (offlinePage) return offlinePage;
      }
      throw error;
    }
  })());
});
