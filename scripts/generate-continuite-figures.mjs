#!/usr/bin/env node
/**
 * Figures de la fiche de révision « Limites et continuité » (2ème Bac Sc. Math).
 *
 * Huit résultats du cours de continuité dont la compréhension passe par un
 * schéma : les trois façons de perdre la continuité, le prolongement, l'image
 * d'un segment, le TVI (existence puis unicité), la symétrie des courbes
 * réciproques, la parité des racines n-ièmes et la fonction Arctan.
 *
 * Style de référence : papier millimétré bleu très pâle, grille cyan pointillée,
 * axes noirs à pointe pleine, courbes épaisses et vives, droites de repère en
 * rouge, guides de projection en vert. Voir docs/GUIDE_SVG_TIKZ.md.
 *
 * Conventions :
 *   - les étiquettes MATHÉMATIQUES sont en Computer Modern, comme le contenu
 *     composé par KaTeX ; la PROSE est dans la police du système ;
 *   - `width` du JSON ∝ largeur du viewBox, pour une échelle apparente égale ;
 *   - les axes courent jusqu'au bord, les graduations restent à l'intérieur.
 *
 * Usage :
 *   node scripts/generate-continuite-figures.mjs
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  figure, scale, curve, seg, segPx, dot, label, labelPx, axes, paper, grid, round,
} from './svg-tikz-style.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'public/data/2eme-bac-sc-math/limites-continuite/revisions/figures');
mkdirSync(OUT, { recursive: true });

const PI = Math.PI;
const files = {};

/* ─────────────────────────────────────────────────────────────────────────
 * 1. Les trois façons de perdre la continuité en un point  (3 panneaux)
 *
 * Trois cartes millimétrées séparées plutôt qu'une grande page : chaque
 * panneau devient un bloc, et les trois se comparent sans se mélanger.
 * ───────────────────────────────────────────────────────────────────────── */
{
  const W = 780; const H = 282;
  const parts = [];
  const X = { xmin: -2.1, xmax: 2.1 };
  const Y = { ymin: -2.1, ymax: 2.1 };
  // Trois cartes jointives : 3 × 252 + 2 × 12 d'écart = 780.
  const CARD = { y: 0, w: 252, h: H };

  const panneaux = [
    { p: 0, titre: 'prolongeable' },
    { p: 264, titre: 'saut' },
    { p: 528, titre: 'infinie' },
  ];

  for (const { p, titre } of panneaux) {
    const s = scale({ x0: p + 126, y0: 130, ux: 46, uy: 44 });
    const box = { x: p, ...CARD };
    const cadre = { ...X, ...Y, axis: { xmin: -2.35, xmax: 2.35, ymin: -2.35, ymax: 2.35 } };
    parts.push(`<g>`);
    parts.push(paper(box));
    parts.push(...grid(s, { step: 1, ...box }));
    parts.push(...axes(s, { ...cadre, ticks: false, labels: false }));
    parts.push(label(s, 0, 0, 'O', 'lbl-o', 'end', -5, 18));

    if (titre === 'prolongeable') {
      // f(x) = 0,5x + 0,8 privée du point d'abscisse 1.
      const f = (x) => 0.5 * x + 0.8;
      // Le trou est l'information de la figure : on écarte franchement la
      // courbe de part et d'autre, sinon le disque le recouvre.
      parts.push(curve(s, f, -2.05, 0.86, 60));
      parts.push(curve(s, f, 1.14, 2.05, 60));
      parts.push(seg(s, 1, 0, 1, f(1), 'guid'));
      parts.push(dot(s, 1, f(1), 4.6, 'pt-open'));
    } else if (titre === 'saut') {
      // Marche : la limite à gauche et la valeur à droite ne coïncident pas.
      parts.push(seg(s, -2.05, -0.6, 0, -0.6, 'curve'));
      parts.push(seg(s, 0, 1.2, 2.05, 1.2, 'curve'));
      parts.push(dot(s, 0, -0.6, 4.6, 'pt-open'));
      parts.push(dot(s, 0, 1.2, 4.6, 'pt'));
    } else {
      // Branche infinie symétrique : x = 0 est asymptote verticale.
      const f = (x) => 1 / x;
      parts.push(seg(s, 0, -2.1, 0, 2.1, 'aux-c'));
      parts.push(curve(s, f, 0.47, 2.05, 80));
      parts.push(curve(s, f, -2.05, -0.47, 80));
    }

    parts.push(labelPx(p + 126, 264, titre, 'lbl-t'));
    parts.push(`</g>`);
  }

  files['continuite-trois-types.svg'] = figure({
    w: W, h: H, paper: false,
    title: 'Les trois façons de perdre la continuité en un point : un trou que l’on peut combler, un saut, une limite infinie.',
    parts,
  });
}

