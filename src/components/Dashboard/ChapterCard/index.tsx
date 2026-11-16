import React, { useEffect, useRef, useState } from 'react';
import { ChapterInfo, ChapterProgress } from '../../../types';
import { cn } from '../../UI/designSystem';
import { useChapterCard, ChapterStatsData } from './useChapterCard';
import { isPinnedChapter } from './chapterTheme';
import { CARD_REVEAL } from './constants';
import ChapterCardHeader from './ChapterCardHeader';
import ChapterStepList from './ChapterStepList';
import ChapterCardSkeleton from './ChapterCardSkeleton';

interface ChapterCardProps {
    chapter: ChapterInfo;
    index: number;
    chapterNumber?: number;
    progress?: ChapterProgress;
    stats?: ChapterStatsData;
    onStartSession?: (chapter: ChapterInfo) => void;
    onStartQuiz?: (chapter: ChapterInfo) => void;
    onResetQuiz?: (chapterId: string) => void;
    onOpenRevision?: (chapter: ChapterInfo, path: string) => void;
    isInactive?: boolean;
    isUpcoming?: boolean;
    forceUnlocked?: boolean;
}

/**
 * Carte chapitre du tableau de bord. Orchestre l'apparition au scroll, l'effet
 * de spotlight au pointeur et délègue la logique au hook `useChapterCard` et le
 * rendu aux sous-composants (en-tête, liste d'étapes).
 */
const ChapterCard: React.FC<ChapterCardProps> = ({
    chapter,
    index,
    chapterNumber,
    progress,
    stats,
    onStartSession,
    onStartQuiz,
    onResetQuiz,
    onOpenRevision,
    isInactive = false,
    isUpcoming = false,
    forceUnlocked = false,
}) => {
    const cardRef = useRef<HTMLElement | null>(null);
    const [isVisible, setIsVisible] = useState(() => {
        return typeof window === 'undefined' || !('IntersectionObserver' in window);
    });

    const model = useChapterCard({ chapter, index, chapterNumber, progress, stats, forceUnlocked });
    const { cardTheme, isChapterMastered } = model;
    const isProgressing = model.overallPercent > 0 && !isChapterMastered;
    const isEarlyProgress = model.overallPercent > 0 && model.overallPercent < 10;
    const isCurrentBlink = !isInactive && !isUpcoming && !isChapterMastered;

    const isPinned = isPinnedChapter(chapter);
    const cardStyle = {
        '--accent': isPinned ? cardTheme.accent : (isProgressing ? 'var(--dashboard-mauve, #b5369b)' : cardTheme.accent),
        '--accent-soft': isPinned ? cardTheme.accentSoft : (isProgressing ? 'var(--dashboard-mauve-soft, rgba(181, 54, 155, 0.1))' : cardTheme.accentSoft),
        '--border-accent': cardTheme.accent,
        '--chapter-card-delay': CARD_REVEAL.delay(index),
    } as React.CSSProperties;

    useEffect(() => {
        const node = cardRef.current;
        if (!node) return;
        if (typeof window === 'undefined' || !('IntersectionObserver' in window)) return;

        const revealFallback = window.setTimeout(() => {
            setIsVisible(true);
        }, CARD_REVEAL.fallbackDelay(index));

        const observer = new IntersectionObserver(([entry]) => {
            if (entry.isIntersecting) {
                window.clearTimeout(revealFallback);
                setIsVisible(true);
                observer.disconnect();
            }
        }, {
            rootMargin: '0px 0px 18% 0px',
            threshold: 0.01,
        });

        observer.observe(node);
        return () => {
            window.clearTimeout(revealFallback);
            observer.disconnect();
        };
    }, [index]);

    return (
        <article
            ref={cardRef}
            className={cn(
                'dashboard-card-frame dash-card relative flex flex-col bg-white border border-slate-200/80 overflow-hidden transition-[transform,box-shadow,border-color,opacity,filter] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]',
                'hover:-translate-y-0.5',
                !isVisible
                    ? 'opacity-0 translate-y-6'
                    : cn(
                        'translate-y-0',
                        !isInactive && !isUpcoming && 'opacity-100',
                        isInactive && !isUpcoming && 'opacity-60 grayscale-[0.2] hover:opacity-100 hover:grayscale-0 focus-within:opacity-100 focus-within:grayscale-0',
                        isUpcoming && 'opacity-50 grayscale-[0.35]'
                    ),
                isChapterMastered && 'border-[color-mix(in_srgb,var(--border-accent)_30%,#e2e8f0)] bg-gradient-to-b from-[var(--accent-soft)]/50 via-white to-white',
                isProgressing && 'border-[color-mix(in_srgb,var(--border-accent)_34%,#e2e8f0)]',
                isEarlyProgress && 'border-slate-200/90',
                isCurrentBlink && 'shadow-sm'
            )}
            style={cardStyle}
        >
            <ChapterCardHeader chapter={chapter} model={model} />

            <div className="dash-card__body flex-1 border-t border-slate-200/65 bg-slate-50/35">
                <div className="relative flex flex-col">
                    <ChapterStepList
                        chapter={chapter}
                        model={model}
                        onStartSession={onStartSession}
                        onStartQuiz={onStartQuiz}
                        onResetQuiz={onResetQuiz}
                        onOpenRevision={onOpenRevision}
                    />
                </div>
            </div>
        </article>
    );
};

export const ChapterModuleSkeleton = ChapterCardSkeleton;

export default React.memo(ChapterCard);
