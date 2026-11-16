export type ChoiceFeedbackState =
  | 'idle'
  | 'selected'
  | 'correct'
  | 'incorrect'
  | 'selected-incorrect';

/**
 * Distingue le distracteur incorrect de la réponse incorrecte effectivement
 * choisie. Après validation, toutes les propositions reçoivent un état clair :
 * vert pour la bonne réponse et rouge pour chaque réponse à écarter.
 */
export const getChoiceFeedbackState = (
  showStatus: boolean,
  isCorrect: boolean,
  isSelected: boolean,
): ChoiceFeedbackState => {
  if (!showStatus) return isSelected ? 'selected' : 'idle';
  if (isCorrect) return 'correct';
  return isSelected ? 'selected-incorrect' : 'incorrect';
};
