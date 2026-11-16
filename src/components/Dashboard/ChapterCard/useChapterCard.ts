import React from 'react';
import { ChapterInfo, ChapterProgress } from '../../../types';
import { QUIZ_UNLOCK_THRESHOLD, EXERCISE_UNLOCK_THRESHOLD } from '../../../utils/chapterProgress';
import { resolveRevisionSteps } from '../../../utils/revisionSheets';
import { getChapterCardTheme, isPinnedChapter } from './chapterTheme';
import { useStickyUnlock } from './useStickyUnlock';

export type ChapterStatsData = {
    quizCount: number;
    exerciseCount: number;
    hasRevision: boolean;
};

export type ChapterMetric = {
    id: 'global' | 'lecon' | 'quiz' | 'exercice';
    label: string;
    value: number;
};

type ChapterLearningStatus = {
    label: string;
    tone: 'idle' | 'early' | 'building' | 'practice' | 'near' | 'mastered';
};

export const clampPercent = (value: number) =>
    Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0));

interface UseChapterCardArgs {
    chapter: ChapterInfo;
    index: number;
    /** Numéro pédagogique, indépendant des entrées autonomes et de l'ordre visuel. */
    chapterNumber?: number;
    progress?: ChapterProgress;
    stats?: ChapterStatsData;
    forceUnlocked?: boolean;
}

/**
 * Concentre toute la logique dérivée d'une carte chapitre : comptages,
 * pourcentages, verrouillages (live + sticky), états « terminé »/« maîtrisé »,
 * métriques du carrousel et libellés d'aide. Le composant ne fait que rendre.
 */
