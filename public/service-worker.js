// public/service-worker.js
// Basic service worker to enable offline support

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// You can add fetch handlers here for caching static assets if desired
self.addEventListener('fetch', (event) => {
  // Leave default behavior (network-first) for now
});
