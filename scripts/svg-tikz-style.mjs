/**
 * Style partagé des figures SVG « type TikZ » du projet.
 *
 * Source unique de vérité pour la palette, la feuille de style (polices
 * Computer Modern embarquées) et la pointe de flèche « stealth ».
 *
 * Utilisé par :
 *   - scripts/svg-tikz-skeleton.mjs        (squelette générique)
 *   - scripts/generate-continuite-figures.mjs (figures de la fiche continuité)
 *
 * Voir docs/GUIDE_SVG_TIKZ.md.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/* ── Palette canonique (identique au pipeline TikZ du projet) ─────────────── */

export const PALETTE = {
  /* ── Papier millimétré ────────────────────────────────────────────────────
   * Le style de référence : un fond bleu très pâle, une grille cyan
   * pointillée qui couvre toute la figure. C'est ce qui donne l'air « manuel
   * scolaire » — et c'est la figure elle-même qui porte ce fond, jamais la
   * carte de l'application. */
  paper: '#EAF4FC',
  grid: '#AFDAF2',
  /* Axes et nombres : noirs. Un gris ardoise rendait la figure « moderne »
   * mais la faisait lire comme un graphique d'interface, pas comme un repère
   * de mathématiques. */
  axis: '#111111',
  ink: '#111111',
  muted: '#3F4A54',
  /* Encres vives. L'ancienne palette, désaturée, se lisait bien à l'écran mais
   * pâlissait à l'impression et ne distinguait pas assez deux courbes
   * voisines. */
  blue: '#1B6FE3',
  coral: '#E23636',
  teal: '#1CA45C',
  gold: '#C97A12',
  magenta: '#D6006E',
  purple: '#7A2BC8',
};

/* ── Polices embarquées ──────────────────────────────────────────────────── */

const SERIF = `'Latin Modern Math','Latin Modern Roman','STIX Two Math','Cambria Math','Times New Roman',serif`;
/**
 * Pile des étiquettes mathématiques, calquée sur LaTeX : KaTeX_Math-Italic ne
 * contient QUE des lettres (latin et grec). Chiffres, parenthèses, « = », « ; »,
 * crochets et barres obliques vivent dans KaTeX_Main-Regular : sans ce second
 * maillon, chaque signe de ponctuation tombait sur la police système, au milieu
 * du mot.
 */
const MATH = `FigMath,FigMain,${SERIF}`;
const UPRIGHT = `FigMain,${SERIF}`;
/**
 * Prose d'une figure — mots comme « saut », « aucune solution », titres de
 * panneaux. Le contenu de l'application compose ses phrases avec la police du
 * système et ses mathématiques avec KaTeX : une figure doit faire de même.
 * Les mots vont donc en sans-serif système (aucune webfont de la page ne
 * traverse la frontière de `<img>`, mais les polices système, si), et les
 * étiquettes mathématiques restent en Computer Modern.
 */
const UI = `system-ui,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif`;
const b64 = (p) => readFileSync(join(ROOT, p)).toString('base64');

const face = (family, file, style) =>
  `@font-face{font-family:${family};font-style:${style};font-weight:400;font-display:block;src:url(data:font/woff2;base64,${b64(`node_modules/katex/dist/fonts/${file}`)}) format('woff2')}`;

const FACE_MAIN = () => face('FigMain', 'KaTeX_Main-Regular.woff2', 'normal');
const FACE_MATH = () => face('FigMath', 'KaTeX_Math-Italic.woff2', 'italic');
/** Calligraphique (équivalent de \\mathscr) : lourde, chargée à la demande. */
const FACE_SCRIPT = () => face('FigScript', 'KaTeX_Caligraphic-Regular.woff2', 'normal');

/**
 * Feuille de style commune. Les figures étant affichées via <img>, les polices
 * DOIVENT être embarquées : aucune webfont de la page ne les atteint.
 *
 * `script` n'embarque la police calligraphique que si la figure s'en sert :
 * elle pèse ~10 Ko et une figure sur huit seulement affiche une courbe `𝒞`.
 */
