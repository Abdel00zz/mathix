import React, { useState, useEffect, useMemo, useCallback, useRef, memo } from 'react';
import { QuizResult } from '../../types';
import { concoursService, TaggedQuestion, School } from '../../services/concoursService';
import { recordConcoursAttempt, getThemeAverages } from '../../services/concoursProgress';
import {
  ConcoursSessionSnapshot,
  saveConcoursSession,
  loadConcoursSession,
  clearConcoursSession,
} from '../../services/concoursSession';
import { quizService } from '../../services/quizService';
import { playSound } from '../../utils/soundEngine';
import { randomSeed } from '../../utils/prng';
import { getQuestionTime, applyTiersTemps, isTiersTempsActive } from '../../utils/quizTiming';
import {
  faArrowTrendDown,
  faArrowTrendUp,
  faMinus,
  faRotateLeft,
  faXmark,
} from '@fortawesome/free-solid-svg-icons';
import { FaIcon } from '../UI/FaIcon';
import QuizCore from '../Quiz/QuizCore';
import DashboardBackground from '../UI/DashboardBackground';
import LoadingSpinner from '../UI/LoadingSpinner';
import { useMinimumLoading } from '../../hooks/useMinimumLoading';
import { useI18n } from '../../i18n/I18nContext';

const THEME_LABELS: Record<string, string> = {
  analyse: 'Analyse',
  algebre: 'Algèbre',
  probabilites: 'Probabilités',
  geometrie: 'Géométrie',
};

// ============================================================================
// TYPES
// ============================================================================

interface ConcoursQuizViewProps {
  schoolId: string;
  themeId: string | null;
  year?: string | null;
  questionCount: number;
  onExit: () => void;
}

type QuizState = 'loading' | 'resume' | 'setup' | 'playing' | 'feedback' | 'summary' | 'error';

// ============================================================================
// STYLES PARTAGÉS DES MODALES (shadcn/ui, cohérent avec le dashboard)
// ============================================================================

const MODAL_OVERLAY = 'fixed inset-0 z-[100] flex items-end sm:items-center justify-center sm:p-4';
const MODAL_BACKDROP = 'absolute inset-0 bg-slate-950/50 backdrop-blur-sm';
const MODAL_CARD = 'relative z-10 w-full bg-white border border-slate-200 rounded-t-2xl sm:rounded-2xl shadow-2xl shadow-slate-950/10 animate-in fade-in zoom-in-95 duration-200 typo-ui';
const BTN_PRIMARY = 'inline-flex items-center justify-center gap-2 rounded-xl px-[clamp(0.9rem,2vw,1.25rem)] py-[clamp(0.7rem,1.5vw,0.85rem)] text-[clamp(0.84rem,0.8rem_+_0.18vw,0.94rem)] font-semibold text-white transition-all hover:opacity-90 active:scale-[0.98] focus:outline-none disabled:opacity-50';
const BTN_SECONDARY = 'inline-flex items-center justify-center gap-2 rounded-xl px-[clamp(0.9rem,2vw,1.25rem)] py-[clamp(0.7rem,1.5vw,0.85rem)] text-[clamp(0.84rem,0.8rem_+_0.18vw,0.94rem)] font-semibold border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 transition-all active:scale-[0.98] focus:outline-none';
const BTN_DANGER_GHOST = 'inline-flex items-center justify-center gap-2 rounded-xl px-[clamp(0.9rem,2vw,1.25rem)] py-[clamp(0.7rem,1.5vw,0.85rem)] text-[clamp(0.84rem,0.8rem_+_0.18vw,0.94rem)] font-semibold border border-red-200 text-red-600 hover:bg-red-50 transition-all active:scale-[0.98] focus:outline-none';

/** Couleur de barre selon le seuil de réussite (palette dashboard). */
const barColorFor = (pct: number) => (pct >= 70 ? '#10b981' : pct >= 50 ? '#f59e0b' : '#ef4444');
const textColorFor = (pct: number) =>
  pct >= 70 ? 'text-emerald-600' : pct >= 50 ? 'text-amber-600' : 'text-red-600';

const CONCOURS_DURATIONS = [180, 270, 360, 480] as const;
const normalizeConcoursDuration = (value: number | null | undefined): number =>
  CONCOURS_DURATIONS.includes(value as (typeof CONCOURS_DURATIONS)[number]) ? value as number : 180;

// ============================================================================
// HEADER (compteur + sortie)
// ============================================================================

