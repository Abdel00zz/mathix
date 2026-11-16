import { useEffect, useState } from 'react';
import {
  professorClassroomService,
  type ClassStudentProgress,
  type SessionState,
} from '../../../services/professorClassroomService';
import { fileToDataUri, shouldStartNewSession } from './sessionHelpers';
import { professorAttendanceStore } from '../../../services/professorAttendanceStore';
import type { ActionMessage } from './types';

interface SessionActionsOptions {
  classId: string;
  session: SessionState;
  setSession: React.Dispatch<React.SetStateAction<SessionState>>;
  enrolled: ClassStudentProgress[];
  presentIds: Set<string>;
  setPresentIds: React.Dispatch<React.SetStateAction<Set<string>>>;
  refreshSharedImages: () => Promise<void>;
}

export function useSessionActions({
  classId,
  session,
  setSession,
  enrolled,
  presentIds,
  setPresentIds,
  refreshSharedImages,
}: SessionActionsOptions) {
  const [busy, setBusy] = useState(false);
  const [actionMessage, setActionMessage] = useState<ActionMessage | null>(null);

  useEffect(() => {
    if (!actionMessage) return;
    const timer = window.setTimeout(() => setActionMessage(null), 5_000);
    return () => window.clearTimeout(timer);
  }, [actionMessage]);

  const controlSession = async (status: SessionState['status']) => {
    setBusy(true);
    setActionMessage(null);
    try {
      const startsNewSession = shouldStartNewSession(session.status, status);
      setSession(startsNewSession
        ? await professorClassroomService.startSession(classId)
        : await professorClassroomService.setSessionState({ status }));
    } catch {
      setActionMessage({
        tone: 'error',
        text: 'La séance n’a pas pu être mise à jour. Vérifiez la connexion puis réessayez.',
      });
    } finally {
      setBusy(false);
    }
  };

  const togglePresent = (accountId: string) => {
    setPresentIds(previous => {
      const next = new Set(previous);
      if (next.has(accountId)) next.delete(accountId);
      else next.add(accountId);
      return next;
    });
  };

  const markAllPresent = () => setPresentIds(new Set(enrolled.map(student => student.accountId)));
  const markNonePresent = () => setPresentIds(new Set());

  const saveAttendance = async () => {
    setBusy(true);
    setActionMessage(null);
    try {
      const validPresentIds = enrolled
        .filter(student => presentIds.has(student.accountId))
        .map(student => student.accountId);
      await professorClassroomService.setPresent(classId, validPresentIds);
      // Publication immédiate sur cet appareil : le tableau de bord sait tout
      // de suite qu'un élève est présent, sans attendre l'aller-retour serveur.
      professorAttendanceStore.apply(classId, validPresentIds);
      const count = validPresentIds.length;
      setActionMessage({
        tone: 'success',
        text: `Présences enregistrées : ${count} élève${count > 1 ? 's' : ''} présent${count > 1 ? 's' : ''}.`,
      });
    } catch {
      setActionMessage({
        tone: 'error',
        text: 'Les présences n’ont pas pu être enregistrées. Vérifiez la connexion puis réessayez.',
      });
    } finally {
      setBusy(false);
    }
  };

  const scheduleSession = async (scheduledAt: number, meetLink: string) => {
    const next = await professorClassroomService.scheduleSession(classId, {
      scheduledAt,
      meetLink: meetLink.trim() || undefined,
      chapterTitle: session.chapterTitle,
    });
    setSession(next);
  };

  const notifyStudents = async (title: string, body: string, absentOnly: boolean) => {
    const result = await professorClassroomService.notifyStudents(classId, {
      title: title.trim(),
      body: body.trim(),
      absentOnly,
    });
    return result.sent;
  };

  const shareImage = async (student: ClassStudentProgress, caption: string, file: File) => {
    const dataUri = await fileToDataUri(file);
    if (!/^data:image\/(?:png|jpe?g);base64,/i.test(dataUri)) {
      throw new Error('Seuls les formats PNG et JPEG sont acceptés.');
    }
    await professorClassroomService.saveSharedImage({
      classId,
      studentAccountId: student.accountId,
      studentName: student.name,
      caption: caption.trim() || undefined,
      dataUri,
    });
    await refreshSharedImages();
  };

  const deleteSharedImage = async (id: string) => {
    await professorClassroomService.deleteSharedImage(id);
    await refreshSharedImages();
  };

  return {
    busy,
    actionMessage,
    controlSession,
    togglePresent,
    markAllPresent,
    markNonePresent,
    saveAttendance,
    scheduleSession,
    notifyStudents,
    shareImage,
    deleteSharedImage,
  };
}
