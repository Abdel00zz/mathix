
import { ThemeConfig, ENV_STYLES, ENV_LABELS, BLOCK_TITLE_CLS } from '../../styles/mathTheme';
import { createElement, MathNodeFactory, RenderCallback } from './shared';
import { orderedMarkerLabel, takeListStart, LIST_DEPTH_KEY } from './listMarkers';

// Extraction des segments basés sur une commande spécifique (ex: \column)
const splitByCommand = (content: string, commandName: string): string[] => {
  const items: string[] = [];
  let current = '';
  let depth = 0;
  // Regex dynamique pour la commande spécifique tout en respectant les blocs imbriqués
  const regex = new RegExp(`(\\\\${commandName})(?![a-zA-Z])|(\\\\begin\\{[^}]+\\})|(\\\\end\\{[^}]+\\})`, 'g');
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(content)) !== null) {
    current += content.slice(lastIndex, match.index);
    const token = match[0];
    if (token.startsWith(`\\${commandName}`)) {
      if (depth === 0) {
        if (current.trim()) items.push(current.trim());
        current = '';
      } else {
        current += token;
      }
    } else if (token.startsWith('\\begin')) {
      depth++;
      current += token;
    } else if (token.startsWith('\\end')) {
      if (depth > 0) depth--;
      current += token;
    }
    lastIndex = regex.lastIndex;
  }
  current += content.slice(lastIndex);
  if (current.trim()) items.push(current.trim());
  return items;
};

// Extraction des items d'une liste LaTeX
const splitListContent = (content: string): string[] => {
  return splitByCommand(content, 'item');
};

// Rendu des environnements sémantiques (définitions, théorèmes...)
export const renderSemanticEnv = (
  type: string,
  title: string | undefined,
  content: string,
  target: HTMLElement,
  config: ThemeConfig,
  createMath: MathNodeFactory,
  keywords: boolean,
  renderSegment: RenderCallback,
  counter?: Map<string, number>
) => {
  const typeKey = type;
  const style = ENV_STYLES[typeKey];
  if (!style) {
    const fallbackDiv = createElement('div', 'math-env-fallback-card');
    renderSegment(content, fallbackDiv, config, createMath, keywords, counter);
    target.appendChild(fallbackDiv);
    return;
  }

  let number: number | undefined;
  if (counter && ['definition', 'theorem', 'proposition', 'lemma', 'corollary', 'property', 'application', 'example', 'exploration', 'exercise', 'method', 'formula', 'algorithm', 'technique', 'warning', 'proof'].includes(typeKey)) {
    const currentCount = counter.get(typeKey) || 0;
    number = currentCount + 1;
    counter.set(typeKey, number);
  }

  const container = createElement('div', style.containerClass.replace('my-8', 'my-4'));
  
  // Injection de l'ID sémantique pour le graphe de connaissance
  if (number) {
    container.setAttribute('data-uid', `${typeKey}-${number}`);
  }

  const label = ENV_LABELS[typeKey] || typeKey.toUpperCase();
  
  const headerHTML = style.headerHTML(label, number);
  if (headerHTML || title) {
    const headerDiv = createElement('div', style.headerClass);
    const tempDiv = createElement('div');
    tempDiv.innerHTML = headerHTML;
    const wrapper = tempDiv.firstElementChild as HTMLElement;
    
    if (wrapper && title) {
        const titleSpan = createElement('span', BLOCK_TITLE_CLS);
        renderSegment(title, titleSpan, config, createMath, keywords, counter);
        wrapper.appendChild(titleSpan);
        headerDiv.appendChild(wrapper);
    } else if (wrapper) {
        headerDiv.appendChild(wrapper);
    } else {
        headerDiv.innerHTML = headerHTML;
    }
    container.appendChild(headerDiv);
  }

  const contentDiv = createElement('div', style.contentClass);
  renderSegment(content, contentDiv, config, createMath, keywords, counter);
  container.appendChild(contentDiv);

  if (style.footerHTML) {
    const footerDiv = createElement('div');
    footerDiv.innerHTML = style.footerHTML();
    container.appendChild(footerDiv);
  }

  target.appendChild(container);
};

