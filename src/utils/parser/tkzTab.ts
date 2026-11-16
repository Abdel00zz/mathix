/**
 * Moteur « tkz-tab » : tableaux de signes et de variations de qualité LaTeX.
 *
 * KaTeX ne sait dessiner que des grilles (`array`) : les flèches restent des
 * glyphes posés sur une ligne de base, les zéros ne sont pas traversés par un
 * trait, les doubles barres ne couvrent pas la hauteur de la ligne… Ce module
 * reconnaît les `\begin{array}` qui sont en réalité des tableaux de signes ou de
 * variations, les convertit en un modèle structuré (valeurs de x, lignes de
 * signes, blocs de variations) puis les dessine comme le ferait `tkz-tab` :
 *   - cadre + séparateurs horizontaux, une seule barre verticale après les libellés ;
 *   - zéros posés sur un trait pointillé vertical, valeurs interdites en double barre ;
 *   - valeurs placées en haut / au milieu / en bas, reliées par des flèches SVG.
 *
 * Le contenu mathématique de chaque case reste rendu par KaTeX (nœuds inline).
 */

export type TkzLevel = 'top' | 'mid' | 'bot';
export type TkzArrow = 'up' | 'down' | 'flat' | null;

export type TkzMark =
  | { kind: 'none' }
  | { kind: 'zero'; tex: string }
  | { kind: 'bar' }
  | { kind: 'dbar' }
  | { kind: 'text'; tex: string };

export interface TkzSignRow {
  type: 'sign';
  label: string;
  marks: TkzMark[]; // n
  intervals: string[]; // n - 1
}

export interface TkzVarSide {
  tex: string;
  level: TkzLevel;
}

export interface TkzVarNode {
  forbidden: boolean;
  left: TkzVarSide;
  right: TkzVarSide;
}

export interface TkzVarRow {
  type: 'var';
  label: string;
  nodes: TkzVarNode[]; // n
  arrows: TkzArrow[]; // n - 1
  levels: 2 | 3;
}

export interface TkzTabModel {
  xLabel: string;
  xValues: string[];
  rows: Array<TkzSignRow | TkzVarRow>;
}

type MathFactory = (tex: string, display: boolean) => HTMLElement;

// ---------------------------------------------------------------------------
// Lexique
// ---------------------------------------------------------------------------

const ARROW_UP = /\\(?:nearrow|fleupB|fleup|croiss)(?![a-zA-Z])/;
const ARROW_DOWN = /\\(?:searrow|fledownB|fledown|decroiss)(?![a-zA-Z])/;
const ARROW_FLAT = /\\(?:rightarrow|longrightarrow|fleconst)(?![a-zA-Z])/;
const ARROW_ANY = new RegExp(`${ARROW_UP.source}|${ARROW_DOWN.source}|${ARROW_FLAT.source}`, 'g');
const DBAR = /\|\||\\\||\\parallel(?![a-zA-Z])|\\dbar(?![a-zA-Z])|\\interdit(?![a-zA-Z])|\\Vert(?![a-zA-Z])/;
const DBAR_ALL = new RegExp(DBAR.source, 'g');

const ARRAY_RE = /^\s*(?:\\def\\arraystretch\{[^}]*\}\s*|\\renewcommand\{?\\arraystretch\}?\{[^}]*\}\s*)*\\begin\{array\}\{[^}]*\}([\s\S]*)\\end\{array\}\s*$/;

const trimEdgeSpaces = (s: string): string =>
  s
    .replace(/^(?:\s|\\[;,:! ]|\\q?quad(?![a-zA-Z]))+/, '')
    .replace(/(?:\s|\\[;,:! ]|\\q?quad(?![a-zA-Z]))+$/, '')
    .trim();

const cleanCell = (raw: string): string => {
  const s = raw
    .replace(/\\(?:tvstrut|tsstrut|strut)(?![a-zA-Z])/g, ' ')
    .replace(/\\rule(?:\[[^\]]*\])?\{[^}]*\}\{[^}]*\}/g, ' ')
    .replace(/\\(?:hline|hdashline)(?![a-zA-Z])/g, ' ')
    .replace(/\\cline\{[^}]*\}/g, ' ');
  return trimEdgeSpaces(s);
};

