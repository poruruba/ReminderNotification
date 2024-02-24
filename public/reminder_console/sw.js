var CACHE_NAME = 'pwa-sample-caches';
var urlsToCache = [
  // キャッシュ化したいコンテンツ
];

self.addEventListener('fetch', function(event) {
  console.log('sw event: fetch called');
});
