import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { spawn } from 'node:child_process';
import os from 'node:os';

import {
  createNavigationController,
  buildStudentHrefForPath,
} from '../assets/js/navigation.js';
import {
  ORIENTATION_CLASSES,
  getOrientationChaptersByClass,
  getMethodTips,
  getOrientationPaths,
} from '../assets/js/orientation.js';
import { engines } from '../assets/js/engine-bridge.js';
import { formatClassLabel } from '../assets/js/print.js';
import { splitSolutionSteps, sanitizeMathBold, normalizeBareMathLines, prepassTextMacros } from '../assets/js/math.js';
import { parseTkzTab } from '../assets/js/tkztab.js';
import { sliceContentForFigures } from '../assets/js/media.js';
import { numberExerciseNodes, difficultyToStars } from '../assets/js/views/exercise.js';
import { sniffFormat, svgIntrinsicSize, fitWithin, budgetSteps } from '../assets/js/studio/image-pipeline.js';
import { progress, getStorageHealth, resetAll } from '../assets/js/store.js';
import {
  stripProblemPrefix,
  formatProblemMeta,
  getActiveProblemThemes,
} from '../assets/js/views/dashboard.js';
import {
  routeDepth,
  classifyNavTransition,
  computeSlidingPillRect,
} from '../assets/js/animate.js';

test('navigation controller restores scroll on native back and resets on forward', () => {
  let scrollY = 0;
  const nav = createNavigationController({
    getScrollY: () => scrollY,
    setScrollY: (y) => { scrollY = y; },
  });

  const first = nav.recordVisit('#/eleve/2eme-bac-sc-math');
  scrollY = 480;

  const forward = nav.recordVisit('#/eleve/2eme-bac-sc-math/cadre');
  assert.equal(forward.direction, 'push');
  assert.equal(nav.restoreScrollFor(forward.key, forward.direction, forward.navIdx), 0);
  assert.equal(scrollY, 0);

  const back = nav.recordVisit('#/eleve/2eme-bac-sc-math', { __mpNavIdx: first.navIdx });
  assert.equal(back.direction, 'back');
  assert.equal(back.savedScroll, 480);
  assert.equal(nav.restoreScrollFor(back.key, back.direction, back.navIdx), 480);
  assert.equal(scrollY, 480);
});

test('navigation controller closes top-most modal before navigating on popstate', () => {
  let pushed = 0;
  let backs = 0;
  const nav = createNavigationController({
    pushModalState: () => { pushed += 1; },
    goBackNative: () => { backs += 1; },
  });
  const closed = [];
  nav.registerModal('first', () => closed.push('first'));
  nav.registerModal('second', () => closed.push('second'));

  assert.equal(pushed, 2);
  assert.equal(nav.getModalCount(), 2);
  assert.equal(nav.handlePopState(), true);
  assert.deepEqual(closed, ['second']);
  assert.equal(nav.getModalCount(), 1);

  assert.equal(nav.unregisterModal('first'), true);
  assert.equal(backs, 1);
  assert.equal(nav.getModalCount(), 0);
  // Pop caused by programmatic unregister is absorbed
  assert.equal(nav.handlePopState(), true);
  // Next pop is normal navigation
  assert.equal(nav.handlePopState(), false);
});

test('buildStudentHrefForPath resolves revisions, quizzes, exercises, problems, cadre, and exams', () => {
  assert.equal(
    buildStudentHrefForPath('data/2eme-bac-sc-math/arithmetique/revisions/fiche_arith.json'),
    '../#/eleve/2eme-bac-sc-math/revision/arithmetique/data%2F2eme-bac-sc-math%2Farithmetique%2Frevisions%2Ffiche_arith.json',
  );
  assert.equal(
    buildStudentHrefForPath('data/2eme-bac-sc-math/arithmetique/quiz/quiz_arith.json'),
    '../#/eleve/2eme-bac-sc-math/quiz/arithmetique/data%2F2eme-bac-sc-math%2Farithmetique%2Fquiz%2Fquiz_arith.json',
  );
  assert.equal(
    buildStudentHrefForPath('data/2eme-bac-sc-math/arithmetique/exercises/ex1.json'),
    '../#/eleve/2eme-bac-sc-math/exercices/arithmetique?ex=data%2F2eme-bac-sc-math%2Farithmetique%2Fexercises%2Fex1.json',
  );
  assert.equal(
    buildStudentHrefForPath('data/2eme-bac-sc-math/examen/cadre_referentiel.json'),
    '../#/eleve/2eme-bac-sc-math/cadre',
  );
  assert.equal(
    buildStudentHrefForPath('data/2eme-bac-sc-math/examen/national_2024.json'),
    '../#/eleve/2eme-bac-sc-math/examen/data%2F2eme-bac-sc-math%2Fexamen%2Fnational_2024.json',
  );
  assert.equal(
    buildStudentHrefForPath('data/2eme-bac-sc-math/problemes/prob_1.json'),
    '../#/eleve/2eme-bac-sc-math/revision/problemes/data%2F2eme-bac-sc-math%2Fproblemes%2Fprob_1.json',
  );
});

