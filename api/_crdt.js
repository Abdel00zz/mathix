/**
 * api/_crdt.js — Fusion CRDT déterministe côté serveur (zéro dépendance npm)
 * + validation stricte des identifiants et agrégation des statistiques élèves.
 *
 * Aligne exactement sa sémantique sur `json_engine::exercise::op_merge_progress` :
 *   - progress-revision : max(sheets[path]), union(blanks), max(lastActiveAt)
 *   - progress-quiz     : max(answeredPct), union dédupliquée(history, cap 20), max(lastActiveAt)
 *   - progress-exercises: par exercice, max(lastActiveAt), union des drapeaux/évaluations
 *   - progress-core     : union(sticky), union(masteredSkills), max(concours attempts & bestPct)
 *   - profile           : fusion non destructive (les champs non vides prévalent, freeMode booléen)
 */

export const VALID_NS = new Set([
  'users',
  'overrides',
  'config',
  'history',
  'progress-core',
  'progress-quiz',
  'progress-exercises',
  'progress-revision',
  'profile',
]);

export const ADMIN_WRITE_NS = new Set(['users', 'overrides', 'config', 'history']);
export const ADMIN_ONLY_READ_NS = new Set(['users', 'history']);
export const PROGRESS_NS = new Set([
  'progress-core',
  'progress-quiz',
  'progress-exercises',
  'progress-revision',
]);
export const STUDENT_NS = new Set([
  'progress-core',
  'progress-quiz',
  'progress-exercises',
  'progress-revision',
  'profile',
]);

const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const KEY_RE = /^[a-zA-Z0-9_.:/-]{1,160}$/;
const STUDENT_ID_RE = /^[a-zA-Z0-9_-]{3,48}$/;

export function isPlainObject(v) {
  return Boolean(v) && typeof v === 'object' && !Array.isArray(v);
}

export function isValidKey(key) {
  return typeof key === 'string' && KEY_RE.test(key) && !FORBIDDEN_KEYS.has(key);
}

export function isValidStudentId(id) {
  return typeof id === 'string' && STUDENT_ID_RE.test(id) && !FORBIDDEN_KEYS.has(id);
}

export function sanitizeStr(val, maxLen = 200) {
  if (typeof val !== 'string') return '';
  return val.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, maxLen);
}

function safeClone(obj) {
  if (!isPlainObject(obj)) return {};
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (FORBIDDEN_KEYS.has(k)) continue;
    out[k] = v;
  }
  return out;
}

function mergeRevision(local, remote) {
  const out = safeClone(local);
  for (const [chapKey, rRec] of Object.entries(remote || {})) {
    if (FORBIDDEN_KEYS.has(chapKey) || !isPlainObject(rRec)) continue;
    const lRec = isPlainObject(out[chapKey]) ? out[chapKey] : {};

    const sheets = safeClone(lRec.sheets);
    if (isPlainObject(rRec.sheets)) {
      for (const [p, pct] of Object.entries(rRec.sheets)) {
        if (FORBIDDEN_KEYS.has(p)) continue;
        const n = Math.min(100, Math.max(0, Number(pct) || 0));
        const prev = Math.min(100, Math.max(0, Number(sheets[p]) || 0));
        sheets[p] = Math.max(prev, n);
      }
    }

    const blanks = safeClone(lRec.blanks);
    if (isPlainObject(rRec.blanks)) {
      for (const [bid, v] of Object.entries(rRec.blanks)) {
        if (FORBIDDEN_KEYS.has(bid)) continue;
        if (Array.isArray(v) || Array.isArray(blanks[bid])) {
          const set = new Set([
            ...(Array.isArray(blanks[bid]) ? blanks[bid] : []),
            ...(Array.isArray(v) ? v : []),
          ]);
          blanks[bid] = Array.from(set).slice(0, 100);
        } else if (v === true) {
          blanks[bid] = true;
        }
      }
    }

    const lastActiveAt = Math.max(Number(lRec.lastActiveAt) || 0, Number(rRec.lastActiveAt) || 0);
    out[chapKey] = { ...lRec, sheets, blanks, lastActiveAt };
  }
  return out;
}

