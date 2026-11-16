import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { faChevronLeft, faChevronRight, faXmark } from '@fortawesome/free-solid-svg-icons';
import { FaIcon } from '../UI/FaIcon';
import { useFocusMode } from './FocusModeContext';
import MathRenderer from '../MathRenderer';
import { normalizeBlockType } from './courseBlock/blockUtils';
import { RevisionBadge } from './BlockHeader';
import { ENV_LABELS } from '../../styles/mathTheme';
import { useI18n } from '../../i18n/I18nContext';
import CelaPermetDeBlock from './courseBlock/CelaPermetDeBlock';
import { useProfPersonalization } from '../../hooks/useProfPersonalization';
import type { RevisionBlock } from '../../types';

const REVEAL_STEP_SELECTOR = [
  'li.math-list-item',
  '.itemsize-block',
  '.math-display-node',
  '.math-env-quote',
  '.math-env-center',
  '.math-env-code',
].join(',');

const collectRevealSteps = (root: HTMLElement): HTMLElement[] => {
  const found = Array.from(root.querySelectorAll<HTMLElement>(REVEAL_STEP_SELECTOR));
  return found.filter((node) => !found.some((other) => other !== node && other.contains(node)));
};

const FOCUS_EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];

const STEP_BUTTON_CLASS =
  'inline-flex h-8 items-center rounded-full border border-[#ddd6c7] bg-white px-3 text-[11px] font-semibold text-slate-600 transition-colors duration-200 hover:border-slate-400 hover:bg-slate-50 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400/40 disabled:cursor-not-allowed disabled:opacity-35';

const STEP_ARROW_CLASS =
  'grid h-8 w-8 place-items-center rounded-full border border-[#ddd6c7] bg-white text-slate-500 transition-colors duration-200 hover:border-slate-400 hover:bg-slate-50 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400/40 disabled:cursor-not-allowed disabled:opacity-35';

interface FocusedCardDialogProps {
  block: RevisionBlock;
  number?: number;
  clearFocus: () => void;
}

