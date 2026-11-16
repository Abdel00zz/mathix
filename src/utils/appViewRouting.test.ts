import { describe, expect, it } from 'vitest';
import { isKnownAppView, resolveViewForUser } from './appViewRouting';
import type { UserProfile } from '../types';

const student = { name: 'Amine', classId: '2eme-bac-sc-math', role: 'student' } as UserProfile;
const professor = { name: 'Mme Alaoui', classId: '2eme-bac-sc-math', role: 'prof' } as UserProfile;
const pendingProfessor = { name: 'M. Karim', classId: 'prof-pending:1', role: 'student', requestedRole: 'prof' } as UserProfile;

describe('appViewRouting', () => {
  it('renvoie le dashboard pour le raccourci /prof, quel que soit le rôle', () => {
    // Un élève qui suit le lien enseignant doit atterrir sur son dashboard,
    // jamais sur un écran vide ; un professeur y trouve sa surface arbitrée
    // (console PC ou dashboard tablette) au lieu d'une console imposée.
    expect(resolveViewForUser('studio', student)).toBe('dashboard');
    expect(resolveViewForUser('studio', professor)).toBe('dashboard');
  });

  it('renvoie l\'accueil pour toute vue applicative sans compte vérifié', () => {
    expect(resolveViewForUser('studio', null)).toBe('login');
    expect(resolveViewForUser('dashboard', null)).toBe('login');
    expect(resolveViewForUser('quiz', null)).toBe('login');
    expect(resolveViewForUser('login', null)).toBe('login');
  });

  it('laisse passer la console admin sans compte : sa garde est dans AdminConsole', () => {
    expect(resolveViewForUser('admin', null)).toBe('admin');
    expect(resolveViewForUser('admin', student)).toBe('admin');
  });

  it('laisse les autres vues intactes pour un compte vérifié', () => {
    expect(resolveViewForUser('dashboard', student)).toBe('dashboard');
    expect(resolveViewForUser('revision', student)).toBe('revision');
    expect(resolveViewForUser('concours-quiz', professor)).toBe('concours-quiz');
  });

  it('redirige un utilisateur déjà connecté qui ouvre #login vers son tableau de bord', () => {
    expect(resolveViewForUser('login', student)).toBe('dashboard');
    expect(resolveViewForUser('login', professor)).toBe('dashboard');
    expect(resolveViewForUser('login', pendingProfessor)).toBe('dashboard');
  });

  it('confine une demande professeur en attente à son écran de statut', () => {
    expect(resolveViewForUser('dashboard', pendingProfessor)).toBe('dashboard');
    expect(resolveViewForUser('quiz', pendingProfessor)).toBe('dashboard');
    expect(resolveViewForUser('studio', pendingProfessor)).toBe('dashboard');
  });

  it('reconnaît les hash d\'entrée légitimes et rejette les autres', () => {
    expect(isKnownAppView('studio')).toBe(true);
    expect(isKnownAppView('admin')).toBe(true);
    expect(isKnownAppView('dashboard')).toBe(true);
    expect(isKnownAppView('prof')).toBe(false);
    expect(isKnownAppView('')).toBe(false);
  });
});
