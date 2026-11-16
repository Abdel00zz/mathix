/**
 * Session de concours en cours : snapshot local pour la reprise exacte.
 *
 * Pendant l'épreuve, un snapshot léger est persisté (bascule d'onglet,
 * fermeture, démontage de la vue, après chaque réponse). L'examen n'est PAS
 * stocké : il est reconstruit à l'identique via la graine (`buildExam` est
 * déterministe pour un seed donné). On ne garde que la graine, la config,
 * les réponses validées, la position, le temps restant et la sélection
 * non validée de la question courante.
 *
 * Stockage : localStorage (`mathplus:concours-pending:{schoolId}:{itemId}`).
 */

import { QuizResult } from '../types';

const KEY_PREFIX = 'mathplus:concours-pending:';
/** Une session interrompue reste reprenable pendant 24 h. */
const MAX_AGE_MS = 24 * 60 * 60 * 1000;
const VERSION = 1;

export interface ConcoursSessionSnapshot {
  v: number;
  seed: number;
  schoolId: string;
  /** Identifiant de session du catalogue : `annale-2023`, `theme-analyse`, `random-all`. */
  itemId: string;
  themeId: string | null;
  year: string | null;
  questionCount: number;
  customDuration: number | null;
  currentIndex: number;
  timeLeft: number;
  results: QuizResult[];
  mistakeIds: string[];
  /** Sélection non validée de la question courante (reprise exacte). */
  pendingAnswer?: unknown;
  savedAt: number;
}

const keyFor = (schoolId: string, itemId: string) => `${KEY_PREFIX}${schoolId}:${itemId}`;

export function saveConcoursSession(snap: Omit<ConcoursSessionSnapshot, 'v' | 'savedAt'>): void {
  try {
    localStorage.setItem(
      keyFor(snap.schoolId, snap.itemId),
      JSON.stringify({ ...snap, v: VERSION, savedAt: Date.now() })
    );
  } catch { /* stockage plein : la reprise est best-effort */ }
}

export function loadConcoursSession(schoolId: string, itemId: string): ConcoursSessionSnapshot | null {
  try {
    const raw = localStorage.getItem(keyFor(schoolId, itemId));
    if (!raw) return null;
    const snap = JSON.parse(raw) as ConcoursSessionSnapshot;
    if (snap.v !== VERSION || typeof snap.seed !== 'number' || !Array.isArray(snap.results)) {
      clearConcoursSession(schoolId, itemId);
      return null;
    }
    if (Date.now() - (snap.savedAt || 0) > MAX_AGE_MS) {
      clearConcoursSession(schoolId, itemId);
      return null;
    }
    return snap;
  } catch {
    return null;
  }
}

export function clearConcoursSession(schoolId: string, itemId: string): void {
  try { localStorage.removeItem(keyFor(schoolId, itemId)); } catch { /* ignore */ }
}
