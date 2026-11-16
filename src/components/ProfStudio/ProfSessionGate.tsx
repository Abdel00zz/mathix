import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Check, UsersRound } from 'lucide-react';
import { professorClassroomService, type ClassStudentProgress } from '../../services/professorClassroomService';
import { useProfessorAttendance } from '../../hooks/useProfessorAttendance';
import LoadingSpinner from '../UI/LoadingSpinner';

export type SessionMode = 'revision' | 'quiz' | 'exercise';

/** Métrique affichée par élève, selon l'activité lancée. */
function metricFor(mode: SessionMode, s: ClassStudentProgress): { value: string; caption: string; sortValue: number } {
  if (mode === 'revision') {
    const v = s.progress.revisionAvg ?? 0;
    return { value: `${v}%`, caption: 'révision', sortValue: v };
  }
  if (mode === 'quiz') {
    const n = s.progress.quizDone ?? 0;
    return { value: `${n}`, caption: n > 1 ? 'quiz réussis' : 'quiz réussi', sortValue: n };
  }
  const n = s.progress.exercisesDone ?? 0;
  return { value: `${n}`, caption: n > 1 ? 'exercices traités' : 'exercice traité', sortValue: n };
}

const MODE_CONFIG: Record<SessionMode, { title: string; accent: string; accentDeep: string; accentSoft: string }> = {
  revision: { title: 'Révision', accent: '#0d9488', accentDeep: '#0f766e', accentSoft: 'rgba(13, 148, 136, 0.10)' },
  quiz: { title: 'Quiz', accent: '#ea580c', accentDeep: '#c2410c', accentSoft: 'rgba(234, 88, 12, 0.10)' },
  exercise: { title: 'Exercices', accent: '#9333ea', accentDeep: '#7e22ce', accentSoft: 'rgba(147, 51, 234, 0.10)' },
};

type SortKey = 'name' | 'value';

interface ProfSessionGateProps {
  classId: string;
  mode: SessionMode;
  /** Titre du chapitre ouvert (affiché dans l'en-tête discret). */
  chapterTitle?: string;
  onStart: () => void;
  onClose: () => void;
}

/**
 * Page de séance (tablette prof) — avant de lancer une révision, un quiz ou
 * des exercices. Interface volontairement calme et compacte : une seule ligne
 * d'en-tête (« Révision : chapitre »), un tableau triable et animé des élèves
 * (nom en badge + résultat), et deux boutons discrets sous le tableau.
 */
