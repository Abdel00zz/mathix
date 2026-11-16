import type { CSSProperties } from 'react';
import { loadProfPersonalization } from '../components/ProfStudio/settings/personalization';

export type AnswerSpaceStyle = 'seyes' | 'slate' | 'grid' | 'dotted' | 'blank';
export type AnswerSpaceColor = 'white' | 'cream' | 'black' | 'green' | 'blue';

export type PrintLayout = {
  page: {
    orientation: 'portrait' | 'landscape';
    marginTop: number;
    marginSide: number;
    marginBottom: number;
    columns: 1 | 2;
    columnGap: number;
    columnRule: boolean;
  };
  type: {
    fontFamily: 'serif' | 'sans' | 'mixed';
    fontSize: number;
    lineHeight: number;
    titleScale: number;
  };
  color: {
    ink: string;
    accent: string;
    muted: string;
    rules: string;
    paper: 'white' | 'cream' | 'ivory' | 'gray';
  };
  header: {
    show: boolean;
    brand: string;
    caption: string;
    classLabel: string;
    yearLabel: string;
    kicker: string;
    title: string;
    frame: 'double' | 'rule' | 'plain';
  };
  footer: { show: boolean; professorName: string; note: string };
  content: {
    showCorrections: boolean;
    showAnswerSpaces: boolean;
    answerSpaceStyle: AnswerSpaceStyle;
    answerSpaceColor: AnswerSpaceColor;
    answerSpaceHeight: number;
    exercisePerPage: boolean;
    startIndex: number;
  };
};

export type PrintPreset = { id: string; name: string; layout: PrintLayout; builtin?: boolean };

const LAYOUT_KEY = 'mathplus:prof-print-layout';
const PRESETS_KEY = 'mathplus:prof-print-presets';

export const DEFAULT_PRINT_LAYOUT: PrintLayout = {
  page: { orientation: 'portrait', marginTop: 14, marginSide: 14, marginBottom: 18, columns: 1, columnGap: 8, columnRule: false },
  type: { fontFamily: 'mixed', fontSize: 10.2, lineHeight: 1.58, titleScale: 1 },
  color: { ink: '#111827', accent: '#0f172a', muted: '#64748b', rules: '#cbd5e1', paper: 'white' },
  header: { show: true, brand: 'monProf', caption: 'Excellence en Mathématiques', classLabel: '', yearLabel: '', kicker: 'Chapitre', title: '', frame: 'double' },
  footer: { show: true, professorName: 'Boudouh Abdelmalek', note: 'Bon courage' },
  content: { showCorrections: false, showAnswerSpaces: false, answerSpaceStyle: 'grid', answerSpaceColor: 'white', answerSpaceHeight: 24, exercisePerPage: false, startIndex: 0 },
};

const paperColors: Record<PrintLayout['color']['paper'], string> = {
  white: '#ffffff', cream: '#fdfaf3', ivory: '#fffef2', gray: '#f1f5f9',
};

const fonts: Record<PrintLayout['type']['fontFamily'], string> = {
  serif: '"Times New Roman", Georgia, serif',
  sans: 'var(--font-ui), Arial, sans-serif',
  mixed: '"Times New Roman", Georgia, serif',
};

export function printLayoutVars(layout: PrintLayout): CSSProperties {
  return {
    '--print-font-family': fonts[layout.type.fontFamily],
    '--print-font-size': `${layout.type.fontSize}pt`,
    '--print-line-height': layout.type.lineHeight,
    '--print-ink': layout.color.ink,
    '--print-muted': layout.color.muted,
    '--print-accent': layout.color.accent,
    '--print-rule': layout.color.rules,
    '--print-paper': paperColors[layout.color.paper],
    '--print-columns': layout.page.columns,
    '--print-column-gap': `${layout.page.columnGap}mm`,
    '--print-column-rule': layout.page.columnRule ? `0.45pt solid ${layout.color.rules}` : 'none',
    '--print-title-scale': layout.type.titleScale,
    '--print-image-max-w': layout.page.columns === 2 ? '72mm' : '78mm',
    '--print-image-max-h': '58mm',
    '--print-answer-height': `${layout.content.answerSpaceHeight}mm`,
  } as CSSProperties;
}

export function printPageCss(layout: PrintLayout): string {
  const orientation = layout.page.orientation === 'landscape' ? ' landscape' : '';
  return `@page { size: A4${orientation}; margin: ${layout.page.marginTop}mm ${layout.page.marginSide}mm ${layout.page.marginBottom}mm; }`;
}

/** Une séance commence en pleine largeur, indépendamment du dernier devoir. */
export function sessionPrintLayout(layout: PrintLayout, columns: 1 | 2 = 1): PrintLayout {
  return { ...layout, page: { ...layout.page, columns, columnRule: columns === 2 && layout.page.columnRule } };
}

export function pageBoxMm(layout: PrintLayout) {
  const width = layout.page.orientation === 'portrait' ? 210 : 297;
  const height = layout.page.orientation === 'portrait' ? 297 : 210;
  return {
    width,
    height,
    contentWidth: Math.max(0, width - layout.page.marginSide * 2),
    contentHeight: Math.max(0, height - layout.page.marginTop - layout.page.marginBottom),
  };
}

