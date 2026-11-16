/**
 * Exercise Engine v2.0 - Refactored for Clarity & Simplicity
 * Parses exercise JSON into a structured, intuitive format for rendering.
 */

import { Exercise, SubQuestion, MediaConfig } from '../../../types';

const IS_DEV = typeof import.meta !== 'undefined' && (import.meta as any).env?.DEV === true;

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

type QuestionType = 'question' | 'partie' | 'text';

export interface ParsedSubQuestion {
    id: string;
    uniqueId: string;
    content: string;
    hint: string;
    hasHint: boolean;
    correction?: string;
    bareme?: number;
    media?: MediaConfig;
}

export interface ParsedQuestion {
    id: string;
    type: QuestionType;
    content: string;
    media?: MediaConfig;
    subQuestions: ParsedSubQuestion[];
}

export interface ParsedExercise {
    id: string;
    topic: string;
    context?: string;
    sessionDate?: Date;
    isLive: boolean;
    requiresRedaction: boolean;
    media?: MediaConfig;
    questions: ParsedQuestion[];
    flatSubQuestionIds: string[];
    totalSubQuestions: number;
}

// ═══════════════════════════════════════════════════════════════════════════════
// PARSER CORE
// ═══════════════════════════════════════════════════════════════════════════════

const normalizeType = (type?: string): QuestionType => {
    if (!type) return 'question';
    const t = type.toLowerCase();
    if (t === 'partie' || t === 'header') return 'partie';
    if (t === 'text') return 'text';
    return 'question';
};

/**
 * Flattens a sub-question tree onto the single level the renderer supports.
 *
 * The UI renders exactly two levels (question > sub-question). Authored data
 * occasionally nests a third one; rather than dropping those nodes — which
 * removes statements from the screen with no error anywhere — we splice them in
 * as siblings so every authored statement stays reachable. `scripts/validate-content.mjs`
 * reports the offending files so the data can be fixed at the source; this is
 * the safety net, not the intended shape.
 */
const parseSubQuestions = (
    sqs: SubQuestion[],
    exerciseId: string,
    questionId: string,
    flatIds: string[]
): ParsedSubQuestion[] => {
    const out: ParsedSubQuestion[] = [];

    const visit = (sq: SubQuestion) => {
        const children = sq.subQuestions || [];
        const hasContent = Boolean((sq.content || '').trim());

        // A pure container (no statement of its own) contributes nothing but its
        // children; emitting it would add an empty labelled row.
        if (hasContent || children.length === 0) {
            const uniqueId = `${exerciseId}-${questionId}-${sq.id}`;
            flatIds.push(uniqueId);
            out.push({
                id: sq.id,
                uniqueId,
                content: sq.content || '',
                hint: sq.hint || '',
                hasHint: Boolean(sq.hint?.trim()),
                correction: sq.correction,
                bareme: sq.bareme,
                media: sq.media,
            });
        }

        if (children.length && IS_DEV) {
            console.warn(
                `[ExerciseEngine] ${exerciseId} — « ${questionId} > ${sq.id} » dépasse les 2 niveaux de rendu ; ` +
                `${children.length} sous-question(s) ont été remontées au niveau supérieur. ` +
                `Corriger la donnée : npm run validate:content`
            );
        }
        children.forEach(visit);
    };

    sqs.forEach(visit);
    return out;
};

export const parseExercise = (exercise: Exercise): ParsedExercise => {
    const flatSubQuestionIds: string[] = [];

    const questions: ParsedQuestion[] = (exercise.questions || []).map(q => {
        const type = normalizeType(q.type);
        const content = q.content || '';
        const hint = (q as any).hint || ''; // Legacy support for hint directly on a question

        let subQuestions: ParsedSubQuestion[] = [];

        if (q.subQuestions && q.subQuestions.length > 0) {
            // Standard case: question has an array of sub-questions
            subQuestions = parseSubQuestions(q.subQuestions, exercise.id, q.id, flatSubQuestionIds);
        } else if (type === 'question' && content.trim()) {
            // Compatibility Case: "Flat" question where content/hint are on the question itself.
            // We model this as a question with ONE sub-question to unify the data structure for the renderer.
            // This avoids complex conditional rendering logic later.
            const uniqueId = `${exercise.id}-${q.id}-main`;
            flatSubQuestionIds.push(uniqueId);
            subQuestions.push({
                id: 'main',
                uniqueId,
                content, // The main content becomes the content of this single sub-question
                hint,
                hasHint: Boolean(hint.trim()),
                correction: (q as any).correction,
                media: q.media,
            });
        }
        
        return {
            id: q.id,
            type,
            // If it was a flat question, the main content was moved to the sub-question.
            // If it's a 'partie' or a question with its own sub-questions, content is kept.
            content: (type === 'question' && subQuestions.length === 1 && subQuestions[0].id === 'main') ? '' : content,
            media: q.media,
            subQuestions,
        };
    });

    let sessionDate: Date | undefined;
    let isLive = false;
    if (exercise.sessionDate) {
        sessionDate = new Date(exercise.sessionDate);
        const now = new Date();
        const diffMinutes = (now.getTime() - sessionDate.getTime()) / (1000 * 60);
        isLive = diffMinutes >= 0 && diffMinutes <= 120;
    }

    return {
        id: exercise.id,
        topic: exercise.topic || '',
        context: exercise.context,
        sessionDate,
        isLive,
        requiresRedaction: exercise.requiresRedaction || false,
        media: exercise.media,
        questions,
        flatSubQuestionIds,
        totalSubQuestions: flatSubQuestionIds.length
    };
};

// ═══════════════════════════════════════════════════════════════════════════════
// NAVIGATION HELPERS
// ═══════════════════════════════════════════════════════════════════════════════