test('orientation.js covers all 8 Moroccan levels with distinct chapters, method tips, and orientation paths', () => {
  assert.equal(ORIENTATION_CLASSES.length, 8);
  const firstChapterTitles = new Set();
  for (const cls of ORIENTATION_CLASSES) {
    const chs = getOrientationChaptersByClass(cls.id);
    assert.ok(chs.length >= 6, `${cls.id} should have >= 6 official chapters`);
    firstChapterTitles.add(`${cls.id}:${chs[0].title}`);

    const tips = getMethodTips(cls.id);
    assert.ok(tips.length >= 3, `${cls.id} should have >= 3 method tips`);
    for (const t of tips) {
      assert.ok(t.title && Array.isArray(t.steps) && t.steps.length >= 2);
    }

    const paths = getOrientationPaths(cls.id);
    assert.ok(paths.length >= 3, `${cls.id} should have >= 3 orientation paths`);
    for (const p of paths) {
      assert.ok(p.title && p.tag && p.description);
    }
  }
  assert.equal(firstChapterTitles.size, 8);
});

test('2eme-bac-sc-math cadre_referentiel.json is complete and structurally valid', () => {
  const filePath = path.resolve(process.cwd(), 'public/data/2eme-bac-sc-math/examen/cadre_referentiel.json');
  const doc = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  assert.ok(doc.header?.title, 'cadre header.title must exist');
  assert.ok(Array.isArray(doc.sections), 'cadre sections must be an array');

  const domains = doc.sections.filter((s) => s.category === 'domain');
  const subdomains = doc.sections.filter((s) => s.category === 'subdomain');
  const methods = doc.sections.filter((s) => s.category === 'method');

  assert.ok(domains.length >= 4, 'expected >= 4 domains');
  assert.ok(subdomains.length >= 10, 'expected >= 10 subdomains');
  assert.ok(methods.length >= 45, `expected >= 45 method skills, got ${methods.length}`);

  for (const sec of doc.sections) {
    const dollars = (String(sec.title || '').match(/(?<!\\)\$/g) || []).length;
    assert.equal(dollars % 2, 0, `Unbalanced $ in ${sec.id}: ${sec.title}`);
  }
});

