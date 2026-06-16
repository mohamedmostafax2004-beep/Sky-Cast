const CACHE = 'skycast-v8-network-first';
const STATIC_ASSETS = [
  '/style.css',
  '/sidebar.css',
  '/context-menu.css',
  '/chat-rules.js',
  '/map.js',
  '/master.js',
  '/api-client.js',
  '/app-enhancements.js',
  '/v2-features.js',
  '/manifest.json',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(STATIC_ASSETS.filter(Boolean))).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  // Never serve cached HTML pages. Auth state changes after login/logout/profile,
  // so pages like / must always come from the server.
  if (event.request.mode === 'navigate' || event.request.headers.get('accept')?.includes('text/html')) {
    event.respondWith(fetch(event.request).catch(() => caches.match(event.request)));
    return;
  }

  // API calls are always network-first. Only weather data may be used from cache when offline.
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(event.request)
        .then((res) => {
          if (res.ok && url.pathname.includes('/weather')) {
            caches.open(CACHE).then((c) => c.put(event.request, res.clone()));
          }
          return res;
        })
        .catch(() => (url.pathname.includes('/weather') ? caches.match(event.request) : undefined))
    );
    return;
  }

  // Map tiles can be cache-first for performance.
  if (url.hostname.includes('tile.') || url.hostname.includes('jawg.io') || url.hostname.includes('openstreetmap')) {
    event.respondWith(
      caches.open(CACHE).then(async (cache) => {
        const cached = await cache.match(event.request);
        const network = fetch(event.request).then((res) => {
          if (res.ok) cache.put(event.request, res.clone());
          return res;
        });
        return cached || network;
      })
    );
    return;
  }

  // Static files are network-first so old UI/auth scripts do not remain stuck.
  event.respondWith(
    fetch(event.request)
      .then((res) => {
        if (res.ok) caches.open(CACHE).then((c) => c.put(event.request, res.clone()));
        return res;
      })
      .catch(() => caches.match(event.request))
  );
});