const QuestionCounterHeader: React.FC<{
  currentIndex: number;
  totalQuestions: number;
  onQuit: () => void;
}> = ({ currentIndex, totalQuestions, onQuit }) => {
  const { lang, t } = useI18n();
  const safeTotal = Math.max(totalQuestions, 1);
  const current = totalQuestions > 0 ? currentIndex + 1 : 0;

  return (
    <div className="shrink-0 w-full max-w-[840px] mx-auto px-[clamp(0.875rem,2.4vw,1.5rem)] pt-[clamp(0.45rem,1vw,0.75rem)] flex items-center justify-between">
      <div className="inline-flex items-center gap-[clamp(0.35rem,0.9vw,0.5rem)] px-2 py-1 md:-ms-6">
        <span className={`typo-ui text-[clamp(0.65rem,0.61rem_+_0.16vw,0.74rem)] font-semibold uppercase text-[#8F867A] ${lang === 'ar' ? 'tracking-normal' : 'tracking-[0.22em]'}`}>
          {t('common.question')}
        </span>
        <span className="text-[clamp(1.08rem,1rem_+_0.38vw,1.3rem)] font-semibold text-[#2c2b29] tabular-nums">
          {String(current).padStart(2, '0')}
        </span>
        <span className="text-[clamp(0.9rem,0.85rem_+_0.22vw,1.05rem)] text-[#C5A059]/80">/</span>
        <span className="text-[clamp(0.9rem,0.85rem_+_0.22vw,1.05rem)] font-medium text-[#9F988D] tabular-nums">
          {String(safeTotal).padStart(2, '0')}
        </span>
      </div>
      <button
        onClick={onQuit}
        type="button"
        aria-label={t('common.quit')}
        title={t('common.quit')}
        className="group inline-flex h-[clamp(2.5rem,2.35rem_+_0.5vw,2.85rem)] w-[clamp(2.5rem,2.35rem_+_0.5vw,2.85rem)] items-center justify-center rounded-full border border-slate-200/90 bg-white/75 text-slate-400 shadow-sm shadow-slate-900/[0.04] backdrop-blur-sm transition-all duration-200 hover:border-slate-300 hover:bg-white hover:text-slate-800 hover:shadow-md hover:shadow-slate-900/[0.08] active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400/60 focus-visible:ring-offset-2"
      >
        <FaIcon icon={faXmark} size={15} className="transition-transform duration-200 group-hover:rotate-90" />
      </button>
    </div>
  );
};

// Temps alloué à une question de concours : choix élève (setup) > temps
// officiel de l'école (45s ENSA, 50s ENSAM, 60s Médecine) > limite propre à
// la question > réglage global. Tiers-temps ×1.33 appliqué une seule fois.
const getTimeForQ = (q: TaggedQuestion | undefined, schoolTime?: number, customTime?: number | null): number =>
  getQuestionTime({ questionLimit: q?.timeLimit, schoolTime, customTime });

// ============================================================================
// RESULTS BREAKDOWN (progression par thème)
// ============================================================================

/** Chip de progression vs moyenne des essais précédents. */
const DeltaChip: React.FC<{ delta: number | null }> = ({ delta }) => {
  const base = 'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold tabular-nums';
  if (delta === null) {
    return <span className={`${base} bg-slate-100 text-slate-500`}>Nouveau</span>;
  }
  if (delta > 0) {
    return (
      <span className={`${base} bg-emerald-50 text-emerald-700`}>
        <FaIcon icon={faArrowTrendUp} size={11} /> +{delta} pts
      </span>
    );
  }
  if (delta < 0) {
    return (
      <span className={`${base} bg-red-50 text-red-600`}>
        <FaIcon icon={faArrowTrendDown} size={11} /> {delta} pts
      </span>
    );
  }
  return (
    <span className={`${base} bg-slate-100 text-slate-500`}>
      <FaIcon icon={faMinus} size={11} /> Stable
    </span>
  );
};

