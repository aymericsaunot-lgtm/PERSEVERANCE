// Offline cache. Bump VERSION whenever you change any file, so installed apps update.
const VERSION = '2026.10.09';
const CACHE = `dashboard-${VERSION}`;

const SHELL = [
  './',
  './index.html',
  './config.js',
  './manifest.webmanifest',
  './css/app.css',
  './css/studio.css',
  './vendor/preact.js',
  './vendor/firebase.js',
  './js/main.js',
  './js/store.js',
  './js/ui.js',
  './js/version.js',
  './js/backend-firebase.js',
  './js/lib/dates.js',
  './js/lib/papers.js',
  './js/lib/surf.js',
  './js/lib/text.js',
  './js/lib/xp.js',
  './js/views/life.js',
  './js/views/login.js',
  './js/views/papers.js',
  './js/views/phd.js',
  './js/views/progress.js',
  './js/views/studio/clients.js',
  './js/views/studio/common.js',
  './js/views/studio/money.js',
  './js/views/studio/projects.js',
  './js/views/studio/sheets.js',
  './js/views/studio/shell.js',
  './js/views/studio/today.js',
  './js/views/settings.js',
  './js/views/tasks.js',
  './js/views/today.js',
  './fonts/instrument-serif-normal-latin.woff2',
  './fonts/instrument-serif-normal-latin-ext.woff2',
  './fonts/instrument-serif-italic-latin.woff2',
  './fonts/instrument-serif-italic-latin-ext.woff2',
  './fonts/instrument-sans-normal-latin.woff2',
  './fonts/instrument-sans-normal-latin-ext.woff2',
  './fonts/schibsted-normal-latin.woff2',
  './fonts/schibsted-normal-latin-ext.woff2',
  './fonts/schibsted-italic-latin.woff2',
  './fonts/schibsted-italic-latin-ext.woff2',
  './fonts/dmmono-400-latin.woff2',
  './fonts/dmmono-500-latin.woff2',
  './fonts/stix-latin-400.woff2',
  './fonts/stix-latin-400-italic.woff2',
  './fonts/stix-latin-500.woff2',
  './fonts/stix-latin-ext-400.woff2',
  './fonts/stix-latin-ext-500.woff2',
  './fonts/stix-greek-400.woff2',
  './fonts/stix-greek-500.woff2',
  './icons/favicon.svg',
  './icons/apple-touch-icon.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // One missing file must not break the whole install.
    await Promise.allSettled(SHELL.map((url) => cache.add(new Request(url, { cache: 'reload' }))));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k.startsWith('dashboard-') && k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // Firebase, Crossref, arXiv and Open-Meteo go straight to the network.
  if (url.origin !== self.location.origin) return;

  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE);
      const hit = await cache.match('./index.html');
      if (hit) return hit;
      try { return await fetch(req); } catch (e) { return new Response('Offline', { status: 503 }); }
    })());
    return;
  }

  // config.js changes during setup: prefer the network so new keys apply at once.
  if (url.pathname.endsWith('/config.js')) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE);
      try {
        const res = await fetch(req, { cache: 'no-store' });
        if (res.ok) cache.put(req, res.clone());
        return res;
      } catch (e) {
        return (await cache.match(req)) || new Response('', { status: 503 });
      }
    })());
    return;
  }

  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const hit = await cache.match(req, { ignoreSearch: true });
    if (hit) return hit;
    const res = await fetch(req);
    if (res.ok) cache.put(req, res.clone());
    return res;
  })());
});
