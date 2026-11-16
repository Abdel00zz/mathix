import React, { useState } from 'react';
import { faChevronDown, faLock } from '@fortawesome/free-solid-svg-icons';
import { FaIcon } from '../../UI/FaIcon';
import { ChapterInfo, ChapterProgress } from '../../../types';
import { cn } from '../../UI/designSystem';
import MathRenderer from '../../MathRenderer';
import { useChapterCard, ChapterStatsData } from './useChapterCard';
import { isPinnedChapter } from './chapterTheme';
import ChapterStepList from './ChapterStepList';
import { useI18n } from '../../../i18n/I18nContext';
import { translateChapterLabel } from '../../../i18n/classLabels';

interface ChapterListRowProps {
    chapter: ChapterInfo;
    index: number;
    chapterNumber?: number;
    progress?: ChapterProgress;
    stats?: ChapterStatsData;
    onStartSession?: (chapter: ChapterInfo) => void;
    onStartQuiz?: (chapter: ChapterInfo) => void;
    onResetQuiz?: (chapterId: string) => void;
    onOpenRevision?: (chapter: ChapterInfo, path: string) => void;
    defaultExpanded?: boolean;
    isInactive?: boolean;
    forceUnlocked?: boolean;
}

/**
 * Rangée d'accordéon pour le parcours des chapitres inspiré de « Apprendre — Programme ».
 * Combine le nœud circulaire de jauge Seyès, la marge rouge continue, et
 * toute la logique de progression issue de `useChapterCard`.
 */
const ChapterListRow: React.FC<ChapterListRowProps> = ({
    chapter,
    index,
    chapterNumber,
    progress,
    stats,
    onStartSession,
    onStartQuiz,
    onResetQuiz,
    onOpenRevision,
    defaultExpanded = false,
    isInactive = false,
    forceUnlocked = false,
}) => {
    const { lang } = useI18n();
    const [expanded, setExpanded] = useState(defaultExpanded);
    const model = useChapterCard({ chapter, index, chapterNumber, progress, stats, forceUnlocked });
    const { cardTheme, isChapterMastered, overallPercent } = model;

    const isProgressing = overallPercent > 0 && !isChapterMastered;
    const displayPercent = isChapterMastered ? 100 : overallPercent;
    const isPinned = isPinnedChapter(chapter);
    const chapterLabel = translateChapterLabel(chapter.id, chapter.title, lang);
    const displayNumber = chapterNumber ?? index + 1;
    const rowStyle = {
        '--accent': isPinned ? cardTheme.accent : (isProgressing ? 'var(--dashboard-mauve, #b5369b)' : cardTheme.accent),
        '--accent-soft': isPinned ? cardTheme.accentSoft : (isProgressing ? 'var(--dashboard-mauve-soft, rgba(181, 54, 155, 0.1))' : cardTheme.accentSoft),
        '--border-accent': cardTheme.accent,
        '--p': displayPercent,
    } as React.CSSProperties;

    const metaText = stats
        ? (lang === 'ar'
            ? `${stats.quizCount || 0} اختبار، ${stats.exerciseCount || 0} تمرين`
            : `${stats.quizCount || 0} quiz, ${stats.exerciseCount || 0} exercices`)
        : '';

    const regionId = `chapter-steps-${chapter.id}`;

    return (
        <div
            className={cn(
                'dash-seyes-ch ch dashboard-card-frame dash-list-row overflow-hidden border bg-white transition-[border-color,opacity,filter] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]',
                expanded && 'open',
                isChapterMastered
                    ? 'border-[#1D2B66]/35'
                    : isProgressing
                        ? 'border-[#1D2B66]/25'
                        : 'border-[#DEDFE6]',
                isInactive && (expanded
                    ? 'opacity-100 grayscale-0'
                    : 'opacity-60 grayscale-[0.2] hover:opacity-100 hover:grayscale-0 focus-within:opacity-100 focus-within:grayscale-0 lock')
            )}
            style={rowStyle}
        >
            <button
                type="button"
                onClick={() => setExpanded((v) => !v)}
                aria-expanded={expanded}
                aria-controls={regionId}
                aria-label={isPinned ? chapterLabel : `${lang === 'ar' ? 'المحور' : 'Chapitre'} ${displayNumber} : ${chapterLabel}`}
                className="dash-list-row__btn dash-seyes-head head flex w-full items-center text-left"
            >
                {/* Node Seyès circulaire avec jauge de progression */}
                <span
                    className="dash-seyes-node node shrink-0"
                    style={{ '--p': displayPercent } as React.CSSProperties}
                    aria-hidden="true"
                >
                    {isInactive ? (
                        <FaIcon icon={faLock} size={11} />
                    ) : (
                        <span>{String(displayNumber).padStart(2, '0')}</span>
                    )}
                </span>

                {/* Titre & Meta */}
                <span className="dash-seyes-head-info min-w-0 flex-1 truncate">
                    <span className="dash-list-row__title dash-seyes-ttl ttl block font-medium leading-[1.32] tracking-[-0.015em] text-[#1A1C25]">
                        <MathRenderer
                            inline
                            content={chapterLabel}
                            fontSize="inherit"
                            useMathTypography={false}
                            enableLexicon={false}
                        />
                    </span>
                    <span className="dash-seyes-meta meta block text-xs text-[#666B78] mt-0.5">
                        {isInactive
                            ? (lang === 'ar' ? 'مغلق' : 'Verrouillé')
                            : (metaText || (lang === 'ar' ? 'مسار دراسي متكامل' : 'Parcours structuré'))}
                    </span>
                </span>

                {/* Pourcentage : grand, aligné (largeur fixe + chiffres tabulaires) */}
                <span
                    className={cn(
                        'dash-list-row__pct dash-seyes-rside rside shrink-0 text-right font-medium tabular-nums text-sm',
                        displayPercent > 0 ? 'text-[#1D2B66]' : 'text-slate-400'
                    )}
                >
                    {displayPercent}%
                </span>

                {/* Chevron */}
                <FaIcon
                    icon={faChevronDown}
                    size={14}
                    className={cn(
                        'dash-seyes-chev chev shrink-0 text-slate-400 transition-transform duration-300',
                        expanded && 'rotate-180'
                    )}
                    aria-hidden="true"
                />
            </button>

            {/* Corps déplié : étapes de session, quiz et exercices */}
            {expanded && (
                <div
                    id={regionId}
                    className="dash-seyes-panel panel border-t border-[#DEDFE6]/60 px-[var(--dash-row-px)] py-2 animate-in fade-in slide-in-from-top-1 duration-300"
                >
                    <div className="dash-seyes-steps-wrap">
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
            )}
        </div>
    );
};

export default React.memo(ChapterListRow);
