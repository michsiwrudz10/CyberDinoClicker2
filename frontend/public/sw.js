const IMAGE_CACHE = "dinomeat-images-v1";
const IMAGE_PATH_HINTS = ["/dinos/", "/ui/", "/backgrounds/", "/assets/"];
const IMAGE_EXTENSIONS = /\.(?:png|jpg|jpeg|webp|gif|svg|avif)$/i;

function shouldCacheImage(requestUrl) {
  if (requestUrl.origin !== self.location.origin) {
    return false;
  }

  if (IMAGE_EXTENSIONS.test(requestUrl.pathname)) {
    return true;
  }

  return IMAGE_PATH_HINTS.some((hint) => requestUrl.pathname.includes(hint));
}

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const cacheNames = await caches.keys();
    await Promise.all(
      cacheNames
        .filter((cacheName) => cacheName !== IMAGE_CACHE)
        .map((cacheName) => caches.delete(cacheName))
    );
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") {
    return;
  }

  const requestUrl = new URL(event.request.url);
  if (!shouldCacheImage(requestUrl)) {
    return;
  }

  event.respondWith((async () => {
    const cache = await caches.open(IMAGE_CACHE);
    const cachedResponse = await cache.match(event.request, { ignoreSearch: true });
    if (cachedResponse) {
      return cachedResponse;
    }

    const networkResponse = await fetch(event.request);
    if (networkResponse && networkResponse.ok) {
      cache.put(event.request, networkResponse.clone()).catch(() => {});
    }
    return networkResponse;
  })());
});
