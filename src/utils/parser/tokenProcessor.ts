
/**
 * tokenProcessor.ts
 * Responsabilité : Traitement des tokens non-mathématiques (macros, formatage, espacement, sections)
 */

import { EXTENDED_TEXT_MACROS } from './dictionaries';
import { TEXT_MACROS } from '../../styles/mathTheme';
import { appendHighlightedText } from '../textProcessor';
import { ThemeConfig } from '../../styles/mathTheme';
import { createElement, MathNodeFactory, parseCommandContent, RenderCallback } from './shared';

/**
 * Traite une macro textuelle (\textbf{...}, \red{...}, etc.)
 */
export function processTextMacro(
  cmd: string,
  text: string,
  matchIndex: number,
  fullMatchLength: number,
  target: HTMLElement,
  themeConfig: ThemeConfig,
  createMathNode: MathNodeFactory,
  enableKeywords: boolean,
  renderSegment: RenderCallback,
  envCounter?: Map<string, number>
): number {
  const result = parseCommandContent(text, matchIndex + fullMatchLength - 1);

  if (result) {
    const { content: inner, endIndex } = result;
    const macroConfig = EXTENDED_TEXT_MACROS[cmd];

    if (cmd === 'qpart') {
      // Look-ahead: collect content until next \qpart or end of source
      const scanFrom = endIndex;
      const nextQpartIdx = text.indexOf('\\qpart{', scanFrom);
      const sectionEnd = nextQpartIdx === -1 ? text.length : nextQpartIdx;
      const sectionContent = text.slice(scanFrom, sectionEnd);

      // Build [circle badge] [answer content] flex row
      const section = createElement('div', 'qpart-section');
      const badge = createElement('span', 'qpart-badge');
      badge.textContent = inner;
      const contentDiv = createElement('div', 'qpart-content');
      renderSegment(sectionContent, contentDiv, themeConfig, createMathNode, enableKeywords, envCounter);
      section.appendChild(badge);
      section.appendChild(contentDiv);
      target.appendChild(section);
      return sectionEnd;
    }

    if (cmd === 'itemsize') {
      // Flex row: [SVG bullet] [content] — guaranteed vertical alignment
      const row = createElement('div', 'itemsize-block');
      const bullet = createElement('span', 'itemsize-bullet');
      const svgNS = 'http://www.w3.org/2000/svg';
      const bSvg = document.createElementNS(svgNS, 'svg') as SVGSVGElement;
      bSvg.setAttribute('viewBox', '0 0 16 16');
      bSvg.setAttribute('fill', 'currentColor');
      bSvg.setAttribute('aria-hidden', 'true');
      const bCircle = document.createElementNS(svgNS, 'circle') as SVGCircleElement;
      bCircle.setAttribute('cx', '8');
      bCircle.setAttribute('cy', '8');
      bCircle.setAttribute('r', '3');
      bSvg.appendChild(bCircle);
      bullet.appendChild(bSvg);
      const contentDiv = createElement('div', 'itemsize-content');
      renderSegment(inner, contentDiv, themeConfig, createMathNode, enableKeywords, envCounter);
      row.appendChild(bullet);
      row.appendChild(contentDiv);
      target.appendChild(row);
      return endIndex;
    }

    if (macroConfig) {
      const el = createElement(macroConfig.tag || 'span', macroConfig.className, macroConfig.attributes);
      
      // For blank macros used outside math mode, wrap content in $ to ensure math rendering
      let contentToRender = inner;
      if (['blank', 'blanck', 'balck'].includes(cmd)) {
        // Only wrap if it doesn't already have math delimiters
        if (!inner.includes('$') && !inner.includes('\\(') && !inner.includes('\\[')) {
          contentToRender = `$${inner}$`;
        }
      }

      if (cmd === 'question' || cmd === 'qst') {
        const body = createElement('div', 'math-question-body');
        renderSegment(contentToRender, body, themeConfig, createMathNode, enableKeywords, envCounter);
        el.appendChild(body);
        target.appendChild(el);
        return endIndex;
      }
      
      renderSegment(contentToRender, el, themeConfig, createMathNode, enableKeywords, envCounter);
      target.appendChild(el);
    } else {
      const fallback = TEXT_MACROS[cmd];
      if (fallback) {
        const span = createElement('span', fallback);
        renderSegment(inner, span, themeConfig, createMathNode, enableKeywords, envCounter);
        target.appendChild(span);
      } else {
        appendHighlightedText(target, inner, enableKeywords);
      }
    }
    return endIndex;
  }
  return -1;
}

/**
 * Traite le formatage inline (\\, **, __)
 */
export function processFormatting(
  fullMatch: string,
  target: HTMLElement,
  themeConfig: ThemeConfig,
  createMathNode: MathNodeFactory,
  enableKeywords: boolean,
  renderSegment: RenderCallback,
  envCounter?: Map<string, number>
): void {
  if (fullMatch.startsWith('\\\\')) {
    target.appendChild(document.createElement('br'));
  } else if (fullMatch.startsWith('**')) {
    const strong = createElement('strong', 'math-strong');
    renderSegment(fullMatch.slice(2, -2), strong, themeConfig, createMathNode, enableKeywords, envCounter);
    target.appendChild(strong);
  } else if (fullMatch.startsWith('__')) {
    const em = createElement('em', 'math-emphasis');
    renderSegment(fullMatch.slice(2, -2), em, themeConfig, createMathNode, enableKeywords, envCounter);
    target.appendChild(em);
  }
}

