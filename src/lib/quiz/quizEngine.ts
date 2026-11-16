import { asRecord, findBalanced, toText } from '../math/shared/texUtils';

const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'] as const;

export { toText };

export type QuizQuestionType = 'mcq' | 'boolean' | 'order' | 'error' | 'input';

export interface QuizOption {
  id: string;
  label: string;
  text: string;
  isCorrect: boolean;
}

export interface QuizOrderItem {
  id: string;
  text: string;
}

export interface QuizErrorStep {
  id: string;
  text: string;
  isError: boolean;
  correction: string;
}

export interface NormalizedQuizQuestion {
  id: string;
  index: number;
  type: QuizQuestionType;
  category: string;
  difficulty: string;
  context: string;
  prompt: string;
  explanation: string;
  timeLimit: number | null;
  media: unknown;
  basePath: string;
  keyMissing?: boolean;
  options?: QuizOption[];
  correctIndex?: number;
  items?: QuizOrderItem[];
  correctOrder?: string[];
  steps?: QuizErrorStep[];
  correctAnswers?: string[];
  placeholder?: string;
}

export interface QuizDraft {
  selectedIndex?: number;
  orderItems?: string[];
  text?: string;
}

export interface QuizAnswer {
  status: 'answered';
  isCorrect: boolean;
  selectedIndex?: number;
  orderItems?: string[];
  text?: string;
  timedOut?: boolean;
}

export interface ComparisonSummary {
  expectedText: string;
  givenText: string;
}

export interface QuizDiagnosticBucket {
  key: string;
  label: string;
  total: number;
  correct: number;
  incorrect: number;
  skipped: number;
  timedOut: number;
  accuracyPct: number;
}

export interface QuizDiagnostic {
  total: number;
  answered: number;
  correct: number;
  incorrect: number;
  skipped: number;
  timedOut: number;
  accuracyPct: number;
  byCategory: QuizDiagnosticBucket[];
  byDifficulty: QuizDiagnosticBucket[];
  weakestCategories: string[];
  remediationIndices: number[];
  causes: {
    conceptualErrors: number[];
    timedOutIndices: number[];
    skippedIndices: number[];
  };
}

function mapType(rawType: unknown): QuizQuestionType {
  const t = String(rawType ?? 'mcq').toLowerCase();
  if (t === 'boolean' || t === 'true-false' || t === 'tf') return 'boolean';
  if (t === 'order' || t === 'ordering') return 'order';
  if (t === 'error' || t === 'error-spotting') return 'error';
  return t === 'input' || t === 'text' ? 'input' : 'mcq';
}

interface CandidateOption {
  id: string;
  label: string;
  text: string;
  flag: boolean;
}

/** Resolves the correct MCQ option index in priority order: isCorrect flag > correctIndex > id > letter > text > digit. */
function resolveCorrectIndex(raw: Record<string, unknown>, opts: readonly CandidateOption[]): number {
  const flagged = opts.findIndex((o) => o.flag);
  if (flagged >= 0) return flagged;

  const ci = raw.correctIndex != null && raw.correctIndex !== '' ? Number(raw.correctIndex) : NaN;
  if (Number.isInteger(ci) && ci >= 0 && ci < opts.length) return ci;

  const ca = raw.correctAnswer != null ? raw.correctAnswer : raw.answer;
  if (ca == null) return -1;

  const s = String(ca).trim();
  let i = opts.findIndex((o) => String(o.id) === s);
  if (i >= 0) return i;

  if (/^[A-F]$/i.test(s)) {
    i = LETTERS.indexOf(s.toUpperCase() as (typeof LETTERS)[number]);
    if (i >= 0 && i < opts.length) return i;
  }

  i = opts.findIndex((o) => o.text === s);
  if (i >= 0) return i;

  if (/^\d+$/.test(s) && Number(s) < opts.length) return Number(s);
  return -1;
}