export function css({ script = false } = {}) {
  return [
    FACE_MAIN(),
    FACE_MATH(),
    script ? FACE_SCRIPT() : null,
    `text{font-family:${UPRIGHT};font-size:14.5px;fill:${PALETTE.ink};stroke:none}`,
  // Fond de la figure : un papier bleu très pâle, bords arrondis. C'est LUI qui
  // donne son assise à la figure ; la carte de l'application, elle, reste
  // visible tout autour (voir § 7 du guide).
  `.paper{fill:${PALETTE.paper};stroke:none}`,
  // Grille : cyan pointillée, pleine page — le papier millimétré.
  `.grid{stroke:${PALETTE.grid};stroke-width:1.1;stroke-dasharray:3 3;fill:none;stroke-linecap:butt}`,
  // Repère
  `.axis{stroke:${PALETTE.axis};stroke-width:1.7;fill:none;stroke-linecap:butt}`,
  `.tick{stroke:${PALETTE.axis};stroke-width:1.7;stroke-linecap:butt}`,
  `.tip{fill:${PALETTE.axis};stroke:none}`,
  // Courbes et points
  `.curve{fill:none;stroke:${PALETTE.blue};stroke-width:2.6;stroke-linecap:round;stroke-linejoin:round}`,
  `.pt{fill:${PALETTE.blue};stroke:#ffffff;stroke-width:2}`,
  `.pt-open{fill:#ffffff;stroke:${PALETTE.blue};stroke-width:2.2}`,
  `.pt-c{fill:${PALETTE.coral};stroke:#ffffff;stroke-width:2}`,
  `.pt-g{fill:${PALETTE.coral};stroke:#ffffff;stroke-width:2}`,
  `.pt-t{fill:${PALETTE.teal};stroke:#ffffff;stroke-width:2}`,
  // Droites auxiliaires : rouge, un seul motif et une seule épaisseur. Dans le
  // style de référence, le rouge porte TOUTES les droites de repère — asymptote,
  // seuil y = k, diagonale y = x.
  `.aux-g{fill:none;stroke:${PALETTE.coral};stroke-width:1.8;stroke-dasharray:6 4;stroke-linecap:butt}`,
  `.aux-c{fill:none;stroke:${PALETTE.coral};stroke-width:1.8;stroke-dasharray:6 4;stroke-linecap:butt}`,
  `.aux-t{fill:none;stroke:${PALETTE.coral};stroke-width:1.8;stroke-dasharray:6 4;stroke-linecap:butt}`,
  // Guides de projection : vert, plus fines et plus serrées que les droites de
  // repère — c'est ce qui les distingue d'une asymptote au premier regard.
  `.guid{fill:none;stroke:${PALETTE.teal};stroke-width:1.7;stroke-dasharray:4 3.5;stroke-linecap:butt}`,
  // Bande de valeurs : sur le papier bleu, un lavis trop appuyé se lit comme un
  // aplat gris. 7 % suffisent à délimiter sans masquer la grille.
  `.band{fill:${PALETTE.blue};opacity:.07;stroke:none}`,
  // Portion d'axe mise en évidence. Posée SUR l'axe, la barre l'épaississait au
  // point de le faire lire comme un trait noir : les barres sont donc décalées
  // à côté de l'axe (voir `bar` dans le générateur), pas dessus.
  `.hl{fill:none;stroke:${PALETTE.blue};stroke-width:3.6;stroke-linecap:butt}`,
  `.hl-tick{stroke:${PALETTE.blue};stroke-width:1.9;stroke-linecap:butt}`,
  `.hl-lbl{font-family:${MATH};font-style:italic;font-size:15px;fill:${PALETTE.blue}}`,
  // Étiquettes mathématiques : Computer Modern, comme le contenu composé par KaTeX.
  `.lbl{font-family:${UPRIGHT};font-size:14.5px;fill:${PALETTE.ink}}`,
  // L'origine s'écrit `$O$` en LaTeX : italique mathématique, plus haute et plus
  // étroite qu'un O de texte. En romain, elle ressemblait à un zéro.
  `.lbl-o{font-family:${MATH};font-style:italic;font-size:16px;fill:${PALETTE.ink}}`,
  `.lbl-m{font-family:${MATH};font-style:italic;font-size:15px;fill:${PALETTE.ink}}`,
  `.lbl-blue{font-family:${MATH};font-style:italic;font-size:15px;fill:${PALETTE.blue}}`,
  `.lbl-gold{font-family:${MATH};font-style:italic;font-size:14.5px;fill:${PALETTE.gold}}`,
  `.lbl-teal{font-family:${MATH};font-style:italic;font-size:14.5px;fill:${PALETTE.teal}}`,
  `.lbl-coral{font-family:${MATH};font-style:italic;font-size:14.5px;fill:${PALETTE.coral}}`,
  // Prose : la police du système, comme les phrases du contenu. Ces deux
  // classes servent dans des panneaux réduits (figures à 2 ou 3 cartes) : un
  // 11,5 px y tomberait sous 7 px à l'affichage, donc illisible.
  `.lbl-t{font-family:${UI};font-size:13.5px;font-weight:600;fill:${PALETTE.ink};letter-spacing:.01em}`,
  `.lbl-u{font-family:${UI};font-size:13px;font-weight:500;fill:${PALETTE.coral}}`,
  // Indices et exposants. KaTeX descend à 0,7 puis 0,5 : à 13 px dans une
  // figure, un exposant de second rang tombe sous 7 px et devient illisible
  // (𝒞_f⁻¹ se lisait « 𝒞_2 »). On serre moins fort, quitte à s'écarter de LaTeX.
  `.sub{font-size:.8em;font-style:italic;baseline-shift:sub}`,
  `.sup{font-size:.82em;font-style:italic;baseline-shift:super}`,
  // Exposant de second rang (𝒞_f⁻¹) : la réduction en cascade le faisait tomber
  // à 0,66 em, soit 9 px. On ne le réduit plus qu'à peine.
  `.sub .sup{font-size:.95em}`,
  // Nom de fonction : \tan, \ln, \operatorname{Arctan}… se composent en romain
  // droit, jamais en italique (\sin ≠ sin). Modificateur à ajouter APRÈS la
  // classe de couleur : à spécificité égale, la dernière règle l'emporte.
  `.up{font-family:${UPRIGHT};font-style:normal}`,
  // Initiale calligraphique d'une courbe : \mathscr{C}_f.
  `.script{font-family:FigScript,${MATH};font-style:normal;font-size:1.15em}`,
  ].filter(Boolean).join('\n');
}

