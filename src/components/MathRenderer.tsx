
import React, { useRef, useEffect, useCallback } from 'react';
import { THEME_LIGHT, FONT_SIZES, renderSegment } from '../utils/mathParser';
import { repairLineBreakBrackets } from '../utils/parser/latexNormalize';
import { LIST_START_KEY } from '../utils/parser/listMarkers';
import { katexService } from '../services/katexService';
import { useMathInteraction } from '../hooks/useMathInteraction';
import { useLexiconHighlighter } from '../hooks/useLexiconHighlighter';
import { useRevisionLexicon } from './Revision/RevisionLexicon';
import { decorateMathQuestionMarks } from '../utils/mathQuestionMarks';

// ============================================================================
// MATHFLOW RENDERING COMPONENT
// ============================================================================
// Bridge entre les données (LaTeX) et le visuel (DOM).
// Utilise maintenant des services découplés pour la logique métier.
// ============================================================================

interface MathRendererProps {
  content: string;
  className?: string;
  inline?: boolean;
  fontSize?: 'sm' | 'base' | 'lg' | 'xl' | 'inherit';
  useMathTypography?: boolean;
  enableKeywords?: boolean;
  enableLexicon?: boolean;
  enableLongPressHighlight?: boolean;
  onInteract?: () => void;
  /**
   * Numéro de reprise de la première liste ordonnée du contenu.
   * Une liste coupée en deux par une figure garde ainsi sa numérotation
   * (la seconde moitié continue `3.`, `4.`… au lieu de repartir à `1.`).
   */
  listStart?: number;
}

