/**
 * Overrides de contenu publiés depuis l'admin (stockés dans Redis via
 * /api/content). Le manifest — la liste des chemins remplacés et leur
 * version — est chargé au boot puis rafraîchi à faible fréquence pour les
 * sessions professeur ; `resolveDataUrl` redirige ensuite les chemins
 * remplacés vers l'API.
 *
 * Tolérant aux pannes : si l'API est indisponible, l'app sert simplement
 * les fichiers statiques d'origine (manifest vide).
 */

type OverrideManifest = Record<string, number>;

let manifestPromise: Promise<OverrideManifest> | null = null;
let currentManifest: OverrideManifest = {};
let manifestFingerprint = '';
let manifestCacheToken = '0';

export const CONTENT_OVERRIDES_UPDATED_EVENT = 'mathplus:content-overrides-updated';

function fingerprint(manifest: OverrideManifest): string {
  return Object.entries(manifest)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([path, version]) => `${path}:${version}`)
    .join('|');
}

/** Clé compacte et déterministe utilisée par les caches dérivés du contenu. */
function compactFingerprint(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function commitManifest(manifest: OverrideManifest): OverrideManifest {
  currentManifest = manifest;
  manifestFingerprint = fingerprint(manifest);
  manifestCacheToken = compactFingerprint(manifestFingerprint);
  return manifest;
}

/** Version du manifeste courant pour invalider les caches locaux dérivés. */
export function getContentOverrideCacheToken(): string {
  return manifestCacheToken;
}

async function loadManifest(): Promise<OverrideManifest> {
  try {
    const res = await fetch('/api/content?action=manifest', { cache: 'no-store', credentials: 'same-origin' });
    if (!res.ok) return currentManifest;
    const data = await res.json();
    return data.files && typeof data.files === 'object' && !Array.isArray(data.files) ? data.files : currentManifest;
  } catch {
    return currentManifest;
  }
}

function notifyManifestDiff(previous: OverrideManifest, next: OverrideManifest): void {
  if (typeof window === 'undefined' || typeof CustomEvent === 'undefined') return;
  const changedPaths = Array.from(new Set([...Object.keys(previous), ...Object.keys(next)]))
    .filter(path => previous[path] !== next[path]);
  if (changedPaths.length > 0) {
    window.dispatchEvent(new CustomEvent(CONTENT_OVERRIDES_UPDATED_EVENT, { detail: { changedPaths } }));
  }
}

/** Précharge le manifest des overrides (appelé au boot, idempotent). */
export function initContentOverrides(): Promise<OverrideManifest> {
  if (!manifestPromise) {
    manifestPromise = loadManifest().then(commitManifest);
  }
  return manifestPromise;
}

/**
 * Recharge le manifest après la connexion ou l'application d'une mise à jour :
 * la classe de l'utilisateur n'est connue qu'à ce moment, or le manifest
 * fusionne officiel + classe.
 */
export function refreshContentOverrides(): Promise<OverrideManifest> {
  manifestPromise = loadManifest().then(next => {
    const previous = currentManifest;
    const hadPrevious = manifestFingerprint.length > 0;
    const nextFp = fingerprint(next);
    commitManifest(next);
    if (hadPrevious && nextFp !== fingerprint(previous)) {
      notifyManifestDiff(previous, next);
    }
    return next;
  });
  return manifestPromise;
}

/**
 * Répercute immédiatement en mémoire une publication ou suppression locale
 * du Studio sans attendre le prochain cycle de polling.
 */
export function recordContentOverride(path: string, version: number | null): void {
  const clean = normalizeDataPath(path);
  if (!clean.startsWith('data/')) return;
  const previous = currentManifest;
  const next: OverrideManifest = { ...previous };
  if (version === null) {
    if (next[clean] === undefined) return;
    delete next[clean];
  } else {
    if (next[clean] === version) return;
    next[clean] = version;
  }
  commitManifest(next);
  manifestPromise = Promise.resolve(next);
  notifyManifestDiff(previous, next);
}

/**
 * Sur une tablette professeur, détecte une publication faite depuis le PC.
 * La boucle est séquentielle, suspendue en arrière-plan et nettoyable.
 */
export function startContentOverrideSync(intervalMs = 5_000): () => void {
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const schedule = (delay = intervalMs) => {
    if (timer) clearTimeout(timer);
    if (!stopped) timer = setTimeout(pull, delay);
  };

  const pull = async () => {
    if (stopped) return;
    if (typeof document !== 'undefined' && document.hidden) {
      schedule(intervalMs);
      return;
    }
    const next = await loadManifest();
    if (stopped) return;
    const nextFingerprint = fingerprint(next);
    if (nextFingerprint !== manifestFingerprint) {
      const previous = currentManifest;
      commitManifest(next);
      manifestPromise = Promise.resolve(next);
      const changedPaths = Array.from(new Set([...Object.keys(previous), ...Object.keys(next)]))
        .filter(path => previous[path] !== next[path]);
      window.dispatchEvent(new CustomEvent(CONTENT_OVERRIDES_UPDATED_EVENT, { detail: { changedPaths } }));
    }
    schedule(intervalMs);
  };

  const onVisible = () => { if (!document.hidden) schedule(100); };
  document.addEventListener('visibilitychange', onVisible);
  void initContentOverrides().finally(() => schedule(intervalMs));
  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
    document.removeEventListener('visibilitychange', onVisible);
  };
}

/** Normalise un chemin de données : sans slash de tête (`data/…`). */
function normalizeDataPath(path: string): string {
  return path.replace(/^\//, '');
}

/**
 * URL effective d'un fichier de données : version admin (Redis) si le chemin
 * a été remplacé, sinon le fichier statique d'origine. `?v={updatedAt}`
 * garantit l'invalidation de cache à chaque nouvelle publication.
 */
export async function resolveDataUrl(path: string): Promise<string> {
  const clean = normalizeDataPath(path);
  if (!clean.startsWith('data/')) return path;
  const files = await initContentOverrides();
  const version = files[clean];
  if (version === undefined) return path;
  return `/api/content?action=file&path=${encodeURIComponent(clean)}&v=${version}`;
}
