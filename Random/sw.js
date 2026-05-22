// Service Worker — 隨機亂數 PWA
const CACHE_NAME = 'random-picker-v1';
const STATIC_ASSETS = [
  './Random_Picker.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
];

// 安裝：快取所有靜態資源
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

// 啟動：清除舊版快取
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// 請求攔截：快取優先，失敗才走網路
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request).then(cached => cached || fetch(event.request))
  );
});
