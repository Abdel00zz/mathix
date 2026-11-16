import { createContext, useContext } from 'react';

/**
 * Mode d'affichage d'une fiche d'exercice.
 *
 * `compact` : présentation « tableau » — l'énoncé seul, sans aucune zone de
 * réponse manuscrite ni son déclencheur « … ». Un seul point de lecture
 * (`InlineCanvasZone`) suffit à faire disparaître les zones de tout le
 * sous-arbre, sans dupliquer la numérotation des parties et des questions.
 */
export interface ExerciseDisplay {
  compact: boolean;
}

const DEFAULT_DISPLAY: ExerciseDisplay = { compact: false };

export const ExerciseDisplayContext = createContext<ExerciseDisplay>(DEFAULT_DISPLAY);

/** Présentation compacte, prête à passer au `Provider` (référence stable). */
export const COMPACT_DISPLAY: ExerciseDisplay = { compact: true };

export const useExerciseDisplay = (): ExerciseDisplay => useContext(ExerciseDisplayContext);
