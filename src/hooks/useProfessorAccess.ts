import { useSyncExternalStore } from 'react';
import { professorSessionService } from '../services/professorSessionService';

const getServerSnapshot = () => false;

/** Réagit immédiatement à une promotion ou rétrogradation confirmée par le serveur. */
export function useProfessorAccess(): boolean {
  return useSyncExternalStore(
    professorSessionService.subscribe,
    professorSessionService.getSnapshot,
    getServerSnapshot,
  );
}
