// 2026-10-03 11:52, StayGuide tablet service worker: keeps the paired tablet usable when Wi-Fi drops.
// Only handles the tablet's own requests; dashboard/admin traffic passes straight through.

// 2026-10-03 15:38, v3: shell now includes the shared theme.css
const VERSION = 'v3';
const SHELL_CACHE = `sg-shell-${VERSION}`;
const CONTENT_CACHE = `sg-content-${VERSION}`;
const IMAGE_CACHE = `sg-images-${VERSION}`;
const SHELL_URLS = ['/tablet', '/css/theme.css', '/css/tablet-app.css', '/manifest.json', '/icons/stayguide.svg'];
const NETWORK_TIMEOUT_MS = 5000;
const MAX_IMAGES = 150;

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(SHELL_CACHE)
      .then(cache => cache.addAll(SHELL_URLS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  const keep = [SHELL_CACHE, CONTENT_CACHE, IMAGE_CACHE];
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k.startsWith('sg-') && !keep.includes(k)).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return; // reports and pairing always go to the network

  const url = new URL(request.url);
  const sameOrigin = url.origin === self.location.origin;

  if (sameOrigin && url.pathname === '/device/content') {
    event.respondWith(contentNetworkFirst(request));
  } else if (sameOrigin && (url.pathname === '/tablet' || SHELL_URLS.includes(url.pathname))) {
    event.respondWith(shellNetworkFirst(request, url.pathname));
  } else if (sameOrigin && request.destination === 'image' && url.pathname.startsWith('/uploads/')) {
    // Only our own uploads: the worker inherits the page CSP (connect-src 'self'), so it must not fetch other origins
    event.respondWith(imageCacheFirst(request));
  }
});

function fetchWithTimeout(request) {
  return Promise.race([
    fetch(request),
    new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), NETWORK_TIMEOUT_MS))
  ]);
}

async function shellNetworkFirst(request, pathname) {
  const cache = await caches.open(SHELL_CACHE);
  try {
    const response = await fetchWithTimeout(request);
    if (response.ok) cache.put(pathname, response.clone());
    return response;
  } catch {
    return (await cache.match(pathname)) || Response.error();
  }
}

// Property content: always try the network; fall back to the last good copy, marked as offline.
async function contentNetworkFirst(request) {
  const cache = await caches.open(CONTENT_CACHE);
  try {
    const response = await fetchWithTimeout(request);
    if (response.ok) {
      const headers = new Headers(response.headers);
      headers.set('X-SG-Cached-At', new Date().toISOString());
      const body = await response.clone().arrayBuffer();
      await cache.put('/device/content', new Response(body, { status: 200, headers }));
    } else if (response.status === 401) {
      // Tablet was unpaired: never show the old property's details again
      await cache.delete('/device/content');
    }
    return response;
  } catch {
    const cached = await cache.match('/device/content');
    if (!cached) return Response.error();

    const headers = new Headers(cached.headers);
    headers.set('X-SG-Offline', '1');
    return new Response(await cached.arrayBuffer(), { status: 200, headers });
  }
}

async function imageCacheFirst(request) {
  const cache = await caches.open(IMAGE_CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response.ok) {
      await cache.put(request, response.clone());
      trimCache(cache, MAX_IMAGES);
    }
    return response;
  } catch {
    return Response.error();
  }
}

async function trimCache(cache, max) {
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - max; i++) await cache.delete(keys[i]);
}