test('Rust WASM engines (math_engine v1.5.0 & json_engine v1.7.0) execute native ABI operations accurately', async () => {
  const mathBytes = fs.readFileSync(path.resolve(process.cwd(), 'engines/math_engine.wasm'));
  const jsonBytes = fs.readFileSync(path.resolve(process.cwd(), 'engines/json_engine.wasm'));

  const mathInst = await WebAssembly.instantiate(mathBytes, {});
  const jsonInst = await WebAssembly.instantiate(jsonBytes, {});

  const callWasm = (exports, payload) => {
    const enc = new TextEncoder();
    const dec = new TextDecoder();
    const bytes = enc.encode(JSON.stringify(payload));
    const ptr = exports.alloc(bytes.length);
    new Uint8Array(exports.memory.buffer, ptr, bytes.length).set(bytes);
    exports.process(ptr, bytes.length);
    const out = new Uint8Array(exports.memory.buffer, exports.out_ptr(), exports.out_len());
    const parsed = JSON.parse(dec.decode(out));
    exports.out_free();
    exports.dealloc(ptr, bytes.length);
    return parsed;
  };

  assert.equal(typeof mathInst.instance.exports.process, 'function');
  assert.equal(typeof jsonInst.instance.exports.process, 'function');

  // Verify native WASM versions
  const mathInfo = callWasm(mathInst.instance.exports, { op: 'info' });
  const jsonInfo = callWasm(jsonInst.instance.exports, { op: 'info' });
  assert.ok(mathInfo.version.includes('1.5.0'), `expected math_engine 1.5.0, got ${mathInfo.version}`);
  assert.ok(jsonInfo.version.includes('1.7.0'), `expected json_engine 1.7.0, got ${jsonInfo.version}`);

  // Verify native WASM math_engine::structure (inspect-display, unwrap-boxed-blanks, split-solution-steps)
  const dispBoxed = callWasm(mathInst.instance.exports, {
    op: 'inspect-display',
    tex: '\\large \\boxed{\\displaystyle \\lim_{x \\to 1} f(x) = \\blank{\\dfrac{1}{2}}}.',
  });
  assert.equal(dispBoxed.ok, true);
  assert.equal(dispBoxed.isBoxed, true);
  assert.equal(dispBoxed.trailingPunct, '.');
  assert.equal(dispBoxed.metrics.hasFraction, true);

  const dispUnboxed = callWasm(mathInst.instance.exports, {
    op: 'inspect-display',
    tex: '\\Large \\lim_{x \\to 0} \\dfrac{\\sin x}{x} = 1',
  });
  assert.equal(dispUnboxed.isBoxed, false);
  assert.equal(dispUnboxed.inner, '\\lim_{x \\to 0} \\dfrac{\\sin x}{x} = 1');

  const unwrapped = callWasm(mathInst.instance.exports, {
    op: 'unwrap-boxed-blanks',
    tex: 'Résultat : \\boxed{\\blank{\\dfrac{x^2+1}{2}}} et \\fbox{\\blank{3}}',
  });
  assert.equal(unwrapped.tex, 'Résultat : \\blank{\\dfrac{x^2+1}{2}} et \\blank{3}');

  const wasmSteps = callWasm(mathInst.instance.exports, {
    op: 'split-solution-steps',
    latex: "On factorise :\\begin{align*}f(x)&=x-5.\\end{align*} Par conséquent :\\par\\smallskip$$\\boxed{\\lim_{x \\to 1} f(x) = -4}$$",
  });
  assert.equal(wasmSteps.ok, true);
  assert.equal(wasmSteps.steps.length, 2);
  assert.ok(wasmSteps.steps[1].startsWith('Par conséquent'));

  // Verify native WASM json_engine::exercise (sanitize-title, exercise-outline, merge-progress, chapter-mastery)
  assert.equal(callWasm(jsonInst.instance.exports, { op: 'sanitize-title', title: 'ex-func-rat-001', id: 'ex-func-rat-001' }).title, '');
  assert.equal(callWasm(jsonInst.instance.exports, { op: 'sanitize-title', title: 'ex-cont-02' }).title, '');
  assert.equal(callWasm(jsonInst.instance.exports, { op: 'sanitize-title', title: 'ex_cont_03.json' }).title, '');
  assert.equal(callWasm(jsonInst.instance.exports, { op: 'sanitize-title', title: 'Exercice 1' }).title, '');
  assert.equal(callWasm(jsonInst.instance.exports, { op: 'sanitize-title', title: 'Analyse - Fonctions', id: 'ex-func-rat-001' }).title, 'Analyse - Fonctions');

  const outline = callWasm(jsonInst.instance.exports, {
    op: 'exercise-outline',
    path: 'data/2eme-bac-sc-ex/continuite/exercises/ex_cont_01.json',
    json: JSON.stringify({
      id: 'ex-func-rat-001',
      topic: 'Analyse - Fonctions',
      difficulty: 'moyen',
      questions: [
        { id: 'pI', type: 'header', content: 'Partie 1' },
        { id: 'q1', content: 'Calculer $g(0)$', hint: 'Remplacer' },
        { id: 'q2', content: 'Limites', subQuestions: [{ id: 'a', content: 'En $+\\infty$' }, { id: 'b', content: 'En $-\\infty$', correction: '$0$' }] },
      ],
    }),
  });
  assert.equal(outline.ok, true);
  assert.equal(outline.displayTopic, 'Analyse - Fonctions');
  assert.equal(outline.difficultyStars, 3);
  assert.equal(outline.partCount, 1);
  assert.equal(outline.questionCount, 2);
  assert.equal(outline.subQuestionCount, 3);
  assert.equal(outline.nodes[0].partLabel, 'Partie I');

  const crdt = callWasm(jsonInst.instance.exports, {
    op: 'merge-progress',
    namespace: 'progress-revision',
    local: { '2bac::cont': { sheets: { f1: 30, f2: 75 }, blanks: { f1: ['a'] }, lastActiveAt: 100 } },
    remote: { '2bac::cont': { sheets: { f1: 85, f2: 20 }, blanks: { f1: ['a', 'b'] }, lastActiveAt: 200 } },
  });
  assert.equal(crdt.ok, true);
  assert.equal(crdt.merged['2bac::cont'].sheets.f1, 85);
  assert.equal(crdt.merged['2bac::cont'].sheets.f2, 75);
  assert.deepEqual(crdt.merged['2bac::cont'].blanks.f1, ['a', 'b']);

  const mastery = callWasm(jsonInst.instance.exports, {
    op: 'chapter-mastery',
    hasRevision: true,
    hasQuiz: true,
    exerciseTotal: 4,
    revPct: 100,
    quizSubmitted: true,
    quizBestPct: 90,
    exercises: { e1: { evaluated: 'easy' }, e2: { evaluated: 'medium' } },
  });
  assert.equal(mastery.ok, true);
  assert.equal(mastery.nextAction, 'exercises');
  assert.ok(mastery.masteryScore >= 70);

  // Verify engine-bridge executes natively on Rust/WASM (math_engine + json_engine)
  assert.deepEqual(engines.mode, { math: 'wasm', json: 'wasm' });
  const rustMacros = engines.math.macros();
  assert.equal(rustMacros.ok, true);
  assert.ok(Object.keys(rustMacros.macros || {}).length >= 180, 'expected >= 180 KaTeX macros from Rust math_engine');
  assert.equal(typeof rustMacros.macros.hasOwnProperty, 'function', 'KaTeX macros map must inherit Object.prototype.hasOwnProperty');
  assert.equal(engines.math.plainTitle('Somme $\\sum_{k=1}^{n} k$ et \\textbf{produit}'), 'Somme _ k=1 ^ n k et produit');
  assert.equal(engines.math.searchMatch('Théorème des valeurs intermédiaires', 'theoreme intermediaire'), true);
  assert.equal(engines.math.searchMatch('Théorème des valeurs intermédiaires', 'arithmetique'), false);
  assert.equal(engines.json.sanitizeTitle('ex-func-rat-001', 'ex-func-rat-001'), '');
  assert.equal(engines.json.sanitizeTitle('Analyse - Fonctions', 'ex-func-rat-001'), 'Analyse - Fonctions');

  const soc = engines.math.socraticSplit('Comment \\mathqst{lever la forme indéterminée} ?');
  assert.equal(soc.prefix.trim(), 'Comment');
  assert.equal(soc.focus, 'lever la forme indéterminée');

  const qst = engines.math.splitQuestion('\\\\ \\medskip \\qst{Calculer la limite} On factorise par $x$.');
  assert.equal(qst.statement, 'Calculer la limite');
  assert.equal(qst.correction, 'On factorise par $x$.');

  // Verify Rust json_engine Studio intelligence (slugify, nextExerciseNumber, batch import, smart rename)
  assert.equal(engines.json.studioSlugify('Nombres complexes & Équations (2e Bac)'), 'nombres-complexes-equations-2e-bac');

  const numRes = engines.json.studioNextNumber(
    [{ id: 'ex_1', path: 'data/c/ch/exercises/ex_1.json' }, { id: 'exercice-4', path: 'data/c/ch/exercises/exercice-4.json' }],
    '2eme-bac-sc-math',
    'complexes',
  );
  assert.equal(numRes.nextNumber, 5);
  assert.deepEqual(numRes.displayNumbers, [1, 4]);
  assert.equal(numRes.suggestedId, 'exercice-5');

  const impRes = engines.json.studioParseImport(JSON.stringify([
    { topic: 'Ex 1', questions: [{ id: 'q1', content: 'Calculer' }] },
    { questions: [{ id: 'q1', type: 'mcq', prompt: 'Vrai ?', options: [{ text: 'A', isCorrect: true }, { text: 'B', isCorrect: false }] }] },
  ]), 'batch.json');
  assert.equal(impRes.entries.length, 2);
  assert.equal(impRes.entries[0].kind, 'exercise');
  assert.equal(impRes.entries[1].kind, 'quiz');

  const renEx = engines.json.studioRenameDoc({ id: 'ex1', topic: 'Ancien', questions: [] }, 'exercise', 'Suites adjacentes');
  assert.equal(renEx.doc.topic, 'Suites adjacentes');
  const renRev = engines.json.studioRenameDoc({ header: { title: 'Ancien' }, sections: [] }, 'revision', 'Dérivation');
  assert.equal(renRev.doc.header.title, 'Dérivation');
});

