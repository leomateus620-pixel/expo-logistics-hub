// Service Worker — Fenasoja Logística
// Strategy: never precache the HTML shell. Hashed assets are immutable (cache-first).
// Navigations are network-first with a short timeout; cache is only used if truly offline.
const CACHE_VERSION = '4';
const CACHE_NAME = `fenasoja-v${CACHE_VERSION}`;
const STATIC_ASSETS = [
  '/favicon.ico',
  '/placeholder.svg',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS).catch(() => {}))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING' || event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

function networkWithTimeout(request, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), ms);
    fetch(request)
      .then((res) => { clearTimeout(timer); resolve(res); })
      .catch((err) => { clearTimeout(timer); reject(err); });
  });
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  let url;
  try { url = new URL(req.url); } catch { return; }

  // Never intercept Supabase / cross-origin APIs
  if (url.hostname.includes('supabase')) return;
  if (url.origin !== self.location.origin) return;

  // Navigation: network-first with 3s timeout, no HTML cache fallback
  if (req.mode === 'navigate') {
    event.respondWith(
      networkWithTimeout(req, 3000)
        .catch(() => caches.match('/index.html').then((c) => c || new Response(
          '<!doctype html><meta charset="utf-8"><title>Offline</title><body style="font-family:system-ui;padding:2rem;text-align:center"><h1>Sem conexão</h1><p>Reconecte para acessar o sistema.</p></body>',
          { headers: { 'content-type': 'text/html; charset=utf-8' }, status: 503 }
        )))
    );
    return;
  }

  // Hashed Vite assets — immutable, cache-first
  if (/\/assets\/.*-[a-f0-9]{8,}\.(js|css|png|jpg|jpeg|webp|svg|woff2?)$/.test(url.pathname)) {
    event.respondWith(
      caches.match(req).then((cached) => {
        if (cached) return cached;
        return fetch(req).then((res) => {
          if (res && res.ok) {
            const clone = res.clone();
            caches.open(CACHE_NAME).then((c) => c.put(req, clone));
          }
          return res;
        });
      })
    );
    return;
  }

  // Other static assets — network-first with cache fallback
  if (/\.(js|css|png|jpg|jpeg|webp|svg|ico|woff2?)$/.test(url.pathname)) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res && res.ok) {
            const clone = res.clone();
            caches.open(CACHE_NAME).then((c) => c.put(req, clone));
          }
          return res;
        })
        .catch(() => caches.match(req))
    );
  }
});

// ---- Notificações no celular (FCM) ----
self.addEventListener('push', (event) => {
  let payload = {};
  try { payload = event.data ? event.data.json() : {}; } catch { payload = {}; }
  const notification = payload.notification || {};
  const data = payload.data || {};
  const title = notification.title || 'Fenasoja';
  event.waitUntil(
    self.registration.showNotification(title, {
      body: notification.body || '',
      icon: notification.icon || '/favicon.ico',
      badge: '/favicon.ico',
      tag: data.eventId || undefined,
      data: { path: data.path || '/' },
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const path = (event.notification.data && event.notification.data.path) || '/';
  const target = new URL(path, self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if (client.url === target && 'focus' in client) return client.focus();
      }
      return self.clients.openWindow ? self.clients.openWindow(target) : undefined;
    })
  );
});