/**
 * Pointe de flèche : le triangle plein légèrement concave du `->` de LaTeX.
 * `markerUnits="userSpaceOnUse"` fige sa taille — sans quoi la flèche de
 * l'axe des ordonnées n'a pas la même allure que celle de l'axe des abscisses.
 * `refX` vaut exactement l'abscisse de la pointe : sinon elle dépasse du trait
 * et se fait rogner par le `viewBox`.
 */
export const MARKER = '<marker id="arrow" viewBox="0 0 10 7" refX="10" refY="3.5" markerWidth="10" markerHeight="7" markerUnits="userSpaceOnUse" orient="auto"><path class="tip" d="M0,0 L10,3.5 L0,7 L2.9,3.5 Z"/></marker>';

/* ── Conversions maths → pixels ──────────────────────────────────────────── */

export const round = (n) => Math.round(n * 10) / 10;

/**
 * Repère orthogonal : origine en pixels + pas d'une unité sur chaque axe.
 * `px` convertit une abscisse mathématique, `py` une ordonnée (axe inversé).
 */
export function scale({ x0, y0, ux = 45, uy = 45 }) {
  return {
    x0, y0, ux, uy,
    px: (x) => x0 + x * ux,
    py: (y) => y0 - y * uy,
  };
}

/* ── Primitives de dessin ────────────────────────────────────────────────── */

/** Courbe échantillonnée : `f` évaluée sur [from, to] en `n` points. */
export function curve(s, f, from, to, n = 160, cls = 'curve') {
  const pts = [];
  for (let i = 0; i <= n; i += 1) {
    const x = from + (i / n) * (to - from);
    const y = f(x);
    if (!Number.isFinite(y)) continue;
    pts.push(`${round(s.px(x))},${round(s.py(y))}`);
  }
  return `<path class="${cls}" d="M ${pts.join(' L ')}"/>`;
}

/** Segment entre deux points mathématiques. */
export function seg(s, x1, y1, x2, y2, cls) {
  return `<line class="${cls}" x1="${round(s.px(x1))}" y1="${round(s.py(y1))}" x2="${round(s.px(x2))}" y2="${round(s.py(y2))}"/>`;
}

