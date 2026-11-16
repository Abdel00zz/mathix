import React from 'react';
import { ChapterInfo } from '../../../types';
import ChapterStep from './ChapterStep';
import { ChapterCardModel } from './useChapterCard';
import { useI18n } from '../../../i18n/I18nContext';

interface ChapterStepListProps {
    chapter: ChapterInfo;
    model: ChapterCardModel;
    onStartSession?: (chapter: ChapterInfo) => void;
    onStartQuiz?: (chapter: ChapterInfo) => void;
    onResetQuiz?: (chapterId: string) => void;
    onOpenRevision?: (chapter: ChapterInfo, path: string) => void;
}

type StepData = {
    id: string;
    label: string;
    pct: number;
    locked: boolean;
    completed: boolean;
    hint: string;
    isPrimary: boolean;
    primaryActionLabel?: string;
    completedActionLabel: string;
    tooltip?: string;
    onClick: () => void;
    onRedo?: () => void;
};

/** Construit dynamiquement la liste des étapes disponibles du chapitre. */
const ChapterStepList: React.FC<ChapterStepListProps> = ({
    chapter,
    model,
    onStartSession,
    onStartQuiz,
    onResetQuiz,
    onOpenRevision,
}) => {
    const { lang } = useI18n();
    const tr = (fr: string, ar: string) => lang === 'ar' ? ar : fr;
    const {
        hasRevision, hasQuiz, hasExercises,
        quizPercent, exercisesPercent,
        isRevisionLocked, isQuizLocked, isExercisesLocked,
        isQuizDone, isExercisesDone,
        isQuizPassed, revisions, revisionSteps, primaryActionLabel,
        revisionHint, quizHint, exerciseHint,
    } = model;

    const steps: StepData[] = [];

    if (hasRevision) {
        // Un chapitre peut déclarer plusieurs fiches : une étape par fiche,
        // chacune ouvrant sa propre leçon. La première non terminée porte
        // l'action mise en avant.
        const single = revisionSteps.length <= 1;
        const primaryIndex = revisionSteps.findIndex(step => !step.completed);
        const fallbackPrimary = primaryActionLabel === 'Leçon';

        revisionSteps.forEach((step, index) => {
            const isPrimary = !step.completed && (primaryIndex === index && (single || fallbackPrimary));
            steps.push({
                id: `revision-${step.key}`,
                label: single ? tr('Leçon', 'الدرس') : tr(`Leçon ${index + 1}`, `الدرس ${index + 1}`),
                pct: step.percent,
                locked: isRevisionLocked,
                completed: step.completed,
                hint: revisionHint,
                isPrimary,
                primaryActionLabel: step.percent > 0 ? tr('Continuer', 'متابعة') : tr('Commencer', 'بدء'),
                completedActionLabel: tr('Revoir', 'مراجعة'),
                tooltip: step.title,
                onClick: () => {
                    const target = revisions[index];
                    if (target) onOpenRevision?.(chapter, target.path);
                },
            });
        });
    }

    if (hasQuiz) {
        steps.push({
            id: 'quiz',
            label: tr('Quiz', 'اختبار'),
            pct: isQuizPassed ? 100 : quizPercent,
            locked: isQuizLocked,
            completed: isQuizDone,
            hint: quizHint,
            isPrimary: primaryActionLabel === 'Quiz',
            primaryActionLabel: isQuizPassed ? tr('Refaire', 'إعادة') : (quizPercent > 0 ? tr('Reprendre', 'متابعة') : tr('Commencer', 'بدء')),
            completedActionLabel: tr('Refaire', 'إعادة'),
            onClick: () => { if (!isQuizLocked) onStartQuiz?.(chapter); },
            onRedo: () => {
                onResetQuiz?.(chapter.id);
                window.setTimeout(() => onStartQuiz?.(chapter), 0);
            },
        });
    }

    if (hasExercises) {
        steps.push({
            id: 'exercises',
            label: tr('Exercices', 'التمارين'),
            pct: exercisesPercent,
            locked: isExercisesLocked,
            completed: isExercisesDone,
            hint: exerciseHint,
            isPrimary: primaryActionLabel === 'Exercices',
            primaryActionLabel: exercisesPercent > 0 ? tr('Reprendre', 'متابعة') : tr('Commencer', 'بدء'),
            completedActionLabel: tr('Reprendre', 'متابعة'),
            onClick: () => { if (!isExercisesLocked) onStartSession?.(chapter); },
        });
    }

    return (
        <>
            {steps.map(step => (
                <ChapterStep
                    key={step.id}
                    label={step.label}
                    pct={step.pct}
                    locked={step.locked}
                    completed={step.completed}
                    hint={step.hint}
                    isPrimary={step.isPrimary}
                    primaryActionLabel={step.primaryActionLabel}
                    completedActionLabel={step.completedActionLabel}
                    tooltip={step.tooltip}
                    onClick={step.onClick}
                    onRedo={step.onRedo}
                />
            ))}
        </>
    );
};

export default ChapterStepList;