const ProfSessionGate: React.FC<ProfSessionGateProps> = ({ classId, mode, chapterTitle, onStart, onClose }) => {
  const [students, setStudents] = useState<ClassStudentProgress[]>([]);
  const [loading, setLoading] = useState(false);
  const [sortBy, setSortBy] = useState<SortKey>('name');
  const [sortAsc, setSortAsc] = useState(true);
  // Présence partagée avec le tableau de bord : un appel enregistré ailleurs
  // (console PC, paramètres de la tablette) arrive ici sans rechargement.
  const { presentIds: present, loaded: attendanceLoaded } = useProfessorAttendance(classId);

  useEffect(() => {
    if (!classId) return;
    let active = true;
    (async () => {
      setLoading(true);
      try {
        const list = await professorClassroomService.fetchClassStudents(classId);
        if (active) setStudents(list);
      } catch { /* liste vide, non bloquant */ }
      finally { if (active) setLoading(false); }
    })();
    return () => { active = false; };
  }, [classId]);

  const config = MODE_CONFIG[mode];
  // Seuls les élèves déclarés présents figurent sur la page de séance : sans
  // appel, la page n'est de toute façon pas ouverte (`shouldShowSessionGate`).
  const presentSet = useMemo(() => new Set(present), [present]);
  const filtered = useMemo(
    () => students.filter(student => presentSet.has(student.accountId)),
    [students, presentSet],
  );
  const busy = loading || !attendanceLoaded;

  const sorted = useMemo(() => {
    const list = [...filtered];
    list.sort((a, b) => {
      if (sortBy === 'name') {
        const cmp = a.name.localeCompare(b.name);
        return sortAsc ? cmp : -cmp;
      }
      const diff = metricFor(mode, a).sortValue - metricFor(mode, b).sortValue;
      return sortAsc ? diff : -diff;
    });
    return list;
  }, [filtered, sortBy, sortAsc, mode]);

  const toggleSort = (key: SortKey) => {
    if (sortBy === key) setSortAsc(v => !v);
    else { setSortBy(key); setSortAsc(true); }
  };

  const sortArrow = (key: SortKey) => (sortBy === key ? (sortAsc ? '↑' : '↓') : '');

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-[#f7f5f0] text-slate-800">
      <div className="relative mx-auto flex min-h-full w-full max-w-2xl flex-col px-4 py-4 sm:px-6">
        {/* En-tête discret : une seule ligne « Révision : chapitre ». */}
        <header className="flex items-center gap-2.5 border-b border-slate-200/70 pb-3">
          <button
            type="button"
            onClick={onClose}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-slate-400 transition hover:bg-white hover:text-slate-700"
            aria-label="Retour"
          >
            <ArrowLeft size={18} />
          </button>
          <p className="min-w-0 truncate text-[15px] font-bold text-slate-900">
            <span style={{ color: config.accentDeep }}>{config.title}</span>
            {chapterTitle && (
              <>
                <span className="text-slate-300"> : </span>
                <span className="font-semibold text-slate-700">{chapterTitle}</span>
              </>
            )}
          </p>
          <div className="ml-auto flex shrink-0 items-center gap-1.5 rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-500 ring-1 ring-slate-200">
            <UsersRound size={13} />
            {sorted.length}
          </div>
        </header>

        <main className="mt-3 flex-1">
          {busy ? (
            <LoadingSpinner variant="section" label="Chargement de la séance…" audience="professor" />
          ) : sorted.length === 0 ? (
            <div className="rounded-xl border border-slate-200 bg-white px-6 py-10 text-center">
              <p className="text-sm font-semibold text-slate-800">
                {students.length > 0 ? 'Aucun élève déclaré présent pour cette séance.' : 'Aucun élève associé à votre compte.'}
              </p>
              <p className="mt-1 text-xs text-slate-400">Déclarez les présents depuis la console PC ou les paramètres de la tablette avant de commencer.</p>
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
              {/* En-têtes triables */}
              <div className="flex items-center gap-3 border-b border-slate-100 bg-slate-50/60 px-4 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                <button type="button" onClick={() => toggleSort('name')} className="flex min-w-0 flex-1 items-center gap-1 text-left transition hover:text-slate-600">
                  Élève <span className="tabular-nums">{sortArrow('name')}</span>
                </button>
                <button type="button" onClick={() => toggleSort('value')} className="shrink-0 transition hover:text-slate-600">
                  Résultat <span className="tabular-nums">{sortArrow('value')}</span>
                </button>
              </div>
              {/* Lignes animées */}
              <div className="divide-y divide-slate-50">
                {sorted.map((student, index) => {
                  const metric = metricFor(mode, student);
                  return (
                    <div
                      key={student.accountId || student.name}
                      className="flex animate-in items-center gap-3 px-4 py-2 transition-colors fade-in duration-200 hover:bg-slate-50"
                      style={{ animationDelay: `${Math.min(index * 28, 420)}ms` }}
                    >
                      <span className="min-w-0 flex-1">
                        <span
                          className="inline-flex max-w-full truncate rounded-full px-3 py-1 text-[12px] font-semibold"
                          style={{ backgroundColor: config.accentSoft, color: config.accentDeep }}
                        >
                          {student.name}
                        </span>
                      </span>
                      <span className="shrink-0 text-right">
                        <span className="text-[15px] font-bold tabular-nums" style={{ color: config.accentDeep }}>{metric.value}</span>
                        <span className="ml-1.5 text-[9px] font-medium text-slate-400">{metric.caption}</span>
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </main>

        {/* Boutons compacts sous le tableau */}
        <footer className="mt-4 flex items-center gap-2">
          <button
            type="button"
            onClick={onClose}
            className="h-10 shrink-0 rounded-lg border border-slate-200 bg-white px-4 text-[13px] font-semibold text-slate-600 transition hover:border-slate-300 hover:text-slate-900"
          >
            Retour
          </button>
          <button
            type="button"
            onClick={onStart}
            disabled={loading}
            className="flex h-10 flex-1 items-center justify-center gap-1.5 rounded-lg text-[13px] font-semibold text-white shadow-sm transition hover:brightness-95 active:scale-[0.99] disabled:opacity-50"
            style={{ backgroundColor: config.accentDeep }}
          >
            <Check size={16} /> Commencer
          </button>
        </footer>
      </div>
    </div>
  );
};

export default React.memo(ProfSessionGate);
