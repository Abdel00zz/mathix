import {
  Activity,
  BookOpen,
  CalendarClock,
  ChartLine,
  Check,
  CircleAlert,
  CircleCheckBig,
  Clock,
  Copy,
  Hourglass,
  Layers,
  ListChecks,
  Sparkles,
  Timer,
  Trophy,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  adminService,
  type AdminClassEntry,
  type AdminUser,
  type ClassChapterEntry,
  type StudentChapterProgress,
  type StudentConcoursSummary,
  type StudentProgressDetail,
} from '../../../services/adminService';
import { revisionSheetKey } from '../../../utils/revisionSheets';
import AdminModalFrame from './AdminModalFrame';
import { formatDuration, timeAgo } from './formatters';
import { chapterCompletion, chapterState, humanizeSectionId } from './studentProgress';

interface StudentProgressDialogProps {
  target: AdminUser;
  classes: AdminClassEntry[];
  classmates: AdminUser[];
  professorName?: string;
  onClose: () => void;
  onError: (message: string) => void;
}

type ProgressTab = 'progression' | 'planning' | 'concours';

interface SheetInfo { title: string; sections: Array<{ id: string; title: string }> }

const MASTERY_LABELS: Record<string, { label: string; className: string }> = {
  high: { label: 'Maîtrisé', className: 'border-stone-200 bg-stone-100/70 text-stone-800' },
  medium: { label: 'Partiel', className: 'border-stone-200 bg-stone-50 text-stone-600' },
  low: { label: 'À revoir', className: 'border-rose-200 bg-rose-50 text-rose-700' },
  skipped: { label: 'Passé', className: 'border-stone-200 bg-stone-100 text-stone-400' },
};