const ResultsBreakdown: React.FC<{
  questions: TaggedQuestion[];
  results: QuizResult[];
  school: School;
  /** Session du catalogue, ex: `annale-2023` / « Session 2023 ». */
  session: { itemId: string; label: string };
  /** false pour la relecture / le retravail des erreurs : on n'enregistre
   *  pas ces passages partiels dans l'historique (sinon ils gonflent les records). */
  shouldRecord: boolean;
  onReview: () => void;
  onRetry: () => void;
  onExit: () => void;
}> = ({ questions, results, school, session, shouldRecord, onReview, onRetry, onExit }) => {
  const { t } = useI18n();
  const accent = school.color || '#0f172a';

  const resultsMap = useMemo(() => {
    const map: Record<string, boolean> = {};
    results.forEach(r => { map[r.questionId] = r.isCorrect; });
    return map;
  }, [results]);

  const breakdown = useMemo(
    () => concoursService.computeBreakdown(questions, resultsMap),
    [questions, resultsMap]
  );

  // Référence « avant » : moyennes par thème des essais PRÉCÉDENTS. Calculée
  // au rendu, donc avant l'effet d'enregistrement ci-dessous (les effets
  // s'exécutent après le rendu) — l'essai courant n'y est pas inclus.
  const previousAverages = useMemo(() => getThemeAverages(school.id), [school.id]);

  const prevOverall = useMemo(() => {
    const entries = Object.values(previousAverages);
    const total = entries.reduce((s, e) => s + e.total, 0);
    if (total === 0) return null;
    const correct = entries.reduce((s, e) => s + (e.pct * e.total) / 100, 0);
    return Math.round((100 * correct) / total);
  }, [previousAverages]);

  const overallDelta = prevOverall === null ? null : breakdown.overall.pct - prevOverall;
  const hasMistakes = results.some(r => !r.isCorrect);

  useEffect(() => {
    if (!shouldRecord) return;
    recordConcoursAttempt({
      schoolId: school.id,
      itemId: session.itemId,
      label: session.label,
      pct: breakdown.overall.pct,
      correct: breakdown.overall.correct,
      total: breakdown.overall.total,
      date: Date.now(),
      byTheme: breakdown.byTheme,
    });
    // Enregistrement unique à l'affichage des résultats
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className={MODAL_OVERLAY}>
      <div className={MODAL_BACKDROP} />

      <div className={`${MODAL_CARD} sm:max-w-lg max-h-[90dvh] flex flex-col overflow-hidden`}>
        {/* Poignée mobile */}
        <div className="w-full flex justify-center pt-2.5 sm:hidden">
          <div className="w-10 h-1 rounded-full bg-slate-200" />
        </div>

        <div className="flex-1 overflow-y-auto p-[clamp(1.25rem,3.2vw,2rem)]">
          {/* Score essentiel */}
          <div className="text-center mb-[clamp(1.5rem,3.5vw,2rem)]">
            <div className="text-[clamp(2.65rem,2.1rem_+_2.2vw,3.4rem)] font-black tracking-tight text-slate-900 tabular-nums">
              {breakdown.overall.pct}%
            </div>
            <p className="mt-1.5 text-[clamp(0.68rem,0.64rem_+_0.16vw,0.78rem)] font-semibold uppercase tracking-widest text-slate-400">
              {breakdown.overall.correct}/{breakdown.overall.total} · {session.label}
            </p>
            {overallDelta !== null && (
              <div className="mt-2.5 flex justify-center">
                <DeltaChip delta={overallDelta} />
              </div>
            )}
          </div>

          {/* Progression par thème */}
          <div className="mb-[clamp(1.25rem,3vw,1.75rem)]">
            <h4 className="text-[clamp(0.68rem,0.64rem_+_0.15vw,0.76rem)] font-bold uppercase tracking-[0.2em] text-slate-400 mb-3">
              Par thème
            </h4>
            <div className="space-y-2">
              {Object.entries(breakdown.byTheme).map(([themeId, data]) => {
                const theme = school.themes.find(t => t.id === themeId);
                const label = theme?.name || THEME_LABELS[themeId] || themeId;
                const prev = previousAverages[themeId];
                const delta = prev ? data.pct - prev.pct : null;
                return (
                  <div
                    key={themeId}
                    className="rounded-xl border border-slate-200/70 bg-slate-50/60 px-[clamp(0.85rem,2vw,1.15rem)] py-[clamp(0.65rem,1.4vw,0.85rem)]"
                  >
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <span className="text-[clamp(0.8rem,0.76rem_+_0.16vw,0.9rem)] font-semibold text-slate-800 truncate">{label}</span>
                      <div className="flex items-center gap-2 shrink-0">
                        <DeltaChip delta={delta} />
                        <span className={`text-xs font-bold tabular-nums ${textColorFor(data.pct)}`}>
                          {data.pct}%
                        </span>
                      </div>
                    </div>
                    <div className="h-1.5 rounded-full bg-slate-200/70 overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-700"
                        style={{ width: `${data.pct}%`, backgroundColor: barColorFor(data.pct) }}
                      />
                    </div>
                    <div className="mt-1.5 flex items-center justify-between text-[10px] text-slate-400">
                      <span>{data.correct}/{data.total} correct</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Actions */}
          <div className="space-y-2.5">
            <button onClick={onReview} className={`${BTN_SECONDARY} w-full`}>
              {t('quiz.reviewAll')}
            </button>

            {hasMistakes && (
              <button
                onClick={onRetry}
                className={`${BTN_SECONDARY} w-full`}
                style={{ color: accent, borderColor: `color-mix(in srgb, ${accent} 35%, transparent)` }}
              >
                <FaIcon icon={faRotateLeft} size={14} /> {t('quiz.retryMistakesShort')}
              </button>
            )}

            <button
              onClick={onExit}
              className={`${BTN_PRIMARY} w-full`}
              style={{ backgroundColor: accent }}
            >
              {t('common.back')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// MAIN COMPONENT
// ============================================================================

const ConcoursQuizView: React.FC<ConcoursQuizViewProps> = ({ schoolId, themeId, year, questionCount, onExit }) => {
  const { dir, lang, t } = useI18n();
  const [questions, setQuestions] = useState<TaggedQuestion[]>([]);
  const [originalQuestions, setOriginalQuestions] = useState<TaggedQuestion[]>([]);
  const [school, setSchool] = useState<School | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [results, setResults] = useState<QuizResult[]>([]);
  const [quizState, setQuizState] = useState<QuizState>('loading');
  const [timeLeft, setTimeLeft] = useState(45);
  const [isReviewMode, setIsReviewMode] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [showExitModal, setShowExitModal] = useState(false);
  const [mistakeIds, setMistakeIds] = useState<Set<string>>(new Set());
  // Les sessions concours utilisent exclusivement les quatre durées proposées ci-dessous.
  const [customDuration, setCustomDuration] = useState<number | null>(180);
  const [pendingSnap, setPendingSnap] = useState<ConcoursSessionSnapshot | null>(null);
  const [restoredAnswer, setRestoredAnswer] = useState<{ questionId: string; answer: unknown } | null>(null);
  const showLoading = useMinimumLoading(quizState === 'loading');

  // Identifiant de session du catalogue (clé du snapshot de reprise).
  const itemId = year ? `annale-${year}` : themeId ? `theme-${themeId}` : 'random-all';

  const tiersTempsActive = useMemo(() => isTiersTempsActive(), []);
  const getFinalSeconds = useCallback(
    (baseSec: number) => applyTiersTemps(baseSec, tiersTempsActive),
    [tiersTempsActive]
  );

  const formatSecondsToMinutes = useCallback((sec: number) => {
    const mins = Math.floor(sec / 60);
    const secs = sec % 60;
    if (mins === 0) return `${secs}s`;
    return secs === 0 ? `${mins} min` : `${mins} min ${secs}s`;
  }, []);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const handleValidateRef = useRef<(answer: unknown, isTimeout?: boolean) => void>(() => {});

  const clearQuizTimer = useCallback(() => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  }, []);

  // ── PERSISTANCE DE SESSION (reprise exacte) ──────────────────────────────
  const seedRef = useRef<number | null>(null);
  // Abandon explicite ou épreuve soumise : ne pas re-sauver au démontage.
  const discardRef = useRef(false);
  // Sélection non validée de la question courante (remontée par QuizCore).
  const selectedAnswerRef = useRef<unknown>(null);
  // Miroirs des valeurs courantes pour persister « au moment du départ »
  // sans re-binder les listeners à chaque tick du chrono.
  const sessionRef = useRef({
    currentIndex: 0,
    timeLeft: 45,
    results: [] as QuizResult[],
    mistakeIds: new Set<string>(),
    customDuration: null as number | null,
    quizState: 'loading' as QuizState,
    isReviewMode: false,
  });
  useEffect(() => {
    sessionRef.current = { currentIndex, timeLeft, results, mistakeIds, customDuration, quizState, isReviewMode };
  });

  const persistSessionNow = useCallback(() => {
    if (discardRef.current || seedRef.current === null) return;
    const s = sessionRef.current;
    // Seule une épreuve réelle en cours est reprenable (pas la relecture).
    const inExam = (s.quizState === 'playing' || s.quizState === 'feedback') && !s.isReviewMode;
    if (!inExam) return;
    saveConcoursSession({
      seed: seedRef.current,
      schoolId,
      itemId,
      themeId: themeId ?? null,
      year: year ?? null,
      questionCount,
      customDuration: s.customDuration,
      currentIndex: s.currentIndex,
      timeLeft: s.timeLeft,
      results: s.results,
      mistakeIds: [...s.mistakeIds],
      pendingAnswer: selectedAnswerRef.current,
    });
  }, [schoolId, itemId, themeId, year, questionCount]);

  // Persiste sur bascule d'onglet/app, fermeture, et démontage de la vue
  // (back natif, changement de vue) — mêmes garanties que le quiz de chapitre.
  useEffect(() => {
    const onVisibility = () => { if (document.hidden) persistSessionNow(); };
    window.addEventListener('pagehide', persistSessionNow);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      persistSessionNow();
      window.removeEventListener('pagehide', persistSessionNow);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [persistSessionNow]);

  // Persiste après chaque réponse validée (protège d'une fermeture brutale).
  useEffect(() => {
    if (results.length > 0) persistSessionNow();
  }, [results, persistSessionNow]);

  // ── LOAD EXAM ─────────────────────────────────────────────────────────────
  useEffect(() => {
    const load = async () => {
      setQuizState('loading');
      try {
        // Une session interrompue relance le MÊME examen (graine persistée).
        let pending = loadConcoursSession(schoolId, itemId);
        const seed = pending?.seed ?? randomSeed();
        seedRef.current = seed;

        const [schoolData, examQuestions] = await Promise.all([
          concoursService.getSchool(schoolId),
          concoursService.buildExam({ schoolId, themeId, year, questionCount, timePerQuestion: 45, seed }),
        ]);

        if (!schoolData || examQuestions.length === 0) {
          setQuizState('error');
          return;
        }

        // Snapshot périmé si le contenu a changé depuis (ids introuvables)
        // ou s'il ne contient aucune réponse (rien à reprendre).
        if (pending) {
          const ids = new Set(examQuestions.map(q => q.id));
          const stillValid = pending.results.length > 0 && pending.results.every(r => ids.has(r.questionId));
          if (!stillValid) {
            clearConcoursSession(schoolId, itemId);
            pending = null;
          }
        }

        setSchool(schoolData);
        setQuestions(examQuestions);
        setOriginalQuestions(examQuestions);

        if (pending) {
          setPendingSnap(pending);
          setQuizState('resume');
        } else {
          setCustomDuration(180);
          setTimeLeft(getTimeForQ(examQuestions[0], schoolData.timePerQuestion, 180));
          setQuizState('setup');
        }
      } catch (err) {
        console.error('Concours load error:', err);
        setQuizState('error');
      }
    };

    load();
    return () => clearQuizTimer();
  }, [schoolId, themeId, year, questionCount, itemId, clearQuizTimer]);

  const currentQuestion = questions[currentIndex];
  const existingResult = useMemo(() => results.find(r => r.questionId === currentQuestion?.id), [results, currentQuestion]);
  const isCurrentAnswered = !!existingResult;

  const goToQuestion = useCallback((index: number, qList: TaggedQuestion[] = questions, rList: QuizResult[] = results) => {
    selectedAnswerRef.current = null;
    setCurrentIndex(index);
    const nextQuestion = qList[index];
    const nextAnswered = !!rList.find(r => r.questionId === nextQuestion?.id);
    if (nextAnswered) {
      setQuizState('feedback');
      clearQuizTimer();
    } else {
      setQuizState('playing');
      setTimeLeft(getTimeForQ(nextQuestion as TaggedQuestion, school?.timePerQuestion, customDuration));
    }
  }, [questions, results, clearQuizTimer, school?.timePerQuestion, customDuration]);

  // Timer — en pause quand l'onglet est masqué (la question ne doit pas
  // expirer pendant une absence) ou quand la modale de sortie est ouverte.
  useEffect(() => {
    clearQuizTimer();
    if (quizState !== 'playing' || isCurrentAnswered || showExitModal) return;
    timerRef.current = setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) return;
      setTimeLeft(p => Math.max(0, p - 1));
    }, 1000);
    return () => clearQuizTimer();
  }, [quizState, isCurrentAnswered, showExitModal, clearQuizTimer]);

  // Timeout
  useEffect(() => {
    if (timeLeft <= 0 && quizState === 'playing' && !isCurrentAnswered) {
      clearQuizTimer();
      handleValidateRef.current(null, true);
    }
  }, [timeLeft, quizState, isCurrentAnswered, clearQuizTimer]);

  // ── NAVIGATE ──────────────────────────────────────────────────────────────
  const handleNavigate = useCallback((direction: 'prev' | 'next') => {
    playSound('click');
    if (direction === 'prev') {
      if (currentIndex > 0) goToQuestion(currentIndex - 1);
    } else {
      if (currentIndex < questions.length - 1) {
        goToQuestion(currentIndex + 1);
      } else {
        if (!isReviewMode) setShowConfirmModal(true);
        else { setQuizState('summary'); playSound('finish'); }
      }
    }
  }, [currentIndex, questions.length, isReviewMode, goToQuestion]);

  // ── VALIDATE ──────────────────────────────────────────────────────────────
  const handleValidate = useCallback(async (answer: unknown, isTimeout: boolean = false) => {
    if (!currentQuestion || results.some(r => r.questionId === currentQuestion.id)) return;

    let isCorrect = false;
    if (!isTimeout) {
      isCorrect = await quizService.verifyAnswer(currentQuestion, answer);
    }

    if (isCorrect) { playSound('correct'); }
    else { playSound('wrong'); setMistakeIds(prev => new Set(prev).add(currentQuestion.id)); }

    const allocatedTime = getTimeForQ(currentQuestion as TaggedQuestion, school?.timePerQuestion, customDuration);
    const timeSpent = Math.max(0, allocatedTime - timeLeft);

    const newResult: QuizResult = { questionId: currentQuestion.id, isCorrect, userAnswer: answer, timeSpent };
    // La question est validée : plus de sélection « en attente » à reprendre.
    selectedAnswerRef.current = null;
    setResults(prev => [...prev, newResult]);
    setQuizState('feedback');
  }, [currentQuestion, results, timeLeft, school?.timePerQuestion, customDuration]);

  useEffect(() => { handleValidateRef.current = handleValidate; });

  // Notifié par QuizCore quand l'élève change de sélection (avant validation) :
  // persistée dans le snapshot pour une reprise vraiment exacte.
  const handleAnswerChange = useCallback((answer: unknown) => {
    selectedAnswerRef.current = answer;
    persistSessionNow();
  }, [persistSessionNow]);

  const confirmSubmit = useCallback(() => {
    setShowConfirmModal(false);
    clearQuizTimer();
    // Épreuve soumise : plus rien à reprendre.
    discardRef.current = true;
    clearConcoursSession(schoolId, itemId);
    setQuizState('summary');
    playSound('finish');
  }, [clearQuizTimer, schoolId, itemId]);

  const startReview = useCallback(() => {
    setIsReviewMode(true);
    setQuestions(originalQuestions);
    goToQuestion(0, originalQuestions, results);
  }, [originalQuestions, results, goToQuestion]);

  const retryMistakes = useCallback(() => {
    const wrongQ = originalQuestions.filter(q => mistakeIds.has(q.id));
    if (wrongQ.length === 0) return;
    setQuestions(wrongQ);
    setResults([]);
    setIsReviewMode(true);
    goToQuestion(0, wrongQ, []);
  }, [originalQuestions, mistakeIds, goToQuestion]);

  // ── RESUME / RESTART ──────────────────────────────────────────────────────
  const resumeSession = useCallback(() => {
    const snap = pendingSnap;
    if (!snap) return;
    const duration = normalizeConcoursDuration(snap.customDuration);
    playSound('click');
    setPendingSnap(null);
    setCustomDuration(duration);
    setResults(snap.results);
    setMistakeIds(new Set(snap.mistakeIds));

    const idx = Math.min(Math.max(0, snap.currentIndex), questions.length - 1);
    setCurrentIndex(idx);
    const q = questions[idx];
    const answered = snap.results.some(r => r.questionId === q?.id);
    if (answered) {
      setQuizState('feedback');
    } else {
      if (q && snap.pendingAnswer !== null && snap.pendingAnswer !== undefined) {
        selectedAnswerRef.current = snap.pendingAnswer;
        setRestoredAnswer({ questionId: q.id, answer: snap.pendingAnswer });
      }
      setTimeLeft(snap.timeLeft > 0 ? snap.timeLeft : getTimeForQ(q, school?.timePerQuestion, duration));
      setQuizState('playing');
    }
  }, [pendingSnap, questions, school?.timePerQuestion]);

  const restartSession = useCallback(async () => {
    playSound('click');
    clearConcoursSession(schoolId, itemId);
    setPendingSnap(null);
    // Nouveau tirage : nouvelle graine, examen reconstruit.
    const seed = randomSeed();
    seedRef.current = seed;
    setQuizState('loading');
    try {
      const examQuestions = await concoursService.buildExam({ schoolId, themeId, year, questionCount, timePerQuestion: 45, seed });
      if (examQuestions.length === 0) { setQuizState('error'); return; }
      setQuestions(examQuestions);
      setOriginalQuestions(examQuestions);
      setResults([]);
      setMistakeIds(new Set());
      setCurrentIndex(0);
      setRestoredAnswer(null);
      selectedAnswerRef.current = null;
      setCustomDuration(180);
      setTimeLeft(getTimeForQ(examQuestions[0], school?.timePerQuestion, 180));
      setQuizState('setup');
    } catch {
      setQuizState('error');
    }
  }, [schoolId, itemId, themeId, year, questionCount, school]);

  // ── QUIT ──────────────────────────────────────────────────────────────────
  const handleQuitRequest = useCallback(() => {
    playSound('click');
    const inExam = (quizState === 'playing' || quizState === 'feedback') && !isReviewMode;
    // Sans réponse validée, il n'y a rien à sauvegarder : sortie directe.
    if (inExam && results.length > 0) setShowExitModal(true);
    else onExit();
  }, [quizState, isReviewMode, results.length, onExit]);

  const saveAndQuit = useCallback(() => {
    persistSessionNow();
    onExit();
  }, [persistSessionNow, onExit]);

  const abandonAndQuit = useCallback(() => {
    discardRef.current = true;
    clearConcoursSession(schoolId, itemId);
    onExit();
  }, [schoolId, itemId, onExit]);

  // ── UNANSWERED ────────────────────────────────────────────────────────────
  const unansweredIndices = useMemo(() => {
    return questions
      .map((q, i) => results.some(r => r.questionId === q.id) ? null : i + 1)
      .filter((idx): idx is number => idx !== null);
  }, [questions, results]);

  const isComplete = unansweredIndices.length === 0;

  // Identité de la session pour l'historique (alignée sur les ids du catalogue du hub)
  const sessionDescriptor = useMemo(() => {
    if (year) return { itemId, label: `Session ${year}` };
    if (themeId) {
      const themeName = school?.themes.find(t => t.id === themeId)?.name || THEME_LABELS[themeId] || themeId;
      return { itemId, label: themeName };
    }
    return { itemId, label: 'Simulation complète' };
  }, [year, themeId, school, itemId]);

  const accent = school?.color || '#1A2530';

  const concoursQuizTheme = useMemo(() => ({
    background: '#FCFBF9',
    ink: '#2C3539',
    muted: '#8F867A',
    progress: accent,
    badgeBg: 'rgba(255, 255, 255, 0.6)',
    badgeBorder: 'rgba(44, 53, 57, 0.08)',
    hoverBg: '#F7F6F3',
  }), [accent]);

  // ── RENDER ────────────────────────────────────────────────────────────────

  if (showLoading) {
    return <LoadingSpinner context="concours" />;
  }

  if (quizState === 'error') {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/50 backdrop-blur-md typo-ui">
        <div className="w-full max-w-sm bg-white border border-slate-200 rounded-[1.5rem] shadow-2xl shadow-slate-950/10 p-[clamp(1.25rem,3.2vw,1.85rem)] animate-in fade-in zoom-in-95 duration-200">
          <h2 className="text-[clamp(1.08rem,1rem_+_0.35vw,1.25rem)] font-semibold tracking-tight text-slate-900 mb-2">Concours indisponible</h2>
          <p className="text-[clamp(0.84rem,0.8rem_+_0.18vw,0.94rem)] text-slate-500 mb-6">Questions insuffisantes pour cette épreuve.</p>
          <button onClick={onExit} className={`${BTN_PRIMARY} w-full bg-slate-900`}>
            {t('common.back')}
          </button>
        </div>
      </div>
    );
  }

  // ── MODALE DE REPRISE : session interrompue trouvée ──
  if (quizState === 'resume' && school && pendingSnap) {
    const answered = pendingSnap.results.length;
    const total = questions.length;

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/50 backdrop-blur-md typo-ui animate-in fade-in duration-300">
        <div className="w-full max-w-[380px] bg-white border border-slate-200/80 rounded-[1.75rem] shadow-[0_24px_70px_-30px_rgba(15,23,42,0.45)] p-[clamp(1.25rem,3.2vw,1.85rem)] animate-in fade-in zoom-in-95 duration-200">
          <div className="mb-6 flex items-center justify-between">
            <h2 className="text-[clamp(1.08rem,1rem_+_0.35vw,1.25rem)] font-semibold tracking-tight text-slate-900">
              Session en cours
            </h2>
            <span className="font-mono text-[clamp(0.75rem,0.72rem_+_0.14vw,0.84rem)] font-semibold tabular-nums text-slate-500">{answered}/{total}</span>
          </div>
          <p className="mb-6 text-[clamp(0.84rem,0.8rem_+_0.18vw,0.94rem)] text-slate-500">
            {answered}/{total} question{answered > 1 ? 's' : ''} répondue{answered > 1 ? 's' : ''}.
          </p>

          <div className="space-y-3">
            <button onClick={resumeSession} className={`${BTN_PRIMARY} w-full`} style={{ backgroundColor: accent }}>
              {t('common.continue')}
            </button>
            <div className="grid grid-cols-2 gap-3">
              <button onClick={restartSession} className={`${BTN_SECONDARY} flex-1`}>
                {t('common.restart')}
              </button>
              <button onClick={onExit} className={`${BTN_SECONDARY} flex-1`}>
                {t('common.quit')}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (quizState === 'setup' && school) {
    const timingOptions = [
      {
        id: '3min',
        value: 180,
        title: '3 minutes',
        finalSeconds: getFinalSeconds(180),
      },
      {
        id: '4m30',
        value: 270,
        title: '4 min 30',
        finalSeconds: getFinalSeconds(270),
      },
      {
        id: '6min',
        value: 360,
        title: '6 minutes',
        finalSeconds: getFinalSeconds(360),
      },
      {
        id: '8min',
        value: 480,
        title: '8 minutes',
        finalSeconds: getFinalSeconds(480),
      },
    ];

    return (
      <div className="fixed inset-0 h-full w-full overflow-hidden flex flex-col typo-ui select-none bg-slate-950/50 backdrop-blur-md justify-center items-center p-4 z-50 animate-in fade-in duration-300">

        {/* Carte principale */}
        <div className="bg-white w-full max-w-sm rounded-2xl p-[clamp(1.25rem,3.2vw,1.85rem)] border border-slate-200 shadow-2xl shadow-slate-950/10 flex flex-col relative z-10 animate-in fade-in zoom-in-95 duration-300">

          {/* Header */}
          <div className="mb-5">
            <h2 className="text-[clamp(1.08rem,1rem_+_0.35vw,1.25rem)] font-semibold tracking-tight text-slate-900">
              Choisir une durée
            </h2>
          </div>

          {/* Options */}
          <div className="space-y-2.5 mb-6">
            {timingOptions.map((opt) => {
              const isSelected = customDuration === opt.value;
              return (
                <button
                  key={opt.id}
                  onClick={() => { playSound('click'); setCustomDuration(opt.value); }}
                  className={`w-full text-left p-[clamp(0.75rem,1.8vw,1rem)] rounded-xl border flex items-center justify-between cursor-pointer transition-all duration-200 ${
                    isSelected
                      ? 'bg-slate-50'
                      : 'border-slate-200 bg-white hover:border-slate-300'
                  }`}
                  style={isSelected ? {
                    borderColor: accent,
                    borderWidth: '1.5px',
                    boxShadow: `0 4px 12px -2px color-mix(in srgb, ${accent} 15%, transparent)`
                  } : {}}
                >
                  <div className="flex items-center gap-3">
                    {/* Radio custom */}
                    <div
                      className="w-4 h-4 rounded-full border flex items-center justify-center bg-white shrink-0 transition-colors duration-200"
                      style={{ borderColor: isSelected ? accent : '#cbd5e1' }}
                    >
                      {isSelected && (
                        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: accent }} />
                      )}
                    </div>

                    <div className="text-left">
                      <div className="flex items-center gap-2">
                        <h3 className="text-[clamp(0.76rem,0.72rem_+_0.16vw,0.86rem)] font-semibold text-slate-900">
                          {opt.title}
                        </h3>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <span className="text-[clamp(0.76rem,0.72rem_+_0.16vw,0.86rem)] font-bold text-slate-800 tabular-nums">
                      {formatSecondsToMinutes(opt.finalSeconds)}
                    </span>
                    {tiersTempsActive && (
                      <span className="text-[8px] font-semibold text-amber-600 uppercase tracking-wider">
                        Tiers-Temps
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Actions */}
          <div className="flex gap-2.5">
            <button onClick={onExit} className={`${BTN_SECONDARY} flex-1`}>
              {t('common.back')}
            </button>
            <button
              onClick={() => {
                playSound('finish');
                const firstQ = questions[0];
                setTimeLeft(getTimeForQ(firstQ, school?.timePerQuestion, customDuration));
                setQuizState('playing');
              }}
              className={`${BTN_PRIMARY} flex-[1.4]`}
              style={{
                backgroundColor: accent,
                boxShadow: `0 8px 16px -4px color-mix(in srgb, ${accent} 30%, transparent)`
              }}
            >
              {t('common.startExam')}
            </button>
          </div>

        </div>
      </div>
    );
  }

  return (
    <div dir={dir} lang={lang} className="quiz-viewport fixed inset-0 w-full overflow-hidden flex flex-col typo-ui text-slate-800 select-none bg-transparent">
      <DashboardBackground />
      <div
        className="absolute inset-x-0 top-0 h-96 pointer-events-none opacity-[0.08]"
        style={{ backgroundImage: `linear-gradient(180deg, ${concoursQuizTheme.progress}, transparent)` }}
      />

      <div className="relative z-10 flex flex-col flex-1 min-h-0 w-full">
        <QuestionCounterHeader
          currentIndex={currentIndex}
          totalQuestions={questions.length}
          onQuit={handleQuitRequest}
        />

        <main className="flex-1 min-h-0 overflow-hidden">
          {currentQuestion ? (
            <QuizCore
              question={currentQuestion}
              currentIndex={currentIndex}
              totalQuestions={questions.length}
              result={existingResult}
              isAnswered={isCurrentAnswered}
              isReviewMode={isReviewMode}
              timeLeft={timeLeft}
              maxTime={getTimeForQ(currentQuestion as TaggedQuestion, school?.timePerQuestion, customDuration)}
              onValidate={handleValidate}
              onNavigate={handleNavigate}
              onAnswerChange={handleAnswerChange}
              restoredAnswer={restoredAnswer}
              theme={concoursQuizTheme}
            />
          ) : (
            <div className="h-full w-full opacity-50 blur-sm" />
          )}
        </main>
      </div>

      {/* Summary avec progression par thème */}
      {quizState === 'summary' && school && (
        <ResultsBreakdown
          questions={originalQuestions}
          results={results}
          school={school}
          session={sessionDescriptor}
          shouldRecord={!isReviewMode}
          onReview={startReview}
          onRetry={retryMistakes}
          onExit={onExit}
        />
      )}

      {/* Modale de sortie : sauvegarder / abandonner / continuer */}
      {showExitModal && quizState !== 'summary' && (
        <div className={MODAL_OVERLAY}>
          <div className={MODAL_BACKDROP} onClick={() => setShowExitModal(false)} />
          <div className={`${MODAL_CARD} sm:max-w-md p-[clamp(1.25rem,3.2vw,2rem)]`}>
            <div className="mb-5">
              <h3 className="text-[clamp(1.15rem,1.05rem_+_0.45vw,1.35rem)] font-semibold tracking-tight text-slate-900">
                Quitter l'épreuve ?
              </h3>
            </div>
            <p className="text-[clamp(0.84rem,0.8rem_+_0.18vw,0.94rem)] text-slate-500 mb-7">
              {results.length} réponse{results.length > 1 ? 's' : ''} sauvegardée{results.length > 1 ? 's' : ''}.
            </p>

            <div className="space-y-3">
              <button onClick={saveAndQuit} className={`${BTN_PRIMARY} w-full rounded-2xl py-3.5`} style={{ backgroundColor: accent }}>
                {t('common.saveAndQuit')}
              </button>
              <div className="flex gap-3">
                <button onClick={() => setShowExitModal(false)} className={`${BTN_SECONDARY} flex-1 rounded-2xl py-3.5`}>
                  {t('common.continue')}
                </button>
                <button onClick={abandonAndQuit} className={`${BTN_DANGER_GHOST} flex-1 rounded-2xl py-3.5`}>
                  {t('common.abandon')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modale de confirmation de fin */}
      {showConfirmModal && quizState !== 'summary' && (
        <div className={MODAL_OVERLAY}>
          <div className={MODAL_BACKDROP} />
          <div className={`${MODAL_CARD} sm:max-w-md p-[clamp(1.25rem,3.2vw,2rem)]`}>
            <h3 className="text-[clamp(1.15rem,1.05rem_+_0.45vw,1.35rem)] font-semibold tracking-tight text-slate-900 mb-3">
              {isComplete ? 'Terminer l’épreuve ?' : 'Réponses incomplètes'}
            </h3>

            {isComplete ? (
              <p className="text-[clamp(0.84rem,0.8rem_+_0.18vw,0.94rem)] text-slate-500 mb-7">
                Toutes les questions sont répondues.
              </p>
            ) : (
              <div className="mb-7">
                <p className="text-[clamp(0.84rem,0.8rem_+_0.18vw,0.94rem)] text-slate-500 mb-4">
                  {unansweredIndices.length} question{unansweredIndices.length > 1 ? 's' : ''} sans réponse.
                </p>
                <div className="flex flex-wrap justify-center gap-2 max-h-32 overflow-y-auto">
                  {unansweredIndices.map(idx => (
                    <button
                      key={idx}
                      onClick={() => { goToQuestion(idx - 1); setShowConfirmModal(false); }}
                      className="w-[clamp(2.2rem,2rem_+_0.6vw,2.5rem)] h-[clamp(2.2rem,2rem_+_0.6vw,2.5rem)] flex items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 text-[clamp(0.75rem,0.72rem_+_0.14vw,0.84rem)] font-bold tabular-nums hover:border-slate-400 hover:bg-slate-50 transition-all"
                    >
                      {idx}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="flex gap-2.5">
              <button onClick={() => setShowConfirmModal(false)} className={`${BTN_SECONDARY} flex-1`}>
                {t('common.back')}
              </button>
              <button
                onClick={confirmSubmit}
                className={`${BTN_PRIMARY} flex-1`}
                style={{ backgroundColor: isComplete ? '#059669' : accent }}
              >
                {isComplete ? t('common.viewResults') : t('common.finish')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default memo(ConcoursQuizView);