test('Student views (revision, exercise, quiz) contain no Éditer dans le Studio menu links and use print.js', () => {
  assert.equal(formatClassLabel('2eme-bac-sc-math'), '2e Bac Sciences Mathématiques');
  assert.equal(formatClassLabel('1ac'), '1re Année Collège (1AC)');

  for (const rel of ['assets/js/views/revision.js', 'assets/js/views/exercise.js', 'assets/js/views/quiz.js']) {
    const src = fs.readFileSync(path.resolve(process.cwd(), rel), 'utf8');
    assert.equal(src.includes('Éditer dans le Studio'), false, `${rel} must not expose Éditer dans le Studio`);
    assert.equal(src.includes('buildAdminStudioHrefForPath'), false, `${rel} must not import buildAdminStudioHrefForPath`);
  }

  const revSrc = fs.readFileSync(path.resolve(process.cwd(), 'assets/js/views/revision.js'), 'utf8');
  assert.equal(revSrc.includes('revision-hero-kicker'), false, 'revision.js must not render class kicker above Fiche title');
  assert.equal(revSrc.includes('revision-hero-subtitle'), false, 'revision.js must not render hero subtitle below Fiche title');
  assert.equal(revSrc.includes('revision-hero-actions'), false, 'revision.js must not duplicate menu actions in hero');
  assert.equal(revSrc.includes('revision-hero-word'), true, 'revision.js must highlight Fiche in dark red');
  assert.equal(revSrc.includes('revision-hero-rest'), true, 'revision.js must render the rest of the title in black');
});

test('splitSolutionSteps decomposes single and multi-item application solutions cleanly', () => {
  const ex3 = "Le numérateur s'annule en $1$, donc on le factorise :\\par\\smallskip\\begin{align*}\\dfrac{x^2-6x+5}{x-1}&=\\dfrac{\\blank{(x-1)(x-5)}}{x-1}\\\\&=x\\blank{-5},\\qquad x\\ne1.\\end{align*} Par conséquent :\\par\\smallskip$$\\boxed{\\displaystyle \\lim_{x \\to 1}\\dfrac{x^2-6x+5}{x-1}=\\blank{-4}}$$";
  const steps3 = splitSolutionSteps(ex3);
  assert.equal(steps3.length, 2);
  assert.ok(steps3[0].includes('factorise'));
  assert.ok(steps3[1].startsWith('Par conséquent'));

  const ex5 = "\\par\\smallskip\\begin{enumerate}\\item Comme $|\\sin(1/x)|\\le1$, on a\\end{enumerate}$$|f(x)-2|=x^2\\left|\\sin\\left(\\dfrac1x\\right)\\right|\\le\\blank{x^2}.$$ Le majorant tend vers $0$, donc $\\displaystyle \\lim_{x \\to0}f(x)=\\blank{2}$.\\par\\smallskip\\begin{enumerate}\\item La propriété de la partie entière donne\\end{enumerate}\\begin{align*}\\left|g(x)-\\dfrac32\\right|&=\\dfrac{|x|}{2}\\left|\\blank{E\\left(\\dfrac3x\\right)-\\dfrac3x}\\right|\\\\&\\le\\dfrac{|x|}{2}.\\end{align*} Ce majorant tend vers $0$, donc $\\displaystyle \\lim_{x \\to0}g(x)=\\blank{\\dfrac32}$. Les résultats sont : $\\boxed{2}$ et $\\boxed{\\dfrac32}$.";
  const steps5 = splitSolutionSteps(ex5);
  assert.equal(steps5.length, 2);
  assert.ok(steps5[0].startsWith('\\textbf{1.}'));
  assert.ok(steps5[1].startsWith('\\textbf{2.}'));
  assert.ok(steps5[0].includes('$$\\boxed{'));
  assert.ok(steps5[1].includes('$$\\boxed{'));

  const baseCss = fs.readFileSync(path.resolve(process.cwd(), 'assets/css/base.css'), 'utf8');
  assert.ok(baseCss.includes('*, *::before, *::after { box-sizing: border-box; }'), 'base.css must enforce border-box directly to avoid <details> shadow slot content-box');
});

