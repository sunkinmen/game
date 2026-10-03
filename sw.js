/* Service Worker：只做離線快取，不參與遊戲啟動。
 * 重要：所有遊戲 JS 都位於 ./js/；不要把 sw.js 當 <script> 載入。
 */
const CACHE = 'tgta-v6';
const CORE = [
  './','./index.html','./manifest.json','./icon.svg',
  './js/config.js','./js/save.js','./js/levels.js','./js/audio.js','./js/input.js',
  './js/touchui.js','./js/combat.js','./js/enemies.js','./js/parallax.js','./js/menu.js',
  './js/art.js','./js/game.js','./js/main.js'
];
self.addEventListener('install', function (event) {
  event.waitUntil(caches.open(CACHE).then(function (cache) { return cache.addAll(CORE); }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener('activate', function (event) {
  event.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (key) { return key !== CACHE; }).map(function (key) { return caches.delete(key); }));
  }).then(function () { return self.clients.claim(); }));
});
self.addEventListener('fetch', function (event) {
  if (event.request.method !== 'GET') return;
  var url = new URL(event.request.url);
  if (event.request.mode === 'navigate') {
    event.respondWith(fetch(event.request).then(function (response) {
      var copy = response.clone();
      caches.open(CACHE).then(function (cache) { cache.put('./index.html', copy); }).catch(function () {});
      return response;
    }).catch(function () { return caches.match('./index.html'); }));
    return;
  }
  if (url.origin === self.location.origin) {
    event.respondWith(caches.match(event.request).then(function (hit) {
      if (hit) return hit;
      return fetch(event.request).then(function (response) {
        if (response && response.ok) {
          var copy = response.clone();
          caches.open(CACHE).then(function (cache) { cache.put(event.request, copy); }).catch(function () {});
        }
        return response;
      });
    }));
  }
  /* 外部 CDN 不攔截，避免 CDN 失敗時錯誤地回傳 index.html。 */
});