const FocusedCardDialog: React.FC<FocusedCardDialogProps> = ({ block, number, clearFocus }) => {
  const { t } = useI18n();
  const reduceMotion = useReducedMotion();
  const modalRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);

  const prefs = useProfPersonalization();
  const progressiveReveal = prefs.revision.progressiveReveal;
  const blanksLocked = !prefs.canvas.showBlanks;
  const profTextScale = prefs.revision.textScale;
  const focusFontSize = profTextScale && profTextScale !== 1
    ? `calc(1.08rem * var(--reading-doc-scale, 1) * ${profTextScale})`
    : 'calc(1.08rem * var(--reading-doc-scale, 1))';
  const contentRef = useRef<HTMLDivElement>(null);
  const stepNodesRef = useRef<HTMLElement[]>([]);
  const [revealedCount, setRevealedCount] = useState(1);
  const [stepTotal, setStepTotal] = useState(0);
  const [revealEpoch, setRevealEpoch] = useState(0);

  const revealNext = useCallback(() => {
    setRevealedCount((count) => Math.min(count + 1, Math.max(1, stepNodesRef.current.length)));
  }, []);
  const revealPrevious = useCallback(() => {
    setRevealedCount((count) => Math.max(1, count - 1));
  }, []);
  const revealAll = useCallback(() => {
    setRevealedCount(Math.max(1, stepNodesRef.current.length));
  }, []);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const root = contentRef.current;
      if (!root) return;
      if (!progressiveReveal) {
        const hidden = root.querySelectorAll<HTMLElement>('.focus-reveal-hidden');
        hidden.forEach((node) => {
          node.classList.remove('focus-reveal-hidden');
          node.removeAttribute('aria-hidden');
        });
        return;
      }
      const nodes = collectRevealSteps(root);
      stepNodesRef.current = nodes;
      setStepTotal(nodes.length);
      setRevealedCount(1);
      setRevealEpoch((epoch) => epoch + 1);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [block, progressiveReveal]);

  useEffect(() => {
    if (!progressiveReveal) return;
    stepNodesRef.current.forEach((node, index) => {
      const hidden = index >= revealedCount;
      node.classList.toggle('focus-reveal-hidden', hidden);
      if (hidden) node.setAttribute('aria-hidden', 'true');
      else node.removeAttribute('aria-hidden');
    });
  }, [revealedCount, stepTotal, revealEpoch, progressiveReveal]);

  useEffect(() => {
    if (!progressiveReveal || revealedCount <= 1) return;
    stepNodesRef.current[revealedCount - 1]?.scrollIntoView?.({ block: 'nearest' });
  }, [revealedCount, progressiveReveal]);

  useEffect(() => {
    previouslyFocusedRef.current = document.activeElement as HTMLElement | null;
    window.requestAnimationFrame(() => closeButtonRef.current?.focus());

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        clearFocus();
        return;
      }
      if (!progressiveReveal) return;
      if (e.key === 'ArrowRight' || e.key === ' ' || e.key === 'PageDown') {
        e.preventDefault();
        revealNext();
      } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
        e.preventDefault();
        revealPrevious();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    document.body.style.overflow = 'hidden';

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
      previouslyFocusedRef.current?.focus();
    };
  }, [clearFocus, progressiveReveal, revealNext, revealPrevious]);

  const typeKey = normalizeBlockType(block.type);
  const label = ENV_LABELS[typeKey] || typeKey.toUpperCase();
  const resolvedLabel = typeKey === 'rappel' ? 'Rappel' : label;
  const contentStr = Array.isArray(block.content) ? block.content.join('\n') : block.content;
  const showStepper = progressiveReveal && stepTotal > 0;

  return (
    <motion.div
      key="focus-overlay-backdrop"
      dir="ltr"
      lang="fr"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: reduceMotion ? 0 : 0.24, ease: FOCUS_EASE }}
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/42 p-3 backdrop-blur-[3px] sm:p-6 md:p-10 print:absolute print:inset-0 print:bg-white print:p-0 print:backdrop-blur-none"
      onClick={(e) => {
        if (modalRef.current && !modalRef.current.contains(e.target as Node)) {
          clearFocus();
        }
      }}
    >
      <motion.div
        ref={modalRef}
        id="focused-card"
        role="dialog"
        aria-modal="true"
        aria-label={t('common.navigation')}
        initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 12, scale: 0.985 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 8, scale: 0.985 }}
        transition={{ duration: reduceMotion ? 0 : 0.26, ease: FOCUS_EASE }}
        className="relative flex max-h-[88dvh] w-full flex-col overflow-hidden rounded-[24px] border border-[#e3dccd] bg-[#fdfcf9] shadow-[0_24px_60px_-12px_rgba(15,23,42,0.22)] sm:w-auto sm:min-w-[26rem] sm:max-w-[60rem] print:max-h-none print:w-full print:border-none print:shadow-none"
      >
        <button
          ref={closeButtonRef}
          type="button"
          aria-label={t('common.close')}
          onClick={(event) => {
            event.stopPropagation();
            clearFocus();
          }}
          className="absolute right-4 top-4 z-20 flex h-9 w-9 items-center justify-center rounded-full border border-[#e3dccd] bg-white/95 text-slate-500 transition-colors duration-200 hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400/40 print:hidden"
        >
          <FaIcon icon={faXmark} size={16} />
        </button>

        <div
          ref={contentRef}
          dir="ltr"
          lang="fr"
          className={`flex-1 overflow-y-auto px-6 py-7 sm:px-9 sm:py-8 revision-editorial revision-surface chic-focus-scrollbar chic-focus-container print:px-6 print:py-6${blanksLocked ? ' math-blanks-locked' : ''}`}
          style={{ fontSize: focusFontSize, lineHeight: '1.72' }}
        >
          {typeKey !== 'cela_permet_de' && typeKey !== 'method' && (
            <div className="mb-5 flex select-none flex-col gap-3">
              <div className="flex items-center justify-start">
                <RevisionBadge typeKey={typeKey} label={resolvedLabel} number={number} />
              </div>
            </div>
          )}

          <div
            className="break-words text-left font-normal text-slate-800"
            onClick={(e) => {
              const target = e.target as HTMLElement;
              if (!blanksLocked) {
                const blank = target.closest('.math-blank');
                if (blank && !blank.classList.contains('revealed')) {
                  blank.classList.add('revealed');
                }
              }
              if (progressiveReveal) revealNext();
            }}
          >
            {typeKey === 'cela_permet_de'
              ? <CelaPermetDeBlock content={block.content} />
              : <MathRenderer content={contentStr} fontSize="inherit" enableLongPressHighlight />}
          </div>
        </div>

        {showStepper && (
          <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-[#e8e2d5] bg-[#f7f4ec] px-4 py-2.5 print:hidden">
            <span className="text-[11px] font-medium tracking-wide text-slate-500 tabular-nums">
              Étape {revealedCount} / {stepTotal}
            </span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={revealPrevious}
                disabled={revealedCount <= 1}
                className={STEP_ARROW_CLASS}
                aria-label={t('common.previous')}
                title={t('common.previous')}
              >
                <FaIcon icon={faChevronLeft} size={14} />
              </button>
              <button
                type="button"
                onClick={revealAll}
                disabled={revealedCount >= stepTotal}
                className={STEP_BUTTON_CLASS}
              >
                {t('common.showAll')}
              </button>
              <button
                type="button"
                onClick={revealNext}
                disabled={revealedCount >= stepTotal}
                className={STEP_ARROW_CLASS}
                aria-label={t('common.next')}
                title={t('common.next')}
              >
                <FaIcon icon={faChevronRight} size={14} />
              </button>
            </div>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
};

export const FocusOverlay: React.FC = () => {
  const { focusedBlock, clearFocus } = useFocusMode();

  return (
    <AnimatePresence mode="wait">
      {focusedBlock && (
        <FocusedCardDialog
          key={`${focusedBlock.block.type}-${focusedBlock.number ?? 'x'}`}
          block={focusedBlock.block}
          number={focusedBlock.number}
          clearFocus={clearFocus}
        />
      )}
    </AnimatePresence>
  );
};
