import { useCallback, useEffect, useState } from 'react';
import { blankIdFor } from '../utils/revisionSheets';

interface UseRevisionBlanksOptions {
  containerRef: React.RefObject<HTMLDivElement | null>;
  loading: boolean;
  hasSheet: boolean;
  chapterId: string;
  blankScope: string;
  savedRevealedBlanks?: string[];
  blanksLocked: boolean;
  onSaveBlank?: (blankId: string) => void;
}

export const useRevisionBlanks = ({
  containerRef,
  loading,
  hasSheet,
  chapterId,
  blankScope,
  savedRevealedBlanks,
  blanksLocked,
  onSaveBlank,
}: UseRevisionBlanksOptions) => {
  const [totalBlanks, setTotalBlanks] = useState(0);
  const [revealedBlanks, setRevealedBlanks] = useState(0);

  const handleBlankClick = useCallback((blankId: string) => {
    // Réglage tablette prof : blancs verrouillés → aucune révélation.
    if (blanksLocked) return;
    onSaveBlank?.(blankId);
    setRevealedBlanks((prev) => prev + 1);
  }, [blanksLocked, onSaveBlank]);

  useEffect(() => {
    const container = containerRef.current;
    if (loading || !hasSheet || !container) return;

    const updateBlanks = () => {
      const blanks = container.querySelectorAll('.math-blank');
      setTotalBlanks((prev) => (prev === blanks.length ? prev : blanks.length));

      let revealedCount = 0;
      blanks.forEach((blank, idx) => {
        const blankId = blankIdFor(chapterId, blankScope, idx);
        blank.setAttribute('data-id', blankId);

        if (savedRevealedBlanks?.includes(blankId)) {
          if (!blank.classList.contains('revealed')) blank.classList.add('revealed');
          revealedCount++;
        }
      });
      setRevealedBlanks((prev) => (prev === revealedCount ? prev : revealedCount));
    };

    const handleDelegatedClick = (e: Event) => {
      if (blanksLocked) return;
      const target = (e.target as HTMLElement).closest('.math-blank') as HTMLElement | null;
      if (!target || target.classList.contains('revealed')) return;
      target.classList.add('revealed');
      const blankId = target.getAttribute('data-id');
      if (blankId) handleBlankClick(blankId);
    };

    container.addEventListener('click', handleDelegatedClick);

    const observer = new MutationObserver((mutations) => {
      const hasRelevantChanges = mutations.some((mutation) => {
        const target = mutation.target as HTMLElement;
        const isMathJaxInternal =
          target.tagName?.startsWith('MJX') || target.classList?.contains('mjx-assistive-mml');
        if (isMathJaxInternal) return false;
        return (
          mutation.type === 'childList' &&
          (target.classList?.contains('math-renderer') || target.querySelector?.('.math-blank'))
        );
      });

      if (hasRelevantChanges) updateBlanks();
    });

    observer.observe(container, { childList: true, subtree: true });
    updateBlanks();

    return () => {
      observer.disconnect();
      container.removeEventListener('click', handleDelegatedClick);
    };
  }, [loading, hasSheet, chapterId, blankScope, savedRevealedBlanks, handleBlankClick, blanksLocked, containerRef]);

  return { totalBlanks, revealedBlanks };
};
