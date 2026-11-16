/**
 * MathFlow — File d'attente hors-ligne IndexedDB (`mathflow_offline_db`)
 * Repli sur no-op sécurisé lorsque `indexedDB` est indisponible (SSR, navigation privée restrictive, tests).
 */

export const OFFLINE_DB_NAME = 'mathflow_offline_db';
export const OFFLINE_DB_VERSION = 1;
export const OUTBOX_STORE_NAME = 'sync_outbox';
export const MAX_OUTBOX_ENTRIES = 30;

export interface OutboxEntry<T = unknown> {
  id: number;
  envelope: T;
  accountId?: string;
  createdAt: number;
}

let dbPromise: Promise<IDBDatabase | null> | null = null;

/** Vérifie si `indexedDB` est accessible sans déclencher d'exception de sécurité. */
export function isIndexedDbAvailable(): boolean {
  try {
    return (
      typeof window !== 'undefined'
      && typeof globalThis.indexedDB !== 'undefined'
      && globalThis.indexedDB !== null
    );
  } catch {
    return false;
  }
}

function openOutboxDb(): Promise<IDBDatabase | null> {
  if (!isIndexedDbAvailable()) return Promise.resolve(null);
  if (dbPromise) return dbPromise;

  dbPromise = new Promise<IDBDatabase | null>((resolve) => {
    try {
      const request = globalThis.indexedDB.open(OFFLINE_DB_NAME, OFFLINE_DB_VERSION);

      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(OUTBOX_STORE_NAME)) {
          db.createObjectStore(OUTBOX_STORE_NAME, { keyPath: 'id', autoIncrement: true });
        }
      };

      request.onsuccess = () => {
        const db = request.result;
        db.onversionchange = () => {
          db.close();
          dbPromise = null;
        };
        resolve(db);
      };

      request.onerror = () => {
        dbPromise = null;
        resolve(null);
      };

      request.onblocked = () => {
        dbPromise = null;
        resolve(null);
      };
    } catch {
      dbPromise = null;
      resolve(null);
    }
  });

  return dbPromise;
}

function withOutboxStore<R>(
  mode: IDBTransactionMode,
  executor: (store: IDBObjectStore, resolve: (value: R) => void, tx: IDBTransaction) => void,
  fallback: () => R,
): Promise<R> {
  return openOutboxDb().then((db) => {
    if (!db) return fallback();
    return new Promise<R>((resolve) => {
      let settled = false;
      const done = (value: R) => {
        if (settled) return;
        settled = true;
        resolve(value);
      };

      try {
        const tx = db.transaction(OUTBOX_STORE_NAME, mode);
        const store = tx.objectStore(OUTBOX_STORE_NAME);
        tx.onerror = () => done(fallback());
        tx.onabort = () => done(fallback());
        executor(store, done, tx);
      } catch {
        done(fallback());
      }
    });
  });
}

function trimOutboxOverflow(store: IDBObjectStore): void {
  const keysReq = store.getAllKeys();
  keysReq.onsuccess = () => {
    const keys = Array.isArray(keysReq.result) ? keysReq.result : [];
    const excess = keys.length - MAX_OUTBOX_ENTRIES;
    if (excess > 0) {
      for (let i = 0; i < excess; i++) {
        try {
          store.delete(keys[i]);
        } catch {}
      }
    }
  };
}

/** Ajoute une enveloppe de synchronisation dans la file hors-ligne IndexedDB (bornée LRU). */
export function enqueueOutbox<T = unknown>(envelope: T, accountId?: string): Promise<number | null> {
  const record = {
    envelope,
    ...(accountId ? { accountId } : {}),
    createdAt: Date.now(),
  };
  return withOutboxStore<number | null>(
    'readwrite',
    (store, resolve, tx) => {
      let insertedId: number | null = null;
      const req = store.add(record);
      req.onsuccess = () => {
        trimOutboxOverflow(store);
        insertedId = typeof req.result === 'number' ? req.result : null;
      };
      req.onerror = () => resolve(null);
      tx.oncomplete = () => resolve(insertedId);
    },
    () => null,
  );
}

