/* Field CRM - service worker.
   Cache prefix is 'fieldcrm-'. GitHub Pages puts every repo on one origin,
   so this must never collide with the Belt Call Log's 'beltcall-' caches.
   Bump the version on EVERY change to any file listed below, or the old
   build is what gets tested. */
const CACHE = 'fieldcrm-v15';

// Local files first. If one of these fails the app still installs, but note the warning.
const ASSETS = [
  './', './index.html', './app.js', './zones.js', './manifest.webmanifest',
  './icon-192.png', './icon-512.png', './icon-maskable-512.png',
  'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c =>
      // cached one at a time: a blocked CDN must not take the whole install down with it
      Promise.all(ASSETS.map(a => c.add(a).catch(err => console.warn('sw: not cached', a, err))))
    ).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys =>
    // only ever delete this app's own caches
    Promise.all(keys.filter(k => k.startsWith('fieldcrm-') && k !== CACHE).map(k => caches.delete(k)))
  ).then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request).then(hit => hit || fetch(e.request).then(res => {
      const copy = res.clone();
      caches.open(CACHE).then(c => c.put(e.request, copy)).catch(()=>{});
      return res;
    }).catch(() => caches.match('./index.html')))
  );
});