/** Retire un éventuel `\blank{…}` englobant pour analyser le contenu réel. */
const unwrapBlank = (s: string): { inner: string; blank: boolean } => {
  const m = /^\\(?:blank|blanck|balck)\{([\s\S]*)\}$/.exec(s);
  return m ? { inner: m[1].trim(), blank: true } : { inner: s, blank: false };
};

const signOf = (s: string): '+' | '-' | null => {
  const { inner } = unwrapBlank(s);
  if (inner === '+' || inner === '\\plus') return '+';
  if (inner === '-' || inner === '\\moins' || inner === '−') return '-';
  return null;
};

const isZero = (s: string): boolean => {
  const { inner } = unwrapBlank(s);
  return inner === '0' || inner === '\\zero';
};

const isBar = (s: string): boolean => s === '|' || s === '\\vert' || s === '\\mid' || s === 't';

const isDbarOnly = (s: string): boolean => s !== '' && DBAR.test(s) && s.replace(DBAR_ALL, '').trim() === '';

const arrowOf = (s: string): TkzArrow => {
  if (ARROW_UP.test(s)) return 'up';
  if (ARROW_DOWN.test(s)) return 'down';
  if (ARROW_FLAT.test(s)) return 'flat';
  return null;
};

const stripArrows = (s: string): string => s.replace(ARROW_ANY, ' ').trim();

/** Rend une case lisible par KaTeX : macros de signes ramenées aux symboles. */
const toDisplayTex = (s: string): string =>
  s
    .replace(/\\plus(?![a-zA-Z])/g, '+')
    .replace(/\\moins(?![a-zA-Z])/g, '-')
    .replace(/\\zero(?![a-zA-Z])/g, '0')
    .trim();

// ---------------------------------------------------------------------------
// Découpage TeX (lignes / cellules) au niveau 0 des accolades
// ---------------------------------------------------------------------------

const DIMEN = /^\s*\[\s*-?[\d.]+\s*(?:pt|em|ex|mm|cm|in|mu|px|bp)\s*\]/;

const splitRows = (body: string): string[] => {
  const rows: string[] = [];
  let depth = 0;
  let start = 0;
  let i = 0;
  while (i < body.length) {
    const c = body[i];
    if (c === '\\') {
      if (body[i + 1] === '\\' && depth === 0) {
        rows.push(body.slice(start, i));
        i += 2;
        const dim = DIMEN.exec(body.slice(i));
        if (dim) i += dim[0].length;
        start = i;
        continue;
      }
      // commande : \nom ou \x
      i += 1;
      if (/[a-zA-Z]/.test(body[i] ?? '')) {
        while (/[a-zA-Z]/.test(body[i] ?? '')) i += 1;
      } else {
        i += 1;
      }
      continue;
    }
    if (c === '{') depth += 1;
    else if (c === '}') depth -= 1;
    i += 1;
  }
  rows.push(body.slice(start));
  return rows;
};

const splitCells = (row: string): string[] => {
  const cells: string[] = [];
  let depth = 0;
  let start = 0;
  let i = 0;
  while (i < row.length) {
    const c = row[i];
    if (c === '\\') {
      i += 1;
      if (/[a-zA-Z]/.test(row[i] ?? '')) {
        while (/[a-zA-Z]/.test(row[i] ?? '')) i += 1;
      } else {
        i += 1;
      }
      continue;
    }
    if (c === '{') depth += 1;
    else if (c === '}') depth -= 1;
    else if (c === '&' && depth === 0) {
      cells.push(row.slice(start, i));
      start = i + 1;
    }
    i += 1;
  }
  cells.push(row.slice(start));
  return cells;
};

interface RawRow {
  hlineBefore: boolean;
  label: string;
  cells: string[];
}

