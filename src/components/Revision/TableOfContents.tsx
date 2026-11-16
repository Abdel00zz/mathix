import React, {
    memo,
    useCallback,
    useDeferredValue,
    useEffect,
    useMemo,
    useRef,
    useState,
} from 'react';
import {
    faChevronLeft,
    faChevronRight,
    faList,
    faMagnifyingGlass,
    faXmark,
} from '@fortawesome/free-solid-svg-icons';
import { FaIcon } from '../UI/FaIcon';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import MathRenderer from '../MathRenderer';
import { RevisionSection } from '../../types';
import { useIsPhone } from '../../hooks/useMediaQuery';
import { useI18n } from '../../i18n/I18nContext';
import {
    buildRevisionSearchIndex,
    normalizeRevisionSearchQuery,
    normalizeRevisionSearchText,
    RevisionSearchResult,
    searchRevisionIndex,
} from '../../utils/revisionSearch';

interface TableOfContentsProps {
    sections: RevisionSection[];
    activeId: string;
    onScroll: (id: string) => void;
    onSearchResultSelect: (result: RevisionSearchResult, query: string) => void;
}

const HighlightedSnippet: React.FC<{ text: string; terms: string[] }> = ({ text, terms }) => (
    <>
        {text.split(/(\s+|[.,;:!?()[\]{}])/).map((part, index) => {
            const normalizedPart = normalizeRevisionSearchText(part);
            const matched = normalizedPart && terms.some(term => (
                normalizedPart.includes(term) || term.includes(normalizedPart)
            ));
            return matched ? (
                <mark
                    key={`${part}-${index}`}
                    className="rounded-[4px] bg-[#e6ddff] px-0.5 font-semibold text-[#49328d]"
                >
                    {part}
                </mark>
            ) : <React.Fragment key={`${part}-${index}`}>{part}</React.Fragment>;
        })}
    </>
);

const SearchResultRow: React.FC<{
    result: RevisionSearchResult;
    onSelect: () => void;
}> = memo(({ result, onSelect }) => {
    const { dir } = useI18n();
    return (
    <button
        type="button"
        data-search-result="true"
        onClick={onSelect}
        className={`group w-full touch-manipulation rounded-2xl border border-transparent px-3.5 py-3.5 ${dir === 'rtl' ? 'text-right' : 'text-left'} outline-none transition-[background-color,border-color,transform] hover:border-[#dcd5f7] hover:bg-[#f8f6ff] focus-visible:border-[#9570fc]/50 focus-visible:ring-2 focus-visible:ring-[#9570fc]/35 active:scale-[0.99] md:rounded-xl md:px-3 md:py-3`}
    >
        <span className="mb-1.5 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.11em] text-[#735bc1]">
            <span className="min-w-0 flex-1 truncate">{result.sectionTitle}</span>
            {dir === 'rtl'
                ? <FaIcon icon={faChevronLeft} className="h-3.5 w-3.5 shrink-0 transition-transform group-hover:-translate-x-0.5" />
                : <FaIcon icon={faChevronRight} className="h-3.5 w-3.5 shrink-0 transition-transform group-hover:translate-x-0.5" />}
        </span>
        {result.blockTitle && (
            <span className="mb-1 block truncate text-[12px] font-semibold text-[#4d5962]">
                {result.blockTitle}
            </span>
        )}
        <span className="line-clamp-2 block text-[13px] font-medium leading-[1.5] text-[#26343d]">
            <HighlightedSnippet text={result.snippet} terms={result.terms} />
        </span>
    </button>
    );
});

