var CACHE = 'ai-bot-v1';
var STATIC = ['/', '/manifest.json'];

self.addEventListener('install', function(e) {
  e.waitUntil(
    caches.open(CACHE).then(function(c) { return c.addAll(STATIC); })
  );
  self.skipWaiting();
});

self.addEventListener('activate', function(e) {
  e.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(keys.filter(function(k){return k!==CACHE;}).map(function(k){return caches.delete(k);}));
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', function(e) {
  var url = new URL(e.request.url);
  // API so'rovlari — doim network
  if (url.pathname.startsWith('/api/')) return;
  // Statik fayllar — cache first
  e.respondWith(
    caches.match(e.request).then(function(cached) {
      if (cached) return cached;
      return fetch(e.request).then(function(r) {
        if (r && r.status === 200 && r.type === 'basic') {
          var clone = r.clone();
          caches.open(CACHE).then(function(c){c.put(e.request,clone);});
        }
        return r;
      }).catch(function() {
        return caches.match('/');
      });
    })
  );
});
