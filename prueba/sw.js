const CACHE = 'prueba-v79';
const FILES = ['./', 'index.html', 'app.js?v=p79', 'xlsx.full.min.js', 'unrar.js', 'unrar-wasm.js', 'paradox.js?v=p79', 'syscaw.js?v=p79', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png'];
// al instalar, baja todo de nuevo (sin usar la memoria del navegador) para que no queden archivos de versiones distintas
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES.map(f => new Request(f, { cache: 'reload' })))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith('prueba-') && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
// con conexión: siempre pregunta al servidor si hay versión nueva; sin conexión: usa la copia guardada
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request, { cache: 'no-cache' }).then(r => {
      if (r.ok) { const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); }
      return r;
    }).catch(() => caches.match(e.request).then(m => m || caches.match(e.request, { ignoreSearch: true })).then(m => m || caches.match('index.html')))
  );
});
