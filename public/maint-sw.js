// 2026-10-08 05:50, G7 Ops stage 5: worker app service worker (scope /maint).
// - App shell: network first, cached copy when offline.
// - Job data (GET /maint/api/me, /jobs, /jobs/:id): network first, last good copy when offline (marked X-SG-Offline).
// - Never cached: anything that is not a GET, the access-code endpoint (POST anyway), photos (signed, short-lived URLs).
// - Web push: shows the notification; tapping it opens the job.
// Updates made offline are queued by the page (public/js/maint-offline.js), not here.
const VERSION = 'm1';
const SHELL = `sgm-shell-${VERSION}`;
const DATA = `sgm-data-${VERSION}`;
const SHELL_URLS = ['/maint', '/css/theme.css', '/css/maint.css', '/js/theme.js', '/js/maint-offline.js', '/maint-manifest.json', '/icons/stayguide.svg'];
const TIMEOUT_MS = 6000;

self.addEventListener('install', event => {
  event.waitUntil(caches.open(SHELL).then(c => c.addAll(SHELL_URLS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k.startsWith('sgm-') && k !== SHELL && k !== DATA).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// The page asks to wipe cached job data on sign-in and sign-out, so one worker never sees another's jobs offline
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'clear-data') event.waitUntil(caches.delete(DATA));
});

const timed = request => Promise.race([fetch(request), new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), TIMEOUT_MS))]);

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname === '/maint/api/me' || url.pathname === '/maint/api/jobs' || /^\/maint\/api\/jobs\/\d+$/.test(url.pathname)) {
    event.respondWith(dataNetworkFirst(request, url));
  } else if (url.pathname === '/maint' || SHELL_URLS.includes(url.pathname)) {
    event.respondWith(shellNetworkFirst(request, url.pathname));
  }
});

async function shellNetworkFirst(request, key) {
  const cache = await caches.open(SHELL);
  try {
    const response = await timed(request);
    if (response.ok) cache.put(key, response.clone());
    return response;
  } catch {
    return (await cache.match(key)) || Response.error();
  }
}

async function dataNetworkFirst(request, url) {
  const cache = await caches.open(DATA);
  const key = url.pathname; // the bearer token is not part of the key; the page clears this cache when the user changes
  try {
    const response = await timed(request);
    if (response.ok) {
      const headers = new Headers(response.headers);
      headers.set('X-SG-Cached-At', new Date().toISOString());
      await cache.put(key, new Response(await response.clone().arrayBuffer(), { status: 200, headers }));
    } else if (response.status === 401 || response.status === 403 || response.status === 404) {
      await cache.delete(key);
    }
    return response;
  } catch {
    const cached = await cache.match(key);
    if (!cached) return new Response(JSON.stringify({ error: 'You are offline and this has not been saved on the phone yet.' }), { status: 503, headers: { 'Content-Type': 'application/json', 'X-SG-Offline': '1' } });
    const headers = new Headers(cached.headers);
    headers.set('X-SG-Offline', '1');
    return new Response(await cached.arrayBuffer(), { status: 200, headers });
  }
}

self.addEventListener('push', event => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch {}
  const url = typeof data.url === 'string' && data.url.startsWith('/maint') ? data.url : '/maint';
  event.waitUntil(self.registration.showNotification(data.title || 'StayGuide', {
    body: data.body || '', tag: data.tag || url, data: { url }, icon: '/icons/stayguide.svg', badge: '/icons/stayguide.svg'
  }));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/maint';
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const open = all.find(c => new URL(c.url).pathname.startsWith('/maint'));
    if (open) { await open.navigate(url).catch(() => {}); return open.focus(); }
    return self.clients.openWindow(url);
  })());
});
