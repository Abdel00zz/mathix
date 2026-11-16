/**
 * Réglage prof « Afficher les titres des blocs » (paramètres tablette).
 *
 * Deux choses à verrouiller :
 *  1. la règle de lecture à plat — ni titre-question, ni bouton « Afficher » ;
 *  2. la valeur par défaut du profil, complétée sans perte pour les profils
 *     enregistrés avant l'arrivée du réglage.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { REVEAL_AIDS, REVEALABLE, shouldFlattenReveal } from './revisionBlockTypes';
import { DEFAULT_PREFS, loadProfPersonalization } from '../components/ProfStudio/settings/personalization';

describe('shouldFlattenReveal — « Afficher les titres des blocs »', () => {
  it('laisse tout en place quand les titres sont affichés', () => {
    for (const type of ['definition', 'theorem', 'proposition', 'property', 'method']) {
      expect(shouldFlattenReveal(type, true)).toBe(false);
    }
  });

  it('aplatit les encadrés de cours quand les titres sont masqués', () => {
    const courseTypes = [
      'definition', 'theorem', 'proposition', 'property',
      'lemma', 'corollary', 'consequence', 'technique', 'method', 'strategy',
    ];
    for (const type of courseTypes) {
      expect(REVEALABLE.has(type)).toBe(true);
      expect(shouldFlattenReveal(type, false)).toBe(true);
    }
  });

  it('préserve le repli des aides d’exercice', () => {
    for (const type of ['hint', 'solution', 'problem']) {
      expect(REVEALABLE.has(type)).toBe(true);
      expect(REVEAL_AIDS.has(type)).toBe(true);
      expect(shouldFlattenReveal(type, false)).toBe(false);
    }
  });

  it('ignore les blocs qui ne se replient pas', () => {
    for (const type of ['text', 'application', 'exploration', 'warning', 'remark', 'intro', 'cela_permet_de']) {
      expect(REVEALABLE.has(type)).toBe(false);
      expect(shouldFlattenReveal(type, false)).toBe(false);
    }
  });
});

describe('préférences — défaut et migration', () => {
  const KEY = 'mathplus:prof-personalization';
  const store = new Map<string, string>();

  beforeEach(() => {
    store.clear();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => { store.set(key, value); },
      removeItem: (key: string) => { store.delete(key); },
    });
  });

  afterEach(() => { vi.unstubAllGlobals(); });

  it('affiche les titres par défaut', () => {
    expect(DEFAULT_PREFS.revision.showBlockTitles).toBe(true);
    expect(loadProfPersonalization().revision.showBlockTitles).toBe(true);
  });

  it('complète un profil enregistré avant l’arrivée du réglage', () => {
    store.set(KEY, JSON.stringify({ revision: { textScale: 1.2, progressiveReveal: true } }));
    const prefs = loadProfPersonalization();
    expect(prefs.revision.showBlockTitles).toBe(true);
    expect(prefs.revision.textScale).toBe(1.2);
    expect(prefs.revision.progressiveReveal).toBe(true);
  });

  it('respecte un profil qui masque les titres', () => {
    store.set(KEY, JSON.stringify({ revision: { showBlockTitles: false } }));
    expect(loadProfPersonalization().revision.showBlockTitles).toBe(false);
  });

  it('retombe sur les valeurs par défaut si le stockage est illisible', () => {
    store.set(KEY, '{ pas du json');
    expect(loadProfPersonalization().revision.showBlockTitles).toBe(true);
  });
});
