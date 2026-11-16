/**
 * Synchronise les données canoniques de `public/data/` vers `maquette/public/data/`
 * et génère les bases embarquées `maquette/js/data/embedded-*.js` pour le mode `file://`.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const SRC_DATA = path.join(ROOT, 'public', 'data');
const DST_DATA = path.join(ROOT, 'maquette', 'public', 'data');
const DST_EMBED = path.join(ROOT, 'maquette', 'js', 'data');
const DEFAULT_CLASSES = ['tronc-commun-sc', '1ere-bac-sc-ex', '1ere-bac-sc-math', '2eme-bac-sc-ex', '2eme-bac-sc-math'];
const SCHOOLS = ['ensa', 'ensam', 'medecine'];
const EXTRA_PROBLEMS = ['prob-euler', 'prob-benford', 'prob-pascal-fermat'];

const toPosix = (p) => p.split(path.sep).join('/');
const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const argClasses = process.argv.find((a) => a.startsWith('--classes='))?.split('=')[1];
const rawClasses = (argClasses || process.env.MAQUETTE_CLASSES || '').split(',').map((s) => s.trim()).filter(Boolean);
const CLASSES = rawClasses.length
  ? rawClasses
  : process.argv.includes('--all-classes')
    ? (readJson(path.join(SRC_DATA, 'manifest.json')).classes || [])
        .map((c) => c.id)
        .filter((id) => fs.existsSync(path.join(SRC_DATA, 'classes', `${id}.json`)) && fs.existsSync(path.join(SRC_DATA, id)))
    : DEFAULT_CLASSES;
const ensureDir = (dir) => fs.mkdirSync(dir, { recursive: true });
const writeJson = (file, data) => {
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
};

function sanitizeMediaNode(node, srcDirRel) {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    node.forEach((item) => sanitizeMediaNode(item, srcDirRel));
    return;
  }
  if (node.media && typeof node.media.src === 'string') {
    const raw = node.media.src.trim();
    if (raw.endsWith('-tikz.png') && srcDirRel.startsWith('2eme-bac-sc-ex/complexes')) {
      const svgCand = raw.replace(/-tikz\.png$/i, '.svg');
      if (fs.existsSync(path.join(SRC_DATA, srcDirRel, svgCand))) {
        node.media.src = svgCand;
      }
    }
    const clean = node.media.src.trim();
    const isExternal = /^(?:https?:|data:|blob:|#)/i.test(clean);
    if (!isExternal && !clean.startsWith('/media/') && !clean.startsWith('media/')) {
      const diskPath = clean.startsWith('/data/')
        ? path.join(ROOT, 'public', clean.slice(1))
        : path.join(SRC_DATA, srcDirRel, clean);
      if (!fs.existsSync(diskPath)) delete node.media;
    }
  }
  for (const key of Object.keys(node)) {
    if (key !== 'media') sanitizeMediaNode(node[key], srcDirRel);
  }
}

function shouldSkipAsset(relPosix) {
  const base = path.basename(relPosix);
  const dir = path.dirname(relPosix);
  if (relPosix.includes('/figures/tikz/') || relPosix.endsWith('.tex')) return true;
  if (relPosix.startsWith('2eme-bac-sc-ex/complexes/revisions/figures/') && /-tikz\.png$/i.test(base)) {
    return fs.existsSync(path.join(SRC_DATA, dir, base.replace(/-tikz\.png$/i, '.svg')));
  }
  if (relPosix.startsWith('2eme-bac-sc-math/mise-a-niveau/quiz/figures/') && /\.(png|jpe?g)$/i.test(base)) {
    return fs.existsSync(path.join(SRC_DATA, dir, base.replace(/\.(png|jpe?g)$/i, '.svg')));
  }
  return false;
}

function syncTree(relDir, classManifestMap) {
  const srcRoot = path.join(SRC_DATA, relDir);
  if (!fs.existsSync(srcRoot)) return;
  for (const entry of fs.readdirSync(srcRoot, { withFileTypes: true })) {
    const relPosix = toPosix(path.join(relDir, entry.name));
    if (entry.isDirectory()) {
      if (entry.name === 'tikz') continue;
      syncTree(relPosix, classManifestMap);
      continue;
    }
    if (shouldSkipAsset(relPosix)) continue;
    const srcFile = path.join(SRC_DATA, relPosix);
    const dstFile = path.join(DST_DATA, relPosix);
    if (!entry.name.endsWith('.json')) {
      ensureDir(path.dirname(dstFile));
      fs.copyFileSync(srcFile, dstFile);
      continue;
    }
    const data = readJson(srcFile);
    sanitizeMediaNode(data, toPosix(path.dirname(relPosix)));
    const mMatch = relPosix.match(/^([^/]+)\/mise-a-niveau\/manifest\.json$/);
    if (mMatch && (!Array.isArray(data.revisions) || data.revisions.length === 0)) {
      const ch = classManifestMap[mMatch[1]]?.chapters?.find((c) => c.id === 'mise-a-niveau');
      if (ch && Array.isArray(ch.revisions)) data.revisions = ch.revisions;
    }
    writeJson(dstFile, data);
  }
}

function syncClassManifests() {
  const classManifestMap = {};
  for (const clsId of CLASSES) {
    const data = readJson(path.join(SRC_DATA, 'classes', `${clsId}.json`));
    data.classId = data.classId || data.id || clsId;
    data.className = data.className || data.title || clsId;
    classManifestMap[clsId] = data;
    writeJson(path.join(DST_DATA, 'classes', `${clsId}.json`), data);
  }
  return classManifestMap;
}

function syncExtraProblems() {
  const srcIndex = readJson(path.join(SRC_DATA, '1ere-bac-sc-math', 'problemes', 'index.json'));
  const extras = (srcIndex.problemes || []).filter((p) => EXTRA_PROBLEMS.includes(p.id));
  for (const item of extras) {
    const rel = item.path.replace(/^data\//, '');
    const data = readJson(path.join(SRC_DATA, rel));
    sanitizeMediaNode(data, toPosix(path.dirname(rel)));
    writeJson(path.join(DST_DATA, rel), data);
  }
  const extraThemes = new Map((srcIndex.themes || []).map((t) => [t.id, t]));
  for (const clsId of CLASSES) {
    const idxPath = path.join(DST_DATA, clsId, 'problemes', 'index.json');
    if (!fs.existsSync(idxPath)) continue;
    const idxData = readJson(idxPath);
    const existingIds = new Set((idxData.problemes || []).map((p) => p.id));
    const existingThemes = new Set((idxData.themes || []).map((t) => t.id));
    for (const item of extras) {
      if (!existingIds.has(item.id)) idxData.problemes.push(item);
      if (item.theme && !existingThemes.has(item.theme) && extraThemes.has(item.theme)) {
        idxData.themes.push(extraThemes.get(item.theme));
        existingThemes.add(item.theme);
      }
    }
    writeJson(idxPath, idxData);
  }
}

function syncConcours() {
  const validPaths = new Set();
  const schoolQuestions = {};
  const schoolManifests = {};

  for (const schoolId of SCHOOLS) {
    const srcSchoolDir = path.join(SRC_DATA, 'concours', schoolId);
    const walk = (dir) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) walk(full);
        else if (e.name.endsWith('.json') && e.name !== 'manifest.json') {
          const parsed = readJson(full);
          if (Array.isArray(parsed.questions) && parsed.questions.length > 0) {
            const rel = toPosix(path.relative(SRC_DATA, full));
            validPaths.add(`data/${rel}`);
            writeJson(path.join(DST_DATA, rel), parsed);
            schoolQuestions[schoolId] = (schoolQuestions[schoolId] || 0) + parsed.questions.length;
          }
        }
      }
    };
    walk(srcSchoolDir);

    const manifest = readJson(path.join(srcSchoolDir, 'manifest.json'));
    manifest.annales = (manifest.annales || []).filter((a) => validPaths.has(a.path));
    manifest.quizzes = (manifest.quizzes || []).filter((q) => validPaths.has(q.path));
    schoolManifests[schoolId] = manifest;
    writeJson(path.join(DST_DATA, 'concours', schoolId, 'manifest.json'), manifest);
  }

  const schoolsData = readJson(path.join(SRC_DATA, 'concours', 'schools.json'));
  schoolsData.schools = (schoolsData.schools || []).map((s) => {
    const sm = schoolManifests[s.id];
    const activeThemes = new Set((sm?.quizzes || []).map((q) => q.theme).filter(Boolean));
    Object.keys(s.themeCounts || {}).forEach((t) => {
      if (s.themeCounts[t] > 0) activeThemes.add(t);
    });
    const annales = (s.annales || []).filter((a) => validPaths.has(a.path) && (a.count == null || a.count > 0));
    const fallbackQuizPaths = Array.isArray(s.fallbackQuizPaths)
      ? s.fallbackQuizPaths.filter((q) => validPaths.has(q.path))
      : undefined;
    return {
      ...s,
      themes: (s.themes || []).filter((t) => activeThemes.has(t.id)),
      annales,
      ...(fallbackQuizPaths ? { fallbackQuizPaths } : {}),
      totalQuestions: schoolQuestions[s.id] || s.totalQuestions || 0
    };
  });
  writeJson(path.join(DST_DATA, 'concours', 'schools.json'), schoolsData);
  return { schoolManifests, schoolQuestions };
}

function writeMasterManifest(classManifestMap, schoolManifests, schoolQuestions) {
  const canonical = readJson(path.join(SRC_DATA, 'manifest.json'));
  const shortNames = {
    '2eme-bac-sc-ex': '2Bac Sc. Ex', '2eme-bac-sc-math': '2Bac Sc. Math',
    '1ere-bac-sc-ex': '1Bac Sc. Ex', '1ere-bac-sc-math': '1Bac Sc. Math', 'tronc-commun-sc': 'Tronc Commun'
  };
  const classes = CLASSES.map((id) => {
    const cRef = (canonical.classes || []).find((c) => c.id === id) || {};
    const cls = classManifestMap[id];
    return {
      id,
      title: cRef.title || cls.title,
      name: cls.className || cRef.title || cls.title,
      shortName: shortNames[id] || cRef.shortName || cRef.title || cls.title || id,
      path: `data/classes/${id}.json`
    };
  });
  const concours = SCHOOLS.map((id) => {
    const sm = schoolManifests[id];
    return {
      id,
      name: sm.name || id.toUpperCase(),
      fullName: sm.fullName || sm.name || id.toUpperCase(),
      description: sm.description || '',
      manifestPath: `data/concours/${id}/manifest.json`,
      color: sm.color || '#2563eb',
      questionsPerExam: sm.questionsPerExam || 20,
      timePerQuestion: sm.timePerQuestion || 45,
      annalesCount: (sm.annales || []).length,
      quizzesCount: (sm.quizzes || []).length,
      questionsCount: schoolQuestions[id] || 0
    };
  });
  writeJson(path.join(DST_DATA, 'manifest.json'), { meta: canonical.meta || { version: '4.4' }, classes, concours });
}

function generateEmbeddedBundles() {
  ensureDir(DST_EMBED);
  const buckets = { manifests: {}, revisions: {}, practice: {}, concours: {} };
  const walkDst = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walkDst(full);
      else if (e.name.endsWith('.json')) {
        const key = `data/${toPosix(path.relative(DST_DATA, full))}`;
        const val = readJson(full);
        if (
          key === 'data/manifest.json' ||
          key.startsWith('data/classes/') ||
          key.endsWith('/manifest.json') ||
          key.endsWith('/index.json') ||
          key === 'data/concours/schools.json'
        ) buckets.manifests[key] = val;
        else if (key.startsWith('data/concours/')) buckets.concours[key] = val;
        else if (key.includes('/revisions/') || key.includes('/problemes/') || key.endsWith('/cadre_referentiel.json')) {
          buckets.revisions[key] = val;
        } else buckets.practice[key] = val;
      }
    }
  };
  walkDst(DST_DATA);

  const meta = {
    manifests: ['embedded-manifests.js', 'Manifestes Programme, Chapitres & Concours', 'manifestsDb'],
    revisions: ['embedded-revisions.js', 'Fiches de Révision, Problèmes & Référentiel', 'revisionsDb'],
    practice: ['embedded-practice.js', 'Quiz QCM, Exercices & Examens Nationaux', 'practiceDb'],
    concours: ['embedded-concours.js', 'QCM & Annales Concours Post-Bac', 'concoursDb']
  };
  for (const [part, [filename, title, alias]] of Object.entries(meta)) {
    const entries = Object.entries(buckets[part]).sort(([a], [b]) => a.localeCompare(b));
    const chunks = [];
    for (let i = 0; i < entries.length; i += 8) {
      const slice = entries.slice(i, i + 8).map(([k, v], j) => {
        const json = JSON.stringify(v).replace(/<\/script/gi, '\\u003c/script');
        const isLast = i + j === entries.length - 1;
        return `${JSON.stringify(k)}:${json}${isLast ? '' : ','}`;
      });
      chunks.push(`    ${slice.join(' ')}`);
    }
    const lines = chunks;
    const out = [
      '/**',
      ` * MathFlow — Base Embarquée : ${title}`,
      ' */',
      '(function (global) {',
      "  'use strict';",
      '  var parts = global.MATHFLOW_DATA_PARTS = global.MATHFLOW_DATA_PARTS || {};',
      `  parts.${part} = parts.${alias} = {`,
      ...lines,
      '  };',
      "})(typeof globalThis !== 'undefined' ? globalThis : window);",
      ''
    ].join('\n');
    const outPath = path.join(DST_EMBED, filename);
    fs.writeFileSync(outPath, out, 'utf8');
    console.log(`Generated ${filename}: ${entries.length} keys, ${out.split('\n').length} lines, ${Math.round(out.length / 1024)} KB`);
  }
}

fs.rmSync(DST_DATA, { recursive: true, force: true });
ensureDir(DST_DATA);
const classManifestMap = syncClassManifests();
for (const clsId of CLASSES) syncTree(clsId, classManifestMap);
syncExtraProblems();
const { schoolManifests, schoolQuestions } = syncConcours();
writeMasterManifest(classManifestMap, schoolManifests, schoolQuestions);
generateEmbeddedBundles();
console.log('Sync complete -> maquette/public/data & maquette/js/data/embedded-*.js');
