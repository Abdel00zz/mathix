/**
 * MathFlow — Service de Contenu Hybride (Mémoire -> Réseau/CacheStorage -> Base Embarquée)
 * Compatible http(s):// et file:// sans dépendance serveur ni stubs factices.
 */
(function (global) {
  'use strict';

  if (typeof require === 'function') {
    var parts = global.MATHFLOW_DATA_PARTS || {};
    var mods = [['lexiques', 'lexiques.js'], ['manifests', 'embedded-manifests.js'],
      ['revisions', 'embedded-revisions.js'], ['practice', 'embedded-practice.js'], ['concours', 'embedded-concours.js']];
    mods.forEach(function (m) {
      try { if (!parts[m[0]] && !parts[m[0] + 'Db']) require('./data/' + m[1]); } catch (e) {}
    });
  }

  var CACHE_NAME = 'mathflow-student-content-v3';
  var DEFAULT_CLASS_ID = '2eme-bac-sc-ex';
  var memoryCache = new Map();
  var inFlight = new Map();
  var EMBEDDED_DB = {};

  function syncEmbeddedDb() {
    var p = global.MATHFLOW_DATA_PARTS || {};
    Object.assign(EMBEDDED_DB, p.manifests || p.manifestsDb || {}, p.revisions || p.revisionsDb || {},
      p.practice || p.practiceDb || {}, p.concours || p.concoursDb || {});
    return p;
  }
  syncEmbeddedDb();

  function cleanId(val, fallback) {
    var s = String(val || fallback || '').trim().replace(/[^a-z0-9_-]/gi, '');
    return s || String(fallback || '');
  }

  function normalizePath(path) {
    if (!path) return '';
    var s = String(path).trim().split('?')[0].split('#')[0];
    s = s.replace(/^(\.\.\/)+/, '').replace(/^\.?\//, '').replace(/^(?:maquette\/)?public\//, '').replace(/^\/+/, '');
    return s && s.indexOf('data/') !== 0 ? 'data/' + s : s;
  }

  function resolveMediaUrl(src, basePath) {
    if (!src) return '';
    var s = String(src).trim();
    if (!s || /^(?:javascript|vbscript|file):/i.test(s) || /^data:(?!image\/)/i.test(s)) return '';
    if (/^(?:https?:|data:image\/|blob:|#)/i.test(s)) return s;
    if (/^(?:\.?\.?\/)?public\//i.test(s)) return './public/' + s.replace(/^(?:\.?\.?\/)?public\//i, '');
    var stripped = s.replace(/^\/+/, '');
    if (stripped.indexOf('data/') === 0 || stripped.indexOf('media/') === 0) return './public/' + stripped;
    var normBase = normalizePath(basePath);
    var idx = normBase.lastIndexOf('/');
    var dir = idx !== -1 ? normBase.slice(0, idx + 1) : 'data/';
    return './public/' + dir + s.replace(/^\.\//, '');
  }

  function resolveMediaPaths(data, sourceJsonPath) {
    (function visit(obj) {
      if (!obj || typeof obj !== 'object') return;
      if (Array.isArray(obj)) { obj.forEach(visit); return; }
      if (typeof obj.src === 'string') obj.src = resolveMediaUrl(obj.src, sourceJsonPath);
      Object.keys(obj).forEach(function (k) {
        if (obj[k] && typeof obj[k] === 'object') visit(obj[k]);
      });
    })(data);
    return data;
  }

  function normalizeLexiconEntry(lx, idx) {
    if (!lx || typeof lx !== 'object') return lx;
    var arabic = lx.arabic || lx.termAr || lx.termeAr || '';
    var variants = Array.isArray(lx.variants) ? lx.variants
      : (Array.isArray(lx.aliases) ? lx.aliases : (Array.isArray(lx.variantes) ? lx.variantes : []));
    var symbol = lx.symbol || lx.formula || lx.symbole || '';
    return {
      id: lx.id || ('lex-' + idx),
      term: lx.term || lx.termeFr || '',
      arabic: arabic,
      termAr: arabic,
      variants: variants,
      aliases: variants,
      definition: lx.definition || lx.definitionFr || lx.content || '',
      definitionAr: lx.definitionAr || '',
      symbol: symbol,
      formula: symbol,
      category: lx.category || lx.categorie || 'analyse'
    };
  }

  function syncSectionsAndBlocks(data) {
    var hasBlocks = Array.isArray(data.blocks) && data.blocks.length > 0;
    var hasSections = Array.isArray(data.sections) && data.sections.length > 0;
    if (hasBlocks && !hasSections) {
      var sections = [], cur = null, curTitle = null;
      data.blocks.forEach(function (blk) {
        if (!blk) return;
        if (blk.type === 'section') {
          curTitle = blk.title || ('Section ' + (sections.length + 1));
          cur = { id: blk.id || ('sec-' + (sections.length + 1)), title: curTitle, category: blk.category || 'course', blocks: [] };
          sections.push(cur);
        } else {
          if (!cur || (blk.section && blk.section !== curTitle)) {
            curTitle = blk.section || data.title || 'Cours';
            cur = { id: 'sec-' + (sections.length + 1), title: curTitle, category: 'course', blocks: [] };
            sections.push(cur);
          }
          cur.blocks.push(blk);
        }
      });
      data.sections = sections;
    } else if (hasSections && !hasBlocks) {
      var flat = [];
      data.sections.forEach(function (sec, si) {
        if (!sec) return;
        var secId = sec.id || ('sec-' + (si + 1));
        flat.push({ id: secId, type: 'section', title: sec.title || '', category: sec.category || 'course' });
        (sec.blocks || []).forEach(function (item, bi) {
          if (!item) return;
          if (!item.id) item.id = secId + '-b' + (bi + 1);
          flat.push(item);
        });
      });
      data.blocks = flat;
    }
  }

  function getFallbackLexique(normPath) {
    var lex = syncEmbeddedDb().lexiques || {};
    if (/continuite|limites/.test(normPath)) return lex.LEXIQUE_CONTINUITE || [];
    if (/suites/.test(normPath)) return lex.LEXIQUE_SUITES || [];
    if (/logarithm/.test(normPath)) return lex.LEXIQUE_LOGARITHMES || [];
    if (/derivation|etude/.test(normPath)) return lex.LEXIQUE_DERIVATION || [];
    return [];
  }

  function normalizePayload(normPath, data) {
    if (!data || typeof data !== 'object') return data;
    if (Array.isArray(data.chapters)) {
      data.id = data.id || data.classId || '';
      data.classId = data.classId || data.id;
      data.title = data.title || data.className || '';
      data.className = data.className || data.title;
    }
    if (data.header && typeof data.header === 'object') {
      data.title = data.title || data.header.title || '';
      data.subtitle = data.subtitle || data.header.subtitle || '';
    } else if (data.title && (Array.isArray(data.sections) || Array.isArray(data.blocks))) {
      data.header = { title: data.title, subtitle: data.subtitle || '' };
    }
    if (Array.isArray(data.blocks) || Array.isArray(data.sections)) {
      syncSectionsAndBlocks(data);
      var rawLex = Array.isArray(data.lexique) && data.lexique.length ? data.lexique : getFallbackLexique(normPath);
      data.lexique = rawLex.map(normalizeLexiconEntry);
    }
    if (Array.isArray(data.questions)) {
      data.questions = data.questions.map(function (q) {
        if (!q || typeof q !== 'object') return q;
        var prompt = q.prompt || q.question || q.text || '';
        var explanation = q.explanation || q.hint || q.correction || '';
        q.prompt = prompt;
        q.question = q.question || prompt;
        q.explanation = explanation;
        q.hint = q.hint || explanation;
        if (typeof q.answer === 'boolean' && q.isTrue === undefined) q.isTrue = q.answer;
        return q;
      });
    }
    return resolveMediaPaths(data, normPath);
  }

  function isFileOrigin() {
    return typeof location !== 'undefined' && location.protocol === 'file:';
  }

  function isHttpOrigin() {
    return typeof location !== 'undefined' && /^https?:$/i.test(location.protocol);
  }

  async function fetchFromNetworkAndCache(norm) {
    var urls = ['./public/' + norm, '../public/' + norm];
    for (var i = 0; i < urls.length; i++) {
      try {
        var resp = await fetch(urls[i], { cache: 'no-cache' });
        if (resp && resp.ok) {
          var cloned = resp.clone();
          var json = await resp.json();
          if (typeof caches !== 'undefined' && isHttpOrigin()) {
            try { var c = await caches.open(CACHE_NAME); await c.put(norm, cloned); } catch (e) {}
          }
          return normalizePayload(norm, json);
        }
      } catch (err) {}
    }
    return null;
  }

  async function loadJsonUncached(norm) {
    if (!isFileOrigin() && typeof fetch === 'function') {
      if (typeof caches !== 'undefined' && isHttpOrigin()) {
        try {
          var cache = await caches.open(CACHE_NAME);
          var cached = await cache.match(norm);
          if (cached) {
            var parsed = normalizePayload(norm, await cached.json());
            memoryCache.set(norm, parsed);
            fetchFromNetworkAndCache(norm).then(function (fresh) { if (fresh) memoryCache.set(norm, fresh); });
            return parsed;
          }
        } catch (e) {}
      }
      var netJson = await fetchFromNetworkAndCache(norm);
      if (netJson) { memoryCache.set(norm, netJson); return netJson; }
    }
    syncEmbeddedDb();
    if (EMBEDDED_DB[norm]) {
      var copy = normalizePayload(norm, JSON.parse(JSON.stringify(EMBEDDED_DB[norm])));
      memoryCache.set(norm, copy);
      return copy;
    }
    throw new Error('Contenu introuvable pour le chemin : ' + norm);
  }

  async function fetchJson(path) {
    var norm = normalizePath(path);
    if (!norm) throw new Error('Chemin JSON vide');
    if (memoryCache.has(norm)) return memoryCache.get(norm);
    if (inFlight.has(norm)) return inFlight.get(norm);
    var p = loadJsonUncached(norm).finally(function () { inFlight.delete(norm); });
    inFlight.set(norm, p);
    return p;
  }

  async function getMasterManifest() { return fetchJson('data/manifest.json'); }

  async function getClassManifest(classId) {
    var clsId = cleanId(classId, DEFAULT_CLASS_ID);
    try {
      var master = await getMasterManifest();
      var ref = (master.classes || []).find(function (c) { return c.id === clsId; });
      if (ref && ref.path) return fetchJson(ref.path);
    } catch (e) {}
    return fetchJson('data/classes/' + clsId + '.json');
  }

  async function getChapterManifest(chapterId, classId) {
    var raw = String(chapterId || '').trim();
    if (!raw) throw new Error('Identifiant de chapitre manquant');
    if (raw.indexOf('/') !== -1 || /\.json$/i.test(raw)) return fetchJson(raw);
    var clsId = cleanId(classId, DEFAULT_CLASS_ID);
    var cls = await getClassManifest(clsId);
    var ch = (cls.chapters || []).find(function (c) { return c.id === raw; });
    var target = (ch && ch.manifestPath) ? ch.manifestPath : ('data/' + clsId + '/' + cleanId(raw, '') + '/manifest.json');
    var manifest = await fetchJson(target);
    if (ch && Array.isArray(ch.revisions) && (!Array.isArray(manifest.revisions) || !manifest.revisions.length)) {
      manifest.revisions = ch.revisions.slice();
    }
    return manifest;
  }

  async function resolveChapterAsset(pathOrChapter, classId, key) {
    var raw = String(pathOrChapter || '').trim();
    if (!raw) throw new Error('Chemin de ressource manquant');
    if (raw.indexOf('/') !== -1 || /\.json$/i.test(raw)) return fetchJson(raw);
    var ch = await getChapterManifest(raw, classId);
    var items = (ch && Array.isArray(ch[key]) && ch[key]) || (key === 'quizzes' && ch && Array.isArray(ch.quiz) && ch.quiz) || [];
    if (!items.length || !items[0].path) throw new Error('Ressource absente : ' + key + ' (' + raw + ')');
    return fetchJson(items[0].path);
  }

  async function resolveIndexedAsset(pathOrId, classId, indexFn, listKey, label) {
    var raw = String(pathOrId || '').trim();
    if (!raw) throw new Error(label + ' manquant');
    if (raw.indexOf('/') !== -1 || /\.json$/i.test(raw)) return fetchJson(raw);
    var idx = await indexFn(classId);
    var hit = (idx[listKey] || []).find(function (item) { return item.id === raw; });
    if (!hit || !hit.path) throw new Error(label + ' introuvable : ' + raw);
    return fetchJson(hit.path);
  }

  async function getRevisionSheet(path, classId) { return resolveChapterAsset(path, classId, 'revisions'); }
  async function getQuiz(path, classId) { return resolveChapterAsset(path, classId, 'quizzes'); }
  async function getExercise(path, classId) { return resolveChapterAsset(path, classId, 'exercises'); }
  async function getExamensIndex(classId) { return fetchJson('data/' + cleanId(classId, DEFAULT_CLASS_ID) + '/examen/index.json'); }
  async function getProblemesIndex(classId) { return fetchJson('data/' + cleanId(classId, DEFAULT_CLASS_ID) + '/problemes/index.json'); }
  async function getExamen(pathOrId, classId) { return resolveIndexedAsset(pathOrId, classId, getExamensIndex, 'examens', 'Examen'); }
  async function getProbleme(pathOrId, classId) { return resolveIndexedAsset(pathOrId, classId, getProblemesIndex, 'problemes', 'Problème'); }
  async function getConcoursIndex() { return fetchJson('data/concours/schools.json'); }
  async function getConcoursSchoolManifest(schoolId) { return fetchJson('data/concours/' + cleanId(schoolId, 'ensa') + '/manifest.json'); }
  function clearCache() { memoryCache.clear(); inFlight.clear(); }

  var api = {
    fetchJson: fetchJson,
    getJson: fetchJson,
    getMasterManifest: getMasterManifest,
    getManifest: getMasterManifest,
    getClassManifest: getClassManifest,
    getChapterManifest: getChapterManifest,
    getRevisionSheet: getRevisionSheet,
    getQuiz: getQuiz,
    getExercise: getExercise,
    getExamensIndex: getExamensIndex,
    getExamen: getExamen,
    getProblemesIndex: getProblemesIndex,
    getProbleme: getProbleme,
    getConcoursIndex: getConcoursIndex,
    getConcoursSchoolManifest: getConcoursSchoolManifest,
    resolveMediaUrl: resolveMediaUrl,
    resolveMediaPaths: resolveMediaPaths,
    normalizePath: normalizePath,
    clearCache: clearCache,
    EMBEDDED_DB: EMBEDDED_DB
  };

  global.ContentService = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
