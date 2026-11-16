import { useEffect, useMemo, useRef, useState } from 'react';
import {
  professorClassroomService,
  type ClassroomLiveState,
  type ClassroomRoster,
} from '../../../services/professorClassroomService';
import type { RosterSyncState } from './types';

const SAVE_DELAY_MS = 650;

interface RotationControllerOptions {
  classId: string;
  roster: ClassroomRoster;
  setRoster: React.Dispatch<React.SetStateAction<ClassroomRoster>>;
  live: ClassroomLiveState;
  setLive: React.Dispatch<React.SetStateAction<ClassroomLiveState>>;
}

export function useRotationController({
  classId,
  roster,
  setRoster,
  live,
  setLive,
}: RotationControllerOptions) {
  const [syncState, setSyncState] = useState<RosterSyncState>('saved');
  const rosterRef = useRef(roster);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveInFlight = useRef(false);
  const saveRequested = useRef(false);

  useEffect(() => { rosterRef.current = roster; }, [roster]);
  useEffect(() => () => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
  }, [classId]);

  async function persistRoster(snapshot: ClassroomRoster) {
    if (saveInFlight.current) {
      saveRequested.current = true;
      return;
    }
    saveInFlight.current = true;
    saveRequested.current = false;
    setSyncState('saving');
    try {
      const saved = await professorClassroomService.saveRoster(classId, snapshot);
      rosterRef.current = saved;
      setRoster(saved);
      setSyncState('saved');
    } catch (error) {
      setSyncState((error as { code?: string })?.code === 'roster_conflict' ? 'conflict' : 'error');
    } finally {
      saveInFlight.current = false;
      if (saveRequested.current) void persistRoster(rosterRef.current);
    }
  }

  const markDirty = () => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    setSyncState('pending');
    saveTimer.current = setTimeout(() => void persistRoster(rosterRef.current), SAVE_DELAY_MS);
  };

  const patchRoster = (change: (current: ClassroomRoster) => ClassroomRoster) => {
    const next = change(rosterRef.current);
    rosterRef.current = next;
    setRoster(next);
    markDirty();
  };

  const inRotation = (name: string) => (
    roster.students.some(student => student.name.trim().toLowerCase() === name.trim().toLowerCase())
  );

  const importStudent = (name: string) => {
    const normalizedName = name.trim().toLowerCase();
    if (rosterRef.current.students.some(student => student.name.trim().toLowerCase() === normalizedName)) return;
    patchRoster(current => ({
      ...current,
      students: [
        ...current.students,
        { id: `enrolled_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`, name },
      ],
    }));
  };

  const moveStudent = (index: number, direction: -1 | 1) => {
    patchRoster(current => {
      const destination = index + direction;
      if (destination < 0 || destination >= current.students.length) return current;
      const students = current.students.slice();
      const [student] = students.splice(index, 1);
      students.splice(destination, 0, student);
      return { ...current, students };
    });
  };

  const removeStudent = (index: number) => {
    patchRoster(current => ({
      ...current,
      students: current.students.filter((_, studentIndex) => studentIndex !== index),
    }));
  };

  const renameStudent = (index: number, name: string) => {
    patchRoster(current => ({
      ...current,
      students: current.students.map((student, studentIndex) => (
        studentIndex === index ? { ...student, name } : student
      )),
    }));
  };

  const setGroupTitle = (title: string) => patchRoster(current => ({ ...current, title }));

  const resetSession = async () => {
    try {
      const next = await professorClassroomService.updateLive(classId, {
        reset: true,
        currentStudentIndex: 0,
        questionIndex: 0,
      });
      if (next) setLive(next);
    } catch { /* La prochaine synchronisation récupérera l'état courant. */ }
  };

  const answeredIds = useMemo(() => new Set(live.answeredIds || []), [live.answeredIds]);
  const answeredCount = roster.students.filter(student => answeredIds.has(student.id)).length;
  const participation = roster.students.length
    ? Math.round((answeredCount / roster.students.length) * 100)
    : 0;
  const syncLabel = syncState === 'saved' ? 'Liste synchronisée'
    : syncState === 'pending' ? 'Modifications en attente'
    : syncState === 'saving' ? 'Synchronisation…'
    : syncState === 'conflict' ? 'Conflit — recharger la page'
    : 'Erreur de synchronisation';

  return {
    syncState,
    syncLabel,
    answeredIds,
    answeredCount,
    participation,
    inRotation,
    importStudent,
    moveStudent,
    removeStudent,
    renameStudent,
    setGroupTitle,
    resetSession,
  };
}
