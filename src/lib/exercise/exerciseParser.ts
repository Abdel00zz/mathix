import { hasMediaSrc, romanize, toText } from '../math/shared/texUtils';

export { romanize, toText };

export type ExerciseNodeType = 'part' | 'text' | 'question';

export interface ExerciseSubQuestion {
  id: string;
  type: ExerciseNodeType;
  title: string;
  content: string;
  bareme: number | string | null;
  hint: string;
  correction: string;
  media: unknown;
  label: string;
  depth: 2 | 3;
  children: ExerciseSubQuestion[];
}

export interface ExercisePartBlock {
  id: string;
  kind: 'part';
  partNumber: number;
  label: string;
  title: string;
  content: string;
  media: unknown;
}

export interface ExerciseTextBlock {
  id: string;
  kind: 'text';
  label: string;
  content: string;
  media: unknown;
}

export interface ExerciseQuestionBlock {
  id: string;
  kind: 'question';
  number: number;
  label: string;
  content: string;
  bareme: number | string | null;
  hint: string;
  correction: string;
  media: unknown;
  subQuestions: ExerciseSubQuestion[];
}

export type ExerciseBlock = ExercisePartBlock | ExerciseTextBlock | ExerciseQuestionBlock;

export interface ParsedExercise {
  id: string;
  title: string;
  number: number | null;
  theme: string;
  topic: string;
  points: number | string | null;
  context: string;
  media: unknown;
  basePath: string;
  questionCount: number;
  partCount: number;
  blocks: ExerciseBlock[];
}

export interface ParseExerciseOptions {
  basePath?: string;
}

export interface NumberedExerciseEntry {
  kind: ExerciseNodeType;
  index: number;
  label: string;
  partNumber?: number;
  questionNumber?: number;
  subQuestions?: ExerciseSubQuestion[];
  node: Record<string, unknown>;
}

interface RawNodeFields {
  id: string;
  type: ExerciseNodeType;
  title: string;
  content: string;
  bareme: number | string | null;
  hint: string;
  correction: string;
  media: unknown;
}

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value === 'string') return { content: value };
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

/** Converts a 1-based part number into uppercase alphabetic labels (`A`, `B`, ..., `AA`). */
export function partLabel(n: number): string {
  let num = Math.max(1, Number(n) || 1);
  let out = '';
  while (num > 0) {
    const rem = (num - 1) % 26;
    out = String.fromCharCode(65 + rem) + out;
    num = Math.floor((num - 1) / 26);
  }
  return out;
}

function alphaLabel(idx: number): string {
  const i = Math.max(0, Number(idx) || 0);
  return String.fromCharCode(97 + (i % 26)) + (i >= 26 ? String(Math.floor(i / 26) + 1) : '');
}

function normalizeType(rawType: unknown): ExerciseNodeType {
  const t = String(rawType ?? 'question').toLowerCase();
  if (t === 'part' || t === 'partie') return 'part';
  return t === 'text' || t === 'context' || t === 'intro' ? 'text' : 'question';
}

/** Returns true when a raw exercise node represents a top-level part divider. */
export function isPartNode(node: unknown): boolean {
  if (!node || typeof node !== 'object') return false;
  const r = asRecord(node);
  return normalizeType(r.type ?? r.nodeType) === 'part';
}

/** Returns true when a raw exercise node represents a prose context block. */
export function isTextNode(node: unknown): boolean {
  if (!node || typeof node !== 'object') return false;
  const r = asRecord(node);
  return normalizeType(r.type ?? r.nodeType) === 'text';
}

/** Returns true when a raw exercise node should be numbered and rendered as a question. */
export function rendersAsQuestion(node: unknown): boolean {
  return Boolean(node) && !isPartNode(node) && !isTextNode(node);
}

function parseBareme(val: unknown): number {
  if (typeof val === 'number' && Number.isFinite(val)) return val;
  if (typeof val === 'string') {
    const clean = val.replace(',', '.').trim();
    const frac = /(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)/.exec(clean);
    if (frac) {
      const den = parseFloat(frac[2]);
      if (den > 0) return parseFloat(frac[1]) / den;
    }
    const m = clean.match(/\d+(\.\d+)?/);
    return m ? parseFloat(m[0]) : 0;
  }
  return 0;
}

function buildNode(raw: unknown, idFallback = 'item'): RawNodeFields {
  const r = asRecord(raw);
  const bareme: number | string | null =
    r.bareme != null && r.bareme !== '' && (typeof r.bareme === 'number' || typeof r.bareme === 'string')
      ? r.bareme
      : r.points != null && r.points !== '' && (typeof r.points === 'number' || typeof r.points === 'string')
        ? r.points
        : null;

  return {
    id: r.id != null && r.id !== '' ? String(r.id) : idFallback,
    type: normalizeType(r.type ?? r.nodeType),
    title: toText(r.title),
    content: toText(r.content) || toText(r.statement) || toText(r.text),
    bareme,
    hint: toText(r.hint),
    correction: toText(r.correction) || toText(r.solution),
    media: r.media ?? null,
  };
}

function hasBaremeValue(n: { bareme: number | string | null }): boolean {
  return n.bareme != null && n.bareme !== '';
}

function hasAnyBody(n: { content: string; hint: string; correction: string; media?: unknown }): boolean {
  return Boolean(n.content.trim() || n.hint.trim() || n.correction.trim() || hasMediaSrc(n.media));
}

