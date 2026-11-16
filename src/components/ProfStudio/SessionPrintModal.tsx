import React, { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, FileText, Layers, PenTool, Printer, UsersRound, X } from 'lucide-react';
import LoadingSpinner from '../UI/LoadingSpinner';
import { contentService } from '../../services/contentService';
import { quizService } from '../../services/quizService';
import type { SessionState } from '../../services/professorClassroomService';
import {
  annotatedNotesFor, formatQuizAnswer, isAnswerFilled,
  readExerciseStrokes, readQuizAnswers, type SessionPrintPayload,
} from '../../services/sessionArchiveService';
import { loadPrintLayout, sessionPrintLayout } from '../../services/printLayout';
import type { Exercise, QuizQuestion, QuizResult } from '../../types';

interface SessionPrintModalProps {
  classId: string;
  session: SessionState;
  presentNames: string[];
  /** Vrai pour une archive : le repli localStorage (même appareil) est désactivé. */
  isArchived: boolean;
  onClose: () => void;
  onPrint: (payload: SessionPrintPayload) => void;
}

/**
 * Modale de synthèse « Imprimer la séance » : détaille ce qui sera archivé
 * (exercices, quiz remplis, zones manuscrites, élèves présents) et propose des
 * options avant de générer le rendu PDF.
 */
