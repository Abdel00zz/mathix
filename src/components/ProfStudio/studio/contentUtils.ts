import type { JsonNode } from '../JsonFieldEditor';
import type { ImportEntry, ImportableKind, JsonParseError } from './types';

const QUIZ_MARKERS = ['prompt', 'question', 'options', 'isTrue', 'items', 'steps', 'correctAnswers'];

/** Détecte le type d'un document JSON avec les mêmes heuristiques que l'éditeur. */
export function detectContentType(content: unknown): ImportableKind | null {
  if (!content || typeof content !== 'object' || Array.isArray(content)) return null;
  const obj = content as Record<string, unknown>;
  if (Array.isArray(obj.sections)) return 'revision';
  if (Array.isArray(obj.questions)) {
    const first = obj.questions[0];
    if (first && typeof first === 'object') {
      const question = first as Record<string, unknown>;
      if (QUIZ_MARKERS.some(marker => marker in question)) return 'quiz';
    }
    return 'exercise';
  }
  return null;
}

export function parseImportText(text: string, source: string): ImportEntry[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    return [{
      source,
      content: {},
      kind: null,
      error: describeJsonError(text, error).message,
    }];
  }

  const list = Array.isArray(parsed) ? parsed : [parsed];
  if (list.length === 0) return [{ source, content: {}, kind: null, error: 'Aucun document JSON trouvé' }];

  return list.map((item, index) => {
    const itemSource = list.length > 1 ? `${source} (${index + 1})` : source;
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      return { source: itemSource, content: {}, kind: null, error: 'Contenu non-objet' };
    }
    const content = item as Record<string, unknown>;
    const kind = detectContentType(content);
    return {
      source: itemSource,
      content,
      kind,
      error: kind ? undefined : 'Type non reconnu (exercice / quiz / révision)',
    };
  });
}

export function parseJsonContent(content: string): JsonNode | null {
  try { return JSON.parse(content) as JsonNode; } catch { return null; }
}

export function describeJsonError(content: string, error?: unknown): JsonParseError {
  let actualError = error;
  if (!actualError) {
    try { JSON.parse(content); }
    catch (caught) { actualError = caught; }
  }
  const rawMessage = actualError instanceof Error ? actualError.message : 'JSON invalide';
  const match = rawMessage.match(/position (\d+)/);
  let line = 0;
  let col = 0;
  if (match) {
    const position = parseInt(match[1], 10);
    const before = content.slice(0, position);
    line = before.split('\n').length;
    const lastNewline = before.lastIndexOf('\n');
    col = position - (lastNewline < 0 ? 0 : lastNewline);
  }
  const message = match
    ? `${rawMessage.replace(/ at position \d+.*$/, '')} (ligne ${line}, colonne ${col})`
    : rawMessage;
  return { message, line, col };
}

export function getJsonParseError(content: string): JsonParseError | null {
  if (!content.trim()) return null;
  try { JSON.parse(content); return null; }
  catch (error) {
    const detail = describeJsonError(content, error);
    return { ...detail, message: error instanceof Error ? error.message : detail.message };
  }
}

export function getDocumentKind(content: JsonNode | null) {
  const object = content as Record<string, unknown> | null;
  const isRevision = object !== null && Array.isArray(object.sections);
  const questions = object !== null && Array.isArray(object.questions)
    ? object.questions as Record<string, unknown>[]
    : [];
  const firstQuestion = questions[0];
  const isQuiz = questions.length > 0 && firstQuestion != null && typeof firstQuestion === 'object'
    && QUIZ_MARKERS.some(marker => marker in firstQuestion);
  const isExercise = questions.length > 0 && !isQuiz;
  return {
    isRevision,
    isQuiz,
    isExercise,
    isVisualSupported: isRevision || isQuiz || isExercise,
  };
}

/** Validation métier minimale des documents pédagogiques avant publication.
 * Les manifestes de catalogue, non reconnus comme document, restent autorisés. */
