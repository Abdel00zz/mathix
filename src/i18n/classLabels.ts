import type { Language } from './translations';

/**
 * Libellés des niveaux du programme marocain. Les identifiants et les données
 * de cours restent inchangés : seule la présentation de l'interface varie.
 */
const ARABIC_CLASS_LABELS: Record<string, string> = {
  'tronc-commun-sc': 'الجذع المشترك العلمي',
  '1ere-annee-college': 'الأولى إعدادي',
  '2eme-annee-college': 'الثانية إعدادي',
  '3eme-annee-college': 'الثالثة إعدادي',
  '1ere-bac-sc-math': 'الأولى باك علوم رياضية',
  '1ere-bac-sc-ex': 'الأولى باك علوم تجريبية',
  '2eme-bac-sc-math': 'الثانية باك علوم رياضية',
  '2eme-bac-sc-ex': 'الثانية باك علوم تجريبية',
  '2eme-bac-sc-pc': 'الثانية باك علوم فيزيائية',
  '2eme-bac-sc-svt': 'الثانية باك علوم الحياة والأرض',
};

export function translateClassLabel(classId: string | undefined, originalLabel: string | undefined, lang: Language): string {
  if (lang !== 'ar') return originalLabel || '';
  return ARABIC_CLASS_LABELS[classId || ''] || originalLabel || '';
}

/**
 * Les intitulés de chapitres restent en français, à l'exception du parcours
 * d'entrée « Mise à niveau », dont l'intitulé pédagogique arabe est demandé.
 * Les données de contenu ne sont jamais modifiées.
 */
export function translateChapterLabel(chapterId: string | undefined, originalLabel: string | undefined, lang: Language): string {
  if (lang === 'ar' && chapterId === 'mise-a-niveau') return 'تقويم تشخيصي';
  return originalLabel || '';
}