const clone = (layout: PrintLayout): PrintLayout => JSON.parse(JSON.stringify(layout)) as PrintLayout;
const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

function normalizeLayout(value: unknown, seed = DEFAULT_PRINT_LAYOUT): PrintLayout {
  if (!isRecord(value)) return clone(seed);
  const result = clone(seed);
  for (const section of ['page', 'type', 'color', 'header', 'footer', 'content'] as const) {
    if (isRecord(value[section])) Object.assign(result[section], value[section]);
  }
  const p = result.page;
  if (!['portrait', 'landscape'].includes(p.orientation)) p.orientation = seed.page.orientation;
  p.columns = p.columns === 2 ? 2 : 1;
  const t = result.type;
  if (!['serif', 'sans', 'mixed'].includes(t.fontFamily)) t.fontFamily = seed.type.fontFamily;
  if (!['white', 'cream', 'ivory', 'gray'].includes(result.color.paper)) result.color.paper = seed.color.paper;
  if (!['double', 'rule', 'plain'].includes(result.header.frame)) result.header.frame = seed.header.frame;
  if (!['seyes', 'slate', 'grid', 'dotted', 'blank'].includes(result.content.answerSpaceStyle)) result.content.answerSpaceStyle = seed.content.answerSpaceStyle;
  if (!['white', 'cream', 'black', 'green', 'blue'].includes(result.content.answerSpaceColor)) result.content.answerSpaceColor = seed.content.answerSpaceColor;
  return result;
}

function initialLayout(): PrintLayout {
  const layout = clone(DEFAULT_PRINT_LAYOUT);
  try {
    const exercise = loadProfPersonalization().exercise;
    layout.content.answerSpaceStyle = exercise.answerSpaceStyle;
    layout.content.answerSpaceColor = exercise.answerSpaceColor;
  } catch { /* defaults remain usable outside a browser */ }
  return layout;
}

export function loadPrintLayout(): PrintLayout {
  const fallback = initialLayout();
  try {
    const raw = localStorage.getItem(LAYOUT_KEY);
    return raw ? normalizeLayout(JSON.parse(raw), fallback) : fallback;
  } catch { return fallback; }
}

export function savePrintLayout(layout: PrintLayout): void {
  try { localStorage.setItem(LAYOUT_KEY, JSON.stringify(normalizeLayout(layout))); }
  catch { /* restricted storage: keep the current in-memory layout */ }
}

const preset = (id: string, name: string, patch: Partial<Record<keyof PrintLayout, Record<string, unknown>>>): PrintPreset => {
  const layout = clone(DEFAULT_PRINT_LAYOUT);
  for (const key of Object.keys(patch) as Array<keyof PrintLayout>) Object.assign(layout[key], patch[key]);
  return { id, name, layout, builtin: true };
};

export const BUILTIN_PRINT_PRESETS: PrintPreset[] = [
  preset('builtin-worksheet', "Fiche d'exercices", { content: { showAnswerSpaces: true } }),
  preset('builtin-test', 'Devoir surveillé', { header: { kicker: 'Devoir surveillé' }, footer: { note: '' }, content: { showAnswerSpaces: true, exercisePerPage: true } }),
  // Correction de devoir maison : l'en-tête reste celui du document (pleine
  // largeur, hors colonnes — voir `.print-exercises`), seul le contenu se
  // répartit sur 2 colonnes, filet central, corps légèrement resserré.
  preset('builtin-correction', 'Correction devoir maison', {
    content: { showCorrections: true },
    color: { accent: '#1d4ed8' },
    page: { columns: 2, columnGap: 8, columnRule: true },
    type: { fontSize: 9.6, lineHeight: 1.5 },
  }),
  preset('builtin-compact', 'Compact 2 colonnes', { page: { columns: 2, columnGap: 8, columnRule: true }, type: { fontSize: 9, lineHeight: 1.42 } }),
];

export function loadPrintPresets(): PrintPreset[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(PRESETS_KEY) || '[]') as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isRecord).map((item, index) => ({
      id: typeof item.id === 'string' ? item.id : `preset-${index}`,
      name: typeof item.name === 'string' ? item.name : `Préréglage ${index + 1}`,
      layout: normalizeLayout(item.layout),
    }));
  } catch { return []; }
}

export function savePrintPreset(name: string, layout: PrintLayout): PrintPreset {
  const entry: PrintPreset = { id: `preset-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, name: name.trim() || 'Sans titre', layout: normalizeLayout(layout) };
  try { localStorage.setItem(PRESETS_KEY, JSON.stringify([...loadPrintPresets(), entry])); }
  catch { /* restricted storage */ }
  return entry;
}

export function deletePrintPreset(id: string): void {
  try { localStorage.setItem(PRESETS_KEY, JSON.stringify(loadPrintPresets().filter(item => item.id !== id))); }
  catch { /* restricted storage */ }
}
