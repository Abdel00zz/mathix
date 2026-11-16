/**
 * Questions d'un bloc de révision, et découpe du contenu autour d'une d'elles.
 *
 * Un bloc d'application ou de propriété porte souvent une **liste numérotée de
 * questions** (`\begin{enumerate}\item …`). Pour poser une figure au-dessus de
 * la question 3 — et pas seulement « à côté du bloc » — il faut savoir couper le
 * contenu en deux morceaux qui restent, chacun, du LaTeX valide :
 *
 * ```text
 * avant :  … \begin{enumerate} \item 1 \item 2 \end{enumerate}
 * figure
 * après :  \begin{enumerate} \item 3 \item 4 \end{enumerate} …
 * ```
 *
 * La seconde moitié **reprend la numérotation** (`listStart`), sinon la liste
 * repartirait à « 1. » juste après la figure.
 *
 * Fonctions pures : aucune dépendance au DOM, testables directement.
 */
import type { MediaImage } from '../types';

export interface ContentQuestion {
  /** Position 1-based dans le bloc, telle que l'affiche la liste. */
  index: number;
  /** Texte brut de l'item, sans la commande `\item`. */
  text: string;
  /** Libellé court et lisible, pour la liste de la modale. */
  label: string;
  /** Rang de reprise à donner à la seconde moitié quand on coupe ici. */
  restartAt: number;
}

export interface ContentSplit {
  before: string;
  after: string;
  /** Numéro de reprise de la première liste de `after` (0 = commence à 1). */
  listStart: number;
}

const ITEM = '\\item';
const LIST_OPEN = /^\\begin\{(enumerate|itemize)\}/;

interface ItemSpan { start: number; end: number }

interface ListSpan {
  open: string;
  /** Juste après la balise d'ouverture (options `[…]` comprises). */
  contentStart: number;
  /** Début de la balise `\end{…}` correspondante. */
  closeStart: number;
  closeEnd: number;
  items: ItemSpan[];
}

/**
 * Repère les listes de **premier niveau** et leurs items.
 *
 * L'analyse avance par jetons reconnus (ouverture de liste, `\item`, fin de
 * liste) plutôt que par recherche naïve d'un mot-clé : un `\item` intérieur à
 * une sous-liste ne doit pas être compté une seconde fois, et une parenthèse ou
 * un `\begin{array}` dans un item ne doit pas fausser la lecture.
 */
function findTopLevelLists(content: string): ListSpan[] {
  const lists: ListSpan[] = [];
  const stack: ListSpan[] = [];
  let index = 0;

  while (index < content.length) {
    const rest = content.slice(index);

    const openMatch = rest.match(LIST_OPEN);
    if (openMatch) {
      // La balise peut porter des options : `\begin{enumerate}[label=(\alph*)]`.
      const afterTag = content.slice(index + openMatch[0].length);
      const options = afterTag.match(/^\[[^\]]*\]/);
      const end = index + openMatch[0].length + (options ? options[0].length : 0);
      const span: ListSpan = {
        open: content.slice(index, end),
        contentStart: end,
        closeStart: content.length,
        closeEnd: content.length,
        items: [],
      };
      stack.push(span);
      if (stack.length === 1) lists.push(span);
      index = end;
      continue;
    }

    if (rest.startsWith('\\end{')) {
      const closeMatch = rest.match(/^\\end\{(enumerate|itemize)\}/);
      if (closeMatch) {
        const span = stack.pop();
        if (span) {
          span.closeStart = index;
          span.closeEnd = index + closeMatch[0].length;
        }
        index += closeMatch[0].length;
        continue;
      }
    }

    if (rest.startsWith(ITEM) && !/[a-zA-Z]/.test(rest.charAt(ITEM.length))) {
      const owner = stack[stack.length - 1];
      if (owner && stack.length === 1) {
        const previous = owner.items[owner.items.length - 1];
        if (previous) previous.end = index;
        owner.items.push({ start: index, end: content.length });
      }
      index += ITEM.length;
      continue;
    }

    index += 1;
  }

  // Un item non suivi d'un autre va jusqu'au `\end` de sa liste.
  for (const list of lists) {
    for (const item of list.items) {
      if (item.end === content.length && list.closeStart < content.length) item.end = list.closeStart;
    }
  }

  return lists;
}

/** Remplace `\blank{…}` (trou à compléter, accolades équilibrées) par `…`. */
function hideBlanks(text: string): string {
  const command = '\\blank';
  let out = '';
  let index = 0;
  while (index < text.length) {
    const start = text.indexOf(command, index);
    if (start < 0) {
      out += text.slice(index);
      break;
    }
    out += text.slice(index, start);
    let cursor = start + command.length;
    while (text[cursor] === ' ') cursor += 1;
    if (text[cursor] !== '{') {
      // `\blank` sans accolade : on laisse la suite intacte.
      index = cursor;
      continue;
    }
    let depth = 0;
    while (cursor < text.length) {
      if (text[cursor] === '{') depth += 1;
      else if (text[cursor] === '}') {
        depth -= 1;
        if (depth === 0) { cursor += 1; break; }
      }
      cursor += 1;
    }
    out += '…';
    index = cursor;
  }
  return out;
}

/**
 * Aperçu lisible d'un item pour la modale : le professeur doit reconnaître la
 * question d'un coup d'œil, sans lire du LaTeX — et sans qu'un trou à compléter
 * ne dévoile sa réponse.
 */
