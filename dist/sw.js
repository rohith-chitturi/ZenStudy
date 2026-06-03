const CACHE_NAME = 'zenstudy-cache-v1';

// Install event: cache basic index layout shell
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll([
        './',
        './index.html',
        './style.css',
        './main.js',
        './manifest.json',
        './icon.svg'
      ]).catch(err => console.warn('PWA: static assets pre-cache failed:', err));
    })
  );
  self.skipWaiting();
});

// Activate event: clean old caches
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys.map(key => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Fetch event: network first, fallback to cache, and dynamically cache successfully fetched pages
self.addEventListener('fetch', e => {
  // Avoid caching browser extensions, chrome-extension:// schemes, etc.
  if (!e.request.url.startsWith(self.location.origin)) {
    return;
  }
  
  e.respondWith(
    fetch(e.request)
      .then(response => {
        // If response is valid, clone and cache it
        if (response && response.status === 200 && response.type === 'basic') {
          const responseToCache = response.clone();
          caches.open(CACHE_NAME).then(cache => {
            cache.put(e.request, responseToCache);
          });
        }
        return response;
      })
      .catch(() => {
        // Fallback to cache if network fails
        return caches.match(e.request);
      })
  );
});
