import { describe, expect, it } from 'vitest';
import {
  detectContentType,
  exerciseDisplayNumber,
  getDocumentKind,
  validateStudioDocument,
  getJsonParseError,
  nextExerciseNumber,
  parseImportText,
  parseJsonContent,
  publishPrimaryQuizReferences,
  readableCatalogLabel,
  slugify,
} from './contentUtils';

describe('studio content helpers', () => {
  it('détecte les trois familles de documents éditables', () => {
    expect(detectContentType({ sections: [] })).toBe('revision');
    expect(detectContentType({ questions: [{ question: '2 + 2 ?', options: [] }] })).toBe('quiz');
    expect(detectContentType({ questions: [{ content: 'Calculer' }] })).toBe('exercise');
    expect(detectContentType({ title: 'Manifest' })).toBeNull();
  });

  it('bloque les documents pédagogiques incomplets sans bloquer les manifestes', () => {
    expect(validateStudioDocument({ exercises: [] })).toEqual([]);
    expect(validateStudioDocument({ sections: [] })).toContain('La fiche de révision doit contenir au moins une section.');
    expect(validateStudioDocument({ questions: [] })).toContain('Le document doit contenir au moins une question.');
    expect(validateStudioDocument({ questions: [{ type: 'mcq', question: 'Choisir', options: [{ text: 'A', isCorrect: false }, { text: 'B', isCorrect: false }] }] }))
      .toContain('Question 1 : aucune bonne réponse n’est définie.');
    expect(validateStudioDocument({ questions: [{ type: 'mcq', question: 'Choisir', options: [{ text: 'A', isCorrect: true }, { text: 'B', isCorrect: false }] }] })).toEqual([]);
  });

  it('analyse un import multiple et conserve les erreurs par entrée', () => {
    const entries = parseImportText(JSON.stringify([
      { questions: [{ content: 'Calculer' }] },
      'invalide',
    ]), 'lot.json');
    expect(entries).toHaveLength(2);
    expect(entries[0]).toMatchObject({ source: 'lot.json (1)', kind: 'exercise' });
    expect(entries[1]).toMatchObject({ source: 'lot.json (2)', kind: null, error: 'Contenu non-objet' });
  });

  it('retourne une position exploitable pour un JSON invalide', () => {
    const error = getJsonParseError('{\n  "questions": [}\n');
    expect(error).not.toBeNull();
    expect(error?.line).toBeGreaterThanOrEqual(0);
    expect(parseJsonContent('{"sections":[]}')).not.toBeNull();
    expect(getDocumentKind(parseJsonContent('{"sections":[]}')).isRevision).toBe(true);
    expect(getDocumentKind(parseJsonContent('{"questions":[]}')).isVisualSupported).toBe(false);
  });

  it('normalise les identifiants et les titres LaTeX du catalogue', () => {
    expect(slugify('Nombres complexes — Série 1')).toBe('nombres-complexes-serie-1');
    expect(readableCatalogLabel('Calcul de $\\sqrt{x} \\leq 4$')).toBe('Calcul de √(x) ≤ 4');
    expect(readableCatalogLabel('Arithmétique dans $\\mathbb{N}$')).toBe('Arithmétique dans ℕ');
    expect(readableCatalogLabel('Fonctions sur $\\mathbb{R}^{2}$')).toBe('Fonctions sur ℝ²');
  });

  it('numérote le prochain exercice sans réutiliser un numéro supprimé', () => {
    expect(nextExerciseNumber([])).toBe(1);
    expect(nextExerciseNumber([{ id: 'exercice-1' }, { id: 'exercice-2' }])).toBe(3);
    // Le numéro 2 a été supprimé : on ne le réutilise pas et on évite la collision.
    expect(nextExerciseNumber([{ id: 'exercice-1' }, { id: 'exercice-3' }])).toBe(4);
    // Les ids sans numéro (anciens slugs) ne bloquent pas le démarrage à 1.
    expect(nextExerciseNumber([{ id: 'suites-numeriques-ex', path: 'data/x/y/exercises/suites-numeriques-ex.json' }])).toBe(1);
  });

  it('lit le numéro affiché depuis l’id, sinon retombe sur l’ordre visuel', () => {
    expect(exerciseDisplayNumber({ id: 'exercice-3' }, 1)).toBe(3);
    expect(exerciseDisplayNumber({ id: 'exercice-1' }, 2)).toBe(1);
    expect(exerciseDisplayNumber({ id: 'sans-numero' }, 2)).toBe(2);
    expect(exerciseDisplayNumber({}, 2)).toBe(2);
  });

  it('publie le nouveau quiz comme quiz principal et synchronise quizCount', () => {
    const chapter: Record<string, any> = {
      quizCount: 12,
      quizzes: [
        { id: 'ancien', path: 'data/classe/chapitre/quiz/ancien.json' },
        { id: 'nouveau', path: 'data/classe/chapitre/quiz/nouveau.json' },
      ],
    };
    publishPrimaryQuizReferences(
      chapter,
      [{ id: 'nouveau', path: 'data/classe/chapitre/quiz/nouveau.json' }],
      7,
    );
    expect(chapter.quizCount).toBe(7);
    expect(chapter.quizzes).toEqual([
      { id: 'nouveau', path: 'data/classe/chapitre/quiz/nouveau.json' },
      { id: 'ancien', path: 'data/classe/chapitre/quiz/ancien.json' },
    ]);
  });
});
