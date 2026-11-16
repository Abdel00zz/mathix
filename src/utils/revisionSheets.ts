/**
 * Fiches multiples d'un même chapitre.
 *
 * Un chapitre peut déclarer plusieurs fiches de cours (revisions). Jusqu'ici
 * seule `revisions[0]` était ouverte et les identifiants de blancs étaient
 * calculés par position (`blank-<chapitre>-<index>`), ce qui faisait
 * s'entrecroiser deux fiches d'un même chapitre.
 *
 * Ce module centralise les deux règles :
 *  1. l'identité d'une fiche (`revisionSheetKey`) et sa position ;
 *  2. la portée des identifiants de blancs, rétrocompatible : la PREMIÈRE
 *     fiche conserve exactement les identifiants historiques, les fiches
 *     suivantes sont préfixées par leur clé.
 */
import type { ChapterInfo } from '../types';

type RevisionRef = { path: string; title?: string };

/** Chemin de référence d'une fiche, tolérant les manifestes sans `path`. */
export const revisionPath = (revision: RevisionRef | undefined): string =>
  revision?.path || '';

/** Clé stable d'une fiche : nom de fichier sans extension. */
export const revisionSheetKey = (path: string | undefined): string => {
  if (!path) return '';
  const file = path.split('/').pop() || path;
  return file.replace(/\.json$/i, '');
};

/** Nombre de fiches déclarées par un chapitre. */
export const revisionCount = (chapter: Pick<ChapterInfo, 'revisions'> | undefined): number =>
  chapter?.revisions?.length ?? 0;

/**
 * Position de la fiche courante dans le chapitre.
 * Renvoie 0 si le chemin est inconnu (repli : la fiche affichée est traitée
 * comme la principale, ce qui préserve les identifiants historiques).
 */
export const revisionSheetIndex = (
  chapter: Pick<ChapterInfo, 'revisions'> | undefined,
  sheetPath: string | undefined,
): number => {
  const list = chapter?.revisions;
  if (!list || !sheetPath) return 0;
  const index = list.findIndex((revision) => revisionPath(revision) === sheetPath);
  return index < 0 ? 0 : index;
};

/**
 * Préfixe de portée des identifiants de blancs.
 *
 * - La première fiche renvoie `''` : les identifiants enregistrés par les
 *   élèves avant l'introduction des fiches multiples restent valides.
 * - Les fiches suivantes renvoient `<clé>-` pour ne pas partager leurs blancs.
 *
 * Quand le chemin est inconnu, on renvoie le préfixe de la clé pour éviter
 * toute collision silencieuse entre deux documents.
 */
export const blankScopePrefix = (
  chapter: Pick<ChapterInfo, 'revisions'> | undefined,
  sheetPath: string | undefined,
): string => {
  const key = revisionSheetKey(sheetPath);
  if (!key) return '';
  const list = chapter?.revisions;
  if (!list || list.length === 0) return '';
  const found = list.findIndex((revision) => revisionPath(revision) === sheetPath);
  if (found < 0) return `${key}-`;
  return found === 0 ? '' : `${key}-`;
};

/** Identifiant stable d'un blanc : `blank-<chapitre>-<portée><position>`. */
export const blankIdFor = (
  chapterId: string,
  scope: string,
  index: number,
): string => `blank-${chapterId}-${scope}${index}`;

/** Fiche à ouvrir par défaut depuis la carte chapitre (la première déclarée). */
export const primaryRevisionPath = (
  chapter: Pick<ChapterInfo, 'revisions'> | undefined,
): string | undefined => {
  const first = chapter?.revisions?.[0];
  return first ? revisionPath(first) : undefined;
};

export type RevisionStep = {
  key: string;
  path: string;
  title?: string;
  index: number;
  percent: number;
  completed: boolean;
};

/**
 * Construit une étape par fiche déclarée.
 *
 * La progression est lue dans `bySheet` (progression par fiche). À défaut —
 * données enregistrées avant l'introduction des fiches multiples — un chapitre
 * à fiche unique retombe sur la progression globale du chapitre, ce qui
 * conserve l'affichage existant sans migration.
 *
 * Un chapitre à plusieurs fiches et sans donnée par fiche affiche 0 % : mieux
 * vaut sous-estimer que d'annoncer comme acquise une leçon jamais ouverte.
 */
export const resolveRevisionSteps = (
  chapter: Pick<ChapterInfo, 'revisions'> | undefined,
  bySheetProgress: Record<string, number> | undefined,
  chapterRevisionPercent: number,
): RevisionStep[] => {
  const list = chapter?.revisions ?? [];
  const bySheet = bySheetProgress || {};
  return list.map((revision, index) => {
    const path = revisionPath(revision);
    const key = revisionSheetKey(path) || `fiche-${index}`;
    const stored = bySheet[revisionSheetKey(path)];
    const percent = typeof stored === 'number'
      ? clampPercent(stored)
      : list.length === 1
        ? clampPercent(chapterRevisionPercent)
        : 0;
    return {
      key,
      path,
      title: revision.title,
      index,
      percent,
      completed: percent >= 100,
    };
  });
};

/** Borne un pourcentage dans [0, 100] en tolérant les valeurs invalides. */
const clampPercent = (value: number): number =>
  Math.max(0, Math.min(100, Math.round(Number.isFinite(value) ? value : 0)));

