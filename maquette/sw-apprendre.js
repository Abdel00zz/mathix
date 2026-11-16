/**
 * Service Worker dedie a `/apprendre/` (PWA Mobile + Hors-ligne)
 * Regle absolue : `/api/*`, `?_rsc=` et auth OAuth restent strictement NetworkOnly.
 */
const CACHE_VERSION = 'mathflow-apprendre-v7';
const APP_SHELL = [
  './Apprendre.html',
  './apprendre.webmanifest',
  './icons/icone.png',
  './icons/badge.png',
  './vendor/katex/katex.min.css',
  './vendor/katex/katex.min.js',
  './vendor/katex/fonts/KaTeX_AMS-Regular.woff2',
  './vendor/katex/fonts/KaTeX_Caligraphic-Bold.woff2',
  './vendor/katex/fonts/KaTeX_Caligraphic-Regular.woff2',
  './vendor/katex/fonts/KaTeX_Fraktur-Bold.woff2',
  './vendor/katex/fonts/KaTeX_Fraktur-Regular.woff2',
  './vendor/katex/fonts/KaTeX_Main-Bold.woff2',
  './vendor/katex/fonts/KaTeX_Main-BoldItalic.woff2',
  './vendor/katex/fonts/KaTeX_Main-Italic.woff2',
  './vendor/katex/fonts/KaTeX_Main-Regular.woff2',
  './vendor/katex/fonts/KaTeX_Math-BoldItalic.woff2',
  './vendor/katex/fonts/KaTeX_Math-Italic.woff2',
  './vendor/katex/fonts/KaTeX_SansSerif-Bold.woff2',
  './vendor/katex/fonts/KaTeX_SansSerif-Italic.woff2',
  './vendor/katex/fonts/KaTeX_SansSerif-Regular.woff2',
  './vendor/katex/fonts/KaTeX_Script-Regular.woff2',
  './vendor/katex/fonts/KaTeX_Size1-Regular.woff2',
  './vendor/katex/fonts/KaTeX_Size2-Regular.woff2',
  './vendor/katex/fonts/KaTeX_Size3-Regular.woff2',
  './vendor/katex/fonts/KaTeX_Size4-Regular.woff2',
  './vendor/katex/fonts/KaTeX_Typewriter-Regular.woff2',
  './css/app-tokens-base.css',
  './css/app-dashboard.css',
  './css/app-views.css',
  './css/app-revision-study.css',
  './css/app-math-widgets.css',
  './css/app-mobile.css',
  './css/app-sidebar.css',
  './css/app-orientation.css',
  './css/app-print.css',
  './js/app.js',
  './js/content-data.js',
  './js/math-engine.js',
  './js/data/orientation-tc-1b.js',
  './js/data/orientation-2b.js',
  './js/data/lexiques.js',
  './js/data/embedded-manifests.js',
  './js/data/embedded-revisions.js',
  './js/data/embedded-practice.js',
  './js/data/embedded-concours.js',
  './js/math/lexicon.js',
  './js/math/mathml-fallback.js',
  './js/math/media-lexicon.js',
  './js/math/tex-macros.js',
  './js/math/tkz-array.js',
  './js/math/tkz-tab.js',
  './js/core/unlocks.js',
  './js/core/resume-store.js',
  './js/core/sidebar.js',
  './js/core/orientation-modal.js',
  './js/core/offline-db.js',
  './js/core/cloud-sync.js',
  './js/core/pwa-mobile.js',
  './js/core/ui-modals.js',
  './js/pages/lecon-search.js',
  './js/pages/lecon-blocks.js',
  './js/pages/lecon-renderer.js',
  './js/pages/lecon-page.js',
  './js/pages/quiz-loader.js',
  './js/pages/quiz-renderer.js',
  './js/pages/quiz-page.js',
  './js/pages/exercice-loader.js',
  './js/pages/exercice-parser.js',
  './js/pages/exercice-renderer.js',
  './js/pages/exercice-page.js',
  './js/pages/programme-chrome.js',
  './js/pages/programme-page.js',
];

function isCacheable(res, forbidHtml) {
  if (!res || !res.ok || res.status !== 200 || res.type !== 'basic') return false;
  if (forbidHtml) {
    const ct = (res.headers.get('content-type') || '').toLowerCase();
    if (ct.includes('text/html')) return false;
  }
  return true;
}

function isNetworkOnlyRequest(req, url) {
  if (url.origin !== self.location.origin) return true;
  if (url.pathname.startsWith('/api/')) return true;
  if (url.pathname.endsWith('/sw-apprendre.js')) return true;
  if (url.searchParams.has('_rsc')) return true;
  if (req.headers.get('RSC') === '1') return true;
  if (req.headers.has('Next-Router-State-Tree') || req.headers.has('Next-Action')) return true;
  return false;
}

function isCacheFirstAsset(url) {
  return (
    url.pathname.startsWith('/_next/static/') ||
    url.pathname.includes('/icons/') ||
    url.pathname.includes('/vendor/katex/fonts/') ||
    url.pathname.endsWith('.woff2')
  );
}

function isDataJson(url) {
  return url.pathname.includes('/data/') && url.pathname.endsWith('.json');
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then((cache) => Promise.allSettled(APP_SHELL.map((url) => cache.add(url))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => /^mathflow-apprendre-v\d+$/.test(k) && k !== CACHE_VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (isNetworkOnlyRequest(req, url)) return;

  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (isCacheable(res, false)) {
            const copy = res.clone();
            caches.open(CACHE_VERSION).then((c) => c.put(req, copy)).catch(() => {});
          }
          return res;
        })
        .catch(() => caches.match(req).then((m) => m || caches.match('./Apprendre.html'))),
    );
    return;
  }

  if (isDataJson(url)) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (isCacheable(res, true)) {
            const copy = res.clone();
            caches.open(CACHE_VERSION).then((c) => c.put(req, copy)).catch(() => {});
          }
          return res;
        })
        .catch(() =>
          caches.match(req).then(
            (cached) =>
              cached ||
              new Response('{"error":"offline"}', {
                status: 503,
                headers: { 'Content-Type': 'application/json; charset=utf-8' },
              }),
          ),
        ),
    );
    return;
  }

  if (isCacheFirstAsset(url)) {
    event.respondWith(
      caches.match(req).then((cached) => {
        if (cached) return cached;
        return fetch(req).then((res) => {
          if (isCacheable(res, false)) {
            const copy = res.clone();
            caches.open(CACHE_VERSION).then((c) => c.put(req, copy)).catch(() => {});
          }
          return res;
        });
      }),
    );
    return;
  }

  event.respondWith(
    caches.match(req).then((cached) => {
      const networkFetch = fetch(req).then((res) => {
        if (isCacheable(res, false)) {
          const copy = res.clone();
          caches.open(CACHE_VERSION).then((c) => c.put(req, copy)).catch(() => {});
        }
        return res;
      }).catch(() => cached);
      return cached || networkFetch;
    }),
  );
});
