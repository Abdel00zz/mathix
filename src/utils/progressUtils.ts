
/**
 * Utilitaires pour le calcul de progression unifié
 *
 * Algorithmes pondérés avancés :
 * - Quiz : formule mixte complétion × (base + bonus × précision)
 * - Révision : poids adaptatifs proportionnels au contenu réel
 * - Exercices : pondération par niveau de maîtrise
 */

import { ChapterProgress, MasteryLevel } from "../types";

// ── Constantes de pondération ────────────────────────────────────────────────

/** Poids par niveau de maîtrise pour les exercices */
/** Poids relatif d'une compétence par rapport à un blanc (révision) */
const MASTERY_WEIGHTS: Record<NonNullable<MasteryLevel>, number> = {
    high: 1.0,
    medium: 0.7,
    low: 0.4,
    skipped: 0.1,
};

/** Part de la progression quiz attribuée à la complétion seule (le reste dépend de la précision) */
const QUIZ_COMPLETION_BASE = 0.4;
/** Part bonus liée à la précision (complétion_base + accuracy_bonus = 1.0 max) */
const QUIZ_ACCURACY_BONUS = 0.6;

// ── Quiz ─────────────────────────────────────────────────────────────────────

/**
 * Calcule le pourcentage de progression du quiz avec pondération mixte.
 *
 * Formule : completionRate × (BASE + BONUS × accuracyRate) × 100
 *
 * - 10/10 répondu, tout juste  → 1.0 × (0.4 + 0.6×1.0) = 100%
 * - 10/10 répondu, tout faux   → 1.0 × (0.4 + 0.6×0.0) = 40%
 * - 5/10 répondu, tout juste   → 0.5 × (0.4 + 0.6×1.0) = 50%
 * - 5/10 répondu, tout faux    → 0.5 × (0.4 + 0.6×0.0) = 20%
 * - Quiz soumis (isSubmitted)   → 100% (verrouillé)
 */
export const computeQuizProgress = (
    progress: ChapterProgress | undefined,
    totalQuestions: number
): number => {
    if (!progress?.quiz) return 0;
    if (progress.quiz.isSubmitted) return 100;

    const history = progress.quiz.history || [];
    if (history.length === 0) return 0;

    // Regrouper par questionId → garder la dernière réponse
    const latestByQuestion = new Map<string, boolean>();
    for (const entry of history) {
        latestByQuestion.set(entry.questionId, entry.isCorrect);
    }

    const uniqueAnswered = latestByQuestion.size;
    const correctCount = Array.from(latestByQuestion.values()).filter(Boolean).length;

    const total = progress.quiz.totalQuestions || totalQuestions;
    if (total <= 0) return 0;

    const completionRate = Math.min(1, uniqueAnswered / total);
    const accuracyRate = uniqueAnswered > 0 ? correctCount / uniqueAnswered : 0;

    const raw = completionRate * (QUIZ_COMPLETION_BASE + QUIZ_ACCURACY_BONUS * accuracyRate) * 100;
    return Math.min(100, Math.round(raw));
};

// ── Révision ─────────────────────────────────────────────────────────────────

/**
 * Calcule la progression de révision à partir des interactions du cours.
 *
 * Lorsqu'un parcours est découpé en séances, chaque validation forme une
 * borne ferme. Les interactions font progresser l'élève dans la séance
 * courante, sans valider la suivante à sa place.
 */
export const computeRevisionProgress = (
    revealedBlanks: number,
    totalBlanks: number,
    completedSeanceCount = 0,
    totalSeances = 0
): number => {
    const hasBlanks = totalBlanks > 0;

    if (!hasBlanks && totalSeances <= 0) return 0;

    const interactionPercent = totalBlanks > 0
        ? Math.round((Math.min(revealedBlanks, totalBlanks) / totalBlanks) * 100)
        : 0;

    if (totalSeances > 0) {
        const completed = Math.min(Math.max(completedSeanceCount, 0), totalSeances);
        const sessionFloor = (completed / totalSeances) * 100;

        if (completed >= totalSeances) return 100;

        // Les interactions montrent l'avancement à l'intérieur de la séance
        // courante, sans permettre d'atteindre la prochaine borne avant sa
        // validation explicite.
        const nextSessionBoundary = ((completed + 1) / totalSeances) * 100;
        const boundedInteraction = Math.min(interactionPercent, nextSessionBoundary - 1);
        return Math.max(Math.round(sessionFloor), Math.round(boundedInteraction));
    }

    const rounded = interactionPercent;

    // Empêcher 100% si tout n'est pas réellement complété
    const blanksComplete = !hasBlanks || revealedBlanks >= totalBlanks;
    if (rounded >= 100 && !blanksComplete) return 99;
    return Math.min(100, rounded);
};

// ── Exercices ────────────────────────────────────────────────────────────────

/**
 * Calcule la progression d'exercices pondérée par le niveau de maîtrise.
 *
 * Un exercice « high » compte pour 100%, « medium » pour 70%, etc.
 * Cela donne un signal plus fidèle : 5 exercices "skipped" ≠ 5 exercices "high".
 */
const _computeExerciseProgress = (
    exerciseFeedback: Record<string, MasteryLevel> | undefined,
    totalExerciseCount: number
): number => {
    if (!exerciseFeedback || totalExerciseCount <= 0) return 0;

    const entries = Object.values(exerciseFeedback);
    if (entries.length === 0) return 0;

    let weightedSum = 0;
    for (const level of entries) {
        weightedSum += MASTERY_WEIGHTS[level || 'skipped'] ?? 0.1;
    }

    const raw = (weightedSum / totalExerciseCount) * 100;
    const rounded = Math.round(raw);

    // Empêcher 100% si tous les exercices n'ont pas de feedback
    if (rounded >= 100 && entries.length < totalExerciseCount) return 99;
    return Math.min(100, rounded);
};

// ── Global (legacy compat) ───────────────────────────────────────────────────

/**
 * Calcule le pourcentage global d'un chapitre (si nécessaire ailleurs)
 */
const _computeChapterGlobalProgress = (
    progress: ChapterProgress | undefined,
    hasExercises: boolean
): number => {
    if (!progress) return 0;

    const quizPercent = progress.quiz.isSubmitted ? 100 : 0;
    const revisionPercent = progress.revisionProgress || 0;

    if (hasExercises) {
        return Math.round(quizPercent * 0.2 + revisionPercent * 0.1);
    } else {
        return Math.round(quizPercent * 0.7 + revisionPercent * 0.3);
    }
};
