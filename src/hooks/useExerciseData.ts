
import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Exercise, MasteryLevel, SubQuestion } from '../types';
import { contentService, ContentError } from '../services/contentService';
import { makeExerciseProgressId } from '../utils/progressIds';

const STORAGE_KEY = 'mathflow-progress-v2';

interface SavedProgress {
  [uniqueId: string]: {
    isCompleted: boolean;
    mastery: MasteryLevel;
    lastHintIndex: number;
  }
}

export interface LoadingError {
  filePath: string;
  message: string;
  type: string;
  suggestion?: string;
}

const applySavedProgressToSubQuestions = (
  subQuestions: SubQuestion[],
  exId: string,
  qId: string,
  savedProgress: SavedProgress
): SubQuestion[] => {
  return subQuestions.map((sq) => {
    const uid = makeExerciseProgressId(exId, qId, sq.id);
    const progress = savedProgress[uid];
    const savedHintIndex = progress?.lastHintIndex ?? -1;

    return {
      ...sq,
      isCompleted: progress?.isCompleted || false,
      mastery: progress?.mastery || null,
      lastHintIndex: savedHintIndex,
      subQuestions: sq.subQuestions
        ? applySavedProgressToSubQuestions(sq.subQuestions, exId, qId, savedProgress)
        : sq.subQuestions,
    };
  });
};

