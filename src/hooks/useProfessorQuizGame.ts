import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  professorClassroomService, type ProfessorClassroom,
} from '../services/professorClassroomService';
import { useProfessorAccess } from './useProfessorAccess';

const POLL_MS = 5_000;

type SyncStatus = 'loading' | 'online' | 'offline';

export function useProfessorQuizGame(classId: string, questionIndex: number, isAnswered: boolean) {
  const enabled = useProfessorAccess();
  const [classroom, setClassroom] = useState<ProfessorClassroom | null>(null);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('loading');
  const [reconnectTick, setReconnectTick] = useState(0);
  const classroomRef = useRef<ProfessorClassroom | null>(null);
  useEffect(() => { classroomRef.current = classroom; }, [classroom]);

  useEffect(() => {
    if (!enabled || !classId) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let controller: AbortController | null = null;
    let hasInitialRoster = false;
    let pollCount = 0;

    const schedule = (delay = POLL_MS) => {
      if (timer) clearTimeout(timer);
      if (active) timer = setTimeout(pull, delay);
    };

    const pull = async () => {
      if (!active) return;
      if (document.hidden) { schedule(POLL_MS); return; }
      controller?.abort();
      controller = new AbortController();
      try {
        pollCount += 1;
        const current = classroomRef.current;
        const refreshRoster = !hasInitialRoster || pollCount % 6 === 0;
        if (refreshRoster) {
          const next = await professorClassroomService.load(
            classId,
            current?.roster.version ?? 0,
            current?.live.version ?? 0,
            controller.signal,
          );
          if (!active) return;
          if (next.unchanged) { setSyncStatus('online'); schedule(POLL_MS); return; }
          setSyncStatus('online');
          hasInitialRoster = true;
          const fullClassroom = next as ProfessorClassroom;
          setClassroom(previous => {
            if (
              previous?.roster.version === fullClassroom.roster.version
              && previous?.live.version === fullClassroom.live.version
            ) return previous;
            return fullClassroom;
          });
        } else {
          const next = await professorClassroomService.loadLive(
            classId,
            current?.live.version ?? 0,
            controller.signal,
          );
          if (!active) return;
          if (next.unchanged) { setSyncStatus('online'); schedule(POLL_MS); return; }
          setSyncStatus('online');
          const nextLive = next as ProfessorClassroom['live'];
          setClassroom(previous => {
            if (!previous || nextLive.version <= previous.live.version) return previous;
            return { ...previous, live: nextLive };
          });
        }
        schedule(POLL_MS);
      } catch (error) {
        if (!active || (error instanceof DOMException && error.name === 'AbortError')) return;
        setSyncStatus('offline');
        schedule(Math.min(POLL_MS * 2, 15_000));
      }
    };

    const onVisible = () => { if (!document.hidden) schedule(50); };
    const onOnline = () => { setReconnectTick(t => t + 1); schedule(50); };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', onOnline);
    void pull();
    return () => {
      active = false;
      controller?.abort();
      if (timer) clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', onOnline);
    };
  }, [classId, enabled]);

  const students = useMemo(() => classroom?.roster.students || [], [classroom?.roster.students]);
  const assignedIndex = students.length ? questionIndex % students.length : 0;
  const assignedStudent = students[assignedIndex] || null;
  const answeredIds = useMemo(() => classroom?.live.answeredIds || [], [classroom?.live.answeredIds]);
  const answeredSet = useMemo(() => new Set(answeredIds), [answeredIds]);
  const answerStatus = useMemo(() => classroom?.live.answerStatus || {}, [classroom?.live.answerStatus]);
  const roundId = classroom?.live.roundId || 1;

  /** Marque la réponse d'un élève : correct / incorrect / neutre (optimiste + sync serveur). */
  const setAnswerStatus = useCallback((studentId: string, status: 'correct' | 'incorrect' | null) => {
    setClassroom(previous => previous ? {
      ...previous,
      live: {
        ...previous.live,
        answerStatus: (() => {
          const next = { ...(previous.live.answerStatus || {}) };
          if (status) next[studentId] = status;
          else delete next[studentId];
          return next;
        })(),
      },
    } : previous);
    void professorClassroomService.setAnswerStatus(classId, studentId, status).catch(() => undefined);
  }, [classId]);
  // La manche évolue sans re-déclencher l'envoi « answered » : on lit la valeur
  // courante au moment de l'envoi (ref), jamais comme dépendance d'effet.
  const roundIdRef = useRef(roundId);
  useEffect(() => { roundIdRef.current = roundId; }, [roundId]);

  useEffect(() => {
    if (!enabled || !students.length || !assignedStudent) return;
    let active = true;
    const payload = {
      currentStudentIndex: assignedIndex,
      questionIndex,
      roundId: roundIdRef.current,
      ...(isAnswered ? { answeredIds: [assignedStudent.id] } : {}),
    };
    void professorClassroomService.updateLive(classId, payload).then(nextLive => {
      if (!active || !nextLive) return;
      setSyncStatus('online');
      setClassroom(previous => (
        previous && nextLive.version >= previous.live.version
          ? { ...previous, live: nextLive }
          : previous
      ));
    }).catch(() => { if (active) setSyncStatus('offline'); });
    return () => { active = false; };
  }, [assignedIndex, assignedStudent, classId, enabled, isAnswered, questionIndex, reconnectTick, students.length]);

  return {
    enabled,
    classroom,
    students,
    assignedIndex,
    assignedStudent,
    answeredIds,
    answeredSet,
    answerStatus,
    setAnswerStatus,
    roundId,
    syncStatus,
    assignedAnswered: isAnswered || (assignedStudent ? answeredSet.has(assignedStudent.id) : false),
  };
}

export type ProfessorQuizGameState = ReturnType<typeof useProfessorQuizGame>;