export default function StudentProgressDialog({ target, classes, professorName, onClose, onError }: StudentProgressDialogProps) {
  const [tab, setTab] = useState<ProgressTab>('progression');
  const [detail, setDetail] = useState<StudentProgressDetail | null>(null);
  const [concours, setConcours] = useState<StudentConcoursSummary | null>(null);
  const [chapters, setChapters] = useState<ClassChapterEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedChapter, setSelectedChapter] = useState<string | null>(null);
  const [sheetData, setSheetData] = useState<Record<string, SheetInfo>>({});
  const [copied, setCopied] = useState(false);

  const classTitle = classes.find(entry => entry.id === target.classId)?.title || target.className || target.classId || 'Sans classe';

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const [progressData, concoursData, chapterData] = await Promise.all([
          adminService.fetchStudentProgress(target.phone, target.classId),
          adminService.fetchStudentConcours(target.phone, target.classId),
          adminService.fetchClassChapters(target.classId),
        ]);
        if (!active) return;
        setDetail(progressData);
        setConcours(concoursData);
        setChapters(chapterData);
        setSelectedChapter(progressData?.lastChapter?.chapter || progressData?.chapters[0]?.chapter || null);
      } catch (error) {
        if (active) onError(error instanceof Error ? error.message : 'Lecture de la progression impossible');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [target.classId, target.phone, onError]);

  const chapterById = useMemo(() => {
    const map = new Map<string, ClassChapterEntry>();
    for (const chapter of chapters) map.set(chapter.id, chapter);
    return map;
  }, [chapters]);

  const entryById = useMemo(() => {
    const map = new Map<string, StudentChapterProgress>();
    for (const entry of detail?.chapters || []) map.set(entry.chapter, entry);
    return map;
  }, [detail]);

  const selectedEntry = selectedChapter ? entryById.get(selectedChapter) : undefined;
  const selectedMeta = selectedChapter ? chapterById.get(selectedChapter) : undefined;

  const wantedSheets = useMemo(() => {
    const paths = new Set<string>();
    const add = (chapterId: string | null | undefined) => {
      for (const sheet of chapterId ? chapterById.get(chapterId)?.revisions || [] : []) {
        if (sheet.path) paths.add(sheet.path);
      }
    };
    add(detail?.lastChapter?.chapter);
    add(selectedChapter);
    return [...paths];
  }, [detail, selectedChapter, chapterById]);

  useEffect(() => {
    const missing = wantedSheets.filter(path => !sheetData[path]);
    if (!missing.length) return;
    let active = true;
    (async () => {
      for (const path of missing) {
        const sheet = await adminService.fetchRevisionSheet(path);
        if (!active) return;
        setSheetData(previous => ({ ...previous, [path]: sheet }));
      }
    })();
    return () => { active = false; };
  }, [wantedSheets, sheetData]);

  const sectionTitleOf = (chapterId: string | null | undefined, sectionId: string | null | undefined) => {
    if (!chapterId || !sectionId) return null;
    for (const sheet of chapterById.get(chapterId)?.revisions || []) {
      const found = sheetData[sheet.path]?.sections.find(section => section.id === sectionId);
      if (found) return found.title;
    }
    return null;
  };

  const globalCompletion = useMemo(() => {
    const entries = detail?.chapters || [];
    if (!entries.length) return 0;
    const total = entries.reduce((sum, entry) => {
      const meta = chapterById.get(entry.chapter);
      return sum + chapterCompletion(entry, meta?.exercises?.length || entry.subQuestionsTotal).completion;
    }, 0);
    return Math.round(total / entries.length);
  }, [detail, chapterById]);

  const copyReport = async () => {
    const lines = [
      `Bilan de ${target.name} — ${classTitle}`,
      `Dernier accès : ${detail?.lastActive ? new Date(detail.lastActive).toLocaleString('fr-FR') : 'jamais'}`,
      `Temps de travail : ${formatDuration(detail?.totalTimeSpent)}`,
      `Chapitres travaillés ${detail?.chaptersCount ?? 0} · avancement moyen ${globalCompletion}%`,
      '',
      ...(detail?.chapters || []).map(entry => {
        const meta = chapterById.get(entry.chapter);
        const { completion } = chapterCompletion(entry, meta?.exercises?.length || entry.subQuestionsTotal);
        return `• ${meta?.title || entry.chapter} — avancement ${completion}% · révision ${Math.round(entry.revisionProgress)}% · quiz ${entry.quizSubmitted ? `${entry.quizScore}/${entry.quizTotal}` : `${entry.quizAnswered}/${entry.quizTotal}`} · exercices ${entry.feedbackSummary?.done ?? 0}/${meta?.exercises?.length || entry.subQuestionsTotal}`;
      }),
    ];
    try {
      await navigator.clipboard.writeText(lines.join('\n'));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      onError('Copie impossible : le navigateur a refusé l’accès au presse-papiers.');
    }
  };

  const titleId = 'admin-student-progress-title';
  const tabs: Array<{ id: ProgressTab; label: string; icon: ReactNode }> = [
    { id: 'progression', label: 'Progression des cours', icon: <ChartLine size={14} strokeWidth={1.75} /> },
    { id: 'planning', label: 'Plan de travail', icon: <CalendarClock size={14} strokeWidth={1.75} /> },
    ...(concours || target.mode === 'concours'
      ? [{ id: 'concours' as ProgressTab, label: 'Concours', icon: <Trophy size={14} strokeWidth={1.75} /> }]
      : []),
  ];

  return (
    <AdminModalFrame labelledBy={titleId} onClose={onClose} width="xl">
      {/* ── En-tête : Style Stone / Linear épuré ── */}
      <div>
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3.5 min-w-0">
            <span
              className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-stone-200/90 bg-stone-100 text-stone-700 text-xs font-semibold"
              aria-hidden="true"
            >
              {(target.name || '?').charAt(0).toUpperCase()}
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 id={titleId} className="truncate text-base font-semibold tracking-tight text-stone-800">
                  {target.name || 'Élève'}
                </h2>
                <span className="rounded-full border border-stone-200 bg-stone-50 px-2.5 py-0.5 text-[11px] font-normal text-stone-600">
                  {classTitle}
                </span>
                {target.mode === 'concours' && (
                  <span className="rounded-full border border-stone-200 bg-stone-100/70 px-2.5 py-0.5 text-[11px] font-medium text-stone-700">
                    Concours
                  </span>
                )}
              </div>
              <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-stone-500">
                <span className="font-mono text-[11px] text-stone-500">{target.phone || '—'}</span>
                {professorName && (
                  <>
                    <span className="text-stone-300">·</span>
                    <span>Prof : {professorName}</span>
                  </>
                )}
                {detail?.lastActive && (
                  <>
                    <span className="text-stone-300">·</span>
                    <span className="inline-flex items-center gap-1 text-stone-500">
                      <Clock size={11} strokeWidth={1.5} className="text-stone-400" />
                      Actif {timeAgo(detail.lastActive)}
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-1.5">
            <button
              type="button"
              onClick={() => void copyReport()}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-stone-200/80 bg-white px-2.5 text-xs font-medium text-stone-700 transition hover:bg-stone-50 hover:border-stone-300"
              title="Copier le relevé au presse-papiers"
            >
              {copied ? <CircleCheckBig size={13} className="text-emerald-700" strokeWidth={1.75} /> : <Copy size={13} className="text-stone-500" strokeWidth={1.75} />}
              <span>{copied ? 'Copié' : 'Copier'}</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="grid h-8 w-8 place-items-center rounded-lg text-stone-400 transition hover:bg-stone-100 hover:text-stone-700"
              aria-label="Fermer"
            >
              <X size={16} strokeWidth={1.75} aria-hidden="true" />
            </button>
          </div>
        </div>

        {/* ── Bandeau statistiques subtil aux tons Stone ── */}
        {detail && (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-stone-50/70 px-3.5 py-2 border border-stone-200/70 text-xs">
            <div className="flex items-center gap-2.5">
              <span className="font-normal text-stone-500">Avancement global :</span>
              <span className="font-semibold text-stone-800">{globalCompletion}%</span>
              <div className="w-24 sm:w-32">
                <Bar value={globalCompletion} height={4} />
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-stone-600">
              <div className="flex items-center gap-1.5" title="Temps total">
                <Timer size={12} strokeWidth={1.75} className="text-stone-400" />
                <span className="font-medium text-stone-700">{formatDuration(detail.totalTimeSpent)}</span>
              </div>
              <div className="flex items-center gap-1.5" title="Chapitres commencés">
                <Layers size={12} strokeWidth={1.75} className="text-stone-400" />
                <span className="font-medium text-stone-700">{detail.chaptersCount ?? 0} chap.</span>
              </div>
            </div>
          </div>
        )}

        {/* ── Système d'onglets de navigation épuré avec simple trait de soulignement ── */}
        <nav className="mt-3 flex items-center gap-6 border-b border-stone-200/70" aria-label="Navigation du relevé">
          {tabs.map(item => {
            const isActive = tab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => setTab(item.id)}
                className={`inline-flex items-center gap-2 pb-2 text-xs transition border-b-[1.5px] -mb-px ${
                  isActive
                    ? 'border-stone-800 text-stone-800 font-medium'
                    : 'border-transparent text-stone-500 hover:text-stone-800 font-normal'
                }`}
              >
                <span aria-hidden="true">{item.icon}</span>
                {item.label}
              </button>
            );
          })}
        </nav>
      </div>

      {/* ── Corps de la modale ── */}
      {loading ? (
        <div className="py-20 text-center text-xs font-normal text-stone-400">
          Chargement du relevé…
        </div>
      ) : !detail ? (
        <div className="my-8 flex flex-col items-center gap-2 rounded-xl border border-stone-200/80 bg-stone-50/50 py-12 text-stone-400">
          <ChartLine size={28} strokeWidth={1.5} className="text-stone-300" aria-hidden="true" />
          <p className="text-xs font-medium text-stone-700">Aucune progression enregistrée</p>
          <p className="max-w-sm text-center text-xs text-stone-500">
            Le compte {target.phone || '—'} n’a encore rien enregistré pour la classe « {classTitle} ».
          </p>
        </div>
      ) : (
        <div className="mt-3.5">
          {tab === 'progression' && (
            <div className="grid gap-3.5 lg:grid-cols-[minmax(220px,260px)_1fr] items-start" role="tabpanel">
              {/* Colonne gauche : Sidebar des chapitres avec indicateurs d'état subtils */}
              <ChapterRail
                chapters={chapters}
                entries={entryById}
                selected={selectedChapter}
                onSelect={setSelectedChapter}
                untracked={(detail.chapters || []).filter(entry => !chapterById.has(entry.chapter))}
              />

              {/* Colonne droite : Fiche de travail ciblée du chapitre */}
              <ChapterDetail
                meta={selectedMeta}
                entry={selectedEntry}
                fallbackId={selectedChapter}
                sectionTitle={sectionTitleOf(selectedChapter, selectedEntry?.lastActiveSection)}
                sheetData={sheetData}
              />
            </div>
          )}

          {tab === 'planning' && (
            <div role="tabpanel">
              <PlanningPanel planning={detail.planning} />
            </div>
          )}

          {tab === 'concours' && (
            <div role="tabpanel">
              <ConcoursPanel data={concours} />
            </div>
          )}
        </div>
      )}
    </AdminModalFrame>
  );
}

