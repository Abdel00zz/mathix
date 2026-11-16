import { useEffect, useRef } from 'react';
import { professorClassroomService, type SessionActivity } from '../services/professorClassroomService';
import { useProfessorAccess } from './useProfessorAccess';
import { useSharedProfessorSession } from './useSharedProfessorSession';
import { createLatestActivitySync } from '../services/latestActivitySync';

/**
 * Pousse l'activité de séance vers le PC (séance Redis) toutes les 4 s, tant que
 * le contenu change : position temps réel (exercice N, question N, paragraphe de
 * révision), exercices ouverts, traits manuscrits et réponses de quiz. Actif
 * uniquement en session professeur (tablette) — les élèves ne transmettent rien.
 */
export function useSessionActivitySync(
  classId: string | undefined,
  build: () => SessionActivity | null,
): void {
  const enabled = useProfessorAccess();
  const buildRef = useRef(build);
  useEffect(() => { buildRef.current = build; });
  const { session, loaded } = useSharedProfessorSession(enabled && !!classId);
  const startedAt = session.startedAt;
  const canSync = loaded && (session.status === 'running' || session.status === 'paused') && session.classId === classId;

  useEffect(() => {
    if (!enabled || !classId || !canSync) return;
    const queue = createLatestActivitySync<SessionActivity>((payload, keepalive) =>
      professorClassroomService.recordSessionActivity(classId, payload, { startedAt, keepalive }),
    );
    const sync = (leaving = false) => {
      const payload = buildRef.current();
      if (!payload) return;
      // keepalive est réservé aux petits corps ; les gros canvas restent en POST normal.
      const keepalive = leaving && new Blob([JSON.stringify(payload)]).size < 60_000;
      void queue.submit(payload, keepalive);
    };
    sync();
    const timer = window.setInterval(() => { if (!document.hidden) sync(); }, 4000);
    const onOnline = () => sync();
    const onVisibility = () => sync(document.hidden);
    const onPageHide = () => sync(true);
    window.addEventListener('online', onOnline);
    window.addEventListener('pagehide', onPageHide);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('pagehide', onPageHide);
      document.removeEventListener('visibilitychange', onVisibility);
      sync(true);
    };
  }, [enabled, classId, canSync, startedAt]);
}
