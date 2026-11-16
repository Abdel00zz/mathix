import { useEffect, useMemo, useState } from 'react';
import { professorClassroomService, type ClassStudentProgress, type SessionState } from '../../../services/professorClassroomService';
import type { SessionPrintPayload } from '../../../services/sessionArchiveService';
import { pageBoxMm, printPageCss } from '../../../services/printLayout';
import { printPrepared } from '../../../services/printService';

export interface SessionPrintTarget { classId: string; session: SessionState; presentNames: string[]; isArchived: boolean }

export function useSessionPrinting({ classId, session, enrolled, presentIds }: { classId: string; session: SessionState; enrolled: ClassStudentProgress[]; presentIds: Set<string> }) {
  const [target, setTarget] = useState<SessionPrintTarget | null>(null);
  const [printPayload, setPrintPayload] = useState<SessionPrintPayload | null>(null);
  const livePresentNames = useMemo(() => enrolled.filter(student => presentIds.has(student.accountId)).map(student => student.name), [enrolled, presentIds]);

  useEffect(() => {
    if (!printPayload) return;
    // Sans pageCss, l'impression retombait sur le @page portrait global : la
    // séance suit désormais l'orientation et les marges choisies par le prof.
    const pageCss = printPayload.layout ? printPageCss(printPayload.layout) : undefined;
    const contentWidthMm = printPayload.layout ? pageBoxMm(printPayload.layout).contentWidth : undefined;
    const timer = window.setTimeout(() => { void printPrepared({ pageCss, contentWidthMm }).finally(() => window.setTimeout(() => setPrintPayload(null), 400)); }, 150);
    return () => window.clearTimeout(timer);
  }, [printPayload]);

  const openPrintForLive = () => setTarget({ classId, session, presentNames: livePresentNames, isArchived: false });
  const openPrintForArchived = async (id: string) => {
    const archive = await professorClassroomService.getArchivedSession(id);
    setTarget({ classId: archive.classId, session: archive, presentNames: archive.presentNames || [], isArchived: true });
  };
  const preparePrint = (payload: SessionPrintPayload) => { setTarget(null); setPrintPayload(payload); };

  return { target, setTarget, printPayload, openPrintForLive, openPrintForArchived, preparePrint };
}
