import { describe, expect, it } from 'vitest';
import { findContentQuestions, plainItemText, sliceContentForFigures, splitContentAtQuestion } from './contentQuestions';

/**
 * Un bloc d'application ou de propriété porte souvent une liste numérotée de
 * questions. Poser une figure « au-dessus de la question 3 » demande de couper
 * le contenu en gardant, de part et d'autre, du LaTeX valide — et la seconde
 * moitié doit continuer la numérotation.
 */

const LISTE = 'Consignes :\\begin{enumerate}\\item Premier point.\\item Deuxième point.\\item Troisième point.\\end{enumerate}';

/** Contrôle structurel minimal : autant d'ouvertures que de fermetures. */
const balanced = (value: string) => {
  const opens = (value.match(/\\begin\{(enumerate|itemize)\}/g) || []).length;
  const closes = (value.match(/\\end\{(enumerate|itemize)\}/g) || []).length;
  return opens === closes;
};

describe('questions d’un contenu', () => {
  it('lit les items d’une liste numérotée, dans l’ordre', () => {
    const questions = findContentQuestions(LISTE);
    expect(questions.map(question => question.index)).toEqual([1, 2, 3]);
    expect(questions.map(question => question.text)).toEqual(['Premier point.', 'Deuxième point.', 'Troisième point.']);
    expect(questions.map(question => question.restartAt)).toEqual([0, 1, 2]);
  });

  it('lit aussi les listes à puces', () => {
    const questions = findContentQuestions('\\begin{itemize}\\item $zw=rr\'e^{i\\theta}$\\item $z/w$\\end{itemize}');
    expect(questions).toHaveLength(2);
    expect(questions[0].label).toContain('zw');
  });

  it('ne compte pas les items d’une sous-liste comme des questions', () => {
    const content = '\\begin{enumerate}\\item Question une avec une sous-liste :\\begin{itemize}\\item détail a\\item détail b\\end{itemize}\\item Question deux\\end{enumerate}';
    const questions = findContentQuestions(content);
    expect(questions.map(question => question.index)).toEqual([1, 2]);
    expect(questions[0].text).toContain('détail a');
  });

  it('ne prend pas un `\\itemize` pour un item', () => {
    expect(findContentQuestions('Texte \\item de rien du tout.')).toHaveLength(0);
  });

  it('accepte une liste avec options', () => {
    const questions = findContentQuestions('\\begin{enumerate}[label=(\\alph*)]\\item a\\item b\\end{enumerate}');
    expect(questions).toHaveLength(2);
  });
});

