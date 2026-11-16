import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check, LayoutDashboard, LogOut, Monitor, Palette, RefreshCw, SlidersHorizontal, Star, UsersRound, X } from 'lucide-react';
import { professorClassroomService, type ClassStudentProgress, type SessionState } from '../../services/professorClassroomService';
import { professorAttendanceStore } from '../../services/professorAttendanceStore';
import { profViewModeService } from '../../services/profViewModeService';
import type { UserProfile } from '../../types';
import { isFastSync, setFastSync } from '../../utils/syncPrefs';
import { CanvasSettings, ColorSettings, ExerciseSettings, QuizSettings, RevisionSettings } from './settings/PersonalizationPanels';
import { ProfPageSettings } from './settings/ProfPageSettings';
import { SettingsNavigation, type SettingsNavigationItem } from './settings/SettingsNavigation';
import { SyncSettings } from './settings/SyncSettings';
import { FullscreenSetting } from './settings/FullscreenSetting';
import { usePersonalizationSettings } from './settings/usePersonalizationSettings';
import { useProfPageSettings } from './settings/useProfPageSettings';

type TabletTab = 'session' | 'page' | 'content' | 'display' | 'system';
const tabs: SettingsNavigationItem<TabletTab>[] = [
  { id: 'session', label: 'Séance', icon: <UsersRound size={15} /> },
  { id: 'page', label: 'Ma page', icon: <Star size={15} /> },
  { id: 'content', label: 'Contenu', icon: <SlidersHorizontal size={15} /> },
  { id: 'display', label: 'Affichage', icon: <Palette size={15} /> },
  { id: 'system', label: 'Système', icon: <LayoutDashboard size={15} /> },
];
const STATUS_LABEL: Record<SessionState['status'], string> = { idle: 'Prête', running: 'En cours', paused: 'En pause', stopped: 'Terminée' };
const TAB_COPY: Record<TabletTab, { title: string; description: string }> = {
  session: { title: 'Séance', description: 'Présences et état de la séance en cours.' },
  page: { title: 'Ma page', description: 'Message d’accueil et chapitres mis en avant.' },
  content: { title: 'Contenu', description: 'Comportement des révisions, quiz, exercices et canvas.' },
  display: { title: 'Affichage', description: 'Style et taille du tableau de bord tablette.' },
  system: { title: 'Système', description: 'Affichage plein écran, synchronisation, mode d’affichage et compte.' },
};

interface Props {
  isOpen: boolean;
  onClose: () => void;
  classId: string;
  user: UserProfile;
  onUpdateProfile?: (updates: Partial<UserProfile>) => void;
  onLogout?: () => void;
}

