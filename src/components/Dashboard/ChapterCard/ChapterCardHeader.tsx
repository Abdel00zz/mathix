import React from 'react';
import type { IconDefinition } from '@fortawesome/fontawesome-svg-core';
import { faFileLines, faCircleQuestion, faLayerGroup, faCircleCheck } from '@fortawesome/free-solid-svg-icons';
import { FaIcon } from '../../UI/FaIcon';
import { ChapterCardModel } from './useChapterCard';
import { ChapterInfo } from '../../../types';
import { isPinnedChapter } from './chapterTheme';
import MathRenderer from '../../MathRenderer';
import { useI18n } from '../../../i18n/I18nContext';
import { translateChapterLabel } from '../../../i18n/classLabels';

interface ChapterCardHeaderProps {
    chapter: ChapterInfo;
    model: ChapterCardModel;
}

/**
 * En-tete de carte : index, titre, progression et statistiques de contenu.
 */
const ChapterCardHeader: React.FC<ChapterCardHeaderProps> = ({ chapter, model }) => {
    const { lang } = useI18n();
    const tr = (fr: string, ar: string) => lang === 'ar' ? ar : fr;
    const { 
        isChapterMastered, overallPercent, indexFormatted,
        hasRevision, hasQuiz, hasExercises,
        quizCount, exerciseCount
    } = model;

    const chapterDigits = indexFormatted.replace(/\D+/g, '');
    const isStarted = overallPercent > 0;
    const progressPercent = Math.min(100, Math.max(0, isChapterMastered ? 100 : overallPercent));

    const isPinned = isPinnedChapter(chapter);
    const chapterLabel = translateChapterLabel(chapter.id, chapter.title, lang);

    // Les ressources suivent l'ordre naturel de la séance : révision, quiz,
    // puis entraînement. Un badge absent signifie qu'aucune ressource de ce
    // type n'est encore disponible pour ce chapitre.
    const metrics = [
        hasRevision && { label: tr('Révision', 'الدرس'), icon: faFileLines },
        hasQuiz && { label: tr('Quiz', 'اختبار'), count: quizCount, icon: faCircleQuestion },
        hasExercises && { label: tr('Exercices', 'تمارين'), count: exerciseCount, icon: faLayerGroup },
    ].filter(Boolean) as Array<{ label: string; count?: number; icon: IconDefinition }>;

    return (
        <div className="dash-card__header flex flex-col">
            <div className="flex items-center justify-between gap-2">
                {!isPinned ? (
                    <div className="dash-card__badge inline-flex items-center justify-center rounded-lg border border-[color-mix(in_srgb,var(--border-accent)_26%,transparent)] bg-[var(--accent-soft)] font-semibold tracking-[0.04em] uppercase tabular-nums text-[var(--accent)]">
                        {tr(indexFormatted, chapterDigits ? `الفصل ${chapterDigits}` : 'الفصل')}
                    </div>
                ) : <span aria-hidden="true" />}
                {model.isQuizPassed && (
                    <div className="dash-card__badge flex items-center justify-center rounded-full border border-emerald-200/90 bg-emerald-50/90 font-semibold tracking-[0.02em] tabular-nums text-emerald-700" aria-label={`${tr('Score', 'النتيجة')}: ${model.quizScore}/${model.quizTotal}`}>
                        <span>{tr('Score', 'النتيجة')}: {model.quizScore}/{model.quizTotal}</span>
                    </div>
                )}
            </div>
            
            <div className="dash-card__title-wrap relative flex flex-col items-center justify-center pt-0.5 text-center">
                <h3 className="dash-card__title latin-content font-semibold leading-[1.35] tracking-[-0.015em] text-slate-900 line-clamp-2">
                    <MathRenderer
                        inline
                        content={chapterLabel}
                        fontSize="inherit"
                        useMathTypography={false}
                        enableLexicon={false}
                    />
                </h3>
            </div>

            <div className="dash-card__metrics flex flex-wrap items-center justify-center" aria-label={tr('Ressources disponibles', 'الموارد المتاحة')}>
                {metrics.map(m => (
                    <div
                        key={m.label}
                        className="dash-card__metric inline-flex min-w-0 items-center rounded-full border border-slate-200/80 bg-slate-50/90 font-medium leading-none text-slate-600 tabular-nums"
                    >
                        <FaIcon icon={m.icon} size={11} className="shrink-0 text-[var(--accent)]" aria-hidden="true" />
                        <span className="whitespace-nowrap">{m.count !== undefined ? `${m.count} ` : ''}{m.label}</span>
                    </div>
                ))}
            </div>

            {isStarted && (
                <div className="pt-1.5 flex flex-col gap-1.5">
                    <div className="dash-card__progress-row flex items-center justify-between font-semibold leading-none">
                        {isChapterMastered ? (
                            <span className="inline-flex items-center gap-1.5 text-[var(--accent)] tracking-[0.02em]">
                                <FaIcon icon={faCircleCheck} size={12.5} aria-hidden="true" />
                                {tr('Chapitre terminé', 'تم إتمام المحور')}
                            </span>
                        ) : (
                            <span className="text-[var(--accent)] tracking-[0.02em]">
                                {tr('Progression', 'التقدم')}
                            </span>
                        )}
                        <span className="text-slate-900 tabular-nums font-semibold">
                            {progressPercent}%
                        </span>
                    </div>
                    <div
                        className="learning-progress"
                        role="progressbar"
                        aria-label={tr('Progression du chapitre', 'التقدم في الفصل')}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-valuenow={progressPercent}
                    >
                        <span style={{ width: `${progressPercent}%` }} />
                    </div>
                </div>
            )}
        </div>
    );
};

export default ChapterCardHeader;
