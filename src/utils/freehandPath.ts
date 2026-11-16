/**
 * Conversion d'un contour perfect-freehand en données de chemin SVG.
 *
 * Point de convergence unique des deux moteurs de rendu manuscrit :
 * - le canvas d'exercice (`renderUtils.getSvgPathFromStroke`) ;
 * - le canvas de révision (`render/ink.fillOutline`).
 *
 * Technique : les sommets de l'enveloppe sont les points de contrôle, les
 * MILIEUX des segments sont les points de passage (courbes quadratiques). Les
 * valeurs de pression sont ignorées ici : seul [x, y] compte pour le contour.
 */
export function outlineToPathData(outline: number[][]): string {
  const len = outline.length;
  if (len === 0) return '';
  if (len === 1) return `M ${outline[0][0]} ${outline[0][1]} Z`;
  if (len < 4) {
    // Contour dégénéré (trait minuscule) : polygone plus fidèle que les courbes.
    let d = `M ${outline[0][0]} ${outline[0][1]}`;
    for (let i = 1; i < len; i++) d += ` L ${outline[i][0]} ${outline[i][1]}`;
    return d + ' Z';
  }

  const d = outline.reduce<string[]>(
    (acc, point, i, arr) => {
      const next = arr[(i + 1) % len];
      acc.push(String(point[0]), String(point[1]), String((point[0] + next[0]) / 2), String((point[1] + next[1]) / 2));
      return acc;
    },
    ['M', String(outline[0][0]), String(outline[0][1]), 'Q'],
  );
  d.push('Z');
  return d.join(' ');
}