// Rendu des listes
const renderList = (
  type: string,
  content: string,
  target: HTMLElement,
  config: ThemeConfig,
  createMath: MathNodeFactory,
  keywords: boolean,
  renderSegment: RenderCallback,
  counter?: Map<string, number>
) => {
  const isOrdered = type === 'enumerate';
  // Semantic classes only; revision list CSS owns the visual styling.
  const listEl = createElement(
    isOrdered ? 'ol' : 'ul',
    `math-list ${isOrdered ? 'math-list-ordered' : 'math-list-unordered'}`
  );
  const items = splitListContent(content);

  // Profondeur d'imbrication transportée par la carte de compteurs partagée :
  // liste principale = `1.`, sous-liste = `a.`, au-delà = `i.`.
  const depth = counter?.get(LIST_DEPTH_KEY) ?? 0;
  if (counter) counter.set(LIST_DEPTH_KEY, depth + 1);

  // Une liste coupée par une figure reprend à son numéro : le décalage ne
  // concerne que la liste principale (profondeur 0) et une seule fois.
  const startOffset = depth === 0 ? takeListStart(counter) : 0;

  items.forEach((itemText, index) => {
    const li = createElement('li', 'math-list-item');
    const markerWrapper = createElement(
      'span',
      `math-list-marker ${isOrdered ? 'math-list-marker-ordered' : 'math-list-marker-unordered'}`
    );
    if (isOrdered) {
      markerWrapper.textContent = orderedMarkerLabel(index + startOffset, depth);
    } else {
      const svgNS = 'http://www.w3.org/2000/svg';
      const mSvg = document.createElementNS(svgNS, 'svg') as SVGSVGElement;
      mSvg.setAttribute('viewBox', '0 0 16 16');
      mSvg.setAttribute('fill', 'currentColor');
      mSvg.setAttribute('aria-hidden', 'true');
      const mCircle = document.createElementNS(svgNS, 'circle') as SVGCircleElement;
      mCircle.setAttribute('cx', '8');
      mCircle.setAttribute('cy', '8');
      mCircle.setAttribute('r', '3');
      mSvg.appendChild(mCircle);
      markerWrapper.appendChild(mSvg);
    }
    const textSpan = createElement('div', 'math-list-text');
    renderSegment(itemText.trim(), textSpan, config, createMath, keywords, counter);
    const firstContentNode = Array.from(textSpan.childNodes).find((node) => (
      node.nodeType === 1 || Boolean(node.textContent?.trim())
    ));
    const firstElement = firstContentNode?.nodeType === 1 ? firstContentNode as HTMLElement : null;
    const startsWithDisplayMath = firstElement?.classList.contains('math-display-node') ?? false;

    if (isOrdered && startsWithDisplayMath) {
      li.classList.add('math-list-item-display-start');
    }
    if (isOrdered && textSpan.querySelector('.math-display-node')) {
      li.classList.add('math-list-item-has-display');
    }

    li.append(markerWrapper, textSpan);
    listEl.appendChild(li);
  });

  // La profondeur est restaurée : la liste suivante du même bloc repart à zéro.
  if (counter) counter.set(LIST_DEPTH_KEY, depth);
  target.appendChild(listEl);
};

const MAX_FLOW_COLUMNS = 4;
const COLUMN_GAP_RE = /^(\d+(?:\.\d+)?)(px|mm|cm|pt|em|rem)$/i;

interface ColumnsOptions {
  /** Nombre de colonnes du mode flux (2 par défaut). */
  count?: number;
  /** Filet vertical entre les colonnes. */
  rule: boolean;
  /** Gouttière (longueur CSS validée). */
  gap?: string;
  /** Contenu débarrassé de l'en-tête `[…]`. */
  body: string;
}

/**
 * Options facultatives : `\begin{columns}[3, rule, gap=8mm]`.
 * L'en-tête n'est consommé que si TOUS ses éléments sont reconnus ; sinon il
 * reste du contenu (un `[a;b]` en tête de texte n'est jamais avalé).
 */
export const parseColumnsOptions = (content: string): ColumnsOptions => {
  const none: ColumnsOptions = { rule: false, body: content };
  const head = content.match(/^\s*\[([^\]\n]{1,60})\]/);
  if (!head) return none;

  const parsed: ColumnsOptions = { rule: false, body: content.slice(head[0].length) };
  for (const raw of head[1].split(',')) {
    const token = raw.trim().toLowerCase();
    const gap = token.match(/^gap\s*=\s*(.+)$/);
    if (/^\d$/.test(token) && Number(token) >= 1) parsed.count = Math.min(Number(token), MAX_FLOW_COLUMNS);
    else if (['rule', 'trait', 'filet', 'separator'].includes(token)) parsed.rule = true;
    else if (gap && COLUMN_GAP_RE.test(gap[1].trim())) parsed.gap = gap[1].trim();
    else return none;
  }
  return parsed;
};

// Rendu des colonnes
const renderColumns = (
  rawContent: string,
  target: HTMLElement,
  config: ThemeConfig,
  createMath: MathNodeFactory,
  keywords: boolean,
  renderSegment: RenderCallback,
  counter?: Map<string, number>
) => {
  const options = parseColumnsOptions(rawContent);
  const content = options.body;
  const cols = splitByCommand(content, 'column').map(colContent => colContent.trim()).filter(Boolean);

  // Deux usages, calqués sur LaTeX :
  //  • séparateurs `\column{…}` explicites → colonnes flexibles indépendantes ;
  //  • aucun séparateur → conteneur « flux » (type `multicols`) : le contenu
  //    interne, typiquement un `\begin{enumerate}` de questions, se répartit
  //    seul sur les colonnes sans casser la numérotation ni la sémantique de
  //    liste — c'est le cas visé par les exercices à plusieurs questions.
  const container = createElement('div', 'math-columns');
  if (options.rule) container.dataset.rule = 'true';
  if (options.gap) container.style.setProperty('--math-columns-gap', options.gap);

  if (cols.length <= 1) {
    container.classList.add('math-columns-flow');
    if (options.count) container.style.setProperty('--math-columns', String(options.count));
    renderSegment(content, container, config, createMath, keywords, counter);
    target.appendChild(container);
    return;
  }

  // Le nombre est exposé au CSS : 2–3 colonnes côte à côte, 4 et plus en
  // grille implicite de deux colonnes par ligne (cf. revision-math-renderer.css).
  container.dataset.columns = String(cols.length);

  cols.forEach(colContent => {
    const colDiv = createElement('div', 'math-column');
    renderSegment(colContent, colDiv, config, createMath, keywords, counter);
    container.appendChild(colDiv);
  });

  target.appendChild(container);
};