export default function ProfTabletSettingsModal({ isOpen, onClose, classId, user, onUpdateProfile, onLogout }: Props) {
  const [tab, setTab] = useState<TabletTab>('session');
  const [students, setStudents] = useState<ClassStudentProgress[]>([]);
  const [presentIds, setPresentIds] = useState<Set<string>>(new Set());
  const [session, setSession] = useState<SessionState>({ status: 'idle' });
  const [loading, setLoading] = useState(false);
  const [fastSync, setFastSyncState] = useState(() => isFastSync());
  const personalization = usePersonalizationSettings({
    isOpen,
    onUpdateProfile,
    baseProfPrefs: user.profPrefs,
    baseDashboardTheme: user.dashboardTheme,
  });
  const page = useProfPageSettings({ isOpen, classId, profPage: user.profPage, onUpdateProfile });

  const refresh = useCallback(async () => {
    if (!classId) return;
    setLoading(true);
    try {
      const [list, present, state] = await Promise.all([
        professorClassroomService.fetchClassStudents(classId),
        professorClassroomService.getPresent(classId),
        professorClassroomService.getSessionState(),
      ]);
      setStudents(list); setPresentIds(new Set(present)); setSession(state);
    } catch { /* le prochain rafraîchissement réessaiera */ }
    finally { setLoading(false); }
  }, [classId]);

  useEffect(() => { if (isOpen) queueMicrotask(() => void refresh()); }, [isOpen, refresh]);

  // ── Appel depuis la tablette ─────────────────────────────────────────
  // Toucher un élève le déclare présent (ou absent). La présence est publiée
  // immédiatement — le tableau de bord ouvre donc la page de séance au clic
  // suivant — et enregistrée juste après, le temps de laisser le doigt se
  // lever. Un appel en attente est toujours envoyé à la fermeture.
  const saveTimer = useRef<number | null>(null);
  const pendingIds = useRef<string[] | null>(null);

  const flushAttendance = useCallback(() => {
    const ids = pendingIds.current;
    pendingIds.current = null;
    if (ids) void professorClassroomService.setPresent(classId, ids).catch(() => { /* le prochain geste réessaiera */ });
  }, [classId]);

  const togglePresent = useCallback((accountId: string) => {
    const next = new Set(presentIds);
    if (next.has(accountId)) next.delete(accountId);
    else next.add(accountId);
    setPresentIds(next);
    const ids = [...next];
    professorAttendanceStore.apply(classId, ids);
    pendingIds.current = ids;
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(flushAttendance, 500);
  }, [classId, presentIds, flushAttendance]);

  useEffect(() => () => {
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    flushAttendance();
  }, [flushAttendance]);
  const sortedStudents = useMemo(() => [...students].sort((a, b) => Number(presentIds.has(b.accountId)) - Number(presentIds.has(a.accountId)) || a.name.localeCompare(b.name, 'fr')), [students, presentIds]);
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-slate-950/25 backdrop-blur-[2px] sm:items-center sm:p-4" onClick={onClose} role="dialog" aria-modal="true">
      <div className="flex max-h-[94dvh] w-full max-w-5xl flex-col overflow-hidden rounded-t-[22px] bg-white shadow-2xl sm:h-[88vh] sm:rounded-[22px]" onClick={event => event.stopPropagation()}>
        <header className="flex items-center justify-between border-b border-slate-100 px-4 py-3 sm:px-5"><div><h2 className="text-sm font-bold text-slate-900">Paramètres tablette</h2><p className="text-[11px] text-slate-400">Séance, page, contenus, affichage et système</p></div><button type="button" onClick={onClose} className="grid h-8 w-8 place-items-center rounded-full text-slate-400 hover:bg-slate-100" aria-label="Fermer"><X size={16} /></button></header>
        <div className="flex min-h-0 flex-1 flex-col sm:flex-row">
          <SettingsNavigation<TabletTab> activeTab={tab} onSelect={setTab} items={tabs} title="Tablette" responsive />
          <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            <div className="border-b border-slate-100 px-4 py-3.5 sm:px-6">
              <h3 className="text-sm font-bold text-slate-900">{TAB_COPY[tab].title}</h3>
              <p className="mt-1 text-xs text-slate-500">{TAB_COPY[tab].description}</p>
            </div>
            <div
              id={`tablet-settings-panel-${tab}`}
              role="region"
              aria-label={TAB_COPY[tab].title}
              className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6"
            >
            {tab === 'session' && <div className="space-y-5"><section className="rounded-xl border border-slate-200 p-4"><div className="flex items-center justify-between"><div><h3 className="text-xs font-bold text-slate-800">Élèves présents</h3><p className="mt-1 text-[11px] text-slate-500">{presentIds.size}/{students.length} · séance {STATUS_LABEL[session.status]}</p><p className="mt-1 text-[11px] text-slate-400">Touchez un élève pour le marquer présent ou absent.</p></div><button type="button" onClick={() => void refresh()} disabled={loading} className="grid h-9 w-9 place-items-center rounded-lg text-slate-500 hover:bg-slate-100" aria-label="Rafraîchir"><RefreshCw size={14} className={loading ? 'animate-spin' : ''} /></button></div>{session.scheduledAt && <p className="mt-2 text-[11px] text-slate-500">Prochaine séance : {new Date(session.scheduledAt).toLocaleString('fr-FR')}</p>}</section><ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">{sortedStudents.map(student => { const isPresent = presentIds.has(student.accountId); return <li key={student.accountId}><button type="button" onClick={() => togglePresent(student.accountId)} aria-pressed={isPresent} className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition hover:bg-slate-50"><span className={`h-2 w-2 shrink-0 rounded-full ${isPresent ? 'bg-emerald-500' : 'bg-slate-300'}`} /><span className="min-w-0 flex-1 truncate text-xs font-semibold text-slate-700">{student.name}</span><span className={`text-[10px] font-semibold ${isPresent ? 'text-emerald-600' : 'text-slate-400'}`}>{isPresent ? 'Présent' : 'Absent'}</span></button></li>; })}</ul></div>}
            {tab === 'page' && <section className="rounded-xl border border-slate-200 p-4"><ProfPageSettings message={page.pageMessage} highlighted={page.pageHighlighted} chapters={page.pageChapters} loading={page.pageChaptersLoading} onMessageChange={page.setPageMessage} onToggleChapter={page.togglePageChapter} /></section>}
            {tab === 'content' && (
              <div className="space-y-6">
                <div className="space-y-3">
                  <h4 className="px-1 text-[11px] font-bold uppercase tracking-wider text-slate-400">Révision</h4>
                  <RevisionSettings value={personalization.prefs.revision} onChange={personalization.patchRevision} />
                </div>
                <div className="space-y-3">
                  <h4 className="px-1 text-[11px] font-bold uppercase tracking-wider text-slate-400">Quiz</h4>
                  <QuizSettings value={personalization.prefs.quiz} onChange={personalization.patchQuiz} />
                </div>
                <div className="space-y-3">
                  <h4 className="px-1 text-[11px] font-bold uppercase tracking-wider text-slate-400">Exercices</h4>
                  <ExerciseSettings value={personalization.prefs.exercise} onChange={personalization.patchExercise} />
                </div>
                <div className="space-y-3">
                  <h4 className="px-1 text-[11px] font-bold uppercase tracking-wider text-slate-400">Canvas</h4>
                  <CanvasSettings value={personalization.prefs.canvas} onChange={personalization.patchCanvas} />
                </div>
              </div>
            )}
            {tab === 'display' && <div className="space-y-5"><ColorSettings selectedTheme={personalization.prefs.dashboardTheme} onSelect={personalization.setDashboardTheme} /><section className="rounded-xl border border-slate-200 p-4"><label className="text-xs font-bold text-slate-800">Taille du texte</label><div className="mt-3 flex items-center gap-3"><input type="range" min={0.85} max={1.3} step={0.05} value={personalization.textScale} onChange={event => personalization.setTextScale(Number(event.target.value))} className="flex-1 accent-indigo-600" /><span className="w-11 text-right font-mono text-xs text-slate-600">{Math.round(personalization.textScale * 100)}%</span></div></section></div>}
            {tab === 'system' && <div className="space-y-5"><FullscreenSetting /><section className="rounded-xl border border-slate-200 p-4"><h3 className="mb-2 text-xs font-bold text-slate-800">Synchronisation</h3><SyncSettings enabled={fastSync} onToggle={() => setFastSyncState(previous => { setFastSync(!previous); return !previous; })} /></section><button type="button" onClick={() => profViewModeService.setMode('pc')} className="flex w-full items-center justify-between rounded-xl border border-slate-200 px-4 py-3 text-left text-xs font-semibold text-slate-700 hover:bg-slate-50"><span>Basculer vers l’interface PC</span><Monitor size={16} /></button>{onLogout && <button type="button" onClick={onLogout} className="flex w-full items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-semibold text-rose-700 hover:bg-rose-100"><LogOut size={15} />Déconnexion</button>}</div>}
            </div>
          </div>
        </div>
        <footer className="flex justify-end border-t border-slate-100 px-4 py-3"><button type="button" onClick={onClose} className="inline-flex h-10 items-center gap-2 rounded-xl bg-slate-900 px-4 text-xs font-semibold text-white"><Check size={14} />Terminé</button></footer>
      </div>
    </div>
  );
}