export function useChapterCard({ chapter, index, chapterNumber, progress, stats, forceUnlocked = false }: UseChapterCardArgs) {
    // ── Données brutes de progression ────────────────────────────────────
    const revisionProgress = progress?.revisionProgress || 0;
    const quizData = progress?.quiz;
    const isQuizPassed = !!quizData?.isSubmitted;
    const quizAnswered = quizData?.history?.length || 0;
    const quizPercent = quizData?.totalQuestions
        ? Math.round((quizAnswered / quizData.totalQuestions) * 100)
        : 0;
    const quizCount = stats?.quizCount || 0;
    const quizTotal = quizData?.totalQuestions || quizCount || 0;
    const scorePercent = quizData?.score || 0;
    const quizScore = quizData?.history && quizData.history.length > 0
        ? quizData.history.filter((h) => h.isCorrect).length
        : Math.round((scorePercent / 100) * quizTotal);

    const revisions = chapter.revisions || [];
    const revisionCount = revisions.length;
    const exerciseCount = stats?.exerciseCount || 0;
    const hasRevision = revisionCount > 0;
    const hasQuiz = quizCount > 0;
    const hasExercises = exerciseCount > 0;
    const revisionPercent = clampPercent(Math.round(revisionProgress));
    const isRevisionLocked = !hasRevision;

    /**
     * Une entrée par fiche déclarée. La progression est lue dans la carte
     * `revisionProgressBySheet` ; à défaut (données antérieures au mécanisme)
     * un chapitre à fiche unique retombe sur la progression globale du chapitre.
     */
    const revisionSteps = React.useMemo(
        () => resolveRevisionSteps(chapter, progress?.revisionProgressBySheet, revisionPercent),
        [chapter, progress?.revisionProgressBySheet, revisionPercent],
    );

    // Le quiz n'est verrouillé par la leçon QUE si une leçon existe : sinon un
    // chapitre sans fiche aurait un quiz définitivement bloqué (revision = 0%).
    const liveQuizLocked = !hasQuiz || (hasRevision && revisionPercent < QUIZ_UNLOCK_THRESHOLD);

    // Progression « Exercices » alignée sur useDashboardStats : un exercice
    // compte dès qu'il a reçu un feedback (même base que le pourcentage global).
    const exercisesWithFeedback = progress?.exerciseFeedback
        ? Object.keys(progress.exerciseFeedback).length
        : 0;
    const exercisesTotal = exerciseCount;
    const exercisesStarted = exercisesWithFeedback;
    const exercisesPercent = exercisesTotal > 0
        ? Math.round((exercisesStarted / exercisesTotal) * 100)
        : 0;

    // Les exercices ne sont verrouillés par le quiz QUE si un quiz existe : un
    // chapitre sans quiz garde ses exercices accessibles directement.
    const liveExercisesLocked =
        !hasExercises || (hasQuiz && !isQuizPassed && quizPercent < EXERCISE_UNLOCK_THRESHOLD);

    // ── Déblocage définitif (sticky) ─────────────────────────────────────
    const effectiveSticky = useStickyUnlock(chapter.id, liveQuizLocked, liveExercisesLocked);
    // Un chapitre épinglé (« Mise à niveau ») est autonome : il ne dépend
    // d'aucune leçon, d'aucun quiz ni d'aucun autre chapitre.
    const isPinned = isPinnedChapter(chapter);
    const isQuizLocked = !hasQuiz || (!forceUnlocked && !isPinned && liveQuizLocked && !effectiveSticky.quiz);
    const isExercisesLocked = !hasExercises || (!forceUnlocked && !isPinned && liveExercisesLocked && !effectiveSticky.exercises);

    // ── États de complétion ──────────────────────────────────────────────
    const isRevisionDone = revisionPercent >= 100;
    const isQuizDone = isQuizPassed;
    const isExercisesDone = exercisesTotal > 0 && exercisesStarted >= exercisesTotal;
    const isChapterMastered =
        isRevisionDone && isQuizDone && (exercisesTotal === 0 || isExercisesDone);

    // ── Progression globale (moyenne égale des étapes disponibles) ────────
    let totalScore = 0;
    let totalPossible = 0;
    if (hasRevision) { totalPossible += 1; totalScore += Math.min(1, revisionPercent / 100); }
    if (hasQuiz) { totalPossible += 1; totalScore += Math.min(1, isQuizPassed ? 1 : quizPercent / 100); }
    if (hasExercises) {
        totalPossible += 1;
        totalScore += Math.min(1, exercisesTotal > 0 ? exercisesStarted / exercisesTotal : 0);
    }
    const overallPercent =
        totalPossible > 0 ? clampPercent(Math.round((totalScore / totalPossible) * 100)) : 0;

    // ── Métriques du carrousel ───────────────────────────────────────────
    const activeMetricsList = React.useMemo<ChapterMetric[]>(() => {
        const list: ChapterMetric[] = [
            { id: 'global', label: 'Progression globale', value: overallPercent },
        ];
        if (hasRevision) list.push({ id: 'lecon', label: 'Cours révisé', value: revisionPercent });
        if (hasQuiz) list.push({ id: 'quiz', label: 'Quiz validé', value: isQuizPassed ? 100 : quizPercent });
        if (hasExercises) list.push({ id: 'exercice', label: 'Exercices résolus', value: exercisesPercent });
        return list;
    }, [overallPercent, hasRevision, revisionPercent, hasQuiz, quizPercent, isQuizPassed, hasExercises, exercisesPercent]);

    // ── Libellés d'aide (état verrouillé) ────────────────────────────────
    const revisionHint = 'Bientôt disponible';
    const quizHint = !hasQuiz ? 'Bientôt disponible' : `Dès ${QUIZ_UNLOCK_THRESHOLD}% de la leçon`;
    const exerciseHint = !hasExercises
        ? 'Bientôt disponible'
        : isQuizPassed
            ? ''
            : `Dès ${EXERCISE_UNLOCK_THRESHOLD}% du quiz ou validé`;

    const activitiesList = [
        { label: 'Leçon', unlocked: !isRevisionLocked, completed: isRevisionDone, percent: revisionPercent },
        { label: 'Quiz', unlocked: !isQuizLocked, completed: isQuizDone, percent: isQuizPassed ? 100 : quizPercent },
        { label: 'Exercices', unlocked: !isExercisesLocked, completed: isExercisesDone, percent: exercisesPercent },
    ];

    // Highlight propagation: the active contour goes to the LAST unlocked
    // step that is still in progress or hasn't started yet — this way the
    // highlight travels forward as the user unlocks new steps, instead of
    // stagnating on "Leçon".
    const reversed = [...activitiesList].reverse();
    const primaryActionLabel =
        reversed.find((a) => a.unlocked && !a.completed && a.percent > 0)?.label ||
        reversed.find((a) => a.unlocked && !a.completed && a.percent === 0)?.label ||
        '';

    const learningStatus: ChapterLearningStatus =
        isChapterMastered || overallPercent >= 100
            ? { label: 'Maîtrisé', tone: 'mastered' }
            : overallPercent === 0
                ? { label: 'À ouvrir', tone: 'idle' }
                : overallPercent < 10
                    ? { label: 'Premier pas', tone: 'early' }
                    : overallPercent < 35
                        ? { label: 'Base en cours', tone: 'building' }
                        : overallPercent < 70
                            ? { label: 'À consolider', tone: 'practice' }
                            : { label: 'Presque acquis', tone: 'near' };

    const cardTheme = getChapterCardTheme(chapter, index);
    const indexFormatted = `Chapitre ${String(chapterNumber ?? index + 1).padStart(2, '0')}`;

    return {
        cardTheme,
        indexFormatted,
        revisions,
        revisionSteps,
        revisionCount,
        quizCount,
        exerciseCount,
        hasRevision,
        hasQuiz,
        hasExercises,
        revisionPercent,
        quizPercent,
        exercisesPercent,
        isRevisionLocked,
        isQuizLocked,
        isExercisesLocked,
        isRevisionDone,
        isQuizDone,
        isExercisesDone,
        isChapterMastered,
        overallPercent,
        isQuizPassed,
        quizScore,
        quizTotal,
        activeMetricsList,
        learningStatus,
        primaryActionLabel,
        revisionHint,
        quizHint,
        exerciseHint,
    };
}

export type ChapterCardModel = ReturnType<typeof useChapterCard>;
