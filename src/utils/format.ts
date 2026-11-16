
/**
 * format.ts - Utilitaires de formatage de texte et nombres
 */

/**
 * Renvoie le numéro sous forme de chaîne sans zéro initial (ex: 7 -> "7")
 */
const pad2 = (n: number | string): string => {
  return String(n);
};

/**
 * Formate un label numéroté (ex: "Définition", 1 -> "Définition 1")
 * Si le numéro est absent, renvoie juste le label.
 */
export const formatNumberedLabel = (label: string, number?: number): string => {
  if (number === undefined) return label;
  return `${label} ${pad2(number)}`;
};