const LEADING_RULES = /^\s*(?:\\hline|\\hdashline|\\cline\{[^}]*\})/;

const readRows = (body: string): RawRow[] => {
  const out: RawRow[] = [];
  let pendingHline = false;
  for (const chunk of splitRows(body)) {
    let rest = chunk;
    let hline = pendingHline;
    let m: RegExpExecArray | null;
    while ((m = LEADING_RULES.exec(rest))) {
      hline = true;
      rest = rest.slice(m[0].length);
    }
    if (rest.trim() === '') {
      pendingHline = hline;
      continue;
    }
    pendingHline = false;
    const cells = splitCells(rest).map(cleanCell);
    out.push({ hlineBefore: hline, label: cells[0] ?? '', cells: cells.slice(1) });
  }
  return out;
};

// ---------------------------------------------------------------------------
// Analyse
// ---------------------------------------------------------------------------

interface Projected {
  label: string;
  bnd: string[];
  itv: string[];
}

const join = (a: string, b: string): string => (a && b ? `${a} ${b}` : a || b);

/** Projette les cellules d'une ligne sur la grille « valeur / intervalle » définie par la ligne des x. */
const project = (row: RawRow, valueCols: number[]): Projected => {
  const n = valueCols.length;
  const bnd = new Array<string>(n).fill('');
  const itv = new Array<string>(Math.max(0, n - 1)).fill('');
  row.cells.forEach((cell, c) => {
    if (!cell) return;
    if (c <= valueCols[0]) {
      bnd[0] = join(bnd[0], cell);
      return;
    }
    if (c >= valueCols[n - 1]) {
      if (c === valueCols[n - 1]) bnd[n - 1] = join(bnd[n - 1], cell);
      else bnd[n - 1] = join(bnd[n - 1], cell);
      return;
    }
    for (let i = 0; i < n - 1; i += 1) {
      if (c === valueCols[i]) {
        bnd[i] = join(bnd[i], cell);
        return;
      }
      if (c > valueCols[i] && c < valueCols[i + 1]) {
        itv[i] = join(itv[i], cell);
        return;
      }
    }
    bnd[n - 1] = join(bnd[n - 1], cell);
  });
  return { label: row.label, bnd, itv };
};

const markOf = (s: string): TkzMark => {
  if (!s) return { kind: 'none' };
  if (isDbarOnly(s)) return { kind: 'dbar' };
  if (isBar(s)) return { kind: 'bar' };
  if (isZero(s)) return { kind: 'zero', tex: unwrapBlank(s).blank ? s.replace(/\\zero(?![a-zA-Z])/g, '0') : '0' };
  return { kind: 'text', tex: s };
};

const isMarkLike = (s: string): boolean => !s || isDbarOnly(s) || isBar(s) || isZero(s);

const buildSignRow = (p: Projected): TkzSignRow => {
  const bnd = [...p.bnd];
  const itv = [...p.itv];
  const n = bnd.length;

  // Ligne décalée d'une colonne (texte posé sur les valeurs de x, intervalles vides).
  const allIntervalsEmpty = itv.every((s) => !s);
  if (allIntervalsEmpty && bnd.some((s) => !isMarkLike(s))) {
    for (let i = 0; i < n; i += 1) {
      if (isMarkLike(bnd[i])) continue;
      const target = i < n - 1 ? i : i - 1;
      if (target >= 0 && !itv[target]) {
        itv[target] = bnd[i];
        bnd[i] = '';
      }
    }
  }

  // Bords extérieurs décalés d'une colonne (ex. ligne de concavité semi-compacte).
  if (n > 1 && !isMarkLike(bnd[0]) && !itv[0]) {
    itv[0] = bnd[0];
    bnd[0] = '';
  }
  if (n > 1 && !isMarkLike(bnd[n - 1]) && !itv[n - 2]) {
    itv[n - 2] = bnd[n - 1];
    bnd[n - 1] = '';
  }

  // Signe posé sur une valeur de x : on le glisse dans l'intervalle libre voisin,
  // ou on supprime un signe redondant répété sur une borne intérieure.
  for (let i = 0; i < n; i += 1) {
    if (!signOf(bnd[i])) continue;
    if (i < n - 1 && !itv[i]) {
      itv[i] = bnd[i];
      bnd[i] = '';
    } else if (i > 0 && !itv[i - 1]) {
      itv[i - 1] = bnd[i];
      bnd[i] = '';
    } else if (i > 0 && i < n - 1 && itv[i - 1] && itv[i]) {
      bnd[i] = '';
    }
  }

  const marks = bnd.map((cell, i) => {
    const m = markOf(cell);
    return m.kind === 'none' && i > 0 && i < n - 1 ? ({ kind: 'bar' } as TkzMark) : m;
  });

  return { type: 'sign', label: p.label, marks, intervals: itv };
};

