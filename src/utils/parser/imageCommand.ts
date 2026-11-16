/**
 * imageCommand.ts
 * Responsabilité : la commande de contenu `\image[options]{src}{légende}`.
 *
 * Modèle de placement calqué sur « Habillage du texte » de Word :
 *
 *   Word                         Option ici
 *   ───────────────────────────  ─────────────────────────────────────────────
 *   Aligné sur le texte          position=inline   (+ valign=top|middle|bottom|baseline)
 *   Carré / Rapproché / Au travers  position=float-left | float-right  (le texte coule autour)
 *   Haut et bas                  position=left | center | right  (défaut : center)
 *   Taille (largeur / hauteur)   width=…  height=…  size=small|medium|large|full
 *   Distance du texte            gap=…
 *   Rotation                     rotate=…
 *   Bordure / ombre / coins      border  shadow  rounded
 *
 * « Derrière / devant le texte » n'existe pas : une image qui recouvre du texte
 * est illisible sur téléphone et à l'impression.
 *
 * Fonctions de parsing pures (testables sans DOM) ; seul `renderImageCommand`
 * touche au DOM.
 */

import { createElement } from './shared';

export type ImageWrap = 'block' | 'float' | 'inline';
export type ImageAlign = 'left' | 'center' | 'right';
export type ImageVAlign = 'baseline' | 'top' | 'middle' | 'bottom';
export type ImageFit = 'contain' | 'cover' | 'fill';

export interface ImageOptions {
  width?: string;
  height?: string;
  wrap: ImageWrap;
  /** Côté de l'image : alignement (bloc) ou côté du flottement (float). */
  align: ImageAlign;
  valign: ImageVAlign;
  gap?: string;
  fit: ImageFit;
  rotate?: number;
  alt?: string;
  border: boolean;
  shadow: boolean;
  rounded: boolean;
}

const SIZE_PRESETS: Record<string, string> = {
  tiny: '20%',
  small: '30%',
  medium: '50%',
  large: '75%',
  full: '100%',
};

const LENGTH_RE = /^(\d+(?:[.,]\d+)?)(%|px|cm|mm|in|pt|em|rem|vw|vh)?$/i;

/**
 * Longueur CSS sûre : nombre + unité connue, rien d'autre (aucune valeur libre
 * n'atteint le style). Sans unité, c'est des pixels ; un pourcentage est borné
 * à 100 %. `allowZero` sert aux marges.
 */
export function parseLength(value: string | undefined, allowZero = false): string | undefined {
  const match = value?.trim().match(LENGTH_RE);
  if (!match) return undefined;
  let amount = parseFloat(match[1].replace(',', '.'));
  if (!Number.isFinite(amount) || amount < 0 || (amount === 0 && !allowZero)) return undefined;
  const unit = (match[2] || 'px').toLowerCase();
  if (unit === '%' && amount > 100) amount = 100;
  return `${amount}${unit}`;
}

/** Découpe sur les virgules de niveau 0 (les `{…}` protègent les virgules d'un `alt`). */
function splitOptions(raw: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = '';
  for (const ch of raw) {
    if (ch === '{') depth++;
    else if (ch === '}') depth = Math.max(0, depth - 1);
    if (ch === ',' && depth === 0) {
      parts.push(current);
      current = '';
    } else current += ch;
  }
  parts.push(current);
  return parts.map((part) => part.trim()).filter(Boolean);
}

const stripBraces = (value: string): string => {
  const trimmed = value.trim();
  return trimmed.startsWith('{') && trimmed.endsWith('}') ? trimmed.slice(1, -1).trim() : trimmed;
};

const FALSE_WORDS = new Set(['false', 'no', 'non', '0', 'off', 'none']);
const flag = (value: string | undefined): boolean => value === undefined || value === '' || !FALSE_WORDS.has(value.toLowerCase());

const POSITION_WORDS = new Set([
  'inline', 'left', 'center', 'centre', 'right', 'float-left', 'float-right', 'wrap-left', 'wrap-right', 'block',
]);