/** Point en coordonnées mathématiques. */
export function dot(s, x, y, r = 3.4, cls = 'pt') {
  return `<circle class="${cls}" cx="${round(s.px(x))}" cy="${round(s.py(y))}" r="${r}"/>`;
}

/** Étiquette ; `dx`/`dy` en pixels, `anchor` = text-anchor. */
export function label(s, x, y, text, cls = 'lbl', anchor = 'middle', dx = 0, dy = 0) {
  return `<text class="${cls}" x="${round(s.px(x) + dx)}" y="${round(s.py(y) + dy)}" text-anchor="${anchor}">${text}</text>`;
}

/** Étiquette positionnée directement en pixels (titres de panneaux). */
export function labelPx(x, y, text, cls = 'lbl-t', anchor = 'middle') {
  return `<text class="${cls}" x="${round(x)}" y="${round(y)}" text-anchor="${anchor}">${text}</text>`;
}

/** Comme `seg`, mais décalé de `dx`/`dy` pixels (barre posée À CÔTÉ d'un axe). */
export function segPx(s, x1, y1, x2, y2, cls, dx = 0, dy = 0) {
  return `<line class="${cls}" x1="${round(s.px(x1) + dx)}" y1="${round(s.py(y1) + dy)}" x2="${round(s.px(x2) + dx)}" y2="${round(s.py(y2) + dy)}"/>`;
}

/**
 * Papier millimétré : fond bleu très pâle, à bords arrondis. C'est la figure
 * qui porte son propre papier, comme une page de manuel — la carte de
 * l'application reste visible tout autour.
 *
 * Une figure à plusieurs panneaux pose une carte par panneau (`paper: false`
 * sur `figure`), plutôt qu'une seule grande page : les panneaux se lisent
 * alors comme des blocs séparés.
 */
export function paper({ x = 0, y = 0, w, h, r = 12 }) {
  return `<rect class="paper" x="${round(x)}" y="${round(y)}" width="${round(w)}" height="${round(h)}" rx="${r}"/>`;
}

/**
 * Grille alignée sur l'origine du repère `s`, bornée au cadre
 * `{ x, y, w, h }` (par défaut : toute la figure).
 *
 * Le pas vaut `step` unité(s) mathématique(s) ; une ligne passe donc exactement
 * sur chaque graduation. Il est doublé tant que le pas descend sous 18 px —
 * sans quoi la grille devient un aplat cyan.
 */
export function grid(s, { step = 1, stepX = step, stepY = step, x = 0, y = 0, w, h }) {
  const out = [];
  let ux = (s.ux ?? 45) * stepX;
  let uy = (s.uy ?? 45) * stepY;
  // Doubler le pas tant qu'il descend sous 18 px : sinon la grille devient un
  // aplat cyan.
  while (ux < 18) ux *= 2;
  while (uy < 18) uy *= 2;

  // Première ligne du cadre alignée sur l'origine : on avance de proche en
  // proche depuis `s.x0` / `s.y0`, qui sont eux-mêmes sur la grille.
  const firstX = s.x0 - Math.ceil((s.x0 - x) / ux) * ux;
  for (let gx = firstX; gx <= x + w; gx += ux) {
    if (gx < x) continue;
    out.push(`<line class="grid" x1="${round(gx)}" y1="${round(y)}" x2="${round(gx)}" y2="${round(y + h)}"/>`);
  }
  const firstY = s.y0 - Math.ceil((s.y0 - y) / uy) * uy;
  for (let gy = firstY; gy <= y + h; gy += uy) {
    if (gy < y) continue;
    out.push(`<line class="grid" x1="${round(x)}" y1="${round(gy)}" x2="${round(x + w)}" y2="${round(gy)}"/>`);
  }
  return out;
}

/**
 * Axes fléchés avec graduations entières et nombres.
 *
 * `min`/`max` bornent les **graduations** ; `axis` borne le **trait** lui-même.
 * Les deux diffèrent : sur le style de référence, les axes courent jusqu'au bord
 * de la figure alors que la dernière graduation est à l'intérieur.
 */
