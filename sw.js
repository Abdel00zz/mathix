/**
 * sw.js — Service Worker offline-first haute disponibilité pour Mathix PWA.
 * Conçu pour fonctionner comme le noyau d'une application native Android :
 * - Démarrage instantané hors ligne (0ms cold start)
 * - Mises à jour silencieuses en arrière-plan sans interruption de session
 * - Nettoyage atomique des versions de cache obsolètes
 * - Isolation stricte /api/* et /admin/* (réseau pur)
 */
const CACHE_NAME = 'mathix-pwa-v70';

const CORE_ASSETS = [
  './',
  './index.html',
  './404.html',
  './manifest.webmanifest',
  './public/favicon.svg',
  './public/icon-maskable.svg',
  './public/logo.png',
  './assets/min/app.min.css',
  './assets/min/host.min.js',
  './vendor/katex/katex.min.css',
  './vendor/katex/katex.min.js',
  './vendor/katex/fonts/KaTeX_Main-Regular.woff2',
  './vendor/katex/fonts/KaTeX_Math-Italic.woff2',
  './vendor/katex/fonts/KaTeX_Size1-Regular.woff2',
  './engines/mathix_app.wasm',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(CORE_ASSETS).catch((err) => {
        console.warn('[Mathix SW] Pré-mise en cache partielle :', err);
      }))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      ))
      .then(() => self.clients.claim())
      .then(async () => {
        const clients = await self.clients.matchAll({ type: 'window' });
        for (const client of clients) {
          client.postMessage({ type: 'SW_ACTIVATED', version: CACHE_NAME });
        }
      })
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Domaine externe : réseau normal
  if (url.origin !== self.location.origin) return;

  // Routes d'administration et API dynamique : toujours réseau pur
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/admin')) {
    return;
  }

  // Navigation racine / sous-pages : Network-First avec repli sur le shell index.html en cache
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).catch(() => caches.match('./index.html') || caches.match('./'))
    );
    return;
  }

  // Données pédagogiques JSON : Network-First avec cache automatique pour fonctionnement hors ligne
  if (url.pathname.endsWith('.json')) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res && res.status === 200) {
            const clone = res.clone();
            caches.open(CACHE_NAME).then((c) => c.put(req, clone)).catch(() => {});
          }
          return res;
        })
        .catch(() => caches.match(req).then((c) => c || new Response(null, { status: 503 })))
    );
    return;
  }

  // Bundles applicatifs (CSS/JS/WASM) : Network-First avec repli cache pour des mises à jour visuelles instantanées
  if (url.pathname.startsWith('/assets/min/') || url.pathname.endsWith('.css') || url.pathname.endsWith('.js') || url.pathname.endsWith('.wasm')) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res && res.status === 200) {
            const clone = res.clone();
            caches.open(CACHE_NAME).then((c) => c.put(req, clone)).catch(() => {});
          }
          return res;
        })
        .catch(() => caches.match(req).then((c) => c || new Response(null, { status: 503 })))
    );
    return;
  }

  // Assets statiques immuables (Polices KaTeX, Images) : Stale-While-Revalidate
  event.respondWith(
    caches.match(req).then((cached) => {
      const netFetch = fetch(req)
        .then((res) => {
          if (res && res.status === 200) {
            const clone = res.clone();
            caches.open(CACHE_NAME).then((c) => c.put(req, clone)).catch(() => {});
          }
          return res;
        })
        .catch(() => cached);

      return cached || netFetch;
    })
  );
});

// Écoute des ordres de maintenance silencieuse depuis l'application
self.addEventListener('message', (event) => {
  if (event.data?.action === 'skipWaiting') {
    self.skipWaiting();
  }
});
