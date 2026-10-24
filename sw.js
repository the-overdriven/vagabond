// ---------------------------------------------------------------------------
// HOW TO SHIP AN UPDATE
//   1. Deploy your new files (images, JSON, index.html ...).
//   2. Bump VAGABOND_GAME_VERSION in src/version.js and deploy it too.
//
// The phone notices that sw.js or its imported version.js changed, installs
// the new worker, deletes every old cache and re-downloads everything fresh.
// Even if you forget step 2,
// images are re-checked against the server on every use (see the image
// handler at the bottom), so they catch up on the next launch.
// ---------------------------------------------------------------------------
importScripts('./src/version.js');
const CACHE_PREFIX = 'vagabond-';
// Refresh patched game scripts without changing the displayed game version.
const CACHE_VERSION = CACHE_PREFIX + self.VAGABOND_GAME_VERSION + '';
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
  './src/worldGen.js',
  './src/tower.js',
  './img/tiles/tower-entrance.png',
  './img/tiles/tower-window.png',
  './img/tiles/tower-battlement.png',
  './img/tiles/tower-battlement-corner.png',
  './src/dwarvenMines.js',
  './src/mining.js',
  './src/caveSilhouettes.js',
  './src/dungeonTraps.js',
  './src/dungeonHazards.js',
  './src/charge.js',
  './src/enemySupport.js',
  './src/enemyDefenses.js',
  './src/enemyTelegraphs.js',
  './src/collectiveMind.js',
  './src/enemySpells.js',
  './src/enemyInvisibility.js',
  './src/spiderWeb.js',
  './src/swimming.js',
  './src/ice.js',
  './img/tiles/ice.png',
  './img/tiles/cracking-ice-overlay.svg',
  './img/tiles/dwarven-gas-valve.png',
  './img/tiles/dwarven-gas-vent.png',
  './src/npcFisherman.js',
  './src/fov.js',
  './src/replay.js',
  './src/saveLoad.js',
  './src/tracking.js',
  './src/version.js',
  './src/supabase.js',
  './src/graveyard.js',
  './src/highscores.js',
  './src/consumables.js',
  './css/style.css?v=20261008-2',
  './content/starting_weapons.json',
  './content/gear_weapons.json',
  './content/gear_shields.json',
  './content/gear_armors.json',
  './content/item_modifiers.json',
  './content/enemy_templates.json',
  './content/enemy_config.json',
  './content/enemy_default_biomes.json',
  './content/enemy_prefixes.json',
  './content/world_generation.json',
  './content/mining_config.json',
  './content/cave_silhouettes.json',
  './content/world_traits.json',
  './content/tiles.json',
  './content/rendering.json',
  './content/items.json',
  './img/tiles/dwarven-key.png',
  './img/tiles/pickaxe.png',
  './img/tiles/haulage-cage.png',
  './img/tiles/haulage-cage-upper.png',
  './img/tiles/haulage-cage-lower.png',
  './img/tiles/mine-shaft-rope.svg',
  './img/tiles/rupture-warning.png',
  './img/ui/race-landscape-1.webp',
  './img/ui/race-landscape-2.webp',
  './img/ui/race-landscape-3.webp',
  './img/ui/race-landscape-4.webp',
  './img/tiles/burrow-warning.png',
  './img/tiles/wall-ambush-warning.png',
  './img/tiles/dwarven-gate-open.png',
  './img/tiles/dwarven-lever-pulled.png',
  './img/tiles/dwarven-bed.png',
  './img/tiles/dwarven-bed-barricade.png',
  './img/tiles/dwarven-bookshelf.png',
  './img/tiles/dwarven-table.png',
  './img/tiles/dwarven-crate.png',
  './img/tiles/dwarven-crate-pieces.png',
  './img/tiles/dwarven-prison-bars.png',
  './img/tiles/dwarven-throne-north.png',
  './img/tiles/dwarven-throne-east.png',
  './img/tiles/dwarven-throne-south.png',
  './img/tiles/dwarven-throne-west.png',
  './img/tiles/dwarven-dais.png',
  './img/tiles/dwarven-prison-door-locked.png',
  './img/tiles/dwarven-floor-trap-0.png',
  './img/tiles/dwarven-floor-trap-1.png',
  './img/tiles/dwarven-traps-atlas.png',
  './img/tiles/dwarven-pressure-plate.png',
  './img/tiles/dwarven-crusher-track.png',
  './img/projectiles/death-bolt.png'
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

  // Game scripts and content JSON must match the current index.html. Fetch
  // them from the network first, then fall back to the cached copy offline.
  if (url.pathname.includes('/src/') || url.pathname.includes('/content/')) {
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
      const raceBackdrop = /\/img\/ui\/race-landscape-[1-4]\.webp$/.test(url.pathname);
      // Precached landscape files live in PRECACHE, not RUNTIME. Consult both
      // so character creation can use them instantly on subsequent launches.
      const cached = await cache.match(req) || (raceBackdrop
        ? await caches.open(PRECACHE).then((precache) => precache.match(req))
        : null);

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