describe('découpe autour d’une question', () => {
  it('place la suite au bon rang quand on coupe avant la question 3', () => {
    const split = splitContentAtQuestion(LISTE, 3, 'before');
    expect(split).not.toBeNull();
    expect(split!.before).toBe('Consignes :\\begin{enumerate}\\item Premier point.\\item Deuxième point.\\end{enumerate}');
    expect(split!.after.startsWith('\\begin{enumerate}\\item Troisième point.')).toBe(true);
    // La seconde moitié reprend à « 3. » : deux items déjà passés.
    expect(split!.listStart).toBe(2);
    expect(balanced(split!.before)).toBe(true);
    expect(balanced(split!.after)).toBe(true);
  });

  it('place la suite au bon rang quand on coupe après la question 1', () => {
    const split = splitContentAtQuestion(LISTE, 1, 'after');
    expect(split!.before).toBe('Consignes :\\begin{enumerate}\\item Premier point.\\end{enumerate}');
    expect(split!.after.startsWith('\\begin{enumerate}\\item Deuxième point.')).toBe(true);
    // La seconde moitié reprend à « 2. » : un item déjà passé.
    expect(split!.listStart).toBe(1);
    expect(balanced(split!.before)).toBe(true);
    expect(balanced(split!.after)).toBe(true);
  });

  it('ne rouvre pas de liste après le dernier item', () => {
    const split = splitContentAtQuestion(LISTE, 3, 'after');
    expect(split!.before.endsWith('\\end{enumerate}')).toBe(true);
    expect(split!.after).toBe('');
    expect(balanced(split!.before)).toBe(true);
  });

  it('conserve le texte qui suit la liste', () => {
    const content = `${LISTE}\nRetenir la conclusion.`;
    const before = splitContentAtQuestion(content, 3, 'before')!;
    expect(before.before).not.toContain('Retenir');
    expect(before.after).toContain('Retenir la conclusion.');
  });

  it('conserve le texte qui précède la liste dans la première moitié', () => {
    const split = splitContentAtQuestion(LISTE, 1, 'before')!;
    expect(split.before).toBe('Consignes :\\begin{enumerate}\\end{enumerate}');
    expect(split.after).toContain('\\item Premier point.');
  });

  it('ne perd ni ne duplique aucun item', () => {
    const content = `${LISTE}\nSuite du corrigé.`;
    for (const relation of ['before', 'after'] as const) {
      for (const index of [1, 2, 3]) {
        const split = splitContentAtQuestion(content, index, relation)!;
        const items = (split.before.match(/\\item\b/g) || []).length + (split.after.match(/\\item\b/g) || []).length;
        expect(items, `${relation} ${index}`).toBe(3);
      }
    }
  });

  it('refuse une découpe impossible plutôt que de tronquer', () => {
    expect(splitContentAtQuestion(LISTE, 9, 'before')).toBeNull();
    expect(splitContentAtQuestion('Aucune liste ici.', 1, 'before')).toBeNull();
    expect(splitContentAtQuestion('\\begin{enumerate}\\item sans fin', 1, 'before')).toBeNull();
  });

  it('travaille sur un contenu réel de fiche', () => {
    const content = "\\qst{Calculons $\\displaystyle\\lim_{x\\to1}\\dfrac{x^2-1}{x-1}$.}\\par\\smallskip \\begin{enumerate}\\item On factorise $x^2-1=(x-1)(x+1)$.\\item On simplifie $\\dfrac{x^2-1}{x-1}=\\blank{x+1}$.\\item On conclut $\\displaystyle\\lim_{x\\to1}\\dfrac{x^2-1}{x-1}=\\blank{2}$.\\end{enumerate}";
    const questions = findContentQuestions(content);
    expect(questions).toHaveLength(3);
    expect(questions[1].label).toContain('On simplifie');

    const split = splitContentAtQuestion(content, 2, 'before')!;
    expect(split.listStart).toBe(1);
    expect(balanced(split.before)).toBe(true);
    expect(balanced(split.after)).toBe(true);
    // La question `\qst{}` reste dans la première moitié, la liste se poursuit.
    expect(split.before).toContain('\\qst{');
    expect(split.before).toContain('\\item On factorise');
    expect(split.after).toContain('\\item On simplifie');
    expect(split.after).not.toContain('\\item On factorise');
  });
});