const renderPolynomialLongDivision = (
  content: string,
  target: HTMLElement,
  config: ThemeConfig,
  createMath: MathNodeFactory,
  keywords: boolean,
  renderSegment: RenderCallback,
  counter?: Map<string, number>
) => {
  const parts = splitByCommand(content, 'column').map((part) => part.trim()).filter(Boolean);

  if (parts.length < 3) {
    const fallback = createElement('div', 'math-env-fallback');
    renderSegment(content, fallback, config, createMath, keywords, counter);
    target.appendChild(fallback);
    return;
  }

  const [dividend, divisor, quotient, ...steps] = parts;
  const wrapper = createElement('div', 'poly-longdiv-shell');
  const board = createElement('div', 'poly-longdiv');
  const left = createElement('div', 'poly-longdiv-left');
  const right = createElement('div', 'poly-longdiv-right');

  const dividendRow = createElement('div', 'poly-longdiv-row poly-longdiv-dividend');
  renderSegment(dividend, dividendRow, config, createMath, keywords, counter);
  left.appendChild(dividendRow);

  steps.forEach((step, index) => {
    const isNegativeLead = /^-/.test(step.replace(/\s+/g, ''));
    const row = createElement(
      'div',
      `poly-longdiv-row${isNegativeLead ? ' poly-longdiv-subtract' : ''}${index === steps.length - 1 ? ' poly-longdiv-final' : ''}`
    );
    renderSegment(step, row, config, createMath, keywords, counter);
    left.appendChild(row);
  });

  const divisorRow = createElement('div', 'poly-longdiv-side poly-longdiv-divisor');
  renderSegment(divisor, divisorRow, config, createMath, keywords, counter);

  const quotientRow = createElement('div', 'poly-longdiv-side poly-longdiv-quotient');
  renderSegment(quotient, quotientRow, config, createMath, keywords, counter);

  right.append(divisorRow, quotientRow);
  board.append(left, right);
  wrapper.appendChild(board);
  target.appendChild(wrapper);
};

// Rendu des environnements structurels
export const renderStructuralEnv = (
  type: string,
  content: string,
  target: HTMLElement,
  config: ThemeConfig,
  createMath: MathNodeFactory,
  keywords: boolean,
  renderSegment: RenderCallback,
  counter?: Map<string, number>
) => {
  switch (type) {
    case 'itemize':
    case 'enumerate':
      renderList(type, content, target, config, createMath, keywords, renderSegment, counter);
      break;
    case 'columns':
    case 'colonnes':
      renderColumns(content, target, config, createMath, keywords, renderSegment, counter);
      break;
    case 'polylongdiv':
      renderPolynomialLongDivision(content, target, config, createMath, keywords, renderSegment, counter);
      break;
    case 'center': {
      const centerDiv = createElement('div', 'math-env-center');
      renderSegment(content, centerDiv, config, createMath, keywords, counter);
      target.appendChild(centerDiv);
      break;
    }
    case 'verbatim': {
      const pre = createElement('pre', 'math-env-code');
      pre.textContent = content.trim();
      target.appendChild(pre);
      break;
    }
    case 'quote': {
      const quote = createElement('blockquote', 'math-env-quote');
      renderSegment(content, quote, config, createMath, keywords, counter);
      target.appendChild(quote);
      break;
    }
    case 'flushleft': {
      const leftDiv = createElement('div', 'math-env-left');
      renderSegment(content, leftDiv, config, createMath, keywords, counter);
      target.appendChild(leftDiv);
      break;
    }
    case 'flushright': {
      const rightDiv = createElement('div', 'math-env-right');
      renderSegment(content, rightDiv, config, createMath, keywords, counter);
      target.appendChild(rightDiv);
      break;
    }
    case 'align':
    case 'align*': {
      const alignWrapper = createElement('div', 'math-env-display math-env-align');
      const alignContent = `\\begin{${type}}${content}\\end{${type}}`;
      const alignEl = createMath(alignContent, true);
      alignEl.classList.add('math-env-display-content');
      alignWrapper.appendChild(alignEl);
      target.appendChild(alignWrapper);
      break;
    }
    default: {
      const mathWrapper = createElement('div', 'math-env-display');
      const mathContent = `\\begin{${type}}${content}\\end{${type}}`;
      const mathEl = createMath(mathContent, true);
      mathEl.classList.add('math-env-display-content');
      mathWrapper.appendChild(mathEl);
      target.appendChild(mathWrapper);
    }
  }
};
