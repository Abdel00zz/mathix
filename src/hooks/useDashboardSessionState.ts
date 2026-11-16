import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { professorClassroomService, type SessionState } from '../services/professorClassroomService';
import { profContentService, type ClassEntry } from '../services/profContentService';
import { useSharedProfessorSession } from './useSharedProfessorSession';
import { resolvePilotedClassId, shouldStartNewSession } from '../components/ProfStudio/session/sessionHelpers';
import { AsyncThreadCoordinator } from '../utils/appWorkflow';
import type { ChapterInfo } from '../types';

export type DashboardModalId = 'orientation' | 'help' | 'notification' | 'settings';

interface UseDashboardSessionStateParams {
  accountClassId: string;
  profSession: boolean;
}

/**
 * Gère le pilotage de séance professeur (PC -> tablette), les modales avec
 * historique navigateur préservé et le catalogue des niveaux.
 */
export function useDashboardSessionState({ accountClassId, profSession }: UseDashboardSessionStateParams) {
  const [activeModal, setActiveModal] = useState<DashboardModalId | null>(null);
  const [optimisticSession, setOptimisticSession] = useState<{
    status: SessionState['status'];
    classId: string;
    baseSessionRef: SessionState;
  } | null>(null);
  const [sessionBusy, setSessionBusy] = useState(false);
  const [levelClasses, setLevelClasses] = useState<ClassEntry[]>([]);
  const [pilotedNotice, setPilotedNotice] = useState(false);
  const threadCoordinator = useMemo(() => new AsyncThreadCoordinator(), []);

  useEffect(() => {
    if (!profSession) {
      threadCoordinator.cancel('classroom_session');
    }
    return () => threadCoordinator.cancelAll();
  }, [profSession, threadCoordinator]);

  const sharedSession = useSharedProfessorSession(profSession, false, true);
  const liveSession = sharedSession.loaded ? sharedSession.session : null;
  const activeOptimistic = optimisticSession && optimisticSession.baseSessionRef === liveSession
    ? optimisticSession
    : null;

  const sessionStatus: SessionState['status'] = profSession
    ? (activeOptimistic?.status ?? liveSession?.status ?? 'idle')
    : 'idle';
  const sessionClassId = profSession
    ? (activeOptimistic?.classId ?? liveSession?.classId ?? '')
    : '';
  const focusClassId = profSession ? (liveSession?.focusClassId ?? '') : '';

  const effectiveClassId = profSession
    ? resolvePilotedClassId({
        status: sessionStatus,
        sessionClassId,
        focusClassId,
        accountClassId,
      })
    : accountClassId;

  const pilotedClassRef = useRef<string | null>(null);
  useEffect(() => {
    if (!profSession) return;
    const previous = pilotedClassRef.current;
    pilotedClassRef.current = effectiveClassId;
    if (previous === null || previous === effectiveClassId) return;
    const showTimer = window.setTimeout(() => setPilotedNotice(true), 0);
    const hideTimer = window.setTimeout(() => setPilotedNotice(false), 2800);
    return () => {
      window.clearTimeout(showTimer);
      window.clearTimeout(hideTimer);
    };
  }, [effectiveClassId, profSession]);

  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const controlSession = useCallback(async (status: SessionState['status']) => {
    if (!profSession || !effectiveClassId) return;
    const baseSessionRef = sharedSession.session;
    setSessionBusy(true);
    await threadCoordinator.run(
      'classroom_session',
      async ({ isCurrent }) => {
        try {
          const next = shouldStartNewSession(sessionStatus, status)
            ? await professorClassroomService.startSession(effectiveClassId)
            : await professorClassroomService.setSessionState({ status });
          if (!isCurrent() || !mountedRef.current) return;
          setOptimisticSession({ status: next.status, classId: next.classId || '', baseSessionRef });
        } catch {
          /* le prochain cycle de polling rétablit l'état réel */
        } finally {
          if (isCurrent() && mountedRef.current) {
            setSessionBusy(false);
          }
        }
      },
      { mode: 'supersede' },
    );
  }, [profSession, effectiveClassId, sessionStatus, sharedSession.session, threadCoordinator]);

  const recordSessionChapter = useCallback((chapter: ChapterInfo) => {
    if (!profSession || !effectiveClassId) return;
    void professorClassroomService.setSessionState({
      classId: effectiveClassId,
      chapterId: chapter.id,
      chapterTitle: chapter.title,
    }).catch(() => undefined);
  }, [profSession, effectiveClassId]);

  useEffect(() => {
    if (!profSession || sessionStatus !== 'running') return;
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = 'La séance est en cours : quitter la page va l\'arrêter.';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [profSession, sessionStatus]);

  useEffect(() => {
    if (!profSession) return;
    let active = true;
    profContentService.fetchClasses().then(list => { if (active) setLevelClasses(list); }).catch(() => {});
    return () => { active = false; };
  }, [profSession]);

  const handleCloseModal = useCallback(() => {
    if (window.history.state?.modal) {
      window.history.back();
    } else {
      setActiveModal(null);
    }
  }, []);

  const handleOpenModal = useCallback((modalId: DashboardModalId) => {
    if (activeModal === modalId) {
      handleCloseModal();
      return;
    }
    const baseState = window.history.state && typeof window.history.state === 'object' ? window.history.state : {};
    const nextState = { ...baseState, modal: modalId };
    if (activeModal) {
      window.history.replaceState(nextState, '', `#modal-${modalId}`);
    } else {
      window.history.pushState(nextState, '', `#modal-${modalId}`);
    }
    setActiveModal(modalId);
  }, [activeModal, handleCloseModal]);

  useEffect(() => {
    const handlePopState = (event: PopStateEvent) => {
      setActiveModal(event.state?.modal ?? null);
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  return {
    activeModal,
    effectiveClassId,
    levelClasses,
    pilotedNotice,
    sessionStatus,
    sessionBusy,
    controlSession,
    recordSessionChapter,
    handleOpenModal,
    handleCloseModal,
  };
}