const rowLevelOf = (r: number, k: number): TkzLevel | undefined => {
  if (k <= 1) return undefined;
  if (r === 0) return 'top';
  if (r === k - 1) return 'bot';
  return 'mid';
};

const extractRowArrowsInOrder = (bndRow: string[], itvRow: string[]): TkzArrow[] => {
  const out: TkzArrow[] = [];
  const collect = (cell: string) => {
    if (!cell) return;
    const re = new RegExp(ARROW_ANY.source, 'g');
    let m: RegExpExecArray | null;
    while ((m = re.exec(cell))) {
      const a = arrowOf(m[0]);
      if (a) out.push(a);
    }
  };
  for (let i = 0; i < bndRow.length; i += 1) {
    collect(bndRow[i]);
    if (i < itvRow.length) collect(itvRow[i]);
  }
  return out;
};

interface Entry {
  side: 'left' | 'right' | 'any';
  tex: string;
  rowLevel?: TkzLevel;
}

const buildVarRow = (group: Projected[], forbiddenCols?: ReadonlySet<number>): TkzVarRow => {
  const n = group[0].bnd.length;
  const k = group.length;
  const arrows: TkzArrow[] = new Array<TkzArrow>(Math.max(0, n - 1)).fill(null);
  const bnds = group.map((p) => [...p.bnd]);

  // 1. Flèches directement dans les intervalles
  group.forEach((p) => {
    p.itv.forEach((s, i) => {
      const a = arrowOf(s);
      if (a && !arrows[i]) arrows[i] = a;
    });
  });

  // 2. Doubles barres accolées à une flèche aux bords extérieurs (« \searrow \| » / « \| \searrow »)
  if (n > 2) {
    bnds.forEach((row) => {
      [0, n - 1].forEach((edge) => {
        const s = row[edge];
        if (s && DBAR.test(s) && arrowOf(s)) {
          row[edge] = trimEdgeSpaces(s.replace(DBAR_ALL, ' '));
          const nb = edge === 0 ? 1 : n - 2;
          if (!DBAR.test(row[nb])) row[nb] = join(row[nb], '||');
        }
      });
    });
  }

  // 3. Ligne portant autant de flèches que d'intervalles mais décalées : conserver l'ordre séquentiel
  if (n > 1) {
    bnds.forEach((row, r) => {
      if (!row.some((c) => arrowOf(c) !== null)) return;
      const seq = extractRowArrowsInOrder(row, group[r].itv);
      if (seq.length === n - 1) {
        seq.forEach((a, idx) => {
          if (!arrows[idx]) arrows[idx] = a;
        });
        for (let i = 0; i < n; i += 1) row[i] = stripArrows(row[i]);
      }
    });
  }

  // 4. Valeurs non-flèches et doubles barres posées dans les intervalles → borne voisine
  const hasGroupVal = (col: number) => bnds.some((row) => stripArrows(row[col]).length > 0);
  group.forEach((p, r) => {
    p.itv.forEach((s, col) => {
      const rem = stripArrows(s);
      if (!rem) return;
      if (isDbarOnly(rem)) {
        const target = col > 0 ? col : col + 1;
        bnds[r][target] = join(bnds[r][target], rem);
      } else if (DBAR.test(bnds[r][col])) {
        bnds[r][col] = join(bnds[r][col], rem);
      } else if (col + 1 < n && !bnds[r][col + 1] && !(hasGroupVal(col + 1) && !hasGroupVal(col))) {
        bnds[r][col + 1] = rem;
      } else {
        bnds[r][col] = join(bnds[r][col], rem);
      }
    });
  });

  // 5. Flèches restantes égarées sur une valeur de x (« \searrow 0 \nearrow ») → intervalle voisin
  bnds.forEach((row) => {
    row.forEach((s, i) => {
      if (!arrowOf(s)) return;
      const re = new RegExp(ARROW_ANY.source, 'g');
      let m: RegExpExecArray | null;
      while ((m = re.exec(s))) {
        const a = arrowOf(m[0]);
        if (!a) continue;
        const hasBefore = stripArrows(s.slice(0, m.index)).length > 0;
        const hasAfter = stripArrows(s.slice(m.index + m[0].length)).length > 0;
        let target: number;
        if (hasBefore && !hasAfter) target = i;
        else if (!hasBefore && hasAfter) target = i - 1;
        else target = i < n - 1 && !arrows[i] ? i : i - 1;
        if (target < 0) target = 0;
        if (target > n - 2) target = n - 2;
        if (target >= 0 && !arrows[target]) arrows[target] = a;
      }
      row[i] = stripArrows(s);
    });
  });

  // 6. Nœuds
  let usesMid = false;
  const nodes: TkzVarNode[] = [];
  for (let i = 0; i < n; i += 1) {
    const entries: Entry[] = [];
    let forbidden = false;
    bnds.forEach((row, r) => {
      const s = row[i];
      if (!s) return;
      const rowLevel = rowLevelOf(r, k);
      const m = DBAR.exec(s);
      if (m) {
        forbidden = true;
        const left = trimEdgeSpaces(s.slice(0, m.index).replace(DBAR_ALL, ''));
        const right = trimEdgeSpaces(s.slice(m.index + m[0].length).replace(DBAR_ALL, ''));
        if (left) entries.push({ side: 'left', tex: left, rowLevel });
        if (right) entries.push({ side: 'right', tex: right, rowLevel });
      } else {
        entries.push({ side: 'any', tex: s, rowLevel });
      }
    });

    if (!forbidden && entries.length === 0 && i > 0 && i < n - 1 && forbiddenCols?.has(i)) {
      forbidden = true;
    }

    const la = i > 0 ? arrows[i - 1] : null;
    const ra = i < n - 1 ? arrows[i] : null;
    const fromLeft: TkzLevel | undefined = la === 'up' ? 'top' : la === 'down' ? 'bot' : la === 'flat' ? 'mid' : undefined;
    const fromRight: TkzLevel | undefined = ra === 'up' ? 'bot' : ra === 'down' ? 'top' : ra === 'flat' ? 'mid' : undefined;
    const firstRowLevel = entries.find((e) => e.rowLevel)?.rowLevel;

    if (forbidden) {
      const leftLevel = fromLeft ?? entries.find((e) => e.side !== 'right')?.rowLevel ?? 'mid';
      const rightLevel = fromRight ?? entries.find((e) => e.side !== 'left')?.rowLevel ?? 'mid';
      let leftTex = '';
      let rightTex = '';
      entries.forEach((e) => {
        if (e.side === 'left') leftTex = join(leftTex, e.tex);
        else if (e.side === 'right') rightTex = join(rightTex, e.tex);
        else {
          const toLeft = i > 0 && (!e.rowLevel || e.rowLevel === leftLevel);
          const toRight = i < n - 1 && (!e.rowLevel || e.rowLevel === rightLevel);
          if (toLeft && !leftTex) leftTex = e.tex;
          if (toRight && !rightTex) rightTex = e.tex;
          if (!toLeft && !toRight) {
            if (!leftTex && i > 0) leftTex = e.tex;
            else rightTex = join(rightTex, e.tex);
          }
        }
      });
      if (i === 0 && !rightTex && leftTex) {
        rightTex = leftTex;
        leftTex = '';
      } else if (i === n - 1 && !leftTex && rightTex) {
        leftTex = rightTex;
        rightTex = '';
      }
      if (leftLevel === 'mid' || rightLevel === 'mid') usesMid = true;
      nodes.push({ forbidden: true, left: { tex: leftTex, level: leftLevel }, right: { tex: rightTex, level: rightLevel } });
      continue;
    }

    let level: TkzLevel;
    if (fromLeft && fromRight) level = fromLeft === fromRight ? fromLeft : firstRowLevel ?? 'mid';
    else level = fromLeft ?? fromRight ?? firstRowLevel ?? 'mid';
    if (level === 'mid') usesMid = true;
    const tex = entries.map((e) => e.tex).filter(Boolean).join(' ');
    const side = { tex, level };
    nodes.push({ forbidden: false, left: side, right: side });
  }

  const label = group.find((p) => p.label)?.label ?? '';
  return { type: 'var', label, nodes, arrows, levels: usesMid ? 3 : 2 };
};

