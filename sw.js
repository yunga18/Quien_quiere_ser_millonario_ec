const CACHE = 'millonario-ecuador-v2';
const ASSETS = ['./', './index.html', './styles.css', './js/app.js', './js/engine.js', './js/questions.js', './js/general-questions.js', './js/categories.js', './js/audio.js', './assets/studio.webp', './assets/emblem.svg', './assets/icon.svg', './manifest.webmanifest'];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('millonario-ecuador-') && key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin || !url.href.startsWith(self.registration.scope)) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    if (event.request.mode === 'navigate') {
      try {
        const response = await fetch(event.request);
        if (response.ok) await cache.put(event.request, response.clone());
        return response;
      } catch { return (await cache.match(event.request)) || (await cache.match('./index.html')); }
    }
    const cached = await cache.match(event.request);
    if (cached) return cached;
    const response = await fetch(event.request);
    if (response.ok && response.type === 'basic') await cache.put(event.request, response.clone());
    return response;
  })());
});
