import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ACCENT_BY_TYPE, cardFillStyle, tokensOf } from './revisionPalette';

const tokensCss = readFileSync(new URL('./revision/revision-tokens.css', import.meta.url), 'utf8');
const defined = new Set(Array.from(tokensCss.matchAll(/(--rev-[a-z-]+)\s*:/g)).map(match => match[1]));
const referenced = (value: string) => Array.from(value.matchAll(/var\((--rev-[a-z-]+)\)/g)).map(match => match[1]);

describe('palette de révision (jetons CSS)', () => {
  it('tous les types de blocs pointent vers des variables définies', () => {
    for (const type of Object.keys(ACCENT_BY_TYPE)) {
      const { bg, bgSoft, border, accent, glow } = tokensOf(type);
      for (const value of [bg, bgSoft, border, accent, glow]) {
        const names = referenced(value);
        expect(names.length, `${type}: ${value}`).toBe(1);
        expect(defined.has(names[0]), `${type}: ${names[0]} absent de revision-tokens.css`).toBe(true);
      }
    }
  });

  it('aucun hexadécimal ne subsiste dans la palette TypeScript', () => {
    for (const type of Object.keys(ACCENT_BY_TYPE)) {
      expect(JSON.stringify(tokensOf(type))).not.toMatch(/#[0-9a-f]{3,8}/i);
    }
  });

  it('un type inconnu utilise la famille neutre', () => {
    expect(tokensOf('inconnu').accent).toBe('var(--rev-neutral-accent)');
  });

  it('cardFillStyle expose les variables de remplissage pour les blocs pleins', () => {
    const style = cardFillStyle('definition');
    expect(style?.['--mathqst-fill-soft']).toBe('var(--rev-definition-soft)');
    expect(cardFillStyle('example')).toBeUndefined();
  });

  it('la teinte de l\'accent est partagée par toute une famille', () => {
    expect(ACCENT_BY_TYPE.theorem).toBe(ACCENT_BY_TYPE.lemma);
    expect(ACCENT_BY_TYPE.method).toBe(ACCENT_BY_TYPE.strategy);
  });
});
