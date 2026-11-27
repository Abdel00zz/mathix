/**
 * assets/js/firebase-client.js — Authentification Google (élèves uniquement) &
 * lecture/écriture directe Cloud Firestore (`firebase-firestore-lite` v11).
 *
 * Optimisations Spark Free Tier (0 $/mois) & haute scalabilité :
 *  - Chargé paresseusement UNIQUEMENT côté élève (`!IS_ADMIN`) : la console `/admin/`
 *    conserve exclusivement son authentification serveur par code d'accès.
 *  - Utilise `firebase-firestore-lite` (REST pur sans WebChannel ouvert en continu) :
 *    empreinte réseau minimale, zéro connexion persistante inutile, scalabilité illimitée.
 *  - Coalescence d'écriture (3,5 s) + déduplication par empreinte JSON canonique :
 *    zéro écriture Firestore redondante si la progression n'a pas changé.
 *  - Fusion CRDT monotone locale ↔ Firestore à la connexion Google : un élève ayant
 *    commencé hors ligne ne perd jamais son travail en se connectant.
 */

const FB_CDN = 'https://www.gstatic.com/firebasejs/11.4.0';

export const FIREBASE_CONFIG = {
  apiKey: 'AIzaSyCLvv5KNn_tHtQhNlF6IqKHY40-jXeyi48',
  authDomain: 'mathix-5a799.firebaseapp.com',
  projectId: 'mathix-5a799',
  storageBucket: 'mathix-5a799.firebasestorage.app',
  messagingSenderId: '335465310291',
  appId: '1:335465310291:web:9a4d1b70273f5c095e7ea6',
};

const STORAGE_GOOGLE_USER = 'mathplus:google-user';
const STORAGE_RESET_AT = 'mathplus:reset-at';

let sdkPromise = null;
let authInstance = null;
let dbInstance = null;
let googleProvider = null;
let currentUser = null;
let lastWrittenHash = '';
let lastPublicFetchAt = 0;
let cachedPublicDoc = null;
let directWriteTimer = null;

function isPlainObj(v) {
  return Boolean(v && typeof v === 'object' && !Array.isArray(v));
}

function clampStr(v, maxLen) {
  return typeof v === 'string' ? v.trim().slice(0, maxLen) : '';
}

/** Purifie récursivement un objet pour Firestore (aucun `undefined`, clés bornées). */
function sanitizeMapForFirestore(raw, maxTopKeys = 120) {
  if (!isPlainObj(raw)) return {};
  let clean;
  try {
    clean = JSON.parse(JSON.stringify(raw));
  } catch {
    return {};
  }
  if (!isPlainObj(clean)) return {};
  const entries = Object.entries(clean).filter(
    ([k, v]) => k && k !== '__proto__' && k !== 'constructor' && k !== 'prototype' && v !== undefined
  );
  if (entries.length <= maxTopKeys) {
    return Object.fromEntries(entries);
  }
  return Object.fromEntries(entries.slice(0, maxTopKeys));
}