export function axes(s, { xmin, xmax, ymin, ymax, ticks = true, labels = true, axis = {} } = {}) {
  const ax = {
    xmin: axis.xmin ?? xmin, xmax: axis.xmax ?? xmax,
    ymin: axis.ymin ?? ymin, ymax: axis.ymax ?? ymax,
  };
  const out = [
    `<line class="axis" x1="${round(s.px(ax.xmin))}" y1="${round(s.py(0))}" x2="${round(s.px(ax.xmax))}" y2="${round(s.py(0))}" marker-end="url(#arrow)"/>`,
    `<line class="axis" x1="${round(s.px(0))}" y1="${round(s.py(ax.ymin))}" x2="${round(s.px(0))}" y2="${round(s.py(ax.ymax))}" marker-end="url(#arrow)"/>`,
  ];
  if (ticks) {
    const T = 4;
    for (let x = Math.ceil(xmin); x <= Math.floor(xmax); x += 1) {
      if (x === 0) continue;
      out.push(`<line class="tick" x1="${round(s.px(x))}" y1="${round(s.py(0) - T)}" x2="${round(s.px(x))}" y2="${round(s.py(0) + T)}"/>`);
    }
    for (let y = Math.ceil(ymin); y <= Math.floor(ymax); y += 1) {
      if (y === 0) continue;
      out.push(`<line class="tick" x1="${round(s.px(0) - T)}" y1="${round(s.py(y))}" x2="${round(s.px(0) + T)}" y2="${round(s.py(y))}"/>`);
    }
  }
  if (labels) {
    out.push(label(s, 0, 0, 'O', 'lbl-o', 'end', -5, 19));
    for (let x = Math.ceil(xmin); x <= Math.floor(xmax); x += 1) {
      if (x === 0) continue;
      out.push(label(s, x, 0, String(x), 'lbl', 'middle', 0, 19));
    }
    for (let y = Math.ceil(ymin); y <= Math.floor(ymax); y += 1) {
      if (y === 0) continue;
      out.push(label(s, 0, y, String(y), 'lbl', 'end', -5, 5));
    }
  }
  return out;
}

/* ── Assemblage ──────────────────────────────────────────────────────────── */

/**
 * Assemble un SVG autonome : titre accessible, polices embarquées, marqueur,
 * papier millimétré et grille.
 *
 * `grid: { s, step }` trace la grille pleine page alignée sur le repère `s` ;
 * l'omettre donne une figure sans grille (utile pour un schéma sans repère).
 *
 * Refuse d'écrire un SVG contenant NaN, undefined ou Infinity : un `axes()`
 * appelé avec les mauvaises clés (`{min, max}` au lieu de `{xmin, xmax}`)
 * produit des attributs invalides que le navigateur IGNORE en silence — la
 * figure sort sans axes, sans grille, et rien ne le signale.
 */
export function figure({ w, h, title, parts, grid: gridSpec, paper: drawPaper = true }) {
  const body = parts.filter(Boolean);
  const script = body.some((p) => p.includes('class="script"'));
  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img" shape-rendering="geometricPrecision">`,
    `<title>${title.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</title>`,
    `<defs><style>${css({ script })}</style>${MARKER}</defs>`,
    ...(drawPaper ? [paper({ w, h })] : []),
    ...(gridSpec
      ? grid(gridSpec.s, {
        w, h,
        step: gridSpec.step ?? 1,
        stepX: gridSpec.stepX ?? gridSpec.step ?? 1,
        stepY: gridSpec.stepY ?? gridSpec.step ?? 1,
      })
      : []),
    ...body,
    `</svg>`,
    '',
  ].join('\n');

  // Le contrôle ne porte que sur les éléments de dessin : le base64 des polices
  // contient « NaN », « undefined » ou « Infinity » par pur hasard.
  const drawing = body.join('\n');
  const fault = drawing.match(/NaN|undefined|Infinity/);
  if (fault) {
    const line = drawing.split('\n').find((l) => /NaN|undefined|Infinity/.test(l)) ?? '';
    throw new Error(
      `figure : coordonnée invalide (« ${fault[0]} ») dans\n  ${line.trim().slice(0, 180)}\n`
      + 'Vérifier les clés passées à axes()/panel() : {xmin, xmax, ymin, ymax}.',
    );
  }
  return svg;
}
