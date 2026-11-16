import type { AppSettings, ReadingTheme } from '../types';
import { DEFAULT_READING_THEME } from './constants';

/** Borne `docScale` à [0.85, 1.25] : lisible sans casser la mise en page. */
const clampScale = (value: unknown): number => {
  const n = typeof value === 'number' && Number.isFinite(value) ? value : 1;
  return Math.min(1.25, Math.max(0.85, n));
};

/**
 * Complète le thème de lecture enregistré avec les valeurs par défaut.
 *
 * Une sauvegarde antérieure à l'onglet « Apparence » ne porte pas `readingTheme` :
 * chaque champ retombe sur le défaut, et l'échelle est bornée quoi qu'il arrive.
 */
export function resolveReadingTheme(settings?: AppSettings | null): ReadingTheme {
  const base = DEFAULT_READING_THEME;
  const stored = settings?.readingTheme;
  if (!stored) return { ...base };
  return {
    paper: (['ivoire', 'blanc', 'creme', 'ardoise'] as const).includes(stored.paper) ? stored.paper : base.paper,
    docFont: (['serif', 'sans', 'ronde'] as const).includes(stored.docFont) ? stored.docFont : base.docFont,
    docScale: clampScale(stored.docScale),
  };
}
