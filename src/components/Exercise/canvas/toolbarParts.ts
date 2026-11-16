import type { PenType, ShapeType } from './types';

const CANVAS_ICON_ROOT = '/assets/canvas-icons';
const CANVAS_TOOL_2D_ROOT = '/assets/canvas-tools-2d';
const CANVAS_REFERENCE_2D_ROOT = '/assets/canvas-reference-2d';

export const COLORS = ['#0f172a', '#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6', '#a855f7', '#ec4899'];
export const HIGHLIGHTER_COLORS = ['#ef4444', '#fde047', '#86efac', '#22d3ee', '#3b82f6', '#a855f7', '#0f172a'];

export const PEN_STYLES: Array<{ value: PenType; label: string; title: string; image: string }> = [
  { value: 'ballpoint', label: 'Bille', title: 'Stylo à bille', image: `${CANVAS_TOOL_2D_ROOT}/pen-ballpoint-complete.png` },
  { value: 'fountain', label: 'Plume', title: 'Stylo plume', image: `${CANVAS_TOOL_2D_ROOT}/pen-fountain.png` },
  { value: 'marker', label: 'Feutre', title: 'Feutre', image: `${CANVAS_TOOL_2D_ROOT}/pen-marker-soft-modern.png` },
  { value: 'pencil', label: 'Crayon', title: 'Crayon', image: `${CANVAS_TOOL_2D_ROOT}/pen-pencil-coherent.png` },
];

export const CANVAS_ICONS = {
  highlighterToolbar: {
    chisel: {
      base: `${CANVAS_REFERENCE_2D_ROOT}/highlight-chisel-toolbar-base.png`,
      mask: `${CANVAS_REFERENCE_2D_ROOT}/highlight-chisel-toolbar-mask.png`,
    },
    round: {
      base: `${CANVAS_REFERENCE_2D_ROOT}/highlight-round-toolbar-base.png`,
      mask: `${CANVAS_REFERENCE_2D_ROOT}/highlight-round-toolbar-mask.png`,
    },
  },
  eraser: `${CANVAS_REFERENCE_2D_ROOT}/toolbar-eraser-retina.png`,
  lasso: `${CANVAS_REFERENCE_2D_ROOT}/toolbar-lasso-retina.png`,
  undo: `${CANVAS_ICON_ROOT}/undo.png`,
  redo: `${CANVAS_ICON_ROOT}/redo.png`,
} as const;

export const ESSENTIAL_SHAPES: Array<{ value: ShapeType; label: string }> = [
  { value: 'freeform', label: 'Forme libre' },
  { value: 'line', label: 'Ligne' },
  { value: 'arrow', label: 'Flèche' },
  { value: 'double-arrow', label: 'Double flèche' },
  { value: 'rectangle', label: 'Rectangle' },
  { value: 'circle', label: 'Cercle' },
  { value: 'triangle', label: 'Triangle' },
  { value: 'diamond', label: 'Losange' },
  { value: 'parallelogram', label: 'Parallélogramme' },
  { value: 'pentagon', label: 'Pentagone' },
  { value: 'hexagon', label: 'Hexagone' },
  { value: 'axes', label: 'Repère' },
];

export const BACKGROUND_STYLES: Array<{ id: 'slate' | 'seyes' | 'grid' | 'dotted' | 'blank'; name: string }> = [
  { id: 'slate', name: 'Ardoise' },
  { id: 'seyes', name: 'Seyes' },
  { id: 'grid', name: 'Carreaux' },
  { id: 'dotted', name: 'Points' },
  { id: 'blank', name: 'Vierge' },
];

export const BACKGROUND_COLORS: Array<{ id: 'white' | 'black' | 'green' | 'blue' | 'cream'; name: string; color: string }> = [
  { id: 'white', name: 'Blanc', color: '#ffffff' },
  { id: 'black', name: 'Noir', color: '#0f172a' },
  { id: 'green', name: 'Vert', color: '#14532d' },
  { id: 'blue', name: 'Bleu', color: '#1e3a8a' },
  { id: 'cream', name: 'Crème', color: '#fef3c7' },
];
