/**
 * Appariement des environnements LaTeX par comptage de profondeur.
 *
 * Le tokenizer (`parser/regex.ts`) repère les environnements avec une
 * expression régulière **non gloutonne** : `[\s\S]*?` s'arrête à la première
 * fermeture trouvée. Pour un environnement imbriqué avec lui-même, la
 * fermeture extérieure était donc appariée à la fermeture INTÉRIEURE :
 *
 *     \begin{enumerate}            ← ouvert n°1
 *       \item … \begin{enumerate}  ← ouvert n°2
 *         \item … \end{enumerate}  ← REGEX ferme ici (faux)
 *       \item … \end{enumerate}    ← orphelin, affiché en clair dans la fiche
 *
 * Le rendu affichait alors `\end{enumerate}` en texte et perdait la sous-liste.
 * Ici on compte les ouvertures/fermetures du **même type** pour retrouver la
 * vraie fermeture. Les types différents (une liste dans une citation, par
 * exemple) n'ont pas besoin de ce comptage : leurs balises diffèrent et la
 * regex les apparie correctement.
 *
 * Fonction pure — testable sans DOM (`environment: node`).
 */

export interface BalancedEnvironment {
  /** Contenu compris entre l'ouverture et la fermeture appariée. */
  content: string;
  /** Index dans la source juste APRÈS la fermeture appariée. */
  endIndex: number;
}

/**
 * Lit l'environnement ouvert en `beginIndex` et renvoie son contenu ainsi que
 * la fin de sa fermeture appariée.
 *
 * @param text       Source complète.
 * @param beginIndex Index du `\` de `\begin{type}`.
 * @param type       Nom exact de l'environnement (`enumerate`, `align*`…).
 * @returns `null` si `beginIndex` n'ouvre pas cet environnement, ou si la
 *          fermeture manque (la source est alors laissée au comportement
 *          historique du tokenizer, qui signalera le problème).
 */
export function readBalancedEnvironment(
  text: string,
  beginIndex: number,
  type: string,
): BalancedEnvironment | null {
  const openToken = `\\begin{${type}}`;
  const closeToken = `\\end{${type}}`;
  if (!text.startsWith(openToken, beginIndex)) return null;

  const contentStart = beginIndex + openToken.length;
  let depth = 1;
  let cursor = contentStart;

  while (cursor < text.length) {
    const nextOpen = text.indexOf(openToken, cursor);
    const nextClose = text.indexOf(closeToken, cursor);
    if (nextClose === -1) return null;

    if (nextOpen !== -1 && nextOpen < nextClose) {
      depth += 1;
      cursor = nextOpen + openToken.length;
      continue;
    }

    depth -= 1;
    if (depth === 0) {
      return {
        content: text.slice(contentStart, nextClose),
        endIndex: nextClose + closeToken.length,
      };
    }
    cursor = nextClose + closeToken.length;
  }

  return null;
}

/**
 * Titre optionnel d'un environnement sémantique : `\begin{definition}[titre]`.
 * La regex le capture séparément ; le contenu apparié ci-dessus le contient
 * encore et doit donc en être débarrassé pour ne pas l'afficher deux fois.
 */
const LEADING_SEMANTIC_TITLE = /^\[[^\]]*\]/;

export function stripEnvironmentTitle(content: string): string {
  return content.replace(LEADING_SEMANTIC_TITLE, '');
}
