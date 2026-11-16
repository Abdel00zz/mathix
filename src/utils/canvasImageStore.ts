/**
 * Stockage primaire LOCAL des images du canvas — IndexedDB. Pour un compte
 * professeur, une copie est synchronisée afin que le même document s'ouvre
 * aussi sur le PC.
 *
 * Pourquoi IndexedDB et pas la slice localStorage des annotations :
 *   • quota : localStorage plafonne à ~5 Mo par origine, TOUTES clés confondues.
 *     Une seule photo en base64 le sature — et l'écriture qui échoue ferait
 *     perdre les annotations manuscrites de l'élève, silencieusement ;
 *   • base64 gonfle le binaire de ~33 % ; IndexedDB stocke le Blob tel quel ;
 *   • l'écriture est asynchrone : elle ne bloque pas le thread pendant le tracé.
 *
 * Les marques ne référencent qu'une clé (`ImageMark.ref`). Le binaire vit ici.
 */

import { teacherCanvasSyncService } from '../services/teacherCanvasSyncService';
import { createUploadQueue } from './uploadQueue';

const DB_NAME = 'mathplus-canvas-images';
const DB_VERSION = 1;
const STORE = 'blobs';

export interface StoredImage {
  id: string;
  blob: Blob;
  /** Dimensions du binaire STOCKÉ (après redimensionnement à l'import). */
  width: number;
  height: number;
  /** Rapport l/h natif, figé à l'import — source de vérité des proportions. */
  ratio: number;
  bytes: number;
  createdAt: number;
}

const hasIDB = typeof indexedDB !== 'undefined';

function blobToDataUri(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

function dataUriToBlob(dataUri: string): Blob {
  const [header, encoded] = dataUri.split(',', 2);
  const mime = /data:([^;]+)/.exec(header)?.[1] || 'image/webp';
  const bytes = Uint8Array.from(atob(encoded), char => char.charCodeAt(0));
  return new Blob([bytes], { type: mime });
}

type CloudImage = Parameters<typeof teacherCanvasSyncService.saveImage>[1];

/**
 * Copies cloud en attente. Une image enregistrée en local mais jamais envoyée
 * s'afficherait « introuvable » sur l'autre appareil : l'envoi est rejoué après
 * un raté et à chaque retour en ligne (voir uploadQueue).
 */
const cloudUploads = createUploadQueue<CloudImage>({
  send: (id, payload) => teacherCanvasSyncService.saveImage(id, payload),
});
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => cloudUploads.retryAll());
}

let dbPromise: Promise<IDBDatabase | null> | null = null;

function openDB(): Promise<IDBDatabase | null> {
  if (!hasIDB) return Promise.resolve(null);
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    let request: IDBOpenDBRequest;
    try {
      request = indexedDB.open(DB_NAME, DB_VERSION);
    } catch {
      // Navigation privée / stockage bloqué : on dégrade sans casser le canvas.
      resolve(null);
      return;
    }
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' });
    };
    request.onsuccess = () => {
      const db = request.result;
      // Un autre onglet demande une migration : on libère, sinon il reste bloqué.
      db.onversionchange = () => { db.close(); dbPromise = null; };
      resolve(db);
    };
    request.onerror = () => resolve(null);
    request.onblocked = () => resolve(null);
  });
  return dbPromise;
}

function tx<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T | null> {
  return openDB().then((db) => {
    if (!db) return null;
    return new Promise<T | null>((resolve) => {
      let request: IDBRequest<T>;
      try {
        request = run(db.transaction(STORE, mode).objectStore(STORE));
      } catch {
        resolve(null);
        return;
      }
      request.onsuccess = () => resolve(request.result ?? null);
      request.onerror = () => resolve(null);
    });
  });
}

/** Identifiant opaque et non devinable, indépendant du contenu. */
function newId(): string {
  const rnd = typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  return `img_${rnd}`;
}

export const canvasImageStore = {
  /** Écrit une image et renvoie sa clé, ou null si le stockage est indisponible. */
  async put(input: Omit<StoredImage, 'id' | 'createdAt'>): Promise<string | null> {
    const record: StoredImage = { ...input, id: newId(), createdAt: Date.now() };
    const ok = await tx('readwrite', (store) => store.put(record) as IDBRequest<IDBValidKey>);
    if (ok === null) return null;
    void blobToDataUri(record.blob).then((dataUri) => {
      cloudUploads.enqueue(record.id, {
        dataUri, width: record.width, height: record.height, ratio: record.ratio,
        bytes: record.bytes, createdAt: record.createdAt,
      });
    }).catch(() => undefined);
    return record.id;
  },

  async get(id: string): Promise<StoredImage | null> {
    const local = await tx<StoredImage>('readonly', (store) => store.get(id) as IDBRequest<StoredImage>);
    if (local) return local;
    try {
      const cloud = await teacherCanvasSyncService.loadImage(id);
      if (!cloud) return null;
      const record: StoredImage = { ...cloud, id, blob: dataUriToBlob(cloud.dataUri) };
      await tx('readwrite', (store) => store.put(record) as IDBRequest<IDBValidKey>);
      return record;
    } catch { return null; }
  },

  async remove(id: string): Promise<void> {
    await tx('readwrite', (store) => store.delete(id) as unknown as IDBRequest<undefined>);
  },

  /**
   * Supprime les binaires qu'aucune marque ne référence plus (image effacée,
   * annulée puis re-refaite…). Sans ça, IndexedDB gonflerait indéfiniment.
   */
  async collectGarbage(referenced: Set<string>): Promise<number> {
    const keys = await tx<IDBValidKey[]>('readonly', (store) => store.getAllKeys());
    if (!keys) return 0;
    const orphans = keys.filter((k) => typeof k === 'string' && !referenced.has(k)) as string[];
    for (const id of orphans) await canvasImageStore.remove(id);
    return orphans.length;
  },

  /** Images enregistrées en local dont la copie cloud n'est pas encore partie. */
  pendingCloudUploads(): number {
    return cloudUploads.size();
  },

  /** Place occupée par les images, en octets (diagnostic / garde-fou UI). */
  async usage(): Promise<number> {
    const all = await tx<StoredImage[]>('readonly', (store) => store.getAll());
    return (all || []).reduce((sum, r) => sum + (r.bytes || 0), 0);
  },
};
