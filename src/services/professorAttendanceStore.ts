/**
 * Présence de la séance — source unique et réactive.
 *
 * Les élèves présents vivent côté serveur dans un ensemble séparé de
 * `SessionState`. Ce store les charge une fois par classe, les republie aux
 * abonnés (`useSyncExternalStore`) et se resynchronise à chaque changement de
 * séance : déclarer un présent depuis le PC **ou** depuis la tablette suffit
 * donc à activer, sans rechargement, les surfaces qui en dépendent (page de
 * séance, compteurs, impression).
 */
import { professorClassroomService, SESSION_UPDATED_EVENT } from './professorClassroomService';
import { professorSessionService } from './professorSessionService';

export type AttendanceSnapshot = {
  /** Classe dont la liste est publiée — `''` tant qu'aucune n'est chargée. */
  classId: string;
  presentIds: string[];
  loaded: boolean;
};

const emptySnapshot: AttendanceSnapshot = { classId: '', presentIds: [], loaded: false };
let snapshot: AttendanceSnapshot = emptySnapshot;
const listeners = new Set<() => void>();
const inFlight = new Map<string, Promise<void>>();
let listening = false;

const publish = (next: AttendanceSnapshot): void => {
  snapshot = next;
  listeners.forEach(listener => listener());
};

/** Un changement de séance (appel compris) peut avoir modifié la présence. */
const onSessionUpdated = (): void => {
  if (snapshot.classId) void refresh(snapshot.classId);
};

async function refresh(classId: string): Promise<void> {
  if (!classId || !professorSessionService.isProfessor()) return;
  const running = inFlight.get(classId);
  if (running) return running;
  const task = (async () => {
    try {
      const presentIds = await professorClassroomService.getPresent(classId);
      publish({ classId, presentIds: [...presentIds], loaded: true });
    } catch {
      // Lecture impossible : on ne bloque jamais l'ouverture d'une activité.
      publish({ classId, presentIds: snapshot.classId === classId ? snapshot.presentIds : [], loaded: false });
    } finally {
      inFlight.delete(classId);
    }
  })();
  inFlight.set(classId, task);
  return task;
}

export const professorAttendanceStore = {
  getSnapshot: (): AttendanceSnapshot => snapshot,

  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    if (!listening) {
      listening = true;
      window.addEventListener(SESSION_UPDATED_EVENT, onSessionUpdated);
    }
    if (snapshot.classId) void refresh(snapshot.classId);
    return () => {
      listeners.delete(listener);
      if (listeners.size) return;
      listening = false;
      window.removeEventListener(SESSION_UPDATED_EVENT, onSessionUpdated);
      inFlight.clear();
      snapshot = emptySnapshot;
    };
  },

  refresh,

  /**
   * Écriture locale (l'appareil qui vient d'enregistrer l'appel) : la liste est
   * publiée immédiatement, sans attendre l'aller-retour serveur.
   */
  apply(classId: string, presentIds: string[]): void {
    if (!classId) return;
    publish({ classId, presentIds: [...presentIds], loaded: true });
  },
};
