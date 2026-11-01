// Kill-switch service worker. An earlier version of this project (the stone-age "Tribe" game) registered a
// caching service worker on this origin; browsers kept serving its stale cache. This replaces it, wipes every
// cache, unregisters itself and reloads open tabs. There is intentionally no fetch handler.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map((k) => caches.delete(k)));
    await self.registration.unregister();
    const clients = await self.clients.matchAll({ type: 'window' });
    for (const c of clients) c.navigate(c.url);
  })());
});