/** Fusion CRDT monotone côté client (identique à `api/_crdt.js`). */
function mergeStudentNamespaces(local, remote) {
  const lProf = isPlainObj(local.profile) ? local.profile : {};
  const rProf = isPlainObj(remote.profile) ? remote.profile : {};
  const mergedProfile = { ...rProf, ...lProf };
  for (const field of ['firstName', 'lastName', 'school', 'classId']) {
    if (!mergedProfile[field] && rProf[field]) mergedProfile[field] = rProf[field];
  }

  const mergeRev = (a, b) => {
    const out = { ...(isPlainObj(a) ? a : {}) };
    if (!isPlainObj(b)) return out;
    for (const [chKey, inc] of Object.entries(b)) {
      if (!isPlainObj(inc)) continue;
      const cur = isPlainObj(out[chKey]) ? out[chKey] : {};
      const sheets = { ...(isPlainObj(cur.sheets) ? cur.sheets : {}) };
      if (isPlainObj(inc.sheets)) {
        for (const [sp, pct] of Object.entries(inc.sheets)) {
          sheets[sp] = Math.min(100, Math.max(Number(sheets[sp]) || 0, Number(pct) || 0));
        }
      }
      const blanks = { ...(isPlainObj(cur.blanks) ? cur.blanks : {}) };
      if (isPlainObj(inc.blanks)) {
        for (const [bid, rev] of Object.entries(inc.blanks)) {
          if (rev) blanks[bid] = true;
        }
      }
      out[chKey] = {
        ...cur,
        ...inc,
        sheets,
        blanks,
        lastActiveAt: Math.max(Number(cur.lastActiveAt) || 0, Number(inc.lastActiveAt) || 0),
      };
    }
    return out;
  };

  const mergeQuiz = (a, b) => {
    const out = { ...(isPlainObj(a) ? a : {}) };
    if (!isPlainObj(b)) return out;
    for (const [chKey, inc] of Object.entries(b)) {
      if (!isPlainObj(inc)) continue;
      const cur = isPlainObj(out[chKey]) ? out[chKey] : {};
      const seen = new Map();
      for (const h of [...(Array.isArray(cur.history) ? cur.history : []), ...(Array.isArray(inc.history) ? inc.history : [])]) {
        if (!isPlainObj(h)) continue;
        const k = `${Number(h.at) || 0}:${Number(h.score) || 0}:${Number(h.total) || 0}`;
        if (!seen.has(k)) seen.set(k, h);
      }
      const history = Array.from(seen.values())
        .sort((x, y) => (Number(x.at) || 0) - (Number(y.at) || 0))
        .slice(-20);
      out[chKey] = {
        ...cur,
        ...inc,
        answeredPct: Math.min(100, Math.max(Number(cur.answeredPct) || 0, Number(inc.answeredPct) || 0)),
        history,
        lastActiveAt: Math.max(Number(cur.lastActiveAt) || 0, Number(inc.lastActiveAt) || 0),
      };
    }
    return out;
  };

  const mergeEx = (a, b) => {
    const out = { ...(isPlainObj(a) ? a : {}) };
    if (!isPlainObj(b)) return out;
    for (const [chKey, inc] of Object.entries(b)) {
      if (!isPlainObj(inc)) continue;
      const cur = isPlainObj(out[chKey]) ? out[chKey] : {};
      const exs = { ...(isPlainObj(cur.exercises) ? cur.exercises : {}) };
      if (isPlainObj(inc.exercises)) {
        for (const [exId, exInc] of Object.entries(inc.exercises)) {
          if (!isPlainObj(exInc)) continue;
          const exCur = isPlainObj(exs[exId]) ? exs[exId] : {};
          const curAt = Number(exCur.lastActiveAt) || 0;
          const incAt = Number(exInc.lastActiveAt) || 0;
          exs[exId] = incAt >= curAt ? { ...exCur, ...exInc } : { ...exInc, ...exCur };
        }
      }
      out[chKey] = {
        ...cur,
        ...inc,
        exercises: exs,
        lastActiveAt: Math.max(Number(cur.lastActiveAt) || 0, Number(inc.lastActiveAt) || 0),
      };
    }
    return out;
  };

  const mergeCore = (a, b) => {
    const cur = isPlainObj(a) ? a : {};
    const inc = isPlainObj(b) ? b : {};
    const sticky = { ...(isPlainObj(cur.sticky) ? cur.sticky : {}) };
    if (isPlainObj(inc.sticky)) {
      for (const [ck, stages] of Object.entries(inc.sticky)) {
        if (!isPlainObj(stages)) continue;
        sticky[ck] = {
          ...(isPlainObj(sticky[ck]) ? sticky[ck] : {}),
          ...(stages.quiz ? { quiz: true } : {}),
          ...(stages.exercises ? { exercises: true } : {}),
        };
      }
    }
    const masteredSkills = { ...(isPlainObj(cur.masteredSkills) ? cur.masteredSkills : {}) };
    if (isPlainObj(inc.masteredSkills)) {
      for (const [cid, arr] of Object.entries(inc.masteredSkills)) {
        const s = new Set([
          ...(Array.isArray(masteredSkills[cid]) ? masteredSkills[cid] : []),
          ...(Array.isArray(arr) ? arr : []),
        ]);
        masteredSkills[cid] = Array.from(s);
      }
    }
    const concours = { ...(isPlainObj(cur.concours) ? cur.concours : {}) };
    if (isPlainObj(inc.concours)) {
      for (const [sid, modes] of Object.entries(inc.concours)) {
        if (!isPlainObj(modes)) continue;
        const cModes = { ...(isPlainObj(concours[sid]) ? concours[sid] : {}) };
        for (const [m, mInc] of Object.entries(modes)) {
          if (!isPlainObj(mInc)) continue;
          const mCur = isPlainObj(cModes[m]) ? cModes[m] : {};
          cModes[m] = {
            attempts: Math.max(Number(mCur.attempts) || 0, Number(mInc.attempts) || 0),
            bestPct: Math.min(100, Math.max(Number(mCur.bestPct) || 0, Number(mInc.bestPct) || 0)),
            lastAt: Math.max(Number(mCur.lastAt) || 0, Number(mInc.lastAt) || 0),
          };
        }
        concours[sid] = cModes;
      }
    }
    return { ...cur, ...inc, sticky, masteredSkills, concours };
  };

  return {
    profile: mergedProfile,
    progressRevision: mergeRev(remote.progressRevision, local.progressRevision),
    progressQuiz: mergeQuiz(remote.progressQuiz, local.progressQuiz),
    progressExercises: mergeEx(remote.progressExercises, local.progressExercises),
    progressCore: mergeCore(remote.progressCore, local.progressCore),
  };
}

