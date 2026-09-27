// Service worker. Generated into dist/sw.js at build time with the list of
// build files and a version stamp (see vite.config.js).
//  - HTML (navigations): network first, so a new deploy is picked up at once;
//    the cached copy is only used offline.
//  - /assets/* (content-hashed): cache first; they never change.
//  - everything else: stale-while-revalidate.
// Each deploy gets its own cache name and old caches are deleted on activate.
const VERSION = '__VERSION__';
const CACHE = 'soulcraft-' + VERSION;
const PRECACHE = __PRECACHE__;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((c) => c.addAll(PRECACHE.map((u) => new Request(u, { cache: 'reload' }))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('soulcraft-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('message', (e) => { if (e.data === 'skipWaiting') self.skipWaiting(); });

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname === '/sw.js') return;

  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const res = await fetch(req, { cache: 'no-store' });
        if (res && res.ok && !res.redirected && url.pathname === '/') {
          const c = await caches.open(CACHE);
          c.put('/', res.clone());
        }
        return res;
      } catch {
        const c = await caches.open(CACHE);
        return (await c.match('/')) || Response.error();
      }
    })());
    return;
  }

  if (url.pathname.startsWith('/assets/')) {
    event.respondWith((async () => {
      const c = await caches.open(CACHE);
      const hit = await c.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      if (res && res.ok) c.put(req, res.clone());
      return res;
    })());
    return;
  }

  event.respondWith((async () => {
    const c = await caches.open(CACHE);
    const hit = await c.match(req, { ignoreSearch: true });
    const net = fetch(req).then((res) => { if (res && res.ok) c.put(req, res.clone()); return res; }).catch(() => null);
    return hit || (await net) || Response.error();
  })());
});
