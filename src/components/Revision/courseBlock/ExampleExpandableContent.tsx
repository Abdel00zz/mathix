import React, { useEffect, useId, useRef, useState } from 'react';
import { useI18n } from '../../../i18n/I18nContext';

const EXAMPLE_COLLAPSED_MAX_HEIGHT = 92;

/**
 * Bloc d'exercice d'application repliable :
 * Affiche l'énoncé puis propose de résoudre l'exercice ("Résolvons l'exercice")
 * via un mécanisme de révélation fluide, précis et futuriste sans friction.
 */
const ExampleExpandableContent: React.FC<{
    children: React.ReactNode;
    leadContent?: React.ReactNode;
}> = ({ children, leadContent }) => {
    const { dir, t } = useI18n();
    const [isExpanded, setIsExpanded] = useState(false);
    const hasLead = !!leadContent;
    const [canExpand, setCanExpand] = useState(hasLead);
    const [measuredHeight, setMeasuredHeight] = useState(EXAMPLE_COLLAPSED_MAX_HEIGHT);
    const contentRef = useRef<HTMLDivElement>(null);
    const expandableContentId = useId();
    const collapsedHeight = hasLead ? 0 : EXAMPLE_COLLAPSED_MAX_HEIGHT;

    useEffect(() => {
        const el = contentRef.current;
        if (!el) return;

        const measure = () => {
            const fullHeight = el.scrollHeight;
            setMeasuredHeight(fullHeight);
            setCanExpand(hasLead ? fullHeight > 5 : fullHeight > EXAMPLE_COLLAPSED_MAX_HEIGHT + 10);
        };

        measure();

        const observer = typeof ResizeObserver !== 'undefined'
            ? new ResizeObserver(() => measure())
            : null;

        observer?.observe(el);
        window.addEventListener('resize', measure);

        return () => {
            observer?.disconnect();
            window.removeEventListener('resize', measure);
        };
    }, [children, hasLead]);

    const currentMaxHeight = isExpanded
        ? Math.max(measuredHeight + 36, collapsedHeight)
        : collapsedHeight;

    const handleToggle = () => {
        setIsExpanded(prev => !prev);
    };

    return (
        <div className="relative mt-1 group/expand">
            {leadContent && (
                <div className="w-full">
                    {leadContent}
                </div>
            )}
            {hasLead ? (
                <div
                    id={expandableContentId}
                    aria-hidden={!isExpanded}
                    inert={!isExpanded ? true : undefined}
                    className={`grid transition-[grid-template-rows,opacity] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${isExpanded ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'} overflow-hidden`}
                >
                    <div className="overflow-hidden min-h-0">
                        <div
                            ref={contentRef}
                            className={`transition-[transform,opacity] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${isExpanded ? 'translate-y-0 opacity-100' : '-translate-y-1.5 opacity-0'}`}
                        >
                            <div
                                className="revision-application-correction-divider cursor-pointer select-none"
                                role="button"
                                tabIndex={0}
                                title={isExpanded ? t('common.reduce') : t('common.showCorrection')}
                                onClick={() => setIsExpanded((value) => !value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' || e.key === ' ') {
                                        e.preventDefault();
                                        setIsExpanded((value) => !value);
                                    }
                                }}
                            >
                                <span>{t('common.correction')}</span>
                            </div>
                            {children}
                        </div>
                    </div>
                </div>
            ) : (
                <div
                    id={expandableContentId}
                    aria-hidden={!isExpanded}
                    inert={!isExpanded ? true : undefined}
                    className="relative overflow-hidden transition-[max-height] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]"
                    style={{ maxHeight: `${currentMaxHeight}px` }}
                >
                    <div
                        ref={contentRef}
                        className={`transition-[opacity,transform] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${isExpanded ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-1.5'}`}
                    >
                        {children}
                    </div>
                </div>
            )}

            {canExpand && (
                <div className={`flex justify-end w-full transition-[margin] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${isExpanded ? 'mt-2.5' : (hasLead ? 'mt-1.5' : '-mt-2')} relative z-20`}>
                    <button
                        type="button"
                        dir={dir}
                        onClick={handleToggle}
                        aria-expanded={isExpanded}
                        aria-controls={expandableContentId}
                        className="revision-correction-toggle group inline-flex items-center cursor-pointer select-none"
                    >
                        <span className="revision-correction-toggle-label">
                            {isExpanded ? t('common.reduce') : (hasLead ? t('common.showCorrection') : t('common.showMore'))}
                        </span>
                        <svg
                            aria-hidden="true"
                            className="revision-correction-chevron ml-1.5"
                            fill="none"
                            viewBox="0 0 24 24"
                            strokeWidth="2.2"
                            stroke="currentColor"
                        >
                            <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
                        </svg>
                    </button>
                </div>
            )}
        </div>
    );
};

export default ExampleExpandableContent;