function buildClientSummary(uid, user, state, updatedAt) {
  const prof = isPlainObj(state.profile) ? state.profile : {};
  const rev = isPlainObj(state.progressRevision) ? state.progressRevision : {};
  const qz = isPlainObj(state.progressQuiz) ? state.progressQuiz : {};
  const ex = isPlainObj(state.progressExercises) ? state.progressExercises : {};
  const core = isPlainObj(state.progressCore) ? state.progressCore : {};

  const chapters = new Set([...Object.keys(rev), ...Object.keys(qz), ...Object.keys(ex)]);
  let blanksCount = 0;
  for (const r of Object.values(rev)) {
    if (isPlainObj(r?.blanks)) blanksCount += Object.keys(r.blanks).length;
  }
  let quizAttempts = 0;
  for (const q of Object.values(qz)) {
    if (Array.isArray(q?.history)) quizAttempts += q.history.length;
  }
  let exercisesDone = 0;
  for (const e of Object.values(ex)) {
    if (isPlainObj(e?.exercises)) {
      exercisesDone += Object.values(e.exercises).filter((it) => typeof it?.evaluated === 'string').length;
    }
  }
  let cadreMastered = 0;
  if (isPlainObj(core.masteredSkills)) {
    for (const arr of Object.values(core.masteredSkills)) {
      if (Array.isArray(arr)) cadreMastered += arr.length;
    }
  }

  const fullName = `${prof.firstName || ''} ${prof.lastName || ''}`.trim() || user?.displayName || 'Élève Google';
  return sanitizeMapForFirestore(
    {
      studentId: uid,
      name: clampStr(fullName, 80) || 'Élève Google',
      email: clampStr(user?.email || '', 160),
      photoURL: clampStr(user?.photoURL || '', 512),
      authProvider: 'google',
      classId: clampStr(prof.classId || '', 48),
      school: clampStr(prof.school || '', 80),
      chaptersCount: chapters.size,
      blanksCount,
      quizAttempts,
      exercisesDone,
      cadreMastered,
      lastActiveAt: updatedAt,
    },
    25
  );
}

function readLocalStudentState() {
  const parseKey = (k) => {
    try {
      const raw = localStorage.getItem(k);
      const parsed = raw ? JSON.parse(raw) : {};
      return isPlainObj(parsed) ? parsed : {};
    } catch {
      return {};
    }
  };
  let resetAt = 0;
  try {
    resetAt = Math.max(0, Math.trunc(Number(localStorage.getItem(STORAGE_RESET_AT)) || 0));
  } catch {}
  return {
    resetAt,
    profile: parseKey('mathplus:profile'),
    progressRevision: parseKey('mathplus:progress:revision'),
    progressQuiz: parseKey('mathplus:progress:quiz'),
    progressExercises: parseKey('mathplus:progress:exercises'),
    progressCore: parseKey('mathplus:progress:core'),
  };
}

