// ============================================================
// EGGlogU Service Worker v2.0 — Network-First, Offline Support
// ============================================================
// Strategy: ALWAYS fetch from network first.
// Cache is ONLY used when offline (no connection).
// This ensures users ALWAYS get the latest version.
// ============================================================

const CACHE_NAME = 'egglogu-v2';

// CDN assets — versioned URLs, safe to cache long-term
const CDN_ASSETS = [
  'https://cdn.jsdelivr.net/npm/chart.js@4.4.7',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
  'https://unpkg.com/mqtt@5.14.1/dist/mqtt.min.js',
  'https://unpkg.com/simple-statistics@7.8.8/dist/simple-statistics.min.js'
];

// Install: cache CDN assets for offline, activate immediately
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(CDN_ASSETS))
      .then(() => self.skipWaiting())
  );
});

// Activate: purge ALL old caches, take control immediately
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Handle skipWaiting message from client
self.addEventListener('message', event => {
  if (event.data === 'skipWaiting') self.skipWaiting();
});

// Fetch: network-first for everything
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Never intercept API calls, auth, or external services
  if (url.hostname !== self.location.hostname &&
      !CDN_ASSETS.some(a => event.request.url.includes(new URL(a).hostname))) {
    return;
  }

  // CDN assets: cache-first (they're versioned, immutable)
  if (CDN_ASSETS.some(a => event.request.url.includes(new URL(a).hostname))) {
    event.respondWith(
      caches.match(event.request).then(cached =>
        cached || fetch(event.request).then(resp => {
          const clone = resp.clone();
          caches.open(CACHE_NAME).then(c => c.put(event.request, clone));
          return resp;
        })
      )
    );
    return;
  }

  // Local assets: NETWORK-FIRST — always get latest, cache for offline
  event.respondWith(
    fetch(event.request).then(resp => {
      // Only cache successful GET responses
      if (resp.ok && event.request.method === 'GET') {
        const clone = resp.clone();
        caches.open(CACHE_NAME).then(c => c.put(event.request, clone));
      }
      return resp;
    }).catch(() =>
      // Offline: try cache, then offline page
      caches.match(event.request).then(cached =>
        cached || (event.request.mode === 'navigate'
          ? caches.match('./offline.html')
          : new Response('', { status: 503 }))
      )
    )
  );
});
