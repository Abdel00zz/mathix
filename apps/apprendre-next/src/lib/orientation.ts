import {
  ORIENTATION_PROGRAMS,
  type EnrichedOrientationChapter,
  type EnrichedOrientationProgram,
} from './orientationData';
import type { ClassId } from './types';

export { ORIENTATION_PROGRAMS };
export type { EnrichedOrientationChapter, EnrichedOrientationProgram };

export interface OrientationInfoItem {
  label: string;
  value: string;
}

const CLASS_ORDER: readonly ClassId[] = [
  'tronc-commun-sc',
  '1ere-bac-sc-ex',
  '1ere-bac-sc-math',
  '2eme-bac-sc-ex',
  '2eme-bac-sc-math',
];

/** Official curriculum metadata (coefficient, weekly hours, assessments) per class. */
export const ORIENTATION_CLASS_META: Record<ClassId, readonly OrientationInfoItem[]> = {
  'tronc-commun-sc': [
    { label: 'Coefficient Général', value: '4' },
    { label: 'Volume Horaire', value: '5 h / semaine' },
    { label: 'Évaluations', value: '3 à 4 Devoirs Surveillés' },
  ],
  '1ere-bac-sc-ex': [
    { label: 'Coefficient Général', value: '7' },
    { label: 'Volume Horaire', value: '5 h / semaine' },
    { label: 'Évaluations', value: '3 Devoirs Surveillés' },
  ],
  '1ere-bac-sc-math': [
    { label: 'Coefficient Général', value: '9' },
    { label: 'Volume Horaire', value: '7 à 8 h / semaine' },
    { label: 'Évaluations', value: '4 Devoirs Surveillés' },
  ],
  '2eme-bac-sc-ex': [
    { label: 'Coefficient Général', value: '7' },
    { label: 'Volume Horaire', value: '5 h / semaine' },
    { label: 'Évaluations', value: '3 Devoirs Surveillés' },
    { label: 'Examen National', value: 'Coefficient 7' },
  ],
  '2eme-bac-sc-math': [
    { label: 'Coefficient Général', value: '9' },
    { label: 'Volume Horaire', value: '8 à 9 h / semaine' },
    { label: 'Évaluations', value: '4 Devoirs Surveillés' },
    { label: 'Examen National', value: 'Coefficient 9' },
  ],
};

/** Returns the official orientation curriculum program for a class, defaulting to 2ème Bac Sc. Ex. */
export function getOrientationProgram(clsId: ClassId | string): EnrichedOrientationProgram {
  if (Object.prototype.hasOwnProperty.call(ORIENTATION_PROGRAMS, clsId)) {
    return ORIENTATION_PROGRAMS[clsId as ClassId];
  }
  return ORIENTATION_PROGRAMS['2eme-bac-sc-ex'];
}

/** Returns all 5 official orientation curriculum programs in curriculum order. */
export function getAllOrientationPrograms(): EnrichedOrientationProgram[] {
  return CLASS_ORDER.map((id) => ORIENTATION_PROGRAMS[id]);
}

/** Returns official coefficient, hours, and assessment benchmarks for a class. */
export function getOrientationClassMeta(clsId: ClassId | string): readonly OrientationInfoItem[] {
  if (Object.prototype.hasOwnProperty.call(ORIENTATION_CLASS_META, clsId)) {
    return ORIENTATION_CLASS_META[clsId as ClassId];
  }
  return ORIENTATION_CLASS_META['2eme-bac-sc-ex'];
}

/** Returns the direct study route (`/lecon/:id` or `/quiz/:id`) for an orientation chapter when backed by content. */
export function getOrientationChapterHref(
  chapter: Pick<EnrichedOrientationChapter, 'chapterId' | 'targetKind'>
): string | null {
  if (!chapter.chapterId) return null;
  const slug = encodeURIComponent(chapter.chapterId);
  return chapter.targetKind === 'quiz' ? `/quiz/${slug}` : `/lecon/${slug}`;
}

/** Returns a concise CTA label matching the target chapter resource (`Ouvrir la leçon` or `Ouvrir le quiz`). */
export function getOrientationChapterActionLabel(
  chapter: Pick<EnrichedOrientationChapter, 'chapterId' | 'targetKind'>
): string | null {
  if (!chapter.chapterId) return null;
  return chapter.targetKind === 'quiz' ? 'Ouvrir le quiz' : 'Ouvrir la leçon';
}
