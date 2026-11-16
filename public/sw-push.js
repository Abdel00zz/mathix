// ============================================================================
// Push Notification Handler — Service Worker
// Injecte dans le SW principal via importScripts
// ============================================================================

// ── Relais vers la boîte de réception de l'app ──────────────────────────────
// Une notification système disparaît dès qu'on la balaie. Sans ce relais,
// un message du professeur ne laisserait aucune trace dans la page Messages.
// Le service worker n'a pas accès à localStorage : on passe par IndexedDB,
// que l'app vide au démarrage (voir `pushInboxBridge`).

const INBOX_DB = 'mathplus-push-inbox';
const INBOX_STORE = 'queue';

// Les anciennes versions mettaient toutes les réponses /api en cache, y
// compris certaines réponses privées. La nouvelle stratégie est NetworkOnly ;
// ce nettoyage retire explicitement le cache historique à l'activation.
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(key => key === 'api-cache' || key.startsWith('api-cache-')).map(key => caches.delete(key))
    ))
  );
});

function openInboxDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(INBOX_DB, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(INBOX_STORE)) {
        db.createObjectStore(INBOX_STORE, { keyPath: 'id', autoIncrement: true });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function queueForInbox(entry) {
  try {
    const db = await openInboxDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(INBOX_STORE, 'readwrite');
      tx.objectStore(INBOX_STORE).add(entry);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    // Pas de file d'attente possible : la notification système reste affichée.
  }
}

/** Prévient les onglets ouverts, qui alimentent la boîte immédiatement. */
async function broadcastToClients(entry) {
  const windowClients = await clients.matchAll({ type: 'window', includeUncontrolled: true });
  windowClients.forEach((client) => {
    try { client.postMessage({ type: 'push-notification', payload: entry }); } catch { /* ignore */ }
  });
  return windowClients.length;
}

self.addEventListener('push', (event) => {
  if (!event.data) return;

  let data;
  try {
    data = event.data.json();
  } catch {
    data = { title: 'Math en tête', body: event.data.text() };
  }

  // Relais boîte de réception, en plus de l'affichage système.
  event.waitUntil((async () => {
    const entry = {
      title: data.title || 'Math en tête',
      body: data.body || '',
      type: data.type || 'reminder',
      priority: data.priority || 'normal',
      tag: data.tag || '',
      url: data.url || '/',
      at: data.timestamp || Date.now(),
    };
    const openTabs = await broadcastToClients(entry);
    // Aucun onglet pour l'enregistrer : on met en file pour le prochain
    // démarrage. Avec un onglet ouvert, la file ferait doublon.
    if (openTabs === 0) await queueForInbox(entry);
  })());

  const priority = data.priority || 'normal';
  const isHigh = priority === 'high' || priority === 'urgent';
  const tag = data.tag || 'mathplus-' + Date.now();

  const options = {
    body: data.body || '',
    icon: data.icon || '/icone.png',     // grande icône (Android)
    badge: data.badge || '/badge.png',     // icône monochrome barre d'état
    image: data.image || undefined,        // bannière riche (optionnelle)
    lang: 'fr',
    dir: 'auto',
    tag,
    timestamp: data.timestamp || Date.now(),
    // Ré-alerter quand une notif prioritaire remplace la précédente (même tag)
    renotify: isHigh,
    // Pas de son pour les contenus de faible priorité (conseils, rappels doux)
    silent: priority === 'low',
    vibrate: isHigh ? [80, 40, 80, 40, 120] : [60, 30, 60],
    // Boutons d'action (ex. « Rejoindre » pour un lien Meet/Zoom)
    actions: Array.isArray(data.actions) ? data.actions.slice(0, 2) : [],
    // Les alertes importantes (séances, visio) restent affichées
    requireInteraction: isHigh,
    data: {
      url: data.url || '/',
      type: data.type || 'reminder',
    },
  };

  event.waitUntil(
    self.registration.showNotification(data.title || 'Math en tête', options)
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const url = event.notification.data?.url || '/';
  // Lien externe (Meet, Zoom…) → ouvrir directement dans un nouvel onglet/app,
  // sans détourner l'onglet de l'application.
  const isExternal = /^https?:\/\//i.test(url) && !url.includes(self.location.origin);

  event.waitUntil((async () => {
    if (isExternal) {
      await clients.openWindow(url);
      return;
    }
    const windowClients = await clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of windowClients) {
      if (client.url.includes(self.location.origin) && 'focus' in client) {
        await client.focus();
        if ('navigate' in client) { try { await client.navigate(url); } catch { /* ignore */ } }
        return;
      }
    }
    await clients.openWindow(url);
  })());
});

// Android/Chrome recycle périodiquement les subscriptions push : sans ce
// handler, l'élève cesse de recevoir les notifications sans le savoir.
self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil((async () => {
    try {
      const appServerKey = event.oldSubscription?.options?.applicationServerKey;
      const newSub = await self.registration.pushManager.subscribe({
        userVisibleOnly: true,
        ...(appServerKey ? { applicationServerKey: appServerKey } : {}),
      });
      await fetch('/api/push?action=subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subscription: newSub.toJSON(), subscribedAt: Date.now() }),
      });
      if (event.oldSubscription && event.oldSubscription.endpoint !== newSub.endpoint) {
        await fetch('/api/push?action=unsubscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ endpoint: event.oldSubscription.endpoint }),
        });
      }
    } catch {
      // L'app réparera l'abonnement à la prochaine ouverture (ensureHealthy)
    }
  })());
});