function resolveBooleanAnswer(r: Record<string, unknown>): { value: boolean; missing: boolean } {
  if (typeof r.isTrue === 'boolean') return { value: r.isTrue, missing: false };
  if (Array.isArray(r.options)) {
    for (let i = 0; i < r.options.length; i++) {
      const opt = r.options[i];
      if (!opt || typeof opt !== 'object') continue;
      const optRec = asRecord(opt);
      if (optRec.isCorrect || optRec.is_correct) {
        const txt = (toText(optRec.text) || toText(optRec.label) || toText(optRec.id)).trim();
        if (/^(false|faux|f|non|0)$/i.test(txt)) return { value: false, missing: false };
        if (/^(true|vrai|v|oui|1)$/i.test(txt)) return { value: true, missing: false };
        return { value: i === 0, missing: false };
      }
    }
  }
  const ca = r.correctAnswer !== undefined ? r.correctAnswer : r.answer;
  if (typeof ca === 'boolean') return { value: ca, missing: false };
  if (ca != null && String(ca).trim() !== '') {
    const s = String(ca).trim();
    if (/^(true|vrai|v|oui|1)$/i.test(s)) return { value: true, missing: false };
    if (/^(false|faux|f|non|0)$/i.test(s)) return { value: false, missing: false };
  }
  const ci = r.correctIndex != null && r.correctIndex !== '' ? Number(r.correctIndex) : NaN;
  if (ci === 0 || ci === 1) return { value: ci === 0, missing: false };
  return { value: false, missing: true };
}

/** Shuffles ordering item IDs via Fisher-Yates while avoiding `expected` order when possible. */
export function shuffleOrderIds(
  ids: readonly string[],
  expected?: readonly string[],
  rng: () => number = Math.random,
): string[] {
  const arr = ids.slice();
  if (arr.length <= 1) return arr;
  for (let tries = 0; tries < 4; tries++) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    if (!expected || !arr.every((v, k) => v === expected[k])) break;
  }
  return arr;
}

