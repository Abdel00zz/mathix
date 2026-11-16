import { describe, expect, it } from 'vitest';
import katex from 'katex';
import { isLineBreakSize, repairLineBreakBrackets } from './latexNormalize';

const BS = String.fromCharCode(92);
const LB = BS + BS; // `\\` : saut de ligne LaTeX

describe('isLineBreakSize', () => {
  it('reconnaît une dimension KaTeX', () => {
    expect(isLineBreakSize('2pt')).toBe(true);
    expect(isLineBreakSize(' 1.5em ')).toBe(true);
    expect(isLineBreakSize('-3mm')).toBe(true);
  });

  it('refuse ce qui n’est pas une dimension', () => {
    expect(isLineBreakSize('-1,2')).toBe(false);
    expect(isLineBreakSize('a,b[')).toBe(false);
    expect(isLineBreakSize('')).toBe(false);
  });
});

describe('repairLineBreakBrackets', () => {
  it('insère le groupe vide devant un intervalle en tête de ligne', () => {
    expect(repairLineBreakBrackets(`${LB}[-1,2] & {}`)).toBe(`${LB}{}[-1,2] & {}`);
    expect(repairLineBreakBrackets(`${LB}[a,b[ & x`)).toBe(`${LB}{}[a,b[ & x`);
  });

  it('laisse intacts les vrais espacements de ligne', () => {
    expect(repairLineBreakBrackets(`a ${LB}[2pt] b`)).toBe(`a ${LB}[2pt] b`);
    expect(repairLineBreakBrackets(`a ${LB}[1.5em] b`)).toBe(`a ${LB}[1.5em] b`);
  });

  it('ne touche pas ce qui est déjà corrigé, ni un crochet fermant', () => {
    expect(repairLineBreakBrackets(`${LB}{}[0,1]`)).toBe(`${LB}{}[0,1]`);
    expect(repairLineBreakBrackets(`${LB}]0,1[`)).toBe(`${LB}]0,1[`);
    expect(repairLineBreakBrackets(`${LB} \\hline[0,1]`)).toBe(`${LB} \\hline[0,1]`);
  });

  it('corrige plusieurs lignes d’un même tableau', () => {
    const input = `x ${LB} \\hline${LB}[-1,2] & a${LB}[2,4] & b`;
    expect(repairLineBreakBrackets(input)).toBe(`x ${LB} \\hline${LB}{}[-1,2] & a${LB}{}[2,4] & b`);
  });

  it('corrige un crochet jamais refermé sans perdre la suite', () => {
    expect(repairLineBreakBrackets(`${LB}[0,1`)).toBe(`${LB}{}[0,1`);
    expect(repairLineBreakBrackets(`${LB}[a,b[ ${LB}[3pt]`)).toBe(`${LB}{}[a,b[ ${LB}[3pt]`);
  });

  it('renvoie la chaîne inchangée quand il n’y a rien à faire', () => {
    const tex = 'x^2 + \\frac{1}{2}';
    expect(repairLineBreakBrackets(tex)).toBe(tex);
  });
});

describe('intégration KaTeX — le tableau réellement fautif', () => {
  const array = (rows: string) => `${BS}begin{array}{c|c|c|c|c}I & ${BS}min_I f${LB} ${BS}hline${rows}${BS}end{array}`;
  const rows = `${LB}[-2,-1] & {}${LB}[-1,2] & {}${LB}[2,4] & {}`;

  it('sans réparation, KaTeX échoue (la panne d’origine)', () => {
    expect(() => katex.renderToString(array(rows), { throwOnError: true, strict: 'ignore' })).toThrow(/Invalid size/);
  });

  it('avec réparation, le même tableau compile', () => {
    const repaired = repairLineBreakBrackets(array(rows));
    expect(() => katex.renderToString(repaired, { throwOnError: true, strict: 'ignore' })).not.toThrow();
    // Le contenu mathématique est préservé : la ligne existe toujours.
    expect(repaired).toContain(`${LB}{}[-2,-1]`);
    expect(repaired).toContain(`${LB}{}[-1,2]`);
  });
});
