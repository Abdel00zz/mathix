import {
  RevisionBlock,
  RevisionBlockVisibilitySettings,
  RevisionNumberingKey,
  RevisionNumberingSettings,
  RevisionSection,
} from '../types';
import { NUMBERED_TYPES, normalizeBlockType } from './revisionBlockTypes';

export const computeGlobalNumbering = (
  sections: RevisionSection[],
  numberingSettings?: RevisionNumberingSettings
) => {
  const numbering: Record<string, number> = {};
  const typeCounts: Record<string, number> = {};

  sections.forEach((section) => {
    section.blocks?.forEach((block) => {
      const typeKey = normalizeBlockType(block.type);
      if (NUMBERED_TYPES.has(typeKey)) {
        typeCounts[typeKey] = (typeCounts[typeKey] || 0) + 1;
      }
    });
  });

  const currentCounters: Record<string, number> = {};
  sections.forEach((section) => {
    section.blocks?.forEach((block, index) => {
      const typeKey = normalizeBlockType(block.type);
      if (numberingSettings && numberingSettings[typeKey as RevisionNumberingKey] === false) {
        return;
      }
      // Les indices et les méthodes sont toujours numérotés ("Indice 1, 2, 3…", "Méthode 1, 2, 3…"), même seuls ;
      // les autres types ne le sont que lorsqu'ils apparaissent plusieurs fois.
      if ((typeCounts[typeKey] || 0) > 1 || typeKey === 'hint' || typeKey === 'method') {
        currentCounters[typeKey] = (currentCounters[typeKey] || 0) + 1;
        numbering[`${section.id}-${index}`] = currentCounters[typeKey];
      }
    });
  });

  return numbering;
};

export const isBlockVisible = (block: RevisionBlock, visibility: RevisionBlockVisibilitySettings) => {
  // `note` est un cas historique : il dépend de deux réglages distincts alors
  // que le normalisateur partagé le ramène à `remark`. On l'intercepte avant.
  const rawType = (block.type || '').trim().toLowerCase();
  if (rawType === 'note') {
    return visibility.note !== false && visibility.remark !== false;
  }

  // Normalisation obligatoire : un `type` mal orthographié (`methode`,
  // `applicaion`…) doit être filtré comme son type canonique.
  switch (normalizeBlockType(block.type)) {
    case 'method':
      return visibility.method !== false;
    case 'application':
    case 'example':
      return visibility.example !== false;
    case 'exploration':
      return visibility.exploration !== false;
    case 'proof':
      return visibility.proof !== false;
    case 'remark':
      return visibility.remark !== false;
    case 'intuition':
      return visibility.intuition !== false;
    case 'summary':
      return visibility.summary !== false;
    default:
      return true;
  }
};

export const filterSectionsByVisibility = (
  sections: RevisionSection[],
  visibility: RevisionBlockVisibilitySettings
) => {
  return sections.flatMap((section) => {
    if (section.category === 'method' && visibility.method === false) {
      return [];
    }

    if (!section.blocks) {
      return [section];
    }

    const filteredBlocks = section.blocks.filter((block) => isBlockVisible(block, visibility));
    if (filteredBlocks.length === 0 && !section.content?.trim()) {
      return [];
    }

    return [{ ...section, blocks: filteredBlocks }];
  });
};

export const isValidSeance = (value: RevisionSection['seance']): value is number =>
  Number.isInteger(value) && (value ?? 0) > 0;

export const getSeancePlan = (sections: RevisionSection[]) => {
  const seances = sections.map((section) => section.seance);
  const validSeances = seances.filter(isValidSeance);

  if (validSeances.length === 0) {
    return { totalSeances: 0, isComplete: false };
  }

  const totalSeances = Math.max(...validSeances);
  const coveredSeances = new Set(validSeances);
  const coversEverySeance = Array.from(
    { length: totalSeances },
    (_, index) => coveredSeances.has(index + 1)
  ).every(Boolean);
  const followsLearningOrder = validSeances.every(
    (seance, index) => index === 0 || seance === validSeances[index - 1] || seance === validSeances[index - 1] + 1
  );

  return {
    totalSeances,
    isComplete:
      validSeances.length === sections.length &&
      validSeances[0] === 1 &&
      validSeances.at(-1) === totalSeances &&
      coversEverySeance &&
      followsLearningOrder,
  };
};