/** Normalizes any quiz item payload (MCQ, boolean, order, error-spotting, or text input). */
export function normalizeQuestion(
  raw: unknown = {},
  index = 0,
  basePath = ''
): NormalizedQuizQuestion {
  const r = asRecord(raw);
  const type = mapType(r.type);
  const id = r.id != null && r.id !== '' ? String(r.id) : `q-${index}`;
  const timeNum = Number(r.timeLimit);

  const base: NormalizedQuizQuestion = {
    id,
    index,
    type,
    category: toText(r.category) || toText(r.section),
    difficulty: toText(r.difficulty),
    context: toText(r.context),
    prompt: toText(r.question) || toText(r.prompt) || toText(r.statement),
    explanation: toText(r.explanation) || toText(r.correction),
    timeLimit: Number.isFinite(timeNum) && timeNum > 0 ? timeNum : null,
    media: r.media ?? null,
    basePath: typeof r.basePath === 'string' ? r.basePath : basePath || '',
  };

  if (type === 'boolean') {
    const resolved = resolveBooleanAnswer(r);
    if (resolved.missing) base.keyMissing = true;
    base.options = [
      { id: 'true', label: 'V', text: 'Vrai', isCorrect: resolved.value === true },
      { id: 'false', label: 'F', text: 'Faux', isCorrect: resolved.value === false },
    ];
    base.correctIndex = resolved.value ? 0 : 1;
    return base;
  }

  if (type === 'order') {
    const rawItems = Array.isArray(r.items) ? r.items : Array.isArray(r.options) ? r.options : [];
    const hasExplicitIds = rawItems.some(
      (it) => Boolean(it && typeof it === 'object' && (it as Record<string, unknown>).id != null),
    );
    const items: QuizOrderItem[] = rawItems.map((it, i) => {
      if (typeof it === 'string') return { id: String(i + 1), text: it };
      const itemRec = asRecord(it);
      return {
        id: itemRec.id != null ? String(itemRec.id) : String(i + 1),
        text: toText(itemRec.text) || toText(itemRec.content) || toText(itemRec.label),
      };
    });
    const ids = items.map((it) => it.id);
    base.items = items;
    if (Array.isArray(r.correctOrder)) {
      const zeroBased =
        !hasExplicitIds &&
        r.correctOrder.length > 0 &&
        r.correctOrder.every((v) => {
          const n = Number(v);
          return Number.isInteger(n) && n >= 0 && n < ids.length;
        }) &&
        r.correctOrder.some((v) => Number(v) === 0);
      base.correctOrder = zeroBased
        ? r.correctOrder.map((v) => ids[Number(v)])
        : r.correctOrder.map((v) => (ids.includes(String(v)) ? String(v) : ids[Number(v)] || String(v)));
    } else {
      base.correctOrder = ids.slice();
    }
    return base;
  }

  if (type === 'error') {
    const rawSteps = Array.isArray(r.steps) ? r.steps : [];
    const steps: QuizErrorStep[] = rawSteps.map((st, i) => {
      if (typeof st === 'string') {
        return { id: String(i + 1), text: st, isError: false, correction: '' };
      }
      const stepRec = asRecord(st);
      return {
        id: stepRec.id != null ? String(stepRec.id) : String(i + 1),
        text: toText(stepRec.text) || toText(stepRec.step) || toText(stepRec.content),
        isError: Boolean(stepRec.isError),
        correction: toText(stepRec.correction),
      };
    });
    let errIdx = steps.findIndex((s) => s.isError);
    if (errIdx < 0) {
      const rawErrIdx = r.errorIndex != null && r.errorIndex !== '' ? Number(r.errorIndex)
        : (r.errorStepIndex != null && r.errorStepIndex !== '' ? Number(r.errorStepIndex) : NaN);
      errIdx = Number.isInteger(rawErrIdx) ? rawErrIdx : -1;
    }
    if (errIdx < 0 || errIdx >= steps.length) {
      errIdx = 0;
      base.keyMissing = true;
    }
    if (steps[errIdx]) steps[errIdx].isError = true;
    base.steps = steps;
    base.correctIndex = errIdx;
    return base;
  }

  if (type === 'input') {
    base.correctAnswers = Array.isArray(r.correctAnswers)
      ? r.correctAnswers.map(String)
      : r.correctAnswer != null
        ? [String(r.correctAnswer)]
        : [];
    base.placeholder = typeof r.placeholder === 'string' && r.placeholder ? r.placeholder : 'Votre réponse...';
    return base;
  }

  const rawOptions = Array.isArray(r.options) ? r.options : [];
  const candidates: CandidateOption[] = rawOptions.map((opt, i) => {
    const label = LETTERS[i] ?? String(i + 1);
    if (typeof opt === 'string') {
      return { id: String(i), label, text: opt, flag: false };
    }
    const optRec = asRecord(opt);
    return {
      id: optRec.id != null ? String(optRec.id) : String(i),
      label,
      text: toText(optRec.text) || toText(optRec.label) || toText(optRec.content),
      flag: Boolean(optRec.isCorrect || optRec.is_correct),
    };
  });

  let cIdx = resolveCorrectIndex(r, candidates);
  if (cIdx < 0) {
    cIdx = 0;
    base.keyMissing = true;
  }
  base.options = candidates.map((o, i) => ({
    id: o.id,
    label: o.label,
    text: o.text,
    isCorrect: i === cIdx,
  }));
  base.correctIndex = cIdx;
  return base;
}

const NUM_RE = /^([+-]?(?:\d+(?:\.\d*)?|\.\d+))(?:\/([+-]?(?:\d+(?:\.\d*)?|\.\d+)))?$/;