function mergeQuiz(local, remote) {
  const out = safeClone(local);
  for (const [chapKey, rRec] of Object.entries(remote || {})) {
    if (FORBIDDEN_KEYS.has(chapKey) || !isPlainObject(rRec)) continue;
    const lRec = isPlainObject(out[chapKey]) ? out[chapKey] : {};

    const answeredPct = Math.min(
      100,
      Math.max(Number(lRec.answeredPct) || 0, Number(rRec.answeredPct) || 0)
    );

    const seen = new Set();
    const combined = [];
    for (const src of [lRec.history, rRec.history]) {
      if (!Array.isArray(src)) continue;
      for (const item of src) {
        if (!isPlainObject(item)) continue;
        const key = `${item.at ?? ''}:${item.score ?? ''}:${item.total ?? ''}`;
        if (seen.has(key)) continue;
        seen.add(key);
        combined.push({
          at: Number(item.at) || 0,
          score: Number(item.score) || 0,
          total: Number(item.total) || 0,
          pct: Math.min(100, Math.max(0, Number(item.pct) || 0)),
          durationSec: Number(item.durationSec) || 0,
        });
      }
    }
    combined.sort((a, b) => a.at - b.at);
    const history = combined.slice(-20);
    const lastActiveAt = Math.max(Number(lRec.lastActiveAt) || 0, Number(rRec.lastActiveAt) || 0);
    out[chapKey] = { ...lRec, answeredPct, history, lastActiveAt };
  }
  return out;
}

function mergeExercises(local, remote) {
  const out = safeClone(local);
  for (const [chapKey, rRec] of Object.entries(remote || {})) {
    if (FORBIDDEN_KEYS.has(chapKey) || !isPlainObject(rRec)) continue;
    const lRec = isPlainObject(out[chapKey]) ? out[chapKey] : {};
    const exercises = safeClone(lRec.exercises);
    if (isPlainObject(rRec.exercises)) {
      for (const [exId, rItem] of Object.entries(rRec.exercises)) {
        if (FORBIDDEN_KEYS.has(exId) || !isPlainObject(rItem)) continue;
        const lItem = isPlainObject(exercises[exId]) ? exercises[exId] : {};
        const lAt = Number(lItem.lastActiveAt) || 0;
        const rAt = Number(rItem.lastActiveAt) || 0;
        exercises[exId] = rAt >= lAt
          ? { ...lItem, ...rItem, lastActiveAt: Math.max(lAt, rAt) }
          : { ...rItem, ...lItem, lastActiveAt: Math.max(lAt, rAt) };
      }
    }
    const lastActiveAt = Math.max(Number(lRec.lastActiveAt) || 0, Number(rRec.lastActiveAt) || 0);
    out[chapKey] = { ...lRec, exercises, lastActiveAt };
  }
  return out;
}

function mergeCore(local, remote) {
  const out = safeClone(local);
  const r = safeClone(remote);

  // sticky unlocks (union)
  const sticky = safeClone(out.sticky);
  if (isPlainObject(r.sticky)) {
    for (const [chapKey, stages] of Object.entries(r.sticky)) {
      if (FORBIDDEN_KEYS.has(chapKey) || !isPlainObject(stages)) continue;
      const cur = safeClone(sticky[chapKey]);
      for (const [st, val] of Object.entries(stages)) {
        if (!FORBIDDEN_KEYS.has(st) && val === true) cur[st] = true;
      }
      sticky[chapKey] = cur;
    }
  }
  if (Object.keys(sticky).length) out.sticky = sticky;

  // masteredSkills & legacy cadre (union per classId)
  for (const field of ['masteredSkills', 'cadre']) {
    const mapOut = safeClone(out[field]);
    if (isPlainObject(r[field])) {
      for (const [cid, list] of Object.entries(r[field])) {
        if (FORBIDDEN_KEYS.has(cid) || !Array.isArray(list)) continue;
        const prev = Array.isArray(mapOut[cid]) ? mapOut[cid] : [];
        mapOut[cid] = Array.from(new Set([...prev, ...list.filter((x) => typeof x === 'string')])).slice(0, 300);
      }
    }
    if (Object.keys(mapOut).length) out[field] = mapOut;
  }

  // concours (max attempts, max bestPct, max lastAt)
  const concours = safeClone(out.concours);
  if (isPlainObject(r.concours)) {
    for (const [schoolId, modes] of Object.entries(r.concours)) {
      if (FORBIDDEN_KEYS.has(schoolId) || !isPlainObject(modes)) continue;
      const curSchool = safeClone(concours[schoolId]);
      for (const [mode, rec] of Object.entries(modes)) {
        if (FORBIDDEN_KEYS.has(mode) || !isPlainObject(rec)) continue;
        const prev = isPlainObject(curSchool[mode]) ? curSchool[mode] : {};
        curSchool[mode] = {
          attempts: Math.max(Number(prev.attempts) || 0, Number(rec.attempts) || 0),
          bestPct: Math.min(100, Math.max(Number(prev.bestPct) || 0, Number(rec.bestPct) || 0)),
          lastAt: Math.max(Number(prev.lastAt) || 0, Number(rec.lastAt) || 0),
        };
      }
      concours[schoolId] = curSchool;
    }
  }
  if (Object.keys(concours).length) out.concours = concours;

  return out;
}

