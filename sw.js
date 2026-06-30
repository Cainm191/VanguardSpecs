/* sw.js — Vanguard Specs service worker
 * Strategy:
 *   APP SHELL (html/css/js/icons) -> cache-first, falling back to network
 *   PRODUCT DATA (Shopify JSON)   -> network-first, falling back to cache
 */

const CACHE_VERSION = 'v1';
const SHELL_CACHE = `vanguard-shell-${CACHE_VERSION}`;
const DATA_CACHE = `vanguard-data-${CACHE_VERSION}`;

const SHOPIFY_FEED_HOST = 'unlimitedairsoftshop.co.nz';

const APP_SHELL_FILES = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './parser.js',
  './storage.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-192.png',
  './icons/icon-maskable-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE)
      .then((cache) => cache.addAll(APP_SHELL_FILES))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== SHELL_CACHE && key !== DATA_CACHE)
          .map((key) => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // PRODUCT DATA: network-first with cache fallback
  if (url.hostname.includes(SHOPIFY_FEED_HOST)) {
    event.respondWith(networkFirst(request));
    return;
  }

  // APP SHELL (same-origin): cache-first with network fallback
  if (url.origin === self.location.origin) {
    event.respondWith(cacheFirst(request));
    return;
  }

  // Everything else (e.g. product images from Shopify CDN): try cache, then network, cache the result
  event.respondWith(staleWhileRevalidate(request));
});

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response && response.ok) {
      const cache = await caches.open(SHELL_CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch (err) {
    // Offline and not cached — for navigations, fall back to the shell index
    if (request.mode === 'navigate') {
      const fallback = await caches.match('./index.html');
      if (fallback) return fallback;
    }
    throw err;
  }
}

async function networkFirst(request) {
  const cache = await caches.open(DATA_CACHE);
  try {
    const response = await fetch(request, { cache: 'no-store' });
    if (response && response.ok) {
      cache.put(request, response.clone());
    }
    return response;
  } catch (err) {
    const cached = await cache.match(request);
    if (cached) return cached;
    throw err;
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(DATA_CACHE);
  const cached = await cache.match(request);
  const networkPromise = fetch(request)
    .then((response) => {
      if (response && response.ok) cache.put(request, response.clone());
      return response;
    })
    .catch(() => undefined);

  return cached || networkPromise || fetch(request);
}

/* Allow the page to trigger cache cleanup / forced update if needed */
self.addEventListener('message', (event) => {
  if (event.data === 'skipWaiting') self.skipWaiting();
});
