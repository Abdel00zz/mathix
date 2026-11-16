/**
 * Marqueurs des listes ordonnées, selon la **profondeur d'imbrication**.
 *
 * Une seule règle de rendu existait (`${index + 1}`) : une sous-question
 * numérotée repartait donc à « 1 » alors qu'elle était déjà à l'intérieur
 * d'un item « 2 » — deux numérotations identiques se lisaient l'une sous
 * l'autre, sans repère pour l'élève. La progression est maintenant :
 *
 * | profondeur | marqueur | exemple |
 * |:----------:|:---------|:--------|
 * | 0 (liste principale) | décimal | `1` `2` `3` |
 * | 1 (sous-liste) | lettre minuscule | `a` `b` `c` |
 * | 2 et au-delà | romain minuscule | `i` `ii` `iii` |
 *
 * Fonctions pures — testables sans DOM (`environment: node`).
 */

const ROMAN_UNITS: ReadonlyArray<readonly [number, string]> = [
  [10, 'x'], [9, 'ix'], [5, 'v'], [4, 'iv'], [1, 'i'],
];

/** `0 → a`, `25 → z`, `26 → aa` (même progression que l'indexation A, B…, AA). */
export function alphaLabel(index: number): string {
  let value = Math.max(0, Math.floor(index)) + 1;
  let label = '';
  while (value > 0) {
    value -= 1;
    label = String.fromCharCode(97 + (value % 26)) + label;
    value = Math.floor(value / 26);
  }
  return label;
}

/** `1 → i`, `4 → iv`, `9 → ix`. */
export function romanLabel(value: number): string {
  let remaining = Math.max(1, Math.floor(value));
  let label = '';
  for (const [unit, symbol] of ROMAN_UNITS) {
    while (remaining >= unit) {
      label += symbol;
      remaining -= unit;
    }
  }
  return label || 'i';
}

/**
 * Marqueur complet d'un item de liste ordonnée (sans point final).
 *
 * @param index Position 0-based de l'item dans **sa** liste (une sous-liste
 *              repart donc naturellement à `a`).
 * @param depth Profondeur d'imbrication : 0 = liste principale.
 */
export function orderedMarkerLabel(index: number, depth: number): string {
  if (depth <= 0) return `${Math.max(0, Math.floor(index)) + 1}`;
  if (depth === 1) return alphaLabel(index);
  return romanLabel(index + 1);
}

/** Clé de la carte de compteurs partagée qui transporte la profondeur de liste. */
export const LIST_DEPTH_KEY = '@list-depth';

/**
 * Clé de la carte de compteurs qui transporte le **numéro de reprise** d'une
 * liste ordonnée.
 *
 * Sert quand une figure coupe une liste en deux : la seconde moitié reste la
 * suite de la première et ne doit pas repartir à « 1. ». La valeur est
 * consommée par la première liste rencontrée (cf. `takeListStart`) : une autre
 * liste du même bloc repart bien à « 1. ».
 */
export const LIST_START_KEY = '@list-start';

/**
 * Lit puis efface le numéro de reprise. `0` = la liste commence à `1.`.
 * L'effacement est volontaire : seul le fragment qui reprend la liste coupée en
 * profite, pas les listes suivantes.
 */
export function takeListStart(counter?: Map<string, number>): number {
  const start = counter?.get(LIST_START_KEY) ?? 0;
  if (counter && start) counter.set(LIST_START_KEY, 0);
  return Math.max(0, Math.floor(start) || 0);
}