/* ─────────────────────────────────────────────────────────────────────────
 * 2. Prolongement par continuité — f(x) = sin(x)/x admet 1 pour limite en 0
 *
 * La figure entière est construite autour du trou : la droite y = 1 que la
 * courbe ne touche jamais, et le disque ouvert en (0 ; 1).
 *
 * L'échelle verticale est très dilatée (155 px par unité contre 39 en
 * abscisse) : la grille reçoit donc un pas vertical de 0,25 pour retrouver des
 * carreaux à peu près carrés.
 * ───────────────────────────────────────────────────────────────────────── */
{
  const s = scale({ x0: 285, y0: 220, ux: 39, uy: 155 });
  const f = (x) => Math.sin(x) / x;
  const X = { xmin: -6.5, xmax: 6.5 };
  const Y = { ymin: -0.45, ymax: 1.15 };

  files['continuite-prolongement.svg'] = figure({
    w: 570, h: 320,
    title: 'Courbe de sin(x)/x : un trou en zéro, alors que la limite vaut 1 ; le prolongement par continuité comble ce trou.',
    grid: { s, step: 0.25, stepX: 1, stepY: 0.25 },
    parts: [
      ...axes(s, {
        ...X, ...Y, ticks: false, labels: false,
        axis: { xmin: -6.9, xmax: 6.9, ymin: -0.55, ymax: 1.25 },
      }),
      label(s, 0, 0, 'O', 'lbl-o', 'end', -5, 18),
      seg(s, -6.9, 1, 6.9, 1, 'aux-g'),
      curve(s, f, -6.85, -0.13, 300),
      curve(s, f, 0.13, 6.85, 300),
      dot(s, 0, 1, 5.4, 'pt-open'),
      // Le « 1 » se pose au-dessus de la droite, à l'écart du lobe central.
      label(s, -6.6, 1, '1', 'lbl-coral', 'start', 2, -9),
    ],
  });
}

