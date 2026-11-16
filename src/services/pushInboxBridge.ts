/**
 * Pont push → boîte de réception.
 *
 * Une notification envoyée depuis la page admin était
 * jusqu'ici affichée par le système puis perdue : elle n'apparaissait nulle
 * part dans la page Messages. Ce pont ferme la boucle, par deux chemins qui
 * se complètent sans faire doublon :
 *
 *  - **app ouverte** : le service worker `postMessage` aux onglets, on crée
 *    le message immédiatement ;
 *  - **app fermée** : le service worker met en file dans IndexedDB (le seul
 *    stockage qui lui soit accessible), qu'on vide au démarrage suivant.
 *
 * Le service worker ne met en file *que* s'il n'a trouvé aucun onglet ouvert,
 * ce qui évite d'enregistrer deux fois le même message.
 */

import { notificationService, NotificationType } from './notificationService';
import { playSound } from '../utils/soundEngine';

const INBOX_DB = 'mathplus-push-inbox';
const INBOX_STORE = 'queue';

export interface PushInboxEntry {
  title: string;
  body: string;
  type?: string;
  priority?: string;
  tag?: string;
  url?: string;
  at?: number;
}

const KNOWN_TYPES: ReadonlySet<string> = new Set([
  'achievement', 'progress', 'reminder', 'update',
  'tip', 'session', 'system', 'encouragement',
]);

const toType = (value?: string): NotificationType =>
  (value && KNOWN_TYPES.has(value) ? value : 'reminder') as NotificationType;

const toPriority = (value?: string) =>
  (['low', 'normal', 'high', 'urgent'].includes(value || '') ? value : 'normal') as
    'low' | 'normal' | 'high' | 'urgent';

function record(entry: PushInboxEntry): void {
  if (!entry?.title) return;
  notificationService.create(toType(entry.type), entry.title, entry.body || '', {
    priority: toPriority(entry.priority),
    // Le tag du serveur porte déjà l'idempotence (une séance, une date) : on
    // le réutilise pour éviter le doublon si le message repasse.
    dedupKey: entry.tag || `push-${entry.title}`,
    dedupWindowMs: 12 * 60 * 60 * 1000,
  });
}

function openDb(): Promise<IDBDatabase> {
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

/** Vide la file laissée par le service worker pendant que l'app était fermée. */
async function drainQueue(): Promise<number> {
  if (typeof indexedDB === 'undefined') return 0;
  try {
    const db = await openDb();
    const entries = await new Promise<PushInboxEntry[]>((resolve, reject) => {
      const tx = db.transaction(INBOX_STORE, 'readonly');
      const req = tx.objectStore(INBOX_STORE).getAll();
      req.onsuccess = () => resolve((req.result || []) as PushInboxEntry[]);
      req.onerror = () => reject(req.error);
    });

    if (entries.length > 0) {
      // Ordre chronologique : la boîte doit refléter la séquence réelle.
      [...entries].sort((a, b) => (a.at || 0) - (b.at || 0)).forEach(record);
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(INBOX_STORE, 'readwrite');
        tx.objectStore(INBOX_STORE).clear();
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    }
    db.close();
    return entries.length;
  } catch {
    return 0;
  }
}

let started = false;

/** À appeler une fois au démarrage de l'application. */
export function startPushInboxBridge(): () => void {
  if (started || typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
    return () => {};
  }
  started = true;

  const onMessage = (event: MessageEvent) => {
    if (event.data?.type === 'push-notification') {
      const entry = event.data.payload as PushInboxEntry;
      record(entry);
      // Son spécial « la séance a commencé » quand l'app est ouverte (le SW ne
      // peut pas émettre de son personnalisé : le système garde son son usuel).
      if (entry?.tag?.startsWith('session-started')) playSound('alert');
    }
  };
  navigator.serviceWorker.addEventListener('message', onMessage);

  void drainQueue();
  // Le retour au premier plan est le moment où l'élève consulte : on vide la
  // file laissée pendant que l'onglet dormait.
  const onVisible = () => { if (!document.hidden) void drainQueue(); };
  document.addEventListener('visibilitychange', onVisible);

  return () => {
    navigator.serviceWorker.removeEventListener('message', onMessage);
    document.removeEventListener('visibilitychange', onVisible);
    started = false;
  };
}
