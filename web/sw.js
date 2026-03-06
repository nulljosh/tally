const STATIC_CACHE = 'tally-static-v2';
const API_CACHE = 'tally-api-v2';

const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/landing.html',
  '/login.html',
  '/unified.html',
  '/dashboard.html',
  '/benefits.html',
  '/school.html',
  '/dca.html',
  '/screen.html',
  '/manifest.json',
  '/design-tokens.css',
  '/css/styles.css',
  '/icon-192.svg',
  '/icon-512.svg'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== STATIC_CACHE && key !== API_CACHE)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

function isStaticAssetRequest(url, request) {
  if (request.method !== 'GET') return false;
  if (url.origin !== self.location.origin) return false;
  if (url.pathname.startsWith('/api/')) return false;
  if (url.pathname === '/' || url.pathname === '/app') return true;

  return /\.(html|css|js|svg|png|jpg|jpeg|webp|ico|json)$/i.test(url.pathname);
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  const response = await fetch(request);
  if (response && response.ok) {
    const cache = await caches.open(STATIC_CACHE);
    cache.put(request, response.clone());
  }
  return response;
}

async function networkFirstApi(request) {
  const apiCache = await caches.open(API_CACHE);
  try {
    const response = await fetch(request);
    if (response && response.ok) {
      apiCache.put(request, response.clone());
    }
    return response;
  } catch (_) {
    const cached = await apiCache.match(request);
    if (cached) return cached;

    return new Response(
      JSON.stringify({
        error: 'Offline — showing cached data',
        offline: true
      }),
      {
        status: 503,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-store'
        }
      }
    );
  }
}

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  if (url.origin !== self.location.origin) return;

  if (url.pathname.startsWith('/api/')) {
    event.respondWith(networkFirstApi(event.request));
    return;
  }

  if (isStaticAssetRequest(url, event.request)) {
    event.respondWith(cacheFirst(event.request));
  }
});