describe('découpe pour poser les figures', () => {
  const figure = (src: string, targetItem: number, position: 'top' | 'bottom' = 'top') =>
    ({ src, anchor: 'item' as const, targetItem, position });

  it('glisse la figure entre la question 2 et la question 3', () => {
    const { slices, unplaced } = sliceContentForFigures(LISTE, [figure('/f.png', 3)]);
    expect(unplaced).toEqual([]);
    expect(slices).toHaveLength(2);
    // Premier morceau : les questions 1 et 2, liste refermée.
    expect(slices[0].content).toBe('Consignes :\\begin{enumerate}\\item Premier point.\\item Deuxième point.\\end{enumerate}');
    expect(slices[0].listStart).toBe(0);
    expect(slices[0].figuresAfter.map(image => image.src)).toEqual(['/f.png']);
    // Second morceau : la suite, qui reprend à « 3. ».
    expect(slices[1].content.startsWith('\\begin{enumerate}\\item Troisième point.')).toBe(true);
    expect(slices[1].listStart).toBe(2);
    expect(slices[1].figuresAfter).toEqual([]);
  });

  it('pose la figure sous la question visée quand la position est « bottom »', () => {
    const { slices } = sliceContentForFigures(LISTE, [figure('/f.png', 2, 'bottom')]);
    expect(slices[0].content).toContain('\\item Deuxième point.');
    expect(slices[0].content).not.toContain('\\item Troisième');
    expect(slices[1].listStart).toBe(2);
  });

  it('enchaîne plusieurs figures dans l’ordre des questions', () => {
    const { slices, unplaced } = sliceContentForFigures(LISTE, [figure('/b.png', 3), figure('/a.png', 2)]);
    expect(unplaced).toEqual([]);
    // Trié par question visée, pas par ordre d'ajout.
    expect(slices.map(slice => slice.figuresAfter.map(image => image.src))).toEqual([['/a.png'], ['/b.png'], []]);
    expect(slices.map(slice => slice.listStart)).toEqual([0, 1, 2]);
  });

  it('garde deux figures visant la même question, dans l’ordre', () => {
    const { slices, unplaced } = sliceContentForFigures(LISTE, [figure('/a.png', 2), figure('/b.png', 2)]);
    expect(unplaced).toEqual([]);
    // Les deux passent avant la question 2, /a puis /b.
    expect(slices.flatMap(slice => slice.figuresAfter.map(image => image.src))).toEqual(['/a.png', '/b.png']);
    const last = slices[slices.length - 1];
    expect(last.content).toContain('\\item Deuxième point.');
    expect(last.figuresAfter).toEqual([]);
  });

  it('ne perd pas une figure dont la question n’existe plus', () => {
    const { slices, unplaced } = sliceContentForFigures(LISTE, [figure('/perdue.png', 9)]);
    expect(unplaced.map(image => image.src)).toEqual(['/perdue.png']);
    // Le contenu reste entier, en un seul morceau.
    expect(slices).toHaveLength(1);
    expect(slices[0].content).toBe(LISTE);
  });

  it('ne perd pas une figure quand le contenu n’a aucune liste', () => {
    const { unplaced } = sliceContentForFigures('Un simple paragraphe.', [figure('/f.png', 1)]);
    expect(unplaced).toHaveLength(1);
  });

  it('laisse le contenu intact sans figure', () => {
    const { slices, unplaced } = sliceContentForFigures(LISTE, []);
    expect(unplaced).toEqual([]);
    expect(slices).toHaveLength(1);
    expect(slices[0].content).toBe(LISTE);
    expect(slices[0].listStart).toBe(0);
  });

  it('ne perd aucun item ni aucun texte, quelle que soit la question visée', () => {
    const content = `${LISTE}\nRetenir la conclusion.`;
    for (const index of [1, 2, 3]) {
      const { slices } = sliceContentForFigures(content, [figure('/f.png', index)]);
      const rebuilt = slices.map(slice => slice.content).join(' ');
      expect((rebuilt.match(/\\item\b/g) || []).length).toBe(3);
      expect(rebuilt).toContain('Consignes');
      expect(rebuilt).toContain('Retenir la conclusion.');
    }
  });
});

describe('aperçu lisible d’un item', () => {
  it('retire les commandes LaTeX sans coller les mots', () => {
    expect(plainItemText('On simplifie $\\dfrac{x^2-1}{x-1}=\\blank{x+1}$.')).toBe('On simplifie x^2-1/x-1=….');
  });

  it('ne dévoile pas la réponse d’un trou à compléter', () => {
    expect(plainItemText('\\blank{2} est la limite.')).toBe('… est la limite.');
    expect(plainItemText('\\blank{\\dfrac{2}{3}}')).toBe('…');
  });

  it('borne la longueur', () => {
    expect(plainItemText('a'.repeat(120))).toHaveLength(90);
    expect(plainItemText('a'.repeat(120)).endsWith('…')).toBe(true);
  });
});
