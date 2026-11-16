import React, { useCallback, useEffect, useRef } from 'react';
import {
  getLexiconCooldownUntil,
  getLexiconMemoryKeyForElement,
  LEXICON_REVEAL_MS,
  setLexiconCooldown,
} from '../utils/lexiconMemory';

const HIGHLIGHT_CLASS = 'mathflow-highlight';
const LEXICON_CLASS = 'mathflow-lexicon-term';
const LONG_PRESS_MS = 1200;
const LONG_PRESS_MOVE_TOLERANCE = 10;
const LONG_PRESS_EVENT_GUARD_MS = 800;

const nodeIsInside = (root: HTMLElement, node: Node) => {
  if (node === root) return true;
  if (node.nodeType === Node.ELEMENT_NODE) return root.contains(node as Element);
  return Boolean(node.parentElement && root.contains(node.parentElement));
};

const getEventElement = (target: EventTarget | null) => {
  if (target instanceof Element) return target;
  if (target instanceof Node) return target.parentElement;
  return null;
};

const findLexiconElementAtPoint = (
  target: Element,
  root: HTMLElement | null,
  x: number,
  y: number
) => {
  const targetLexicon = target.closest(`.${LEXICON_CLASS}`) as HTMLElement | null;
  if (targetLexicon) return targetLexicon;

  const pointElement = document.elementFromPoint(x, y);
  const pointLexicon = pointElement?.closest?.(`.${LEXICON_CLASS}`) as HTMLElement | null;
  if (pointLexicon) return pointLexicon;

  const searchRoot = root || document.body;
  const tolerance = 4;

  return Array.from(searchRoot.querySelectorAll<HTMLElement>(`.${LEXICON_CLASS}`)).find((element) => (
    Array.from(element.getClientRects()).some((rect) => (
      x >= rect.left - tolerance &&
      x <= rect.right + tolerance &&
      y >= rect.top - tolerance &&
      y <= rect.bottom + tolerance
    ))
  )) || null;
};

const setLexiconState = (element: HTMLElement, state: 'arabic' | 'french') => {
  const french = element.dataset.termFr || element.textContent || '';
  const arabic = element.dataset.termAr || '';

  element.dataset.state = state;
  element.textContent = state === 'arabic' ? arabic : french;
  element.setAttribute('dir', state === 'arabic' ? 'rtl' : 'ltr');
  element.setAttribute('lang', state === 'arabic' ? 'ar' : 'fr');
  element.classList.toggle('is-arabic', state === 'arabic');
  element.classList.toggle('is-french', state === 'french');
};

const markMatchingLexiconTermsCooling = (root: HTMLElement | null, key: string) => {
  const searchRoot = root || document.body;
  searchRoot.querySelectorAll<HTMLElement>(`.${LEXICON_CLASS}`).forEach((element) => {
    if (element.dataset.lexiconMemoryKey === key) {
      element.classList.add('is-cooling');
    }
  });
};

const revealLexiconForMemory = (
  element: HTMLElement,
  root: HTMLElement | null,
  registerTimer?: (timerId: number) => void,
  unregisterTimer?: (timerId: number) => void
) => {
  const memoryKey = getLexiconMemoryKeyForElement(element);
  const now = Date.now();

  if (getLexiconCooldownUntil(memoryKey, now)) {
    element.classList.add('is-cooling');
    return false;
  }
  if (element.dataset.state === 'arabic' || element.dataset.revealing === 'true') return false;

  setLexiconCooldown(memoryKey, now);
  markMatchingLexiconTermsCooling(root, memoryKey);

  element.dataset.revealing = 'true';
  element.classList.add('is-revealing');
  element.classList.remove('is-cooling');
  setLexiconState(element, 'arabic');

  const timerId = window.setTimeout(() => {
    unregisterTimer?.(timerId);
    setLexiconState(element, 'french');
    element.dataset.revealing = 'false';
    element.classList.remove('is-revealing');
    element.classList.add('is-cooling');
  }, LEXICON_REVEAL_MS);
  registerTimer?.(timerId);

  return true;
};

