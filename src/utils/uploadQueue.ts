/**
 * File d'envoi avec reprise, pour les copies cloud qui ne doivent pas se perdre
 * sur un simple raté réseau.
 *
 * Avant : l'image du canvas était envoyée une seule fois, `catch` vide. Hors
 * ligne, ou sur une erreur serveur passagère, la copie n'existait jamais et
 * l'autre appareil affichait « Image introuvable » pour toujours.
 *
 * Règles :
 *  - une erreur définitive (fichier refusé : trop gros, format invalide) n'est
 *    JAMAIS rejouée, ce serait de la charge inutile ;
 *  - une erreur passagère est rejouée avec un délai croissant, puis mise en
 *    attente jusqu'au prochain retour en ligne (`retryAll`) ;
 *  - un envoi à la fois par identifiant.
 */
export interface UploadQueueOptions<T> {
  send: (id: string, payload: T) => Promise<void>;
  /** Vrai si l'erreur ne se corrigera pas en réessayant. */
  isPermanent?: (error: unknown) => boolean;
  baseDelayMs?: number;
  maxDelayMs?: number;
  /** Tentatives automatiques avant mise en attente du prochain `retryAll`. */
  maxAttempts?: number;
}

export interface UploadQueue<T> {
  enqueue(id: string, payload: T): void;
  /** Relance tout ce qui attend (retour en ligne, reconnexion). */
  retryAll(): void;
  has(id: string): boolean;
  size(): number;
}

/** Statuts HTTP qu'un nouvel essai ne changera pas. */
const PERMANENT_STATUSES = new Set([400, 413, 415, 422]);

export function isPermanentUploadError(error: unknown): boolean {
  const status = (error as { status?: unknown } | null)?.status;
  return typeof status === 'number' && PERMANENT_STATUSES.has(status);
}

export function createUploadQueue<T>(options: UploadQueueOptions<T>): UploadQueue<T> {
  const {
    send,
    isPermanent = isPermanentUploadError,
    baseDelayMs = 2_000,
    maxDelayMs = 30_000,
    maxAttempts = 4,
  } = options;

  const pending = new Map<string, T>();
  const attempts = new Map<string, number>();
  const timers = new Map<string, ReturnType<typeof setTimeout>>();
  const inFlight = new Set<string>();

  const forget = (id: string) => {
    pending.delete(id);
    attempts.delete(id);
    const timer = timers.get(id);
    if (timer) clearTimeout(timer);
    timers.delete(id);
  };

  async function run(id: string): Promise<void> {
    if (inFlight.has(id)) return;
    const payload = pending.get(id);
    if (payload === undefined) return;
    inFlight.add(id);
    try {
      await send(id, payload);
      forget(id);
    } catch (error) {
      if (isPermanent(error)) { forget(id); return; }
      const tried = (attempts.get(id) || 0) + 1;
      attempts.set(id, tried);
      // Au-delà du plafond, on garde l'élément pour le prochain `retryAll`.
      if (tried >= maxAttempts || !pending.has(id)) return;
      const delay = Math.min(maxDelayMs, baseDelayMs * 2 ** (tried - 1));
      timers.set(id, setTimeout(() => { timers.delete(id); void run(id); }, delay));
    } finally {
      inFlight.delete(id);
    }
  }

  return {
    enqueue(id, payload) {
      pending.set(id, payload);
      attempts.delete(id);
      const timer = timers.get(id);
      if (timer) clearTimeout(timer);
      timers.delete(id);
      void run(id);
    },
    retryAll() {
      for (const id of [...pending.keys()]) {
        attempts.delete(id);
        const timer = timers.get(id);
        if (timer) clearTimeout(timer);
        timers.delete(id);
        void run(id);
      }
    },
    has: id => pending.has(id),
    size: () => pending.size,
  };
}
