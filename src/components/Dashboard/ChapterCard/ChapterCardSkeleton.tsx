import React from 'react';
import { getChapterCardTheme } from './chapterTheme';
import { CARD_REVEAL } from './constants';

/** Squelette de chargement, calé sur la même grille que la carte réelle. */
const ChapterCardSkeleton: React.FC<{ index: number }> = ({ index }) => {
    const cardTheme = getChapterCardTheme(index);
    const skeletonStyle = {
        '--accent': cardTheme.accent,
        '--accent-soft': cardTheme.accentSoft,
        '--chapter-card-delay': CARD_REVEAL.delay(index),
    } as React.CSSProperties;

    return (
        <article
            className="dash-card relative flex flex-col bg-white border border-slate-200/60 overflow-hidden transition-all duration-500 opacity-100"
            style={skeletonStyle}
            aria-hidden="true"
        >
            <div className="dash-card__header flex flex-col">
                <div className="flex items-center gap-3">
                    <div className="learning-skeleton h-[22px] w-[80px] rounded-full" />
                </div>
                
                <div className="dash-card__title-wrap flex flex-col gap-2 mt-2">
                    <div className="learning-skeleton h-5 w-3/4 rounded-lg" />
                    <div className="learning-skeleton h-5 w-1/2 rounded-lg" />
                </div>

                <div className="pt-2 flex gap-4">
                    <div className="learning-skeleton h-4 w-16 rounded-lg" />
                    <div className="learning-skeleton h-4 w-16 rounded-lg" />
                    <div className="learning-skeleton h-4 w-16 rounded-lg" />
                </div>
            </div>

            <div className="dash-card__body flex-1 border-t border-slate-100">
                <div className="flex flex-col gap-0 relative">
                    {Array.from({ length: 3 }).map((_, rowIndex) => (
                        <div className="dash-step relative flex items-center" key={rowIndex}>
                            <div className="learning-skeleton dash-step__icon relative flex-shrink-0 rounded-xl border border-[#dfe4d7]" />
                            <div className="flex-1 min-w-0 flex flex-col justify-center">
                                <div className="learning-skeleton h-4 w-24 rounded-lg" />
                            </div>
                            <div className="flex-shrink-0 ms-2">
                                <div className="learning-skeleton h-9 w-[80px] rounded-xl" />
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </article>
    );
};

export default ChapterCardSkeleton;
