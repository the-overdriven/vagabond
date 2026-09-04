const CACHE_VERSION = 'vagabond-v1';
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

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(PRECACHE).then((cache) =>
      // Cache items individually so one missing/renamed file doesn't fail
      // the whole install step.
      Promise.all(
        PRECACHE_URLS.map((url) =>
          cache.add(url).catch((err) => console.warn('Precache skip:', url, err))
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
          .filter((key) => key !== PRECACHE && key !== RUNTIME)
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

  // Page navigations: try the network first (so updates show up), fall
  // back to the cached shell when offline.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).catch(() => caches.match('./index.html'))
    );
    return;
  }

  // Content JSON (game data that changes during development, like
  // artifact_effects.json): network-first, so edits show up immediately.
  // Falls back to the cached copy only when offline.
  if (url.pathname.includes('/content/')) {
    event.respondWith(
      fetch(req).then((res) => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(RUNTIME).then((cache) => cache.put(req, copy));
        }
        return res;
      }).catch(() => caches.match(req))
    );
    return;
  }

  // Everything else (avatars/enemies/npc images, CSS-in-page assets):
  // cache-first, then fetch and stash a copy for next time.
  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req).then((res) => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(RUNTIME).then((cache) => cache.put(req, copy));
        }
        return res;
      }).catch(() => cached);
    })
  );
});
