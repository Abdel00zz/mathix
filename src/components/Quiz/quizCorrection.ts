import type { QuizQuestion, QuizResult } from '../../types';

/**
 * Contenu du volet « Aide » de la zone manuscrite du quiz (mode professeur
 * tablette) : ce qu'il fallait répondre, ce que la classe a répondu quand elle
 * s'est trompée, et le rappel de cours porté par la banque de questions.
 *
 * Volontairement une donnée pure — des chaînes prêtes à rendre, LaTeX conservé.
 * La mise en forme vit dans `QuizCorrectionPanel`, l'extraction (un cas par type
 * de question) se teste donc sans DOM.
 */
export interface QuizCorrectionDigest {
  /** Réponse attendue, formulée pour être lue à voix haute devant la classe. */
  expected: string;
  /** Réponse donnée, uniquement lorsqu'elle diffère de l'attendue. */
  given: string;
  /** Justification / rappel de cours. */
  explanation: string;
}

/** A → Z, même repère que les pastilles des propositions. */
const choiceLetter = (index: number): string => String.fromCharCode(65 + index);

const labelOfOption = (options: NonNullable<QuizQuestion['options']>, id: unknown): string => {
  const index = options.findIndex(option => option.id === id);
  return index < 0 ? '' : `${choiceLetter(index)}. ${options[index].text}`;
};

const sequenceOf = (items: NonNullable<QuizQuestion['items']>, ids: unknown): string =>
  Array.isArray(ids)
    ? ids.map(id => items.find(item => item.id === id)?.content ?? String(id)).join('  →  ')
    : '';

/** Vrai si le volet a une justification à dévoiler : sans quoi l'onglet reste absent. */
export const hasQuizCorrection = (digest: QuizCorrectionDigest): boolean =>
  !!digest.explanation;

/**
 * Construit le digest de correction d'une question validée.
 *
 * `given` n'est renseigné que sur une réponse fausse : sur une bonne réponse, la
 * répéter n'apporterait rien — les propositions à l'écran la montrent déjà.
 */
export const buildQuizCorrection = (
  question: QuizQuestion,
  result?: QuizResult,
): QuizCorrectionDigest => {
  const explanation = (question.explanation || '').trim();
  const wrongAnswer = result && !result.isCorrect ? result.userAnswer : undefined;
  // Une expiration du minuteur enregistre `null` : il n'y a alors rien à citer.
  const answered = wrongAnswer !== undefined && wrongAnswer !== null && wrongAnswer !== '';

  switch (question.type) {
    case 'mcq': {
      const options = question.options || [];
      const correctIndex = options.findIndex(option => option.isCorrect);
      return {
        expected: correctIndex < 0 ? '' : `${choiceLetter(correctIndex)}. ${options[correctIndex].text}`,
        given: answered ? labelOfOption(options, wrongAnswer) : '',
        explanation,
      };
    }

    case 'boolean': {
      const label = (value: unknown) => (value === true ? 'Vrai' : value === false ? 'Faux' : '');
      return {
        expected: label(question.isTrue),
        given: answered ? label(wrongAnswer) : '',
        explanation,
      };
    }

    case 'error': {
      const steps = question.steps || [];
      const faulty = steps.find(step => step.isError);
      const chosen = answered ? steps.find(step => step.id === wrongAnswer) : undefined;
      return {
        expected: faulty
          ? faulty.correction
            ? `${faulty.text}  →  ${faulty.correction}`
            : faulty.text
          : '',
        given: chosen ? chosen.text : '',
        explanation,
      };
    }

    case 'order': {
      const items = question.items || [];
      return {
        expected: sequenceOf(items, question.correctOrder),
        given: answered ? sequenceOf(items, wrongAnswer) : '',
        explanation,
      };
    }

    case 'input':
      return {
        expected: (question.correctAnswers || []).join('  ou  '),
        given: answered ? String(wrongAnswer) : '',
        explanation,
      };

    default:
      return { expected: '', given: '', explanation };
  }
};