export const useExerciseData = (classId?: string, chapterId?: string) => {
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadErrors, setLoadErrors] = useState<LoadingError[]>([]);

  const progressRef = useRef<SavedProgress>({});
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Wrapper around stable ID generator
  const getUniqueId = useCallback((exId: string, qId: string, sqId: string) => makeExerciseProgressId(exId, qId, sqId), []);

  useEffect(() => {
    const init = async () => {
      setLoading(true);
      setLoadErrors([]);

      try {
        let rawExercises: Exercise[] = [];
        let errors: ContentError[] = [];

        if (classId && chapterId) {
            const result = await contentService.loadExercisesByChapter(classId, chapterId);
            rawExercises = result.exercises;
            errors = result.errors;
        } else if (classId) {
            rawExercises = await contentService.loadExercisesByClass(classId);
        } else {
            // A chapter id is only unique within a class ("complexes", "logique",
            // "limites"… exist in several). Loading every class here means the
            // caller MUST narrow on classId too, or two levels get merged.
            if (chapterId && typeof import.meta !== 'undefined' && (import.meta as any).env?.DEV === true) {
                console.warn(
                    `[useExerciseData] chapitre « ${chapterId} » demandé sans classId : chargement de toutes les classes. ` +
                    `L'appelant doit filtrer sur classId, sinon les niveaux se mélangent.`
                );
            }
            rawExercises = await contentService.loadAllExercises();
        }

        // Convert errors to LoadingError format
        if (errors.length > 0) {
            setLoadErrors(errors.map(e => ({
                filePath: e.filePath,
                message: e.message,
                type: e.type,
                suggestion: e.suggestion
            })));
        }

        const savedString = localStorage.getItem(STORAGE_KEY);
        let savedProgress: SavedProgress = {};

        if (savedString) {
          try {
            savedProgress = JSON.parse(savedString);
          } catch (e) {
            console.error("Corrupt save data", e);
          }
        }

        const mergedExercises = rawExercises.map(ex => ({
          ...ex,
          questions: ex.questions.map(q => {
            if (!q.subQuestions) return q;

            return {
              ...q,
              subQuestions: applySavedProgressToSubQuestions(q.subQuestions, ex.id, q.id, savedProgress)
            };
          })
        }));

        setExercises(mergedExercises);
      } catch (error) {
        console.error("Initialization failed", error);
      } finally {
        setLoading(false);
      }
    };

    init();
  }, [classId, chapterId]);

  const persistProgress = useCallback(() => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    saveTimeoutRef.current = setTimeout(() => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(progressRef.current));
    }, 500);
  }, []);

  // Écriture immédiate (annule le debounce). Garantit que la progression des
  // indices/sous-questions n'est pas perdue si l'élève quitte avant les 500 ms.
  const flushProgress = useCallback(() => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = null;
    }
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(progressRef.current));
    } catch { /* ignore */ }
  }, []);

  // Flush sur fermeture/bascule de page et au démontage de la vue exercices.
  useEffect(() => {
    const onHide = () => flushProgress();
    const onVisibility = () => { if (document.hidden) flushProgress(); };
    window.addEventListener('pagehide', onHide);
    window.addEventListener('beforeunload', onHide);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      flushProgress();
      window.removeEventListener('pagehide', onHide);
      window.removeEventListener('beforeunload', onHide);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [flushProgress]);

  const handleSubQuestionComplete = useCallback((exIndex: number, qIndex: number, subQuestionId: string, mastery: MasteryLevel) => {
    setExercises(prev => {
      const newExercises = [...prev];
      if (!newExercises[exIndex]) return prev;
      const ex = { ...newExercises[exIndex] };
      
      if (!ex.questions || !ex.questions[qIndex]) return prev;
      const q = { ...ex.questions[qIndex] };
      
      if (!q.subQuestions) return prev;

      const updateRecursive = (list: SubQuestion[]): SubQuestion[] => {
          return list.map(sq => {
              if (sq.id === subQuestionId) {
                  const uid = getUniqueId(ex.id, q.id, sq.id);
                  // Since we only use 'hint' string now, having a hint means count is 1.
                  const hintsCount = sq.hint ? 1 : 0;
                  
                  progressRef.current[uid] = {
                      ...progressRef.current[uid],
                      isCompleted: true,
                      mastery: mastery,
                      lastHintIndex: hintsCount > 0 ? hintsCount - 1 : 0
                  };
                  
                  return { ...sq, isCompleted: true, mastery };
              }
              if (sq.subQuestions) {
                  return { ...sq, subQuestions: updateRecursive(sq.subQuestions) };
              }
              return sq;
          });
      };

      q.subQuestions = updateRecursive(q.subQuestions);
      ex.questions[qIndex] = q;
      newExercises[exIndex] = ex;
      
      persistProgress();
      return newExercises;
    });
  }, [getUniqueId, persistProgress]);

  const handleHintProgress = useCallback((exIndex: number, qIndex: number, subQuestionId: string, hintIndex: number) => {
    setExercises(prev => {
      const ex = prev[exIndex];
      if (!ex || !ex.questions || !ex.questions[qIndex]) return prev;
      const q = ex.questions[qIndex];
      
      if (!q.subQuestions) return prev;

       const updateRecursive = (list: SubQuestion[]): SubQuestion[] => {
          return list.map(sq => {
              if (sq.id === subQuestionId) {
                  if (sq.lastHintIndex === hintIndex) return sq;
                  
                  const uid = getUniqueId(ex.id, q.id, sq.id);
                  progressRef.current[uid] = {
                      ...progressRef.current[uid],
                      lastHintIndex: hintIndex,
                      isCompleted: progressRef.current[uid]?.isCompleted || false,
                      mastery: progressRef.current[uid]?.mastery || null
                  };
                  return { ...sq, lastHintIndex: hintIndex };
              }
              if (sq.subQuestions) {
                  return { ...sq, subQuestions: updateRecursive(sq.subQuestions) };
              }
              return sq;
          });
      };

      const newExercises = [...prev];
      const newQ = { ...q, subQuestions: updateRecursive(q.subQuestions) };
      newExercises[exIndex] = { ...ex, questions: ex.questions.map((quest, i) => i === qIndex ? newQ : quest) };

      persistProgress();

      return newExercises;
    });
  }, [getUniqueId, persistProgress]);

  const resetExercises = useCallback(async () => {
      if(window.confirm("Voulez-vous vraiment réinitialiser toute la progression ?")) {
        setLoading(true);
        localStorage.removeItem(STORAGE_KEY);
        progressRef.current = {};
        window.location.reload();
        return true;
      }
      return false;
  }, []);

  const progressStats = useMemo(() => {
      let total = 0;
      let completed = 0;
      
      const countRecursive = (sqs: SubQuestion[]) => {
          sqs.forEach(sq => {
              total++;
              if (sq.isCompleted) completed++;
              if (sq.subQuestions) countRecursive(sq.subQuestions);
          });
      };

      exercises.forEach((ex) => {
          ex.questions.forEach((q) => {
              if (q.subQuestions) {
                  countRecursive(q.subQuestions);
              }
          });
      });
      return { total, completed, percentage: total === 0 ? 0 : Math.round((completed / total) * 100) };
  }, [exercises]);

  return {
    exercises,
    loading,
    loadErrors,
    progressStats,
    handleSubQuestionComplete,
    handleHintProgress,
    resetExercises
  };
};