export default function SessionPrintModal({ classId, session, presentNames, isArchived, onClose, onPrint }: SessionPrintModalProps) {
  const chapterId = session.chapterId || '';
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [quizQuestions, setQuizQuestions] = useState<QuizQuestion[]>([]);
  const [loading, setLoading] = useState(() => !!(classId && chapterId));
  const [includeStudents, setIncludeStudents] = useState(true);
  const [includeAnnotations, setIncludeAnnotations] = useState(true);
  const [includeCorrections, setIncludeCorrections] = useState(false);
  const [columns, setColumns] = useState<1 | 2>(1);

  useEffect(() => {
    if (!classId || !chapterId) return;
    let active = true;
    (async () => {
      try {
        const [ex, quiz] = await Promise.all([
          contentService.loadExercisesByChapter(classId, chapterId),
          quizService.getQuiz(classId, chapterId),
        ]);
        if (!active) return;
        setExercises(ex.exercises);
        setQuizQuestions(quiz);
      } catch { /* synthèse partielle, non bloquant */ }
      finally { if (active) setLoading(false); }
    })();
    return () => { active = false; };
  }, [classId, chapterId]);

  // Traits manuscrits : priorité à ceux transmis par la tablette (séance Redis).
  // Le repli localStorage n'a de sens que pour la séance live sur le même
  // appareil ; sur une archive, on ne mélange jamais l'encre d'aujourd'hui.
  const activityStrokes = useMemo<Record<string, unknown[]>>(() => {
    const transmitted = (session.activity?.strokes || {}) as Record<string, unknown[]>;
    if (Object.keys(transmitted).length > 0) return transmitted;
    return isArchived ? {} : readExerciseStrokes();
  }, [session.activity?.strokes, isArchived]);

  // Exercices réellement ouverts pendant la séance (sinon, tous), dans l'ordre
  // d'ouverture transmis par la tablette — pas l'ordre du chapitre. Un id inconnu
  // du catalogue (exercice retiré) est simplement ignoré.
  const openedExercises = useMemo(() => {
    const ids = session.activity?.exerciseIds;
    if (!ids || ids.length === 0) return exercises;
    const byId = new Map(exercises.map(ex => [ex.id, ex]));
    return ids.map(id => byId.get(id)).filter((ex): ex is Exercise => Boolean(ex));
  }, [exercises, session.activity?.exerciseIds]);

  // Réponses de quiz : priorité à celles transmises par la tablette (séance
  // Redis). Le repli local ne s'applique qu'à la séance live sur ce même appareil.
  const quizData = useMemo(() => {
    const transmitted = session.activity?.quiz;
    if (transmitted && (transmitted.history?.length || Object.keys(transmitted.answersSnapshot || {}).length)) {
      return { history: transmitted.history, answersSnapshot: transmitted.answersSnapshot };
    }
    return isArchived
      ? ({ history: [] as QuizResult[], answersSnapshot: {} as Record<string, unknown> })
      : readQuizAnswers(chapterId, classId);
  }, [session.activity?.quiz, chapterId, classId, isArchived]);

  const summary = useMemo(() => {
    const annotatedByExercise = new Map<string, number>();
    let annotatedCount = 0;
    for (const ex of openedExercises) {
      const notes = annotatedNotesFor(ex, activityStrokes);
      if (notes.length > 0) annotatedByExercise.set(ex.id, notes.length);
      annotatedCount += notes.length;
    }

    const { history, answersSnapshot } = quizData;
    const byId = new Map<string, { userAnswer: unknown; isCorrect: boolean | null }>();
    for (const r of history) byId.set(r.questionId, { userAnswer: r.userAnswer, isCorrect: r.isCorrect });
    for (const [id, answer] of Object.entries(answersSnapshot)) {
      const prev = byId.get(id);
      byId.set(id, { userAnswer: answer, isCorrect: prev?.isCorrect ?? null });
    }
    const quizAnswered = quizQuestions.filter(q => isAnswerFilled(byId.get(q.id)?.userAnswer)).length;

    return {
      exercisesCount: openedExercises.length,
      annotatedCount,
      annotatedExercises: annotatedByExercise.size,
      quizAnswered,
      presentCount: presentNames.length,
    };
  }, [openedExercises, activityStrokes, quizQuestions, presentNames, quizData]);

  const handlePrint = () => {
    const annotated: Record<string, ReturnType<typeof annotatedNotesFor>> = {};
    for (const ex of openedExercises) {
      const notes = annotatedNotesFor(ex, activityStrokes);
      if (notes.length > 0) annotated[ex.id] = notes;
    }

    const { history, answersSnapshot } = quizData;
    const byId = new Map<string, { userAnswer: unknown; isCorrect: boolean | null }>();
    for (const r of history) byId.set(r.questionId, { userAnswer: r.userAnswer, isCorrect: r.isCorrect });
    for (const [id, answer] of Object.entries(answersSnapshot)) {
      const prev = byId.get(id);
      byId.set(id, { userAnswer: answer, isCorrect: prev?.isCorrect ?? null });
    }
    const quizAnswered = quizQuestions
      .filter(q => isAnswerFilled(byId.get(q.id)?.userAnswer))
      .map(q => ({
        question: q,
        answer: formatQuizAnswer(q, byId.get(q.id)?.userAnswer),
        isCorrect: byId.get(q.id)?.isCorrect ?? null,
      }));

    onPrint({
      classId,
      chapterId,
      chapterTitle: session.chapterTitle || 'Séance',
      sessionStartedAt: session.startedAt,
      presentStudents: presentNames,
      exercises: openedExercises,
      annotated,
      strokes: activityStrokes,
      quizQuestions,
      quizAnswered,
      // Même identité d'impression que le Studio : orientation, marges, typo et
      // style des zones de réponse (déjà semé depuis la personnalisation prof).
      layout: sessionPrintLayout(loadPrintLayout(), columns),
      options: { includeStudents, includeAnnotations, includeCorrections },
    });
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" />
      <div
        className="relative flex max-h-[88vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        {/* En-tête */}
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <div className="flex items-center gap-2.5">
            <span className="grid h-9 w-9 place-items-center rounded-lg bg-slate-900 text-white"><Printer size={16} /></span>
            <div>
              <h2 className="text-sm font-bold text-slate-900">Imprimer la séance</h2>
              <p className="text-[11px] text-slate-400">Séance du {session.startedAt ? new Date(session.startedAt).toLocaleDateString('fr-FR') : 'date inconnue'}</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="grid h-8 w-8 place-items-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-700" aria-label="Fermer">
            <X size={16} />
          </button>
        </div>

        {/* Corps */}
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {/* Détails de séance */}
          <div className="mb-4 rounded-xl border border-slate-100 bg-slate-50/60 px-4 py-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Chapitre</span>
              <span className="truncate text-[13px] font-semibold text-slate-800">{session.chapterTitle || 'Non défini'}</span>
            </div>
            {session.startedAt && (
              <div className="mt-1.5 flex items-center justify-between gap-2">
                <span className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Début</span>
                <span className="text-[13px] font-semibold text-slate-800">
                  {new Date(session.startedAt).toLocaleString([], { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            )}
          </div>

          {loading ? (
            <LoadingSpinner variant="section" label="Analyse de la séance…" audience="professor" className="py-10" />
          ) : (
            <>
              {!chapterId && (
                <p className="mb-3 rounded-lg border border-amber-100 bg-amber-50 px-3 py-2 text-[11px] leading-relaxed text-amber-700">
                  Aucun chapitre associé à cette séance. Lancez une activité (quiz, exercice ou révision) depuis la tablette pour l'alimenter automatiquement.
                </p>
              )}

              {/* Ventilation par type */}
              <div className="grid grid-cols-2 gap-2.5">
                <div className="rounded-xl border border-slate-100 p-3">
                  <div className="flex items-center gap-1.5 text-[11px] font-bold text-slate-500"><Layers size={13} className="text-emerald-600" /> Exercices</div>
                  <p className="mt-1 text-2xl font-black tabular-nums text-slate-900">{summary.exercisesCount}</p>
                  <p className="text-[10px] text-slate-400">{summary.annotatedExercises} annoté{summary.annotatedExercises > 1 ? 's' : ''}</p>
                </div>
                <div className="rounded-xl border border-slate-100 p-3">
                  <div className="flex items-center gap-1.5 text-[11px] font-bold text-slate-500"><FileText size={13} className="text-amber-600" /> Quiz remplis</div>
                  <p className="mt-1 text-2xl font-black tabular-nums text-slate-900">{summary.quizAnswered}</p>
                  <p className="text-[10px] text-slate-400">{quizQuestions.length} question{quizQuestions.length > 1 ? 's' : ''} au total</p>
                </div>
                <div className="rounded-xl border border-slate-100 p-3">
                  <div className="flex items-center gap-1.5 text-[11px] font-bold text-slate-500"><PenTool size={13} className="text-purple-600" /> Zones manuscrites</div>
                  <p className="mt-1 text-2xl font-black tabular-nums text-slate-900">{summary.annotatedCount}</p>
                  <p className="text-[10px] text-slate-400">avec du contenu</p>
                </div>
                <div className="rounded-xl border border-slate-100 p-3">
                  <div className="flex items-center gap-1.5 text-[11px] font-bold text-slate-500"><UsersRound size={13} className="text-indigo-600" /> Élèves présents</div>
                  <p className="mt-1 text-2xl font-black tabular-nums text-slate-900">{summary.presentCount}</p>
                  <p className="text-[10px] text-slate-400">déclarés pour la séance</p>
                </div>
              </div>

              {/* Options */}
              <div className="mt-4 space-y-2">
                <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Options du rendu</p>
                <label className="flex items-center justify-between gap-3 rounded-lg border border-slate-100 px-3 py-2.5 text-[13px] font-medium text-slate-700">
                  Mise en page de la séance
                  <select aria-label="Colonnes de la séance" value={columns} onChange={e => setColumns(e.target.value === '2' ? 2 : 1)} className="rounded-lg border border-slate-200 bg-white px-2 py-1.5">
                    <option value="1">Une colonne</option>
                    <option value="2">Deux colonnes</option>
                  </select>
                </label>
                {[
                  { label: 'Inclure la liste des élèves présents', checked: includeStudents, onChange: setIncludeStudents },
                  { label: 'Inclure les zones manuscrites annotées', checked: includeAnnotations, onChange: setIncludeAnnotations },
                  { label: 'Inclure les corrections (solutions)', checked: includeCorrections, onChange: setIncludeCorrections },
                ].map(opt => (
                  <label key={opt.label} className="flex cursor-pointer items-center gap-3 rounded-lg border border-slate-100 px-3 py-2.5 transition hover:bg-slate-50">
                    <input type="checkbox" checked={opt.checked} onChange={e => opt.onChange(e.target.checked)} className="h-4 w-4 shrink-0 rounded border-slate-300 accent-slate-900" />
                    <span className="text-[13px] font-medium text-slate-700">{opt.label}</span>
                  </label>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Pied de page */}
        <div className="flex items-center justify-end gap-2 border-t border-slate-100 bg-slate-50/60 px-5 py-3">
          <button type="button" onClick={onClose} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 transition hover:bg-white">
            Annuler
          </button>
          <button
            type="button"
            onClick={handlePrint}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white transition hover:bg-slate-700 disabled:opacity-40"
          >
            <CheckCircle2 size={14} /> Générer le PDF
          </button>
        </div>
      </div>
    </div>
  );
}
