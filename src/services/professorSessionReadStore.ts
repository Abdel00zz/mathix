import { professorClassroomService, SESSION_UPDATED_EVENT, type SessionState } from './professorClassroomService';
import { professorSessionService } from './professorSessionService';
import { idleBackoffFactor, pilotPollInterval, sessionPollInterval } from '../utils/syncPrefs';

type Snapshot = { session: SessionState; online: boolean; loaded: boolean };
type Subscriber = { listener: () => void; full: boolean; pilot: boolean };
const empty = (): Snapshot => ({ session: { status: 'idle' }, online: true, loaded: false });
let snapshot = empty();
const subscribers = new Set<Subscriber>();
let timer: ReturnType<typeof setTimeout> | undefined;
let request: AbortController | undefined;
let rerun = false;
/** Dernier signe d'activité : changement serveur, toucher, retour au premier plan. */
let lastActivityAt = Date.now();
const MAX_POLL_MS = 30_000;

function markActivity() {
  lastActivityAt = Date.now();
}

function schedule(delay?: number) {
  clearTimeout(timer);
  if (!subscribers.size) return;
  const interval = [...subscribers].some(s => s.pilot) ? pilotPollInterval() : sessionPollInterval();
  const live = snapshot.session.status === 'running' || snapshot.session.status === 'paused';
  const idle = idleBackoffFactor(Date.now() - lastActivityAt, live);
  timer = setTimeout(() => void pull(), delay ?? Math.min(interval * (snapshot.online ? 1 : 2) * idle, MAX_POLL_MS));
}

async function pull() {
  if (!subscribers.size || document.hidden) { schedule(); return; }
  if (request) { rerun = true; return; }
  const controller = new AbortController();
  request = controller;
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const session = await professorClassroomService.getSessionState({
      summary: ![...subscribers].some(s => s.full), signal: controller.signal,
    });
    if (request !== controller || !subscribers.size || !professorSessionService.isProfessor()) return;
    // Pas de nouveau rendu React si l'état serveur n'a pas changé.
    if (!snapshot.loaded || !snapshot.online || JSON.stringify(session) !== JSON.stringify(snapshot.session)) {
      if (!snapshot.loaded || JSON.stringify(session) !== JSON.stringify(snapshot.session)) markActivity();
      snapshot = { session, online: true, loaded: true };
      subscribers.forEach(s => s.listener());
    }
  } catch {
    if (request === controller && subscribers.size) {
      snapshot = { ...snapshot, online: false };
      subscribers.forEach(s => s.listener());
    }
  } finally {
    clearTimeout(timeout);
    if (request === controller) {
      request = undefined;
      schedule(rerun ? 0 : undefined);
      rerun = false;
    }
  }
}

const refresh = () => { if (!document.hidden) { markActivity(); schedule(0); } };

export const professorSessionReadStore = {
  getSnapshot: () => snapshot,
  subscribe(listener: () => void, full = false, pilot = false) {
    const subscriber = { listener, full, pilot };
    const first = subscribers.size === 0;
    subscribers.add(subscriber);
    if (first) {
      document.addEventListener('visibilitychange', refresh);
      window.addEventListener('online', refresh);
      window.addEventListener(SESSION_UPDATED_EVENT, refresh);
      window.addEventListener('pointerdown', markActivity, { passive: true });
    }
    markActivity();
    schedule(0);
    return () => {
      subscribers.delete(subscriber);
      if (!subscribers.size) {
        clearTimeout(timer);
        request?.abort();
        request = undefined;
        rerun = false;
        snapshot = empty();
        document.removeEventListener('visibilitychange', refresh);
        window.removeEventListener('online', refresh);
        window.removeEventListener(SESSION_UPDATED_EVENT, refresh);
        window.removeEventListener('pointerdown', markActivity);
      }
    };
  },
};