async function ensureFirebaseSdk() {
  if (sdkPromise) return sdkPromise;
  sdkPromise = (async () => {
    const [appMod, authMod, fsMod] = await Promise.all([
      import(`${FB_CDN}/firebase-app.js`),
      import(`${FB_CDN}/firebase-auth.js`),
      import(`${FB_CDN}/firebase-firestore-lite.js`),
    ]);
    const app = appMod.getApps().length ? appMod.getApp() : appMod.initializeApp(FIREBASE_CONFIG);
    authInstance = authMod.getAuth(app);
    authInstance.languageCode = 'fr';
    dbInstance = fsMod.getFirestore(app);
    googleProvider = new authMod.GoogleAuthProvider();
    googleProvider.setCustomParameters({ prompt: 'select_account' });
    return { appMod, authMod, fsMod, auth: authInstance, db: dbInstance, provider: googleProvider };
  })();
  return sdkPromise;
}

export function getCachedGoogleUser() {
  try {
    const raw = localStorage.getItem(STORAGE_GOOGLE_USER);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed.uid === 'string' && parsed.uid ? parsed : null;
  } catch {
    return null;
  }
}

function persistCachedGoogleUser(u) {
  try {
    if (!u) localStorage.removeItem(STORAGE_GOOGLE_USER);
    else localStorage.setItem(STORAGE_GOOGLE_USER, JSON.stringify(u));
  } catch {}
}

export async function getFreshFirebaseIdToken() {
  if (!currentUser) return '';
  try {
    return await currentUser.getIdToken(false);
  } catch {
    return '';
  }
}

export function getActiveGoogleUid() {
  return currentUser?.uid || '';
}

/** Lecture directe de `/platform/public` dans Cloud Firestore (cache client 45 s). */
export async function readPublicPlatformDirect({ force = false } = {}) {
  const now = Date.now();
  if (!force && cachedPublicDoc && now - lastPublicFetchAt < 45_000) {
    return cachedPublicDoc;
  }
  try {
    const { fsMod, db } = await ensureFirebaseSdk();
    const snap = await fsMod.getDoc(fsMod.doc(db, 'platform', 'public'));
    lastPublicFetchAt = Date.now();
    if (!snap.exists()) {
      cachedPublicDoc = { exists: false, pubRev: 0, overrides: {}, config: {} };
      return cachedPublicDoc;
    }
    const d = snap.data() || {};
    cachedPublicDoc = {
      exists: true,
      pubRev: Number(d.pubRev) || 1,
      overrides: isPlainObj(d.overrides) ? d.overrides : {},
      config: isPlainObj(d.config) ? d.config : {},
    };
    return cachedPublicDoc;
  } catch {
    return cachedPublicDoc;
  }
}

/** Écriture directe et dédupliquée de `/students/{uid}` dans Cloud Firestore. */
export async function writeStudentFirestoreDirect({ stRevHint = 0, force = false, reset = false } = {}) {
  if (!currentUser?.uid) return null;
  try {
    const { fsMod, db } = await ensureFirebaseSdk();
    const uid = currentUser.uid;
    const now = Math.trunc(Date.now());
    const local = readLocalStudentState();

    if (reset) {
      local.resetAt = now;
      local.progressRevision = {};
      local.progressQuiz = {};
      local.progressExercises = {};
      local.progressCore = {};
      try {
        localStorage.setItem(STORAGE_RESET_AT, String(now));
      } catch {}
    }

    const cleanState = {
      profile: sanitizeMapForFirestore(local.profile, 20),
      progressRevision: sanitizeMapForFirestore(local.progressRevision, 120),
      progressQuiz: sanitizeMapForFirestore(local.progressQuiz, 120),
      progressExercises: sanitizeMapForFirestore(local.progressExercises, 120),
      progressCore: sanitizeMapForFirestore(local.progressCore, 20),
    };

    const stateHash = JSON.stringify({ resetAt: local.resetAt, ...cleanState });
    if (!force && !reset && stateHash === lastWrittenHash) {
      return { skipped: true };
    }

    const nextStRev = Math.max(1, Math.trunc(Number(stRevHint) || 0) + 1);
    const summary = buildClientSummary(uid, currentUser, cleanState, now);

    // Conforme à 100 % aux règles strictes `firestore.rules` (isValidStudent)
    const docPayload = {
      uid,
      email: clampStr(currentUser.email || '', 160),
      displayName: clampStr(currentUser.displayName || '', 120),
      photoURL: clampStr(currentUser.photoURL || '', 512),
      stRev: nextStRev,
      updatedAt: now,
      resetAt: Math.max(0, Math.trunc(Number(local.resetAt) || 0)),
      profile: cleanState.profile,
      progressRevision: cleanState.progressRevision,
      progressQuiz: cleanState.progressQuiz,
      progressExercises: cleanState.progressExercises,
      progressCore: cleanState.progressCore,
      summary,
    };

    await fsMod.setDoc(fsMod.doc(db, 'students', uid), docPayload);
    lastWrittenHash = stateHash;
    return { ok: true, stRev: nextStRev, doc: docPayload };
  } catch (err) {
    console.warn('[Mathix Firestore] Écriture directe élève différée :', err?.message || err);
    return null;
  }
}

