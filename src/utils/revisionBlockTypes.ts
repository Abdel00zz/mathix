// ─────────────────────────────────────────────────────────────────────────────
// Taxonomie des blocs de révision — SOURCE UNIQUE DE VÉRITÉ.
//
// Historiquement, trois normalisateurs divergents coexistaient
// (`RevisionView`, `RevisionSectionBlock` et `courseBlock/blockUtils`) : un même
// `type` du JSON pouvait donc être numéroté, espacé, annoté ou rendu
// différemment selon le composant qui le lisait. Un bloc `"type": "technique"`
// devenait par exemple `rappel` côté rendu — donc jamais révélable, alors que
// `REVEALABLE` contient justement `technique`.
//
// Toute règle portant sur les types de blocs doit désormais vivre ici.
// ─────────────────────────────────────────────────────────────────────────────

/** Fautes de frappe observées dans les fiches JSON (tolérance à la saisie). */
const APPLICATION_TYPE_ALIASES = new Set([
  'application', 'applicaoin', 'applicaion', 'applicatoin', 'appclaoin', 'applcaoin',
]);
const EXAMPLE_TYPE_ALIASES = new Set([
  'example', 'exemple', 'exmpale', 'exmale', 'examle', 'exaple',
]);

/**
 * Synonymes français d'un type possédant sa propre clé canonique anglaise.
 * Les fiches sont rédigées en français : une clé `lemme` ou `corollaire` doit
 * désigner le même bloc que `lemma` / `corollary`, sans quoi elle perdrait son
 * badge, son numéro et sa règle de révélation.
 */
const FRENCH_TYPE_SYNONYMS: Record<string, string> = {
  methode: 'method',
  lemme: 'lemma',
  corollaire: 'corollary',
  consequence: 'consequence',
  strategie: 'strategy',
  definition: 'definition',
  theoreme: 'theorem',
  proposition: 'proposition',
  propriete: 'property',
  demonstration: 'proof',
  preuve: 'proof',
  remarque: 'remark',
  attention: 'warning',
  avertissement: 'warning',
  intuition: 'intuition',
  indice: 'hint',
  solution: 'solution',
  probleme: 'problem',
  activite: 'exploration',
  exploration: 'exploration',
  technique: 'technique',
  rappel: 'rappel',
  resume: 'summary',
  introduction: 'intro',
  paragraphe: 'text',
};

/**
 * Ramène un `type` brut de JSON vers sa clé canonique.
 *
 * Règles volontairement conservatrices : on ne fusionne que les synonymes
 * strictement équivalents et les fautes de frappe. Les types qui possèdent leur
 * propre libellé (`technique`, `rappel`, `strategy`, `lemma`…) restent
 * distincts — les écraser ferait perdre l'intention de l'auteur.
 */
export const normalizeBlockType = (type?: string): string => {
  if (!type) return '';
  const normalized = type.trim().toLowerCase();
  if (!normalized) return '';
  if (normalized === 'note') return 'remark';
  if (normalized === 'indices' || normalized === 'indice') return 'hint';
  const synonym = FRENCH_TYPE_SYNONYMS[normalized];
  if (synonym) return synonym;
  if (APPLICATION_TYPE_ALIASES.has(normalized)) return 'application';
  if (EXAMPLE_TYPE_ALIASES.has(normalized)) return 'example';
  return normalized;
};

/** Types dont le contenu est caché par défaut : l'élève cherche, puis révèle. */
export const REVEALABLE = new Set([
  'definition', 'theorem', 'proposition', 'property', 'lemma', 'corollary',
  'consequence', 'technique', 'method', 'strategy',
  'hint', 'solution', 'problem',
]);

/**
 * Aides d'exercice dont le repli reste indispensable, même lorsque le professeur
 * masque les titres des blocs (paramètres tablette) : le badge (« Indice 2 »,
 * « Solution », « Énoncé ») tient lieu d'en-tête, et révéler la réponse d'emblée
 * viderait l'exercice de son intérêt.
 */
export const REVEAL_AIDS = new Set(['hint', 'solution', 'problem']);

/**
 * Le bloc doit-il se lire « à plat » — badge puis contenu, sans titre-question
 * ni bouton « Afficher » ? C'est le cas quand le professeur a décoché
 * « Afficher les titres des blocs » : les encadrés repliables de cours perdent
 * les deux, les aides d'exercice gardent leur repli.
 */
export const shouldFlattenReveal = (typeKey: string, showBlockTitles: boolean): boolean => (
  !showBlockTitles && REVEALABLE.has(typeKey) && !REVEAL_AIDS.has(typeKey)
);

/** Types dont le titre est mis en forme comme une question (marqueur « ? »). */
export const STYLISH_QUESTION_TYPES = new Set([
  'definition', 'theorem', 'proposition', 'property', 'method',
]);

/** Types portés par un encadré sémantique (badge + filet de couleur). */
export const ALL_SEMANTIC = new Set([
  'definition', 'theorem', 'proposition', 'property', 'technique', 'rappel', 'method', 'warning',
  'application', 'example', 'exploration', 'remark', 'note', 'strategy', 'proof',
  'lemma', 'corollary', 'consequence', 'intuition', 'summary', 'intro',
  'problem', 'hint', 'solution',
]);

/** Types dont le contenu est toujours aligné à gauche (puces, méthodes). */
export const ALWAYS_LEFT = new Set(['method', 'technique', 'rappel', 'strategy']);

/** Types légèrement agrandis (+3 %) : énoncés majeurs du cours. */
export const ENLARGE_TYPES = new Set(['definition', 'theorem', 'proposition', 'property', 'method']);

/** Blocs de pratique : on y travaille, la correction reste repliable. */
export const PRACTICE_TYPES = new Set(['application', 'example']);

/**
 * Types sous lesquels la zone manuscrite « Stylo » est proposée : les encadrés
 * théoriques et les blocs de pratique. Volontairement découplé des jeux
 * d'espacement/rendu pour que l'ajout d'un type n'ouvre pas la zone par effet
 * de bord.
 */
export const ANNOTATABLE_TYPES = new Set([
  'definition', 'theorem', 'proposition', 'property', 'technique', 'method',
  'exploration', 'warning', 'strategy', 'problem', 'hint', 'solution',
  'example', 'application',
]);

/**
 * Types participant à la numérotation « Définition 1, 2… », « Méthode 1, 2… ».
 * Un type n'est numéroté en continu que s'il apparaît plusieurs fois, sauf
 * `hint` et `method` qui le sont toujours (voir `computeGlobalNumbering`).
 */
export const NUMBERED_TYPES = new Set([
  'definition', 'theorem', 'proposition', 'property', 'technique', 'method',
  'application', 'example', 'exploration', 'warning', 'remark', 'hint',
]);