export function validateStudioDocument(content: unknown): string[] {
  const kind = detectContentType(content);
  if (!kind) return [];
  const object = content as Record<string, unknown>;

  if (kind === 'revision') {
    const sections = object.sections as unknown[];
    if (sections.length === 0) return ['La fiche de révision doit contenir au moins une section.'];
    return sections.flatMap((section, index) => {
      if (!section || typeof section !== 'object' || !Array.isArray((section as Record<string, unknown>).blocks)) {
        return [`La section ${index + 1} doit contenir un tableau « blocks ».`];
      }
      return [];
    });
  }

  const questions = object.questions as unknown[];
  if (questions.length === 0) return ['Le document doit contenir au moins une question.'];
  const errors: string[] = [];

  questions.forEach((entry, index) => {
    const label = `Question ${index + 1}`;
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      errors.push(`${label} : objet attendu.`);
      return;
    }
    const question = entry as Record<string, unknown>;
    const statement = kind === 'quiz'
      ? (question.prompt ?? question.question)
      : question.content;
    if (typeof statement !== 'string' || !statement.trim()) errors.push(`${label} : énoncé vide ou absent.`);

    if (kind !== 'quiz') return;
    const type = String(question.type || '');
    if (type === 'mcq') {
      const options = Array.isArray(question.options) ? question.options as Record<string, unknown>[] : [];
      if (options.length < 2) errors.push(`${label} : un QCM doit proposer au moins deux options.`);
      if (!options.some(option => option?.isCorrect === true)) errors.push(`${label} : aucune bonne réponse n’est définie.`);
    } else if (type === 'true-false' || type === 'boolean') {
      if (typeof question.isTrue !== 'boolean') errors.push(`${label} : la réponse Vrai/Faux n’est pas définie.`);
    } else if (type === 'order' || type === 'ordering') {
      if (!Array.isArray(question.items) || question.items.length < 2) errors.push(`${label} : au moins deux éléments à ordonner sont requis.`);
      if (!Array.isArray(question.correctOrder) || question.correctOrder.length !== (Array.isArray(question.items) ? question.items.length : 0)) {
        errors.push(`${label} : l’ordre correct est incomplet.`);
      }
    } else if (type === 'error') {
      const steps = Array.isArray(question.steps) ? question.steps as Record<string, unknown>[] : [];
      if (!steps.some(step => step?.isError === true)) errors.push(`${label} : aucune étape erronée n’est indiquée.`);
    } else if (type === 'input') {
      if (!Array.isArray(question.correctAnswers) || question.correctAnswers.length === 0) errors.push(`${label} : aucune réponse attendue n’est définie.`);
    }
  });

  return errors;
}

export function slugify(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'nouveau';
}

/** Place les quiz publiés en tête du catalogue et synchronise le compteur du
 * quiz principal, sans dupliquer une référence déjà présente. */
export function publishPrimaryQuizReferences(
  chapter: Record<string, any>,
  references: Array<{ id: string; path: string }>,
  primaryQuestionCount: number,
): void {
  const publishedPaths = new Set(references.map(reference => reference.path));
  const existing = Array.isArray(chapter.quizzes) ? chapter.quizzes : [];
  chapter.quizzes = [
    ...references,
    ...existing.filter((reference: any) => !publishedPaths.has(reference.path)),
  ];
  chapter.quizCount = Math.max(0, Number(primaryQuestionCount) || 0);
}

/** Base d'un exercice (son id, sinon son nom de fichier sans extension). */
const exerciseBase = (exercise: { id?: string; path?: string }) =>
  exercise.id || (exercise.path || '').split('/').pop()?.replace(/\.json$/, '') || '';

/** Prochain numéro d'exercice cohérent : max des numéros déjà présents + 1.
 *  Ne réutilise jamais un numéro libéré par une suppression et évite les collisions. */
export function nextExerciseNumber(exercises: Array<{ id?: string; path?: string }>): number {
  let max = 0;
  for (const exercise of exercises) {
    const match = exerciseBase(exercise).match(/(\d+)$/);
    if (match) max = Math.max(max, Number(match[1]));
  }
  return max + 1;
}

/** Numéro affiché d'un exercice (lu dans son id) ; retombe sur l'ordre visuel sinon. */
export function exerciseDisplayNumber(exercise: { id?: string; path?: string }, fallback: number): number {
  const match = exerciseBase(exercise).match(/(\d+)$/);
  return match ? Number(match[1]) : fallback;
}

/** Convertit les fragments LaTeX usuels en libellés courts lisibles dans le rail. */
export function readableCatalogLabel(value: string): string {
  const blackboard: Record<string, string> = {
    C: 'ℂ', N: 'ℕ', Q: 'ℚ', R: 'ℝ', Z: 'ℤ',
  };
  return value
    .replace(/\\mathbb\{([A-Z])\}/g, (_match, symbol: string) => blackboard[symbol] || symbol)
    .replace(/\\(?:mathcal|mathscr)\{([^{}]+)\}/g, '$1')
    .replace(/\\(?:text|mathrm|mathbf|operatorname)\{([^{}]+)\}/g, '$1')
    .replace(/\$([^$]+)\$/g, '$1')
    .replace(/\\times/g, '×')
    .replace(/\\div/g, '÷')
    .replace(/\\leq?/g, '≤')
    .replace(/\\geq?/g, '≥')
    .replace(/\\neq/g, '≠')
    .replace(/\\infty/g, '∞')
    .replace(/\\sqrt\{([^{}]+)\}/g, '√($1)')
    .replace(/\\(?:left|right)/g, '')
    .replace(/\^\{?2\}?/g, '²')
    .replace(/\^\{?3\}?/g, '³')
    .replace(/[{}]/g, '')
    .replace(/\\,/g, ' ')
    .replace(/\\([a-zA-Z]+)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}
