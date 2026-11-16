/**
 * Source de vérité UNIQUE pour le temps par question (quiz de chapitre et
 * concours). Lit toujours la dernière valeur depuis localStorage (jamais
 * stale) et applique le tiers-temps UNE seule fois, en fin de calcul —
 * l'ancienne duplication ConcoursQuizView/useQuizLogic pouvait l'appliquer
 * deux fois (×1.77 au lieu de ×1.33).
 */

import { TIMING } from './constants';

interface QuizTimeSettings {
  userTime: number;
  tiersTemps: boolean;
}

/** Lit les réglages de temps de l'élève (valeurs par défaut si illisibles). */
function readQuizTimeSettings(): QuizTimeSettings {
  let userTime: number = TIMING.QUIZ_DEFAULT_TIME;
  let tiersTemps = false;
  try {
    const raw = localStorage.getItem('mathplus_settings');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (typeof parsed.quizTimePerQuestion === 'number' && parsed.quizTimePerQuestion > 0) {
        userTime = parsed.quizTimePerQuestion;
      }
      tiersTemps = !!parsed.tiersTemps;
    }
  } catch { /* réglages corrompus : on retombe sur les défauts */ }
  return { userTime, tiersTemps };
}

export function isTiersTempsActive(): boolean {
  return readQuizTimeSettings().tiersTemps;
}

/** Majoration tiers-temps (×1.33) si activée dans les réglages. */
export function applyTiersTemps(baseSeconds: number, tiersTemps: boolean = isTiersTempsActive()): number {
  return tiersTemps ? Math.round(baseSeconds * 1.33) : baseSeconds;
}

/**
 * Temps alloué à une question.
 * Priorité : temps choisi par l'élève (setup concours) > temps officiel de
 * l'école > limite propre à la question > réglage global de l'élève.
 * `forceGlobal` (quiz de chapitre, TIMING.FORCE_GLOBAL_QUIZ_TIME) ignore la
 * limite propre à la question.
 */
export function getQuestionTime(opts: {
  questionLimit?: number | null;
  schoolTime?: number | null;
  customTime?: number | null;
  forceGlobal?: boolean;
} = {}): number {
  const { userTime, tiersTemps } = readQuizTimeSettings();
  const questionLimit = opts.forceGlobal ? null : opts.questionLimit;
  const base = opts.customTime || opts.schoolTime || questionLimit || userTime;
  return applyTiersTemps(base, tiersTemps);
}
