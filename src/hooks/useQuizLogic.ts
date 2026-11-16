
import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { QuizQuestion, QuizResult, ChapterInfo, ChapterProgress } from '../types';
import { quizService } from '../services/quizService';
import { playSound } from '../utils/soundEngine';
import { TIMING } from '../utils/constants';
import { getQuestionTime } from '../utils/quizTiming';

type QuizState = 'loading' | 'playing' | 'feedback' | 'summary' | 'error';

// Progression pédagogique spécifique au quiz de mise à niveau. Les identifiants
// des questions sont conservés : les reprises et les résultats enregistrés ne
// sont donc pas perturbés lorsque l'ordre de lecture évolue.
const MISE_A_NIVEAU_CATEGORY_ORDER = [
  'Logique et rédaction',
  'Étude de fonction',
  'Limites',
  'Dérivation',
  'Suites numériques',
  'Trigonométrie',
];

const orderMiseANiveauQuestions = (classId: string, chapterId: string, questions: QuizQuestion[]): QuizQuestion[] => {
  // Le quiz diagnostique de 2e Bac Sciences expérimentales suit exactement
  // l'ordre éditorial de son PDF : Limites, Dérivation, Étude de fonction,
  // Suites numériques, puis Trigonométrie.
  if (chapterId !== 'mise-a-niveau' || classId === '2eme-bac-sc-ex') return questions;

  return questions
    .map((question, sourceIndex) => ({ question, sourceIndex }))
    .sort((a, b) => {
      const aOrder = MISE_A_NIVEAU_CATEGORY_ORDER.indexOf(a.question.category || '');
      const bOrder = MISE_A_NIVEAU_CATEGORY_ORDER.indexOf(b.question.category || '');
      const normalizedAOrder = aOrder === -1 ? Number.MAX_SAFE_INTEGER : aOrder;
      const normalizedBOrder = bOrder === -1 ? Number.MAX_SAFE_INTEGER : bOrder;
      return normalizedAOrder - normalizedBOrder || a.sourceIndex - b.sourceIndex;
    })
    .map(({ question }) => question);
};

// Temps d'une question de chapitre : limite propre à la question (sauf
// FORCE_GLOBAL_QUIZ_TIME) puis réglage global. Source unique : quizTiming.
const getTimeForQ = (q?: QuizQuestion): number =>
  getQuestionTime({ questionLimit: q?.timeLimit, forceGlobal: TIMING.FORCE_GLOBAL_QUIZ_TIME });

// ═══════════════════════════════════════════════════════════════════
// Reprise exacte : réponse sélectionnée (non validée) + temps restant
// de la question en cours, persistés localement pour reprendre l'élève
// précisément là où il s'est arrêté (clé dédiée, hors état global).
// ═══════════════════════════════════════════════════════════════════
type PendingAnswer = { questionId: string; answer: unknown; timeLeft: number };

const pendingKey = (classId: string, chapterId: string) =>
  `mathplus:quiz-pending:${classId}:${chapterId}`;

function readPending(key: string): PendingAnswer | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const p = JSON.parse(raw);
    if (p && typeof p.questionId === 'string' && typeof p.timeLeft === 'number') {
      return p as PendingAnswer;
    }
  } catch { /* ignore */ }
  return null;
}

function writePending(key: string, p: PendingAnswer): void {
  if (typeof window === 'undefined') return;
  try { localStorage.setItem(key, JSON.stringify(p)); } catch { /* ignore */ }
}

function clearPending(key: string): void {
  if (typeof window === 'undefined') return;
  try { localStorage.removeItem(key); } catch { /* ignore */ }
}

