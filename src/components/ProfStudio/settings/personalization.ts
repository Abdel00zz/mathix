import type { DashboardThemeId } from '../dashboardThemes';

export type ProfPersonalization = {
  revision: {
    textScale: number;
    showSolutions: boolean;
    paperTheme: 'classic' | 'white' | 'dark' | 'amber';
    /**
     * Mode lecture (double-clic sur un bloc) : révèle les éléments un par un,
     * comme une diapositive PowerPoint, au lieu de tout afficher d'un coup.
     */
    progressiveReveal: boolean;
    /**
     * Titres-question des blocs repliables (propriété, définition, théorème,
     * méthode…). Décoché : le titre disparaît **et** le bloc ne se replie plus —
     * le contenu s'affiche d'emblée dans son encadré, sans bouton « Afficher ».
     * Les aides d'exercice (indice, solution, énoncé) gardent leur repli.
     */
    showBlockTitles: boolean;
  };
  quiz: {
    showCorrections: boolean;
    shuffleQuestions: boolean;
  };
  exercise: {
    answerSpaceStyle: 'seyes' | 'slate' | 'grid' | 'dotted' | 'blank';
    answerSpaceColor: 'white' | 'cream' | 'black' | 'green' | 'blue';
    oneQuestionPerPage: boolean;
  };
  /**
   * Fonctionnalités du canvas manuscrit, pilotables depuis les paramètres
   * tablette du professeur. Tout est actif par défaut : un professeur qui ne
   * touche à rien garde le comportement historique.
   */
  canvas: {
    /** Zones de dessin elles-mêmes (réponse, annotation, tableau). */
    enabled: boolean;
    /** Boutons « … » qui ouvrent une zone de dessin. */
    showTriggers: boolean;
    /** Blancs interactifs « ______ » (révélation au clic). */
    showBlanks: boolean;
    /** Barre d'outils flottante du canvas. */
    showToolbar: boolean;
  };
  /** Thème de couleurs du dashboard (synchronisé avec le compte). */
  dashboardTheme: DashboardThemeId;
};

const PREFS_KEY = 'mathplus:prof-personalization';

/** Émis à chaque enregistrement : les vues abonnées se resynchronisent. */
export const PROF_PREFS_CHANGED_EVENT = 'mathplus:prof-personalization-changed';

export const DEFAULT_PREFS: ProfPersonalization = {
  revision: { textScale: 1, showSolutions: true, paperTheme: 'classic', progressiveReveal: false, showBlockTitles: true },
  quiz: { showCorrections: true, shuffleQuestions: false },
  exercise: {
    answerSpaceStyle: 'grid',
    answerSpaceColor: 'white',
    oneQuestionPerPage: false,
  },
  canvas: {
    enabled: true,
    showTriggers: true,
    showBlanks: true,
    showToolbar: true,
  },
  dashboardTheme: 'default',
};

export function loadProfPersonalization(): ProfPersonalization {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (!raw) return { ...DEFAULT_PREFS };
    const parsed = JSON.parse(raw) as Partial<ProfPersonalization> & {
      exercise?: Partial<ProfPersonalization['exercise']> & { showCanvas?: boolean };
    };
    // Migration : l'ancien réglage `exercise.showCanvas` devient l'interrupteur
    // maître `canvas.enabled` (même valeur, aucune perte pour les profils déjà
    // enregistrés).
    const legacyCanvasDisabled = parsed.canvas === undefined && parsed.exercise?.showCanvas === false;
    return {
      revision: { ...DEFAULT_PREFS.revision, ...(parsed.revision || {}) },
      quiz: { ...DEFAULT_PREFS.quiz, ...(parsed.quiz || {}) },
      exercise: { ...DEFAULT_PREFS.exercise, ...(parsed.exercise || {}) },
      canvas: {
        ...DEFAULT_PREFS.canvas,
        ...(legacyCanvasDisabled ? { enabled: false } : {}),
        ...(parsed.canvas || {}),
      },
      dashboardTheme: parsed.dashboardTheme || DEFAULT_PREFS.dashboardTheme,
    };
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

export function saveProfPersonalization(prefs: ProfPersonalization): void {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    // Stockage restreint : les préférences restent actives pour la session.
  }
  // Diffusé hors du cycle de rendu : les abonnés (`useProfPersonalization`)
  // se remettent à jour sans rechargement de page.
  if (typeof window !== 'undefined') {
    queueMicrotask(() => window.dispatchEvent(new Event(PROF_PREFS_CHANGED_EVENT)));
  }
}
