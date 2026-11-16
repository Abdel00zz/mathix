/**
 * Parseur & numéroteur d'exercices (porté depuis ExerciseEngine.ts & exerciseNumbering.ts) — v2
 * Supporte 3 niveaux (1. -> a) -> i.) et garde `hint` et `correction` strictement séparés.
 *
 * Corrections v2 :
 *  - content / hint / correction acceptent un tableau de paragraphes (v1 : silencieusement vidés)
 *  - un champ `content: ""` n'empêche plus de lire `statement` / `text`
 *  - barème : un énoncé avec `bareme` mais des sous-questions sans barème comptait 0 point
 *  - sous-question parente sans texte mais avec indice / correction / barème : plus supprimée au 3ᵉ niveau
 *  - entrées null/invalides ignorées ; entrée chaîne = énoncé ; numérotation romaine au-delà de 39
 */
((root, factory) => {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.MathFlowExerciceParser = api;
})(typeof window !== 'undefined' ? window : globalThis, () => {
  'use strict';

  /** Normalise une valeur « texte » : chaîne, nombre ou tableau de paragraphes. */
  const toText = (v) => {
    if (typeof v === 'string') return v;
    if (typeof v === 'number' && Number.isFinite(v)) return String(v);
    if (Array.isArray(v)) return v.filter((x) => x != null && x !== '').map(String).join('\n\n');
    return '';
  };

  const partLabel = (n) => {
    let num = Math.max(1, Number(n) || 1);
    let out = '';
    while (num > 0) {
      const rem = (num - 1) % 26;
      out = String.fromCharCode(65 + rem) + out;
      num = Math.floor((num - 1) / 26);
    }
    return out;
  };

  const alphaLabel = (idx) => {
    const i = Math.max(0, Number(idx) || 0);
    return String.fromCharCode(97 + (i % 26)) + (i >= 26 ? String(Math.floor(i / 26) + 1) : '');
  };

  const ROMAN = [[1000, 'm'], [900, 'cm'], [500, 'd'], [400, 'cd'], [100, 'c'], [90, 'xc'], [50, 'l'], [40, 'xl'], [10, 'x'], [9, 'ix'], [5, 'v'], [4, 'iv'], [1, 'i']];
  const romanize = (n) => {
    let num = Math.max(1, Math.min(3999, Math.floor(Number(n) || 1)));
    let out = '';
    for (const [val, sym] of ROMAN) while (num >= val) { out += sym; num -= val; }
    return out;
  };

  const normalizeType = (rawType) => {
    const t = String(rawType || 'question').toLowerCase();
    if (t === 'part' || t === 'partie') return 'part';
    return t === 'text' || t === 'context' || t === 'intro' ? 'text' : 'question';
  };

  const asObject = (raw) => (typeof raw === 'string' ? { content: raw } : (raw && typeof raw === 'object' ? raw : {}));
  const isPartNode = (node) => Boolean(node && normalizeType(node.type || node.nodeType) === 'part');
  const isTextNode = (node) => Boolean(node && normalizeType(node.type || node.nodeType) === 'text');
  const rendersAsQuestion = (node) => Boolean(node) && !isPartNode(node) && !isTextNode(node);

  const parseBareme = (val) => {
    if (typeof val === 'number' && !Number.isNaN(val)) return val;
    const m = typeof val === 'string' && val.replace(',', '.').match(/\d+(\.\d+)?/);
    return m ? parseFloat(m[0]) : 0;
  };

  const buildNode = (input, idFallback = 'item') => {
    const raw = asObject(input);
    return {
      id: raw.id || idFallback,
      type: normalizeType(raw.type || raw.nodeType),
      title: toText(raw.title),
      content: toText(raw.content) || toText(raw.statement) || toText(raw.text),
      bareme: raw.bareme != null && raw.bareme !== '' ? raw.bareme : (raw.points != null ? raw.points : null),
      hint: toText(raw.hint),
      correction: toText(raw.correction) || toText(raw.solution),
      media: raw.media || null
    };
  };

  const hasBaremeValue = (n) => n.bareme != null && n.bareme !== '';
  const hasAnyBody = (n) => Boolean(n.content.trim() || n.hint.trim() || n.correction.trim());

  const flattenLeaves = (rawList, prefix) => {
    const out = [];
    (Array.isArray(rawList) ? rawList : []).forEach((item, i) => {
      if (item == null) return;
      const node = buildNode(item, `${prefix}-${i + 1}`);
      const kids = Array.isArray(asObject(item).subQuestions) ? asObject(item).subQuestions : [];
      if (hasAnyBody(node) || hasBaremeValue(node) || kids.length === 0) out.push(node);
      if (kids.length) out.push(...flattenLeaves(kids, node.id));
    });
    return out;
  };

  const parseSubTree = (rawSubs, parentId) => {
    const list = [];
    (Array.isArray(rawSubs) ? rawSubs : []).forEach((sq, idx) => {
      if (sq == null) return;
      const node = buildNode(sq, `${parentId}-${idx + 1}`);
      const rawL3 = Array.isArray(asObject(sq).subQuestions) ? asObject(sq).subQuestions : [];
      if (!rawL3.length) { node.children = []; list.push(node); return; }
      const flatL3 = flattenLeaves(rawL3, node.id);
      if (hasAnyBody(node) || hasBaremeValue(node)) { node.children = flatL3; list.push(node); }
      else flatL3.forEach((c) => { c.children = []; list.push(c); });
    });
    list.forEach((sq, idx) => {
      sq.label = `${alphaLabel(idx)})`;
      sq.depth = 2;
      (sq.children || []).forEach((sub, sIdx) => { sub.label = `${romanize(sIdx + 1)}.`; sub.depth = 3; });
    });
    return list;
  };

  function numberExercise(questions = []) {
    let qNum = 0;
    let pNum = 0;
    const items = (Array.isArray(questions) ? questions : []).filter((q) => q != null).map((raw, index) => {
      if (isPartNode(raw)) return { kind: 'part', index, partNumber: ++pNum, label: partLabel(pNum), node: raw };
      if (isTextNode(raw)) return { kind: 'text', index, label: '', node: raw };
      qNum++;
      return { kind: 'question', index, questionNumber: qNum, label: `${qNum}.`, subQuestions: parseSubTree(asObject(raw).subQuestions, asObject(raw).id || `q-${qNum}`), node: raw };
    });
    return { items, questionCount: qNum, partCount: pNum };
  }

  /** Total des points : somme des feuilles chiffrées ; à défaut, barème du niveau supérieur (v1 : 0). */
  const sumBareme = (blocks) => {
    let total = 0;
    blocks.forEach((b) => {
      if (b.kind !== 'question') return;
      let sub = 0;
      (b.subQuestions || []).forEach((sq) => {
        const kids = (sq.children || []).reduce((acc, c) => acc + parseBareme(c.bareme), 0);
        sub += kids > 0 ? kids : parseBareme(sq.bareme);
      });
      total += sub > 0 ? sub : parseBareme(b.bareme);
    });
    return Math.round(total * 100) / 100;
  };

  function parseExerciseModel(exercise = {}, opts = {}) {
    const ex = asObject(exercise);
    const numbered = numberExercise(ex.questions);
    const blocks = numbered.items.map((entry) => {
      const n = buildNode(entry.node, `item-${entry.index}`);
      if (entry.kind === 'part') return { id: n.id, kind: 'part', partNumber: entry.partNumber, label: `Partie ${entry.label}`, title: n.title || n.content, content: n.title ? n.content : '', media: n.media };
      if (entry.kind === 'text') return { id: n.id, kind: 'text', label: '', content: n.content, media: n.media };
      return { id: n.id, kind: 'question', number: entry.questionNumber, label: entry.label, content: n.content, bareme: n.bareme, hint: n.hint, correction: n.correction, media: n.media, subQuestions: entry.subQuestions };
    });
    const computed = sumBareme(blocks);
    return {
      id: ex.id || 'exercise',
      title: toText(ex.title) || toText(ex.topic) || (ex.number ? `Exercice ${ex.number}` : 'Exercice'),
      number: ex.number || null,
      theme: toText(ex.theme),
      topic: toText(ex.topic),
      points: ex.points || (computed > 0 ? computed : null),
      context: toText(ex.context) || toText(ex.description),
      media: ex.media || null,
      basePath: ex.basePath || (opts && opts.basePath) || '',
      questionCount: numbered.questionCount,
      partCount: numbered.partCount,
      blocks
    };
  }

  return { toText, partLabel, romanize, isPartNode, isTextNode, rendersAsQuestion, numberExercise, parseExerciseModel, parseExercise: parseExerciseModel };
});