/** Compaction atomique : remplace les entrées d'un compte par une enveloppe fusionnée unique. */
export function replaceOutboxWith<T = unknown>(
  envelope: T,
  accountId = '',
  merge?: (incoming: T, current: T) => T,
): Promise<number | null> {
  const record = {
    envelope,
    ...(accountId ? { accountId } : {}),
    createdAt: Date.now(),
  };
  return withOutboxStore<number | null>(
    'readwrite',
    (store, resolve, tx) => {
      let insertedId: number | null = null;
      const allReq = store.getAll();
      allReq.onsuccess = () => {
        const rows = Array.isArray(allReq.result) ? allReq.result : [];
        for (const row of rows) {
          if (row && typeof row === 'object' && typeof (row as OutboxEntry<T>).id === 'number') {
            const owner = String((row as OutboxEntry<T>).accountId || '');
            if (!accountId || !owner || owner === accountId) {
              if (merge) record.envelope = merge(record.envelope, (row as OutboxEntry<T>).envelope);
              try {
                store.delete((row as OutboxEntry<T>).id);
              } catch {}
            }
          }
        }
        const addReq = store.add(record);
        addReq.onsuccess = () => {
          insertedId = typeof addReq.result === 'number' ? addReq.result : null;
          trimOutboxOverflow(store);
        };
      };
      tx.oncomplete = () => resolve(insertedId);
    },
    () => null,
  );
}

/** Lit les entrées en attente dans la file hors-ligne (filtrées par `accountId` si fourni). */
export function peekOutbox<T = unknown>(accountId?: string): Promise<Array<OutboxEntry<T>>> {
  return withOutboxStore<Array<OutboxEntry<T>>>(
    'readonly',
    (store, resolve) => {
      const req = store.getAll();
      req.onsuccess = () => {
        const rows = Array.isArray(req.result) ? req.result : [];
        const entries: Array<OutboxEntry<T>> = [];
        for (const row of rows) {
          if (row && typeof row === 'object' && typeof (row as OutboxEntry<T>).id === 'number') {
            const entry = row as OutboxEntry<T>;
            if (accountId && entry.accountId && entry.accountId !== accountId) continue;
            entries.push(entry);
          }
        }
        resolve(entries);
      };
      req.onerror = () => resolve([]);
    },
    () => [],
  );
}

/** Supprime de la file hors-ligne les entrées dont les identifiants ont été synchronisés. */
export function clearOutboxIds(ids: readonly number[]): Promise<number> {
  const uniqueIds = Array.from(new Set(ids.filter((id) => typeof id === 'number' && Number.isFinite(id))));
  if (uniqueIds.length === 0) return Promise.resolve(0);

  return withOutboxStore<number>(
    'readwrite',
    (store, resolve, tx) => {
      for (const id of uniqueIds) {
        try {
          store.delete(id);
        } catch {
          // Ignore invalid individual key deletion
        }
      }
      tx.oncomplete = () => resolve(uniqueIds.length);
    },
    () => 0,
  );
}

/** Vide intégralement la file hors-ligne (ex. déconnexion ou changement de compte). */
export function clearAllOutbox(): Promise<boolean> {
  return withOutboxStore<boolean>(
    'readwrite',
    (store, resolve, tx) => {
      store.clear();
      tx.oncomplete = () => resolve(true);
    },
    () => false,
  );
}

/** Retourne le nombre d'enveloppes actuellement en attente dans la file hors-ligne. */
export function countOutbox(): Promise<number> {
  return withOutboxStore<number>(
    'readonly',
    (store, resolve) => {
      const req = store.count();
      req.onsuccess = () => resolve(typeof req.result === 'number' ? req.result : 0);
      req.onerror = () => resolve(0);
    },
    () => 0,
  );
}