export function mergeProgress(ns, local, remote) {
  const l = isPlainObject(local) ? local : {};
  const r = isPlainObject(remote) ? remote : {};
  switch (ns) {
    case 'progress-revision':
      return mergeRevision(l, r);
    case 'progress-quiz':
      return mergeQuiz(l, r);
    case 'progress-exercises':
      return mergeExercises(l, r);
    case 'progress-core':
      return mergeCore(l, r);
    case 'profile':
      return {
        ...l,
        ...r,
        firstName: sanitizeStr(r.firstName ?? l.firstName ?? '', 60),
        lastName: sanitizeStr(r.lastName ?? l.lastName ?? '', 60),
        school: sanitizeStr(r.school ?? l.school ?? '', 100),
      };
    default:
      return r;
  }
}

/**
 * Construit un résumé compact d'un élève pour le tableau de bord Admin (Suivi élèves).
 * Evite de transférer l'intégralité des blobs bruts de tous les élèves à la console Admin.
 */
export function summarizeStudent(studentId, record) {
  const profile = isPlainObject(record?.profile) ? record.profile : {};
  const rev = isPlainObject(record?.['progress-revision']) ? record['progress-revision'] : {};
  const quiz = isPlainObject(record?.['progress-quiz']) ? record['progress-quiz'] : {};
  const exos = isPlainObject(record?.['progress-exercises']) ? record['progress-exercises'] : {};
  const core = isPlainObject(record?.['progress-core']) ? record['progress-core'] : {};

  const chapKeys = new Set([
    ...Object.keys(rev),
    ...Object.keys(quiz),
    ...Object.keys(exos),
  ]);

  let blanksCount = 0;
  let quizAttempts = 0;
  let exercisesDone = 0;
  let lastActiveAt = Number(record?.updatedAt) || 0;
  const chapters = [];

  for (const k of chapKeys) {
    if (!k.includes('::')) continue;
    const [classId, chapterId] = k.split('::');
    const r = rev[k] || {};
    const q = quiz[k] || {};
    const e = exos[k] || {};

    const sheets = isPlainObject(r.sheets) ? Object.values(r.sheets).map((n) => Number(n) || 0) : [];
    const revPct = sheets.length ? Math.min(100, Math.max(...sheets)) : 0;
    const blanks = isPlainObject(r.blanks) ? Object.keys(r.blanks).length : 0;
    const hist = Array.isArray(q.history) ? q.history : [];
    const qBest = hist.length ? Math.max(...hist.map((h) => Number(h.pct) || 0)) : null;
    const qAns = Number(q.answeredPct) || 0;
    const exObj = isPlainObject(e.exercises) ? e.exercises : {};
    const exDone = Object.values(exObj).filter((v) => v && typeof v.evaluated === 'string').length;

    blanksCount += blanks;
    quizAttempts += hist.length;
    exercisesDone += exDone;
    lastActiveAt = Math.max(
      lastActiveAt,
      Number(r.lastActiveAt) || 0,
      Number(q.lastActiveAt) || 0,
      Number(e.lastActiveAt) || 0
    );

    const sticky = isPlainObject(core.sticky?.[k]) ? core.sticky[k] : {};
    chapters.push({
      key: k,
      classId,
      chapterId,
      revPct,
      blanks,
      quizBest: qBest,
      quizAttempts: hist.length,
      quizAnsweredPct: qAns,
      exercisesDone: exDone,
      stickyQuiz: Boolean(sticky.quiz),
      stickyExercises: Boolean(sticky.exercises),
    });
  }

  let cadreMastered = 0;
  if (isPlainObject(core.masteredSkills)) {
    for (const list of Object.values(core.masteredSkills)) {
      if (Array.isArray(list)) cadreMastered += list.length;
    }
  }

  const fullName =
    `${sanitizeStr(profile.firstName || '', 60)} ${sanitizeStr(profile.lastName || '', 60)}`.trim() ||
    sanitizeStr(record?.displayName || profile.displayName || '', 100);
  const email = sanitizeStr(record?.email || profile.email || '', 160);
  const photoURL = sanitizeStr(record?.photoURL || profile.photoURL || '', 512);

  return {
    studentId,
    name: fullName || (email ? email.split('@')[0] : `Élève ${studentId.slice(-5)}`),
    email,
    photoURL,
    authProvider: email ? 'google' : 'local',
    classId: sanitizeStr(profile.classId || '', 60),
    school: sanitizeStr(profile.school || '', 100),
    chaptersCount: chapters.length,
    blanksCount,
    quizAttempts,
    exercisesDone,
    cadreMastered,
    lastActiveAt,
    chapters: chapters.slice(0, 40),
  };
}
