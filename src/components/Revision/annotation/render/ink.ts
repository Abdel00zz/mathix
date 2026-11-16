import { getStroke } from 'perfect-freehand';
import type { InkMark, PenStyle } from '../core/types';
import { Transform } from '../core/transform';
import { outlineToPathData } from '../../../../utils/freehandPath';

/**
 * Rendu de l'encre (stylo & surligneur) au moyen de perfect-freehand. Effets de
 * bord limités au contexte 2D fourni ; aucune donnée d'état ni DOM.
 */

const HL_OPTS = { thinning: 0, smoothing: 0.55, streamline: 0.62, simulatePressure: false };

/** Options perfect-freehand + alpha selon le style de plume. */
function penConfig(style: PenStyle, size: number, stabilization: number) {
  const stability = Math.max(0, Math.min(1, stabilization));
  // `smoothing` lisse la COURBE (pas de retard) ; `streamline` est la « laisse »
  // qui fait traîner le trait derrière la pointe → on le garde bas pour un
  // tracé libre, et on module peu avec la stabilisation.
  const smooth = (base: number) => Math.min(0.92, base + stability * 0.16);
  const streamline = (base: number) => Math.min(0.8, base + stability * 0.14);
  switch (style) {
    case 'fountain': // plume — variation calligraphique, effilé maîtrisé
      return {
        alpha: 1,
        opts: {
          size: size * 1.12, thinning: 0.68, smoothing: smooth(0.6), streamline: streamline(0.22), simulatePressure: false,
          easing: (t: number) => t, // linéaire : la pression module l'épaisseur proportionnellement
          start: { taper: size * 1.4, cap: true },
          end: { taper: size * 2.6, cap: true },
        },
      };
    case 'marker': // feutre rond — encre dense, pression contenue, bords fermes
      return {
        alpha: 0.96,
        opts: {
          size: size * 1.42, thinning: 0.16, smoothing: smooth(0.7), streamline: streamline(0.42), simulatePressure: false,
          easing: (t: number) => t,
          start: { taper: 0, cap: true },
          end: { taper: 0, cap: true },
        },
      };
    case 'pencil': // crayon — fin, plus clair
      return {
        alpha: 0.52,
        opts: { size: size * 0.92, thinning: 0.38, smoothing: smooth(0.44), streamline: streamline(0.22), simulatePressure: false },
      };
    case 'ballpoint': // bille — trait régulier mais avec variation de pression naturelle
    default:
      return {
        alpha: 1,
        opts: { size, thinning: 0.42, smoothing: smooth(0.6), streamline: streamline(0.5), simulatePressure: false },
      };
  }
}

/**
 * Enveloppe `getStroke` → contour rempli en courbes quadratiques (les points de
 * l'enveloppe sont les points de contrôle, les MILIEUX les points de passage).
 * Relier au `lineTo` facetterait le trait (bords en escalier sur trait épais).
 */
function fillOutline(ctx: CanvasRenderingContext2D, outline: number[][]) {
  if (outline.length < 2) return;
  ctx.fill(new Path2D(outlineToPathData(outline)));
}

/** Points d'encre (normalisés) → px écran. */
function inkToScreenPts(t: Transform, m: InkMark): number[][] {
  return m.pts.map(([x, y, p]) => [t.ox + x * t.w, t.oy + y * t.w, p]);
}

/**
 * Point posé au stylet : un tap (ou micro-tracé) doit laisser un point net.
 * perfect-freehand seul rend ces tracés invisibles — l'effilé collapse
 * l'enveloppe à ~0 px. On détecte ce cas et on renvoie le disque à tracer
 * (centre + rayon px), calibré sur l'épaisseur et la pression. Null pour un vrai
 * trait (rendu normal par l'enveloppe getStroke).
 */
function inkDotFromPts(ptsPx: number[][], size: number): { x: number; y: number; r: number } | null {
  if (ptsPx.length === 0) return null;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity, pSum = 0;
  for (const [x, y, p] of ptsPx) {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
    pSum += Number.isFinite(p) ? p : 0.5;
  }
  const extent = Math.max(maxX - minX, maxY - minY);
  // Vrai trait : laisser l'enveloppe faire le rendu. Le seuil (0,9 × épaisseur)
  // tolère le léger tremblement d'un tap : « pointer » laisse un point net.
  if (ptsPx.length > 1 && extent > size * 0.9) return null;
  const pressure = pSum / ptsPx.length;
  return {
    x: (minX + maxX) / 2,
    y: (minY + maxY) / 2,
    r: Math.max(0.9, size * (0.5 + pressure * 0.18)),
  };
}