/* ─────────────────────────────────────────────────────────────────────────
 * 3. Image d'un segment : f([a, b]) = [m, M]
 *
 * La figure doit rendre visible le passage d'un intervalle à l'autre :
 *   - le segment de départ [a, b] est marqué sous l'axe des abscisses ;
 *   - son image [m, M] est marquée à gauche de l'axe des ordonnées ;
 *   - la bande rappelle que la courbe ne sort jamais de [m, M] ;
 *   - les points où m et M sont atteints sont marqués.
 *
 * Les deux barres bleues sont posées À CÔTÉ des axes, jamais dessus : sur
 * l'axe, la barre de 4,6 px l'épaississait et se lisait comme un axe noir.
 * ───────────────────────────────────────────────────────────────────────── */
{
  const s = scale({ x0: 52, y0: 310, ux: 62, uy: 68 });
  const f = (x) => 2 + 1.6 * Math.sin(x);
  const a = 0.4; const b = 5.6;
  const xMax = PI / 2;        // maximum sur [a, b]
  const xMin = 3 * PI / 2;    // minimum sur [a, b]
  const M = f(xMax); const m = f(xMin);
  const X = { xmin: -0.55, xmax: 6.0 };
  // ymax = 4,15 : l'axe doit dépasser le « 4 » gradué, sinon la pointe de
  // flèche tombe sur le chiffre.
  const Y = { ymin: -0.6, ymax: 4.15 };
  const BAR = 10; // décalage des barres, en pixels

  files['continuite-image-segment.svg'] = figure({
    w: 470, h: 380,
    title: 'Sur un segment, une fonction continue reste entre son minimum m et son maximum M, et atteint ces deux bornes.',
    grid: { s, step: 1 },
    parts: [
      `<rect class="band" x="${round(s.px(a))}" y="${round(s.py(M))}" width="${round(s.px(b) - s.px(a))}" height="${round(s.py(m) - s.py(M))}"/>`,
      ...axes(s, {
        ...X, ...Y,
        axis: { xmin: -0.75, xmax: 6.55, ymin: -0.75, ymax: 4.5 },
      }),
      // Mise en évidence : le domaine au-dessus de l'axe (côté intérieur), son
      // image à droite de l'axe des ordonnées. Posées à l'extérieur, les barres
      // croisaient les nombres de graduation.
      segPx(s, a, 0, b, 0, 'hl', 0, -BAR),
      segPx(s, 0, m, 0, M, 'hl', BAR, 0),
      segPx(s, a, -0.09, a, 0.09, 'hl-tick', 0, -BAR),
      segPx(s, b, -0.09, b, 0.09, 'hl-tick', 0, -BAR),
      segPx(s, -0.045, m, 0.045, m, 'hl-tick', BAR, 0),
      segPx(s, -0.045, M, 0.045, M, 'hl-tick', BAR, 0),
      // Guides : à l'abscisse a, c'est f(a) qui est marqué, pas le minimum m.
      seg(s, a, 0, a, f(a), 'guid'),
      seg(s, b, 0, b, f(b), 'guid'),
      seg(s, 0, m, b, m, 'guid'),
      seg(s, 0, M, b, M, 'guid'),
      curve(s, f, a, b, 160),
      dot(s, xMax, M, 4, 'pt'),
      dot(s, xMin, m, 4, 'pt'),
      label(s, a, 0, 'a', 'lbl-m', 'middle', 0, 22),
      label(s, b, 0, 'b', 'lbl-m', 'middle', 0, 22),
      label(s, 0, m, 'm', 'hl-lbl', 'end', -19, 5),
      label(s, 0, M, 'M', 'hl-lbl', 'end', -19, 5),
    ],
  });
}

/* ─────────────────────────────────────────────────────────────────────────
 * 4. Théorème des valeurs intermédiaires — existence
 *
 * Repère symbolique : la grille est au demi-pas, assez fine pour donner
 * l'échelle sans suggérer des valeurs que la figure ne nomme pas.
 * ───────────────────────────────────────────────────────────────────────── */
{
  const s = scale({ x0: 70, y0: 320, ux: 155, uy: 130 });
  const f = (x) => 0.3 + 0.75 * x - 0.1 * x * x;
  const a = 0.3; const b = 2.0; const k = 0.9;
  // Résolution de f(x) = k : x² − 7,5x + 6 = 0 → la racine utile est dans ]a, b[.
  const c = (7.5 - Math.sqrt(7.5 * 7.5 - 24)) / 2;
  const X = { xmin: -0.2, xmax: 2.2 };
  const Y = { ymin: -0.2, ymax: 2.2 };

  files['continuite-tvi-existence.svg'] = figure({
    w: 460, h: 380,
    title: 'Théorème des valeurs intermédiaires : la courbe, continue de f(a) à f(b), coupe nécessairement la droite y = k en un point c.',
    grid: { s, step: 0.5 },
    parts: [
      ...axes(s, {
        ...X, ...Y, ticks: false, labels: false,
        axis: { xmin: -0.4, xmax: 2.45, ymin: -0.35, ymax: 2.4 },
      }),
      label(s, 0, 0, 'O', 'lbl-o', 'end', -5, 18),
      seg(s, a, 0, a, f(a), 'guid'),
      seg(s, b, 0, b, f(b), 'guid'),
      seg(s, 0, f(a), a, f(a), 'guid'),
      seg(s, 0, f(b), b, f(b), 'guid'),
      curve(s, f, a, b, 120),
      seg(s, 0, k, 2.45, k, 'aux-g'),
      seg(s, c, 0, c, k, 'aux-g'),
      dot(s, a, f(a), 3.8, 'pt'),
      dot(s, b, f(b), 3.8, 'pt'),
      dot(s, c, k, 4.2, 'pt-c'),
      label(s, a, 0, 'a', 'lbl-m', 'middle', 0, 22),
      label(s, b, 0, 'b', 'lbl-m', 'middle', 0, 22),
      label(s, c, 0, 'c', 'lbl-coral', 'middle', 0, 22),
      label(s, 0, f(a), 'f(a)', 'lbl-m', 'end', -8, 5),
      label(s, 0, f(b), 'f(b)', 'lbl-m', 'end', -8, 5),
      label(s, 0, k, 'k', 'lbl-coral', 'end', -8, 5),
    ],
  });
}

