import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { UsersRound } from 'lucide-react';
import type { SessionState } from '../../services/professorClassroomService';
import { professorClassroomService } from '../../services/professorClassroomService';
import { profContentService, type ClassEntry } from '../../services/profContentService';
import type { ProfessorClassScope, UserProfile } from '../../types';
import { filterProfessorClasses } from '../../utils/profClassAccess';
import { useSharedProfessorSession } from '../../hooks/useSharedProfessorSession';
import HelpModal from '../Modals/HelpModal';
import ProfSessionPanel from './ProfSessionPanel';
import ProfSettingsModal from './ProfSettingsModal';
import ProfStudioApp from './ProfStudioApp';
import { ProfShellContext, type ProfDocumentState, type ProfShellApi } from './profShellContext';
import type { SessionSection } from './session/types';
import { ProfClassHub } from './shell/ProfClassHub';
import { ProfSidebar } from './shell/ProfSidebar';
import { PROF_SECTIONS, profSectionMeta, type ProfSection } from './shell/profSections';
import { UnsavedChangesDialog, type PendingProfAction } from './shell/UnsavedChangesDialog';

interface ProfConsoleAppProps {
  classId: string;
  onLogout?: () => void;
  onUpdateProfile?: (updates: Partial<UserProfile>) => void;
  profPage?: UserProfile['profPage'];
  profName?: string;
  profUser?: UserProfile;
  profClassScope?: ProfessorClassScope;
  profClasses?: string[] | null;
}
const EMPTY_SESSION: SessionState = { status: 'idle' };

/**
 * Coque de la console enseignante.
 *
 * Le rail latéral porte l'identité, le menu « ⋮ » et la liste des classes.
 * L'état de séance reste visible sur l'accueil de la classe. Il n'y a pas de barre supérieure : l'espace de
 * travail est entièrement du contenu. Choisir une classe ouvre son accueil, où
 * les trois destinations s'affichent en grandes tuiles colorées.
 *
 * Le studio et le panneau de classe restent montés une fois ouverts : revenir à
 * l'accueil ne perd ni un document en cours ni un appel commencé.
 */
