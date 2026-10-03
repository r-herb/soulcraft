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
  if (url.pathname === '/sw.js' || url.pathname === '/version.json' || url.pathname.startsWith('/api/')) return;

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

// ---------- push: a friend calls or invites while the game is closed ----------
// The push carries nothing; what is waiting comes from /api/push/pending
// (the player's own session cookie) and shows as a notification.
const PUSH_TEXT = {
  en: { call: (n) => `${n} is calling you`, callBody: 'Tap to answer in Soulcraft.', game: (n) => `${n} invites you to play`, gameBody: (w) => `Join "${w}" in Soulcraft.`, other: 'Something new in Soulcraft' },
  lv: { call: (n) => `${n} tev zvana`, callBody: 'Pieskaries, lai atbildētu Soulcraft.', game: (n) => `${n} aicina tevi spēlēt`, gameBody: (w) => `Pievienojies "${w}" Soulcraft.`, other: 'Jaunums Soulcraft' },
  ru: { call: (n) => `${n} звонит тебе`, callBody: 'Нажми, чтобы ответить в Soulcraft.', game: (n) => `${n} зовёт тебя играть`, gameBody: (w) => `Присоединяйся к «${w}» в Soulcraft.`, other: 'Новое в Soulcraft' },
  es: { call: (n) => `${n} te está llamando`, callBody: 'Toca para responder en Soulcraft.', game: (n) => `${n} te invita a jugar`, gameBody: (w) => `Únete a «${w}» en Soulcraft.`, other: 'Novedades en Soulcraft' },
};
self.addEventListener('push', (event) => {
  event.waitUntil((async () => {
    let data = null;
    try { const r = await fetch('/api/push/pending', { credentials: 'include', cache: 'no-store' }); if (r.ok) data = await r.json(); } catch { /* offline */ }
    const T = PUSH_TEXT[(data && data.lang) || 'en'] || PUSH_TEXT.en;
    const evs = (data && data.events) || [];
    const ev = evs.find((e) => e.kind === 'call') || evs.find((e) => e.kind === 'game');
    if (!ev) { await self.registration.showNotification('Soulcraft', { body: T.other, icon: '/icons/icon-192.png', tag: 'soulcraft' }); return; }
    const call = ev.kind === 'call';
    await self.registration.showNotification(call ? T.call(ev.name) : T.game(ev.name), {
      body: call ? T.callBody : T.gameBody(ev.world || 'Soulcraft'),
      icon: '/icons/icon-192.png', badge: '/icons/icon-192.png', tag: call ? 'call' : 'game', renotify: true, requireInteraction: call,
      vibrate: call ? [400, 200, 400, 200, 400] : [200], data: { kind: ev.kind },
    });
  })());
});
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const kind = (event.notification.data && event.notification.data.kind) || '';
    for (const c of all) { if ('focus' in c) { c.postMessage({ t: 'pending', kind }); return c.focus(); } }
    return self.clients.openWindow('/?pending=' + encodeURIComponent(kind));
  })());
});