const MathRenderer: React.FC<MathRendererProps> = ({
  content = "",
  className = "",
  inline = false,
  fontSize = 'base',
  useMathTypography = true,
  enableKeywords = false,
  enableLexicon = true,
  enableLongPressHighlight = false,
  onInteract,
  listStart = 0
}) => {
  const containerRef = useRef<HTMLElement>(null);
  const revisionLexicon = useRevisionLexicon();

  // Utilisation du hook personnalisé pour les interactions
  const {
    handleInteraction,
    handleDoubleClick,
    handlePointerDown,
    handlePointerMove,
    handlePointerEnd,
    handleContextMenu,
  } = useMathInteraction(containerRef, onInteract, enableLongPressHighlight);
  const highlightLexiconTerms = useLexiconHighlighter(revisionLexicon.entries);

  // Thème clair unique : le rendu math n'a plus de variante sombre.
  const themeConfig = THEME_LIGHT;

  // IMPORTANT: Si fontSize="inherit", on ne force AUCUNE taille - le parent contrôle tout
  const shouldInherit = fontSize === 'inherit';
  const effectiveFontSize = inline ? fontSize : (fontSize === 'base' ? 'sm' : fontSize);
  const fontSizeClass = shouldInherit
    ? ''
    : (effectiveFontSize === 'inherit' ? '' : (FONT_SIZES[effectiveFontSize as keyof typeof FONT_SIZES] || FONT_SIZES.base));

  // Si inherit, on n'applique pas non plus la couleur du thème
  const textColorClass = shouldInherit ? '' : themeConfig.text;

  // --- HTML Generator pour le Parser ---
  const createMathNode = useCallback((tex: string, displayMode: boolean): HTMLElement => {
    const wrapper = document.createElement(displayMode ? 'div' : 'span');

    if (displayMode) {
      wrapper.className = 'math-display-node';
    } else {
      wrapper.className = 'math-inline-node';
    }

    const delimiterStart = displayMode ? '$$ \\def\\arraystretch{1.2} ' : '\\( \\def\\arraystretch{1.2} ';
    const delimiterEnd = displayMode ? '$$' : '\\)';

    // Une ligne de tableau qui commence par un intervalle (`\\[0,1] & …`) serait
    // lue par KaTeX comme un espacement de ligne (« Invalid size ») : le tableau
    // entier s'afficherait en rouge. On insère la parade LaTeX `\\ {}[0,1]`.
    wrapper.textContent = `${delimiterStart}${repairLineBreakBrackets(tex)}${delimiterEnd}`;
    return wrapper;
  }, []);

  const fitDisplayMath = useCallback((root: HTMLElement) => {
    const displays = Array.from(root.querySelectorAll<HTMLElement>('.math-display-node'));

    displays.forEach((display) => {
      const katex = display.querySelector<HTMLElement>('.katex-display > .katex');
      const displayBox = display.querySelector<HTMLElement>('.katex-display');
      if (!katex || !displayBox) return;

      requestAnimationFrame(() => {
        const parentWidth = Math.max(0, root.clientWidth || display.parentElement?.clientWidth || display.clientWidth);
        if (!parentWidth) return;

        const styles = window.getComputedStyle(displayBox);
        const horizontalPadding =
          Number.parseFloat(styles.paddingLeft || '0') +
          Number.parseFloat(styles.paddingRight || '0');
        const availableWidth = Math.max(180, parentWidth - horizontalPadding - 8);
        const formulaWidth = katex.scrollWidth;

        if (formulaWidth <= availableWidth) return;

        const katexStyle = window.getComputedStyle(katex);
        const displayStyle = window.getComputedStyle(displayBox);
        const katexFontSize = Number.parseFloat(katexStyle.fontSize || '0');
        const parentFontSize = Number.parseFloat(displayStyle.fontSize || '0') || katexFontSize || 16;
        const baseEm = katexFontSize > 0 ? katexFontSize / parentFontSize : 1;
        const scale = Math.max(0.74, Math.min(1, availableWidth / formulaWidth));
        const nextEm = Math.round(Math.max(0.74, baseEm * scale) * 1000) / 1000;

        if (Math.abs(nextEm - baseEm) > 0.01) {
          katex.style.fontSize = `${nextEm}em`;
        }
        if (!displayBox.classList.contains('math-display-fitted')) {
          displayBox.classList.add('math-display-fitted');
        }
      });
    });
  }, []);

  const alignListMarkers = useCallback((root: HTMLElement) => {
    const formatPx = (value: number) => `${Math.round(value * 2) / 2}px`;
    const setStyleVar = (element: HTMLElement, name: string, value: string) => {
      if (element.style.getPropertyValue(name) !== value) {
        element.style.setProperty(name, value);
      }
    };
    const clearStyleVar = (element: HTMLElement, name: string) => {
      if (element.style.getPropertyValue(name)) {
        element.style.removeProperty(name);
      }
    };
    const clearStyleVars = (element: HTMLElement, names: string[]) => {
      names.forEach((name) => clearStyleVar(element, name));
    };
    const displayMarkerVars = ['--rev-list-display-marker-line', '--rev-list-display-marker-offset'];
    const orderedMarkerVars = ['--rev-list-ordered-marker-line', '--rev-list-ordered-marker-offset'];
    const unorderedMarkerVars = ['--rev-list-marker-line', '--rev-list-marker-offset'];

    const firstUsableRect = (node: Node) => {
      if (node instanceof HTMLElement) {
        const style = window.getComputedStyle(node);
        if (
          style.display === 'none' ||
          style.visibility === 'hidden' ||
          node.classList.contains('math-space-block') ||
          node.classList.contains('math-display-node') ||
          node.classList.contains('katex-display') ||
          node.classList.contains('math-list')
        ) {
          return null;
        }

        return Array.from(node.getClientRects()).find((rect) => rect.width > 0 && rect.height > 4) ?? null;
      }

      if (node.nodeType === Node.TEXT_NODE && node.textContent?.trim()) {
        const range = document.createRange();
        range.selectNodeContents(node);
        const rect = Array.from(range.getClientRects()).find((entry) => entry.width > 0 && entry.height > 4) ?? null;
        range.detach();
        return rect;
      }

      return null;
    };

    const findFirstLineAnchor = (text: HTMLElement) => {
      const walker = document.createTreeWalker(
        text,
        NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT,
        {
          acceptNode: (node) => {
            if (node instanceof HTMLElement) {
              if (
                node.classList.contains('math-display-node') ||
                node.classList.contains('katex-display') ||
                node.classList.contains('math-space-block') ||
                node.classList.contains('math-list')
              ) {
                return NodeFilter.FILTER_REJECT;
              }
            }
            if (node.nodeType === Node.TEXT_NODE && !node.textContent?.trim()) {
              return NodeFilter.FILTER_REJECT;
            }
            return NodeFilter.FILTER_ACCEPT;
          },
        }
      );

      let current = walker.nextNode();
      while (current) {
        const rect = firstUsableRect(current);
        if (rect) return rect;
        current = walker.nextNode();
      }

      return null;
    };

    const findFormulaAnchor = (text: HTMLElement) => {
      const displays = Array.from(text.querySelectorAll<HTMLElement>('.math-display-node'));
      if (!displays.length) return null;

      const textRect = text.getBoundingClientRect();
      const textStyle = window.getComputedStyle(text);
      const fontSize = Number.parseFloat(textStyle.fontSize || '0') || 16;
      const lineHeight = Number.parseFloat(textStyle.lineHeight || '0') || fontSize * 1.7;

      for (const display of displays) {
        const displayBox = display.querySelector<HTMLElement>('.katex-display') ?? display;
        const formulaRect = displayBox.getBoundingClientRect();
        if (!formulaRect.height) continue;

        const topDelta = formulaRect.top - textRect.top;
        const startsNearTop = topDelta <= lineHeight * 1.35;
        const isDominantFirstBlock = formulaRect.height >= lineHeight * 1.18;

        if (startsNearTop && isDominantFirstBlock) {
          return displayBox;
        }
      }

      return null;
    };

    const directChild = (element: HTMLElement, className: string) => (
      Array.from(element.children).find((child) =>
        child instanceof HTMLElement && child.classList.contains(className)
      ) as HTMLElement | undefined
    );

    const markerTargets = [
      ...Array.from(root.querySelectorAll<HTMLElement>('.math-list > .math-list-item')).map((item) => {
        const marker = directChild(item, 'math-list-marker');
        return {
          item,
          marker,
          text: directChild(item, 'math-list-text'),
          isOrdered: Boolean(marker?.classList.contains('math-list-marker-ordered')),
          displayStartClass: 'math-list-item-display-start',
        };
      }),
      ...Array.from(root.querySelectorAll<HTMLElement>('.itemsize-block')).map((item) => ({
        item,
        marker: directChild(item, 'itemsize-bullet'),
        text: directChild(item, 'itemsize-content'),
        isOrdered: false,
        displayStartClass: 'itemsize-block-display-start',
      })),
    ];

    markerTargets.forEach(({ item, marker, text, isOrdered, displayStartClass }) => {
      if (!marker || !text) return;

      requestAnimationFrame(() => {
        const displayBox = findFormulaAnchor(text);
        const itemRect = item.getBoundingClientRect();
        if (!itemRect.height) return;

        if (displayBox) {
          const formulaRect = displayBox.getBoundingClientRect();
          if (!formulaRect.height) return;

          item.classList.add(displayStartClass);
          clearStyleVars(marker, [...orderedMarkerVars, ...unorderedMarkerVars]);
          setStyleVar(marker, '--rev-list-display-marker-line', formatPx(Math.max(30, formulaRect.height)));
          setStyleVar(marker, '--rev-list-display-marker-offset', formatPx(Math.max(0, formulaRect.top - itemRect.top)));
          return;
        }

        const firstLineRect = findFirstLineAnchor(text);
        if (!firstLineRect) {
          item.classList.remove(displayStartClass);
          clearStyleVars(marker, [...displayMarkerVars, ...orderedMarkerVars, ...unorderedMarkerVars]);
          return;
        }

        const textStyle = window.getComputedStyle(text);
        const fontSize = Number.parseFloat(textStyle.fontSize || '0') || 16;
        const lineHeight = Number.parseFloat(textStyle.lineHeight || '0') || fontSize * 1.7;
        const markerLine = Math.max(lineHeight, Math.min(firstLineRect.height, lineHeight * 1.8));
        const markerOffset = Math.max(0, firstLineRect.top - itemRect.top);
        const lineIsTall = firstLineRect.height > lineHeight * 1.18;
        const offsetIsStructural = markerOffset > lineHeight * 0.55;
        const needsDynamicMarker = lineIsTall || offsetIsStructural;

        item.classList.remove(displayStartClass);
        clearStyleVars(marker, displayMarkerVars);
        if (!needsDynamicMarker) {
          clearStyleVars(marker, [...orderedMarkerVars, ...unorderedMarkerVars]);
          return;
        }
        if (isOrdered) {
          clearStyleVars(marker, unorderedMarkerVars);
          setStyleVar(marker, '--rev-list-ordered-marker-line', formatPx(markerLine));
          setStyleVar(marker, '--rev-list-ordered-marker-offset', formatPx(markerOffset));
        } else {
          clearStyleVars(marker, orderedMarkerVars);
          setStyleVar(marker, '--rev-list-marker-line', formatPx(markerLine));
          setStyleVar(marker, '--rev-list-marker-offset', formatPx(markerOffset));
        }
      });
    });
  }, []);

  const layoutMathContent = useCallback((root: HTMLElement) => {
    fitDisplayMath(root);
    alignListMarkers(root);
  }, [alignListMarkers, fitDisplayMath]);

  // --- Rendering Pipeline ---
  useEffect(() => {
    const root = containerRef.current;
    if (!root) return;

    root.innerHTML = '';
    try {
      // 1. Parsing du texte vers le DOM
      const counter = new Map<string, number>();
      if (listStart) counter.set(LIST_START_KEY, listStart);
      renderSegment(content, root, themeConfig, createMathNode, enableKeywords, counter);
      decorateMathQuestionMarks(root);
    } catch (e) {
      console.error("MathRenderer parsing error", e);
      root.textContent = content;
    }

    let isCancelled = false;

    // 2. Typesetting KaTeX via le service, puis enrichissement lexique du texte restant
    void (async () => {
      try {
        await katexService.typeset(root);
      } catch (error) {
        console.error('MathRenderer KaTeX error', error);
      }

      if (isCancelled) return;
      if (enableLexicon) {
        highlightLexiconTerms(root);
      }
      layoutMathContent(root);
    })();

    let resizeFrame = 0;
    const observer = typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(() => {
          cancelAnimationFrame(resizeFrame);
          resizeFrame = requestAnimationFrame(() => layoutMathContent(root));
        })
      : null;

    observer?.observe(root);

    return () => {
      isCancelled = true;
      cancelAnimationFrame(resizeFrame);
      observer?.disconnect();
    };
  }, [content, listStart, themeConfig, createMathNode, enableKeywords, enableLexicon, highlightLexiconTerms, layoutMathContent]);

  const Component = inline ? 'span' : 'div';

  // Classes de base minimales - le reste est contrôlé par className ou héritage
  const baseClasses = shouldInherit
    ? 'math-renderer math-renderer-inherit' // Classe spéciale pour l'héritage total
    : `math-renderer ${fontSizeClass} ${textColorClass}`;
  const sharedTextClasses = `math-renderer-flow text-rendering-optimize${enableLongPressHighlight ? ' math-long-press-highlight' : ''}`;

  return (
    <Component
      ref={containerRef as any}
      onDoubleClick={handleDoubleClick}
      onClick={handleInteraction}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerEnd}
      onPointerCancel={handlePointerEnd}
      onPointerLeave={handlePointerEnd}
      onContextMenu={handleContextMenu}
      className={`${baseClasses} ${useMathTypography ? 'typo-math' : ''} ${className} ${sharedTextClasses}`}
    />
  );
};


export default React.memo(MathRenderer);
