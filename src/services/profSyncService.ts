/**
 * Veille des mises à jour proposées au professeur.
 *
 * Depuis l'activation de son badge, le contenu officiel ne descend plus tout
 * seul : l'administration *propose*, le professeur *applique*. Cette boucle
 * surveille l'arrivée d'une proposition ou d'un message et réveille le centre
 * de mise à jour, sur le patron de `startContentOverrideSync`.
 *
 * Tolérante aux pannes : une API muette laisse simplement l'état précédent.
 */

import { profContentService } from './profContentService';
import { EMPTY_STATUS, type SyncStatus } from './contentSyncTypes';
import { sessionPollInterval } from '../utils/syncPrefs';

export const PROF_SYNC_UPDATED_EVENT = 'mathplus:prof-sync-updated';
export const PROF_SYNC_OPEN_EVENT = 'mathplus:prof-sync-open';

/**
 * Canal volontairement lent : une proposition est un événement rare, pas un
 * geste de séance. On garde la préférence de l'appareil comme base — la
 * « synchronisation rapide » resserre tout — mais multipliée, et un retour au
 * premier plan déclenche de toute façon une lecture immédiate.
 */
const POLL_FACTOR = 5;

const SNOOZE_KEY = 'mathplus:prof-sync-snoozed';

let currentStatus: SyncStatus = EMPTY_STATUS;
let started = false;

function fingerprint(status: SyncStatus): string {
  return [status.pending, status.lastProposal?.id || '', status.unread, status.lastMessageAt].join('|');
}

/** Dernier état connu, sans requête (rendu initial des pastilles). */
export function profSyncStatus(): SyncStatus {
  return currentStatus;
}

/** Propositions que le professeur a repoussées d'un « Plus tard ». */
function snoozed(): string[] {
  try { return JSON.parse(sessionStorage.getItem(SNOOZE_KEY) || '[]'); } catch { return []; }
}

/** Repousse l'alerte de cette proposition pour la session en cours. */
export function snoozeProposal(id: string): void {
  if (!id) return;
  try { sessionStorage.setItem(SNOOZE_KEY, JSON.stringify([...new Set([...snoozed(), id])].slice(-20))); }
  catch { /* stockage restreint : l'alerte reviendra, sans dommage */ }
  window.dispatchEvent(new CustomEvent(PROF_SYNC_UPDATED_EVENT, { detail: { status: currentStatus } }));
}

/** L'alerte doit-elle s'ouvrir d'elle-même ? Non si elle a déjà été repoussée. */
export function shouldAlert(status: SyncStatus): boolean {
  const id = status.lastProposal?.id;
  return Boolean(id) && !snoozed().includes(String(id));
}

async function pull(): Promise<SyncStatus> {
  try {
    const next = await profContentService.fetchSyncStatus();
    if (fingerprint(next) !== fingerprint(currentStatus)) {
      currentStatus = next;
      window.dispatchEvent(new CustomEvent(PROF_SYNC_UPDATED_EVENT, { detail: { status: next } }));
    } else {
      currentStatus = next;
    }
  } catch { /* réseau muet : on garde l'état précédent */ }
  return currentStatus;
}

/** Relit l'état tout de suite (après une application, un refus, un envoi). */
export function refreshProfSync(): Promise<SyncStatus> {
  return pull();
}

/** Ouvre le centre de mise à jour depuis n'importe où (accueil de classe). */
export function openProfSyncCenter(): void {
  window.dispatchEvent(new Event(PROF_SYNC_OPEN_EVENT));
}

/** Démarre la veille. Idempotent : un seul poste de veille par fenêtre. */
export function startProfSyncWatch(): () => void {
  if (started) return () => {};
  started = true;
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const interval = () => sessionPollInterval() * POLL_FACTOR;
  const schedule = (delay = interval()) => {
    if (timer) clearTimeout(timer);
    if (!stopped) timer = setTimeout(loop, delay);
  };
  const loop = async () => {
    if (stopped) return;
    if (typeof document !== 'undefined' && document.hidden) {
      schedule();
      return;
    }
    await pull();
    schedule();
  };

  const onVisible = () => { if (!document.hidden) schedule(200); };
  document.addEventListener('visibilitychange', onVisible);
  void loop();

  return () => {
    stopped = true;
    started = false;
    if (timer) clearTimeout(timer);
    document.removeEventListener('visibilitychange', onVisible);
  };
}
