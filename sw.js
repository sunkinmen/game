const C = 'tgta-v5';
const PHASER = 'https://cdnjs.cloudflare.com/ajax/libs/phaser/3.80.1/phaser.min.js';
const JS = ['config','save','levels','audio','input','touchui','combat','enemies','parallax','menu','art','game','main'].map(n => './js/' + n + '.js');
const FILES = ['./', './index.html', './manifest.json', './icon.svg', ...JS, PHASER];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(C).then(c => c.addAll(FILES)));
  self.skipWaiting();
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(ks => Promise.all(ks.filter(k => k !== C).map(k => caches.delete(k))))
    .then(() => clients.claim()));
});
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(caches.match(e.request).then(hit => hit ||
    fetch(e.request).then(res => {
      const copy = res.clone();
      caches.open(C).then(c => c.put(e.request, copy));
      return res;
    }).catch(() => caches.match('./index.html'))));
});
