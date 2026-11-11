// Service Worker: legt die App-Dateien beim ersten Besuch im Cache,
// damit die App danach auch ohne Netz startet.
const CACHE = 'einkaufsroute-v0.6.1';
const FILES = ['./', 'index.html', 'style.css', 'app.js', 'sync.js', 'manifest.webmanifest', 'icon.svg', 'icon-180.png', 'icon-192.png', 'icon-512.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Erst Cache, sonst Netz. Eigene Daten liegen in IndexedDB und kommen hier nicht vor.
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return; // Server-Abfragen gehen direkt ins Netz
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then((hit) => hit || fetch(e.request)));
});