function replaceTexFrac(src: string): string {
  const re = /\\[dt]?frac\b/g;
  let out = '';
  let i = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    let p = re.lastIndex;
    while (p < src.length && /\s/.test(src.charAt(p))) p++;
    if (src.charAt(p) !== '{') continue;
    const end1 = findBalanced(src, p, '{', '}');
    if (end1 < 0) continue;
    let p2 = end1 + 1;
    while (p2 < src.length && /\s/.test(src.charAt(p2))) p2++;
    if (src.charAt(p2) !== '{') continue;
    const end2 = findBalanced(src, p2, '{', '}');
    if (end2 < 0) continue;
    out += src.slice(i, m.index);
    const num = replaceTexFrac(src.slice(p + 1, end1));
    const den = replaceTexFrac(src.slice(p2 + 1, end2));
    out += `(${num})/(${den})`;
    i = end2 + 1;
    re.lastIndex = i;
  }
  return out + src.slice(i);
}

function replaceTexSqrt(src: string): string {
  const re = /\\sqrt\b/g;
  let out = '';
  let i = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    let p = re.lastIndex;
    while (p < src.length && /\s/.test(src.charAt(p))) p++;
    if (src.charAt(p) !== '{') continue;
    const end = findBalanced(src, p, '{', '}');
    if (end < 0) continue;
    out += src.slice(i, m.index);
    out += `sqrt(${replaceTexSqrt(src.slice(p + 1, end))})`;
    i = end + 1;
    re.lastIndex = i;
  }
  return out + src.slice(i);
}

/** Produces a canonical string for free-text mathematical answers (comma decimal, nested \frac, \sqrt, \pi, x = ...). */
export function canonAnswer(input: unknown): string {
  let s = String(input ?? '')
    .normalize('NFC')
    .toLowerCase()
    .replace(/[\u2212\u2012\u2013\u2014]/g, '-')
    .replace(/\u00a0/g, ' ')
    .replace(/\$/g, '')
    .replace(/\\(?:left|right|displaystyle|,|;|!|quad|qquad)/g, '')
    .replace(/\\(?:cdot|times)(?![a-z])/g, '*')
    .replace(/\\pi(?![a-z])|π/g, 'pi')
    .replace(/\\ln(?![a-z])/g, 'ln')
    .replace(/\\exp(?![a-z])/g, 'exp')
    .replace(/\\infty|∞/g, 'inf');

  s = replaceTexFrac(s);
  s = replaceTexSqrt(s);

  if (!/^\s*[(\[{].*[)\]}]\s*$/.test(s)) {
    s = s.replace(/(\d),(\d)/g, '$1.$2');
  }
  s = s.replace(/\s+/g, '').replace(/[.;]+$/, '');
  s = s
    .replace(/\((sqrt\([a-z0-9.]+\))\)/g, '$1')
    .replace(/\(([+-]?(?:\d+(?:\.\d+)?|pi|inf|e|[a-z]))\)/g, '$1');
  return s;
}

function numericValue(canon: string): number | null {
  const m = NUM_RE.exec(canon);
  if (!m) return null;
  const a = parseFloat(m[1]);
  const b = m[2] != null ? parseFloat(m[2]) : 1;
  const q = a / b;
  return b === 0 || !Number.isFinite(q) ? null : q;
}

function stripLhsEquality(canon: string): string | null {
  const m = /^[a-z]\w*(?:\([a-z]\))?=(.+)$/.exec(canon);
  return m ? m[1] : null;
}

/** Compares two free-text student answers semantically (supports `0,5`, `1/2`, `\frac{\sqrt{2}}{2}`, `x = 0.5`). */
export function sameAnswer(given: unknown, expected: unknown): boolean {
  const g = canonAnswer(given);
  const e = canonAnswer(expected);
  if (!g || !e) return false;
  if (g === e) return true;
  if (!e.includes('=')) {
    const rhsG = stripLhsEquality(g);
    if (rhsG && sameAnswer(rhsG, e)) return true;
  }
  if (!g.includes('=')) {
    const rhsE = stripLhsEquality(e);
    if (rhsE && sameAnswer(g, rhsE)) return true;
  }
  const gn = numericValue(g);
  const en = numericValue(e);
  return gn != null && en != null && Math.abs(gn - en) <= 1e-9 * Math.max(1, Math.abs(en));
}