/* ─────────────────────────────────────────────────────────────────────────
 * 5. Valeurs intermédiaires : existence acquise, unicité non garantie
 * ───────────────────────────────────────────────────────────────────────── */
{
  const s = scale({ x0: 78, y0: 305, ux: 160, uy: 140 });
  const f = (x) => 1.2 + 3.5 * (x - 0.8) * (x - 1.2) * (x - 1.6);
  const a = 0.6; const b = 1.8; const k = 1.2;
  const racines = [0.8, 1.2, 1.6];
  // Le domaine doit englober x = 0, sinon l'axe des ordonnées tombe hors du
  // papier et la figure paraît décalée.
  const X = { xmin: -0.25, xmax: 2.1 };
  const Y = { ymin: 0, ymax: 1.9 };

  files['continuite-tvi-non-unicite.svg'] = figure({
    w: 470, h: 350,
    title: 'Le théorème des valeurs intermédiaires ne garantit pas l’unicité : la courbe peut couper la droite y = k en trois points.',
    grid: { s, step: 0.25 },
    parts: [
      ...axes(s, {
        ...X, ...Y, ticks: false, labels: false,
        axis: { xmin: -0.45, xmax: 2.35, ymin: -0.18, ymax: 2.1 },
      }),
      label(s, 0, 0, 'O', 'lbl-o', 'end', -5, 18),
      seg(s, 0, k, 2.35, k, 'aux-g'),
      ...racines.map((r) => seg(s, r, 0, r, k, 'aux-g')),
      seg(s, a, 0, a, f(a), 'guid'),
      seg(s, b, 0, b, f(b), 'guid'),
      curve(s, f, a, b, 160),
      dot(s, a, f(a), 3.8, 'pt'),
      dot(s, b, f(b), 3.8, 'pt'),
      ...racines.map((r) => dot(s, r, k, 4, 'pt-c')),
      label(s, a, 0, 'a', 'lbl-m', 'middle', 0, 22),
      label(s, b, 0, 'b', 'lbl-m', 'middle', 0, 22),
      label(s, 0, k, 'k', 'lbl-coral', 'end', -8, 5),
    ],
  });
}