/**
 * Traite l'espacement LaTeX (\quad, \;, etc.)
 */
export function processSpacing(fullMatch: string, target: HTMLElement): void {
  let width = '1em';
  if (fullMatch.includes('qquad')) width = '2em';
  else if (fullMatch.includes(',') || fullMatch.includes(':')) width = '0.2em';
  else if (fullMatch.includes(';')) width = '0.3em';
  else if (fullMatch.includes('!')) width = '-0.1em';

  const space = createElement('span', 'math-space-inline');
  space.style.width = width;
  target.appendChild(space);
}

/**
 * Traite les commandes simples (\par, \step, \method, etc.)
 */
export function processSimpleCommand(fullMatch: string, target: HTMLElement): void {
  const commandMap: Record<string, { className: string; text?: string; isBlock?: boolean; height?: string }> = {
    '\\par': { className: 'math-space-block', height: '1.2em', isBlock: true },
    '\\smallskip': { className: 'math-space-block', height: '0.6em', isBlock: true },
    '\\medskip': { className: 'math-space-block', height: '1.2em', isBlock: true },
    '\\bigskip': { className: 'math-space-block', height: '2.4em', isBlock: true },
    '\\newline': { className: 'math-linebreak', isBlock: true },
    '\\indent': { className: 'math-indent' },
    '\\noindent': { className: 'math-noindent' },
    // Saut de colonne (Word : Mise en page › Sauts › Colonne) : le texte qui
    // suit repart en haut de la colonne suivante d'un `\begin{columns}`.
    '\\columnbreak': { className: 'math-column-break', isBlock: true },
    '\\method': { className: 'math-command-label math-command-label-method', text: 'Méthode :' },
    '\\analyze': { className: 'math-command-label', text: 'Analyse :' },
    '\\recall': { className: 'math-command-label math-command-label-muted', text: 'Rappel :' },
    '\\step': { className: 'math-command-label math-command-step', text: '•' },
    '\\tip': { className: 'math-command-label', text: 'Astuce :' },
    '\\warning': { className: 'math-command-label', text: 'Attention :' },
    '\\og': { className: 'math-inline-text', text: '« ' },
    '\\fg': { className: 'math-inline-text', text: ' »' },
    '\\fg{}': { className: 'math-inline-text', text: ' »' },
  };

  const config = commandMap[fullMatch];
  if (config) {
    if (fullMatch === '\\newline') {
        target.appendChild(document.createElement('br'));
    } else if (config.text) {
        const span = createElement('span', config.className);
        span.textContent = config.text;
        target.appendChild(span);
    } else if (config.isBlock) {
        const spacer = createElement('span', config.className);
        if (config.height) {
            spacer.style.height = config.height;
            spacer.style.minHeight = config.height;
            spacer.style.display = 'block';
        }
        target.appendChild(spacer);
    } else {
        const span = createElement('span', config.className);
        target.appendChild(span);
    }
  }
}

/**
 * Traite les sections (\section{...}, \subsection{...}, etc.)
 */
export function processSection(
  level: string,
  text: string,
  matchIndex: number,
  fullMatchLength: number,
  target: HTMLElement,
  themeConfig: ThemeConfig,
  createMathNode: MathNodeFactory,
  enableKeywords: boolean,
  renderSegment: RenderCallback,
  envCounter?: Map<string, number>
): number {
  const result = parseCommandContent(text, matchIndex + fullMatchLength - 1);
  if (result) {
    const { content: title, endIndex } = result;
    const levelMap: Record<string, string> = {
      section: 'math-section-heading math-section-heading-1',
      subsection: 'math-section-heading math-section-heading-2',
      subsubsection: 'math-section-heading math-section-heading-3',
      paragraph: 'math-section-heading math-section-heading-4',
    };

    const className = levelMap[level] || 'math-section-heading math-section-heading-5';
    const tag = level === 'section' ? 'h2' : level === 'subsection' ? 'h3' : level === 'subsubsection' ? 'h4' : level === 'paragraph' ? 'h5' : 'h6';
    
    const el = createElement(tag, className);
    renderSegment(title, el, themeConfig, createMathNode, enableKeywords, envCounter);
    target.appendChild(el);
    return endIndex;
  }
  return -1;
}

/**
 * Traite les références (\ref{...}, \cite{...}, etc.)
 */
export function processReference(
  refType: string,
  text: string,
  matchIndex: number,
  fullMatchLength: number,
  target: HTMLElement
): number {
  const result = parseCommandContent(text, matchIndex + fullMatchLength - 1);
  if (result) {
    const { content: refId, endIndex } = result;
    const config = EXTENDED_TEXT_MACROS[refType];
    
    if (config) {
      const el = createElement(config.tag || 'span', config.className);
      
      if (refType === 'ref' || refType === 'eqref') {
        el.textContent = refType === 'eqref' ? `(${refId})` : refId;
        el.setAttribute('data-ref', refId);
      } else if (refType === 'cite') {
        el.textContent = `[${refId}]`;
      } else if (refType === 'label') {
        el.setAttribute('id', refId);
      } else {
        el.textContent = refId;
      }
      target.appendChild(el);
    }
    return endIndex;
  }
  return -1;
}
