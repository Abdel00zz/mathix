import { RevisionSection } from '../types';

export interface RevisionSearchEntry {
  id: string;
  sectionId: string;
  blockId: string;
  blockIndex: number | 'content' | 'title';
  sectionTitle: string;
  blockTitle?: string;
  text: string;
  normalizedText: string;
  normalizedSectionTitle: string;
  normalizedBlockTitle: string;
  order: number;
}

export interface RevisionSearchResult extends RevisionSearchEntry {
  score: number;
  snippet: string;
  terms: string[];
}

const LATEX_WORDS: Record<string, string> = {
  alpha: 'alpha', beta: 'beta', gamma: 'gamma', delta: 'delta', theta: 'theta',
  lambda: 'lambda', mu: 'mu', pi: 'pi', rho: 'rho', sigma: 'sigma', omega: 'omega',
  infty: 'infini', times: 'fois', cdot: 'fois', div: 'divise', pm: 'plus moins',
  leq: 'inferieur egal', geq: 'superieur egal', neq: 'different', approx: 'environ',
  implies: 'implique', iff: 'equivaut', forall: 'pour tout', exists: 'il existe',
  Re: 'partie reelle', Im: 'partie imaginaire', arg: 'argument',
  sin: 'sin', cos: 'cos', tan: 'tan', ln: 'ln', log: 'log', exp: 'exp',
};

const GREEK_SYMBOLS: Record<string, string> = {
  α: ' alpha ', β: ' beta ', γ: ' gamma ', δ: ' delta ', θ: ' theta ',
  λ: ' lambda ', μ: ' mu ', π: ' pi ', ρ: ' rho ', σ: ' sigma ', ω: ' omega ',
  Α: ' alpha ', Β: ' beta ', Γ: ' gamma ', Δ: ' delta ', Θ: ' theta ',
  Λ: ' lambda ', Μ: ' mu ', Π: ' pi ', Ρ: ' rho ', Σ: ' sigma ', Ω: ' omega ',
};

const expandGreekSymbols = (value: string) => value.replace(
  /[αβγδθλμπρσωΑΒΓΔΘΛΜΠΡΣΩ]/g,
  symbol => GREEK_SYMBOLS[symbol] || symbol,
);

