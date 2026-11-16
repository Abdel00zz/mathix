/**
 * Synchronisation tablette ↔ PC — options de transport.
 *
 * Le canal de base reste le polling Redis (fiable, fonctionne sur n'importe
 * quel réseau). « Synchronisation rapide » est une option qui réduit
 * l'intervalle de polling pour un ressenti quasi temps réel sur le même réseau
 * (WiFi de la classe). Le choix vit en localStorage (préférence d'appareil).
 */

const FAST_SYNC_KEY = 'mathplus:prof-fast-sync';

const FAST_POLL_MS = 1200;
const NORMAL_POLL_MS = 4000;
const PILOT_POLL_MS = 1500;

export function isFastSync(): boolean {
  try { return localStorage.getItem(FAST_SYNC_KEY) === '1'; } catch { return false; }
}

export function setFastSync(enabled: boolean): void {
  try { localStorage.setItem(FAST_SYNC_KEY, enabled ? '1' : '0'); } catch { /* stockage restreint */ }
}

/** Intervalle de polling selon l'option de synchronisation. */
export function sessionPollInterval(): number {
  return isFastSync() ? FAST_POLL_MS : NORMAL_POLL_MS;
}

/**
 * Intervalle de suivi du pilotage (tablette du professeur uniquement).
 *
 * C'est la boucle qui fait basculer la tablette quand le PC ouvre une autre
 * classe : elle doit rester serrée pour que la bascule paraisse immédiate. Un
 * seul appareil la tient, pour une requête minuscule — d'où une cadence plus
 * rapide que le polling général, même sans « synchronisation rapide ».
 */
export function pilotPollInterval(): number {
  return isFastSync() ? FAST_POLL_MS : PILOT_POLL_MS;
}

const IDLE_SLOW_AFTER_MS = 2 * 60_000;
const IDLE_SLOWER_AFTER_MS = 10 * 60_000;

/**
 * Ralentissement du sondage quand plus rien ne bouge.
 *
 * Chaque tour de sondage est facturé en commandes Redis, et une tablette
 * laissée allumée sur le tableau de bord sondait à plein régime toute la
 * journée, séance ou non. Tant qu'une séance est en cours, ou tant que
 * l'option « synchronisation rapide » est active, la cadence ne change pas.
 * Sinon : ×2 après 2 min sans changement, ×4 après 10 min. Le moindre
 * changement, toucher d'écran ou retour au premier plan rétablit la cadence.
 */
export function idleBackoffFactor(idleMs: number, sessionLive: boolean): number {
  if (sessionLive || isFastSync()) return 1;
  if (idleMs >= IDLE_SLOWER_AFTER_MS) return 4;
  if (idleMs >= IDLE_SLOW_AFTER_MS) return 2;
  return 1;
}