export function scheduleDirectFirestoreWrite(delayMs = 3500) {
  if (!currentUser?.uid) return;
  if (directWriteTimer) clearTimeout(directWriteTimer);
  directWriteTimer = setTimeout(() => {
    directWriteTimer = null;
    writeStudentFirestoreDirect({ force: false });
  }, delayMs);
}

/** Connexion élève à la session Google : lit `students/{uid}`, fusionne en CRDT et sauvegarde. */
async function syncStudentOnSignIn(user, { onStudentMerged, onToast } = {}) {
  const { fsMod, db } = await ensureFirebaseSdk();
  const uid = user.uid;
  const local = readLocalStudentState();

  // Pré-remplit prénom / nom depuis le profil Google s'ils sont vides localement
  if (user.displayName && !local.profile.firstName && !local.profile.lastName) {
    const parts = user.displayName.trim().split(/\s+/);
    local.profile = {
      ...local.profile,
      firstName: clampStr(parts[0] || '', 60),
      lastName: clampStr(parts.slice(1).join(' ') || '', 60),
    };
  }

  let remoteDoc = null;
  try {
    const snap = await fsMod.getDoc(fsMod.doc(db, 'students', uid));
    if (snap.exists()) remoteDoc = snap.data() || null;
  } catch (err) {
    console.warn('[Mathix Firestore] Lecture initiale élève :', err?.message || err);
  }

  const pubDoc = await readPublicPlatformDirect({ force: false });

  let finalState;
  let remoteStRev = Number(remoteDoc?.stRev) || 0;
  const remoteResetAt = Number(remoteDoc?.resetAt) || 0;

  if (remoteDoc && remoteResetAt > local.resetAt && local.resetAt > 0) {
    // Un reset plus récent a eu lieu sur un autre appareil
    finalState = {
      profile: { ...local.profile, ...(isPlainObj(remoteDoc.profile) ? remoteDoc.profile : {}) },
      progressRevision: isPlainObj(remoteDoc.progressRevision) ? remoteDoc.progressRevision : {},
      progressQuiz: isPlainObj(remoteDoc.progressQuiz) ? remoteDoc.progressQuiz : {},
      progressExercises: isPlainObj(remoteDoc.progressExercises) ? remoteDoc.progressExercises : {},
      progressCore: isPlainObj(remoteDoc.progressCore) ? remoteDoc.progressCore : {},
    };
  } else if (remoteDoc) {
    finalState = mergeStudentNamespaces(local, remoteDoc);
  } else {
    finalState = {
      profile: local.profile,
      progressRevision: local.progressRevision,
      progressQuiz: local.progressQuiz,
      progressExercises: local.progressExercises,
      progressCore: local.progressCore,
    };
  }

  if (typeof onStudentMerged === 'function') {
    onStudentMerged({
      stRev: remoteStRev,
      pubRev: pubDoc?.pubRev || 0,
      overrides: pubDoc?.exists ? pubDoc.overrides : undefined,
      config: pubDoc?.exists ? pubDoc.config : undefined,
      student: {
        uid,
        email: user.email || '',
        displayName: user.displayName || '',
        photoURL: user.photoURL || '',
        stRev: remoteStRev,
        profile: finalState.profile,
        'progress-revision': finalState.progressRevision,
        'progress-quiz': finalState.progressQuiz,
        'progress-exercises': finalState.progressExercises,
        'progress-core': finalState.progressCore,
      },
    });
  }

  // Persiste l'état unifié dans Cloud Firestore si nouveau compte ou données locales enrichies
  const remoteHash = remoteDoc
    ? JSON.stringify({
        resetAt: remoteResetAt,
        profile: sanitizeMapForFirestore(remoteDoc.profile, 20),
        progressRevision: sanitizeMapForFirestore(remoteDoc.progressRevision, 120),
        progressQuiz: sanitizeMapForFirestore(remoteDoc.progressQuiz, 120),
        progressExercises: sanitizeMapForFirestore(remoteDoc.progressExercises, 120),
        progressCore: sanitizeMapForFirestore(remoteDoc.progressCore, 20),
      })
    : '';
  const mergedHash = JSON.stringify({
    resetAt: Math.max(local.resetAt, remoteResetAt),
    profile: sanitizeMapForFirestore(finalState.profile, 20),
    progressRevision: sanitizeMapForFirestore(finalState.progressRevision, 120),
    progressQuiz: sanitizeMapForFirestore(finalState.progressQuiz, 120),
    progressExercises: sanitizeMapForFirestore(finalState.progressExercises, 120),
    progressCore: sanitizeMapForFirestore(finalState.progressCore, 20),
  });

  if (!remoteDoc || remoteHash !== mergedHash) {
    await writeStudentFirestoreDirect({ stRevHint: remoteStRev, force: true });
  } else {
    lastWrittenHash = mergedHash;
  }

  if (typeof onToast === 'function' && sessionStorage.getItem('mathplus:just-signed-in') === '1') {
    sessionStorage.removeItem('mathplus:just-signed-in');
    const label = user.displayName || user.email || 'Google';
    onToast(`Connecté avec Google (${label}) · Firestore synchronisé`, 'ok');
  }
}