export const normalizeRevisionSearchText = (value: string) => expandGreekSymbols(value)
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLocaleLowerCase('fr-FR')
  .replace(/[’']/g, ' ')
  .replace(/[^a-z0-9]+/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

/** Convertit le contenu pédagogique (Markdown/LaTeX léger) en texte recherchable et lisible. */
const revisionContentToPlainText = (value: string) => {
  let text = expandGreekSymbols(value)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\\(?:dfrac|tfrac|frac)\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g, '$1 sur $2')
    .replace(/\\sqrt\s*\{([^{}]*)\}/g, 'racine de $1')
    .replace(/\\(?:begin|end)\s*\{[^{}]+\}/g, ' ');

  // Déplie les macros de présentation imbriquées sans exposer leur syntaxe
  // dans les extraits. Trois passes couvrent les structures du contenu JSON.
  const wrapperPattern = /\\(?:text|textbf|textit|mathrm|mathbf|mathbb|mathcal|operatorname|objectif|defi|savant|mathqst|qst|itemsize|boxed|underline|overline|vec)\s*\{([^{}]*)\}/g;
  for (let pass = 0; pass < 3; pass++) text = text.replace(wrapperPattern, '$1');

  text = text
    .replace(/\\(?:left|right|displaystyle|textstyle|quad|qquad|,|;|!)/g, ' ')
    .replace(/\\([A-Za-z]+)\b/g, (_match, command: string) => LATEX_WORDS[command] || ' ')
    .replace(/\\[()[\]]/g, ' ')
    .replace(/[\\$*_`#~^{}|]/g, ' ')
    .replace(/&(?:nbsp|ensp|emsp);/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/\s+/g, ' ')
    .trim();

  // Les contenus peuvent contenir des séparateurs Markdown isolés.
  text = text.replace(/\s+([,.;:!?])/g, '$1');
  return text;
};

export const normalizeRevisionSearchQuery = (value: string) => (
  normalizeRevisionSearchText(revisionContentToPlainText(value))
);

const splitIntoParagraphs = (value: string) => {
  const structuralParts = value
    .replace(/<br\s*\/?>/gi, '\n')
    .split(/(?:\r?\n\s*\r?\n|\\par\b|\r?\n(?=\s*[-•]))/g)
    .map(revisionContentToPlainText)
    .filter(Boolean);

  return structuralParts.length > 0 ? structuralParts : [revisionContentToPlainText(value)].filter(Boolean);
};

const createEntry = (
  section: RevisionSection,
  blockId: string,
  blockIndex: RevisionSearchEntry['blockIndex'],
  blockTitle: string | undefined,
  text: string,
  order: number,
  paragraphIndex: number,
): RevisionSearchEntry => ({
  id: `${blockId}:${paragraphIndex}`,
  sectionId: section.id,
  blockId,
  blockIndex,
  sectionTitle: revisionContentToPlainText(section.title),
  blockTitle: blockTitle ? revisionContentToPlainText(blockTitle) : undefined,
  text,
  normalizedText: normalizeRevisionSearchText(text),
  normalizedSectionTitle: normalizeRevisionSearchText(section.title),
  normalizedBlockTitle: normalizeRevisionSearchText(blockTitle || ''),
  order,
});

export const buildRevisionSearchIndex = (sections: RevisionSection[]): RevisionSearchEntry[] => {
  const entries: RevisionSearchEntry[] = [];
  let order = 0;

  sections.forEach(section => {
    const title = revisionContentToPlainText(section.title);
    if (title) {
      entries.push(createEntry(section, section.id, 'title', undefined, title, order++, 0));
    }

    if (section.blocks?.length) {
      section.blocks.forEach((block, blockIndex) => {
        const blockId = `revision-block-${section.id}-${blockIndex}`;
        const values = Array.isArray(block.content) ? block.content : [block.content];
        const paragraphs = values.flatMap(splitIntoParagraphs);
        const blockTitle = block.title?.trim();

        if (blockTitle && paragraphs.length === 0) {
          paragraphs.push(revisionContentToPlainText(blockTitle));
        }

        paragraphs.forEach((paragraph, paragraphIndex) => {
          entries.push(createEntry(
            section,
            blockId,
            blockIndex,
            blockTitle,
            paragraph,
            order++,
            paragraphIndex,
          ));
        });
      });
    } else if (section.content?.trim()) {
      splitIntoParagraphs(section.content).forEach((paragraph, paragraphIndex) => {
        entries.push(createEntry(
          section,
          `revision-block-${section.id}-content`,
          'content',
          undefined,
          paragraph,
          order++,
          paragraphIndex,
        ));
      });
    }
  });

  return entries;
};

const makeSnippet = (text: string, terms: string[]) => {
  if (text.length <= 138) return text;
  const normalized = normalizeRevisionSearchText(text);
  const positions = terms
    .map(term => normalized.indexOf(term))
    .filter(position => position >= 0);
  const normalizedPosition = positions.length ? Math.min(...positions) : 0;
  const ratio = normalized.length ? normalizedPosition / normalized.length : 0;
  const approximatePosition = Math.round(text.length * ratio);
  const start = Math.max(0, Math.min(text.length - 138, approximatePosition - 46));
  const rawSnippet = text.slice(start, start + 138).trim();
  return `${start > 0 ? '…' : ''}${rawSnippet}${start + 138 < text.length ? '…' : ''}`;
};

export const searchRevisionIndex = (
  index: RevisionSearchEntry[],
  query: string,
  limit = 40,
): RevisionSearchResult[] => {
  const normalizedQuery = normalizeRevisionSearchQuery(query);
  if (!normalizedQuery) return [];

  const terms = Array.from(new Set(normalizedQuery.split(' ').filter(Boolean)));
  if (terms.length === 0) return [];

  return index
    .flatMap(entry => {
      const searchable = `${entry.normalizedSectionTitle} ${entry.normalizedBlockTitle} ${entry.normalizedText}`;
      if (!terms.every(term => searchable.includes(term))) return [];
      const directContent = `${entry.normalizedBlockTitle} ${entry.normalizedText}`;
      // Le titre de section sert de contexte pour une requête multi-mots, mais
      // ne doit pas transformer tous ses paragraphes en doublons de résultat.
      if (entry.blockIndex !== 'title' && !terms.some(term => directContent.includes(term))) return [];

      let score = 0;
      if (entry.normalizedText.includes(normalizedQuery)) score += 90;
      if (entry.normalizedBlockTitle.includes(normalizedQuery)) score += 125;
      if (entry.normalizedSectionTitle.includes(normalizedQuery)) score += 150;
      terms.forEach(term => {
        if (entry.normalizedText.includes(term)) score += 18;
        if (entry.normalizedBlockTitle.includes(term)) score += 32;
        if (entry.normalizedSectionTitle.includes(term)) score += 42;
        if (entry.normalizedText.startsWith(term)) score += 8;
      });
      if (entry.blockIndex === 'title') score += 20;

      return [{
        ...entry,
        score,
        snippet: makeSnippet(entry.text, terms),
        terms,
      }];
    })
    .sort((a, b) => b.score - a.score || a.order - b.order)
    .slice(0, limit);
};
