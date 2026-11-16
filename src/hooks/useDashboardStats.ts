import { useMemo } from 'react';
import { ChapterProgress, Exercise } from '../types';

const WEIGHTS = {
    WITH_EXERCISES: {
        QUIZ: 0.2,
        EXERCISES: 0.7,
        REVISION: 0.1,
    },
    WITHOUT_EXERCISES: {
        QUIZ: 0.7,
        REVISION: 0.3,
    },
} as const;

const FEEDBACK_WEIGHTS = {
    high: 1.0,
    medium: 0.6,
    low: 0.3,
    skipped: 0.0,
} as const;

const QUIZ_INCOMPLETE_CAP = 0.95;

type FeedbackKey = keyof typeof FEEDBACK_WEIGHTS;
type FeedbackBreakdown = Record<FeedbackKey, number>;

interface ChapterStatsMap {
    [chapterId: string]: {
        quizCount: number;
        exerciseCount: number;
        hasRevision: boolean;
        progress: number;
    };
}

const emptyFeedbackBreakdown = (): FeedbackBreakdown => ({
    high: 0,
    medium: 0,
    low: 0,
    skipped: 0,
});

const mergeFeedbackBreakdown = (left: FeedbackBreakdown, right: FeedbackBreakdown): FeedbackBreakdown => ({
    high: left.high + right.high,
    medium: left.medium + right.medium,
    low: left.low + right.low,
    skipped: left.skipped + right.skipped,
});

const resolveFeedbackValue = (feedback: unknown): FeedbackKey => {
    const value = typeof feedback === 'string'
        ? feedback
        : feedback && typeof feedback === 'object' && 'value' in feedback
            ? String((feedback as { value?: unknown }).value)
            : 'skipped';

    return value in FEEDBACK_WEIGHTS ? value as FeedbackKey : 'skipped';
};

const clampPercent = (value: number) => Math.max(0, Math.min(100, value));