/** Returns true when the current draft contains an actual selection/input ready for grading. */
export function isAnswerable(q: NormalizedQuizQuestion, draft: QuizDraft = {}): boolean {
  if (q.type === 'order') return Boolean(q.items && q.items.length > 0);
  if (q.type === 'input') return String(draft.text ?? '').trim() !== '';
  return Number.isInteger(draft.selectedIndex) && (draft.selectedIndex as number) >= 0;
}

/** Formats "Expected vs Chosen" feedback summary texts for `QuizRunnerView`. */
export function formatComparison(q: NormalizedQuizQuestion, answer: QuizAnswer): ComparisonSummary {
  if (q.type === 'order') {
    const byId = Object.fromEntries((q.items ?? []).map((it, i) => [it.id, `${i + 1}. ${it.text}`]));
    return {
      givenText: (answer.orderItems ?? []).map((id) => byId[id] || id).join(' → ') || 'Aucune réponse',
      expectedText: (q.correctOrder ?? []).map((id) => byId[id] || id).join(' → '),
    };
  }
  if (q.type === 'input') {
    return {
      givenText: answer.text || 'Aucune réponse',
      expectedText: q.correctAnswers?.[0] || '',
    };
  }
  const list = q.type === 'error' ? q.steps ?? [] : q.options ?? [];
  const label = (i: number) =>
    q.type === 'error'
      ? `Étape ${i + 1} : `
      : `${((list[i] as QuizOption | undefined)?.label || LETTERS[i]) ?? ''} — `;
  const uIdx = Number.isInteger(answer.selectedIndex) ? (answer.selectedIndex as number) : -1;
  const cIdx = q.correctIndex ?? 0;
  return {
    givenText: uIdx >= 0 && list[uIdx] ? `${label(uIdx)}${list[uIdx].text}` : 'Aucune réponse',
    expectedText: list[cIdx] ? `${label(cIdx)}${list[cIdx].text}` : '',
  };
}

/** Evaluates a student's draft answer against a normalized quiz question. */
export function evaluateAnswer(q: NormalizedQuizQuestion, draft: QuizDraft = {}): QuizAnswer {
  if (q.type === 'order') {
    const fallbackOrder = (q.items ?? []).map((it) => it.id);
    const seq =
      Array.isArray(draft.orderItems) && draft.orderItems.length
        ? draft.orderItems.slice()
        : fallbackOrder;
    const expected = q.correctOrder ?? [];
    const isCorrect =
      seq.length === expected.length && seq.every((id, i) => id === expected[i]);
    return { status: 'answered', isCorrect, orderItems: seq };
  }

  if (q.type === 'input') {
    const text = String(draft.text ?? '');
    const isCorrect = (q.correctAnswers ?? []).some((a) => sameAnswer(text, a));
    return { status: 'answered', isCorrect, text };
  }

  const selectedIndex = Number.isInteger(draft.selectedIndex) ? (draft.selectedIndex as number) : -1;
  return {
    status: 'answered',
    isCorrect: selectedIndex >= 0 && selectedIndex === q.correctIndex,
    selectedIndex,
  };
}

