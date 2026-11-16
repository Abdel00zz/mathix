import { describe, expect, it } from 'vitest';
import { MEDIA_SIZING, knownAspectRatio, pickSizing, svgWidthPercent } from './mediaSizing';

/**
 * Stabilité de mise en page : une figure dont les dimensions sont déclarées à
 * l'import réserve sa place avant le chargement du binaire. Tout dépend de
 * `knownAspectRatio` — s'il se trompe, la page saute ou la figure se déforme.
 */
describe('knownAspectRatio', () => {
  it('déduit le rapport largeur / hauteur de dimensions déclarées', () => {
    expect(knownAspectRatio(1600, 800)).toBe(2);
    expect(knownAspectRatio(800, 1600)).toBe(0.5);
    expect(knownAspectRatio(640, 480)).toBeCloseTo(4 / 3, 10);
  });

  it('refuse toute dimension absente, nulle, négative ou non finie (le rapport est alors appris au chargement)', () => {
    expect(knownAspectRatio(undefined, 100)).toBeNull();
    expect(knownAspectRatio(100, undefined)).toBeNull();
    expect(knownAspectRatio(0, 100)).toBeNull();
    expect(knownAspectRatio(100, 0)).toBeNull();
    expect(knownAspectRatio(-10, 100)).toBeNull();
    expect(knownAspectRatio(Number.NaN, 100)).toBeNull();
    expect(knownAspectRatio(Number.POSITIVE_INFINITY, 100)).toBeNull();
  });
});

describe('pickSizing', () => {
  it('choisit le gabarit compact pour un exercice et le gabarit régulier pour un cours', () => {
    expect(pickSizing(MEDIA_SIZING.sideColumn, true)).toBe('minmax(0, 28%)');
    expect(pickSizing(MEDIA_SIZING.sideColumn, false)).toBe('minmax(0, 32%)');
    expect(pickSizing(MEDIA_SIZING.inlineMaxWidth, true)).toBe('150px');
    expect(pickSizing(MEDIA_SIZING.inlineMaxWidth, false)).toBe('160px');
  });

  it("garde le gabarit compact plus étroit que le régulier : la figure d'un énoncé ne doit pas l'écraser", () => {
    const percent = (value: string) => Number(/(\d+(?:\.\d+)?)%/.exec(value)?.[1]);
    expect(percent(MEDIA_SIZING.sideColumn.compact)).toBeLessThan(percent(MEDIA_SIZING.sideColumn.regular));
    expect(percent(MEDIA_SIZING.gallery.sideColumn.compact)).toBeLessThan(percent(MEDIA_SIZING.gallery.sideColumn.regular));
    expect(percent(MEDIA_SIZING.gallery.floatWidth.compact)).toBeLessThan(percent(MEDIA_SIZING.gallery.floatWidth.regular));
  });

  it('écrit toutes les classes Tailwind en entier (le balayage des sources doit les retrouver)', () => {
    const classes = [
      MEDIA_SIZING.floatClass.compact, MEDIA_SIZING.floatClass.regular,
      MEDIA_SIZING.stackedClass.compactTop, MEDIA_SIZING.stackedClass.regular,
      MEDIA_SIZING.sideColumnMinHeight.compact, MEDIA_SIZING.sideColumnMinHeight.regular,
    ];
    for (const value of classes) expect(value).not.toMatch(/[`$]|\{|\}/);
  });
});

describe('svgWidthPercent', () => {
  it('donne aux libellés une taille apparente proportionnelle à la largeur du viewBox', () => {
    expect(svgWidthPercent(300)).toBeCloseTo(44, 0);
    expect(svgWidthPercent(400)).toBeGreaterThan(svgWidthPercent(300));
  });

  it("ne dépasse jamais la largeur du conteneur et retombe à 100 % si la largeur est invalide", () => {
    expect(svgWidthPercent(5_000)).toBe(100);
    expect(svgWidthPercent(0)).toBe(100);
    expect(svgWidthPercent(Number.NaN)).toBe(100);
  });
});
