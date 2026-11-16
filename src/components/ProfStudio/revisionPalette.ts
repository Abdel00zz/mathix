/**
 * Palette des types de blocs du studio d'édition.
 *
 * La LISTE des types vient de la taxonomie partagée (`REVISION_BLOCK_TYPES`) :
 * un type ajouté au moteur de révision apparaît ici automatiquement, on ne peut
 * donc plus l'oublier — c'était le cas des types théoriques ajoutés depuis
 * (`lemma`, `corollary`, `consequence`, `strategy`, `rappel`).
 *
 * Seuls le libellé d'édition et le rangement en groupes sont propres au studio.
 * Le test `revisionPalette.test.ts` verrouille ces invariants.
 */
import { REVISION_BLOCK_TYPES } from '../../types';
import type { RevisionBlockType } from '../../types';
import { normalizeBlockType } from '../../utils/revisionBlockTypes';

export type PaletteGroup = 'structure' | 'cours' | 'pratique' | 'aide';

export type RevisionPaletteEntry = {
  type: RevisionBlockType;
  label: string;
  group: PaletteGroup;
};

const GROUP_OF: Record<RevisionBlockType, PaletteGroup> = {
  text: 'structure',
  intro: 'structure',
  summary: 'structure',
  definition: 'cours',
  theorem: 'cours',
  proposition: 'cours',
  property: 'cours',
  lemma: 'cours',
  corollary: 'cours',
  consequence: 'cours',
  technique: 'cours',
  rappel: 'cours',
  method: 'cours',
  strategy: 'cours',
  cela_permet_de: 'cours',
  example: 'pratique',
  application: 'pratique',
  exploration: 'pratique',
  problem: 'pratique',
  proof: 'aide',
  remark: 'aide',
  note: 'aide',
  warning: 'aide',
  intuition: 'aide',
  hint: 'aide',
  solution: 'aide',
};

/** Libellés d'édition : plus courts que ceux de la fiche rendue à l'élève. */
const LABEL_OF: Record<RevisionBlockType, string> = {
  text: 'Paragraphe',
  intro: 'Introduction',
  summary: 'Résumé',
  definition: 'Définition',
  theorem: 'Théorème',
  proposition: 'Proposition',
  property: 'Propriété',
  lemma: 'Lemme',
  corollary: 'Corollaire',
  consequence: 'Conséquence',
  technique: 'Technique',
  rappel: 'Rappel',
  method: 'Méthode',
  strategy: 'Stratégie',
  cela_permet_de: 'Cela permet de',
  example: 'Exemple',
  application: 'Application',
  exploration: 'Activité',
  problem: 'Problème',
  proof: 'Démonstration',
  remark: 'Remarque',
  note: 'Note',
  warning: 'Attention',
  intuition: 'Intuition',
  hint: 'Indice',
  solution: 'Solution',
};

/**
 * Ordre du menu : la progression pédagogique du cours, pas l'ordre d'union des
 * types. Un type absent est ajouté en fin de groupe plutôt que d'être perdu.
 */
const PALETTE_ORDER: RevisionBlockType[] = [
  'text', 'intro', 'summary',
  'definition', 'theorem', 'proposition', 'property', 'lemma', 'corollary', 'consequence',
  'method', 'strategy', 'technique', 'rappel', 'cela_permet_de',
  'example', 'application', 'exploration', 'problem',
  'proof', 'remark', 'note', 'warning', 'intuition', 'hint', 'solution',
];

export const PALETTE_GROUPS: PaletteGroup[] = ['structure', 'cours', 'pratique', 'aide'];

export const GROUP_LABEL: Record<PaletteGroup, string> = {
  structure: 'Structure',
  cours: 'Cours',
  pratique: 'Pratique',
  aide: 'Aide',
};

export const revisionPalette: RevisionPaletteEntry[] = [
  ...PALETTE_ORDER,
  ...REVISION_BLOCK_TYPES.filter((type) => !PALETTE_ORDER.includes(type)),
].map((type) => ({
  type,
  label: LABEL_OF[type] ?? type,
  group: GROUP_OF[type] ?? 'cours',
}));

const BY_TYPE: Record<string, RevisionPaletteEntry> = Object.fromEntries(
  revisionPalette.map((entry) => [entry.type, entry]),
);

/**
 * Entrée correspondant à un type de bloc, en tolérant les orthographes
 * historiques (`methode`, `applicaion`…) grâce au normalisateur partagé.
 */
export const revisionPaletteEntry = (type: string | undefined): RevisionPaletteEntry | undefined => {
  if (!type) return undefined;
  const raw = type.trim().toLowerCase();
  return BY_TYPE[raw] ?? BY_TYPE[normalizeBlockType(raw)];
};

/** Libellé d'édition d'un type, avec repli sur le type brut si inconnu. */
export const revisionTypeLabel = (type: string | undefined): string =>
  revisionPaletteEntry(type)?.label ?? (type ?? '');