const groupHasArrow = (rows: RawRow[]): boolean => rows.some((r) => r.cells.some((c) => arrowOf(c) !== null));

/**
 * Reconnaît un tableau de signes / variations écrit en `\begin{array}` et en
 * construit le modèle. Renvoie `null` pour tout autre tableau (formulaires, valeurs…).
 */
export function parseTkzTab(tex: string): TkzTabModel | null {
  const match = ARRAY_RE.exec(tex);
  if (!match) return null;
  const body = match[1];
  if (/\\begin\{array\}/.test(body)) return null; // tableaux imbriqués : hors périmètre

  const rows = readRows(body);
  if (rows.length < 2) return null;

  // Ligne des x : valeurs non vides, au moins deux.
  const xRow = rows[0];
  const valueCols = xRow.cells.map((c, idx) => (c ? idx : -1)).filter((idx) => idx >= 0);
  if (valueCols.length < 2) return null;
  const hasIntervalColumns = valueCols.some((c, idx) => idx > 0 && c - valueCols[idx - 1] > 1);
  const bodyHasArrow = groupHasArrow(rows.slice(1));
  if (!hasIntervalColumns && !bodyHasArrow) return null; // tableau de valeurs / formulaires → KaTeX
  if (xRow.cells.some((c) => arrowOf(c) || signOf(c))) return null;

  // Regroupement des lignes : un bloc de variations peut s'étaler sur plusieurs
  // lignes (valeurs hautes / flèches / valeurs basses) non séparées par \hline.
  const groups: RawRow[][] = [];
  rows.slice(1).forEach((row) => {
    const current = groups[groups.length - 1];
    if (current && !row.hlineBefore) {
      const labelled = [...current, row].filter((r) => r.label).length;
      const currentIsSign = current.length === 1 && current[0].label && !groupHasArrow(current)
        && current[0].cells.some((c) => signOf(c));
      if (labelled <= 1 && !currentIsSign && !(row.label && row.cells.some((c) => signOf(c)) && !groupHasArrow([row]))) {
        current.push(row);
        return;
      }
    }
    groups.push([row]);
  });

  // Un groupe multi-lignes sans flèche n'est pas un bloc de variations : on le dissocie.
  const finalGroups: RawRow[][] = [];
  groups.forEach((g) => {
    if (g.length > 1 && !groupHasArrow(g)) g.forEach((r) => finalGroups.push([r]));
    else finalGroups.push(g);
  });

  const model: TkzTabModel = {
    xLabel: xRow.label,
    xValues: valueCols.map((c) => xRow.cells[c]),
    rows: [],
  };

  let sawSignal = false;
  const forbiddenCols = new Set<number>();
  finalGroups.forEach((g) => {
    const projected = g.map((r) => project(r, valueCols));
    if (groupHasArrow(g)) {
      sawSignal = true;
      model.rows.push(buildVarRow(projected, forbiddenCols));
    } else {
      const row = buildSignRow(projected[0]);
      if (row.intervals.some((s) => signOf(s))) sawSignal = true;
      row.marks.forEach((m, idx) => {
        if (m.kind === 'dbar') forbiddenCols.add(idx);
      });
      model.rows.push(row);
    }
  });

  return sawSignal ? model : null;
}

