import type { ClassId } from './types';

export type AppNavTabId = 'learn' | 'examens' | 'problemes' | 'prepa';

export interface ExerciseRatingMeta {
  readonly level: 0 | 1 | 2;
  readonly modalLabel: string;
  readonly shortLabel: string;
  readonly unifiedLabel: string;
  readonly description: string;
}

export interface LibraryEmptyCopy {
  title: string;
  description: string;
  ctaLabel: string;
  ctaHref: string;
}

export interface StepGuardCopy {
  title: string;
  body: string;
  primaryLabel: string;
  primaryTarget: 'lesson' | 'quiz';
  secondaryLabel: string;
}

export interface QuizEndGuidance {
  headline: string;
  advice: string;
  categoryHint: string | null;
}

const QUIZ_THRESHOLD_PCT = 10;
const EXERCISE_THRESHOLD_PCT = 15;
const TWO_BAC_CLASSES = new Set<ClassId>(['2eme-bac-sc-ex', '2eme-bac-sc-math']);

/** Formats the student greeting without inventing a placeholder first name. */
export function formatStudentGreeting(firstName?: string | null): string {
  const clean = String(firstName ?? '').trim();
  return clean ? `Bonjour ${clean}` : 'Bonjour';
}

export const DASHBOARD_TAGLINE = 'Une leçon, un quiz, des exercices — à votre rythme.';

export const NAV_LABELS: Record<AppNavTabId, { desktop: string; mobile: string }> = {
  learn: { desktop: 'Apprendre', mobile: 'Apprendre' },
  examens: { desktop: 'Examens Nationaux', mobile: 'Examens' },
  problemes: { desktop: 'Problèmes', mobile: 'Problèmes' },
  prepa: { desktop: 'Prépa Concours', mobile: 'Prépa' },
};

export const MOBILE_MENU_LABEL = 'Outils';

export function getDashboardSubtitle(tabId: AppNavTabId): string {
  switch (tabId) {
    case 'examens':
      return 'Sujets officiels corrigés pour s’entraîner en conditions Bac.';
    case 'problemes':
      return 'Problèmes de synthèse guidés pour relier plusieurs chapitres.';
    case 'prepa':
      return 'Quiz chronométrés et annales ENSA, ENSAM et Médecine.';
    default:
      return DASHBOARD_TAGLINE;
  }
}

/** Concrete French guidance explaining why a chapter quiz is still locked. */
export function getQuizLockHint(lessonPct?: number): string {
  if (typeof lessonPct === 'number' && lessonPct > 0 && lessonPct < QUIZ_THRESHOLD_PCT) {
    return `Encore quelques lignes dans la leçon (${lessonPct}\u00a0% / ${QUIZ_THRESHOLD_PCT}\u00a0%) pour débloquer le quiz`;
  }
  return `Parcourez le début de la leçon (${QUIZ_THRESHOLD_PCT}\u00a0%) pour débloquer le quiz`;
}

/** Concrete French guidance explaining how many quiz questions unlock chapter exercises. */
export function getExercisesLockHint(
  hasQuiz: boolean,
  done = 0,
  total = 0
): string {
  if (!hasQuiz) {
    return `Parcourez le début de la leçon (${QUIZ_THRESHOLD_PCT}\u00a0%) pour débloquer les exercices`;
  }
  if (total > 0) {
    const needed = Math.max(1, Math.ceil((EXERCISE_THRESHOLD_PCT * total) / 100));
    const remaining = Math.max(0, needed - Math.max(0, done));
    if (remaining > 0) {
      return done > 0
        ? `Encore ${remaining} question${remaining > 1 ? 's' : ''} au quiz pour débloquer les exercices`
        : `Traitez ${needed} question${needed > 1 ? 's' : ''} du quiz (${EXERCISE_THRESHOLD_PCT}\u00a0%) pour débloquer les exercices`;
    }
    return `Terminez ou avancez le quiz (${EXERCISE_THRESHOLD_PCT}\u00a0%) pour débloquer les exercices`;
  }
  return `Traitez au moins ${EXERCISE_THRESHOLD_PCT}\u00a0% du quiz pour débloquer les exercices`;
}

/** Formats the sub-label of a chapter lesson step without contradicting completed state. */
export function formatLessonStepDetail(opts: {
  lessonPct: number;
  resumePct?: number | null;
  sectionLabel?: string;
}): string {
  const { lessonPct, resumePct, sectionLabel } = opts;
  if (lessonPct >= 100) {
    if (typeof resumePct === 'number' && resumePct > 0 && resumePct < 97) {
      return `Fiche lue · relu à ${resumePct}\u00a0%`;
    }
    return 'Terminé';
  }
  if (lessonPct > 0) {
    return sectionLabel ? `${lessonPct}\u00a0% · ${sectionLabel}` : `${lessonPct}\u00a0% lu`;
  }
  return 'Fiche de cours';
}