function flattenLeaves(rawList: readonly unknown[], prefix: string): ExerciseSubQuestion[] {
  const out: ExerciseSubQuestion[] = [];
  rawList.forEach((item, i) => {
    if (item == null) return;
    const rec = asRecord(item);
    const base = buildNode(item, `${prefix}-${i + 1}`);
    const kids = Array.isArray(rec.subQuestions) ? rec.subQuestions : [];
    if (hasAnyBody(base) || hasBaremeValue(base) || kids.length === 0) {
      out.push({ ...base, label: '', depth: 3, children: [] });
    }
    if (kids.length) {
      out.push(...flattenLeaves(kids, base.id));
    }
  });
  return out;
}

function parseSubTree(rawSubs: readonly unknown[] | undefined, parentId: string): ExerciseSubQuestion[] {
  const list: ExerciseSubQuestion[] = [];
  (rawSubs ?? []).forEach((sq, idx) => {
    if (sq == null) return;
    const rec = asRecord(sq);
    const base = buildNode(sq, `${parentId}-${idx + 1}`);
    const rawL3 = Array.isArray(rec.subQuestions) ? rec.subQuestions : [];
    if (!rawL3.length) {
      list.push({ ...base, label: '', depth: 2, children: [] });
      return;
    }
    const flatL3 = flattenLeaves(rawL3, base.id);
    if (hasAnyBody(base) || hasBaremeValue(base)) {
      list.push({ ...base, label: '', depth: 2, children: flatL3 });
    } else {
      flatL3.forEach((child) => {
        list.push({ ...child, depth: 2, children: [] });
      });
    }
  });

  list.forEach((sq, idx) => {
    sq.label = `${alphaLabel(idx)})`;
    sq.depth = 2;
    sq.children.forEach((sub, sIdx) => {
      sub.label = `${romanize(sIdx + 1)}.`;
      sub.depth = 3;
    });
  });

  return list;
}

/** Numbers parts, prose nodes, and 3-level hierarchical questions in an exercise. */
export function numberExercise(questions: readonly unknown[] = []): {
  items: NumberedExerciseEntry[];
  questionCount: number;
  partCount: number;
} {
  let qNum = 0;
  let pNum = 0;
  const items: NumberedExerciseEntry[] = (Array.isArray(questions) ? questions : [])
    .filter((q) => q != null)
    .map((raw, index) => {
      const node = asRecord(raw);
      if (isPartNode(node)) {
        pNum += 1;
        return { kind: 'part', index, partNumber: pNum, label: partLabel(pNum), node };
      }
      if (isTextNode(node)) {
        return { kind: 'text', index, label: '', node };
      }
      qNum += 1;
      const rawSubs = Array.isArray(node.subQuestions) ? node.subQuestions : undefined;
      const parentId = node.id != null && node.id !== '' ? String(node.id) : `q-${qNum}`;
      return {
        kind: 'question',
        index,
        questionNumber: qNum,
        label: `${qNum}.`,
        subQuestions: parseSubTree(rawSubs, parentId),
        node,
      };
    });

  return { items, questionCount: qNum, partCount: pNum };
}

function sumBareme(blocks: readonly ExerciseBlock[]): number {
  let total = 0;
  blocks.forEach((b) => {
    if (b.kind !== 'question') return;
    let sub = 0;
    b.subQuestions.forEach((sq) => {
      const kids = sq.children.reduce((acc, c) => acc + parseBareme(c.bareme), 0);
      sub += kids > 0 ? kids : parseBareme(sq.bareme);
    });
    total += sub > 0 ? sub : parseBareme(b.bareme);
  });
  return Math.round(total * 100) / 100;
}

/** Parses a raw exercise JSON object into a strongly typed, numbered `ParsedExercise` model. */
export function parseExerciseModel(
  exercise: unknown = {},
  opts: ParseExerciseOptions = {}
): ParsedExercise {
  const ex = asRecord(exercise);
  const numbered = numberExercise(Array.isArray(ex.questions) ? ex.questions : []);
  const blocks: ExerciseBlock[] = numbered.items.map((entry) => {
    const n = buildNode(entry.node, `item-${entry.index}`);
    if (entry.kind === 'part') {
      return {
        id: n.id,
        kind: 'part',
        partNumber: entry.partNumber ?? 1,
        label: `Partie ${entry.label}`,
        title: n.title || n.content,
        content: n.title ? n.content : '',
        media: n.media,
      };
    }
    if (entry.kind === 'text') {
      return {
        id: n.id,
        kind: 'text',
        label: '',
        content: n.content,
        media: n.media,
      };
    }
    return {
      id: n.id,
      kind: 'question',
      number: entry.questionNumber ?? 1,
      label: entry.label,
      content: n.content,
      bareme: n.bareme,
      hint: n.hint,
      correction: n.correction,
      media: n.media,
      subQuestions: entry.subQuestions ?? [],
    };
  });

  const computed = sumBareme(blocks);
  const numVal = typeof ex.number === 'number' && Number.isFinite(ex.number) ? ex.number : null;
  const pointsVal: number | string | null =
    ex.points != null && ex.points !== '' && (typeof ex.points === 'number' || typeof ex.points === 'string')
      ? ex.points
      : computed > 0
        ? computed
        : null;
  const topicText = toText(ex.topic);

  return {
    id: ex.id != null && ex.id !== '' ? String(ex.id) : 'exercise',
    title:
      toText(ex.title) ||
      topicText ||
      (numVal ? `Exercice ${numVal}` : 'Exercice'),
    number: numVal,
    theme: toText(ex.theme),
    topic: topicText,
    points: pointsVal,
    context: toText(ex.context) || toText(ex.description),
    media: ex.media ?? null,
    basePath: typeof ex.basePath === 'string' ? ex.basePath : opts.basePath ?? '',
    questionCount: numbered.questionCount,
    partCount: numbered.partCount,
    blocks,
  };
}
