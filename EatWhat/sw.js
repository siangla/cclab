// Service Worker — 今天吃什麼 PWA
// 離線快取靜態資源，讓 App 在沒有網路時也能開啟

const CACHE_NAME = 'eatwhat-v20260525-1';
const STATIC_ASSETS = [
  './eatwhat.html',
  './eatwhat.css',
  './eatwhat.js',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js',
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

// 請求攔截：優先用快取，Firebase 請求一律走網路
self.addEventListener('fetch', event => {
  const url = event.request.url;

  // Firebase 請求：直接走網路，不快取
  if (url.includes('firebaseio.com') || url.includes('firebasedatabase.app')) {
    event.respondWith(fetch(event.request));
    return;
  }

  // 靜態資源：快取優先，失敗才走網路
  event.respondWith(
    caches.match(event.request).then(cached => cached || fetch(event.request))
  );
});
