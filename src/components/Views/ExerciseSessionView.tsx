


import React, { useState, useMemo, useEffect, useCallback, memo, useRef, Suspense } from 'react';
import { lazyWithRetry } from '../../utils/lazyWithRetry';
import Header from '../Layout/Header';
import { faFolderOpen, faPrint, faRotateRight, faTriangleExclamation } from '@fortawesome/free-solid-svg-icons';
import { FaIcon } from '../UI/FaIcon';
import { useExerciseData } from '../../hooks/useExerciseData';
import ExerciseArticle from '@/components/Exercise/ExerciseArticle';
import PrintableChapterExercises from '@/components/Exercise/PrintableChapterExercises';
import { Exercise, MasteryLevel } from '../../types';
import DashboardBackground from '../UI/DashboardBackground';
import LoadingSpinner from '../UI/LoadingSpinner';
import { printPrepared } from '@/services/printService';
import { useMinimumLoading } from '../../hooks/useMinimumLoading';
import { useProfessorAccess } from '../../hooks/useProfessorAccess';
import { useSessionActivitySync } from '../../hooks/useSessionActivitySync';
import { readExerciseStrokes } from '../../services/sessionArchiveService';
import StudentsFloatingIcon from '@/components/ProfStudio/StudentsFloatingIcon';
import { CanvasRailDock } from '@/components/Exercise/canvas/CanvasRailDock';
import ExerciseBoard from '@/components/Exercise/board/ExerciseBoard';
import { useIsTabletSurface } from '../../hooks/useProfViewMode';
import { useProfPersonalization } from '../../hooks/useProfPersonalization';
import { useI18n } from '../../i18n/I18nContext';

// Chargés à la demande : la barre d'outils ne concerne que les professeurs en
// session d'exercice (le reste de l'app ne la télécharge pas).
const CanvasFloatingToolbar = lazyWithRetry(() => import('@/components/Exercise/canvas/FloatingToolbar').then(m => ({ default: m.CanvasFloatingToolbar })));

interface ExerciseSessionViewProps {
  chapterId: string;
  chapterTitle: string;
  classId?: string;
  onExit: () => void;
  onHome: () => void;
  onProgressUpdate: (uniqueId: string, mastery: MasteryLevel, lastHintIndex?: number) => void;
  onFeedbackUpdate: (exerciseId: string, mastery: MasteryLevel, duration?: number | null) => void;
  savedFeedback?: Record<string, MasteryLevel>;
  savedDurations?: Record<string, number | null>;
  isChapterSubmitted?: boolean;
  /** Pre-loaded exercises (examen mode): bypass useExerciseData loading */
  preloadedExercises?: Exercise[];
  /** Session type for examen (normale / rattrapage) */
  examenSession?: string;
}

const CARD_THEMES = [
    {
        background: '#E6EAFA',
        ink: '#1B2244',
        muted: '#4D5C92',
        progress: '#3A5294',
        badgeBg: 'rgba(255, 255, 255, 0.6)',
        badgeBorder: 'rgba(30,37,72,0.06)',
        hoverBg: '#F3F5FC',
    },
    {
        background: '#FFF0E6',
        ink: '#662D15',
        muted: '#9E4F2E',
        progress: '#FF7F50',
        badgeBg: 'rgba(255, 255, 255, 0.6)',
        badgeBorder: 'rgba(255, 127, 80, 0.08)',
        hoverBg: '#FFF7F2',
    },
    {
        background: '#F6F3EE',
        ink: '#232D37',
        muted: '#4D5A68',
        progress: '#3A5294',
        badgeBg: 'rgba(255, 255, 255, 0.6)',
        badgeBorder: 'rgba(35, 45, 55, 0.08)',
        hoverBg: '#FAF8F5',
    },
    {
        background: '#F1EBF7',
        ink: '#3C1B54',
        muted: '#684687',
        progress: '#FF7F50',
        badgeBg: 'rgba(255, 255, 255, 0.6)',
        badgeBorder: 'rgba(60, 27, 84, 0.06)',
        hoverBg: '#F8F4FD',
    },
];

const getThemeForChapter = (id: string = '') => {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = id.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % CARD_THEMES.length;
  return CARD_THEMES[index];
};

