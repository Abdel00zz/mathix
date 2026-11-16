import { describe, it, expect } from 'vitest';
import {
  blankIdFor,
  blankScopePrefix,
  primaryRevisionPath,
  resolveRevisionSteps,
  revisionCount,
  revisionPath,
  revisionSheetIndex,
  revisionSheetKey,
} from './revisionSheets';

const chapter = {
  revisions: [
    { path: 'data/x/chapitre/revisions/fiche_cours.json' },
    { path: 'data/x/chapitre/revisions/fiche_complements.json' },
  ],
};

describe('revisionSheets', () => {
  it('extrait la clé d’une fiche depuis son chemin', () => {
    expect(revisionSheetKey('data/a/b/revisions/fiche_cours.json')).toBe('fiche_cours');
    expect(revisionSheetKey('fiche_cours')).toBe('fiche_cours');
    expect(revisionSheetKey(undefined)).toBe('');
  });

  it('tolère un manifeste dont la fiche n’a pas de chemin', () => {
    expect(revisionPath(undefined)).toBe('');
    expect(revisionPath({ path: '' })).toBe('');
    expect(revisionPath({ path: 'p.json' })).toBe('p.json');
  });

  it('compte les fiches déclarées', () => {
    expect(revisionCount(chapter)).toBe(2);
    expect(revisionCount({})).toBe(0);
    expect(revisionCount(undefined)).toBe(0);
  });

  it('localise la fiche courante', () => {
    expect(revisionSheetIndex(chapter, 'data/x/chapitre/revisions/fiche_cours.json')).toBe(0);
    expect(revisionSheetIndex(chapter, 'data/x/chapitre/revisions/fiche_complements.json')).toBe(1);
    // Chemin inconnu : repli sur la fiche principale.
    expect(revisionSheetIndex(chapter, 'data/ailleurs/fiche.json')).toBe(0);
    expect(revisionSheetIndex(chapter, undefined)).toBe(0);
  });

  it('préserve les identifiants historiques pour la première fiche', () => {
    expect(blankScopePrefix(chapter, 'data/x/chapitre/revisions/fiche_cours.json')).toBe('');
    expect(blankIdFor('chapitre', '', 3)).toBe('blank-chapitre-3');
  });

  it('isole les fiches suivantes', () => {
    const scope = blankScopePrefix(chapter, 'data/x/chapitre/revisions/fiche_complements.json');
    expect(scope).toBe('fiche_complements-');
    expect(blankIdFor('chapitre', scope, 0)).toBe('blank-chapitre-fiche_complements-0');
  });

  it('isole un document inconnu plutôt que de mélanger ses blancs', () => {
    expect(blankScopePrefix(chapter, 'data/ailleurs/fiche.json')).toBe('fiche-');
    expect(blankScopePrefix(chapter, undefined)).toBe('');
  });

  it('n’applique aucune portée aux chapitres sans fiche déclarée', () => {
    expect(blankScopePrefix({}, 'data/a/fiche.json')).toBe('');
    expect(blankScopePrefix(undefined, 'data/a/fiche.json')).toBe('');
  });

  it('ouvre la première fiche par défaut', () => {
    expect(primaryRevisionPath(chapter)).toBe('data/x/chapitre/revisions/fiche_cours.json');
    expect(primaryRevisionPath({})).toBeUndefined();
  });

  it('ne fait jamais collisionner deux fiches d’un même chapitre', () => {
    const ids = new Set<string>();
    for (const revision of chapter.revisions) {
      const scope = blankScopePrefix(chapter, revision.path);
      for (let i = 0; i < 5; i += 1) ids.add(blankIdFor('chapitre', scope, i));
    }
    expect(ids.size).toBe(10);
  });
});

describe('resolveRevisionSteps', () => {
  const simple = { revisions: [{ path: 'data/x/c/revisions/fiche_cours.json', title: 'Fiche de cours' }] };

  it('n’émet aucune étape sans fiche déclarée', () => {
    expect(resolveRevisionSteps({}, undefined, 42)).toEqual([]);
    expect(resolveRevisionSteps(undefined, { a: 1 }, 42)).toEqual([]);
  });

  it('reprend la progression du chapitre pour une fiche unique (compatibilité)', () => {
    const [step] = resolveRevisionSteps(simple, undefined, 42);
    expect(step).toMatchObject({ key: 'fiche_cours', percent: 42, completed: false, index: 0 });
    expect(step.title).toBe('Fiche de cours');
  });

  it('privilégie la progression par fiche dès qu’elle existe', () => {
    const [step] = resolveRevisionSteps(simple, { fiche_cours: 80 }, 42);
    expect(step.percent).toBe(80);
  });

  it('n’annonce pas 100 % sur une fiche jamais ouverte d’un chapitre à deux fiches', () => {
    const steps = resolveRevisionSteps(chapter, { fiche_complements: 60 }, 100);
    expect(steps.map((s) => s.percent)).toEqual([0, 60]);
    expect(steps.map((s) => s.completed)).toEqual([false, false]);
  });

  it('marque une fiche terminée à 100 %', () => {
    const steps = resolveRevisionSteps(chapter, { fiche_cours: 100 }, 100);
    expect(steps[0]).toMatchObject({ percent: 100, completed: true });
  });

  it('borne les valeurs et tolère les données invalides', () => {
    expect(resolveRevisionSteps(chapter, { fiche_cours: 140 }, 0)[0].percent).toBe(100);
    expect(resolveRevisionSteps(chapter, { fiche_cours: -20 }, 0)[0].percent).toBe(0);
    expect(resolveRevisionSteps(chapter, { fiche_cours: Number.NaN }, 0)[0].percent).toBe(0);
  });

  it('donne une clé de repli quand le chemin est absent', () => {
    const steps = resolveRevisionSteps({ revisions: [{ path: '' }] }, undefined, 0);
    expect(steps[0].key).toBe('fiche-0');
    expect(steps[0].path).toBe('');
  });
});
