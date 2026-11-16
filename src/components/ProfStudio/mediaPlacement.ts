/**
 * Vocabulaire des placements d'image, par contexte d'édition.
 *
 * « En dessous du texte » ne dit rien dans un exercice : le professeur ne sait
 * pas si la figure tombera sous l'énoncé général, sous la question ou sous
 * l'indice. Chaque contexte reçoit donc ses propres libellés, plus une phrase
 * qui explique où la figure apparaîtra réellement — y compris quand le bloc se
 * révèle (propriété, théorème) ou reste toujours visible (activité).
 */
import type { MediaAnchor, MediaPosition } from '../../types';
import { REVEALABLE } from '../../utils/revisionBlockTypes';
import type { MediaZoneKind } from '../../utils/mediaGallery';
import { findContentQuestions, type ContentQuestion } from '../../utils/contentQuestions';

export type PlacementContext =
  | 'generic'
  | 'exercise-lead'
  | 'exercise-question'
  | 'exercise-subquestion'
  | 'exercise-text'
  | 'application'
  | 'activity'
  | 'reveal';

export interface PlacementOption { value: MediaPosition; label: string }

/** Zone du bloc à laquelle une figure s'associe. */
export interface PlacementZone {
  id: MediaAnchor;
  label: string;
  /** Ce que la zone contient, quand ce n'est pas évident. */
  detail: string;
  options: PlacementOption[];
  /**
   * Questions de la liste du bloc, pour la zone `item` : le professeur doit
   * reconnaître la question visée, pas la deviner d'après son numéro.
   */
  questions?: ContentQuestion[];
}

export interface Placement {
  /**
   * Zones proposées. Une seule zone pour un bloc qui se lit d'un trait : le
   * choix d'association n'a alors pas de sens et n'est pas affiché.
   */
  zones: PlacementZone[];
  hint?: string;
}

export const hasZoneChoice = (placement: Placement): boolean => placement.zones.length > 1;

export const zoneOf = (placement: Placement, anchor: MediaAnchor): PlacementZone =>
  placement.zones.find(zone => zone.id === anchor) || placement.zones[0];

/** Placements de base, partagés par tous les contextes « texte ». */
const inline: PlacementOption[] = [
  { value: 'inline', label: 'En ligne, avant le texte' },
  { value: 'inline-right', label: 'En ligne, après le texte' },
];

const around = (of: string): PlacementOption[] => [
  { value: 'top', label: `Au-dessus ${of}` },
  { value: 'bottom', label: `En dessous ${of}` },
  { value: 'left', label: `Colonne à gauche ${of}` },
  { value: 'right', label: `Colonne à droite ${of}` },
  { value: 'float-left', label: `Habillage à gauche ${of}` },
  { value: 'float-right', label: `Habillage à droite ${of}` },
  ...inline,
];

/** D'où la figure est placée, dans les mots du contexte. */
const SUBJECT: Partial<Record<PlacementContext, string>> = {
  'exercise-lead': "de l'énoncé",
  'exercise-question': 'de la question',
  'exercise-subquestion': 'de la sous-question',
  'exercise-text': 'du texte',
  activity: "de l'activité",
  reveal: 'du contenu',
};

const HINT: Partial<Record<PlacementContext, string>> = {
  'exercise-lead': "L'énoncé général reste au-dessus des questions : « en dessous » place la figure après lui, avant la première question.",
  'exercise-question': "La figure accompagne la question et reste avant ses sous-questions, quelles que soient ses dimensions.",
  'exercise-subquestion': "Chaque sous-question porte sa propre figure : elle reste collée à sa ligne (a., b., c.), sans décaler les suivantes.",
  'exercise-text': "Bloc de texte libre de l'exercice : la figure se place par rapport à ce paragraphe uniquement.",
  activity: "L'activité s'affiche d'un seul tenant : sa figure reste visible avec le reste du bloc.",
  reveal: "Une figure du contenu se découvre avec lui ; une figure de l'énoncé reste visible, à côté du titre.",
};

/**
 * Contexte déduit du type de bloc. Les contextes d'exercice sont préfixés
 * (`exercise-…`) et ne peuvent donc pas être confondus avec un type de bloc :
 * un bloc de fiche nommé `exercise` relèverait de la fiche, pas du document
 * d'exercice.
 */
export function placementContext(blockType?: string): PlacementContext {
  const key = (blockType || '').trim().toLowerCase();
  if (key.startsWith('exercise-')) return key as PlacementContext;
  if (key === 'application') return 'application';
  if (key === 'exploration' || key === 'activity' || key === 'activite') return 'activity';
  if (REVEALABLE.has(key)) return 'reveal';
  return 'generic';
}

/** Famille de zones d'un contexte : sert à déduire la zone par défaut d'une figure. */
export function zoneKindOf(blockType?: string): MediaZoneKind {
  const context = placementContext(blockType);
  if (context === 'application') return 'application';
  if (context === 'reveal') return 'reveal';
  return 'single';
}