// ---------------------------------------------------------------------------
// Rendu DOM
// ---------------------------------------------------------------------------

let markerSeq = 0;
const SVG_NS = 'http://www.w3.org/2000/svg';

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, className?: string): HTMLElementTagNameMap[K] => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  return node;
};

const mathCell = (tex: string, createMath: MathFactory): HTMLElement => {
  const node = createMath(toDisplayTex(tex), false);
  node.classList.add('tkz-math');
  return node;
};

const labelCell = (tex: string, createMath: MathFactory): HTMLTableCellElement => {
  const th = el('th', 'tkz-label');
  th.scope = 'row';
  if (tex) th.appendChild(mathCell(tex, createMath));
  return th;
};

/** Ordonnées (en %) des extrémités de flèches selon le niveau. */
const ARROW_Y: Record<2 | 3, Record<TkzLevel, number>> = {
  2: { top: 24, mid: 50, bot: 76 },
  3: { top: 18, mid: 50, bot: 82 },
};

const buildArrow = (from: TkzLevel, to: TkzLevel, levels: 2 | 3): SVGSVGElement => {
  const id = `tkz-tip-${(markerSeq += 1)}`;
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', 'tkz-arrow');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');

  const defs = document.createElementNS(SVG_NS, 'defs');
  const marker = document.createElementNS(SVG_NS, 'marker');
  marker.setAttribute('id', id);
  marker.setAttribute('viewBox', '0 0 10 10');
  marker.setAttribute('refX', '9');
  marker.setAttribute('refY', '5');
  marker.setAttribute('markerWidth', '8');
  marker.setAttribute('markerHeight', '8');
  marker.setAttribute('markerUnits', 'userSpaceOnUse');
  marker.setAttribute('orient', 'auto');
  const tip = document.createElementNS(SVG_NS, 'path');
  // Pointe « LaTeX » (stealth fin) plutôt qu'un triangle plein.
  tip.setAttribute('d', 'M0,0.6 L10,5 L0,9.4 L2.6,5 Z');
  tip.setAttribute('class', 'tkz-arrow-tip');
  marker.appendChild(tip);
  defs.appendChild(marker);
  svg.appendChild(defs);

  const line = document.createElementNS(SVG_NS, 'line');
  line.setAttribute('x1', '9%');
  line.setAttribute('x2', '91%');
  line.setAttribute('y1', `${ARROW_Y[levels][from]}%`);
  line.setAttribute('y2', `${ARROW_Y[levels][to]}%`);
  line.setAttribute('class', 'tkz-arrow-line');
  line.setAttribute('marker-end', `url(#${id})`);
  svg.appendChild(line);
  return svg;
};