const WORD_CHAR_RE = /[\p{L}\p{N}''-]/u;
const isWordChar = (char: string) => WORD_CHAR_RE.test(char);

const getCaretRangeFromPoint = (x: number, y: number): Range | null => {
  const docWithCaret = document as Document & {
    caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
    caretRangeFromPoint?: (x: number, y: number) => Range | null;
  };

  const position = docWithCaret.caretPositionFromPoint?.(x, y);
  if (position) {
    const range = document.createRange();
    range.setStart(position.offsetNode, position.offset);
    range.collapse(true);
    return range;
  }

  return docWithCaret.caretRangeFromPoint?.(x, y) || null;
};

const getWordRangeAtPoint = (x: number, y: number, root: HTMLElement | null) => {
  const caretRange = getCaretRangeFromPoint(x, y);
  if (!caretRange) return null;

  const node = caretRange.startContainer;
  if (node.nodeType !== Node.TEXT_NODE || !node.textContent) return null;
  if (root && !nodeIsInside(root, node)) return null;

  const text = node.textContent;
  let start = caretRange.startOffset;
  let end = caretRange.startOffset;

  if (start > 0 && !isWordChar(text[start] || '') && isWordChar(text[start - 1] || '')) {
    start -= 1;
    end -= 1;
  }

  while (start > 0 && isWordChar(text[start - 1] || '')) start -= 1;
  while (end < text.length && isWordChar(text[end] || '')) end += 1;

  const selectedText = text.slice(start, end).trim();
  if (!selectedText) return null;

  const wordRange = document.createRange();
  wordRange.setStart(node, start);
  wordRange.setEnd(node, end);
  return { range: wordRange, selectedText };
};