const SectionRow: React.FC<{
    section: RevisionSection;
    index: number;
    active: boolean;
    onSelect: () => void;
}> = memo(({ section, index, active, onSelect }) => {
    const { dir } = useI18n();
    return (
    <button
        type="button"
        data-section-id={section.id}
        aria-current={active ? 'location' : undefined}
        onClick={onSelect}
        className={[
            `group flex min-h-[58px] w-full touch-manipulation items-center gap-3 rounded-2xl border px-3.5 py-3 ${dir === 'rtl' ? 'text-right' : 'text-left'} outline-none transition-[background-color,border-color,color,transform] duration-200 focus-visible:ring-2 focus-visible:ring-[#9570fc]/45 focus-visible:ring-offset-2 active:scale-[0.985] md:min-h-[54px] md:rounded-xl md:px-3 md:py-2.5`,
            active
                ? 'border-[#9570fc]/35 bg-[#f3f0ff] text-[#302463]'
                : 'border-transparent bg-transparent text-[#24313a] hover:border-[#dde2e7] hover:bg-[#f7f8fa]',
        ].join(' ')}
    >
        <span
            className={[
                'flex h-8 w-8 shrink-0 items-center justify-center rounded-xl font-mono text-[11px] font-semibold tabular-nums transition-colors md:h-7 md:w-7 md:rounded-lg',
                active
                    ? 'bg-[#9570fc] text-white'
                    : 'bg-[#eef1f4] text-[#55636d] group-hover:bg-[#e7eaf8] group-hover:text-[#56429a]',
            ].join(' ')}
            aria-hidden="true"
        >
            {String(index + 1).padStart(2, '0')}
        </span>

        <span
            className={[
                'revision-toc-label min-w-0 flex-1 text-[15px] leading-[1.42] tracking-[-0.01em] md:text-[14px]',
                active ? 'font-semibold' : 'font-medium',
            ].join(' ')}
        >
            <MathRenderer
                inline
                content={section.title}
                fontSize="inherit"
                className="revision-toc-title"
            />
        </span>
    </button>
    );
});