/* ─────────────────────────────────────────────────────────────────────────
 * 6. Courbes réciproques symétriques par rapport à y = x
 *
 * Graduations chiffrées : sans elles, le lecteur ne peut pas vérifier la
 * symétrie (le point (1,5 ; 2,25) et son image (2,25 ; 1,5)).
 * ───────────────────────────────────────────────────────────────────────── */
{
  const s = scale({ x0: 55, y0: 425, ux: 92, uy: 92 });
  const f = (x) => x * x;
  const g = (x) => Math.sqrt(x);
  const u = 1.5;
  const X = { xmin: -0.35, xmax: 4.5 };
  const Y = { ymin: -0.35, ymax: 4.5 };

  files['continuite-reciproque-symetrie.svg'] = figure({
    w: 480, h: 480,
    title: 'Dans un repère orthonormé, la courbe de la réciproque s’obtient en pliant la courbe de f autour de la droite y = x.',
    grid: { s, step: 1 },
    parts: [
      ...axes(s, {
        ...X, ...Y,
        axis: { xmin: -0.5, xmax: 4.6, ymin: -0.5, ymax: 4.55 },
      }),
      label(s, 0, 0, 'O', 'lbl-o', 'end', -5, 18),
      seg(s, 0, 0, 4.6, 4.6, 'aux-t'),
      curve(s, f, 0, 2.1, 120),
      curve(s, g, 0, 4.6, 160),
      seg(s, u, f(u), f(u), u, 'aux-t'),
      seg(s, 2.25, 0, 2.25, u, 'guid'),
      seg(s, 0, 2.25, u, 2.25, 'guid'),
      dot(s, u, f(u), 4, 'pt'),
      dot(s, f(u), u, 4, 'pt-t'),
      label(s, 2.15, 3.62, '<tspan class="script">C</tspan><tspan class="sub">f</tspan>', 'lbl-blue', 'start'),
      // Les exposants Unicode « ⁻¹ » n'existent dans aucune des deux polices :
      // l'exposant est composé en SVG (sous-script puis super-script), avec
      // 1 px d'écart — l'italique de `f` vient autrement toucher le « -1 ».
      label(s, 3.5, 1.82, '<tspan class="script">C</tspan><tspan class="sub">f<tspan class="sup" dx="1">-1</tspan></tspan>', 'lbl-blue', 'start'),
      // Étiquette décalée au-dessus de la diagonale, jamais posée dessus.
      label(s, 4.05, 4.4, 'y = x', 'lbl-coral', 'end'),
    ],
  });
}

/* ─────────────────────────────────────────────────────────────────────────
 * 7. Équation x^n = a : le nombre de solutions suit la parité de n
 *
 * Deux cartes millimétrées, même repère : les deux panneaux se comparent.
 * ───────────────────────────────────────────────────────────────────────── */
{
  const W = 760; const H = 400;
  const parts = [];
  const X = { xmin: -1.7, xmax: 1.7 };
  const Y = { ymin: -1.7, ymax: 1.7 };

  for (const { p, impair } of [{ p: 0, impair: true }, { p: 386, impair: false }]) {
    const s = scale({ x0: p + 187, y0: 190, ux: 92, uy: 86 });
    // Deux cartes jointives : 2 × 374 + 12 d'écart = 760.
    const box = { x: p, y: 0, w: 374, h: H };
    parts.push(`<g>`);
    parts.push(paper(box));
    parts.push(...grid(s, { step: 0.5, ...box }));
    parts.push(...axes(s, {
      ...X, ...Y, ticks: false, labels: false,
      axis: { xmin: -1.9, xmax: 1.9, ymin: -1.9, ymax: 1.9 },
    }));
    parts.push(label(s, 0, 0, 'O', 'lbl-o', 'end', -5, 18));

    if (impair) {
      // n impair : x ↦ x^n est strictement croissante sur R → une solution pour tout a.
      // Tracée jusqu'à sortir par le haut du cadre : une courbe qui s'arrête net
      // au milieu du papier se lit comme un tracé inachevé.
      parts.push(curve(s, (x) => x ** 3, -1.3, 1.3, 140));
      parts.push(seg(s, -1.9, 1, 1.9, 1, 'aux-g'));
      parts.push(seg(s, -1.9, -1, 1.9, -1, 'aux-g'));
      parts.push(dot(s, 1, 1, 4, 'pt-c'));
      parts.push(dot(s, -1, -1, 4, 'pt-c'));
      // Au-dessus de la droite : posée sur la ligne, l'étiquette est barrée par
      // le tireté qui la traverse d'un bord à l'autre du papier.
      parts.push(label(s, 0, 1, 'a', 'lbl-coral', 'end', -8, -6));
      parts.push(labelPx(p + 187, 382, 'n impair', 'lbl-t'));
    } else {
      // n pair : la courbe ne prend que des valeurs positives → 2, 1 ou 0 solution.
      parts.push(curve(s, (x) => x * x, -1.45, 1.45, 140));
      parts.push(seg(s, -1.9, 1, 1.9, 1, 'aux-g'));
      parts.push(seg(s, -1.9, -1, 1.9, -1, 'aux-g'));
      parts.push(dot(s, 1, 1, 4, 'pt-c'));
      parts.push(dot(s, -1, 1, 4, 'pt-c'));
      parts.push(label(s, 0, 1, 'a', 'lbl-coral', 'end', -8, -6));
      // Annotation en mots : hors mathématiques, donc police du contenu.
      parts.push(label(s, 1.75, -1, 'aucune solution', 'lbl-u', 'end', -2, -10));
      parts.push(labelPx(p + 187, 382, 'n pair', 'lbl-t'));
    }
    parts.push(`</g>`);
  }

  files['racines-n-iemes-parite.svg'] = figure({
    w: W, h: H, paper: false,
    title: 'Nombre de solutions de l’équation x^n = a : une seule lorsque n est impair, deux, une ou aucune lorsque n est pair.',
    parts,
  });
}

