import type { Stroke } from '../canvas/types';
import { defaultColorFor, type PageColor, type PageStyle } from './pageSurface';

/**
 * Stockage du tableau, volontairement séparé de `mathplus:exercise-strokes:v1` :
 * cette dernière clé alimente le comptage « zones annotées » de la séance
 * (`sessionHelpers.ts`) et l'archive d'impression. Les brouillons du tableau ne
 * doivent pas gonfler ces chiffres.
 */
const BOARD_KEY = 'mathplus:exercise-board:v1';

/**
 * Délai de regroupement des écritures, en ms. Sérialiser le tableau, c'est
 * sérialiser TOUS les traits de TOUS les exercices : le faire à chaque fin de
 * tracé bloquait le fil principal juste après le lever du stylet. On écrit donc
 * une fois la main rendue à l'utilisateur.
 */
const FLUSH_MS = 600;

export interface BoardPage {
  id: string;
  /** `exercise` : l'énoncé en cours. `paper` : page vierge réglée. */
  kind: 'exercise' | 'paper';
  style: PageStyle;
  color: PageColor;
}

export interface BoardState {
  pages: BoardPage[];
  /** Taille du texte de l'énoncé, en pourcentage. */
  zoom: number;
  strokes: Record<string, Stroke[]>;
}

export const EXERCISE_PAGE_ID = 'statement';
export const ZOOM_MIN = 60;
export const ZOOM_MAX = 180;
export const ZOOM_STEP = 10;

const statementPage = (): BoardPage => ({ id: EXERCISE_PAGE_ID, kind: 'exercise', style: 'blank', color: 'white' });

const emptyState = (): BoardState => ({ pages: [statementPage()], zoom: 100, strokes: {} });

function readAll(): Record<string, BoardState> {
  try {
    const parsed = JSON.parse(localStorage.getItem(BOARD_KEY) || '{}');
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, BoardState>) : {};
  } catch {
    return {};
  }
}

function writeAll(all: Record<string, BoardState>): void {
  try {
    localStorage.setItem(BOARD_KEY, JSON.stringify(all));
  } catch {
    /* stockage restreint */
  }
}

// ── File d'écriture ─────────────────────────────────────────────────────────
// Le stockage n'est lu qu'une fois par session : la carte en mémoire fait
// ensuite référence, et seule la sérialisation est différée.

let cache: Record<string, BoardState> | null = null;
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let dirty = false;

function boards(): Record<string, BoardState> {
  if (!cache) cache = readAll();
  return cache;
}

/** Vide la file immédiatement (fermeture du tableau, mise en arrière-plan). */
export function flushBoard(): void {
  if (flushTimer) { clearTimeout(flushTimer); flushTimer = null; }
  if (!dirty || !cache) return;
  dirty = false;
  writeAll(cache);
}

function scheduleFlush(): void {
  dirty = true;
  if (flushTimer) return;
  flushTimer = setTimeout(flushBoard, FLUSH_MS);
}

if (typeof window !== 'undefined') {
  // Android gèle un onglet sans toujours passer par `beforeunload` : sans ce
  // vidage, les derniers traits resteraient dans la file.
  window.addEventListener('pagehide', flushBoard);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushBoard();
  });
}

/** État du tableau d'un exercice, toujours normalisé : page d'énoncé en tête. */
export function readBoard(exerciseId: string): BoardState {
  const stored = boards()[exerciseId];
  if (!stored || !Array.isArray(stored.pages) || stored.pages.length === 0) return emptyState();

  const pages = [
    statementPage(),
    ...stored.pages.filter(page => page && page.kind === 'paper' && typeof page.id === 'string'),
  ];
  const zoom = typeof stored.zoom === 'number' && stored.zoom >= ZOOM_MIN && stored.zoom <= ZOOM_MAX ? stored.zoom : 100;
  // Copie de surface : l'appelant range ses traits par page et supprime des
  // entrées, la carte en mémoire ne doit pas suivre ces retraits à son insu.
  const strokes = stored.strokes && typeof stored.strokes === 'object' ? { ...stored.strokes } : {};

  // Le style de la page d'énoncé reste pilotable (réglure sous le texte), pas sa
  // couleur : un fond sombre rendrait l'énoncé illisible.
  const storedStatement = stored.pages.find(page => page?.kind === 'exercise');
  if (storedStatement?.style) pages[0] = { ...pages[0], style: storedStatement.style };

  return { pages, zoom, strokes };
}

export function writeBoard(exerciseId: string, state: BoardState): void {
  boards()[exerciseId] = state;
  scheduleFlush();
}

/** Écriture ciblée des traits d'une page : appelée à chaque fin de tracé. */
export function writePageStrokes(exerciseId: string, pageId: string, strokes: Stroke[]): void {
  const all = boards();
  const state = all[exerciseId] ?? emptyState();
  state.strokes = { ...(state.strokes || {}), [pageId]: strokes };
  all[exerciseId] = state;
  scheduleFlush();
}

export function nextPageId(): string {
  return `p${Date.now().toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;
}

export function newPaperPage(style: PageStyle): BoardPage {
  return { id: nextPageId(), kind: 'paper', style, color: defaultColorFor(style) };
}

export const clampZoom = (value: number): number => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, value));
