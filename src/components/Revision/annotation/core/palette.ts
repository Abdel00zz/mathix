/**
 * Palette d'outil — 5 emplacements, gestion auto-organisée.
 *
 * Pourquoi une liste BORNÉE : les pastilles vivent sur la même ligne que les
 * instruments, et une cible tactile mesure 44 px sur tablette. L'ancien modèle
 * (7 couleurs fixes + jusqu'à 5 couleurs personnalisées + le bouton d'ajout)
 * alignait jusqu'à 13 pastilles, soit ~600 px : la rangée sortait du cadre de la
 * zone en portrait. Cinq emplacements + « ajouter » tiennent toujours.
 *
 * Pourquoi un ORDRE D'AFFICHAGE STABLE et une récence SÉPARÉE : une barre dont
 * les boutons se réorganisent à chaque choix de couleur oblige à re-viser à
 * chaque trait. L'ordre des emplacements ne change donc jamais tout seul ; la
 * récence (`recency`) ne sert qu'à décider QUI céder sa place quand la palette
 * est pleine et qu'on ajoute une teinte. La couleur active est protégée : la
 * voir disparaître au moment où on en ajoute une autre donnerait l'impression
 * d'avoir perdu son réglage.
 *
 * Fonctions pures, sans DOM : elles reçoivent des listes et en retournent de
 * nouvelles (jamais de mutation en place).
 */

/** Nombre d'emplacements affichés dans une palette. */
export const PALETTE_SLOTS = 5;

/** Profondeur de l'historique de récence (sert uniquement à l'éviction). */
export const RECENCY_DEPTH = 24;

const HEX = /^#[0-9a-f]{6}$/i;

export const isHexColor = (value: unknown): value is string =>
  typeof value === 'string' && HEX.test(value);

/** Forme canonique : minuscules, pour que les comparaisons soient fiables. */
export const normalizeColor = (value: string): string => value.toLowerCase();

/**
 * Liste assainie : hex valides uniquement, sans doublon, tronquée à `limit`.
 * Utilisée à la lecture des préférences — une slice localStorage peut avoir été
 * éditée à la main ou écrite par une version antérieure du schéma.
 */
export function sanitizeColors(value: unknown, limit: number): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const entry of value) {
    if (!isHexColor(entry)) continue;
    const hex = normalizeColor(entry);
    if (!out.includes(hex)) out.push(hex);
    if (out.length === limit) break;
  }
  return out;
}

/** Historique de récence mis à jour : `color` en tête, sans doublon, borné. */
export function touchColor(recency: string[], color: string): string[] {
  if (!isHexColor(color)) return recency;
  const hex = normalizeColor(color);
  if (recency[0] === hex) return recency;
  return [hex, ...recency.filter((c) => c !== hex)].slice(0, RECENCY_DEPTH);
}

/**
 * Emplacement à sacrifier quand la palette est pleine : le moins récemment
 * utilisé. Une couleur absente de l'historique n'a jamais servi — c'est la
 * meilleure candidate, donc le rang `Infinity`. `active` n'est jamais évincée ;
 * si tous les emplacements sont protégés, on retombe sur le dernier.
 */
function evictionIndex(palette: string[], recency: string[], active?: string): number {
  const activeHex = active && isHexColor(active) ? normalizeColor(active) : null;
  let worstIndex = palette.length - 1;
  let worstRank = -1;
  for (let i = 0; i < palette.length; i++) {
    if (palette[i] === activeHex) continue;
    const seen = recency.indexOf(palette[i]);
    const rank = seen === -1 ? Number.POSITIVE_INFINITY : seen;
    if (rank > worstRank) {
      worstRank = rank;
      worstIndex = i;
    }
  }
  return worstIndex;
}

/**
 * Ajoute une couleur. Tant qu'il reste un emplacement libre elle s'ajoute à la
 * fin ; ensuite elle PREND LA PLACE de la moins récemment utilisée, ce qui
 * laisse toutes les autres pastilles exactement où elles étaient.
 * Une couleur déjà présente ne crée pas de doublon.
 */
export function addColor(
  palette: string[],
  color: string,
  recency: string[] = [],
  active?: string,
): string[] {
  if (!isHexColor(color)) return palette;
  const hex = normalizeColor(color);
  if (palette.includes(hex)) return palette;
  if (palette.length < PALETTE_SLOTS) return [...palette, hex];
  const next = palette.slice();
  next[evictionIndex(next, recency, active)] = hex;
  return next;
}

/**
 * Réaffecte UN emplacement (édition d'une pastille par appui long). La pastille
 * ne bouge pas : on modifie une couleur, on n'en ajoute pas une. Si la teinte
 * choisie occupe déjà un autre emplacement, on ne fait rien plutôt que de créer
 * un doublon qui gaspillerait une des cinq places.
 */
export function replaceColor(palette: string[], index: number, color: string): string[] {
  if (!isHexColor(color) || index < 0 || index >= palette.length) return palette;
  const hex = normalizeColor(color);
  if (palette[index] === hex) return palette;
  if (palette.includes(hex)) return palette;
  const next = palette.slice();
  next[index] = hex;
  return next;
}
