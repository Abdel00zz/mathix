import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const kMod = { exports: {} };
vm.runInNewContext(fs.readFileSync(path.resolve('vendor/katex/katex.min.js'), 'utf8'), {
  module: kMod,
  exports: kMod.exports,
  console,
});
const katex = kMod.exports;

const DIR = path.resolve('public/data/2eme-bac-sc-math/problemes');
const INDEX_PATH = path.join(DIR, 'index.json');
const indexData = JSON.parse(fs.readFileSync(INDEX_PATH, 'utf8'));

// The 35 PDF-sourced problem files (Problème 1.1 through 1.35)
const PDF_FILES = [
  'prob_fleche.json', 'prob_empreintes.json', 'prob_lacet.json', 'prob_mille_feuille.json',
  'prob_materiau_enroule.json', 'prob_phares.json', 'prob_drones.json', 'prob_robots.json',
  'prob_planeur.json', 'prob_poissons.json', 'prob_population.json', 'prob_virus.json',
  'prob_temperature.json', 'prob_pascal_fermat.json', 'prob_vote.json', 'prob_dictionnaire.json',
  'prob_sudoku.json', 'prob_racine_carree.json', 'prob_base_douze.json', 'prob_toiture.json',
  'prob_boite.json', 'prob_tirant_eau.json', 'prob_contenants.json', 'prob_empilement.json',
  'prob_meridien.json', 'prob_terre_lune.json', 'prob_bitcoin.json', 'prob_emprunt.json',
  'prob_impots.json', 'prob_voiture.json', 'prob_nicomaque.json', 'prob_euler.json',
  'prob_menelaus.json', 'prob_buffon.json', 'prob_benford.json',
];

const VALID_BLOCK_TYPES = new Set([
  'intro', 'text', 'definition', 'theorem', 'proposition', 'lemma', 'corollary',
  'consequence', 'property', 'method', 'technique', 'strategy', 'proof', 'example',
  'counterexample', 'remark', 'warning', 'tip', 'recall', 'rappel', 'summary',
  'keypoint', 'intuition', 'algorithm', 'checklist', 'application', 'problem',
  'hint', 'solution', 'exploration', 'objectif', 'conclusion', 'convention',
  'notation', 'vocabulaire', 'culture', 'erreur', 'savoir', 'historique',
]);

function checkBalancedBracesForMacro(text, macro) {
  let idx = 0;
  while ((idx = text.indexOf(macro, idx)) !== -1) {
    const after = idx + macro.length;
    if (text[after] !== '{') { idx = after; continue; }
    let depth = 0;
    let closed = false;
    for (let i = after; i < text.length; i++) {
      if (text[i] === '\\') { i++; continue; }
      if (text[i] === '{') depth++;
      else if (text[i] === '}') {
        depth--;
        if (depth === 0) { closed = true; idx = i + 1; break; }
      }
    }
    if (!closed) return false;
  }
  return true;
}

function extractMathSegments(text) {
  const segs = [];
  let i = 0;
  while (i < text.length) {
    if (text[i] === '\\' && text[i + 1] === '$') { i += 2; continue; }
    if (text[i] === '$' && text[i + 1] === '$') {
      const end = text.indexOf('$$', i + 2);
      assert.ok(end !== -1, `Unclosed $$ in: ${text.slice(i, i + 80)}`);
      segs.push({ display: true, tex: text.slice(i + 2, end) });
      i = end + 2;
      continue;
    }
    if (text[i] === '$') {
      const end = text.indexOf('$', i + 1);
      assert.ok(end !== -1, `Unclosed $ in: ${text.slice(i, i + 80)}`);
      segs.push({ display: false, tex: text.slice(i + 1, end) });
      i = end + 1;
      continue;
    }
    i++;
  }
  return segs;
}

test('index.json maps all 35 PDF problems with matching titles, subtitles, and valid themes', () => {
  const validThemes = new Set((indexData.themes ?? []).map((t) => t.id));
  const byFile = new Map((indexData.problemes ?? []).map((it) => [path.basename(it.path), it]));
  assert.equal(PDF_FILES.length, 35);
  for (let i = 0; i < PDF_FILES.length; i++) {
    const file = PDF_FILES[i];
    const entry = byFile.get(file);
    assert.ok(entry, `Missing index.json entry for ${file}`);
    assert.ok(validThemes.has(entry.theme), `Invalid theme "${entry.theme}" for ${file}`);
    const data = JSON.parse(fs.readFileSync(path.join(DIR, file), 'utf8'));
    assert.equal(data.header.title, entry.title, `Title mismatch for ${file}`);
    assert.equal(data.header.subtitle, entry.subtitle, `Subtitle mismatch for ${file}`);
    assert.ok(
      data.header.subtitle.startsWith(`Problème 1.${i + 1} `),
      `Expected subtitle starting with "Problème 1.${i + 1} " in ${file}, got "${data.header.subtitle}"`
    );
  }
});

