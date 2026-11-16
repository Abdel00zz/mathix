export type LoadingContext =
  | 'dashboard'
  | 'lesson'
  | 'problem'
  | 'exercise'
  | 'quiz'
  | 'concours'
  | 'profile'
  | 'framework'
  | 'studio'
  | 'general';

export const LOADING_DURATION_MS = 320;

export const inferLoadingContext = (label?: string): LoadingContext => {
  const value = (label || '').toLocaleLowerCase('fr-FR');
  if (value.includes('dashboard') || value.includes('tableau')) return 'dashboard';
  if (value.includes('leçon') || value.includes('lecon') || value.includes('révision') || value.includes('revision')) return 'lesson';
  if (value.includes('problème') || value.includes('probleme')) return 'problem';
  if (value.includes('exercice') || value.includes('examen')) return 'exercise';
  if (value.includes('quiz')) return 'quiz';
  if (value.includes('concours')) return 'concours';
  if (value.includes('profil') || value.includes('connexion') || value.includes('compte')) return 'profile';
  if (value.includes('cadre') || value.includes('référentiel')) return 'framework';
  if (value.includes('studio')) return 'studio';
  return 'general';
};