/** Lit la liste d'options `[...]` ; toute valeur inconnue est ignorée (jamais d'erreur de rendu). */
export function parseImageOptions(raw: string | undefined): ImageOptions {
  const opts: ImageOptions = {
    wrap: 'block',
    align: 'center',
    valign: 'middle',
    fit: 'contain',
    border: false,
    shadow: false,
    rounded: false,
  };
  if (!raw?.trim()) return opts;

  let position: string | undefined;
  let float: string | undefined;
  let wrapWord: string | undefined;

  for (const token of splitOptions(raw)) {
    const eq = token.indexOf('=');
    // Mots seuls : `\image[50%,right,border]{…}` suffit pour le cas courant.
    if (eq === -1) {
      const word = token.toLowerCase();
      if (POSITION_WORDS.has(word)) position = word;
      else if (word in SIZE_PRESETS) opts.width = SIZE_PRESETS[word];
      else if (word === 'border' || word === 'shadow' || word === 'rounded') opts[word] = true;
      else if (LENGTH_RE.test(word)) opts.width = parseLength(word);
      continue;
    }
    const key = token.slice(0, eq).trim().toLowerCase();
    const value = stripBraces(token.slice(eq + 1));
    const lower = value.toLowerCase();
    switch (key) {
      case 'width': case 'w': case 'largeur':
        opts.width = parseLength(value);
        break;
      case 'height': case 'h': case 'hauteur':
        opts.height = parseLength(value);
        break;
      case 'size': case 'taille':
        if (lower in SIZE_PRESETS) opts.width = SIZE_PRESETS[lower];
        break;
      case 'position': case 'pos': case 'align': case 'place':
        position = lower;
        break;
      case 'float': case 'flotte':
        float = lower;
        break;
      case 'wrap': case 'habillage':
        wrapWord = lower;
        break;
      case 'valign': case 'vertical':
        if (['baseline', 'top', 'middle', 'bottom'].includes(lower)) opts.valign = lower as ImageVAlign;
        break;
      case 'gap': case 'margin': case 'distance': case 'marge':
        opts.gap = parseLength(value, true);
        break;
      case 'fit':
        if (['contain', 'cover', 'fill'].includes(lower)) opts.fit = lower as ImageFit;
        break;
      case 'rotate': case 'rotation': {
        const deg = parseFloat(lower.replace(',', '.'));
        if (Number.isFinite(deg)) opts.rotate = Math.max(-360, Math.min(360, deg));
        break;
      }
      case 'alt':
        opts.alt = value;
        break;
      case 'border': case 'bordure':
        opts.border = flag(lower);
        break;
      case 'shadow': case 'ombre':
        opts.shadow = flag(lower);
        break;
      case 'rounded': case 'arrondi':
        opts.rounded = flag(lower);
        break;
      default:
        break;
    }
  }

  // Résolution du placement. L'ordre reflète la lecture d'un utilisateur Word :
  // « aligné sur le texte » prime, puis le flottement, puis l'alignement en bloc.
  const side = (word: string | undefined): ImageAlign | undefined =>
    word === 'left' || word === 'right' ? word : word === 'center' || word === 'centre' ? 'center' : undefined;

  if (position === 'inline' || wrapWord === 'inline') {
    opts.wrap = 'inline';
  } else if (position === 'float-left' || position === 'wrap-left') {
    opts.wrap = 'float'; opts.align = 'left';
  } else if (position === 'float-right' || position === 'wrap-right') {
    opts.wrap = 'float'; opts.align = 'right';
  } else if (float === 'left' || float === 'right') {
    opts.wrap = 'float'; opts.align = float;
  } else if (wrapWord && ['square', 'tight', 'through', 'carre', 'carré'].includes(wrapWord) && (side(position) === 'left' || side(position) === 'right')) {
    opts.wrap = 'float'; opts.align = side(position)!;
  } else {
    opts.wrap = 'block';
    opts.align = side(position) ?? 'center';
  }

  return opts;
}

/**
 * Source acceptée : chemin du site, `http(s)` ou image `data:`. Tout autre schéma
 * (`javascript:`, `file:`…) est refusé.
 */
export function isSafeImageSrc(src: string): boolean {
  const value = src.trim();
  if (!value || /[\s"'<>`]/.test(value.replace(/^data:[^,]*,/i, ''))) return false;
  const scheme = value.match(/^([a-z][a-z0-9+.-]*):/i)?.[1]?.toLowerCase();
  if (!scheme) return true;
  if (scheme === 'http' || scheme === 'https') return true;
  return scheme === 'data' && /^data:image\/(png|jpe?g|gif|webp|avif|svg\+xml)[;,]/i.test(value);
}

/** Légende : second argument `{…}` collé à la commande (équilibré), s'il existe. */
export function readImageCaption(text: string, index: number): { content: string; endIndex: number } | null {
  if (text[index] !== '{') return null;
  let depth = 0;
  for (let i = index; i < text.length; i++) {
    if (text[i] === '{') depth++;
    else if (text[i] === '}') depth--;
    if (depth === 0) return { content: text.slice(index + 1, i), endIndex: i + 1 };
  }
  return null;
}

/**
 * Construit le nœud de l'image. `renderCaption` compose la légende avec le
 * moteur complet (LaTeX, surlignage…), comme `media.caption`.
 */
export function renderImageCommand(
  src: string,
  rawOptions: string | undefined,
  caption: string | undefined,
  target: HTMLElement,
  renderCaption: (el: HTMLElement, text: string) => void,
): void {
  if (!isSafeImageSrc(src)) {
    const bad = createElement('span', 'math-image-error');
    bad.textContent = '[image non valide]';
    target.appendChild(bad);
    return;
  }

  const opts = parseImageOptions(rawOptions);
  const captionText = caption?.trim();
  const figure = createElement('figure', 'math-image');
  figure.dataset.wrap = opts.wrap;
  figure.dataset.align = opts.align;
  if (opts.wrap === 'inline') figure.dataset.valign = opts.valign;
  if (captionText) figure.dataset.caption = 'true';
  if (opts.width || opts.height) figure.dataset.sized = 'true';
  if (opts.border) figure.dataset.border = 'true';
  if (opts.shadow) figure.dataset.shadow = 'true';
  if (opts.rounded) figure.dataset.rounded = 'true';
  if (opts.gap) figure.style.setProperty('--math-image-gap', opts.gap);
  if (opts.width) figure.style.width = opts.width;
  if (opts.rotate) figure.style.transform = `rotate(${opts.rotate}deg)`;

  const img = createElement('img', 'math-image-media');
  img.src = src.trim();
  img.alt = opts.alt ?? (captionText ? captionText.replace(/[\\${}]/g, '') : 'Illustration');
  img.loading = 'lazy';
  img.decoding = 'async';
  if (opts.width) img.style.width = '100%';
  if (opts.height) {
    img.style.height = opts.height;
    if (!opts.width) img.style.width = 'auto';
    img.style.objectFit = opts.fit;
  }
  figure.appendChild(img);

  if (captionText) {
    const cap = createElement('figcaption', 'math-image-caption');
    renderCaption(cap, captionText);
    figure.appendChild(cap);
  }

  target.appendChild(figure);
}
