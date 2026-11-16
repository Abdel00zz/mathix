/**
 * Fusion serveur de la progression (module pur, sans dépendance réseau).
 *
 * Extrait de `api/progress.ts` pour pouvoir être testé sans charger le client
 * Redis, Resend et web-push que `shared.ts` construit à l'import.
 *
 * Convention : `local` est ce que le client vient d'envoyer, `cloud` ce qui est
 * déjà stocké. Chaque dimension garde la valeur la plus avancée.
 */

const MASTERY_RANK: Record<string, number> = { high: 3, medium: 2, low: 1, skipped: 0 };

export function mergeArraysUnique<T>(a?: T[], b?: T[]): T[] {
  return Array.from(new Set([...(a || []), ...(b || [])]));
}

export function mergeObjects(
  base: Record<string, any> | undefined,
  incoming: Record<string, any> | undefined,
  mergeFn: (existing: any, next: any) => any,
): Record<string, any> {
  const result: Record<string, any> = { ...(base || {}) };
  for (const [id, val] of Object.entries(incoming || {})) {
    result[id] = result[id] ? mergeFn(result[id], val) : val;
  }
  return result;
}

/**
 * Progression par fiche : une clé par fiche, le pourcentage le plus élevé gagne.
 * Renvoie `undefined` quand aucun des deux côtés n'en déclare, pour ne pas
 * introduire un champ vide dans les chapitres à fiche unique.
 */
function mergeSheetProgress(
  a?: Record<string, number>,
  b?: Record<string, number>,
): Record<string, number> | undefined {
  if (!a && !b) return undefined;
  const merged: Record<string, number> = { ...(b || {}) };
  for (const [sheet, value] of Object.entries(a || {})) {
    merged[sheet] = Math.max(Number(value) || 0, Number(merged[sheet]) || 0);
  }
  return merged;
}

export function mergeChapter(local: any, cloud: any): any {
  if (!cloud) return local;
  if (!local) return cloud;

  const lQuiz = local.quiz || {};
  const cQuiz = cloud.quiz || {};
  const lHist = lQuiz.history || [];
  const cHist = cQuiz.history || [];
  const lastActiveAt = Math.max(Number(local.lastActiveAt) || 0, Number(cloud.lastActiveAt) || 0);
  const bySheet = mergeSheetProgress(local.revisionProgressBySheet, cloud.revisionProgressBySheet);

  return {
    revisionProgress: Math.max(local.revisionProgress || 0, cloud.revisionProgress || 0),
    ...(bySheet ? { revisionProgressBySheet: bySheet } : {}),
    ...(lastActiveAt > 0 ? { lastActiveAt } : {}),
    lastActiveSection: local.lastActiveSection || cloud.lastActiveSection,
    revealedBlanks: mergeArraysUnique(local.revealedBlanks, cloud.revealedBlanks),
    masteredSkills: mergeArraysUnique(local.masteredSkills, cloud.masteredSkills),
    completedSeances: mergeArraysUnique(local.completedSeances, cloud.completedSeances),

    quiz: {
      isSubmitted: lQuiz.isSubmitted || cQuiz.isSubmitted,
      score: Math.max(lQuiz.score || 0, cQuiz.score || 0),
      highScore: Math.max(lQuiz.highScore || 0, cQuiz.highScore || 0),
      attempts: Math.max(lQuiz.attempts || 0, cQuiz.attempts || 0),
      history: lHist.length >= cHist.length ? lHist : cHist,
      currentQuestionIndex: lQuiz.currentQuestionIndex ?? cQuiz.currentQuestionIndex,
      totalQuestions: lQuiz.totalQuestions ?? cQuiz.totalQuestions,
      answersSnapshot: lQuiz.answersSnapshot || cQuiz.answersSnapshot,
      durationSeconds: lQuiz.durationSeconds ?? cQuiz.durationSeconds,
    },

    exercises: mergeObjects(cloud.exercises, local.exercises, (cEx: any, lEx: any) => ({
      isCompleted: lEx.isCompleted || cEx.isCompleted,
      mastery: (MASTERY_RANK[lEx.mastery] || 0) >= (MASTERY_RANK[cEx.mastery] || 0) ? lEx.mastery : cEx.mastery,
      lastHintIndex: Math.max(lEx.lastHintIndex || 0, cEx.lastHintIndex || 0),
    })),
    exerciseFeedback: mergeObjects(cloud.exerciseFeedback, local.exerciseFeedback, (cFb: any, lFb: any) => {
      const cVal = typeof cFb === 'string' ? cFb : (cFb?.value || 'skipped');
      const lVal = typeof lFb === 'string' ? lFb : (lFb?.value || 'skipped');
      return (MASTERY_RANK[lVal] || 0) >= (MASTERY_RANK[cVal] || 0) ? lFb : cFb;
    }),
    exerciseDurations: mergeObjects(cloud.exerciseDurations, local.exerciseDurations, (cDur: any, lDur: any) =>
      Math.max(cDur || 0, lDur || 0),
    ),

    isChapterSubmitted: local.isChapterSubmitted || cloud.isChapterSubmitted,
    submittedAt: local.submittedAt || cloud.submittedAt,
  };
}

export function mergeProgress(
  incoming: Record<string, any> | undefined,
  existing: Record<string, any> | undefined,
): Record<string, any> {
  const allKeys = new Set([...Object.keys(incoming || {}), ...Object.keys(existing || {})]);
  const merged: Record<string, any> = {};
  allKeys.forEach(key => {
    merged[key] = mergeChapter(incoming?.[key], existing?.[key]);
  });
  return merged;
}

/**
 * Fusionne deux relevés indexés par une clé, en gardant la valeur la plus
 * élevée. Sert au journal de travail et aux séances pointées : deux appareils
 * peuvent en écrire chacun une partie, aucun ne doit écraser l'autre.
 */
export function mergeByKey(a: any, b: any, keyField: string, valueField: string): any[] {
  const out = new Map<string, any>();
  for (const list of [a, b]) {
    if (!Array.isArray(list)) continue;
    for (const entry of list) {
      const k = entry?.[keyField];
      if (typeof k !== 'string') continue;
      const prev = out.get(k);
      if (!prev || (Number(entry[valueField]) || 0) > (Number(prev[valueField]) || 0)) {
        out.set(k, entry);
      }
    }
  }
  return [...out.values()];
}