export const LOCKED_STEP_LABEL = 'Verrouillé';

export function getQuizGuardCopy(lessonPct?: number): StepGuardCopy {
  return {
    title: 'Quiz verrouillé',
    body: getQuizLockHint(lessonPct),
    primaryLabel: 'Ouvrir la leçon',
    primaryTarget: 'lesson',
    secondaryLabel: 'Retour au programme',
  };
}

export function getExercisesGuardCopy(opts: {
  quizLocked: boolean;
  hasLesson: boolean;
  hasQuiz: boolean;
  lessonPct?: number;
  quizDone?: number;
  quizTotal?: number;
}): StepGuardCopy {
  if (opts.quizLocked && opts.hasLesson) {
    return {
      title: 'Exercices verrouillés',
      body: 'Ouvrez d’abord la leçon (10\u00a0%) pour débloquer le quiz, puis traitez quelques questions pour accéder aux exercices.',
      primaryLabel: 'Ouvrir la leçon',
      primaryTarget: 'lesson',
      secondaryLabel: 'Retour au programme',
    };
  }
  return {
    title: 'Exercices verrouillés',
    body: getExercisesLockHint(opts.hasQuiz, opts.quizDone ?? 0, opts.quizTotal ?? 0),
    primaryLabel: opts.hasQuiz ? 'Ouvrir le quiz' : 'Ouvrir la leçon',
    primaryTarget: opts.hasQuiz ? 'quiz' : 'lesson',
    secondaryLabel: 'Retour au programme',
  };
}

/** Pedagogical empty states per hub tab and student level. */
export function getLibraryEmptyCopy(
  tabId: Exclude<AppNavTabId, 'learn'>,
  classId: ClassId,
  hasActiveFilter = false
): LibraryEmptyCopy {
  if (tabId === 'examens') {
    if (!TWO_BAC_CLASSES.has(classId)) {
      return {
        title: 'Les Examens Nationaux concernent la 2ème Bac',
        description:
          'Dans cette filière, entraînez-vous chapitre par chapitre (leçon, quiz et exercices guidés) depuis Apprendre. Les annales officielles du Baccalauréat sont disponibles en 2ème Bac Sc. Ex et Sc. Math.',
        ctaLabel: 'Retourner à Apprendre',
        ctaHref: '/',
      };
    }
    return {
      title: 'Aucun sujet pour ce filtre',
      description: 'Réinitialisez le filtre pour afficher toutes les sessions Normale et Rattrapage.',
      ctaLabel: 'Tout afficher',
      ctaHref: '/examens',
    };
  }

  if (tabId === 'problemes') {
    if (classId === '1ere-bac-sc-ex' && !hasActiveFilter) {
      return {
        title: 'Problèmes de synthèse bientôt disponibles pour cette filière',
        description:
          'Pour la 1ère Bac Sc. Ex, les séries d’exercices et quiz thématiques sont directement accessibles chapitre par chapitre.',
        ctaLabel: 'Ouvrir Apprendre',
        ctaHref: '/',
      };
    }
    return {
      title: 'Aucun problème disponible pour ce filtre',
      description: 'Affichez tous les thèmes ou poursuivez votre programme par chapitre.',
      ctaLabel: 'Retourner à Apprendre',
      ctaHref: '/',
    };
  }

  return {
    title: 'Aucune épreuve trouvée pour cette sélection',
    description: 'Affichez tous les concours pour parcourir les quiz et annales ENSA, ENSAM et Médecine.',
    ctaLabel: 'Voir tous les concours',
    ctaHref: '/prepa',
  };
}

export const PREPA_COPY = {
  quizzesHeading: 'Quiz thématiques d’entraînement',
  annalesHeading: 'Annales officielles chronométrées',
  levelHint: 'Préparation post-Bac (niveau 2ème Bac) — format QCM concours chronométré.',
} as const;

/** Unified self-assessment ratings shared between the validation dialog and exercise pills. */
export const EXERCISE_RATINGS: readonly ExerciseRatingMeta[] = [
  {
    level: 0,
    modalLabel: 'Difficile · À revoir',
    shortLabel: 'À revoir',
    unifiedLabel: 'Difficile · À revoir',
    description: 'Des étapes restent floues, à reprendre bientôt',
  },
  {
    level: 1,
    modalLabel: 'Correct · Presque',
    shortLabel: 'Presque',
    unifiedLabel: 'Correct · Presque',
    description: 'Méthode comprise, encore quelques hésitations',
  },
  {
    level: 2,
    modalLabel: 'Facile · Maîtrisé',
    shortLabel: 'Maîtrisé',
    unifiedLabel: 'Facile · Maîtrisé',
    description: 'Résolution fluide et rédaction maîtrisée',
  },
] as const;