export const useMathInteraction = (
  containerRef: React.RefObject<HTMLElement | null>,
  onInteract?: () => void,
  enableLongPressHighlight = false
) => {
  const longPressTimerRef = useRef<number | null>(null);
  const lexiconTimersRef = useRef<Set<number>>(new Set());
  const longPressStartRef = useRef<{
    pointerId: number;
    x: number;
    y: number;
    target: Element;
  } | null>(null);
  const suppressDoubleClickUntilRef = useRef(0);

  const registerLexiconTimer = useCallback((timerId: number) => {
    lexiconTimersRef.current.add(timerId);
  }, []);

  const unregisterLexiconTimer = useCallback((timerId: number) => {
    lexiconTimersRef.current.delete(timerId);
  }, []);

  const cancelLongPress = useCallback(() => {
    if (longPressTimerRef.current !== null) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    longPressStartRef.current = null;
  }, []);

  useEffect(() => {
    const timers = lexiconTimersRef.current;
    return () => {
      cancelLongPress();
      timers.forEach((timerId) => window.clearTimeout(timerId));
      timers.clear();
    };
  }, [cancelLongPress]);

  const handleInteraction = useCallback((e: React.MouseEvent) => {
    if (Date.now() < suppressDoubleClickUntilRef.current) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }

    const target = getEventElement(e.target);
    if (!target) return;

    const root = containerRef.current;
    const lexiconTerm = findLexiconElementAtPoint(target, root, e.clientX, e.clientY);
    if (lexiconTerm) {
      e.preventDefault();
      const didReveal = revealLexiconForMemory(
        lexiconTerm,
        root,
        registerLexiconTimer,
        unregisterLexiconTimer
      );
      if (didReveal && onInteract) onInteract();
      return;
    }

    const blank = target.closest('.math-blank');
    if (blank && !blank.classList.contains('revealed')) {
      blank.classList.add('revealed');
      if (onInteract) onInteract();
    }
  }, [containerRef, onInteract, registerLexiconTimer, unregisterLexiconTimer]);

  const mergeAdjacentHighlights = useCallback(function merge(element: HTMLElement) {
    const highlights = element.querySelectorAll(`.${HIGHLIGHT_CLASS}`);

    highlights.forEach((hl) => {
      const nextNode = hl.nextSibling;

      if (nextNode && nextNode.nodeType === Node.TEXT_NODE && !nextNode.textContent?.trim()) {
        const nextHl = nextNode.nextSibling as HTMLElement;

        if (nextHl && nextHl.nodeType === Node.ELEMENT_NODE && nextHl.classList.contains(HIGHLIGHT_CLASS)) {
          const combinedText = (hl.textContent || '') + (nextNode.textContent || '') + (nextHl.textContent || '');
          hl.textContent = combinedText;

          if (nextNode.parentNode) nextNode.parentNode.removeChild(nextNode);
          if (nextHl.parentNode) nextHl.parentNode.removeChild(nextHl);

          merge(element);
        }
      }
    });
  }, []);

  const toggleHighlightAtPoint = useCallback((x: number, y: number, target: Element) => {
    const root = containerRef.current;
    if (!root || target.closest('mjx-container, .katex')) return false;

    const existingHighlight = target.closest(`.${HIGHLIGHT_CLASS}`) as HTMLElement | null;
    if (existingHighlight && root.contains(existingHighlight)) {
      const parent = existingHighlight.parentNode;
      if (parent) {
        const textNode = document.createTextNode(existingHighlight.textContent || '');
        parent.replaceChild(textNode, existingHighlight);
        parent.normalize();
      }
      window.getSelection()?.removeAllRanges();
      return true;
    }

    const word = getWordRangeAtPoint(x, y, root);
    if (!word) return false;

    const span = document.createElement('span');
    span.className = HIGHLIGHT_CLASS;
    span.textContent = word.selectedText;

    word.range.deleteContents();
    word.range.insertNode(span);

    window.getSelection()?.removeAllRanges();
    mergeAdjacentHighlights(root);
    return true;
  }, [containerRef, mergeAdjacentHighlights]);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (!enableLongPressHighlight) return;
    if (!e.isPrimary || (e.pointerType === 'mouse' && e.button !== 0)) return;

    const target = getEventElement(e.target);
    if (
      !target ||
      target.closest('button, a, input, textarea, select, [contenteditable="true"], .math-blank, mjx-container, .katex')
    ) {
      return;
    }

    cancelLongPress();
    longPressStartRef.current = {
      pointerId: e.pointerId,
      x: e.clientX,
      y: e.clientY,
      target,
    };

    longPressTimerRef.current = window.setTimeout(() => {
      const start = longPressStartRef.current;
      longPressTimerRef.current = null;
      if (!start) return;

      const didToggle = toggleHighlightAtPoint(start.x, start.y, start.target);
      longPressStartRef.current = null;
      if (!didToggle) return;

      suppressDoubleClickUntilRef.current = Date.now() + LONG_PRESS_EVENT_GUARD_MS;
      if (onInteract) onInteract();
    }, LONG_PRESS_MS);
  }, [cancelLongPress, enableLongPressHighlight, onInteract, toggleHighlightAtPoint]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    const start = longPressStartRef.current;
    if (!start || start.pointerId !== e.pointerId) return;

    const distance = Math.hypot(e.clientX - start.x, e.clientY - start.y);
    if (distance > LONG_PRESS_MOVE_TOLERANCE) cancelLongPress();
  }, [cancelLongPress]);

  const handlePointerEnd = useCallback((e: React.PointerEvent) => {
    const start = longPressStartRef.current;
    if (!start || start.pointerId === e.pointerId) cancelLongPress();
  }, [cancelLongPress]);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    if (longPressTimerRef.current !== null || Date.now() < suppressDoubleClickUntilRef.current) {
      e.preventDefault();
    }
  }, []);

  const handleDoubleClick = useCallback((e: React.MouseEvent) => {
    if (Date.now() >= suppressDoubleClickUntilRef.current) return;
    e.preventDefault();
    e.stopPropagation();
  }, []);

  return {
    handleInteraction,
    handleDoubleClick,
    handlePointerDown,
    handlePointerMove,
    handlePointerEnd,
    handleContextMenu,
    HIGHLIGHT_CLASS,
  };
};