export const useDashboardStats = (
    chapters: any[],
    allClassExercises: Exercise[],
    globalProgress: Record<string, ChapterProgress>
) => {
    return useMemo(() => {
        const exercisesByChapter = new Map<string, Exercise[]>();
        for (const exercise of allClassExercises) {
            const chapterExercises = exercisesByChapter.get(exercise.chapterId);
            if (chapterExercises) {
                chapterExercises.push(exercise);
            } else {
                exercisesByChapter.set(exercise.chapterId, [exercise]);
            }
        }

        const entries = chapters.map((chapter) => {
            const chapterExercises = exercisesByChapter.get(chapter.id) || [];
            const chapterProgress = globalProgress[chapter.id];
            const exerciseFeedback = chapterProgress?.exerciseFeedback || {};
            const exercisesTotal = chapterExercises.length;
            const exercisesWithFeedback = Object.keys(exerciseFeedback).length;
            const exercisesRatio = exercisesTotal > 0 ? exercisesWithFeedback / exercisesTotal : 0;

            const feedbackSummary = Object.values(exerciseFeedback).reduce(
                (summary, feedback) => {
                    const feedbackValue = resolveFeedbackValue(feedback);
                    return {
                        masteryPoints: summary.masteryPoints + FEEDBACK_WEIGHTS[feedbackValue],
                        breakdown: {
                            ...summary.breakdown,
                            [feedbackValue]: summary.breakdown[feedbackValue] + 1,
                        },
                    };
                },
                { masteryPoints: 0, breakdown: emptyFeedbackBreakdown() }
            );

            const quizProgress = chapterProgress?.quiz;
            const quizTotal = chapter.quizCount || quizProgress?.totalQuestions || 0;
            const quizAnswered = quizProgress?.history?.length || 0;
            const quizRatio = quizProgress?.isSubmitted
                ? 1
                : quizTotal > 0
                    ? quizAnswered >= quizTotal
                        ? 1
                        : Math.min(quizAnswered / quizTotal, QUIZ_INCOMPLETE_CAP)
                    : 0;

            const revisionProgress = chapterProgress?.revisionProgress || 0;
            const revisionRatio = revisionProgress / 100;
            const hasRevision = (chapter.revisions?.length ?? 0) > 0;

            const weightedProgress = exercisesTotal === 0
                ? Math.round((quizRatio * WEIGHTS.WITHOUT_EXERCISES.QUIZ + revisionRatio * WEIGHTS.WITHOUT_EXERCISES.REVISION) * 100)
                : Math.round((
                    quizRatio * WEIGHTS.WITH_EXERCISES.QUIZ
                    + exercisesRatio * WEIGHTS.WITH_EXERCISES.EXERCISES
                    + revisionRatio * WEIGHTS.WITH_EXERCISES.REVISION
                ) * 100);

            const hasStarted = revisionProgress > 0 || quizAnswered > 0 || exercisesWithFeedback > 0;
            const progress = clampPercent(weightedProgress === 0 && hasStarted ? 1 : weightedProgress);

            return {
                chapter: {
                    ...chapter,
                    exerciseCount: exercisesTotal,
                    exercisesCompleted: exercisesWithFeedback,
                    exercisesLeft: exercisesTotal - exercisesWithFeedback,
                    isQuizDone: quizProgress?.isSubmitted || false,
                    quizTotalQuestions: quizTotal,
                    progress,
                    hasRevision,
                    revisionProgress,
                },
                chapterStatsEntry: [
                    chapter.id,
                    {
                        quizCount: quizTotal,
                        exerciseCount: exercisesTotal,
                        hasRevision,
                        progress,
                    },
                ] as const,
                totals: {
                    chaptersCompleted: progress >= 100 ? 1 : 0,
                    quizAnswered,
                    quizSubmitted: quizProgress?.isSubmitted ? 1 : 0,
                    revisionTouched: revisionProgress > 0 ? 1 : 0,
                    exercisesWithFeedback,
                    exercisesTotal,
                    progress,
                    masteryPoints: exercisesTotal > 0 ? feedbackSummary.masteryPoints : 0,
                    possibleMasteryPoints: exercisesTotal,
                    feedbackBreakdown: feedbackSummary.breakdown,
                },
            };
        });

        const totals = entries.reduce(
            (summary, entry) => ({
                chaptersCompleted: summary.chaptersCompleted + entry.totals.chaptersCompleted,
                quizAnswered: summary.quizAnswered + entry.totals.quizAnswered,
                quizSubmitted: summary.quizSubmitted + entry.totals.quizSubmitted,
                revisionTouched: summary.revisionTouched + entry.totals.revisionTouched,
                exercisesWithFeedback: summary.exercisesWithFeedback + entry.totals.exercisesWithFeedback,
                exercisesTotal: summary.exercisesTotal + entry.totals.exercisesTotal,
                progressAccumulator: summary.progressAccumulator + entry.totals.progress,
                masteryPoints: summary.masteryPoints + entry.totals.masteryPoints,
                possibleMasteryPoints: summary.possibleMasteryPoints + entry.totals.possibleMasteryPoints,
                feedbackBreakdown: mergeFeedbackBreakdown(summary.feedbackBreakdown, entry.totals.feedbackBreakdown),
            }),
            {
                chaptersCompleted: 0,
                quizAnswered: 0,
                quizSubmitted: 0,
                revisionTouched: 0,
                exercisesWithFeedback: 0,
                exercisesTotal: 0,
                progressAccumulator: 0,
                masteryPoints: 0,
                possibleMasteryPoints: 0,
                feedbackBreakdown: emptyFeedbackBreakdown(),
            }
        );

        const processedChapters = entries.map(entry => entry.chapter);
        const chapterStats = Object.fromEntries(entries.map(entry => entry.chapterStatsEntry)) as ChapterStatsMap;
        const activeChapters = processedChapters.filter(chapter => chapter.progress > 0 && chapter.progress < 100);
        const libraryChapters = processedChapters.filter(chapter => chapter.progress === 0 || chapter.progress >= 100);
        const globalPercentage = totals.exercisesTotal > 0
            ? Math.round((totals.exercisesWithFeedback / totals.exercisesTotal) * 100)
            : 0;
        const averageProgress = processedChapters.length > 0
            ? Math.round(totals.progressAccumulator / processedChapters.length)
            : 0;
        const masteryScore = totals.possibleMasteryPoints > 0
            ? Math.round((totals.masteryPoints / totals.possibleMasteryPoints) * 100)
            : 0;

        return {
            filteredChapters: libraryChapters,
            activeChapters,
            chapterStats,
            globalStats: {
                chaptersValidated: totals.chaptersCompleted,
                quizCount: processedChapters.length,
                globalPercentage,
                totalQuizAnswered: totals.quizAnswered,
                totalQuizSubmitted: totals.quizSubmitted,
                totalRevisionTouched: totals.revisionTouched,
                totalExercisesWithFeedback: totals.exercisesWithFeedback,
                totalExercises: totals.exercisesTotal,
                averageProgress,
                masteryScore,
                feedbackBreakdown: totals.feedbackBreakdown,
                totalTimeSpentSeconds: 0,
            },
        };
    }, [chapters, allClassExercises, globalProgress]);
};
