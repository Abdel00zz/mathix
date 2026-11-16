import { useCallback, useEffect, useRef, useState, type SetStateAction } from 'react';
import {
  professorClassroomService,
  type ClassroomLiveState,
  type ClassroomRoster,
  type ClassStudentProgress,
  type SessionState,
  type SharedImage,
  type ArchivedSessionSummary,
} from '../../../services/professorClassroomService';
import { sessionPollInterval } from '../../../utils/syncPrefs';
import { contentService } from '../../../services/contentService';
import { useSharedProfessorSession } from '../../../hooks/useSharedProfessorSession';

const EMPTY_ROSTER: ClassroomRoster = { title: '', students: [], version: 0 };
const EMPTY_SESSION: SessionState = { status: 'idle' };
const EMPTY_LIVE: ClassroomLiveState = {
  currentStudentIndex: 0,
  questionIndex: 0,
  roundId: 1,
  answeredIds: [],
  version: 0,
};

export function useClassroomSession(classId: string, enabled = true) {
  const sharedSession = useSharedProfessorSession(enabled && !!classId, true);
  const [sessionUpdate, setSessionUpdate] = useState<{
    snapshot: typeof sharedSession; session: SessionState;
  } | null>(null);
  const remoteSession = sharedSession.loaded ? sharedSession.session : EMPTY_SESSION;
  const session = sessionUpdate?.snapshot === sharedSession ? sessionUpdate.session : remoteSession;
  const setSession = useCallback((update: SetStateAction<SessionState>) => {
    setSessionUpdate(current => {
      const previous = current?.snapshot === sharedSession ? current.session : remoteSession;
      return { snapshot: sharedSession, session: typeof update === 'function' ? update(previous) : update };
    });
  }, [remoteSession, sharedSession]);
  const [enrolled, setEnrolled] = useState<ClassStudentProgress[]>([]);
  const [presentIds, setPresentIds] = useState<Set<string>>(new Set());
  const [roster, setRoster] = useState<ClassroomRoster>(EMPTY_ROSTER);
  const [live, setLive] = useState<ClassroomLiveState>(EMPTY_LIVE);
  const [chapterTitles, setChapterTitles] = useState<Record<string, string>>({});
  const [sharedImages, setSharedImages] = useState<SharedImage[]>([]);
  const [loading, setLoading] = useState(true);
  const [online, setOnline] = useState(true);
  const [archives, setArchives] = useState<ArchivedSessionSummary[]>([]);
  const rosterRef = useRef(roster);
  const liveRef = useRef(live);
  useEffect(() => { rosterRef.current = roster; }, [roster]);
  useEffect(() => { liveRef.current = live; }, [live]);

  const refreshArchives = useCallback(async () => {
    try {
      const next = await professorClassroomService.listArchivedSessions();
      setArchives(next);
    } catch { /* conserve l'historique visible */ }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    let active = true;
    void professorClassroomService.listArchivedSessions()
      .then(next => { if (active) setArchives(next); })
      .catch(() => undefined);
    return () => { active = false; };
  }, [enabled]);
  const previousStatusRef = useRef<SessionState['status']>('idle');
  useEffect(() => {
    if (session.status === 'stopped' && (previousStatusRef.current === 'running' || previousStatusRef.current === 'paused')) void refreshArchives();
    previousStatusRef.current = session.status;
  }, [refreshArchives, session.status]);

  useEffect(() => {
    if (!classId || !enabled) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let controller: AbortController | null = null;
    let inFlight = false;

    const schedule = (delay?: number) => {
      if (timer) clearTimeout(timer);
      if (active) timer = setTimeout(pull, delay ?? sessionPollInterval());
    };
    const pull = async () => {
      if (!active || document.hidden) { schedule(); return; }
      if (inFlight) { schedule(); return; }
      inFlight = true;
      controller?.abort();
      controller = new AbortController();
      try {
        if (!rosterRef.current.students.length) {
          const full = await professorClassroomService.load(
            classId,
            rosterRef.current.version,
            liveRef.current.version,
            controller.signal,
          );
          if (!active) return;
          if (!full.unchanged) {
            const data = full as { roster: ClassroomRoster; live: ClassroomLiveState };
            setRoster(data.roster);
            setLive(data.live);
          }
        } else {
          const next = await professorClassroomService.loadLive(classId, liveRef.current.version, controller.signal);
          if (!active) return;
          if (!next.unchanged) setLive(next as ClassroomLiveState);
        }
        setOnline(true);
        schedule();
      } catch (error) {
        if (!active || (error instanceof DOMException && error.name === 'AbortError')) return;
        setOnline(false);
        schedule(Math.min(sessionPollInterval() * 2, 15_000));
      } finally {
        inFlight = false;
      }
    };
    const loadAll = async () => {
      try {
        const [present, rosterData] = await Promise.all([
          professorClassroomService.getPresent(classId),
          professorClassroomService.load(classId, 0, 0),
        ]);
        if (!active) return;
        setPresentIds(new Set(present));
        if (!rosterData.unchanged) {
          const data = rosterData as { roster: ClassroomRoster; live: ClassroomLiveState };
          setRoster(data.roster);
          setLive(data.live);
        }
      } catch { /* Le prochain cycle de synchronisation réessaiera. */ }
      finally { if (active) setLoading(false); }
    };

    inFlight = true;
    void loadAll().finally(() => { inFlight = false; schedule(); });
    const onVisible = () => { if (!document.hidden) schedule(100); };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      active = false;
      controller?.abort();
      if (timer) clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [classId, enabled]);

  useEffect(() => {
    if (!classId || !enabled) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const schedule = (delay = 20_000) => {
      if (timer) clearTimeout(timer);
      if (active) timer = setTimeout(pull, delay);
    };
    const pull = async () => {
      if (!active || document.hidden) { schedule(); return; }
      try {
        const students = await professorClassroomService.fetchClassStudents(classId);
        if (active) setEnrolled(students);
      } catch { /* Le registre reste utilisable hors ligne. */ }
      schedule();
    };
    const refreshSoon = () => { if (!document.hidden) schedule(200); };
    void pull();
    document.addEventListener('visibilitychange', refreshSoon);
    window.addEventListener('online', refreshSoon);
    return () => {
      active = false;
      if (timer) clearTimeout(timer);
      document.removeEventListener('visibilitychange', refreshSoon);
      window.removeEventListener('online', refreshSoon);
    };
  }, [classId, enabled]);

  useEffect(() => {
    if (!classId || !enabled) return;
    let active = true;
    // Le catalogue du niveau est lu via le service de contenu : le chemin du
    // manifeste de classe y est déclaré une seule fois (manifeste racine).
    contentService.fetchClassDetails(classId)
      .then(data => {
        if (!active) return;
        const titles: Record<string, string> = {};
        (Array.isArray(data?.chapters) ? data.chapters : []).forEach((chapter) => {
          if (chapter.id) titles[chapter.id] = chapter.title || chapter.id;
        });
        setChapterTitles(titles);
      })
      .catch(() => undefined);
    return () => { active = false; };
  }, [classId, enabled]);

  const refreshSharedImages = async () => {
    setSharedImages(await professorClassroomService.listSharedImages(classId));
  };

  useEffect(() => {
    if (!enabled || !classId) return;
    let active = true;
    professorClassroomService.listSharedImages(classId)
      .then(images => { if (active) setSharedImages(images); })
      .catch(() => undefined);
    return () => { active = false; };
  }, [classId, enabled]);

  return {
    session, setSession,
    enrolled, presentIds, setPresentIds,
    roster, setRoster,
    live, setLive,
    chapterTitles, sharedImages, refreshSharedImages,
    loading, online: online && sharedSession.online, archives, refreshArchives,
  };
}
