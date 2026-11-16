/**
 * Règle d'ouverture de la page « élèves présents » (mode prof, tablette).
 *
 * La page de séance — celle qui liste les présents et leurs résultats — n'a de
 * sens que si un appel a été fait. Sans aucun présent déclaré, le professeur
 * entre directement dans la révision, le quiz ou les exercices.
 *
 * La décision est relue à chaque clic : dès qu'un élève est ajouté à l'appel
 * (depuis le PC ou depuis la tablette), la page se réactive d'elle-même.
 */
export const shouldShowSessionGate = (presentCount: number, attendanceLoaded: boolean): boolean => (
  // Présence inconnue : on ne saute jamais une page par accident.
  !attendanceLoaded || presentCount > 0
);
