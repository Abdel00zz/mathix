/**
 * Normalisation défensive du TeX avant compilation KaTeX.
 *
 * Dans un `array` (ou un `align`), `\\` accepte un **argument optionnel de
 * dimension** — `\\[2pt]`. Une ligne de tableau qui commence par un intervalle
 * s'écrit donc `\\[0,1] & …` et KaTeX lit `[0,1]` comme une taille : il échoue
 * avec `Invalid size: '0,1'` et **tout le tableau est figé en rouge**, sans
 * qu'aucune erreur ne remonte (le rendu utilise `throwOnError: false`).
 *
 * La parade LaTeX est un groupe vide entre les deux : `\\ {}[0,1]`. On l'insère
 * ici, au seul endroit où le TeX de la fiche devient une formule affichée — une
 * fiche ancienne ou produite hors projet s'affiche donc correctement, sans
 * réécriture manuelle du contenu.
 *
 * Ce qui n'est **jamais** touché :
 * - les vrais espacements (`\\[2pt]`, `\\[1.5em]`, `\\[-3mm]`) ;
 * - un crochet fermant en tête de ligne (`\\]0,1[` — pas de `[` après `\\`) ;
 * - tout ce qui suit une commande (`\\ \\hline[0,1]`, `\\ {}[0,1]` déjà écrit).
 *
 * Fonction pure — testable sans DOM (`environment: node`).
 */

const BACKSLASH = String.fromCharCode(92);

/** Grammaire KaTeX d'une dimension : nombre + unité (`2pt`, `1.5em`, `-3mm`). */
const SIZE_ARG = /^\s*[-+]?(?:\d+(?:\.\d+)?|\.\d+)\s*(?:em|ex|mu|pt|mm|cm|in|bp|pc|dd|cc|nd|nc|sp|px)\s*$/;

/** `true` si le crochet qui suit `\\` est un vrai espacement de ligne. */
export const isLineBreakSize = (argument: string): boolean => SIZE_ARG.test(argument);

/**
 * Insère le groupe vide de la parade là où c'est nécessaire.
 *
 * @param tex TeX d'une formule, sans délimiteurs (`$$…$$` retirés).
 */
export function repairLineBreakBrackets(tex: string): string {
  const needle = BACKSLASH + BACKSLASH + '[';
  if (!tex.includes(needle)) return tex;

  let out = '';
  let cursor = 0;
  for (;;) {
    const start = tex.indexOf(needle, cursor);
    if (start === -1) {
      out += tex.slice(cursor);
      return out;
    }

    const argStart = start + needle.length;
    const close = tex.indexOf(']', argStart);
    const argument = close === -1 ? tex.slice(argStart) : tex.slice(argStart, close);

    out += tex.slice(cursor, start);
    if (SIZE_ARG.test(argument)) {
      out += tex.slice(start, argStart); // espacement réel : laissé intact
    } else {
      out += BACKSLASH + BACKSLASH + '{}[';
    }
    // La reprise se fait juste après le crochet : `]` et la suite du tableau
    // sont ensuite recopiés tels quels, et un `\\[` plus loin reste détecté.
    cursor = argStart;
  }
}