test('all 35 PDF problems have complete pedagogical A-to-Z structure and valid schema', () => {
  for (const file of PDF_FILES) {
    const data = JSON.parse(fs.readFileSync(path.join(DIR, file), 'utf8'));
    assert.ok(data.header?.title?.length > 2, `${file}: missing header.title`);
    assert.ok(data.header?.subtitle?.length > 5, `${file}: missing header.subtitle`);
    assert.ok(Array.isArray(data.sections) && data.sections.length >= 3, `${file}: expected >= 3 sections`);

    const types = new Set();
    let blankCount = 0;
    let totalChars = 0;

    for (const sec of data.sections) {
      assert.ok(sec.id && typeof sec.id === 'string', `${file}: missing section.id`);
      assert.ok(Array.isArray(sec.blocks) && sec.blocks.length > 0, `${file}:${sec.id}: empty blocks`);
      for (const blk of sec.blocks) {
        assert.ok(VALID_BLOCK_TYPES.has(blk.type), `${file}:${sec.id}: invalid block type "${blk.type}"`);
        assert.ok(typeof blk.content === 'string' && blk.content.trim().length > 10, `${file}:${sec.id}: empty block content`);
        types.add(blk.type);
        totalChars += blk.content.length;
        blankCount += (blk.content.match(/\\blank\{/g) || []).length;

        // No draft/informal English leftovers
        assert.doesNotMatch(blk.content, /\bwait\b/i, `${file}:${sec.id}: draft word "wait" found`);
        assert.doesNotMatch(blk.content, /\(Note\s*:/i, `${file}:${sec.id}: draft "(Note :" aside found`);
        assert.doesNotMatch(blk.content, /\\begin\{tabular\}/, `${file}:${sec.id}: unsupported tabular environment`);

        // Balanced braces on key macros
        assert.ok(checkBalancedBracesForMacro(blk.content, '\\blank'), `${file}:${sec.id}: unbalanced \\blank{}`);
        assert.ok(checkBalancedBracesForMacro(blk.content, '\\textbf'), `${file}:${sec.id}: unbalanced \\textbf{}`);
        assert.ok(checkBalancedBracesForMacro(blk.content, '\\textit'), `${file}:${sec.id}: unbalanced \\textit{}`);

        // Balanced enumerate/itemize environments
        const openEnum = (blk.content.match(/\\begin\{enumerate\}/g) || []).length;
        const closeEnum = (blk.content.match(/\\end\{enumerate\}/g) || []).length;
        assert.equal(openEnum, closeEnum, `${file}:${sec.id}: unbalanced enumerate`);
        const openItem = (blk.content.match(/\\begin\{itemize\}/g) || []).length;
        const closeItem = (blk.content.match(/\\end\{itemize\}/g) || []).length;
        assert.equal(openItem, closeItem, `${file}:${sec.id}: unbalanced itemize`);
      }
    }

    assert.ok(types.has('problem'), `${file}: missing problem block`);
    assert.ok(types.has('hint'), `${file}: missing hint block`);
    assert.ok(types.has('solution'), `${file}: missing solution block`);
    assert.ok(types.has('summary'), `${file}: missing summary block`);
    assert.ok(types.has('historique') || types.has('culture'), `${file}: missing historique/culture block`);
    assert.ok(blankCount >= 2, `${file}: expected >= 2 interactive \\blank{} reveals, found ${blankCount}`);
    assert.ok(totalChars >= 3500, `${file}: content too short (${totalChars} chars)`);
  }
});

test('every inline $...$ and display $$...$$ formula in all 35 files compiles cleanly with KaTeX', () => {
  let formulaCount = 0;
  for (const file of PDF_FILES) {
    const data = JSON.parse(fs.readFileSync(path.join(DIR, file), 'utf8'));
    const allStrings = [data.header.title, data.header.subtitle];
    for (const sec of data.sections) {
      if (sec.title) allStrings.push(sec.title);
      for (const blk of sec.blocks) {
        if (blk.title) allStrings.push(blk.title);
        allStrings.push(blk.content);
      }
    }
    for (const s of allStrings) {
      const segs = extractMathSegments(s);
      for (const { display, tex } of segs) {
        formulaCount++;
        const html = katex.renderToString(tex, {
          displayMode: display,
          throwOnError: true,
          strict: false,
          trust: true,
        });
        assert.ok(html.includes('katex'), `${file}: KaTeX failed on ${tex}`);
      }
    }
  }
  assert.ok(formulaCount > 1500, `Expected >1500 formulas verified, got ${formulaCount}`);
});
