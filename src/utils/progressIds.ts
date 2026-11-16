
// Centralized helpers for stable progress IDs.
// Goal: avoid inconsistencies between modules and ensure global uniqueness.

const SEP = '#';

/**
 * Creates a unique identifier for a sub-question progress item.
 * Ensures that the ID structure is consistent across the application.
 */
export function makeExerciseProgressId(exerciseId: string, questionId: string, subQuestionId: string): string {
  // Trim and ensure we don't have empty segments
  const eId = exerciseId.trim();
  const qId = questionId.trim();
  const sqId = subQuestionId.trim();
  
  return `${eId}${SEP}${qId}${SEP}${sqId}`;
}
