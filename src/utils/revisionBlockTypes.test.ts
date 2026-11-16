import { describe, expect, it } from 'vitest';
import {
  ALL_SEMANTIC,
  ALWAYS_LEFT,
  ANNOTATABLE_TYPES,
  ENLARGE_TYPES,
  NUMBERED_TYPES,
  REVEALABLE,
  STYLISH_QUESTION_TYPES,
  normalizeBlockType,
} from './revisionBlockTypes';
import { ENV_LABELS } from '../styles/mathTheme';
import { REVISION_BLOCK_TYPES } from '../types';

describe('normalizeBlockType', () => {
  it('laisse les types canoniques inchangés', () => {
    expect(normalizeBlockType('definition')).toBe('definition');
    expect(normalizeBlockType('method')).toBe('method');
    expect(normalizeBlockType('application')).toBe('application');
  });

  it('ne fusionne plus `technique` en `rappel`', () => {
    // Régression : cette fusion rendait les blocs `technique` non révélables,
    // alors que `REVEALABLE` les déclare comme tels et que `ENV_LABELS` leur
    // donne un libellé propre (« Technique »).
    expect(normalizeBlockType('technique')).toBe('technique');
    expect(normalizeBlockType('rappel')).toBe('rappel');
    expect(REVEALABLE.has('technique')).toBe(true);
    expect(REVEALABLE.has('rappel')).toBe(false);
  });

  it('corrige les fautes de frappe observées dans les fiches', () => {
    expect(normalizeBlockType('applicaion')).toBe('application');
    expect(normalizeBlockType('applcaoin')).toBe('application');
    expect(normalizeBlockType('exmpale')).toBe('example');
    expect(normalizeBlockType('examle')).toBe('example');
  });

  it('résout les synonymes sans ambiguïté', () => {
    expect(normalizeBlockType('note')).toBe('remark');
    expect(normalizeBlockType('indice')).toBe('hint');
    expect(normalizeBlockType('indices')).toBe('hint');
    expect(normalizeBlockType('methode')).toBe('method');
  });

  it('tolère la casse et les espaces, et renvoie une chaîne vide si absent', () => {
    expect(normalizeBlockType('  DEFINITION ')).toBe('definition');
    expect(normalizeBlockType('Exemple')).toBe('example');
    expect(normalizeBlockType('')).toBe('');
    expect(normalizeBlockType(undefined)).toBe('');
  });

  it('laisse passer un type inconnu sans le dénaturer', () => {
    expect(normalizeBlockType('type_absent_du_catalogue')).toBe('type_absent_du_catalogue');
  });
});

describe('taxonomie des blocs de révision — invariants', () => {
  const sets: Array<[string, Set<string>]> = [
    ['REVEALABLE', REVEALABLE],
    ['ALWAYS_LEFT', ALWAYS_LEFT],
    ['ENLARGE_TYPES', ENLARGE_TYPES],
    ['ANNOTATABLE_TYPES', ANNOTATABLE_TYPES],
    ['NUMBERED_TYPES', NUMBERED_TYPES],
    ['STYLISH_QUESTION_TYPES', STYLISH_QUESTION_TYPES],
  ];

  it('ne contient que des types rendus par la branche sémantique', () => {
    // Un type absent de `ALL_SEMANTIC` retomberait silencieusement dans la
    // branche « texte libre », en perdant badge et mise en page.
    sets.forEach(([name, set]) => {
      const orphelins = [...set].filter((type) => !ALL_SEMANTIC.has(type));
      expect(orphelins, `${name} contient des types hors ALL_SEMANTIC`).toEqual([]);
    });
  });

  it('expose un libellé lisible pour chaque type annotable ou numéroté', () => {
    [...ANNOTATABLE_TYPES, ...NUMBERED_TYPES].forEach((type) => {
      expect(ENV_LABELS[type], `libellé manquant pour « ${type} »`).toBeTruthy();
    });
  });

  it('couvre les types effectivement numérotés dans les fiches', () => {
    // `computeGlobalNumbering` numérote en continu ces familles ; en oublier
    // une ferait disparaître les numéros « Méthode 2 », « Remarque 3 »…
    ['definition', 'theorem', 'proposition', 'property', 'technique', 'method', 'application', 'example', 'exploration', 'warning', 'remark', 'hint'].forEach((type) => {
      expect(NUMBERED_TYPES.has(type), `« ${type} » devrait être numéroté`).toBe(true);
    });
  });
});

describe('couverture de REVISION_BLOCK_TYPES', () => {
  /** Types portés par une branche dédiée de `CourseBlock`, hors branche sémantique. */
  const SPECIAL_RENDERERS = new Set<string>(['text', 'cela_permet_de']);

  it('ne déclare aucun type qui retomberait silencieusement dans le texte libre', () => {
    // Garde-fou contre la réapparition de types fantômes du genre
    // `method_principle` : déclarés dans le typage, absents du moteur de rendu.
    const orphelins = REVISION_BLOCK_TYPES.filter(
      (type) => !SPECIAL_RENDERERS.has(type) && !ALL_SEMANTIC.has(normalizeBlockType(type)),
    );
    expect(orphelins).toEqual([]);
  });

  it('est déclaré dans la table des libellés, sauf le texte libre', () => {
    // On vérifie la **présence** de la clé, pas son contenu : `intro` porte
    // volontairement un libellé vide (aucun badge n'est affiché). En revanche,
    // un type absent de la table — comme le `culture` documenté mais jamais
    // implémenté — n'aurait ni badge ni libellé.
    REVISION_BLOCK_TYPES.filter((type) => type !== 'text').forEach((type) => {
      const key = normalizeBlockType(type);
      expect(key in ENV_LABELS, `libellé non déclaré pour « ${type} »`).toBe(true);
    });
  });
});