/** Style/color de la zone de réponse choisis par le prof (localStorage). */
function readAnswerSpacePrefs(): {
  style: 'seyes' | 'slate' | 'grid' | 'dotted' | 'blank';
  color: 'white' | 'cream' | 'black' | 'green' | 'blue';
} {
  try {
    const raw = localStorage.getItem('mathplus:prof-personalization');
    if (raw) {
      const p = JSON.parse(raw) as { exercise?: { answerSpaceStyle?: string; answerSpaceColor?: string } };
      return {
        style: (p.exercise?.answerSpaceStyle as 'seyes' | 'slate' | 'grid' | 'dotted' | 'blank') || 'grid',
        color: (p.exercise?.answerSpaceColor as 'white' | 'cream' | 'black' | 'green' | 'blue') || 'white',
      };
    }
  } catch { /* ignoré */ }
  return { style: 'grid', color: 'white' };
}

const ExerciseSessionView: React.FC<ExerciseSessionViewProps> = ({
  chapterId, chapterTitle, classId, onExit, onHome: _onHome, onProgressUpdate: _onProgressUpdate, onFeedbackUpdate, savedFeedback, savedDurations, isChapterSubmitted = false, preloadedExercises, examenSession
}) => {
  const { dir, lang, t } = useI18n();
  const [userClassId, setUserClassId] = useState<string | undefined>(classId);
  const theme = useMemo(() => getThemeForChapter(chapterId), [chapterId]);
  const answerSpace = useMemo(() => readAnswerSpacePrefs(), []);
  const touchSessionRef = useRef<{
    startX: number;
    startY: number;
    startTime: number;
    tracking: boolean;
  } | null>(null);

  // Initialize exerciseFeedback and durations from persisted state
  const [exerciseFeedback, setExerciseFeedback] = useState<Record<string, MasteryLevel>>(savedFeedback || {});
  const [exerciseDurations, setExerciseDurations] = useState<Record<string, number | null>>(savedDurations || {});

  useEffect(() => {
      if (!userClassId) {
          try {
              const stored = localStorage.getItem('planet-math:app:v6.0');
              if (stored) {
                  const data = JSON.parse(stored);
                  if (data.user?.classId) setTimeout(() => setUserClassId(data.user.classId), 0);
              }
          } catch {
              // Ignore local storage errors
          }
      }
  }, [userClassId]);

  const isExamenMode = !!preloadedExercises;

  const { exercises, loading: hookLoading, loadErrors, progressStats: hookProgressStats } = useExerciseData(
    isExamenMode ? undefined : userClassId,
    isExamenMode ? undefined : chapterId
  );

  const loading = isExamenMode ? false : hookLoading;
  const showLoading = useMinimumLoading(loading);
  
  const [currentExerciseIndex, setCurrentExerciseIndex] = useState(0);
  const [activeSubQuestionId, setActiveSubQuestionId] = useState<string | null>(null);
  const [isAnimating, setIsAnimating] = useState(false);
  const professorAccess = useProfessorAccess();
  const isTabletSurface = useIsTabletSurface();
  const { canvas } = useProfPersonalization();

  const chapterExercises = useMemo(() => {
    if (isExamenMode) return preloadedExercises!;
    // A chapter id is only unique WITHIN a class: "complexes", "logique", "limites"…
    // exist in several classes at once. Until the class is known, useExerciseData
    // falls back to loading every class, so filtering on chapterId alone would mix
    // the levels together (e.g. 34 exercises of 2eme-bac-sc-math + 13 of 2eme-bac-sc-ex).
    return exercises.filter(ex =>
        ex.chapterId === chapterId && (!userClassId || ex.classId === userClassId)
    );
  }, [isExamenMode, preloadedExercises, exercises, chapterId, userClassId]);

  const progressStats = useMemo(() => {
    if (!isExamenMode) return hookProgressStats;
    // For examen mode, compute progress from feedback state
    const total = chapterExercises.length;
    const completed = Object.keys(exerciseFeedback).length;
    return { total, completed, percentage: total === 0 ? 0 : Math.round((completed / total) * 100) };
  }, [isExamenMode, hookProgressStats, chapterExercises.length, exerciseFeedback]);

  // ── Suivi d'activité de séance (tablette prof) ────────────────────────────
  // Les exercices ouverts, la position courante (numéro d'exercice) et les traits
  // manuscrits sont transmis au PC (via la séance Redis) afin que la vue
  // « Pilotage » affiche l'avancement en temps réel et que « Imprimer la séance »
  // n'archive que ce qui a été réellement travaillé pendant la séance.
  const openedIdsRef = useRef<string[]>([]);

  useEffect(() => {
    const ex = chapterExercises[currentExerciseIndex];
    if (ex && !openedIdsRef.current.includes(ex.id)) {
      openedIdsRef.current = [...openedIdsRef.current, ex.id];
    }
  }, [chapterExercises, currentExerciseIndex]);

  useSessionActivitySync(userClassId, () => ({
    exerciseIds: openedIdsRef.current,
    strokes: readExerciseStrokes(chapterExercises.filter(exercise => openedIdsRef.current.includes(exercise.id))),
    position: {
      type: 'exercise',
      index: currentExerciseIndex + 1,
      count: chapterExercises.length,
    },
  }));

  useEffect(() => {
      if (currentExerciseIndex >= chapterExercises.length && chapterExercises.length > 0) setTimeout(() => setCurrentExerciseIndex(0), 0);
  }, [chapterExercises.length, currentExerciseIndex]);

  // ── Reprise exacte : ouvrir sur le premier exercice non encore évalué ──
  // (mode chapitre uniquement, une seule fois après le chargement).
  const didInitResumeRef = useRef(false);
  useEffect(() => {
      if (isExamenMode || didInitResumeRef.current || chapterExercises.length === 0) return;
      didInitResumeRef.current = true;
      const firstUnreviewed = chapterExercises.findIndex(ex => exerciseFeedback[ex.id] == null);
      if (firstUnreviewed > 0) {
        setTimeout(() => setCurrentExerciseIndex(firstUnreviewed), 0);
      }
  }, [isExamenMode, chapterExercises, exerciseFeedback]);

  const handleToggle = useCallback((uniqueId: string) => setActiveSubQuestionId(prev => prev === uniqueId ? null : uniqueId), []);

  const changeExercise = useCallback((direction: 'prev' | 'next') => {
      const newIndex = direction === 'next' ? currentExerciseIndex + 1 : currentExerciseIndex - 1;
      if (newIndex >= 0 && newIndex < chapterExercises.length) {
          setIsAnimating(true);
          setActiveSubQuestionId(null);
          setTimeout(() => { 
              setCurrentExerciseIndex(newIndex); 
              setIsAnimating(false); 
              window.scrollTo({ top: 0, behavior: 'smooth' }); 
          }, 300);
      }
  }, [currentExerciseIndex, chapterExercises.length]);

  const shouldIgnoreSwipeTarget = useCallback((target: EventTarget | null): boolean => {
      if (!(target instanceof HTMLElement)) return false;
      return !!target.closest(
          'button, a, input, textarea, select, label, summary, details, canvas, [role="button"], [role="separator"], [data-no-swipe], [data-canvas-zone], .boxnote-dots, .boxnote-trigger-row'
      );
  }, []);

  const handleTouchStart = useCallback((e: React.TouchEvent<HTMLDivElement>) => {
      if (isExamenMode || isAnimating || e.touches.length !== 1) {
          touchSessionRef.current = null;
          return;
      }

      if (shouldIgnoreSwipeTarget(e.target)) {
          touchSessionRef.current = null;
          return;
      }

      const touch = e.touches[0];
      touchSessionRef.current = {
          startX: touch.clientX,
          startY: touch.clientY,
          startTime: Date.now(),
          tracking: true
      };
  }, [isExamenMode, isAnimating, shouldIgnoreSwipeTarget]);

  const handleTouchEnd = useCallback((e: React.TouchEvent<HTMLDivElement>) => {
      const session = touchSessionRef.current;
      touchSessionRef.current = null;

      if (!session?.tracking || isExamenMode || isAnimating) return;
      if (e.changedTouches.length !== 1) return;
      if (shouldIgnoreSwipeTarget(e.target)) return;

      const touch = e.changedTouches[0];
      const dx = touch.clientX - session.startX;
      const dy = touch.clientY - session.startY;
      const dt = Date.now() - session.startTime;
      const absDx = Math.abs(dx);
      const absDy = Math.abs(dy);

      const isHorizontalIntent = absDx >= 72 && absDx > absDy * 1.35;
      const isNaturalGesture = dt <= 700;

      if (!isHorizontalIntent || !isNaturalGesture) return;

      const goesForward = dir === 'rtl' ? dx > 0 : dx < 0;
      if (goesForward && currentExerciseIndex < chapterExercises.length - 1) {
          changeExercise('next');
      } else if (!goesForward && currentExerciseIndex > 0) {
          changeExercise('prev');
      }
  }, [isExamenMode, isAnimating, shouldIgnoreSwipeTarget, currentExerciseIndex, chapterExercises.length, changeExercise, dir]);

  const handleGlobalFeedback = useCallback((mastery: MasteryLevel, duration?: number | null) => {
      const currentExercise = chapterExercises[currentExerciseIndex];
      if (!currentExercise) return;

      // Update local state
      const newFeedbackState = { ...exerciseFeedback, [currentExercise.id]: mastery };
      setExerciseFeedback(newFeedbackState);
      if (duration !== undefined) {
          setExerciseDurations(prev => ({ ...prev, [currentExercise.id]: duration }));
      }

      // Persist to global state
      onFeedbackUpdate(currentExercise.id, mastery, duration);

      const allReviewed = chapterExercises.every(ex => newFeedbackState[ex.id] !== undefined && newFeedbackState[ex.id] !== null);
      const isLastExercise = currentExerciseIndex === chapterExercises.length - 1;

      // Auto-advance or close
      if (allReviewed || isLastExercise) {
          setTimeout(() => { onExit(); }, 800);
      } else {
          setTimeout(() => { changeExercise('next'); }, 600);
      }
  }, [chapterExercises, currentExerciseIndex, exerciseFeedback, onExit, onFeedbackUpdate, changeExercise]);

  // ── Examen/DS vertical mode: helpers for per-exercise feedback ──
  const handleExamenFeedback = useCallback((exerciseId: string, mastery: MasteryLevel, duration?: number | null) => {
    setExerciseFeedback(prev => ({ ...prev, [exerciseId]: mastery }));
    if (duration !== undefined) {
      setExerciseDurations(prev => ({ ...prev, [exerciseId]: duration }));
    }
    // Persist to global state (cloud + localStorage sync)
    onFeedbackUpdate(exerciseId, mastery, duration);
  }, [onFeedbackUpdate]);

  // Print handler for examen mode — prints ALL exercises
  const handleExamenPrint = useCallback(async () => {
    await printPrepared();
  }, []);

    if (showLoading) return <LoadingSpinner context="exercise" label={examenSession ? 'Préparation de l’examen' : undefined} />;

  // Show error banner if some exercises failed to load
  const ErrorBanner = loadErrors.length > 0 ? (
    <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-2xl">
      <div className="flex items-start gap-3">
        <FaIcon icon={faTriangleExclamation} className="w-5 h-5 text-amber-600 mt-0.5 shrink-0" />
        <div className="flex-1">
          <h4 className="font-bold text-amber-900 text-sm mb-1">
            {loadErrors.length} exercice{loadErrors.length > 1 ? 's' : ''} n'ont pas pu être chargés
          </h4>
          <ul className="text-xs text-amber-700 space-y-1">
            {loadErrors.slice(0, 3).map((err, i) => (
              <li key={i} className="typo-ui truncate">
                {err.filePath.split('/').pop()}: {err.message}
              </li>
            ))}
            {loadErrors.length > 3 && (
              <li className="text-amber-600">... et {loadErrors.length - 3} autre(s)</li>
            )}
          </ul>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-amber-700 hover:text-amber-900 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 rounded"
          >
            <FaIcon icon={faRotateRight} size={12} /> {t('common.retry')}
          </button>
        </div>
      </div>
    </div>
  ) : null;

  if (chapterExercises.length === 0) return (
      <div className="flex flex-col items-center justify-center min-h-screen text-center px-4 bg-transparent">
          <div className="bg-surface p-[clamp(1.5rem,4vw,2.5rem)] rounded-[2rem] border border-slate-200 shadow-premium-md max-w-md w-full flex flex-col items-center">
              <div className={`w-[clamp(4rem,6vw,5rem)] h-[clamp(4rem,6vw,5rem)] ${loadErrors.length > 0 ? 'bg-amber-100' : 'bg-slate-100'} rounded-full flex items-center justify-center mb-[clamp(1rem,2.4vw,1.5rem)] ${loadErrors.length > 0 ? 'text-amber-500' : 'text-slate-400'}`}>
                  {loadErrors.length > 0 ? <FaIcon icon={faTriangleExclamation} size={36} /> : <FaIcon icon={faFolderOpen} size={36} />}
              </div>
              <h2 className="text-[clamp(1.5rem,1.3rem_+_1vw,1.95rem)] typo-ui font-semibold text-ink mb-[clamp(0.75rem,1.6vw,1rem)]">
                  {loadErrors.length > 0 ? 'Erreur de chargement' : 'Chapitre Vide'}
              </h2>
              <p className="text-[clamp(0.9rem,0.85rem_+_0.22vw,1rem)] text-slate-500 mb-4 leading-relaxed typo-ui font-light">
                  {loadErrors.length > 0
                      ? 'Les exercices de ce chapitre n\'ont pas pu être chargés.'
                      : 'Il n\'y a pas encore d\'exercices disponibles pour ce chapitre.'
                  }
              </p>
              {loadErrors.length > 0 && (
                  <div className="w-full mb-6 p-3 bg-amber-50 border border-amber-200 rounded-xl text-left">
                      <p className="text-xs text-amber-800 font-medium mb-2">Détails :</p>
                      <ul className="text-xs text-amber-700 space-y-1 typo-ui">
                          {loadErrors.map((err, i) => (
                              <li key={i} className="truncate">{err.message}</li>
                          ))}
                      </ul>
                  </div>
              )}
              <div className="flex gap-3 w-full">
                  {loadErrors.length > 0 && (
                      <button
                          type="button"
                          onClick={() => window.location.reload()}
                          className="flex-1 py-[clamp(0.85rem,1.8vw,1.05rem)] bg-amber-500 text-white hover:bg-amber-600 font-bold rounded-xl transition-all typo-ui uppercase tracking-wide text-[clamp(0.8rem,0.76rem_+_0.18vw,0.9rem)] flex items-center justify-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
                      >
                      <FaIcon icon={faRotateRight} size={16} /> {t('common.retry')}
                      </button>
                  )}
                  <button onClick={onExit} className={`${loadErrors.length > 0 ? 'flex-1' : 'w-full'} py-[clamp(0.85rem,1.8vw,1.05rem)] bg-slate-900 text-white hover:bg-slate-800 font-bold rounded-none transition-all typo-mono uppercase tracking-widest text-[clamp(0.8rem,0.76rem_+_0.18vw,0.9rem)] border-2 border-slate-900 shadow-[4px_4px_0_rgba(0,0,0,0.1)]`}>
                      {t('common.returnToHub')}
                  </button>
              </div>
          </div>
      </div>
  );

  const currentExercise = chapterExercises[currentExerciseIndex];

  // Determine which exercise(s) to print. 
  // Per requirement "depends on each exercise", we pass the current one.
  const exercisesToPrint = currentExercise ? [currentExercise] : [];

  // ── Examen mode: unified vertical layout ──
  if (isExamenMode) {
    const completedCount = chapterExercises.filter(ex => exerciseFeedback[ex.id] != null).length;
    const allDone = chapterExercises.length > 0 && completedCount === chapterExercises.length;

    return (
      <>
        <div dir={dir} lang={lang} className="min-h-screen text-ink selection:bg-accent-blue/20 selection:text-accent-blue relative bg-transparent print-hide overflow-y-auto">
          <DashboardBackground />
          <div 
            className="absolute inset-x-0 top-0 h-96 pointer-events-none opacity-[0.08]" 
            style={{ backgroundImage: `linear-gradient(180deg, ${theme.progress}, transparent)` }}
          />

          {/* ── X close button ── */}
          <div className="fixed top-6 right-6 z-50">
            
          </div>

          {/* ── Exercise content ── */}
          <div className="relative z-10 w-full max-w-[1100px] mx-auto px-[clamp(1rem,3vw,2.5rem)] pb-[clamp(3.5rem,7vw,5rem)] pt-[clamp(1.25rem,3vw,2rem)]">

            {/* ── Title + session badge ── */}
            <div className="flex items-center justify-center gap-[clamp(0.6rem,1.4vw,0.9rem)] mb-[clamp(1.25rem,3vw,2rem)] flex-wrap">
              <h1 className="typo-ui font-bold text-[clamp(1.35rem,1.1rem_+_1.2vw,1.95rem)] text-[#2c2b29] tracking-tight text-center">
                {chapterTitle.replace(/\s*session\s+(normale|rattrapage)\s*/gi, ' ').replace(/\s*[—–-]\s*/g, ' ').trim()}
              </h1>
              {examenSession && (
                <span className={`inline-flex items-center px-[clamp(0.65rem,1.4vw,0.9rem)] py-1 text-[clamp(0.68rem,0.64rem_+_0.18vw,0.78rem)] typo-ui font-semibold uppercase tracking-[0.15em] shrink-0 rounded-none border ${
                  examenSession.toLowerCase() === 'rattrapage'
                    ? 'text-white bg-[#E11D48] border-transparent'
                    : 'text-white bg-[#4D8A2E] border-transparent'
                }`}>
                  {examenSession.toLowerCase() === 'rattrapage' ? 'Session Rattrapage' : 'Session Normale'}
                </span>
              )}
            </div>

            {ErrorBanner}

            <div className="bg-white rounded-2xl border border-[#e5e1d8] shadow-[0_10px_40px_rgba(44,40,37,0.04)] overflow-hidden relative">
              {/* ── Print button inside card, top-right ── */}
              <button
                type="button"
                onClick={handleExamenPrint}
                className="absolute top-4 right-4 z-10 flex items-center gap-1.5 px-[clamp(0.65rem,1.4vw,0.9rem)] py-[clamp(0.35rem,0.7vw,0.45rem)] rounded-lg border border-[#e5e1d8] bg-white/90 backdrop-blur-sm text-slate-600 hover:border-[#1677ff] hover:text-[#1677ff] shadow-sm transition-all text-[clamp(0.72rem,0.68rem_+_0.16vw,0.82rem)] font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1677ff]"
                title={t('common.print')}
              >
                <FaIcon icon={faPrint} size={15} />
                <span className="typo-ui font-semibold">{t('common.print')}</span>
              </button>

              <div className="divide-y divide-[#f0ede4]">
                {chapterExercises.map((exercise, idx) => (
                  <ExerciseArticle
                    key={exercise.id}
                    exercise={exercise}
                    currentIndex={idx}
                    activeSubQuestionId={activeSubQuestionId}
                    onToggle={handleToggle}
                    onGlobalFeedback={(mastery, duration) => handleExamenFeedback(exercise.id, mastery, duration)}
                    globalFeedback={exerciseFeedback[exercise.id] ?? null}
                    globalDuration={exerciseDurations[exercise.id]}
                    isLocked={false}
                    isExamenMode
                  />
                ))}
              </div>
            </div>

            {/* ── Finish banner ── */}
            {allDone && (
              <div className="mt-8 flex justify-center animate-in fade-in slide-in-from-bottom-4 duration-500">
                <button
                  onClick={onExit}
                  className="px-[clamp(1.75rem,4vw,2.75rem)] py-[clamp(0.7rem,1.5vw,0.85rem)] rounded-none typo-mono font-bold text-[clamp(0.72rem,0.68rem_+_0.16vw,0.82rem)] tracking-[0.2em] uppercase text-white bg-[#4D8A2E] hover:bg-[#345A16] active:scale-[0.98] shadow-[4px_4px_0_rgba(77,138,46,0.2)] border-2 border-[#4D8A2E] transition-all"
                >
                  {t('common.finish')}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* ── Print version — all exercises ── */}
        <div className="print-only">
          <PrintableChapterExercises
            chapterTitle={chapterTitle}
            classId={userClassId}
            exercises={chapterExercises}
            startIndex={0}
            hideTeacherName
            answerSpaceStyle={answerSpace.style}
            answerSpaceColor={answerSpace.color}
          />
        </div>

        {professorAccess && canvas.enabled && canvas.showToolbar && (
          <Suspense fallback={null}>
            <CanvasFloatingToolbar />
          </Suspense>
        )}
      </>
    );
  }

  // ── Normal chapter mode (one exercise at a time) ──

   return (
    <>
        {/* INTERFACE ÉCRAN (Cachée à l'impression) */}
        <div
            dir={dir}
            lang={lang}
            className="min-h-screen text-ink selection:bg-accent-blue/20 selection:text-accent-blue relative bg-transparent print-hide overflow-visible touch-pan-y"
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
        >
            <DashboardBackground />
            <div 
              className="absolute inset-x-0 top-0 h-96 pointer-events-none opacity-[0.08]" 
              style={{ backgroundImage: `linear-gradient(180deg, ${theme.progress}, transparent)` }}
            />
            
            <div className="fixed top-0 left-0 w-full h-1 bg-slate-200/60 z-50">
                <div
                    className="h-full transition-all duration-700 ease-out"
                    style={{ 
                        width: `${progressStats.percentage}%`,
                        background: `linear-gradient(90deg, ${theme.progress}, #C4502A)`
                    }}
                />
            </div>
            
            <div className="fixed top-6 right-6 z-50">
                
            </div>
            
            {/* En mode prof la zone de réponse est l'objet principal : on élargit le conteneur,
                on supprime les marges latérales redondantes et on réserve une gouttière à droite
                de la largeur du rail d'outils flottant (50px + 24px d'écart) pour qu'il ne
                recouvre jamais la surface d'écriture au stylet. */}
            <div className={`relative z-10 w-full mx-auto pb-[clamp(2rem,4vw,2.75rem)] pt-[clamp(0.75rem,1.6vw,1.15rem)] ${professorAccess && isTabletSurface ? 'prof-tablet-exercise-content' : ''} ${
                professorAccess
                    ? 'max-w-[1600px] pl-[clamp(0.5rem,1.2vw,1rem)] pr-[clamp(0.5rem,1.2vw,0.75rem)] sm:pr-[84px]'
                    : 'max-w-[1150px] px-[clamp(0.85rem,2.8vw,2.5rem)]'
            }`}>
                <div data-no-swipe>
                    <Header
                        currentIndex={currentExerciseIndex}
                        totalExercises={chapterExercises.length}
                        onPrev={() => changeExercise('prev')}
                        onNext={() => changeExercise('next')}
                        onJumpTo={setCurrentExerciseIndex}
                    />
                </div>

                {ErrorBanner}

                <div className={`transition-all duration-500 ease-out transform ${isAnimating ? 'opacity-0 translate-y-4' : 'opacity-100 translate-y-0'}`}>
                    <ExerciseArticle
                        exercise={currentExercise}
                        currentIndex={currentExerciseIndex}
                        activeSubQuestionId={activeSubQuestionId}
                        onToggle={handleToggle}
                        onGlobalFeedback={handleGlobalFeedback}
                        globalFeedback={exerciseFeedback[currentExercise.id] ?? null}
                        globalDuration={exerciseDurations[currentExercise.id]}
                        isLocked={isChapterSubmitted}
                    />
                </div>

            </div>
        </div>

        {/* VERSION IMPRIMABLE (Visible uniquement à l'impression) */}
        <div className="print-only">
            <PrintableChapterExercises
                chapterTitle={chapterTitle}
                classId={userClassId}
                exercises={exercisesToPrint}
                startIndex={currentExerciseIndex}
                answerSpaceStyle={answerSpace.style}
                answerSpaceColor={answerSpace.color}
            />
        </div>

        {professorAccess && canvas.enabled && canvas.showToolbar && (
          <Suspense fallback={null}>
            <CanvasFloatingToolbar />
          </Suspense>
        )}

        {/* Dock flottant — exclusif tablette professeur. Même axe vertical que la
            barre d'outils canva : élèves, puis tableau juste en dessous. */}
        {professorAccess && (
          <CanvasRailDock>
            <StudentsFloatingIcon classId={userClassId} />
            {canvas.enabled && <ExerciseBoard exercise={currentExercise} index={currentExerciseIndex} />}
          </CanvasRailDock>
        )}
    </>
  );
};

export default memo(ExerciseSessionView);