/* ─────────────────────────────────────────────────────────────────────────
 * 8. Fonction Arctan : réciproque de la tangente restreinte
 * ───────────────────────────────────────────────────────────────────────── */
{
  const s = scale({ x0: 240, y0: 240, ux: 64, uy: 64 });
  const h = PI / 2;
  const X = { xmin: -3.0, xmax: 3.0 };
  const Y = { ymin: -3.0, ymax: 3.0 };
  // La tangente est tracée jusqu'à sortir par le haut du cadre : la courbe
  // quitte la figure au lieu de s'arrêter en l'air.
  const xTan = Math.atan(3.0);

  files['arctan-graphe.svg'] = figure({
    w: 460, h: 460,
    title: 'La tangente restreinte à ]−π/2 ; π/2[ et sa réciproque Arctan : courbes symétriques par rapport à y = x, avec les asymptotes y = ±π/2.',
    grid: { s, step: 1 },
    parts: [
      ...axes(s, {
        ...X, ...Y, ticks: false, labels: false,
        axis: { xmin: -3.3, xmax: 3.3, ymin: -3.3, ymax: 3.3 },
      }),
      // « O » sous la diagonale et à droite de l'axe : au point même, la
      // tangente traverse l'origine et recouvrait la lettre.
      label(s, 0, 0, 'O', 'lbl-o', 'start', 6, 19),
      seg(s, -h, -3.3, -h, 3.3, 'aux-c'),
      seg(s, h, -3.3, h, 3.3, 'aux-c'),
      seg(s, -3.3, h, 3.3, h, 'aux-c'),
      seg(s, -3.3, -h, 3.3, -h, 'aux-c'),
      seg(s, -3.3, -3.3, 3.3, 3.3, 'aux-t'),
      curve(s, Math.tan, -xTan, xTan, 160),
      curve(s, Math.atan, -3.0, 3.0, 200),
      // \tan et \operatorname{Arctan} sont des noms de fonctions : romain droit.
      label(s, 1.05, 2.5, 'tan', 'lbl-blue up', 'middle'),
      label(s, 2.5, 0.95, 'Arctan', 'lbl-blue up', 'middle'),
      label(s, 2.75, 2.75, 'y = x', 'lbl-coral', 'end', -8, -8),
      label(s, 0, h, 'π/2', 'lbl-coral', 'end', -8, -8),
      label(s, 0, -h, '−π/2', 'lbl-coral', 'end', -8, 17),
      label(s, h, 0, 'π/2', 'lbl-coral', 'start', 6, -10),
      label(s, -h, 0, '−π/2', 'lbl-coral', 'end', -6, -10),
    ],
  });
}

/* ── Écriture ────────────────────────────────────────────────────────────── */

let total = 0;
for (const [name, svg] of Object.entries(files)) {
  writeFileSync(join(OUT, name), svg, 'utf8');
  total += 1;
  console.log(`${name.padEnd(38)} ${(svg.length / 1024).toFixed(1)} Ko`);
}
console.log(`\n${total} figure(s) écrites dans ${OUT.replace(ROOT + '\\', '').replace(ROOT + '/', '')}`);