export const EXERCISE_COPY = {
  evaluateCta: 'S’auto-évaluer et voir le corrigé',
  updateEvaluationCta: 'Modifier mon auto-évaluation',
  revealCorrectionCta: 'Afficher le corrigé',
  dialogTitle: 'Bilan de cet exercice',
  dialogQuestion: 'Comment s’est passée votre résolution ?',
  summaryTitle: 'Bilan de la série',
  reviewWeakLabel: (count: number) => (count > 0 ? `À revoir (${count})` : 'À revoir'),
  allExercisesLabel: 'Tous les exercices',
} as const;

export const UNLOCK_TOASTS = {
  quizUnlocked: 'Quiz du chapitre débloqué — testez vos acquis !',
  exercisesUnlocked: 'Exercices d’entraînement débloqués !',
} as const;

export const LESSON_BRIDGE_COPY = {
  nextSheetCta: 'Fiche suivante',
  goToQuizCta: 'Passer au quiz du chapitre',
  backToProgrammeCta: 'Retour au programme',
  testModeRevealAll: 'Tout révéler',
  testModeHideAll: 'Mode test (masquer)',
  studyTip: 'Astuce : cliquez sur les zones grisées pour tester votre mémoire, ou double-cliquez sur un bloc pour le passer en mode focus.',
} as const;

export const QUIZ_COPY = {
  tiersTempsShort: '+33%',
  tiersTempsTitle: 'Tiers-temps (+33\u00a0%) — allonge le minuteur de chaque question',
  timerTrainLabel: 'Sans chrono',
  timerExamLabel: (isConcours: boolean) => (isConcours ? 'Chrono concours' : 'Chrono Bac'),
  reviewErrorsActive: (count: number) => `Refaire les erreurs (${count})`,
  goToExercisesCta: 'Passer aux exercices',
  reopenLessonCta: 'Revoir la leçon',
  confirmSkipped: (skippedCount: number) => ({
    title: 'Terminer le quiz ?',
    message: `${skippedCount} question${skippedCount > 1 ? 's' : ''} sans réponse. Voulez-vous y revenir ou afficher le bilan ?`,
    confirmLabel: 'Voir le bilan',
    cancelLabel: 'Revenir aux questions',
  }),
} as const;

/** Score-calibrated pedagogical advice displayed on the quiz summary screen. */
export function getQuizEndGuidance(opts: {
  pct: number;
  kind: 'chapter' | 'concours';
  hasLesson: boolean;
  hasExercises: boolean;
  exercisesUnlocked: boolean;
  weakestCategory?: string | null;
}): QuizEndGuidance {
  const categoryHint = opts.weakestCategory
    ? `Point à consolider en priorité : ${opts.weakestCategory}`
    : null;

  if (opts.pct < 50) {
    return {
      headline: 'Notions à consolider',
      advice:
        opts.kind === 'concours'
          ? 'Reprenez les automatismes de base sur ces questions puis refaites vos erreurs sans précipitation.'
          : opts.hasLesson
            ? 'Relisez les méthodes clés de la fiche de cours, puis refaites vos erreurs avant d’aborder les exercices.'
            : 'Refaites vos erreurs pour ancrer chaque étape du raisonnement.',
      categoryHint,
    };
  }

  if (opts.pct < 80) {
    return {
      headline: 'Bon socle, presque maîtrisé',
      advice:
        opts.exercisesUnlocked && opts.hasExercises
          ? 'Refaites les quelques questions manquées ou enchaînez avec les exercices rédigés.'
          : 'Refaites vos erreurs pour viser au moins 80\u00a0% de maîtrise.',
      categoryHint,
    };
  }

  return {
    headline: opts.kind === 'concours' ? 'Solide rythme concours !' : 'Chapitre bien acquis !',
    advice:
      opts.kind === 'concours'
        ? 'Excellente réactivité. Passez à une annale ou à un autre thème pour garder ce rythme.'
        : opts.hasExercises
          ? 'Vous êtes prêt(e) pour les exercices rédigés et la mise en pratique.'
          : 'Passez au chapitre suivant ou explorez les problèmes de synthèse.',
    categoryHint,
  };
}

export const CLOUD_SYNC_COPY = {
  syncLabels: {
    idle: 'Local',
    syncing: 'Synchronisation…',
    synced: 'Synchronisé',
    pending: 'En attente de réseau',
    offline: 'Hors-ligne',
    error: 'Synchronisation indisponible',
  },
  localOnlyBadge: 'Cet appareil',
  cloudReadyBadge: 'Compte Google',
  localOnlyHint: 'Votre progression est enregistrée localement sur cet appareil.',
  notConfiguredHint: 'Progression enregistrée sur cet appareil. Connectez-vous dès que la sauvegarde cloud est active.',
  portalBackLabel: 'Revenir au Programme',
} as const;

export const ORIENTATION_COPY = {
  title: 'Programme officiel',
  subtitle: 'Contenus et capacités attendues par filière',
  openLessonCta: 'Ouvrir la leçon',
  openQuizCta: 'Ouvrir le quiz',
  noDirectChapterLabel: 'Programme théorique',
} as const;