/** Computes a pure pedagogical diagnostic breakdown across categories, difficulty, and error causes. */
export function computeQuizDiagnostic(
  questions: readonly NormalizedQuizQuestion[],
  answers: Readonly<Record<number, QuizAnswer | null | undefined>> | ReadonlyArray<QuizAnswer | null | undefined>,
  skippedMap?: Readonly<Record<number, boolean>> | ReadonlySet<number>,
): QuizDiagnostic {
  const getAns = (i: number): QuizAnswer | null => {
    const a = Array.isArray(answers) ? answers[i] : (answers as Record<number, QuizAnswer | null | undefined>)[i];
    return a && a.status === 'answered' ? a : null;
  };
  const isSkipped = (i: number): boolean => {
    if (!skippedMap) return false;
    return skippedMap instanceof Set
      ? skippedMap.has(i)
      : Boolean((skippedMap as Record<number, boolean>)[i]);
  };

  const catBuckets = new Map<string, QuizDiagnosticBucket>();
  const diffBuckets = new Map<string, QuizDiagnosticBucket>();
  const ensureBucket = (map: Map<string, QuizDiagnosticBucket>, rawLabel: string, fallback: string) => {
    const label = rawLabel.trim() || fallback;
    const key = label.toLowerCase();
    let b = map.get(key);
    if (!b) {
      b = { key, label, total: 0, correct: 0, incorrect: 0, skipped: 0, timedOut: 0, accuracyPct: 0 };
      map.set(key, b);
    }
    return b;
  };

  let answered = 0;
  let correct = 0;
  let incorrect = 0;
  let skipped = 0;
  let timedOut = 0;
  const conceptualErrors: number[] = [];
  const timedOutIndices: number[] = [];
  const skippedIndices: number[] = [];

  questions.forEach((q, i) => {
    const ans = getAns(i);
    const skip = !ans && isSkipped(i);
    const catB = ensureBucket(catBuckets, q.category, 'Général');
    const diffB = ensureBucket(diffBuckets, q.difficulty, 'Standard');
    catB.total++;
    diffB.total++;

    if (ans) {
      answered++;
      if (ans.isCorrect) {
        correct++;
        catB.correct++;
        diffB.correct++;
      } else {
        incorrect++;
        catB.incorrect++;
        diffB.incorrect++;
        if (ans.timedOut) {
          timedOut++;
          catB.timedOut++;
          diffB.timedOut++;
          timedOutIndices.push(i);
        } else {
          conceptualErrors.push(i);
        }
      }
    } else {
      skipped++;
      catB.skipped++;
      diffB.skipped++;
      if (skip || !ans) skippedIndices.push(i);
    }
  });

  const finalize = (map: Map<string, QuizDiagnosticBucket>) =>
    Array.from(map.values())
      .map((b) => ({ ...b, accuracyPct: b.total > 0 ? Math.round((b.correct * 100) / b.total) : 0 }))
      .sort((a, b) => a.accuracyPct - b.accuracyPct || b.incorrect - a.incorrect);

  const byCategory = finalize(catBuckets);
  const byDifficulty = finalize(diffBuckets);
  const catAcc = new Map(byCategory.map((b) => [b.key, b.accuracyPct]));
  const weakestCategories = byCategory.filter((b) => b.correct < b.total).map((b) => b.label);

  const errorSet = new Set([...skippedIndices, ...timedOutIndices, ...conceptualErrors]);
  const remediationIndices = Array.from(errorSet).sort((ia, ib) => {
    const rank = (idx: number) => (skippedIndices.includes(idx) ? 0 : timedOutIndices.includes(idx) ? 1 : 2);
    const ra = rank(ia);
    const rb = rank(ib);
    if (ra !== rb) return ra - rb;
    const ca = catAcc.get((questions[ia]?.category.trim() || 'Général').toLowerCase()) ?? 100;
    const cb = catAcc.get((questions[ib]?.category.trim() || 'Général').toLowerCase()) ?? 100;
    return ca - cb || ia - ib;
  });

  const total = questions.length;
  return {
    total,
    answered,
    correct,
    incorrect,
    skipped,
    timedOut,
    accuracyPct: total > 0 ? Math.round((correct * 100) / total) : 0,
    byCategory,
    byDifficulty,
    weakestCategories,
    remediationIndices,
    causes: { conceptualErrors, timedOutIndices, skippedIndices },
  };
}
