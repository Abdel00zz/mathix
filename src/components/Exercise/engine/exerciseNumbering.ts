/**
 * Numérotation d'un exercice — SOURCE UNIQUE.
 *
 * Le studio d'édition et la page de l'élève numérotaient chacun dans leur coin :
 * le professeur pouvait lire « 5. » à l'écran pendant que l'élève lisait « 4. ».
 * Les deux passent désormais par ici.
 *
 * La règle reproduit exactement ce qui est RENDU, pas ce qui est déclaré :
 *  - une partie (`partie` / `header`) ouvre une partie et ne porte pas de numéro
 *    de question ;
 *  - un bloc de texte libre n'est jamais numéroté ;
 *  - une question n'est numérotée que si elle affiche quelque chose : une
 *    question vide, sans sous-question, n'apparaît pas à l'écran — lui donner un
 *    numéro ferait décaler toute la suite.
 */

export type ExerciseNodeKind = 'part' | 'question' | 'text' | 'empty';

/** Vue minimale d'un nœud : suffisante pour numéroter une donnée brute ou analysée. */
export interface NumberableNode {
  /** Identifiant de l'auteur : accepté pour ne pas caster les nœuds réels, jamais lu ici. */
  id?: string;
  type?: string;
  content?: string;
  subQuestions?: readonly unknown[];
}

export interface ExerciseNumbering {
  index: number;
  kind: ExerciseNodeKind;
  /** Numéro de partie (1, 2, …) ou 0 hors partie. */
  part: number;
  /** Numéro de question (1, 2, …) ou 0 pour une partie ou un bloc de texte. */
  question: number;
}

export const isPartNode = (type?: string): boolean => {
  const normalized = (type || '').trim().toLowerCase();
  return normalized === 'partie' || normalized === 'header';
};

export const isTextNode = (type?: string): boolean => (type || '').trim().toLowerCase() === 'text';

/**
 * Une question apparaît à l'écran dès qu'elle porte une sous-question ou un
 * énoncé non vide. Une question entièrement vide ne s'affiche pas.
 */
export const rendersAsQuestion = (node: NumberableNode): boolean => (
  (node.subQuestions?.length ?? 0) > 0 || (node.content || '').trim().length > 0
);

export function numberExercise(nodes: readonly NumberableNode[]): ExerciseNumbering[] {
  let part = 0;
  let question = 0;

  return nodes.map((node, index) => {
    if (isPartNode(node.type)) {
      part += 1;
      return { index, kind: 'part' as const, part, question: 0 };
    }
    if (isTextNode(node.type)) {
      return { index, kind: 'text' as const, part, question: 0 };
    }
    if (!rendersAsQuestion(node)) {
      return { index, kind: 'empty' as const, part, question: 0 };
    }
    question += 1;
    return { index, kind: 'question' as const, part, question };
  });
}

/** Compteur de parties tel que l'en-tête de partie l'affiche : 1 → A. */
export const partLabel = (part: number): string => {
  if (part <= 0) return '';
  let rest = part;
  let label = '';
  while (rest > 0) {
    const remainder = (rest - 1) % 26;
    label = String.fromCharCode(65 + remainder) + label;
    rest = Math.floor((rest - 1) / 26);
  }
  return label;
};
