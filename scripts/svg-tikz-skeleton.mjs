#!/usr/bin/env node
/**
 * Générateur de squelette de figure SVG « style TikZ ».
 *
 * Produit un SVG autonome prêt à compléter : polices Computer Modern
 * embarquées, feuille de style du guide, papier millimétré, grille pleine
 * page, axes à pointe triangulaire, graduations et leurs nombres.
 *
 * L'auteur n'a plus qu'à ajouter ses courbes (`<path class="curve">`), ses
 * droites de repère (`<line class="aux-c">`) et ses guides (`<line class="guid">`).
 *
 * Tout le style vient de `svg-tikz-style.mjs` : ce script ne fait que choisir
 * un repère et appeler les primitives. Aucune couleur ni épaisseur n'est
 * écrite ici — c'est ce qui garantit qu'un squelette et une figure générée
 * restent identiques.
 *
 * Exemple (repère 8 × 6 unités, pas de 45 px, origine à (60, 340)) :
 *
 *   node scripts/svg-tikz-skeleton.mjs --out tmp/figure.svg \
 *     --xmin -1 --xmax 8 --ymin -1 --ymax 5 --ux 45 --uy 45 --x0 60 --y0 340
 *
 * Voir docs/GUIDE_SVG_TIKZ.md pour la démarche complète.
 */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { css, MARKER, round, scale, axes, paper, grid } from './svg-tikz-style.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/* ── Options ─────────────────────────────────────────────────────────────── */

const argv = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] !== undefined ? Number(argv[i + 1]) : fallback;
};
const out = (() => {
  const i = argv.indexOf('--out');
  return i >= 0 ? argv[i + 1] : null;
})();

const xmin = opt('xmin', -1); const xmax = opt('xmax', 7);
const ymin = opt('ymin', -1); const ymax = opt('ymax', 5);
const ux = opt('ux', 45); const uy = opt('uy', 45);
const x0 = opt('x0', 60); const y0 = opt('y0', 340);
const pad = opt('pad', 34);
const W = opt('w', Math.round(x0 + xmax * ux + pad));
const H = opt('h', Math.round(y0 + Math.abs(ymin) * uy + pad));
const MARGE = 12; // marge entre la pointe de flèche et le bord, en pixels

const s = scale({ x0, y0, ux, uy });

/**
 * Les traits d'axe courent jusqu'au bord, les graduations s'arrêtent au
 * domaine : ce sont deux étendues distinctes (voir GUIDE_SVG_TIKZ.md § 5).
 * On prolonge d'abord d'une demi-unité, puis on borne au bord du papier.
 */
const axis = {
  xmin: Math.max(xmin - 0.5, (MARGE - x0) / ux),
  xmax: Math.min(xmax + 0.5, (W - MARGE - x0) / ux),
  ymin: Math.max(ymin - 0.5, (y0 - H + MARGE) / uy),
  ymax: Math.min(ymax + 0.5, (y0 - MARGE) / uy),
};

/* ── Construction ────────────────────────────────────────────────────────── */

const svg = `<!-- Figure générée par scripts/svg-tikz-skeleton.mjs — voir docs/GUIDE_SVG_TIKZ.md
     Repère : 1 unité = ${ux} px en abscisse, ${uy} px en ordonnée.
     Origine (0 ; 0) au point (${x0} ; ${y0}) en pixels. -->
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" shape-rendering="geometricPrecision">
<title>À décrire : titre lisible par un lecteur d'écran</title>
<defs>
<style>${css()}</style>
${MARKER}
</defs>

${paper({ w: W, h: H })}

<g class="grid">
${grid(s, { step: 1, w: W, h: H }).map((l) => `  ${l}`).join('\n')}
</g>

<g class="axes">
${axes(s, { xmin, xmax, ymin, ymax, axis }).map((l) => `  ${l}`).join('\n')}
  <text class="lbl-m" x="${round(s.px(axis.xmax) - 8)}" y="${round(s.py(0) - 14)}" text-anchor="middle">x</text>
  <text class="lbl-m" x="${round(s.px(0) + 10)}" y="${round(s.py(axis.ymax) + 20)}" text-anchor="start">y</text>
</g>

<!-- À COMPLÉTER : courbe principale
<path class="curve" d="M ${round(s.px(xmin))} ${round(s.py(0))} L ${round(s.px(xmax))} ${round(s.py(0))}"/>
-->

<!-- À COMPLÉTER : point remarquable
<circle class="pt" cx="${round(s.px(3))}" cy="${round(s.py(2))}" r="4"/>
-->

<!-- À COMPLÉTER : droite de repère (rouge) et guide de projection (vert)
<line class="aux-c" x1="${round(s.px(xmin))}" y1="${round(s.py(3))}" x2="${round(s.px(xmax))}" y2="${round(s.py(3))}"/>
<line class="guid" x1="${round(s.px(3))}" y1="${round(s.py(0))}" x2="${round(s.px(3))}" y2="${round(s.py(2))}"/>
-->
</svg>
`;

if (out) {
  writeFileSync(join(ROOT, out), svg, 'utf8');
  console.log(`${out} écrit — ${(svg.length / 1024).toFixed(1)} Ko (viewBox ${W}×${H})`);
} else {
  process.stdout.write(svg);
}