/**
 * @param live Tracé EN COURS (aperçu) vs trait finalisé. En live, `last: false`
 *   (recommandation perfect-freehand) : l'enveloppe ne s'étire pas jusqu'au
 *   dernier point brut, le bout ne « chasse » pas la pointe ; à la validation,
 *   `last: true` prolonge proprement jusqu'au point final.
 */
export function renderInk(ctx: CanvasRenderingContext2D, t: Transform, m: InkMark, live = false) {
  const last = !live;
  const ptsPx = inkToScreenPts(t, m);
  ctx.save();
  if (m.kind === 'highlighter') {
    ctx.globalAlpha = 0.32;
    ctx.globalCompositeOperation = 'multiply';
    if (m.highlighterStyle === 'round') {
      ctx.fillStyle = m.color;
      ctx.lineJoin = 'round';
      fillOutline(ctx, getStroke(ptsPx, { size: m.size, ...HL_OPTS, last }));
    } else {
      ctx.strokeStyle = m.color;
      ctx.fillStyle = m.color;
      ctx.lineWidth = m.size;
      ctx.lineCap = 'square';
      ctx.lineJoin = 'bevel';
      if (ptsPx.length === 1) {
        const [x, y] = ptsPx[0];
        ctx.fillRect(x - m.size / 2, y - m.size / 2, m.size, m.size);
      } else {
        ctx.beginPath();
        ctx.moveTo(ptsPx[0][0], ptsPx[0][1]);
        for (let i = 1; i < ptsPx.length; i++) ctx.lineTo(ptsPx[i][0], ptsPx[i][1]);
        ctx.stroke();
      }
    }
  } else {
    const { alpha, opts } = penConfig(m.style || 'ballpoint', m.size, m.stabilization ?? 0.35);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = m.color;
    // Point posé : disque net plutôt qu'une enveloppe effilée invisible.
    const dot = inkDotFromPts(ptsPx, opts.size ?? m.size);
    if (dot) {
      ctx.beginPath();
      ctx.arc(dot.x, dot.y, dot.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      return;
    }
    fillOutline(ctx, getStroke(ptsPx, { ...opts, last }));
    if (m.style === 'marker') {
      // Cœur plus saturé + micro-irrégularité déterministe : sensation de feutre
      // absorbant, sans le rendu translucide du surligneur.
      const feltCore = ptsPx.map(([x, y, pressure], index) => [
        x + Math.sin(index * 1.71) * 0.16,
        y + Math.cos(index * 1.37) * 0.16,
        pressure,
      ]);
      ctx.globalAlpha = 0.24;
      fillOutline(ctx, getStroke(feltCore, {
        size: m.size * 1.04, thinning: 0.08, smoothing: 0.72, streamline: 0.66, simulatePressure: false,
        easing: (t: number) => t,
        start: { taper: 0, cap: true },
        end: { taper: 0, cap: true },
        last,
      }));
    } else if (m.style === 'pencil') {
      const grain = ptsPx.map(([x, y, pressure], index) => [
        x + Math.sin(index * 2.17) * 0.42,
        y + Math.cos(index * 1.73) * 0.42,
        pressure,
      ]);
      ctx.globalAlpha = 0.24;
      fillOutline(ctx, getStroke(grain, {
        size: m.size * 0.46, thinning: 0.22, smoothing: 0.38, streamline: 0.4, simulatePressure: false, last,
      }));
    } else if (m.style === 'fountain' && ptsPx.length > 1) {
      ctx.globalAlpha = 0.22;
      ctx.strokeStyle = m.color;
      ctx.lineWidth = Math.max(0.55, m.size * 0.14);
      ctx.beginPath();
      ctx.moveTo(ptsPx[0][0], ptsPx[0][1]);
      for (let i = 1; i < ptsPx.length; i++) ctx.lineTo(ptsPx[i][0], ptsPx[i][1]);
      ctx.stroke();
    }
  }
  ctx.restore();
}
