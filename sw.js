// Service Worker: legt die App-Dateien beim ersten Besuch im Cache,
// damit die App danach auch ohne Netz startet.
const CACHE = 'einkaufsroute-v0.7.4.3';
const FILES = ['./', 'index.html', 'style.css', 'js/grund.js', 'js/ansichten.js', 'js/oberflaeche.js', 'js/listen.js', 'js/kategorien.js', 'js/geschaefte.js', 'js/gesten.js', 'js/ereignisse.js', 'js/essen.js', 'js/bedienung.js', 'js/listentypen.js', 'js/gruppen.js', 'js/hilfe.js', 'js/spass.js', 'js/start.js', 'sync.js', 'sw.js', 'manifest.webmanifest', 'icon.svg', 'icon-180.png', 'icon-192.png', 'icon-512.png'];

self.addEventListener('install', (e) => {
  // cache: 'reload' = immer frisch vom Server, nicht aus dem kurzen Browser-Zwischenspeicher (sonst landen alte Dateien in der neuen Version)
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES.map((f) => new Request(f, { cache: 'reload' })))).then(() => self.skipWaiting()));
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

// Die App fragt nach der Version (Anzeige unten in den Einstellungen)
self.addEventListener('message', (e) => { if (e.data === 'version') e.source?.postMessage({ version: CACHE }); });
