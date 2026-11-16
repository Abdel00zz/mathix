import { useEffect, useRef, useState } from 'react';
import type { UserProfile } from '../../../types';
import { getDashboardTheme, type DashboardThemeId } from '../dashboardThemes';
import {
  loadProfPersonalization,
  saveProfPersonalization,
  type ProfPersonalization,
} from './personalization';

interface UsePersonalizationSettingsOptions {
  isOpen: boolean;
  onUpdateProfile?: (updates: Partial<UserProfile>) => void;
  baseProfPrefs?: UserProfile['profPrefs'];
  baseDashboardTheme?: UserProfile['dashboardTheme'];
}

function resolveInitialPrefs(
  baseProfPrefs?: UserProfile['profPrefs'],
  baseDashboardTheme?: UserProfile['dashboardTheme'],
): ProfPersonalization {
  const local = loadProfPersonalization();
  const revision = baseProfPrefs?.revision || {};
  const quiz = baseProfPrefs?.quiz || {};
  const exercise = baseProfPrefs?.exercise || {};
  const canvas = baseProfPrefs?.canvas || {};

  return {
    revision: {
      ...local.revision,
      ...(typeof revision.textScale === 'number' ? { textScale: revision.textScale } : {}),
      ...(typeof revision.showSolutions === 'boolean' ? { showSolutions: revision.showSolutions } : {}),
      ...(['classic', 'white', 'dark', 'amber'].includes(revision.paperTheme || '')
        ? { paperTheme: revision.paperTheme as ProfPersonalization['revision']['paperTheme'] }
        : {}),
      ...(typeof revision.progressiveReveal === 'boolean' ? { progressiveReveal: revision.progressiveReveal } : {}),
      ...(typeof revision.showBlockTitles === 'boolean' ? { showBlockTitles: revision.showBlockTitles } : {}),
    },
    quiz: {
      ...local.quiz,
      ...(typeof quiz.showCorrections === 'boolean' ? { showCorrections: quiz.showCorrections } : {}),
      ...(typeof quiz.shuffleQuestions === 'boolean' ? { shuffleQuestions: quiz.shuffleQuestions } : {}),
    },
    exercise: {
      ...local.exercise,
      ...(['seyes', 'slate', 'grid', 'dotted', 'blank'].includes(exercise.answerSpaceStyle || '')
        ? { answerSpaceStyle: exercise.answerSpaceStyle as ProfPersonalization['exercise']['answerSpaceStyle'] }
        : {}),
      ...(['white', 'cream', 'black', 'green', 'blue'].includes(exercise.answerSpaceColor || '')
        ? { answerSpaceColor: exercise.answerSpaceColor as ProfPersonalization['exercise']['answerSpaceColor'] }
        : {}),
      ...(typeof exercise.oneQuestionPerPage === 'boolean' ? { oneQuestionPerPage: exercise.oneQuestionPerPage } : {}),
    },
    // Le compte porte la valeur canonique ; `exercise.showCanvas` reste lu pour
    // migrer les profils enregistrés avant l'arrivée du groupe `canvas`.
    canvas: {
      ...local.canvas,
      ...(typeof canvas.enabled === 'boolean'
        ? { enabled: canvas.enabled }
        : (exercise.showCanvas === false ? { enabled: false } : {})),
      ...(typeof canvas.showTriggers === 'boolean' ? { showTriggers: canvas.showTriggers } : {}),
      ...(typeof canvas.showBlanks === 'boolean' ? { showBlanks: canvas.showBlanks } : {}),
      ...(typeof canvas.showToolbar === 'boolean' ? { showToolbar: canvas.showToolbar } : {}),
    },
    // Le compte est la source de vérité. Le stockage local ne sert que de
    // repli hors ligne ou pour les anciens profils sans thème synchronisé.
    dashboardTheme: getDashboardTheme(baseDashboardTheme || local.dashboardTheme).id,
  };
}

export function usePersonalizationSettings({
  isOpen,
  onUpdateProfile,
  baseProfPrefs,
  baseDashboardTheme,
}: UsePersonalizationSettingsOptions) {
  const [prefs, setPrefs] = useState<ProfPersonalization>(() => (
    resolveInitialPrefs(baseProfPrefs, baseDashboardTheme)
  ));
  const [textScale, setTextScale] = useState(() => baseProfPrefs?.textScale || 1);
  const baseProfPrefsRef = useRef(baseProfPrefs);

  useEffect(() => { baseProfPrefsRef.current = baseProfPrefs; }, [baseProfPrefs]);

  useEffect(() => {
    if (isOpen) saveProfPersonalization(prefs);
  }, [isOpen, prefs]);

  // Les réglages de contenu peuvent être ajustés en continu : ils restent
  // enregistrés avec un léger délai pour ne pas multiplier les écritures.
  // Le thème d'affichage, lui, est appliqué immédiatement dans la fonction
  // dédiée ci-dessous.
  useEffect(() => {
    if (!isOpen || !onUpdateProfile) return;
    const timer = window.setTimeout(() => {
      onUpdateProfile({
        profPrefs: {
          ...(baseProfPrefsRef.current || {}),
          textScale,
          revision: prefs.revision,
          quiz: prefs.quiz,
          exercise: prefs.exercise,
          canvas: prefs.canvas,
        },
      });
    }, 700);
    return () => window.clearTimeout(timer);
  }, [isOpen, prefs.revision, prefs.quiz, prefs.exercise, prefs.canvas, onUpdateProfile, textScale]);

  const patch = (updates: Partial<ProfPersonalization>) => {
    setPrefs(previous => ({ ...previous, ...updates }));
  };

  const patchRevision = (updates: Partial<ProfPersonalization['revision']>) => {
    patch({ revision: { ...prefs.revision, ...updates } });
  };

  const patchQuiz = (updates: Partial<ProfPersonalization['quiz']>) => {
    patch({ quiz: { ...prefs.quiz, ...updates } });
  };

  const patchExercise = (updates: Partial<ProfPersonalization['exercise']>) => {
    patch({ exercise: { ...prefs.exercise, ...updates } });
  };

  const patchCanvas = (updates: Partial<ProfPersonalization['canvas']>) => {
    patch({ canvas: { ...prefs.canvas, ...updates } });
  };

  const setDashboardTheme = (dashboardTheme: DashboardThemeId) => {
    // L'écriture est faite HORS de l'updater : `saveProfPersonalization`
    // notifie ses abonnés, ce qui ne doit jamais se produire pendant le rendu.
    const next = { ...prefs, dashboardTheme };
    saveProfPersonalization(next);
    setPrefs(next);
    // `onUpdateProfile` met à jour le dashboard parent dans le même geste :
    // les variables de couleur changent donc dès le clic sur une palette.
    onUpdateProfile?.({ dashboardTheme });
  };

  return {
    prefs,
    textScale,
    setTextScale,
    patch,
    patchRevision,
    patchQuiz,
    patchExercise,
    patchCanvas,
    setDashboardTheme,
  };
}