test('numberExerciseNodes skips header/partie/text/empty nodes and difficultyToStars maps cleanly', () => {
  const nodes = [
    { id: 'pI', type: 'header', content: 'Intro partie I' },
    { id: 'q1', content: 'Vérifier g(0) = 0.' },
    { id: 'q2', content: 'Signe de g(x).' },
    { id: 'pII', type: 'header', content: 'Intro partie II' },
    { id: 'empty', content: '   ' },
    { id: 'note', type: 'text', content: 'Remarque libre.' },
    { id: 'q3', subQuestions: [{ id: 'a', content: 'Calculer' }] },
  ];
  const res = numberExerciseNodes(nodes);
  assert.equal(res[0].kind, 'part');
  assert.equal(res[0].partLabel, 'Partie I');
  assert.equal(res[0].question, 0);
  assert.equal(res[1].kind, 'question');
  assert.equal(res[1].question, 1);
  assert.equal(res[2].question, 2);
  assert.equal(res[3].kind, 'part');
  assert.equal(res[3].partLabel, 'Partie II');
  assert.equal(res[4].kind, 'empty');
  assert.equal(res[5].kind, 'text');
  assert.equal(res[6].kind, 'question');
  assert.equal(res[6].question, 3);

  assert.equal(difficultyToStars('facile'), 1);
  assert.equal(difficultyToStars('moyen'), 3);
  assert.equal(difficultyToStars('difficile'), 5);
  assert.equal(difficultyToStars(4), 4);
  assert.equal(difficultyToStars(''), 0);
});

test('Studio image-pipeline pure helpers sniff magic bytes and resize proportionally', () => {
  assert.equal(sniffFormat(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])), 'png');
  assert.equal(sniffFormat(new Uint8Array([0xff, 0xd8, 0xff, 0xe0])), 'jpeg');
  assert.equal(sniffFormat(new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50])), 'webp');
  assert.equal(sniffFormat(new TextEncoder().encode('<svg viewBox="0 0 200 100"></svg>')), 'svg');
  assert.equal(sniffFormat(new Uint8Array([0x00, 0x01, 0x02, 0x03])), null);

  assert.deepEqual(svgIntrinsicSize('<svg viewBox="0 0 560 390"></svg>'), { width: 560, height: 390 });
  assert.deepEqual(fitWithin(3200, 1600, 1600), { width: 1600, height: 800 });
  assert.deepEqual(fitWithin(400, 300, 1600), { width: 400, height: 300 });
  assert.equal(budgetSteps(1600).length, 20);
});

test('store.js setRevision avoids redundant writes and getStorageHealth works without browser localStorage', () => {
  resetAll();
  assert.equal(progress.setRevision('2eme-bac-sc-ex', 'exponentielles', 'fiche_1', 25), true);
  assert.equal(progress.setRevision('2eme-bac-sc-ex', 'exponentielles', 'fiche_1', 25), false);
  assert.equal(progress.setRevision('2eme-bac-sc-ex', 'exponentielles', 'fiche_1', 12), false);
  assert.equal(progress.setRevision('2eme-bac-sc-ex', 'exponentielles', 'fiche_1', 60), true);
  assert.equal(progress.getRevision('2eme-bac-sc-ex', 'exponentielles', 'fiche_1'), 60);

  const health = getStorageHealth();
  assert.equal(health.mode, 'memory-fallback');
  assert.ok(health.totalBytes > 0);
  assert.ok(health.keyCount >= 1);
  resetAll();
});

