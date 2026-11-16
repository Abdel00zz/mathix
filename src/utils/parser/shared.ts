import { ThemeConfig } from '../../styles/mathTheme';
import { tryRenderTkzTab } from './tkzTab';

export type MathNodeFactory = (tex: string, display: boolean) => HTMLElement;

export interface ParsedCommand {
  content: string;
  endIndex: number;
}

export interface MacroConfig {
  className: string;
  tag?: keyof HTMLElementTagNameMap;
  attributes?: Record<string, string>;
  wrapQuotes?: boolean;
}

export type RenderCallback = (
  text: string,
  target: HTMLElement,
  config: ThemeConfig,
  createMath: MathNodeFactory,
  keywords: boolean,
  counter?: Map<string, number>
) => void;

export const createElement = <K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  attributes?: Record<string, string>
): HTMLElementTagNameMap[K] => {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (attributes) {
    Object.entries(attributes).forEach(([key, value]) => {
      el.setAttribute(key, value);
    });
  }
  return el;
};

export const parseCommandContent = (text: string, startIndex: number): ParsedCommand | null => {
  if (text[startIndex] !== '{') return null;
  let depth = 0;
  for (let i = startIndex; i < text.length; i++) {
    const char = text[i];
    if (char === '{') depth++;
    else if (char === '}') depth--;

    if (depth === 0) {
      return { content: text.slice(startIndex + 1, i), endIndex: i + 1 };
    }
  }
  return null;
};

export function renderDisplayMath(
  mathContent: string,
  createMathNode: MathNodeFactory,
  target: HTMLElement
): void {
  const wrapper = createElement(
    'div',
    'math-display-shell'
  );

  // Tableaux de signes / variations : rendu dédié « tkz-tab » (qualité LaTeX).
  const tkz = tryRenderTkzTab(mathContent, createMathNode);
  if (tkz) {
    wrapper.classList.add('math-display-shell--tkz');
    wrapper.appendChild(tkz);
    target.appendChild(wrapper);
    return;
  }

  const mathEl = createMathNode(mathContent, true);
  mathEl.classList.add('math-display-rendered');
  wrapper.appendChild(mathEl);
  target.appendChild(wrapper);
}

export function renderInlineMath(
  mathContent: string,
  createMathNode: MathNodeFactory,
  target: HTMLElement,
  mathTextClass: string
): void {
  const mathEl = createMathNode(mathContent, false);
  mathEl.classList.add(mathTextClass, 'math-inline-rendered');
  target.appendChild(mathEl);
}