const TableOfContents: React.FC<TableOfContentsProps> = ({
    sections,
    activeId,
    onScroll,
    onSearchResultSelect,
}) => {
    const { dir, t } = useI18n();
    const isRtl = dir === 'rtl';
    const [isOpen, setIsOpen] = useState(false);
    const [query, setQuery] = useState('');
    const [isSummaryTriggerVisible, setIsSummaryTriggerVisible] = useState(true);
    const panelRef = useRef<HTMLElement>(null);
    const listRef = useRef<HTMLDivElement>(null);
    const triggerRef = useRef<HTMLButtonElement>(null);
    const closeButtonRef = useRef<HTMLButtonElement>(null);
    const shouldRestoreFocusRef = useRef(false);
    const scrollIdleTimerRef = useRef<number | null>(null);
    const scrollFrameRef = useRef<number | null>(null);
    const reduceMotion = useReducedMotion();
    const isPhone = useIsPhone();

    const courseSections = useMemo(
        () => sections.filter(section => section.category !== 'method' && section.title?.trim()),
        [sections]
    );

    const deferredQuery = useDeferredValue(query);
    const normalizedQuery = useMemo(
        () => normalizeRevisionSearchQuery(deferredQuery),
        [deferredQuery]
    );
    const searchIndex = useMemo(() => buildRevisionSearchIndex(courseSections), [courseSections]);
    const searchResults = useMemo(
        () => searchRevisionIndex(searchIndex, deferredQuery),
        [deferredQuery, searchIndex]
    );

    const closeSummary = useCallback(() => {
        setIsOpen(false);
        setQuery('');
    }, []);

    const handleSelect = useCallback((id: string) => {
        onScroll(id);
        closeSummary();
    }, [closeSummary, onScroll]);

    const handleSearchSelect = useCallback((result: RevisionSearchResult) => {
        const selectedQuery = query;
        closeSummary();
        onSearchResultSelect(result, selectedQuery);
    }, [closeSummary, onSearchResultSelect, query]);

    useEffect(() => {
        if (!isOpen) {
            if (shouldRestoreFocusRef.current) {
                shouldRestoreFocusRef.current = false;
                window.requestAnimationFrame(() => triggerRef.current?.focus());
            }
            return;
        }

        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        shouldRestoreFocusRef.current = true;
        const focusTimer = window.setTimeout(() => closeButtonRef.current?.focus(), 30);

        return () => {
            document.body.style.overflow = previousOverflow;
            window.clearTimeout(focusTimer);
        };
    }, [isOpen]);

    useEffect(() => {
        if (isOpen) return;

        const revealTrigger = () => {
            if (scrollIdleTimerRef.current !== null) window.clearTimeout(scrollIdleTimerRef.current);
            scrollIdleTimerRef.current = null;
            setIsSummaryTriggerVisible(true);
        };
        const handleScroll = () => {
            if (scrollFrameRef.current === null) {
                scrollFrameRef.current = window.requestAnimationFrame(() => {
                    scrollFrameRef.current = null;
                    setIsSummaryTriggerVisible(false);
                });
            }
            if (scrollIdleTimerRef.current !== null) window.clearTimeout(scrollIdleTimerRef.current);
            scrollIdleTimerRef.current = window.setTimeout(revealTrigger, 420);
        };

        document.addEventListener('scroll', handleScroll, { capture: true, passive: true });
        window.addEventListener('scrollend', revealTrigger, { passive: true });
        return () => {
            document.removeEventListener('scroll', handleScroll, true);
            window.removeEventListener('scrollend', revealTrigger);
            if (scrollIdleTimerRef.current !== null) window.clearTimeout(scrollIdleTimerRef.current);
            if (scrollFrameRef.current !== null) window.cancelAnimationFrame(scrollFrameRef.current);
        };
    }, [isOpen]);

    useEffect(() => {
        if (!isOpen || !activeId || normalizedQuery || !listRef.current) return;
        const frame = window.requestAnimationFrame(() => {
            listRef.current
                ?.querySelector<HTMLElement>('[data-section-id="' + activeId + '"]')
                ?.scrollIntoView({
                    behavior: reduceMotion ? 'auto' : 'smooth',
                    block: 'center',
                });
        });
        return () => window.cancelAnimationFrame(frame);
    }, [activeId, isOpen, normalizedQuery, reduceMotion]);

    const handlePanelKeyDown = useCallback((event: React.KeyboardEvent<HTMLElement>) => {
        if (event.key === 'Escape') {
            event.preventDefault();
            closeSummary();
            return;
        }
        if (event.key !== 'Tab' || !panelRef.current) return;

        const focusable = Array.from(panelRef.current.querySelectorAll<HTMLElement>(
            'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'
        ));
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];

        if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first.focus();
        }
    }, [closeSummary]);

    return (
        <>
            {!isOpen && (
                <motion.button
                    ref={triggerRef}
                    type="button"
                    initial={reduceMotion ? false : { opacity: 0, x: 10 }}
                    animate={isSummaryTriggerVisible
                        ? { opacity: 1, x: 0 }
                        : { opacity: 0, x: 14 }}
                    transition={reduceMotion ? { duration: 0 } : { duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                    whileTap={reduceMotion ? undefined : { scale: 0.94 }}
                    onClick={() => setIsOpen(true)}
                    className={`group fixed bottom-[max(0.85rem,env(safe-area-inset-bottom))] right-[max(0.75rem,env(safe-area-inset-right))] z-50 grid h-11 w-11 touch-manipulation place-items-center rounded-full border border-slate-200/80 bg-white/92 text-[#4c428c] shadow-[0_2px_10px_rgba(15,23,42,0.06)] outline-none transition-[color,background-color,border-color,box-shadow] duration-200 hover:border-slate-300 hover:bg-white hover:text-[#3b2f80] hover:shadow-[0_4px_14px_rgba(15,23,42,0.09)] focus-visible:ring-2 focus-visible:ring-[#6b5ce7]/35 md:bottom-5 md:right-4 ${isSummaryTriggerVisible ? '' : 'pointer-events-none'}`}
                    aria-label={t('common.navigation')}
                    aria-expanded={false}
                    aria-controls="revision-summary"
                    title={t('common.navigation')}
                    tabIndex={isSummaryTriggerVisible ? 0 : -1}
                >
                    <FaIcon icon={faList} className="h-[18px] w-[18px]" />
                </motion.button>
            )}

            <AnimatePresence>
                {isOpen && (
                    <>
                        <motion.button
                            type="button"
                            aria-label={t('common.close')}
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: reduceMotion ? 0 : 0.18 }}
                            className="fixed inset-0 z-[60] cursor-default border-0 bg-slate-950/45 backdrop-blur-[2px]"
                            onClick={closeSummary}
                        />

                        <motion.aside
                            ref={panelRef}
                            id="revision-summary"
                            role="dialog"
                            aria-modal="true"
                            aria-labelledby="revision-summary-title"
                            aria-describedby="revision-summary-description"
                            initial={reduceMotion
                                ? { opacity: 0 }
                                : isPhone
                                    ? { opacity: 0, y: 40 }
                                    : { opacity: 0, x: isRtl ? 20 : -20 }}
                            animate={{ opacity: 1, x: 0, y: 0 }}
                            exit={reduceMotion
                                ? { opacity: 0 }
                                : isPhone
                                    ? { opacity: 0, y: 40 }
                                    : { opacity: 0, x: isRtl ? 20 : -20 }}
                            transition={reduceMotion
                                ? { duration: 0 }
                                : { duration: 0.26, ease: [0.22, 1, 0.36, 1] }}
                            drag={isPhone && !reduceMotion ? 'y' : false}
                            dragConstraints={{ top: 0, bottom: 0 }}
                            dragElastic={{ top: 0, bottom: 0.25 }}
                            onDragEnd={(_, info) => {
                                if (info.offset.y > 90 || info.velocity.y > 650) closeSummary();
                            }}
                            onKeyDown={handlePanelKeyDown}
                            className={`typo-ui fixed inset-x-0 bottom-0 z-[70] flex max-h-[min(80dvh,44rem)] flex-col overflow-hidden rounded-t-[24px] border-x border-t border-slate-200/85 bg-[#fcfcfa] pb-[env(safe-area-inset-bottom)] shadow-[0_-12px_36px_rgba(15,23,42,0.12)] will-change-transform md:inset-y-5 ${isRtl ? 'md:right-5 md:left-auto' : 'md:left-5 md:right-auto'} md:max-h-none md:w-[352px] md:rounded-[20px] md:border md:pb-0 md:shadow-[0_14px_40px_-8px_rgba(15,23,42,0.14)]`}
                        >
                            <div className="flex shrink-0 justify-center py-2.5 md:hidden" aria-hidden="true">
                                <span className="h-1.5 w-11 rounded-full bg-[#cbd1d8]" />
                            </div>

                            <header className="relative shrink-0 border-b border-[#dfe3e7] px-4 pb-3 pr-14 pt-1 md:px-4 md:py-3.5">
                                <h2
                                    id="revision-summary-title"
                                    className="text-[18px] font-semibold tracking-[-0.025em] text-[#18232b]"
                                    style={{ fontFamily: '"Plus Jakarta Sans", "Segoe UI", sans-serif' }}
                                >
                                    {t('common.navigation')}
                                </h2>
                                <p id="revision-summary-description" className="sr-only">
                                    Rechercher ou parcourir les sections de la leçon
                                </p>

                                <button
                                    ref={closeButtonRef}
                                    type="button"
                                    onClick={closeSummary}
                                    aria-label={t('common.close')}
                                    className={`absolute ${isRtl ? 'left-3 md:left-3' : 'right-3 md:right-3'} top-2 flex h-11 w-11 touch-manipulation items-center justify-center rounded-full border border-[#e0e4e8] bg-[#f7f8fa] text-[#46535c] outline-none transition-colors hover:border-[#cfc5f6] hover:bg-[#f2efff] hover:text-[#6049ad] focus-visible:ring-2 focus-visible:ring-[#9570fc]/45 md:top-3 md:h-10 md:w-10`}
                                >
                                    <FaIcon icon={faXmark} className="h-[17px] w-[17px]" />
                                </button>
                            </header>

                            {courseSections.length > 0 && (
                                <div className="shrink-0 border-b border-[#edf0f2] bg-[#fbfbfc] px-4 py-3">
                                    <label className="relative block">
                                        <span className="sr-only">{t('common.search')}</span>
                                        <FaIcon
                                            icon={faMagnifyingGlass}
                                            className={`pointer-events-none absolute ${isRtl ? 'right-3.5' : 'left-3.5'} top-1/2 h-[16px] w-[16px] -translate-y-1/2 text-[#77838c]`}
                                        />
                                        <input
                                            type="search"
                                            value={query}
                                            onChange={event => setQuery(event.target.value)}
                                            onKeyDown={event => {
                                                if (event.key === 'ArrowDown' && searchResults.length > 0) {
                                                    event.preventDefault();
                                                    listRef.current?.querySelector<HTMLButtonElement>('[data-search-result="true"]')?.focus();
                                                }
                                            }}
                                            placeholder={`${t('common.search')}…`}
                                            autoComplete="off"
                                            className={`h-12 w-full rounded-xl border border-[#d7dce1] bg-white ${isRtl ? 'pr-10 pl-4 text-right' : 'pl-10 pr-4 text-left'} text-[16px] font-medium text-[#1f2b33] outline-none transition-[border-color,box-shadow] placeholder:text-[#8b959c] focus:border-[#9570fc] focus:ring-4 focus:ring-[#9570fc]/10 md:h-11 md:text-[14px]`}
                                        />
                                    </label>
                                </div>
                            )}

                            {normalizedQuery && (
                                <div
                                    aria-live="polite"
                                    className="shrink-0 border-b border-[#edf0f2] bg-white px-5 py-2 text-[11px] font-semibold text-[#66737c]"
                                >
                                    {searchResults.length > 0
                                        ? `${searchResults.length} passage${searchResults.length > 1 ? 's' : ''} pertinent${searchResults.length > 1 ? 's' : ''}`
                                        : 'Aucun passage correspondant'}
                                    {searchResults.length === 40 ? ' parmi les meilleurs résultats' : ''}
                                </div>
                            )}

                            <div
                                ref={listRef}
                                className="scrollbar-thin flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto overscroll-contain bg-white px-2.5 py-3 [scrollbar-gutter:stable] md:gap-1 md:px-2 md:py-2.5"
                            >
                                {!normalizedQuery && courseSections.map((section, index) => (
                                    <SectionRow
                                        key={section.id}
                                        section={section}
                                        index={index}
                                        active={section.id === activeId}
                                        onSelect={() => handleSelect(section.id)}
                                    />
                                ))}

                                {normalizedQuery && searchResults.map(result => (
                                    <SearchResultRow
                                        key={result.id}
                                        result={result}
                                        onSelect={() => handleSearchSelect(result)}
                                    />
                                ))}

                                {normalizedQuery && searchResults.length === 0 && (
                                    <div className="flex flex-1 flex-col items-center justify-center px-6 py-12 text-center">
                                        <FaIcon icon={faMagnifyingGlass} className="mb-3 h-7 w-7 text-[#9570fc]" />
                                        <p className="text-[15px] font-semibold text-[#26333b]">Aucun passage trouvé</p>
                                        <p className="mt-1 text-[13px] leading-relaxed text-[#738089]">
                                            Vérifiez l’orthographe ou essayez un mot plus court.
                                        </p>
                                    </div>
                                )}
                            </div>
                        </motion.aside>
                    </>
                )}
            </AnimatePresence>
        </>
    );
};

export default memo(TableOfContents);
