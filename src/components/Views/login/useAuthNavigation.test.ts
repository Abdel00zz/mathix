import { describe, expect, it } from 'vitest';
import { readAuthRoute } from './useAuthNavigation';

describe('étapes restaurables depuis history.state', () => {
  it('ignore les entrées étrangères', () => {
    expect(readAuthRoute(null)).toEqual({ screen: 'landing', role: 'student', step: 1 });
    expect(readAuthRoute({ monProfAuth: 'unknown', role: 'admin' })).toEqual({ screen: 'landing', role: 'student', step: 1 });
  });
  it.each(['preview', 'registration', 'connection'])('restaure %s avec le rôle professeur', screen => {
    expect(readAuthRoute({ monProfAuth: screen, role: 'prof' })).toEqual({ screen, role: 'prof', step: 1 });
  });
  it('restaure la seconde étape élève', () => {
    expect(readAuthRoute({ monProfAuth: 'registration', authStep: 2 })).toEqual({ screen: 'registration', role: 'student', step: 2 });
  });
  it('ignore un aperçu réservé au professeur ou une étape 2 hors parcours élève', () => {
    expect(readAuthRoute({ monProfAuth: 'preview', role: 'student' })).toEqual({ screen: 'landing', role: 'student', step: 1 });
    expect(readAuthRoute({ monProfAuth: 'registration', role: 'prof', authStep: 2 })).toEqual({ screen: 'registration', role: 'prof', step: 1 });
    expect(readAuthRoute({ monProfAuth: 'connection', authStep: 2 })).toEqual({ screen: 'connection', role: 'student', step: 1 });
  });
});