const buildStack = (side: TkzVarSide, levels: 2 | 3, align: 'center' | 'left' | 'right', createMath: MathFactory): HTMLElement => {
  const stack = el('div', `tkz-stack tkz-stack--${align}`);
  const slots: TkzLevel[] = levels === 3 ? ['top', 'mid', 'bot'] : ['top', 'bot'];
  slots.forEach((lv) => {
    const slot = el('div', `tkz-slot tkz-slot--${lv}`);
    if (side.tex && side.level === lv) slot.appendChild(mathCell(side.tex, createMath));
    stack.appendChild(slot);
  });
  return stack;
};

const renderVarRow = (row: TkzVarRow, createMath: MathFactory): HTMLTableRowElement => {
  const tr = el('tr', `tkz-row tkz-row--var tkz-row--lv${row.levels}`);
  tr.appendChild(labelCell(row.label, createMath));
  const n = row.nodes.length;
  row.nodes.forEach((node, i) => {
    const td = el('td', 'tkz-b');
    if (i === 0) td.classList.add('tkz-b--first');
    if (i === n - 1) td.classList.add('tkz-b--last');
    const box = el('div', 'tkz-var-b');
    if (node.forbidden) {
      box.classList.add('tkz-var-b--forbidden');
      if (i > 0) box.appendChild(buildStack(node.left, row.levels, 'right', createMath));
      box.appendChild(el('div', 'tkz-dbar'));
      if (i < n - 1) box.appendChild(buildStack(node.right, row.levels, 'left', createMath));
    } else {
      box.appendChild(buildStack(node.left, row.levels, 'center', createMath));
    }
    td.appendChild(box);
    tr.appendChild(td);

    if (i < n - 1) {
      const it = el('td', 'tkz-i');
      const cell = el('div', 'tkz-var-i');
      const dir = row.arrows[i];
      if (dir) {
        const from = row.nodes[i].right.level;
        const to = row.nodes[i + 1].left.level;
        cell.appendChild(buildArrow(from, to, row.levels));
      }
      it.appendChild(cell);
      tr.appendChild(it);
    }
  });
  return tr;
};