export default function ProfConsoleApp({
  classId,
  onLogout,
  onUpdateProfile,
  profPage,
  profName,
  profUser,
  profClassScope,
  profClasses,
}: ProfConsoleAppProps) {
  // `null` = accueil de la classe (les trois tuiles).
  const [section, setSection] = useState<ProfSection | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  // Ce contexte appartient à la fenêtre. Le polling de séance ne le modifie jamais.
  const [requestedClassId, setRequestedClassId] = useState(classId);
  // Classe pilotée : celle que la tablette du professeur suit. Publiée par cette
  // fenêtre, relue au polling — elle ne redirige jamais `requestedClassId`.
  const sharedSession = useSharedProfessorSession(true);
  const session = sharedSession.loaded ? sharedSession.session : EMPTY_SESSION;
  const [focusUpdate, setFocusUpdate] = useState<{
    snapshot: typeof sharedSession; classId: string; syncOk: boolean;
  } | null>(null);
  // Keep a local gesture optimistic until the next external-store snapshot.
  const focusClassId = focusUpdate?.snapshot === sharedSession
    ? focusUpdate.classId : (session.focusClassId || '');
  const syncOk = focusUpdate?.snapshot === sharedSession
    ? focusUpdate.syncOk : (!sharedSession.loaded || sharedSession.online);
  const [catalog, setCatalog] = useState<ClassEntry[]>([]);
  const [catalogReady, setCatalogReady] = useState(false);
  const [documentState, setDocumentState] = useState<ProfDocumentState | null>(null);
  const [pendingAction, setPendingAction] = useState<PendingProfAction | null>(null);
  // Verrous de montage : une fois ouverts, ces deux panneaux ne se démontent plus.
  const [sessionMounted, setSessionMounted] = useState(false);
  const [studioMounted, setStudioMounted] = useState(false);
  const [saveFn, setSaveFn] = useState<(() => void) | null>(null);
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem('mathplus:prof-sidebar-collapsed') === 'true'; }
    catch { return false; }
  });

  // ── Historique natif (bouton retour/avant du navigateur) ──────────────────
  // Chaque écran de la console (classe + section) devient une entrée de
  // l'historique : le bouton Retour natif remonte donc dans la console, pas
  // seulement entre les vues de premier niveau. Un ref expose la classe active
  // aux callbacks définis avant la dérivation de `workspaceClassId`.
  const workspaceClassRef = useRef('');
  const pushScreen = useCallback((nextSection: ProfSection | null, nextClass?: string) => {
    const cls = nextClass ?? workspaceClassRef.current;
    window.history.pushState(
      { view: 'dashboard', profClass: cls, profSection: nextSection },
      '',
      window.location.href,
    );
  }, []);

  const requestSave = useCallback(() => { saveFn?.(); }, [saveFn]);
  const guardAction = useCallback((label: string, run: () => void) => {
    if (documentState?.dirty) setPendingAction({ label, run });
    else run();
  }, [documentState?.dirty]);

  const selectSection = useCallback((next: ProfSection, targetClass?: string) => {
    if (next === 'studio') setStudioMounted(true);
    if (next === 'seance' || next === 'eleves') setSessionMounted(true);
    setSection(next);
    // Repli automatique dès qu'une fonctionnalité de classe est ouverte.
    setCollapsed(true);
    pushScreen(next, targetClass);
  }, [pushScreen]);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const classList = await profContentService.fetchClasses();
        if (!active) return;
        setCatalog(classList);
      } catch { /* les écrans conservent leur état vide explicite */ }
      finally { if (active) setCatalogReady(true); }
    })();
    return () => { active = false; };
  }, []);

  const authorizedClasses = useMemo(
    () => filterProfessorClasses(catalog, profClassScope, profClasses),
    [catalog, profClassScope, profClasses],
  );
  // Un compte restreint n'expose jamais un contexte local hors de sa portée.
  const workspaceClassId = useMemo(() => {
    if (!catalogReady) return requestedClassId;
    return authorizedClasses.some(entry => entry.id === requestedClassId)
      ? requestedClassId
      : (authorizedClasses[0]?.id || '');
  }, [authorizedClasses, catalogReady, requestedClassId]);

  // La classe dérivée alimente le ref utilisé par `pushScreen` (défini plus haut).
  useEffect(() => { workspaceClassRef.current = workspaceClassId; }, [workspaceClassId]);

  const titleForClass = useCallback((targetId?: string) => (
    authorizedClasses.find(entry => entry.id === targetId)?.title || targetId || ''
  ), [authorizedClasses]);
  const workspaceClassLabel = titleForClass(workspaceClassId);

  /**
   * Publie le niveau piloté. La pastille du rail bouge tout de suite (le
   * professeur voit son geste pris en compte) ; le polling confirmera ou
   * corrigera. Un échec ne dérange pas le plan de travail : il allume seulement
   * l'indicateur hors ligne.
   */
  const publishFocus = useCallback((targetId: string) => {
    if (!targetId) return;
    setFocusUpdate({ snapshot: sharedSession, classId: targetId, syncOk });
    const complete = (ok: boolean) => setFocusUpdate(current => (
      current?.snapshot === sharedSession && current.classId === targetId
        ? { ...current, syncOk: ok } : current
    ));
    void professorClassroomService.setFocusClass(targetId)
      .then(() => complete(true))
      .catch(() => complete(false));
  }, [sharedSession, syncOk]);

  // Restaure un écran de la console depuis une entrée d'historique (bouton
  // Retour/avant natif, ou re-montage après une vue de premier niveau).
  const restoreScreen = useCallback((state: unknown) => {
    const s = state as { view?: string; profClass?: string; profSection?: ProfSection | null } | null;
    if (!s || s.view !== 'dashboard') return;
    if (typeof s.profClass === 'string' && s.profClass) {
      setRequestedClassId(s.profClass);
      publishFocus(s.profClass);
    }
    const sec = (s.profSection ?? null) as ProfSection | null;
    setSection(sec);
    if (sec === 'studio') setStudioMounted(true);
    if (sec === 'seance' || sec === 'eleves') setSessionMounted(true);
  }, [publishFocus]);

  useEffect(() => {
    // Ancre l'accueil de la classe dans l'entrée d'historique initiale, pour
    // qu'un Retour depuis une section revienne bien à l'accueil (section=null).
    const current = window.history.state as { view?: string; profClass?: string } | null;
    if (current?.view === 'dashboard' && current.profClass == null && workspaceClassId) {
      window.history.replaceState(
        { view: 'dashboard', profClass: workspaceClassId, profSection: null },
        '',
        window.location.href,
      );
    }
    const onPopState = (e: PopStateEvent) => restoreScreen(e.state);
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [restoreScreen, workspaceClassId]);

  const openClass = useCallback((targetId: string) => {
    // Recliquer la classe ouverte est le chemin de retour vers son accueil.
    const select = () => {
      setRequestedClassId(targetId);
      setSection(null);
      // Ouvrir une classe ici, c'est piloter : la tablette du prof suit.
      publishFocus(targetId);
      pushScreen(null, targetId);
    };
    // Changer de classe recharge le studio : le document ouvert y passerait.
    if (targetId === workspaceClassId) select();
    else guardAction('Changer de classe', select);
  }, [guardAction, publishFocus, pushScreen, workspaceClassId]);

  // Publication d'ouverture : une seule fois par fenêtre, dès que la portée du
  // compte a désigné un plan de travail. Sans ce tir initial, la tablette
  // resterait sur la classe du dernier pilotage jusqu'au premier clic.
  const bootPublishedRef = useRef(false);
  useEffect(() => {
    if (bootPublishedRef.current || !catalogReady || !workspaceClassId) return;
    bootPublishedRef.current = true;
    publishFocus(workspaceClassId);
  }, [catalogReady, publishFocus, workspaceClassId]);

  const joinSession = useCallback(() => {
    const target = session.classId && authorizedClasses.some(entry => entry.id === session.classId)
      ? String(session.classId)
      : undefined;
    if (target) setRequestedClassId(target);
    selectSection('seance', target);
  }, [authorizedClasses, selectSection, session.classId]);

  const handleLogout = useCallback(() => {
    if (onLogout) guardAction('Se déconnecter', onLogout);
  }, [guardAction, onLogout]);

  const sessionIsLive = session.status === 'running' || session.status === 'paused';
  // Une séance qui tourne ailleurs doit rester visible sans quitter cette classe.
  const elsewhereSessionLabel = sessionIsLive
    && session.classId
    && String(session.classId) !== workspaceClassId
    && authorizedClasses.some(entry => entry.id === session.classId)
    ? titleForClass(session.classId)
    : null;
  // Une séance vivante retient la tablette sur sa classe : le prof doit savoir
  // pourquoi son niveau piloté n'a pas suivi son changement de plan de travail.
  const tabletHeldLabel = sessionIsLive
    && session.classId
    && focusClassId
    && String(session.classId) !== focusClassId
    ? titleForClass(session.classId)
    : null;
  // Repli « intelligent » : dès qu'une séance démarre, le rail se replie en
  // icônes pour laisser la place au cockpit. Le professeur peut le redéployer.
  const wasLiveRef = useRef(false);
  useEffect(() => {
    if (sessionIsLive && !wasLiveRef.current) setCollapsed(true);
    wasLiveRef.current = sessionIsLive;
  }, [sessionIsLive]);

  useEffect(() => {
    try { localStorage.setItem('mathplus:prof-sidebar-collapsed', String(collapsed)); }
    catch { /* stockage restreint */ }
  }, [collapsed]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const mod = event.ctrlKey || event.metaKey;
      if (!mod || event.altKey) return;
      if (event.key.toLowerCase() === 's') { event.preventDefault(); requestSave(); return; }
      if (event.key === '0') { event.preventDefault(); window.history.back(); return; }
      const index = Number.parseInt(event.key, 10);
      if (index >= 1 && index <= PROF_SECTIONS.length) {
        event.preventDefault();
        selectSection(PROF_SECTIONS[index - 1].id);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [requestSave, selectSection]);

  useEffect(() => {
    if (!documentState?.dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [documentState?.dirty]);

  const documentName = documentState?.path?.split('/').pop() || null;

  useEffect(() => {
    const dirtyMark = documentState?.dirty ? '● ' : '';
    if (!workspaceClassId) {
      document.title = 'Apprendre intelligemen';
    } else if (section === 'studio') {
      document.title = `${dirtyMark}${documentName ? `${documentName} — ` : ''}Studio · Apprendre intelligemen`;
    } else if (section) {
      document.title = `${dirtyMark}${profSectionMeta(section).label} · ${workspaceClassLabel || 'Classe'} · Apprendre intelligemen`;
    } else {
      document.title = `${workspaceClassLabel || 'Classes'} · Apprendre intelligemen`;
    }
    return () => { document.title = 'Apprendre intelligemen'; };
  }, [documentName, documentState?.dirty, section, workspaceClassId, workspaceClassLabel]);

  const shellApi = useMemo<ProfShellApi>(() => ({
    reportDocument: setDocumentState,
    registerSave: save => setSaveFn(() => save),
  }), []);

  const sessionSection: SessionSection = section === 'eleves' ? 'eleves' : 'seance';

  return (
    <ProfShellContext.Provider value={shellApi}>
      <div className="prof-console flex h-dvh text-slate-900 vercel-font">
        {section !== 'studio' && (
          <ProfSidebar
            classes={authorizedClasses}
            activeClassId={workspaceClassId}
            sessionClassId={session.classId}
            focusClassId={focusClassId}
            tabletHeldLabel={tabletHeldLabel}
            session={session}
            syncOk={syncOk}
            elsewhereSessionLabel={elsewhereSessionLabel}
            profName={profName}
            onSelectClass={openClass}
            onJoinSession={joinSession}
            onOpenSettings={() => setSettingsOpen(true)}
            onOpenHelp={() => setHelpOpen(true)}
            collapsed={collapsed}
            onToggleCollapsed={() => setCollapsed(value => !value)}
            onCollapse={() => setCollapsed(true)}
            onLogout={onLogout ? handleLogout : undefined}
          />
        )}

        <div className="prof-workspace flex min-h-0 min-w-0 flex-1 flex-col">
          {!workspaceClassId ? (
            <main className="min-h-0 flex-1 overflow-y-auto px-4 py-8">
              <div className="mx-auto w-full max-w-md">
                <div className="prof-panel px-6 py-14 text-center">
                  <span className="mx-auto grid h-11 w-11 place-items-center rounded-full bg-slate-100 text-slate-400">
                    <UsersRound size={20} aria-hidden="true" />
                  </span>
                  <p className="mt-4 text-sm font-semibold text-slate-900">Choisissez une classe</p>
                  <p className="mx-auto mt-1 max-w-sm text-xs leading-relaxed text-slate-500">
                    Sélectionnez une classe dans le rail de gauche pour ouvrir les séances, les élèves ou le studio.
                  </p>
                </div>
              </div>
            </main>
          ) : (
            <>
              {!section && (
                <ProfClassHub
                  classLabel={workspaceClassLabel}
                  onSelectSection={selectSection}
                />
              )}

              {sessionMounted && (
                <div className={(section === 'seance' || section === 'eleves') ? 'flex min-h-0 flex-1 flex-col' : 'hidden'}>
                  <ProfSessionPanel
                    key={workspaceClassId || 'no-class'}
                    classId={workspaceClassId}
                    classLabel={workspaceClassLabel}
                    notifyTemplates={profPage?.notifyTemplates}
                    activeSection={sessionSection}
                    enabled={section === 'seance' || section === 'eleves'}
                  />
                </div>
              )}

              {studioMounted && (
                <div className={section === 'studio' ? 'flex min-h-0 flex-1 flex-col' : 'hidden'}>
                  <ProfStudioApp classId={workspaceClassId} />
                </div>
              )}

            </>
          )}
        </div>

        <UnsavedChangesDialog
          action={pendingAction}
          documentName={documentName}
          onCancel={() => setPendingAction(null)}
          onPublish={() => { setPendingAction(null); selectSection('studio'); requestSave(); }}
          onConfirm={() => {
            const run = pendingAction?.run;
            setPendingAction(null);
            run?.();
          }}
        />

        <ProfSettingsModal
          isOpen={settingsOpen}
          onClose={() => setSettingsOpen(false)}
          onUpdateProfile={onUpdateProfile}
          profPage={profPage}
          profile={profUser}
          classId={workspaceClassId}
          onLogout={onLogout ? handleLogout : undefined}
        />

        <HelpModal variant="modal" audience="professor" isOpen={helpOpen} onClose={() => setHelpOpen(false)} />
      </div>
    </ProfShellContext.Provider>
  );
}