export const useQuizLogic = (
    chapter: ChapterInfo,
    classId: string,
    chapterProgress?: ChapterProgress,
    onSaveProgress?: (index: number, history: QuizResult[], totalQuestions: number) => void,
    onSubmitScore?: (score: number, total: number, answersSnapshot: Record<string, unknown>) => void
) => {
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [originalQuestions, setOriginalQuestions] = useState<QuizQuestion[]>([]);

  const [currentIndex, setCurrentIndex] = useState(0);
  const [results, setResults] = useState<QuizResult[]>([]);
  const [quizState, setQuizState] = useState<QuizState>('loading');
  const [timeLeft, setTimeLeft] = useState(() => getTimeForQ());
  const [isReviewMode, setIsReviewMode] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);

  // Mastery Learning: Track incorrect answers
  const [mistakeIds, setMistakeIds] = useState<Set<string>>(new Set());

  // Timer ref for proper cleanup
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Ref pour éviter les closures stale dans le timer
  const handleValidateRef = useRef<(answer: unknown, isTimeout?: boolean) => void>(() => {});

  // ── Reprise exacte ──────────────────────────────────────────────────
  const pkey = pendingKey(classId, chapter.id);
  // Réponse à réinjecter dans QuizCore pour la question reprise.
  const [restoredAnswer, setRestoredAnswer] = useState<{ questionId: string; answer: unknown } | null>(null);
  // Restore appliqué une seule fois par l'effet de navigation (évite que le
  // reset de temps n'écrase le temps restant repris).
  const pendingRestoreRef = useRef<PendingAnswer | null>(null);
  // Miroirs des valeurs courantes pour persister l'état « au moment du départ ».
  const timeLeftRef = useRef(timeLeft);
  const selectedAnswerRef = useRef<unknown>(null);
  const currentQuestionRef = useRef<QuizQuestion | undefined>(undefined);
  const quizStateRef = useRef<QuizState>(quizState);
  const isCurrentAnsweredRef = useRef(false);

  // --- CLEANUP TIMER ---
  const clearQuizTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  // ═══════════════════════════════════════════════════════════════════
  // INIT — Chargement des données du quiz
  // ═══════════════════════════════════════════════════════════════════
  // getTimeForQ() est appelé au moment de l'exécution (pas par closure),
  // donc il lit TOUJOURS la dernière valeur du localStorage.
  // ═══════════════════════════════════════════════════════════════════
  useEffect(() => {
    const load = async () => {
      setQuizState('loading');
      // Use custom path from manifest if available, otherwise fall back to default
      const customPath = chapter.quizzes?.[0]?.path;
      const rawData = await quizService.getQuiz(classId, chapter.id, customPath);
      const data = orderMiseANiveauQuestions(classId, chapter.id, rawData);

      if (data && data.length > 0) {
        setQuestions(data);
        setOriginalQuestions(data);

        const savedQuiz = chapterProgress?.quiz;

        if (savedQuiz?.isSubmitted) {
          clearPending(pkey);
          setResults(savedQuiz.history || []);
          setQuizState('summary');
          setIsReviewMode(true);
        } else if (savedQuiz?.history && savedQuiz.history.length > 0) {
          // Reprise d'un quiz en cours
          setResults(savedQuiz.history);

          const mistakes = new Set<string>();
          savedQuiz.history.forEach(r => {
            if (!r.isCorrect) mistakes.add(r.questionId);
          });
          setMistakeIds(mistakes);

          const answeredCount = savedQuiz.history.length;
          let resumeIndex = Math.max(0, Math.min(answeredCount < data.length ? answeredCount : answeredCount - 1, data.length - 1));

          const firstUnansweredIndex = data.findIndex(q => !savedQuiz.history?.some(r => r.questionId === q.id));
          if (firstUnansweredIndex !== -1) resumeIndex = firstUnansweredIndex;

          setCurrentIndex(resumeIndex);
          const resumeQuestion = data[resumeIndex];
          const isResumeIndexAnswered = savedQuiz.history.some(r => r.questionId === resumeQuestion.id);

          // Reprise exacte : restaure la sélection et le temps restant si une
          // session en cours a été persistée pour cette question.
          if (!isResumeIndexAnswered) {
            const pending = readPending(pkey);
            if (pending && pending.questionId === resumeQuestion.id) {
              pendingRestoreRef.current = pending;
              if (pending.answer !== null && pending.answer !== undefined) {
                setRestoredAnswer({ questionId: resumeQuestion.id, answer: pending.answer });
              }
            } else {
              clearPending(pkey);
            }
          }

          setTimeLeft(getTimeForQ(resumeQuestion));
          setQuizState(isResumeIndexAnswered ? 'feedback' : 'playing');
        } else {
          // Quiz neuf
          clearPending(pkey);
          setCurrentIndex(0);
          setTimeLeft(getTimeForQ(data[0]));
          setQuizState('playing');
        }
      } else {
        setQuizState('error');
      }
    };

    load();

    return () => clearQuizTimer();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chapter.id, classId, clearQuizTimer]);

  // --- CURRENT QUESTION LOGIC ---
  const currentQuestion = questions[currentIndex];
  const existingResult = useMemo(() => results.find(r => r.questionId === currentQuestion?.id), [results, currentQuestion]);
  const isCurrentAnswered = !!existingResult;

  // --- SYNC: Navigation ou changement de question ---
  useEffect(() => {
    if (!currentQuestion) return;
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      if (isCurrentAnswered) {
        setQuizState('feedback');
        clearQuizTimer();
      } else {
        setQuizState('playing');
        // Applique le temps restant repris (une seule fois), sinon réinitialise.
        const restore = pendingRestoreRef.current;
        if (restore && restore.questionId === currentQuestion.id) {
          pendingRestoreRef.current = null;
          setTimeLeft(restore.timeLeft > 0 ? restore.timeLeft : getTimeForQ(currentQuestion));
        } else {
          setTimeLeft(getTimeForQ(currentQuestion));
        }
      }
    });
    return () => {
      cancelled = true;
    };
  }, [currentIndex, isCurrentAnswered, clearQuizTimer, currentQuestion]);

  // --- TIMER: Intervalle unique (mis en pause si l'onglet est masqué) ---
  useEffect(() => {
    clearQuizTimer();
    if (quizState !== 'playing' || isCurrentAnswered) return;

    timerRef.current = setInterval(() => {
      // Pause le décompte quand l'élève bascule d'onglet/d'app : la question
      // ne doit pas échouer par timeout pendant son absence.
      if (typeof document !== 'undefined' && document.hidden) return;
      setTimeLeft(p => Math.max(0, p - 1));
    }, 1000);

    return () => clearQuizTimer();
  }, [quizState, isCurrentAnswered, clearQuizTimer]);

  // --- TIMEOUT: Détection séparée du temps écoulé ---
  useEffect(() => {
    if (timeLeft <= 0 && quizState === 'playing' && !isCurrentAnswered) {
      clearQuizTimer();
      handleValidateRef.current(null, true);
    }
  }, [timeLeft, quizState, isCurrentAnswered, clearQuizTimer]);

  // --- Miroirs pour la persistance « au moment du départ » ---
  useEffect(() => { timeLeftRef.current = timeLeft; }, [timeLeft]);
  useEffect(() => { currentQuestionRef.current = currentQuestion; }, [currentQuestion]);
  useEffect(() => { quizStateRef.current = quizState; }, [quizState]);
  useEffect(() => { isCurrentAnsweredRef.current = isCurrentAnswered; }, [isCurrentAnswered]);

  // --- Persiste l'état en cours sur sortie (bascule d'onglet, fermeture,
  //     démontage de la vue) pour une reprise exacte ultérieure. ---
  useEffect(() => {
    const persistPendingNow = () => {
      const q = currentQuestionRef.current;
      if (q && quizStateRef.current === 'playing' && !isCurrentAnsweredRef.current) {
        writePending(pkey, { questionId: q.id, answer: selectedAnswerRef.current, timeLeft: timeLeftRef.current });
      }
    };
    const onVisibility = () => { if (document.hidden) persistPendingNow(); };

    window.addEventListener('pagehide', persistPendingNow);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      persistPendingNow(); // sortie in-app (démontage de la vue quiz)
      window.removeEventListener('pagehide', persistPendingNow);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [pkey]);

  // Notifié par QuizCore quand l'élève change de sélection (avant validation).
  const handleAnswerChange = useCallback((answer: unknown) => {
    selectedAnswerRef.current = answer;
    const q = currentQuestionRef.current;
    if (q && quizStateRef.current === 'playing' && !isCurrentAnsweredRef.current) {
      writePending(pkey, { questionId: q.id, answer, timeLeft: timeLeftRef.current });
    }
  }, [pkey]);

  // --- ACTIONS ---
  const handleNavigate = useCallback((direction: 'prev' | 'next') => {
      playSound('click');
      if (direction === 'prev') {
          if (currentIndex > 0) setCurrentIndex(prev => prev - 1);
      } else {
          if (currentIndex < questions.length - 1) {
              setCurrentIndex(currentIndex + 1);
          } else {
              if (!isReviewMode && !chapterProgress?.quiz.isSubmitted) setShowConfirmModal(true);
              else { setQuizState('summary'); playSound('finish'); }
          }
      }
  }, [currentIndex, questions.length, isReviewMode, chapterProgress?.quiz.isSubmitted]);

  const handleValidate = useCallback(async (answer: unknown, isTimeout: boolean = false) => {
    if (!currentQuestion || results.some(r => r.questionId === currentQuestion.id)) return;

    let isCorrect = false;
    if (!isTimeout) {
        isCorrect = await quizService.verifyAnswer(currentQuestion, answer);
    }

    if (isCorrect) {
        playSound('correct');
    } else {
        playSound('wrong');
        setMistakeIds(prev => new Set(prev).add(currentQuestion.id));
    }

    const allocatedTime = getTimeForQ(currentQuestion);
    const timeSpent = Math.max(0, allocatedTime - timeLeft);

    const newResult: QuizResult = {
      questionId: currentQuestion.id,
      isCorrect,
      userAnswer: answer,
      timeSpent
    };

    const newResults = [...results, newResult];
    setResults(newResults);

    // La question est validée : plus de réponse « en attente » à reprendre.
    clearPending(pkey);
    selectedAnswerRef.current = null;

    if (!isReviewMode && questions.length === originalQuestions.length && onSaveProgress) {
        onSaveProgress(currentIndex, newResults, originalQuestions.length);
    }
    setQuizState('feedback');
  }, [currentQuestion, results, timeLeft, isReviewMode, onSaveProgress, currentIndex, questions.length, originalQuestions.length, pkey]);

  // Garder la ref à jour pour le timer timeout
  useEffect(() => { handleValidateRef.current = handleValidate; });

  const confirmSubmit = useCallback(() => {
      setShowConfirmModal(false);
      clearQuizTimer();
      clearPending(pkey);

      if (onSubmitScore) {
          const score = results.filter(r => r.isCorrect).length;
          const snapshot = results.reduce<Record<string, unknown>>((acc, r) => ({ ...acc, [r.questionId]: r.userAnswer }), {});
          onSubmitScore(score, originalQuestions.length, snapshot);
      }
      setQuizState('summary');
      playSound('finish');
  }, [results, originalQuestions.length, onSubmitScore, clearQuizTimer, pkey]);

  const startReview = useCallback(() => {
      setIsReviewMode(true);
      setQuestions(originalQuestions);
      setCurrentIndex(0);
      setQuizState('feedback');
      clearQuizTimer();
  }, [originalQuestions, clearQuizTimer]);

  const retryMistakes = useCallback(() => {
      const wrongQuestions = originalQuestions.filter(q => mistakeIds.has(q.id));
      if (wrongQuestions.length === 0) return;

      clearPending(pkey);
      setQuestions(wrongQuestions);
      setResults([]);
      setCurrentIndex(0);
      setIsReviewMode(true);
      setQuizState('playing');

      setTimeLeft(getTimeForQ(wrongQuestions[0]));
  }, [originalQuestions, mistakeIds, pkey]);

  return {
      questions, currentIndex, setCurrentIndex, results, quizState, timeLeft,
      maxTime: getTimeForQ(currentQuestion), isReviewMode, showConfirmModal,
      currentQuestion, existingResult, isCurrentAnswered, setShowConfirmModal, mistakeIds,
      handleNavigate, handleValidate, confirmSubmit, startReview, retryMistakes,
      handleAnswerChange, restoredAnswer
  };
};
