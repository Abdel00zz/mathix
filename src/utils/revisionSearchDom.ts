import { normalizeRevisionSearchQuery } from './revisionSearch';

interface SearchCharacterPosition {
  node: Text;
  offset: number;
}

const isSearchableTextNode = (node: Text) => {
  const parent = node.parentElement;
  if (!parent || !node.data.trim()) return false;
  return !parent.closest(
    'script, style, [hidden], .katex-mathml, .mjx-assistive-mml, [aria-hidden="true"]'
  );
};

const SEARCH_GREEK_SYMBOLS: Record<string, string> = {
  α: 'alpha', β: 'beta', γ: 'gamma', δ: 'delta', θ: 'theta', λ: 'lambda',
  μ: 'mu', π: 'pi', ρ: 'rho', σ: 'sigma', ω: 'omega',
  Α: 'alpha', Β: 'beta', Γ: 'gamma', Δ: 'delta', Θ: 'theta', Λ: 'lambda',
  Μ: 'mu', Π: 'pi', Ρ: 'rho', Σ: 'sigma', Ω: 'omega',
};

/** Retrouve une occurrence sans tenir compte des accents ni de la casse, même entre plusieurs balises. */
export const findSearchTextRange = (scope: HTMLElement, query: string, terms: string[]) => {
  const walker = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) =>
      isSearchableTextNode(node as Text)
        ? NodeFilter.FILTER_ACCEPT
        : NodeFilter.FILTER_REJECT,
  });
  const normalizedCharacters: string[] = [];
  const positions: SearchCharacterPosition[] = [];
  let current = walker.nextNode() as Text | null;

  while (current) {
    for (let offset = 0; offset < current.data.length; offset++) {
      const expanded = (SEARCH_GREEK_SYMBOLS[current.data[offset]] || current.data[offset])
        .toLocaleLowerCase('fr-FR')
        .replace(/œ/g, 'oe')
        .replace(/æ/g, 'ae')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');
      const searchable = expanded.replace(/[^a-z0-9]/g, '');

      if (searchable) {
        for (const character of searchable) {
          normalizedCharacters.push(character);
          positions.push({ node: current, offset });
        }
      } else if (normalizedCharacters.length > 0 && normalizedCharacters.at(-1) !== ' ') {
        normalizedCharacters.push(' ');
        positions.push({ node: current, offset });
      }
    }

    if (normalizedCharacters.length > 0 && normalizedCharacters.at(-1) !== ' ') {
      normalizedCharacters.push(' ');
      positions.push({ node: current, offset: current.data.length });
    }
    current = walker.nextNode() as Text | null;
  }

  const haystack = normalizedCharacters.join('').replace(/\s+/g, ' ');
  // La compression des espaces ci-dessus changerait les index si le DOM en
  // contient plusieurs. Le flux construit n'en ajoute qu'un à la fois, donc
  // le tableau de positions reste aligné.
  const candidates = [normalizeRevisionSearchQuery(query), ...terms]
    .filter((candidate, index, all) => candidate && all.indexOf(candidate) === index)
    .sort((a, b) => b.length - a.length);

  for (const candidate of candidates) {
    const start = haystack.indexOf(candidate);
    if (start < 0 || !positions[start]) continue;
    const endIndex = Math.min(start + candidate.length - 1, positions.length - 1);
    const startPosition = positions[start];
    const endPosition = positions[endIndex];
    const range = document.createRange();
    range.setStart(startPosition.node, startPosition.offset);
    range.setEnd(endPosition.node, Math.min(endPosition.offset + 1, endPosition.node.data.length));
    return range;
  }

  return null;
};
