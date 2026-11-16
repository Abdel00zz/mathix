import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { professorAttendanceStore } from '../services/professorAttendanceStore';

/**
 * Présence de la séance pour une classe, réactive aux changements d'appel.
 *
 * `loaded` distingue « aucun présent » de « pas encore lu » : la page de séance
 * ne se saute que dans le premier cas. Passer `undefined` (hors mode prof)
 * n'interroge pas le serveur.
 */
export function useProfessorAttendance(classId: string | undefined) {
  const snapshot = useSyncExternalStore(
    professorAttendanceStore.subscribe,
    professorAttendanceStore.getSnapshot,
    professorAttendanceStore.getSnapshot,
  );

  useEffect(() => {
    if (classId) void professorAttendanceStore.refresh(classId);
  }, [classId]);

  return useMemo(() => {
    const loaded = !!classId && snapshot.loaded && snapshot.classId === classId;
    const presentIds = loaded ? snapshot.presentIds : [];
    return {
      loaded,
      presentIds,
      presentCount: presentIds.length,
      refresh: () => (classId ? professorAttendanceStore.refresh(classId) : Promise.resolve()),
    };
  }, [snapshot, classId]);
}