/** Enoncé d'un exercice d'application : visible sans rien révéler. */
const APPLICATION_LEAD_OPTIONS: PlacementOption[] = [
  { value: 'top', label: "Au-dessus de l'énoncé" },
  { value: 'bottom', label: "En dessous de l'énoncé" },
  { value: 'left', label: "Colonne à gauche de l'énoncé" },
  { value: 'right', label: "Colonne à droite de l'énoncé" },
  { value: 'float-left', label: "Habillage à gauche de l'énoncé" },
  { value: 'float-right', label: "Habillage à droite de l'énoncé" },
  { value: 'inline', label: 'Dans la question (à gauche)' },
  { value: 'inline-right', label: 'Dans la question (à droite)' },
];

/** Correction repliable : la figure ne s'affiche qu'une fois la correction ouverte. */
const APPLICATION_CONTENT_OPTIONS: PlacementOption[] = [
  { value: 'bottom', label: 'En bas de la correction' },
  { value: 'top', label: 'Au-dessus de la correction' },
  { value: 'left', label: 'Colonne à gauche de la correction' },
  { value: 'right', label: 'Colonne à droite de la correction' },
  { value: 'float-left', label: 'Habillage à gauche de la correction' },
  { value: 'float-right', label: 'Habillage à droite de la correction' },
  { value: 'inline', label: 'Dans la correction (à gauche)' },
  { value: 'inline-right', label: 'Dans la correction (à droite)' },
];

function placementForType(blockType?: string): Placement {
  const context = placementContext(blockType);

  if (context === 'application') {
    return {
      zones: [
        {
          id: 'lead',
          label: "Avec l'énoncé",
          detail: "Visible d'emblée, sans rien déplier.",
          options: APPLICATION_LEAD_OPTIONS,
        },
        {
          id: 'content',
          label: 'Avec la correction',
          detail: "N'apparaît qu'à l'ouverture de la correction.",
          options: APPLICATION_CONTENT_OPTIONS,
        },
      ],
      hint: "Une figure de l'énoncé sert à travailler ; une figure de la correction sert à vérifier. L'exercice d'application se lit en deux temps, d'où les deux associations.",
    };
  }

  if (context === 'reveal') {
    return {
      zones: [
        {
          id: 'content',
          label: 'Avec le contenu',
          detail: 'Apparaît avec le contenu à découvrir.',
          options: around(SUBJECT.reveal || 'du contenu'),
        },
        {
          id: 'lead',
          label: "Avec l'énoncé",
          detail: "Reste visible, à côté du titre, même replié.",
          options: [
            { value: 'right', label: "Colonne à droite de l'énoncé" },
            { value: 'left', label: "Colonne à gauche de l'énoncé" },
            { value: 'top', label: "Au-dessus de l'énoncé" },
            { value: 'bottom', label: "En dessous de l'énoncé" },
            { value: 'float-left', label: "Habillage à gauche de l'énoncé" },
            { value: 'float-right', label: "Habillage à droite de l'énoncé" },
            ...inline,
          ],
        },
      ],
      hint: HINT.reveal,
    };
  }

  if (context === 'generic') {
    return {
      zones: [{
        id: 'content',
        label: 'Avec le texte',
        detail: 'Le bloc s\'affiche d\'un seul tenant.',
        options: [
          { value: 'top', label: 'Au-dessus du texte' },
          { value: 'bottom', label: 'En dessous du texte' },
          { value: 'left', label: 'Colonne à gauche' },
          { value: 'right', label: 'Colonne à droite' },
          { value: 'float-left', label: 'Habillage à gauche' },
          { value: 'float-right', label: 'Habillage à droite' },
          ...inline,
        ],
      }],
    };
  }

  const subject = SUBJECT[context] || 'du texte';
  return {
    zones: [{
      id: 'content',
      label: 'Avec le texte',
      detail: 'Le bloc s\'affiche d\'un seul tenant.',
      options: around(subject),
    }],
    hint: HINT[context],
  };
}

/**
 * Zone « une question de la liste ».
 *
 * Un bloc d'application ou de propriété porte souvent une liste numérotée : la
 * figure peut alors se glisser **entre deux questions**, au-dessus ou en
 * dessous de celle que le professeur désigne — au lieu de rester à côté du bloc
 * entier. Les questions sont listées telles que l'élève les lira.
 */
function itemZone(questions: ContentQuestion[]): PlacementZone {
  return {
    id: 'item',
    label: 'Avec une question de la liste',
    detail: "La figure se glisse entre deux questions ; la numérotation continue.",
    options: [
      { value: 'top', label: 'Au-dessus de la question' },
      { value: 'bottom', label: 'En dessous de la question' },
    ],
    questions,
  };
}

/**
 * Placements proposés pour un bloc.
 *
 * @param blockType Type de bloc, ou contexte d'exercice (`exercise-question`…).
 * @param content   Contenu du bloc : sert à détecter la liste de questions.
 */
export function placementFor(blockType?: string, content?: string): Placement {
  const placement = placementForType(blockType);
  const questions = content ? findContentQuestions(content) : [];
  if (questions.length === 0) return placement;
  return {
    ...placement,
    zones: [...placement.zones, itemZone(questions)],
    hint: placement.hint,
  };
}
