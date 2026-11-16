import { useCallback, useEffect, useRef } from 'react';
import { RevisionSearchResult } from '../utils/revisionSearch';
import { findSearchTextRange } from '../utils/revisionSearchDom';

interface UseRevisionNavigationOptions {
  activeIds: string[];
  loading: boolean;
  showLoading: boolean;
  hasSheet: boolean;
  savedLastActiveSection?: string;
}

export const useRevisionNavigation = ({
  activeIds,
  loading,
  showLoading,
  hasSheet,
  savedLastActiveSection,
}: UseRevisionNavigationOptions) => {
  const hasRestoredScrollRef = useRef(false);
  const pendingScrollCleanupRef = useRef<(() => void) | null>(null);
  const searchHighlightCleanupRef = useRef<(() => void) | null>(null);
  const pendingActiveSectionRef = useRef<string | null>(null);

  const getSectionTop = useCallback((id: string) => {
    const element = document.getElementById(id);
    if (!element) return null;
    return element.getBoundingClientRect().top + window.scrollY - 96;
  }, []);

  const stabilizeSectionPosition = useCallback((id: string, duration = 2600) => {
    let animationFrame = 0;
    let cancelled = false;
    const startedAt = performance.now();

    function removeUserIntentListeners() {
      window.removeEventListener('wheel', cancelOnUserIntent);
      window.removeEventListener('touchstart', cancelOnUserIntent);
      window.removeEventListener('pointerdown', cancelOnUserIntent);
      window.removeEventListener('keydown', cancelOnNavigationKey);
    }
    function cancelOnUserIntent() {
      cancelled = true;
      window.cancelAnimationFrame(animationFrame);
      removeUserIntentListeners();
    }
    function cancelOnNavigationKey(event: KeyboardEvent) {
      if (['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' '].includes(event.key)) {
        cancelOnUserIntent();
      }
    }

    window.addEventListener('wheel', cancelOnUserIntent, { passive: true, once: true });
    window.addEventListener('touchstart', cancelOnUserIntent, { passive: true, once: true });
    window.addEventListener('pointerdown', cancelOnUserIntent, { passive: true, once: true });
    window.addEventListener('keydown', cancelOnNavigationKey);

    const keepAnchor = () => {
      if (cancelled) return;
      const element = document.getElementById(id);
      if (!element) return;

      const delta = element.getBoundingClientRect().top - 96;
      if (Math.abs(delta) > 1) {
        window.scrollBy({ top: delta, behavior: 'auto' });
      }

      if (performance.now() - startedAt < duration) {
        animationFrame = window.requestAnimationFrame(keepAnchor);
      } else {
        removeUserIntentListeners();
      }
    };

    animationFrame = window.requestAnimationFrame(keepAnchor);
    return () => {
      cancelled = true;
      window.cancelAnimationFrame(animationFrame);
      removeUserIntentListeners();
    };
  }, []);

  const scrollToSection = useCallback((id: string, behavior: ScrollBehavior = 'smooth') => {
    const top = getSectionTop(id);
    if (top === null) return;

    pendingScrollCleanupRef.current?.();
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const resolvedBehavior = reduceMotion ? 'auto' : behavior;
    window.scrollTo({ top, behavior: resolvedBehavior });

    const delay = resolvedBehavior === 'smooth' ? 420 : 0;
    const timeoutId = window.setTimeout(() => {
      pendingScrollCleanupRef.current = stabilizeSectionPosition(id);
    }, delay);

    pendingScrollCleanupRef.current = () => window.clearTimeout(timeoutId);
  }, [getSectionTop, stabilizeSectionPosition]);

  const scrollToSearchResult = useCallback((result: RevisionSearchResult, query: string) => {
    pendingScrollCleanupRef.current?.();
    searchHighlightCleanupRef.current?.();

    let cancelled = false;
    let timerId = 0;

    const openResult = () => {
      if (cancelled) return;
      const target = document.getElementById(result.blockId)
        || document.getElementById(result.sectionId);
      if (!target) {
        scrollToSection(result.sectionId);
        return;
      }

      const range = findSearchTextRange(target, query, result.terms);
      const targetRect = range?.getClientRects()[0] || target.getBoundingClientRect();
      const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      window.scrollTo({
        top: Math.max(0, targetRect.top + window.scrollY - 112),
        behavior: reduceMotion ? 'auto' : 'smooth',
      });

      target.classList.add('revision-search-target');
      const cssHighlightRegistry = (CSS as unknown as {
        highlights?: { set: (name: string, value: unknown) => void; delete: (name: string) => void };
      }).highlights;
      const HighlightConstructor = (window as unknown as {
        Highlight?: new (...ranges: Range[]) => unknown;
      }).Highlight;

      if (range && cssHighlightRegistry && HighlightConstructor) {
        cssHighlightRegistry.set('revision-search-match', new HighlightConstructor(range));
      }

      const clearHighlight = () => {
        target.classList.remove('revision-search-target');
        cssHighlightRegistry?.delete('revision-search-match');
      };
      timerId = window.setTimeout(clearHighlight, 4200);
      searchHighlightCleanupRef.current = () => {
        window.clearTimeout(timerId);
        clearHighlight();
      };
    };

    const frameId = window.requestAnimationFrame(() => {
      timerId = window.setTimeout(openResult, 70);
    });
    searchHighlightCleanupRef.current = () => {
      cancelled = true;
      window.cancelAnimationFrame(frameId);
      window.clearTimeout(timerId);
    };
  }, [scrollToSection]);

  const continueToSection = useCallback((id: string) => {
    pendingActiveSectionRef.current = id;
    scrollToSection(id);
  }, [scrollToSection]);

  useEffect(() => {
    if (loading || showLoading || !hasSheet || hasRestoredScrollRef.current) return;

    if (!savedLastActiveSection || !activeIds.includes(savedLastActiveSection)) {
      hasRestoredScrollRef.current = true;
      return;
    }

    if (savedLastActiveSection === activeIds[0]) {
      window.scrollTo({ top: 0, behavior: 'auto' });
      hasRestoredScrollRef.current = true;
      return;
    }

    let secondFrame = 0;
    const firstFrame = window.requestAnimationFrame(() => {
      secondFrame = window.requestAnimationFrame(() => {
        scrollToSection(savedLastActiveSection, 'auto');
        hasRestoredScrollRef.current = true;
      });
    });

    return () => {
      window.cancelAnimationFrame(firstFrame);
      window.cancelAnimationFrame(secondFrame);
    };
  }, [activeIds, hasSheet, loading, savedLastActiveSection, scrollToSection, showLoading]);

  useEffect(() => () => {
    pendingScrollCleanupRef.current?.();
    searchHighlightCleanupRef.current?.();
  }, []);

  return {
    hasRestoredScrollRef,
    pendingActiveSectionRef,
    scrollToSection,
    scrollToSearchResult,
    continueToSection,
  };
};