export async function triggerGoogleSignIn({ onToast } = {}) {
  try {
    const { authMod, auth, provider } = await ensureFirebaseSdk();
    sessionStorage.setItem('mathplus:just-signed-in', '1');
    await authMod.signInWithPopup(auth, provider);
    return true;
  } catch (err) {
    const code = String(err?.code || '');
    if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
      sessionStorage.removeItem('mathplus:just-signed-in');
      return false;
    }
    if (code === 'auth/popup-blocked' || code === 'auth/operation-not-supported-in-this-environment') {
      try {
        const { authMod, auth, provider } = await ensureFirebaseSdk();
        await authMod.signInWithRedirect(auth, provider);
        return true;
      } catch {}
    }
    sessionStorage.removeItem('mathplus:just-signed-in');
    if (typeof onToast === 'function') {
      onToast(
        code === 'auth/unauthorized-domain'
          ? 'Ajoutez ce domaine aux domaines autorisés dans Firebase Console → Authentication'
          : 'Connexion Google interrompue. Vérifiez votre connexion.',
        'warn'
      );
    }
    return false;
  }
}

export async function triggerGoogleSignOut({ onToast } = {}) {
  try {
    const { authMod, auth } = await ensureFirebaseSdk();
    if (directWriteTimer) {
      clearTimeout(directWriteTimer);
      directWriteTimer = null;
      await writeStudentFirestoreDirect({ force: false });
    }
    await authMod.signOut(auth);
    lastWrittenHash = '';
    persistCachedGoogleUser(null);
    if (typeof onToast === 'function') {
      onToast('Déconnecté du compte Google (données locales conservées)', 'ok');
    }
    return true;
  } catch {
    return false;
  }
}

export async function initStudentFirebase({ onAuthState, onStudentMerged, onToast } = {}) {
  if (typeof window === 'undefined' || location.protocol === 'file:') return;
  try {
    const { authMod, auth } = await ensureFirebaseSdk();
    authMod.getRedirectResult(auth).catch(() => {});
    authMod.onAuthStateChanged(auth, async (user) => {
      currentUser = user || null;
      if (user) {
        const lightUser = {
          uid: user.uid,
          email: user.email || '',
          displayName: user.displayName || '',
          photoURL: user.photoURL || '',
        };
        persistCachedGoogleUser(lightUser);
        if (typeof onAuthState === 'function') onAuthState(lightUser);
        await syncStudentOnSignIn(user, { onStudentMerged, onToast });
      } else {
        persistCachedGoogleUser(null);
        if (typeof onAuthState === 'function') onAuthState(null);
      }
    });
  } catch (err) {
    console.warn('[Mathix Firebase] Mode local hors ligne actif :', err?.message || err);
  }
}