/* ── Menu Latéral (Sidebar des Chapitres) ──────────────────────────────────── */

function ChapterRail({ chapters, entries, selected, onSelect, untracked }: {
  chapters: ClassChapterEntry[];
  entries: Map<string, StudentChapterProgress>;
  selected: string | null;
  onSelect: (id: string) => void;
  untracked: StudentChapterProgress[];
}) {
  const rows: Array<{ id: string; title: string; meta?: ClassChapterEntry; entry?: StudentChapterProgress }> = [
    ...chapters.map(chapter => ({ id: chapter.id, title: chapter.title, meta: chapter, entry: entries.get(chapter.id) })),
    ...untracked.map(entry => ({ id: entry.chapter, title: entry.chapter, entry })),
  ];

  return (
    <nav
      aria-label="Liste des chapitres"
      className="rounded-xl border border-stone-200/80 bg-stone-50/70 p-1.5 lg:sticky lg:top-2 lg:max-h-[64dvh] lg:overflow-y-auto"
    >
      <div className="px-2 py-1 text-[10px] font-medium uppercase tracking-wider text-stone-400">
        Chapitres ({rows.length})
      </div>
      <ul className="mt-0.5 space-y-0.5">
        {rows.map(row => {
          const { completion } = chapterCompletion(row.entry, row.meta?.exercises?.length || row.entry?.subQuestionsTotal || 0);
          const state = chapterState(row.entry);
          const isSelected = selected === row.id;

          // Indicateurs d'état : minuscule point w-1.5 h-1.5
          // Noir (stone-900) = sélectionné / actif
          // Gris moyen (stone-400) = en cours
          // Gris clair (stone-300) = à faire
          const dotClass = isSelected
            ? 'bg-stone-900'
            : state === 'active' || state === 'done'
              ? 'bg-stone-500'
              : 'bg-stone-300';

          return (
            <li key={row.id}>
              <button
                type="button"
                onClick={() => onSelect(row.id)}
                aria-current={isSelected ? 'true' : undefined}
                className={`w-full rounded-lg px-2.5 py-1.5 text-left transition ${
                  isSelected
                    ? 'bg-white border border-stone-200/80 shadow-xs text-stone-900 font-medium'
                    : 'hover:bg-stone-100/70 text-stone-600 font-normal'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${dotClass}`} aria-hidden="true" />
                  <span className="min-w-0 flex-1 truncate text-xs">
                    {row.title}
                  </span>
                  <span className="shrink-0 text-[10px] font-normal text-stone-400">
                    {completion}%
                  </span>
                </div>
                <div className="mt-1 pl-3.5">
                  <Bar value={completion} height={2} />
                </div>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/* ── Zone de Contenu Principale (Les Cartes Flat Design Bordé) ─────────────── */

function ChapterDetail({ meta, entry, fallbackId, sectionTitle, sheetData }: {
  meta?: ClassChapterEntry;
  entry?: StudentChapterProgress;
  fallbackId: string | null;
  sectionTitle: string | null;
  sheetData: Record<string, SheetInfo>;
}) {
  if (!fallbackId) {
    return (
      <div className="grid place-items-center rounded-xl border border-stone-200/80 bg-white py-16 text-xs text-stone-400">
        Sélectionnez un chapitre dans la liste.
      </div>
    );
  }

  const { completion, revision, quiz } = chapterCompletion(
    entry,
    meta?.exercises?.length || entry?.subQuestionsTotal || 0
  );
  const state = chapterState(entry);
  const sheets = (meta?.revisions || []).map(sheet => {
    const key = revisionSheetKey(sheet.path);
    return {
      key,
      title: sheet.title || sheetData[sheet.path]?.title || humanizeSectionId(key) || key,
      value: entry?.revisionBySheet?.[key],
    };
  });
  const exerciseList: Array<{ id: string; index: number }> = (meta?.exercises || []).map((exercise, index) => ({ id: exercise.id, index: index + 1 }));
  const knownIds = new Set(exerciseList.map(item => item.id));
  for (const id of Object.keys(entry?.feedbackDetails || {})) {
    if (!knownIds.has(id)) exerciseList.push({ id, index: exerciseList.length + 1 });
  }
  const quizTotal = entry?.quizTotal || 0;
  const accuracy = entry && entry.quizAnswered > 0 ? Math.round((entry.quizCorrect / entry.quizAnswered) * 100) : null;

  return (
    <div className="space-y-3">
      {/* ── Carte principale du chapitre ── */}
      <section aria-label="Aperçu du chapitre" className="rounded-xl border border-stone-200/80 bg-white p-4 hover:border-stone-300 transition-colors">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <h3 className="truncate text-base font-semibold text-stone-800">{meta?.title || fallbackId}</h3>
            <StateChip state={state} />
          </div>
          {meta?.section && (
            <span className="rounded-full border border-stone-200 bg-stone-50 px-2 py-0.5 text-[10px] text-stone-500 font-normal">
              {meta.section === 'analyse' ? 'Analyse' : 'Algèbre & géométrie'}
            </span>
          )}
        </div>

        {/* Pourcentage principal raffiné : text-3xl font-light text-stone-800 */}
        <div className="mt-3 flex items-baseline gap-3">
          <span className="text-3xl font-light tracking-tight text-stone-800">{completion}%</span>
          <div className="flex-1 self-center">
            <Bar value={completion} height={4} />
          </div>
        </div>

        {entry?.lastActiveAt && (
          <p className="mt-2 text-[11px] text-stone-400">
            Dernière activité : {timeAgo(entry.lastActiveAt)}
            {(sectionTitle || humanizeSectionId(entry.lastActiveSection)) ? ` · étape « ${sectionTitle || humanizeSectionId(entry.lastActiveSection)} »` : ''}
          </p>
        )}
      </section>

      {/* ── Volet 1 : Fiche de cours / Révision ── */}
      <section aria-label="Révision" className="rounded-xl border border-stone-200/80 bg-white p-4 hover:border-stone-300 transition-colors">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs font-medium text-stone-800">
            <BookOpen size={13} strokeWidth={1.75} className="text-stone-500" />
            <span>Fiche de cours & Révision</span>
          </div>
          <span className="text-xs font-normal text-stone-500">{revision}%</span>
        </div>

        {sheets.length > 0 ? (
          <ul className="mt-3 space-y-2">
            {sheets.map(sheet => (
              <li key={sheet.key || sheet.title}>
                <div className="flex items-center justify-between gap-3 text-xs">
                  <span className="min-w-0 truncate text-stone-600">{sheet.title}</span>
                  <span className="shrink-0 font-normal text-stone-500">
                    {sheet.value === undefined ? 'non consultée' : `${Math.round(sheet.value)}%`}
                  </span>
                </div>
                <div className="mt-1">
                  <Bar value={sheet.value || 0} height={3} />
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-xs text-stone-400">Aucune fiche de cours pour ce chapitre.</p>
        )}

        <div className="mt-3 flex flex-wrap items-center gap-4 border-t border-stone-100 pt-2.5 text-[11px] text-stone-500">
          <div>Trous révélés : <strong className="font-medium text-stone-800">{entry?.blanksRevealed ?? 0}</strong></div>
          <div>Compétences cochées : <strong className="font-medium text-stone-800">{entry?.masteredSkills ?? 0}</strong></div>
          <div>Séances validées : <strong className="font-medium text-stone-800">{entry?.completedSeances?.length ?? 0}</strong></div>
        </div>
      </section>

      {/* ── Volet 2 : Quiz d'entraînement ── */}
      <section aria-label="Quiz" className="rounded-xl border border-stone-200/80 bg-white p-4 hover:border-stone-300 transition-colors">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs font-medium text-stone-800">
            <Sparkles size={13} strokeWidth={1.75} className="text-stone-500" />
            <span>Quiz du chapitre</span>
          </div>
          <span className="text-xs font-normal text-stone-500">
            {entry?.quizSubmitted ? 'Validé' : quizTotal ? `${entry?.quizAnswered || 0}/${quizTotal}` : `${quiz}%`}
          </span>
        </div>

        {entry && (entry.quizAnswered > 0 || entry.quizSubmitted) ? (
          <>
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg bg-stone-50/70 p-2.5 text-xs">
              <div>
                <span className="text-stone-400">Score validé : </span>
                <strong className="font-medium text-stone-800">{entry.quizSubmitted && quizTotal ? `${entry.quizScore}/${quizTotal}` : '—'}</strong>
              </div>
              <div>
                <span className="text-stone-400">Meilleur : </span>
                <strong className="font-medium text-stone-800">{quizTotal ? `${entry.quizHighScore}/${quizTotal}` : String(entry.quizHighScore)}</strong>
              </div>
              <div>
                <span className="text-stone-400">Tentatives : </span>
                <strong className="font-medium text-stone-800">{entry.quizAttempts}</strong>
              </div>
              <div>
                <span className="text-stone-400">Réussite : </span>
                <strong className="font-medium text-stone-800">{accuracy === null ? '—' : `${accuracy}%`}</strong>
              </div>
            </div>

            {/* Historique épuré */}
            {entry.quizHistory.length > 0 && (
              <div className="mt-3">
                <p className="text-[10px] uppercase font-medium tracking-wider text-stone-400 mb-1.5">Historique des questions</p>
                <div className="flex flex-wrap gap-1">
                  {entry.quizHistory.slice(-24).map((answer, index) => (
                    <span
                      key={`${answer.qId}-${index}`}
                      title={`${answer.qId} — ${answer.correct ? 'correct' : 'erreur'}${answer.timeSpent ? ` (${answer.timeSpent}s)` : ''}`}
                      className={`grid h-4 w-4 place-items-center rounded text-[9px] font-medium ${
                        answer.correct ? 'bg-stone-800 text-stone-100' : 'bg-stone-200 text-stone-500'
                      }`}
                    >
                      {answer.correct ? '✓' : '✕'}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <p className="mt-2 text-[11px] text-stone-400">
              {entry.quizDuration ? `Temps dernier essai : ${formatDuration(entry.quizDuration)} · ` : ''}
              {entry.quizSubmitted
                ? 'Quiz terminé et validé.'
                : `En cours : question ${Math.min((entry.quizCurrentIndex || 0) + 1, quizTotal || entry.quizCurrentIndex + 1)}.`}
            </p>
          </>
        ) : (
          <p className="mt-2 text-xs text-stone-400">Quiz non encore commencé.</p>
        )}
      </section>

      {/* ── Volet 3 : Exercices pratiques ── */}
      <section aria-label="Exercices" className="rounded-xl border border-stone-200/80 bg-white p-4 hover:border-stone-300 transition-colors">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs font-medium text-stone-800">
            <ListChecks size={13} strokeWidth={1.75} className="text-stone-500" />
            <span>Exercices d’application</span>
          </div>
          <span className="text-xs font-normal text-stone-500">
            {entry?.feedbackSummary?.done ?? 0}/{meta?.exercises?.length || entry?.subQuestionsTotal || 0}
          </span>
        </div>

        {exerciseList.length === 0 ? (
          <p className="mt-2 text-xs text-stone-400">Aucun exercice déclaré pour ce chapitre.</p>
        ) : (
          <ul className="mt-3 space-y-1.5 max-h-52 overflow-y-auto pr-1">
            {exerciseList.map(exercise => {
              const mastery = entry?.feedbackDetails?.[exercise.id];
              const badge = mastery ? MASTERY_LABELS[mastery] : undefined;
              const minutes = entry?.exerciseDurations?.[exercise.id];
              return (
                <li key={exercise.id} className="flex items-center gap-2 rounded-lg border border-stone-100 px-2.5 py-1 text-xs">
                  <span className="grid h-4 w-4 shrink-0 place-items-center rounded bg-stone-100 text-[10px] font-medium text-stone-600" aria-hidden="true">
                    {exercise.index}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-stone-700">
                    Exercice {exercise.index}
                  </span>
                  {typeof minutes === 'number' && minutes > 0 && (
                    <span className="shrink-0 text-[10px] text-stone-400">{minutes} min</span>
                  )}
                  <span className={`shrink-0 rounded px-1.5 py-0.2 text-[10px] font-medium border ${badge?.className || 'border-stone-200 bg-stone-50 text-stone-400'}`}>
                    {badge?.label || 'Non traité'}
                  </span>
                </li>
              );
            })}
          </ul>
        )}

        <div className="mt-2.5 border-t border-stone-100 pt-2 text-[11px] text-stone-400">
          {entry?.feedbackSummary?.done ?? 0} fait{(entry?.feedbackSummary?.done ?? 0) > 1 ? 's' : ''}
          {entry?.feedbackSummary?.skipped ? ` · ${entry.feedbackSummary.skipped} passé${entry.feedbackSummary.skipped > 1 ? 's' : ''}` : ''}
          {entry && entry.subQuestionsTotal > 0 ? ` · ${entry.subQuestionsCompleted}/${entry.subQuestionsTotal} sous-questions validées` : ''}
        </div>
      </section>

      {/* ── Statut de validation ── */}
      <div className="flex items-center gap-2 rounded-xl border border-stone-200/80 bg-white px-3.5 py-2 text-xs">
        {entry?.submitted ? (
          <>
            <Check size={14} strokeWidth={2} className="text-stone-800" aria-hidden="true" />
            <span className="font-medium text-stone-800">Chapitre validé par l’élève</span>
            {entry.submittedAt && (
              <span className="text-[11px] text-stone-400 ml-auto">
                {new Date(entry.submittedAt).toLocaleDateString('fr-FR')}
              </span>
            )}
          </>
        ) : (
          <>
            <Hourglass size={13} strokeWidth={1.5} className="text-stone-400" aria-hidden="true" />
            <span className="text-stone-500">Chapitre en cours de réalisation</span>
          </>
        )}
      </div>
    </div>
  );
}

/* ── Volet Planning ───────────────────────────────────────────────────────── */

const DAY_LABELS = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];

function PlanningPanel({ planning }: { planning: StudentProgressDetail['planning'] }) {
  if (!planning?.enabled) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-xl border border-stone-200/80 bg-white py-12 text-stone-400">
        <CalendarClock size={24} strokeWidth={1.5} className="text-stone-300" aria-hidden="true" />
        <p className="text-xs font-medium text-stone-700">Aucun planning actif</p>
        <p className="max-w-xs text-center text-xs text-stone-500">L’élève n’a pas configuré d’emploi du temps de travail.</p>
      </div>
    );
  }

  const adherence = planning.adherencePct;
  return (
    <div className="space-y-3">
      <div className="grid gap-2.5 sm:grid-cols-4">
        <div className="rounded-xl border border-stone-200/80 bg-white p-3 hover:border-stone-300 transition-colors">
          <p className="text-[10px] font-medium uppercase tracking-wider text-stone-400">Respect du plan</p>
          <p className="mt-1 text-lg font-light text-stone-800">
            {adherence === null ? '—' : `${adherence}%`}
          </p>
          <div className="mt-1.5"><Bar value={adherence || 0} height={3} /></div>
        </div>
        <MiniTile label="Prévu / semaine" value={formatDuration(planning.plannedWeeklyMin * 60)} />
        <MiniTile label="Réalisé (7 j)" value={formatDuration(planning.doneWeeklyMin * 60)} />
        <MiniTile label="Séances pointées" value={`${planning.sessionsPointed} / ${planning.sessionsPointed + planning.sessionsMissed}`} />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-stone-200/80 bg-white p-3.5 hover:border-stone-300 transition-colors">
          <div className="flex items-center gap-1.5 text-xs font-medium text-stone-800">
            <Activity size={13} strokeWidth={1.75} className="text-stone-500" />
            <span>Créneaux hebdomadaires</span>
          </div>
          {planning.slots.length === 0 ? (
            <p className="mt-2 text-xs text-stone-400">Aucun créneau régulier défini.</p>
          ) : (
            <ul className="mt-2 space-y-1 max-h-48 overflow-y-auto">
              {planning.slots.map((slot, index) => (
                <li key={`${slot.day}-${slot.start}-${index}`} className="flex items-center gap-2 rounded-lg border border-stone-100 px-2.5 py-1 text-xs">
                  <span className="w-20 shrink-0 font-medium text-stone-700">{DAY_LABELS[slot.day] || `Jour ${slot.day}`}</span>
                  <span className="font-mono text-[11px] text-stone-500">{slot.start}</span>
                  <span className="ml-auto shrink-0 font-normal text-stone-800">{slot.durationMin} min</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-xl border border-stone-200/80 bg-white p-3.5 hover:border-stone-300 transition-colors">
          <div className="flex items-center gap-1.5 text-xs font-medium text-stone-800">
            <Timer size={13} strokeWidth={1.75} className="text-stone-500" />
            <span>Régularité des sessions</span>
          </div>
          <dl className="mt-2 grid grid-cols-2 gap-2 text-xs">
            <MiniMetric label="Jours actifs (7 j)" value={String(planning.daysLogged)} />
            <MiniMetric label="Créneaux / sem." value={String(planning.sessionsPerWeek)} />
            <MiniMetric label="Total jours actifs" value={String(planning.activeDays)} />
            <MiniMetric label="Séances manquées" value={String(planning.sessionsMissed)} />
          </dl>
        </div>
      </div>
    </div>
  );
}

/* ── Volet Concours ───────────────────────────────────────────────────────── */

function ConcoursPanel({ data }: { data: StudentConcoursSummary | null }) {
  if (!data) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-xl border border-stone-200/80 bg-white py-12 text-stone-400">
        <Trophy size={24} strokeWidth={1.5} className="text-stone-300" aria-hidden="true" />
        <p className="text-xs font-medium text-stone-700">Aucun essai concours</p>
        <p className="max-w-xs text-center text-xs text-stone-500">L’élève n’a pas encore soumis d’épreuve concours.</p>
      </div>
    );
  }

  const scores = Object.entries(data.bestScores || {}).sort(([, a], [, b]) => (b || 0) - (a || 0));
  return (
    <div className="space-y-3">
      <div className="grid gap-2.5 sm:grid-cols-3">
        <MiniTile label="Essais blancs" value={String(data.totalExams)} />
        <MiniTile label="Écoles travaillées" value={String(scores.length)} />
        <MiniTile label="Dernier essai" value={timeAgo(data.lastPlayed)} />
      </div>

      <div className="rounded-xl border border-stone-200/80 bg-white p-3.5 hover:border-stone-300 transition-colors">
        <div className="flex items-center gap-1.5 text-xs font-medium text-stone-800">
          <Trophy size={13} strokeWidth={1.75} className="text-stone-500" />
          <span>Meilleurs scores par école</span>
        </div>
        {scores.length === 0 ? (
          <p className="mt-2 text-xs text-stone-400">Aucun score disponible.</p>
        ) : (
          <ul className="mt-2 space-y-1.5">
            {scores.map(([school, score]) => (
              <li key={school}>
                <div className="flex items-center justify-between gap-3 text-xs">
                  <span className="min-w-0 truncate text-stone-600">{school}</span>
                  <span className="shrink-0 font-medium text-stone-800">{Math.round(score)}%</span>
                </div>
                <div className="mt-1">
                  <Bar value={score} height={3} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

/* ── Barres et briques ultra-fines (h-1, stone-800) ────────────────────────── */

function Bar({ value, max = 100, height = 3 }: {
  value: number;
  max?: number;
  height?: number;
}) {
  const ratio = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;
  return (
    <div className="w-full overflow-hidden rounded-full bg-stone-100" style={{ height }}>
      <div className="h-full rounded-full transition-all bg-stone-800" style={{ width: `${ratio * 100}%` }} />
    </div>
  );
}

function MiniTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-stone-200/80 bg-white p-3 hover:border-stone-300 transition-colors">
      <p className="text-[10px] font-medium uppercase tracking-wider text-stone-400">{label}</p>
      <p className="mt-1 text-base font-light text-stone-800">{value}</p>
    </div>
  );
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[10px] font-normal text-stone-400">{label}</dt>
      <dd className="mt-0.5 text-xs font-medium text-stone-800">{value}</dd>
    </div>
  );
}

function StateChip({ state }: { state: 'done' | 'active' | 'todo' }) {
  const map = {
    done: { label: 'Validé', className: 'border-stone-200 bg-stone-100 text-stone-800', icon: <CircleCheckBig size={11} strokeWidth={1.75} /> },
    active: { label: 'En cours', className: 'border-stone-200 bg-stone-50 text-stone-600', icon: <Activity size={11} strokeWidth={1.75} /> },
    todo: { label: 'À faire', className: 'border-stone-200 bg-stone-50 text-stone-400', icon: <CircleAlert size={11} strokeWidth={1.75} /> },
  }[state];
  return (
    <span className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-normal ${map.className}`}>
      <span aria-hidden="true">{map.icon}</span>{map.label}
    </span>
  );
}