test('math.js sanitizes math-mode \\textbf, wraps bare equation lines, and splits glued \\smallskip', () => {
  assert.equal(
    sanitizeMathBold('\\textbf{D_f = \\R \\setminus \\{-1\\}} = \\intervaloo{-\\infty}{-1}'),
    '\\boldsymbol{D_f = \\R \\setminus \\{-1\\}} = \\intervaloo{-\\infty}{-1}',
  );
  assert.equal(
    sanitizeMathBold('y = \\textbf{\\displaystyle\\frac{1}{2}x}'),
    'y = \\displaystyle \\boldsymbol{\\frac{1}{2}x}',
  );
  assert.equal(
    sanitizeMathBold('\\textbf{Interprétation}'),
    '\\textbf{Interprétation}',
  );

  const normalized = normalizeBareMathLines(
    '\\method La fonction $f$ est rationnelle.\n(x+1)^2 = 0 \\iff x = -1\n\\conclusion Donc $D_f = \\R$.',
  );
  assert.ok(normalized.includes('$$(x+1)^2 = 0 \\iff x = -1$$'));
  assert.ok(normalized.includes('\\par \\conclusion'));

  const prepassed = prepassTextMacros('Calculons.\\par\\smallskipOn a : $x=1$.');
  assert.equal(prepassed, 'Calculons.%%PAR%%%%PAR%%On a : $x=1$.');

  const boldWithMath = prepassTextMacros('\\textbf{$24 \\wedge 36$ par la} et \\textbf{Par $9$ :}');
  assert.equal(
    boldWithMath,
    '%%OPEN:textbf%%$24 \\wedge 36$ par la%%CLOSE:textbf%% et %%OPEN:textbf%%Par $9$ :%%CLOSE:textbf%%',
  );

  // Prose lines starting with \textbf{...} must NOT be wrapped as display math $$...$$
  const proseBold = normalizeBareMathLines('\\textbf{Par $9$ et $11$ :} la somme des chiffres.');
  assert.equal(proseBold.includes('$$'), false, 'Prose line with \\textbf must not be wrapped in $$');

  // Inline math titles (e.g., dashboard chapter titles) must inherit parent font & size
  const mathCss = fs.readFileSync(path.resolve(process.cwd(), 'assets/css/math.css'), 'utf8');
  assert.ok(
    /\.math-renderer\.math-inline\s*\{[\s\S]*?font-family:\s*inherit;[\s\S]*?font-size:\s*inherit;/.test(mathCss),
    'math.css must let .math-renderer.math-inline inherit parent font-family and font-size',
  );
  assert.ok(
    /\.math-renderer\s*:is\(strong,\s*b\)\s*\{[\s\S]*?font-weight:\s*700;/.test(mathCss),
    'math.css must render strong/b with full 700 bold weight',
  );
});

test('Problèmes tab helpers strip redundant Problème prefixes, condense metadata, and filter empty themes', () => {
  assert.equal(stripProblemPrefix('Problème 2.1 — Empreintes digitales'), 'Empreintes digitales');
  assert.equal(stripProblemPrefix('Problème — PGCD et PPCM'), 'PGCD et PPCM');
  assert.equal(stripProblemPrefix('Problème n°3 : Suites adjacentes'), 'Suites adjacentes');

  const themeMap = { denombrement: 'Dénombrement', analyse: 'Analyse' };
  assert.equal(
    formatProblemMeta(
      { title: "Avez-vous les mêmes empreintes qu'un autre ?", subtitle: 'Problème 2.1 — Empreintes digitales', theme: 'denombrement' },
      themeMap,
    ),
    'Dénombrement · Empreintes digitales',
  );
  // Deduplicates when subtitle matches theme
  assert.equal(
    formatProblemMeta(
      { title: 'Trajectoire', subtitle: 'Problème — Analyse', theme: 'analyse' },
      themeMap,
    ),
    'Analyse',
  );
  // Filters out unpopulated themes; returns empty array when <= 1 populated theme
  assert.deepEqual(
    getActiveProblemThemes({
      themes: [{ id: 'denombrement', name: 'Dénombrement' }, { id: 'suites', name: 'Suites' }],
      problemes: [{ id: 'p1', theme: 'denombrement' }],
    }),
    [],
  );
  assert.deepEqual(
    getActiveProblemThemes({
      themes: [{ id: 'denombrement', name: 'Dénombrement' }, { id: 'suites', name: 'Suites' }, { id: 'analyse', name: 'Analyse' }],
      problemes: [{ id: 'p1', theme: 'denombrement' }, { id: 'p2', theme: 'suites' }],
    }),
    [{ id: 'all', name: 'Tous' }, { id: 'denombrement', name: 'Dénombrement' }, { id: 'suites', name: 'Suites' }],
  );
});

test('animate.js classifies semantic route transitions and computes sliding morph pill rects', () => {
  assert.equal(routeDepth('/'), 0);
  assert.equal(routeDepth('/eleve/2eme-bac-sc-ex'), 1);
  assert.equal(routeDepth('/eleve/2eme-bac-sc-ex/revision/problemes/p.json'), 2);
  assert.equal(routeDepth('/eleve/2eme-bac-sc-ex/exercices/suites?ex=ex1.json'), 3);

  const tabFwd = classifyNavTransition('/eleve/2eme-bac-sc-ex', '/eleve/2eme-bac-sc-ex?tab=problemes', 'push');
  assert.equal(tabFwd.kind, 'tab');
  assert.equal(tabFwd.tabDir, 'right');

  const tabBack = classifyNavTransition('/eleve/2eme-bac-sc-ex?tab=concours', '/eleve/2eme-bac-sc-ex?tab=examens', 'back');
  assert.equal(tabBack.kind, 'tab');
  assert.equal(tabBack.tabDir, 'left');

  const drillIn = classifyNavTransition('/eleve/2eme-bac-sc-ex?tab=problemes', '/eleve/2eme-bac-sc-ex/revision/problemes/p.json', 'push');
  assert.equal(drillIn.kind, 'drill-in');

  const drillOut = classifyNavTransition('/eleve/2eme-bac-sc-ex/revision/problemes/p.json', '/eleve/2eme-bac-sc-ex?tab=problemes', 'back');
  assert.equal(drillOut.kind, 'drill-out');

  const pill = computeSlidingPillRect(
    { left: 100, top: 50 },
    { left: 184.4, top: 54.1, width: 92.3, height: 34.2 },
    10,
    0,
  );
  assert.deepEqual(pill, { x: 94.5, y: 4, width: 92.5, height: 34 });
});

test('Chromatic token architecture defines complete 4-tier surfaces across all 4 palettes (Light & Dark) and forbids dark-mode-breaking legacy colors', () => {
  const tokensCss = fs.readFileSync(path.resolve(process.cwd(), 'assets/css/tokens.css'), 'utf8');
  const requiredTokens = [
    '--bg:',
    '--surface-recessed:',
    '--surface:',
    '--paper:',
    '--surface-elevated:',
    '--ink:',
    '--muted:',
    '--line:',
    '--accent:',
    '--on-accent:',
    '--scrim:',
  ];

  const extractBlock = (selector) => {
    const idx = tokensCss.indexOf(selector);
    assert.ok(idx !== -1, `Missing selector block ${selector} in tokens.css`);
    const open = tokensCss.indexOf('{', idx);
    let depth = 0;
    for (let i = open; i < tokensCss.length; i += 1) {
      if (tokensCss[i] === '{') depth += 1;
      else if (tokensCss[i] === '}') {
        depth -= 1;
        if (depth === 0) return tokensCss.slice(open + 1, i);
      }
    }
    throw new Error(`Unclosed block for ${selector}`);
  };

  for (const sel of [
    ':root {',
    ':root[data-palette="mineral"] {',
    ':root[data-palette="manuscrit"] {',
    ':root[data-palette="botanique"] {',
    ':root[data-theme="dark"] {',
    ':root[data-theme="dark"][data-palette="mineral"] {',
    ':root[data-theme="dark"][data-palette="manuscrit"] {',
    ':root[data-theme="dark"][data-palette="botanique"] {',
  ]) {
    const block = extractBlock(sel);
    for (const tok of requiredTokens) {
      assert.ok(block.includes(tok), `${sel} must define ${tok}`);
    }
  }

  // Strip @media print blocks before checking dark-mode safety of screen styles
  const stripPrint = (css) => css.replace(/@media\s+print\s*\{[\s\S]*$/g, '');
  const forbiddenPatterns = [
    /#fffbeb\b/i,
    /#fefce8\b/i,
    /#fde68a\b/i,
    /#222630\b/i,
    /#1e293b\b/i,
    /rgba\(\s*10\s*,\s*20\s*,\s*80\s*,/i,
    /rgba\(\s*51\s*,\s*65\s*,\s*85\s*,/i,
    /rgba\(\s*148\s*,\s*163\s*,\s*184\s*,/i,
  ];
  for (const rel of [
    'assets/css/base.css',
    'assets/css/motions.css',
    'assets/css/components.css',
    'assets/css/views.css',
    'assets/css/lesson.css',
    'assets/css/exercise.css',
    'assets/css/math.css',
  ]) {
    const screenCss = stripPrint(fs.readFileSync(path.resolve(process.cwd(), rel), 'utf8'));
    for (const re of forbiddenPatterns) {
      assert.equal(re.test(screenCss), false, `${rel} still contains legacy non-harmonized color matching ${re}`);
    }
  }

  const viewsCss = fs.readFileSync(path.resolve(process.cwd(), 'assets/css/views.css'), 'utf8');
  assert.ok(
    /\.cc-fbtn\[aria-pressed="true"\][\s\S]{0,160}color:\s*var\(--on-accent\)/.test(viewsCss),
    'Active Concours filter button must use var(--on-accent) for Dark Mode contrast',
  );
  assert.ok(
    /\.focus-next-btn[\s\S]{0,200}color:\s*var\(--on-accent\)/.test(viewsCss),
    'Focus next button must use var(--on-accent) for Dark Mode contrast',
  );

  const lessonCss = fs.readFileSync(path.resolve(process.cwd(), 'assets/css/lesson.css'), 'utf8');
  assert.ok(lessonCss.includes('--bg-glow-1'), 'lesson.css must use palette-aware ambient washes');
  assert.ok(lessonCss.includes('var(--surface-recessed)'), 'lesson.css must align recessed surfaces to --surface-recessed');
  assert.ok(lessonCss.includes('#0369a1') && lessonCss.includes('#6b21a8'), 'lesson.css must preserve Remarque sky-blue and Intuition soft-mauve badges');
});

test('Rust WASM handles tkz-tab variation tables, art tables, figure slicing, and chapterPct', () => {
  const tkzTex = `\\begin{array}{c|ccccc}
x & -\\infty & & 1 & & +\\infty \\\\ \\hline
f'(x) & & + & 0 & - & \\\\ \\hline
f(x) & 0 & \\nearrow & 3 & \\searrow & -\\infty
\\end{array}`;
  const model = parseTkzTab(tkzTex);
  assert.ok(model, 'parseTkzTab must recognize sign+variation table');
  assert.equal(model.xLabel, 'x');
  assert.equal(model.rows.length, 2);
  assert.equal(model.rows[0].type, 'sign');
  assert.equal(model.rows[1].type, 'var');

  // Plain matrix without borders/headers must return null
  assert.equal(parseTkzTab('\\begin{array}{cc} 1 & 2 \\\\ 3 & 4 \\end{array}'), null);

  // Art table parser
  const art = engines.math.parseArtTable(`\\begin{array}{|l|c|r|}
\\hline
Fonction & Dérivée & Domaine \\\\ \\hline
x^2 & 2x & \\R \\\\ \\hline
\\end{array}`);
  assert.ok(art, 'parseArtTable must parse framed LaTeX tables');
  assert.equal(art.aligns.length, 3);
  assert.equal(art.rows.length, 2);

  // Figure slicing
  const sliced = sliceContentForFigures(
    '\\begin{enumerate}\\item Question 1\\item Question 2\\item Question 3\\end{enumerate}',
    [{ id: 'fig1', afterItem: 2, src: 'assets/img/test.svg' }],
  );
  assert.equal(sliced.unplaced.length, 0);
  assert.ok(sliced.slices.length >= 2);
  assert.equal(sliced.slices[0].figuresAfter.length, 1);

  // chapterPct via Rust json_engine
  resetAll();
  progress.setRevision('2eme-bac-sc-math', 'suites', 'fiche_1', 100);
  progress.pushQuizAttempt('2eme-bac-sc-math', 'suites', 'q1', { pct: 80, score: 8, total: 10 });
  const pct = progress.chapterPct('2eme-bac-sc-math', 'suites', {
    revisions: [{ id: 'fiche_1' }],
    quizzes: [{ id: 'q1' }],
    exercises: [{ id: 'e1' }, { id: 'e2' }],
  });
  assert.ok(pct >= 50 && pct <= 100, `expected valid weighted chapterPct, got ${pct}`);
  resetAll();
});

test('Native Rust HTTP server (engines/mathix-server) serves health, CRDT sync, Rust audit, and blocks path traversal', async () => {
  const binPath = path.resolve(process.cwd(), 'engines/mathix-server');
  assert.ok(fs.existsSync(binPath), 'Compiled native Rust binary engines/mathix-server must exist');

  const port = 18765;
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mathix-rust-srv-'));
  const dbPath = path.join(tmpDir, 'db.json');

  const child = spawn(binPath, [], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      MATHIX_HOST: '127.0.0.1',
      MATHIX_PORT: String(port),
      MATHIX_ROOT: process.cwd(),
      MATHIX_DATA_DIR: tmpDir,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  const baseUrl = `http://127.0.0.1:${port}`;
  try {
    // Wait for server readiness
    let health = null;
    for (let i = 0; i < 40; i += 1) {
      try {
        const res = await fetch(`${baseUrl}/api/health`);
        if (res.ok) {
          health = await res.json();
          break;
        }
      } catch {
        await new Promise((r) => setTimeout(r, 75));
      }
    }
    assert.ok(health, 'Rust server did not respond to /api/health');
    assert.equal(health.ok, true);
    assert.equal(health.backend, 'rust');
    assert.ok(health.engines?.math?.includes('1.5.0'));
    assert.ok(health.engines?.json?.includes('1.7.0'));

    // Test server-side CRDT lossless merge on /api/sync
    const sync1 = await fetch(`${baseUrl}/api/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        namespaces: {
          'progress-revision': { '2bac::suites': { sheets: { f1: 40, f2: 80 }, blanks: { f1: ['a'] }, lastActiveAt: 100 } },
        },
      }),
    });
    assert.equal(sync1.status, 200);

    const sync2 = await fetch(`${baseUrl}/api/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        namespaces: {
          'progress-revision': { '2bac::suites': { sheets: { f1: 90, f2: 20 }, blanks: { f1: ['b'] }, lastActiveAt: 200 } },
        },
      }),
    });
    assert.equal(sync2.status, 200);
    const snap = await sync2.json();
    const merged = snap.namespaces['progress-revision'].local['2bac::suites'];
    assert.equal(merged.sheets.f1, 90);
    assert.equal(merged.sheets.f2, 80);
    assert.deepEqual(merged.blanks.f1.sort(), ['a', 'b']);

    // Test direct in-process Rust audit endpoint
    const auditRes = await fetch(`${baseUrl}/api/rust/audit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'test.json',
        doc: { header: { title: 'Test' }, sections: [{ id: 's1', type: 'definition', title: 'Déf', content: 'Soit $x \\in \\R$.' }] },
      }),
    });
    assert.equal(auditRes.status, 200);
    const audit = await auditRes.json();
    assert.equal(audit.ok, true);
    assert.equal(audit.kind, 'revision');

    // Test path traversal protection (note: fetch normalizes /.. so send raw path via %2e%2e)
    const travRes = await fetch(`${baseUrl}/%2e%2e/etc/passwd`);
    assert.ok(travRes.status === 403 || travRes.status === 404, `expected 403/404 for traversal, got ${travRes.status}`);

    // Verify atomic persistence wrote db.json
    assert.ok(fs.existsSync(dbPath), 'Rust server should persist store atomically to dbPath');
  } finally {
    child.kill('SIGTERM');
    await new Promise((r) => setTimeout(r, 120));
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});



