// ---------------------------------------------------------------------------
// HOW TO SHIP AN UPDATE
//   1. Deploy your new files (images, JSON, index.html ...).
//   2. Bump CACHE_VERSION below and deploy sw.js as well.
//
// The phone notices that sw.js changed, installs the new worker, deletes every
// old cache and re-downloads everything fresh. Even if you forget step 2,
// images are re-checked against the server on every use (see the image
// handler at the bottom), so they catch up on the next launch.
// ---------------------------------------------------------------------------
const CACHE_PREFIX = 'vagabond-';
const CACHE_VERSION = CACHE_PREFIX + 'v4'; // <-- bump me on every content/image release
const PRECACHE = CACHE_VERSION + '-precache';
const RUNTIME = CACHE_VERSION + '-runtime';

// Core shell + the fixed set of content files the game always loads on boot
// (see loadContent() in index.html). Avatar/enemy/npc images are NOT known
// ahead of time (their filenames come from the JSON), so those are cached
// at runtime instead, below.
const PRECACHE_URLS = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './icon-512-maskable.png',
  './content/gear_weapons.json',
  './content/gear_shields.json',
  './content/gear_armors.json',
  './content/item_modifiers.json',
  './content/enemy_templates.json',
  './content/enemy_default_biomes.json',
  './content/enemy_prefixes.json'
];

// Ask the server every time (cheap conditional request, 304 if unchanged)
// instead of letting the phone's own HTTP cache hand back a stale file.
// Without this, a freshly bumped service worker could re-download the OLD
// images straight out of the HTTP cache.
const fresh = (req) => fetch(req, { cache: 'no-cache' });

// Write to a cache without racing the worker being shut down.
const stash = (event, cacheName, key, res) =>
  event.waitUntil(caches.open(cacheName).then((cache) => cache.put(key, res)));

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(PRECACHE).then((cache) =>
      // Cache items individually so one missing/renamed file doesn't fail
      // the whole install step. `reload` skips the HTTP cache so the new
      // version never precaches stale copies.
      Promise.all(
        PRECACHE_URLS.map((url) =>
          cache.add(new Request(url, { cache: 'reload' }))
            .catch((err) => console.warn('Precache skip:', url, err))
        )
      )
    ).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          // Only touch our own caches, and drop every previous version
          // (this is what wipes the old images).
          .filter((key) => key.startsWith(CACHE_PREFIX) && key !== PRECACHE && key !== RUNTIME)
          .map((key) => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Page navigations: network first (so updates show up), fall back to the
  // cached shell when offline. Every successful load refreshes the offline
  // copy, so the fallback is never older than the last time you were online.
  if (req.mode === 'navigate') {
    event.respondWith(
      fresh(req).then((res) => {
        if (res && res.ok) stash(event, PRECACHE, './index.html', res.clone());
        return res;
      }).catch(() => caches.match('./index.html'))
    );
    return;
  }

  // Content JSON (game data that changes during development, like
  // artifact_effects.json): network-first, so edits show up immediately.
  // Falls back to the cached copy only when offline.
  if (url.pathname.includes('/content/')) {
    event.respondWith(
      fresh(req).then((res) => {
        if (res && res.ok) stash(event, RUNTIME, req, res.clone());
        return res;
      }).catch(() => caches.match(req))
    );
    return;
  }

  // Everything else (avatars/enemies/npc images, icons): stale-while-revalidate.
  // Serve the cached copy instantly (fast + works offline), but ALWAYS
  // re-check the server in the background and overwrite the cache if the file
  // changed. Old cache-first behaviour never looked at the server again,
  // which is why updated images never showed up.
  event.respondWith(
    caches.open(RUNTIME).then(async (cache) => {
      const cached = await cache.match(req);

      const refresh = fresh(req).then((res) => {
        if (res && res.ok) cache.put(req, res.clone());
        return res;
      }).catch(() => null);

      if (cached) {
        event.waitUntil(refresh); // keep the worker alive until the refresh lands
        return cached;
      }
      return (await refresh) || Response.error();
    })
  );
});