export function plainItemText(text: string, maxLength = 90): string {
  const cleaned = hideBlanks(text)
    .replace(/\\(?:d|t)?frac\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g, '$1/$2')
    .replace(/\\[a-zA-Z@]+\*?(\[[^\]]*\])?/g, ' ')
    .replace(/\$/g, '')
    .replace(/[{}]/g, ' ')
    .replace(/\s+([.,;:!?])/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
  if (cleaned.length <= maxLength) return cleaned;
  return `${cleaned.slice(0, maxLength - 1).trimEnd()}…`;
}

/** Les questions d'un bloc, dans l'ordre où l'élève les lit. */
export function findContentQuestions(content: string): ContentQuestion[] {
  const lists = findTopLevelLists(content);
  const questions: ContentQuestion[] = [];

  for (const list of lists) {
    const ordered = list.open.includes('{enumerate}');
    list.items.forEach((item, position) => {
      const text = content.slice(item.start + ITEM.length, item.end).trim();
      const index = questions.length + 1;
      questions.push({
        index,
        text,
        label: plainItemText(text) || (ordered ? `Question ${index}` : `Point ${index}`),
        // Couper avant cet item : la suite reprend à son numéro dans sa liste.
        restartAt: position,
      });
    });
  }

  return questions;
}

/**
 * Coupe le contenu pour insérer une figure avant ou après la question visée.
 *
 * Renvoie `null` quand la découpe ne serait pas sûre (question inexistante,
 * liste déséquilibrée) : l'appelant retombe alors sur un placement autour du
 * bloc entier, plutôt que de risquer un contenu tronqué.
 */
export function splitContentAtQuestion(
  content: string,
  questionIndex: number,
  relation: 'before' | 'after',
): ContentSplit | null {
  const lists = findTopLevelLists(content);
  let remaining = questionIndex;

  for (const list of lists) {
    if (remaining > list.items.length) {
      remaining -= list.items.length;
      continue;
    }

    const item = list.items[remaining - 1];
    if (!item) return null;
    const closeTag = content.slice(list.closeStart, list.closeEnd);
    if (!closeTag) return null;

    if (relation === 'before') {
      return {
        before: `${content.slice(0, item.start)}${closeTag}`,
        after: `${list.open}${content.slice(item.start)}`,
        listStart: remaining - 1,
      };
    }

    // Après l'item : quand il est le dernier de la liste, il n'y a rien à
    // rouvrir — le reste du contenu suit simplement la liste refermée.
    const closesHere = item.end >= list.closeStart;
    const tail = content.slice(closesHere ? list.closeEnd : item.end);
    return {
      before: `${content.slice(0, item.end)}${closeTag}`,
      after: closesHere ? tail : `${list.open}${tail}`,
      listStart: closesHere ? 0 : remaining,
    };
  }

  return null;
}

/** Retire une liste devenue vide — un morceau de coupe ne doit rien afficher. */
function dropEmptyLists(value: string): string {
  return value
    .replace(/\\begin\{(enumerate|itemize)\}[^\S\n]*(?:\[[^\]]*\])?[^\S\n]*\\end\{\1\}/g, '')
    .trim();
}

export interface FigureSlice {
  content: string;
  /** Numéro de reprise de la première liste du morceau (0 = commence à 1). */
  listStart: number;
  /** Figures à poser juste après ce morceau, avant le suivant. */
  figuresAfter: MediaImage[];
}

export interface ContentSlicing {
  slices: FigureSlice[];
  /** Figures dont la question n'existe plus : à poser autour du bloc entier. */
  unplaced: MediaImage[];
}

/**
 * Découpe le contenu pour poser chaque figure au niveau de sa question.
 *
 * Les morceaux s'enchaînent `contenu → figures → contenu`, dans l'ordre des
 * questions visées. Deux figures sur la même question se retrouvent au même
 * endroit, et une figure qui vise une question disparue est rendue « non
 * placée » plutôt que perdue : l'appelant la pose alors autour du bloc.
 *
 * La numérotation se suit de morceau en morceau : `emitted` compte les items
 * déjà rendus, et chaque morceau leur succède (`listStart`).
 */
export function sliceContentForFigures(content: string, figures: MediaImage[]): ContentSlicing {
  const ordered = [...figures]
    .filter(figure => figure.src?.trim())
    .sort((left, right) => (left.targetItem ?? 1) - (right.targetItem ?? 1));

  const slices: FigureSlice[] = [];
  const unplaced: MediaImage[] = [];
  let remaining = content;
  /** Items déjà rendus par les morceaux précédents. */
  let emitted = 0;

  for (const figure of ordered) {
    const target = Math.max(1, Math.floor(figure.targetItem ?? 1));
    // Position de la question visée **dans le morceau restant**.
    const local = target - emitted;
    const relation = (figure.position || 'top') === 'bottom' ? 'after' : 'before';

    // La question visée est déjà sortie dans un morceau précédent : la figure
    // se pose à la frontière courante, avec celles du même endroit.
    if (local <= 0) {
      const last = slices[slices.length - 1];
      if (last) { last.figuresAfter.push(figure); continue; }
      unplaced.push(figure);
      continue;
    }

    const split = splitContentAtQuestion(remaining, local, relation);
    if (!split) { unplaced.push(figure); continue; }

    slices.push({ content: dropEmptyLists(split.before), listStart: emitted, figuresAfter: [figure] });
    remaining = split.after;
    emitted += split.listStart;
  }

  slices.push({ content: dropEmptyLists(remaining), listStart: emitted, figuresAfter: [] });
  return { slices, unplaced };
}