const renderSignRow = (row: TkzSignRow, createMath: MathFactory): HTMLTableRowElement => {
  const tr = el('tr', 'tkz-row tkz-row--sign');
  tr.appendChild(labelCell(row.label, createMath));
  const n = row.marks.length;
  row.marks.forEach((mark, i) => {
    const td = el('td', `tkz-b tkz-mark--${mark.kind}`);
    if (i === 0) td.classList.add('tkz-b--first');
    if (i === n - 1) td.classList.add('tkz-b--last');
    if (mark.kind === 'zero') {
      const z = el('span', 'tkz-zero');
      z.appendChild(mathCell(mark.tex, createMath));
      td.appendChild(z);
    } else if (mark.kind === 'text') {
      td.appendChild(mathCell(mark.tex, createMath));
    }
    tr.appendChild(td);
    if (i < n - 1) {
      const content = row.intervals[i];
      const it = el('td', 'tkz-i');
      if (content) {
        const sign = signOf(content);
        if (sign) it.classList.add('tkz-i--sign');
        it.appendChild(mathCell(content, createMath));
      }
      tr.appendChild(it);
    }
  });
  return tr;
};

export function renderTkzTab(model: TkzTabModel, createMath: MathFactory): HTMLElement {
  const scroll = el('div', 'tkz-tab-scroll');
  const table = el('table', 'tkz-tab');
  const hasVar = model.rows.some((r) => r.type === 'var');
  table.setAttribute('aria-label', hasVar ? 'Tableau de variations' : 'Tableau de signes');
  const tbody = el('tbody');

  const xr = el('tr', 'tkz-row tkz-row--x');
  xr.appendChild(labelCell(model.xLabel, createMath));
  model.xValues.forEach((v, i) => {
    const td = el('td', 'tkz-b');
    if (i === 0) td.classList.add('tkz-b--first');
    if (i === model.xValues.length - 1) td.classList.add('tkz-b--last');
    td.appendChild(mathCell(v, createMath));
    xr.appendChild(td);
    if (i < model.xValues.length - 1) xr.appendChild(el('td', 'tkz-i'));
  });
  tbody.appendChild(xr);

  model.rows.forEach((row) => {
    tbody.appendChild(row.type === 'var' ? renderVarRow(row, createMath) : renderSignRow(row, createMath));
  });

  table.appendChild(tbody);
  scroll.appendChild(table);
  return scroll;
}

/** Point d'entrée : HTML tkz-tab si `tex` est un tableau de signes/variations, sinon `null`. */
export function tryRenderTkzTab(tex: string, createMath: MathFactory): HTMLElement | null {
  try {
    const model = parseTkzTab(tex);
    return model ? renderTkzTab(model, createMath) : null;
  } catch {
    return null;
  }
}
