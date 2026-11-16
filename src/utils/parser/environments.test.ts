import { describe, expect, it } from 'vitest';
import { readBalancedEnvironment, stripEnvironmentTitle } from './environments';

const B = '\\'; // un antislash, pour garder les cas lisibles

describe('readBalancedEnvironment', () => {
  it('lit un environnement simple et renvoie la fin de sa fermeture', () => {
    const text = `${B}begin{enumerate}${B}item A${B}end{enumerate} suite`;
    const result = readBalancedEnvironment(text, 0, 'enumerate');
    expect(result).not.toBeNull();
    expect(result!.content).toBe(`${B}item A`);
    expect(text.slice(result!.endIndex)).toBe(' suite');
  });

  it('apparie la fermeture EXTÉRIEURE quand le même environnement est imbriqué', () => {
    const text = [
      `${B}begin{enumerate}`,
      `${B}item Calculer.`,
      `${B}begin{enumerate}`,
      `${B}item a)`,
      `${B}end{enumerate}`,
      `${B}item Déterminer.`,
      `${B}end{enumerate}`,
      '',
    ].join('');
    const result = readBalancedEnvironment(text, 0, 'enumerate');
    expect(result).not.toBeNull();
    // Le contenu va jusqu'à la DERNIÈRE fermeture : la sous-liste est incluse.
    expect(result!.content.startsWith(`${B}item Calculer.`)).toBe(true);
    expect(result!.content).toContain(`${B}begin{enumerate}${B}item a)${B}end{enumerate}`);
    expect(result!.content.endsWith(`${B}item Déterminer.`)).toBe(true);
    expect(result!.endIndex).toBe(text.length);
  });

  it('gère trois niveaux du même environnement', () => {
    const text = `${B}begin{enumerate}A${B}begin{enumerate}B${B}begin{enumerate}C${B}end{enumerate}${B}end{enumerate}${B}end{enumerate}`;
    const result = readBalancedEnvironment(text, 0, 'enumerate');
    expect(result).not.toBeNull();
    expect(result!.endIndex).toBe(text.length);
    expect((result!.content.match(/\\begin\{enumerate\}/g) || []).length).toBe(2);
  });

  it('ne confond pas deux types différents imbriqués', () => {
    const text = `${B}begin{enumerate}${B}item ${B}begin{itemize}${B}item x${B}end{itemize}${B}end{enumerate}`;
    const result = readBalancedEnvironment(text, 0, 'enumerate');
    expect(result).not.toBeNull();
    expect(result!.content).toContain(`${B}begin{itemize}`);
    expect(result!.endIndex).toBe(text.length);
  });

  it("ne confond pas un type préfixe d'un autre", () => {
    // `align` ne doit pas se refermer sur `align*` et réciproquement.
    const text = `${B}begin{align*}x${B}end{align*}`;
    expect(readBalancedEnvironment(text, 0, 'align')).toBeNull();
    const starred = readBalancedEnvironment(text, 0, 'align*');
    expect(starred).not.toBeNull();
    expect(starred!.content).toBe('x');
  });

  it('renvoie null si la fermeture manque', () => {
    const text = `${B}begin{enumerate}${B}item A`;
    expect(readBalancedEnvironment(text, 0, 'enumerate')).toBeNull();
  });

  it("renvoie null si l'index n'ouvre pas cet environnement", () => {
    const text = `${B}begin{itemize}${B}end{itemize}`;
    expect(readBalancedEnvironment(text, 0, 'enumerate')).toBeNull();
  });

  it('lit un environnement qui commence au milieu du texte', () => {
    const text = `Intro. ${B}begin{quote}Citation${B}end{quote} Fin.`;
    const start = text.indexOf(`${B}begin{quote}`);
    const result = readBalancedEnvironment(text, start, 'quote');
    expect(result).not.toBeNull();
    expect(result!.content).toBe('Citation');
    expect(text.slice(result!.endIndex)).toBe(' Fin.');
  });
});

describe('stripEnvironmentTitle', () => {
  it('retire le titre optionnel collé à l’ouverture', () => {
    expect(stripEnvironmentTitle('[Titre]contenu')).toBe('contenu');
    expect(stripEnvironmentTitle('[Titre vide]')).toBe('');
    expect(stripEnvironmentTitle('contenu')).toBe('contenu');
    // Un crochet plus loin dans le contenu n'est pas un titre.
    expect(stripEnvironmentTitle('Attention [x] ici')).toBe('Attention [x] ici');
  });
});
