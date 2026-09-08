/*
 * Service Worker: cache-first のオフライン対応。
 * ファイルを更新したら CACHE_VERSION を上げること(activate で旧キャッシュを削除)。
 */
var CACHE_VERSION = 'v1.0.0';
var CACHE_NAME = 'moco-prac-' + CACHE_VERSION;

var ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/style.css',
  './js/morse-data.js',
  './js/morse-codec.js',
  './js/keyer.js',
  './js/storage.js',
  './js/audio.js',
  './js/ui-common.js',
  './js/rx-trainer.js',
  './js/tx-trainer.js',
  './js/reference.js',
  './js/settings.js',
  './js/app.js',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-512-maskable.png',
  './icons/apple-touch-icon.png'
];

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(function (cache) { return cache.addAll(ASSETS); })
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) {
        if (k !== CACHE_NAME) { return caches.delete(k); }
        return null;
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (event) {
  if (event.request.method !== 'GET') { return; }
  var url = new URL(event.request.url);
  if (url.origin !== location.origin) { return; }
  event.respondWith(
    caches.match(event.request, { ignoreSearch: true }).then(function (cached) {
      if (cached) { return cached; }
      return fetch(event.request).then(function (res) {
        if (res && res.ok) {
          var copy = res.clone();
          caches.open(CACHE_NAME).then(function (cache) { cache.put(event.request, copy); });
        }
        return res;
      }).catch(function () {
        // ナビゲーションはオフライン時に index.html へフォールバック
        if (event.request.mode === 'navigate') {
          return caches.match('./index.html');
        }
        return new Response('', { status: 503, statusText: 'offline' });
      });
    })
  );
});
