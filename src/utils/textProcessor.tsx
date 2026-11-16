/**
 * Simple utility to highlight keywords in a text node.
 * Used by mathParser.
 */
const KEYWORDS = [
    'Soit', 'Montrer que', 'En d\u00e9duire', 'Donc', 'Si', 'Alors',
    'Calculer', 'D\u00e9terminer', 'On suppose', 'D\u00e9montrer', 'Justifier',
    'Conclure', 'Sachant que', 'Pour tout', 'Existe-t-il', 'V\u00e9rifier',
    'Interpr\u00e9ter', 'R\u00e9soudre', '\u00c9tudier'
];

export const appendHighlightedText = (target: HTMLElement, text: string, enableKeywords: boolean = false) => {
    if (!enableKeywords) {
        target.appendChild(document.createTextNode(text));
        return;
    }

    const words = text.split(/(\s+|[.,;?!])/);

    words.forEach(word => {
        if (KEYWORDS.includes(word)) {
            const span = document.createElement('span');
            span.className = 'font-medium text-slate-700';
            span.textContent = word;
            target.appendChild(span);
        } else {
            target.appendChild(document.createTextNode(word));
        }
    });
};

const normalizeOrdinalSuffix = (rank: string, rawSuffix: string): string => {
    const suffix = rawSuffix.toLowerCase();

    if (suffix === 'er' || suffix === 'ere' || suffix === '\u00e8re' || suffix === '\u00e3\u00a8re') {
        return rank === '1' ? 'er' : 'eme';
    }

    if (suffix === 'e' || suffix === 'eme' || suffix === '\u00e8me' || suffix === '\u00e9me' || suffix === '\u00e3\u00a8me') {
        return rank === '1' ? 'er' : 'eme';
    }

    return suffix;
};

/**
 * Formats class names as compact, readable labels like "2ème Bac Sc. Math".
 * Keeps ordinals inline for better mobile readability.
 */
export const formatClassName = (className: string) => {
    let text = className.replace(/-/g, ' ').trim();

    text = text
        .replace(/math(?:[e\u00e9\u00c3\u00a9]matiques?)/gi, 'Math')
        .replace(/exp(?:[e\u00e9\u00c3\u00a9]rimentales?)/gi, 'Exp')
        .replace(/\bsciences?\b/gi, 'Sc.')
        .replace(/\bphysiques?\b/gi, 'Phys')
        .replace(/\bvie et terre\b/gi, 'SVT')
        .replace(/\bbac(?:calaur[e\u00e9]at)?\b/gi, 'Bac')
        .replace(/\s+/g, ' ')
        .trim();

    const match = text.match(/^(\d+)\s*(er|ere|e|eme|\u00e8me|\u00e9me|\u00e8re|\u00e3\u00a8me|\u00e3\u00a8re)?\s*(.*)$/i);
    if (!match) return text;

    const rank = match[1];
    const rawSuffix = match[2];
    const rest = (match[3] || '').trim();

    if (!rawSuffix) {
        return [rank, rest].filter(Boolean).join(' ');
    }

    const suffix = normalizeOrdinalSuffix(rank, rawSuffix);
    const displaySuffix = suffix === 'eme' ? '\u00e8me' : suffix;

    return `${rank}${displaySuffix}${rest ? ` ${rest}` : ''}`.trim();
};
