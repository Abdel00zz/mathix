// Minimal browser-host shim for Mathix 100% Rust/WebAssembly frontend.
// All routing, state, rendering, LaTeX preprocessing, quiz grading, and studio logic live in Rust WASM.

import {
  getActiveGoogleUid,
  getFreshFirebaseIdToken,
  initStudentFirebase,
  readPublicPlatformDirect,
  scheduleDirectFirestoreWrite,
  triggerGoogleSignIn,
  triggerGoogleSignOut,
  writeStudentFirestoreDirect,
} from './firebase-client.js';

const enc = new TextEncoder();
const dec = new TextDecoder();

const metaScript = document.querySelector('script[data-wasm]');
const IS_ADMIN = metaScript?.dataset.admin === '1' || document.body?.dataset.v === 'admin';
const ROOT_PREFIX = IS_ADMIN ? '../' : '';
const WASM_URL = metaScript?.dataset.wasm || (IS_ADMIN ? '../engines/mathix_admin.wasm' : 'engines/mathix_app.wasm');

let wasm = null;
let MACROS = {};
let muted = false;
let timerId = null;
let ignoreHash = false;
let audioCtx = null;
let mountSeq = 0;
let activeVT = null;

// Single-flight JSON fetch deduplication & in-memory cache
const jsonCache = new Map();
const inFlightFetches = new Map();

// Bidirectional Cloud Sync & Server Auth (adminToken stays strictly in JS memory)
let adminToken = null;
let adminTokenExpiresAt = 0;
let lastSyncRev = 0;
let lastStRev = 0;
let lastPullAt = 0;
let syncPollId = null;
let pushTimerId = null;
let pullInFlight = false;
let pushInFlight = false;
const pendingNamespaces = new Map();
const pendingEvents = [];
const sentEventKeys = new Set();

const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('mathplus-sync') : null;

const STUDENT_KEY_TO_NS = {
  'mathplus:profile': 'profile',
  'mathplus:progress:revision': 'progress-revision',
  'mathplus:progress:quiz': 'progress-quiz',
  'mathplus:progress:exercises': 'progress-exercises',
  'mathplus:progress:core': 'progress-core',
};

const ADMIN_KEY_TO_NS = {
  'mathplus:overrides': 'overrides',
  'mathplus:config': 'config',
  'mathplus:admin:users': 'users',
  'mathplus:studio:history': 'history',
};

function getOrCreateStudentId() {
  const key = 'mathplus:student-id';
  try {
    const existing = localStorage.getItem(key);
    if (existing && /^[a-zA-Z0-9_-]{3,48}$/.test(existing)) return existing;
    const bytes = new Uint8Array(8);
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
      crypto.getRandomValues(bytes);
    } else {
      for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
    }
    const id = 'st-' + Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
    localStorage.setItem(key, id);
    return id;
  } catch {
    return 'st-session';
  }
}

const STUDENT_ID = IS_ADMIN ? '' : getOrCreateStudentId();

function apiUrl(path) {
  return `${ROOT_PREFIX}${path.replace(/^\/+/, '')}`;
}

function authHeaders(extra = {}) {
  const h = { ...extra };
  if (IS_ADMIN && adminToken) h.Authorization = `Bearer ${adminToken}`;
  return h;
}

async function buildStudentOrAdminHeaders(extra = {}) {
  const h = authHeaders(extra);
  if (!IS_ADMIN) {
    const fbTok = await getFreshFirebaseIdToken();
    if (fbTok) h['X-Firebase-Token'] = fbTok;
  }
  return h;
}

function queueCloudFromStorage(key, rawValue) {
  if (location.protocol === 'file:') return;
  if (key === 'mathplus:activity' && rawValue) {
    try {
      const list = JSON.parse(rawValue);
      if (Array.isArray(list) && list.length) {
        const latest = list[0];
        const expectedActor = IS_ADMIN ? 'admin' : 'eleve';
        if (latest && latest.message && (latest.actor === expectedActor || IS_ADMIN)) {
          const evKey = `${latest.at}:${latest.type}:${latest.message}`;
          if (!sentEventKeys.has(evKey)) {
            sentEventKeys.add(evKey);
            if (sentEventKeys.size > 120) {
              const first = sentEventKeys.values().next().value;
              sentEventKeys.delete(first);
            }
            pendingEvents.push(latest);
            if (pendingEvents.length > 20) pendingEvents.splice(0, pendingEvents.length - 20);
            scheduleCloudPush(IS_ADMIN ? 300 : 2800);
          }
        }
      }
    } catch {}
    return;
  }

  const map = IS_ADMIN ? ADMIN_KEY_TO_NS : STUDENT_KEY_TO_NS;
  const ns = map[key];
  if (!ns) return;
  if (IS_ADMIN && !adminToken) return;
  try {
    const parsed = rawValue ? JSON.parse(rawValue) : null;
    if (parsed !== null) {
      pendingNamespaces.set(ns, parsed);
      const urgent = ns === 'overrides' || ns === 'config' || ns === 'users';
      scheduleCloudPush(urgent ? 250 : 2800);
      if (!IS_ADMIN) {
        scheduleDirectFirestoreWrite(3500);
      }
    }
  } catch {}
}

function scheduleCloudPush(delayMs = 2800) {
  if (pushTimerId) clearTimeout(pushTimerId);
  pushTimerId = setTimeout(() => {
    pushTimerId = null;
    flushCloudPush({ keepalive: false });
  }, delayMs);
}

async function flushCloudPush({ keepalive = false } = {}) {
  if (location.protocol === 'file:') return false;
  if (IS_ADMIN && !adminToken) return false;
  if (pendingNamespaces.size === 0 && pendingEvents.length === 0) return false;
  if (pushInFlight && !keepalive) return false;

  const namespaces = Object.fromEntries(pendingNamespaces.entries());
  const events = pendingEvents.splice(0, 20);
  pendingNamespaces.clear();

  const effStudentId = getActiveGoogleUid() || STUDENT_ID;
  const body = IS_ADMIN
    ? { scope: 'admin', namespaces, events }
    : { scope: 'student', studentId: effStudentId, sincePub: lastSyncRev, namespaces, events };

  pushInFlight = true;
  try {
    const headers = await buildStudentOrAdminHeaders({ 'Content-Type': 'application/json' });
    const res = await fetch(apiUrl('api/sync'), {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      keepalive: !!keepalive,
      cache: 'no-store',
    });
    if (!res.ok) {
      if (res.status === 401 || res.status === 403) {
        if (IS_ADMIN) {
          adminToken = null;
          adminTokenExpiresAt = 0;
          send({ op: 'auth-result', ok: false, error: 'Session expirée. Reconnectez-vous.' });
        }
        return false;
      }
      throw new Error(`HTTP ${res.status}`);
    }
    const data = await res.json();
    if (typeof data.rev === 'number') lastSyncRev = Math.max(lastSyncRev, data.rev);
    if (typeof data.stRev === 'number') lastStRev = Math.max(lastStRev, data.stRev);
    if (!IS_ADMIN && (data.overrides || data.config || data.student)) {
      send({
        op: 'cloud-sync-apply',
        overrides: data.overrides,
        config: data.config,
        student: data.student,
        manual: false,
      });
    } else if (IS_ADMIN && data.changed) {
      send({
        op: 'cloud-sync-apply',
        overrides: data.overrides,
        config: data.config,
        users: data.users,
        history: data.history,
        events: data.events,
        studentsSummary: data.studentsSummary,
        manual: false,
      });
    }
    return true;
  } catch {
    // Re-queue for automatic retry on next online/sync cycle
    for (const [k, v] of Object.entries(namespaces)) {
      if (!pendingNamespaces.has(k)) pendingNamespaces.set(k, v);
    }
    for (const ev of events) {
      if (pendingEvents.length < 20) pendingEvents.push(ev);
    }
    return false;
  } finally {
    pushInFlight = false;
  }
}

async function pullCloudSync({ force = false, manual = false } = {}) {
  if (location.protocol === 'file:') {
    if (manual) showToast('Synchronisation disponible sur serveur / Vercel', 'warn');
    return;
  }
  if (IS_ADMIN && !adminToken) return;
  if (pullInFlight) return;
  const now = Date.now();
  if (!force && !manual && now - lastPullAt < 4000) return;

  pullInFlight = true;
  lastPullAt = now;
  try {
    const qs = new URLSearchParams();
    qs.set('scope', IS_ADMIN ? 'admin' : 'student');
    qs.set('since', String(force ? 0 : lastSyncRev));
    if (!IS_ADMIN) {
      qs.set('studentId', getActiveGoogleUid() || STUDENT_ID);
      qs.set('stSince', String(force ? 0 : lastStRev));
    }
    const headers = await buildStudentOrAdminHeaders();
    const res = await fetch(`${apiUrl('api/sync')}?${qs.toString()}`, {
      method: 'GET',
      headers,
      cache: 'no-store',
    });
    if (res.status === 401 || res.status === 403) {
      if (IS_ADMIN) {
        adminToken = null;
        adminTokenExpiresAt = 0;
        send({ op: 'auth-result', ok: false, error: 'Session expirée. Reconnectez-vous.' });
      }
      return;
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (typeof data.rev === 'number') lastSyncRev = Math.max(lastSyncRev, data.rev);
    if (typeof data.stRev === 'number') lastStRev = Math.max(lastStRev, data.stRev);

    if (data.changed) {
      send({
        op: 'cloud-sync-apply',
        overrides: data.overrides,
        config: data.config,
        student: data.student,
        users: data.users,
        history: data.history,
        events: data.events,
        studentsSummary: data.studentsSummary,
        manual,
      });
    } else if (manual) {
      showToast('Synchronisation Cloud à jour', 'ok');
    }
  } catch {
    if (manual) showToast('Mode hors ligne : vos données restent sauvegardées localement', 'warn');
  } finally {
    pullInFlight = false;
  }
}

async function runAuthCheck() {
  if (location.protocol === 'file:') {
    send({ op: 'auth-status', mode: 'env', claimed: true, authenticated: false });
    return;
  }
  try {
    const res = await fetch(apiUrl('api/auth'), { headers: authHeaders(), cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (typeof data.expiresAt === 'number') adminTokenExpiresAt = data.expiresAt;
    else if (!data.authenticated) adminTokenExpiresAt = 0;
    send({
      op: 'auth-status',
      mode: data.mode || 'env',
      claimed: !!data.claimed,
      authenticated: !!data.authenticated,
      expiresAt: typeof data.expiresAt === 'number' ? data.expiresAt : null,
      backend: data.backend || null,
      persistence: data.persistence || null,
    });
  } catch {
    send({ op: 'auth-status', mode: 'env', claimed: true, authenticated: false });
  }
}

async function runAuthSubmit(action, passcode) {
  try {
    const res = await fetch(apiUrl('api/auth'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: action || 'login', passcode }),
      cache: 'no-store',
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok || !data.token) {
      adminToken = null;
      adminTokenExpiresAt = 0;
      send({
        op: 'auth-result',
        ok: false,
        error: data.error || 'Code d’accès incorrect.',
        remainingAttempts: typeof data.remainingAttempts === 'number' ? data.remainingAttempts : null,
        retryAfterSec: typeof data.retryAfterSec === 'number' ? data.retryAfterSec : null,
      });
      return;
    }
    adminToken = data.token;
    adminTokenExpiresAt = typeof data.expiresAt === 'number' ? data.expiresAt : 0;
    lastSyncRev = 0;
    send({
      op: 'auth-result',
      ok: true,
      mode: data.mode || 'env',
      expiresAt: adminTokenExpiresAt || null,
      backend: data.backend || null,
      persistence: data.persistence || null,
    });
    startCloudHeartbeat();
  } catch {
    adminToken = null;
    adminTokenExpiresAt = 0;
    send({ op: 'auth-result', ok: false, error: 'Serveur d’authentification inaccessible.' });
  }
}

async function runAuthRefresh(manual = false) {
  if (!IS_ADMIN || !adminToken || location.protocol === 'file:') return;
  try {
    const res = await fetch(apiUrl('api/auth'), {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ action: 'refresh' }),
      cache: 'no-store',
    });
    const data = await res.json().catch(() => ({}));
    if (res.status === 401 || res.status === 403 || !res.ok || !data.ok || !data.token) {
      adminToken = null;
      adminTokenExpiresAt = 0;
      send({ op: 'auth-result', ok: false, error: data.error || 'Session expirée. Reconnectez-vous.' });
      return;
    }
    adminToken = data.token;
    adminTokenExpiresAt = typeof data.expiresAt === 'number' ? data.expiresAt : 0;
    send({
      op: 'auth-result',
      ok: true,
      mode: data.mode || 'env',
      expiresAt: adminTokenExpiresAt || null,
      silent: !manual,
      manual: !!manual,
    });
  } catch {
    if (manual) showToast('Impossible de prolonger la session hors ligne', 'warn');
  }
}

async function runAuthChangePasscode(currentPasscode, newPasscode) {
  if (!IS_ADMIN || !adminToken || location.protocol === 'file:') {
    send({ op: 'passcode-result', ok: false, error: 'Session administrateur requise.' });
    return;
  }
  try {
    const res = await fetch(apiUrl('api/auth'), {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ action: 'change-passcode', currentPasscode, newPasscode }),
      cache: 'no-store',
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok || !data.token) {
      send({ op: 'passcode-result', ok: false, error: data.error || 'Impossible de modifier le code d’accès.' });
      return;
    }
    adminToken = data.token;
    adminTokenExpiresAt = typeof data.expiresAt === 'number' ? data.expiresAt : 0;
    send({
      op: 'passcode-result',
      ok: true,
      mode: data.mode || 'claimed',
      expiresAt: adminTokenExpiresAt || null,
    });
  } catch {
    send({ op: 'passcode-result', ok: false, error: 'Serveur d’authentification inaccessible.' });
  }
}

async function fetchHealth() {
  if (location.protocol === 'file:') return;
  try {
    const res = await fetch(apiUrl('api/health'), { headers: authHeaders(), cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    send({ op: 'health-result', ok: true, data });
  } catch {
    send({ op: 'health-result', ok: false, data: null });
  }
}

async function fetchMediaList() {
  if (!IS_ADMIN || !adminToken || location.protocol === 'file:') {
    send({ op: 'media-result', ok: false, files: [], error: 'Session administrateur requise.' });
    return;
  }
  try {
    const res = await fetch(apiUrl('api/media'), { headers: authHeaders(), cache: 'no-store' });
    const data = await res.json().catch(() => ({}));
    if (res.status === 401 || res.status === 403) {
      adminToken = null;
      adminTokenExpiresAt = 0;
      send({ op: 'auth-result', ok: false, error: 'Session expirée. Reconnectez-vous.' });
      return;
    }
    if (!res.ok || !data.ok) {
      send({ op: 'media-result', ok: false, files: [], error: data.error || 'Erreur médiathèque.' });
      return;
    }
    send({ op: 'media-result', ok: true, files: Array.isArray(data.files) ? data.files : [] });
  } catch {
    send({ op: 'media-result', ok: false, files: [], error: 'Médiathèque inaccessible.' });
  }
}

async function uploadMediaFile(inputId) {
  if (!IS_ADMIN || !adminToken || location.protocol === 'file:') {
    showToast('Session administrateur requise', 'err');
    return;
  }
  const inp = document.getElementById(inputId || 'st-media-file');
  const file = inp instanceof HTMLInputElement ? inp.files?.[0] : null;
  if (!file) {
    showToast('Sélectionnez une image à importer', 'warn');
    return;
  }
  if (file.size > 750 * 1024) {
    showToast('Image trop volumineuse (max 750 Ko)', 'err');
    return;
  }
  const dataUrl = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('read-error'));
    reader.readAsDataURL(file);
  }).catch(() => '');
  if (!dataUrl) {
    showToast('Lecture du fichier impossible', 'err');
    return;
  }
  try {
    const res = await fetch(apiUrl('api/media'), {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ dataUrl, filename: file.name }),
      cache: 'no-store',
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) {
      showToast(data.error || 'Import refusé', 'err');
      return;
    }
    if (inp instanceof HTMLInputElement) inp.value = '';
    showToast(`Image importée (${data.url})`, 'ok');
    await fetchMediaList();
  } catch {
    showToast('Échec de l’import média', 'err');
  }
}

function startCloudHeartbeat() {
  if (syncPollId || location.protocol === 'file:') return;
  // Intervalle adaptatif uniquement lorsque l'onglet est visible (0 requête en arrière-plan)
  syncPollId = setInterval(() => {
    if (document.hidden || !navigator.onLine) return;
    if (IS_ADMIN && !adminToken) return;
    if (IS_ADMIN && adminToken && adminTokenExpiresAt > 0 && adminTokenExpiresAt - Date.now() < 30 * 60 * 1000) {
      runAuthRefresh(false);
    }
    if (pendingNamespaces.size > 0 || pendingEvents.length > 0) {
      flushCloudPush({ keepalive: false });
    } else {
      pullCloudSync({ force: false, manual: false });
    }
  }, 20000);
}

function callWasm(payload) {
  if (!wasm) return { ok: false, effects: [] };
  const bytes = enc.encode(JSON.stringify(payload));
  const ptr = wasm.alloc(bytes.length);
  new Uint8Array(wasm.memory.buffer, ptr, bytes.length).set(bytes);
  wasm.process(ptr, bytes.length);
  wasm.dealloc(ptr, bytes.length);
  const outPtr = wasm.out_ptr();
  const outLen = wasm.out_len();
  const text = outLen > 0 ? dec.decode(new Uint8Array(wasm.memory.buffer, outPtr, outLen)) : '{}';
  wasm.out_free();
  try {
    return JSON.parse(text);
  } catch {
    return { ok: false, effects: [] };
  }
}

function send(payload) {
  const res = callWasm({ ...payload, now: Date.now() });
  if (res && Array.isArray(res.effects)) runEffects(res.effects);
  return res;
}

const APP_PENCIL_SVG =
  '<span class="app-pencil" aria-hidden="true">' +
  '<svg class="app-pencil__svg" viewBox="0 0 28 28" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">' +
  '<path class="app-pencil__trace" d="M4.5 23.5 C 9.5 22.1, 15.2 24.3, 23.5 23.1" stroke-width="1.5" />' +
  '<g class="app-pencil__body">' +
  '<path d="M16.8 5.2 L21.8 10.2 L10.2 21.8 L4.8 22.8 L5.8 17.4 Z" stroke-width="1.65" />' +
  '<path d="M14.4 7.6 L19.4 12.6" stroke-width="1.45" />' +
  '<path class="app-pencil__tip" d="M5.8 17.4 L10.2 21.8" stroke-width="1.25" />' +
  '</g></svg></span><span class="sr-only">Résolvons l’exercice</span>';

function enhanceLessonUI(root) {
  if (!root || typeof root.querySelectorAll !== 'function') return;
  const pills = root.querySelectorAll('.app-sol-pill');
  for (const pill of pills) {
    if (pill.dataset.pencilized === '1') continue;
    pill.dataset.pencilized = '1';
    pill.innerHTML = APP_PENCIL_SVG;
    const sum = pill.closest('summary');
    if (sum) {
      sum.setAttribute('aria-label', 'Résolvons l’exercice');
      sum.setAttribute('title', 'Résolvons l’exercice');
    }
  }
}

const EMOJI_STRIP_RE = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\uFE0F]/gu;

function enhanceFocusDialog(dlg) {
  if (!dlg || dlg.id !== 'focus-dlg') return;
  // Clean decorative icons and emojis inside Focus modal
  for (const el of dlg.querySelectorAll('.focus-badge-ico, .focus-pill-btn svg')) {
    el.remove();
  }
  for (const el of dlg.querySelectorAll('.focus-dlg__badge span, .focus-dlg__mode-tag, .focus-section-eyebrow')) {
    if (el.textContent && EMOJI_STRIP_RE.test(el.textContent)) {
      el.textContent = el.textContent.replace(EMOJI_STRIP_RE, '').replace(/\s+/g, ' ').trim();
    }
  }
  // Clean Notion-style labels on remaining footer controls
  for (const btn of dlg.querySelectorAll('.focus-foot-controls button')) {
    const act = btn.dataset.action || '';
    if (act === 'focus-prev') btn.textContent = 'Précédent';
    else if (act === 'focus-next') btn.textContent = 'Suivant';
    else if (act === 'focus-nav-block') {
      const txt = (btn.textContent || '').replace(/[←→]/g, '').trim();
      if (txt) btn.textContent = txt;
    }
  }
  // Hide footer completely when no actionable step/block controls are visible (X is in header)
  const foot = dlg.querySelector('.focus-dlg__foot');
  if (foot) {
    const visibleBtns = Array.from(foot.querySelectorAll('.focus-foot-controls button')).filter((b) => {
      const act = b.dataset.action || '';
      return act !== 'focus-close' && !b.classList.contains('focus-ghost-btn');
    });
    const hasDots = !!foot.querySelector('.focus-dot');
    foot.hidden = visibleBtns.length === 0 && !hasDots;
  }
}

function hydrateMath(root) {
  if (!root) return;
  enhanceLessonUI(root);
  if (typeof window.katex === 'undefined') return;
  const slots = root.querySelectorAll('.math-tex[data-tex]');
  for (const el of slots) {
    if (el.dataset.rendered === '1') continue;
    const tex = el.dataset.tex || '';
    const displayMode = el.dataset.display === '1';
    try {
      el.innerHTML = window.katex.renderToString(tex, {
        displayMode,
        throwOnError: false,
        strict: false,
        trust: true,
        macros: MACROS,
      });
    } catch {
      el.textContent = tex;
    }
    el.dataset.rendered = '1';
  }
  fitDisplayMath(root);
}

function fitDisplayMath(root) {
  if (!root || typeof root.querySelectorAll !== 'function') return;
  const nodes = root.querySelectorAll('.math-display-node');
  for (const node of nodes) {
    const blk = node.querySelector('.katex-display');
    const katexEl = blk?.querySelector('.katex');
    if (!blk || !katexEl) continue;
    node.classList.remove('math-display-fitted');
    node.style.removeProperty('--fit-ratio');
    const parentW = node.parentElement?.clientWidth || blk.clientWidth;
    const avail = Math.min(blk.clientWidth, parentW) - 6;
    const needed = katexEl.scrollWidth;
    if (avail > 60 && needed > avail) {
      const ratio = Math.max(0.58, avail / needed);
      node.style.setProperty('--fit-ratio', ratio.toFixed(3));
      node.classList.add('math-display-fitted');
    }
  }
}

function playSound(name) {
  if (muted) return;
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    if (!audioCtx) audioCtx = new Ctx();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    const t = audioCtx.currentTime;
    if (name === 'ok') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(523.25, t);
      osc.frequency.exponentialRampToValueAtTime(783.99, t + 0.12);
      gain.gain.setValueAtTime(0.08, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
      osc.start(t);
      osc.stop(t + 0.23);
    } else if (name === 'ko') {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(220, t);
      osc.frequency.exponentialRampToValueAtTime(146.8, t + 0.16);
      gain.gain.setValueAtTime(0.08, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
      osc.start(t);
      osc.stop(t + 0.23);
    } else {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(640, t);
      gain.gain.setValueAtTime(0.04, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
      osc.start(t);
      osc.stop(t + 0.07);
    }
  } catch {}
}

function showToast(message, tone = 'ok') {
  let host = document.getElementById('mp-toasts');
  if (!host) {
    host = document.createElement('div');
    host.id = 'mp-toasts';
    host.className = 'toast-stack';
    host.setAttribute('aria-live', 'polite');
    document.body.appendChild(host);
  }
  const el = document.createElement('div');
  el.className = `toast is-${tone}`;
  el.textContent = message;
  host.appendChild(el);
  setTimeout(() => {
    el.classList.add('is-out');
    setTimeout(() => el.remove(), 260);
  }, 2800);
}

function positionMorphPill(container, pillSel, activeSel) {
  if (!container) return;
  const pill = container.querySelector(pillSel);
  const active = container.querySelector(activeSel);
  if (!pill || !active) return;
  const firstMount = !container.classList.contains('has-morph-pill');
  container.classList.add('has-morph-pill');
  let x, y, w, h;
  if (active.offsetParent === container) {
    x = active.offsetLeft;
    y = active.offsetTop;
    w = active.offsetWidth;
    h = active.offsetHeight;
  } else {
    const cr = container.getBoundingClientRect();
    const ar = active.getBoundingClientRect();
    x = ar.left - cr.left - container.clientLeft + container.scrollLeft;
    y = ar.top - cr.top - container.clientTop + container.scrollTop;
    w = ar.width;
    h = ar.height;
  }
  if (firstMount) {
    pill.style.transition = 'none';
  }
  pill.style.width = `${w}px`;
  pill.style.height = `${h}px`;
  pill.style.transform = `translate3d(${x}px, ${y}px, 0)`;
  pill.style.opacity = '1';
  if (firstMount) {
    void pill.offsetWidth;
    pill.style.transition = '';
  }
}

let pillRO = null;
function ensurePillObserver() {
  if (pillRO || typeof ResizeObserver !== 'function') return pillRO;
  pillRO = new ResizeObserver(() => requestAnimationFrame(syncPill));
  return pillRO;
}

function syncPill() {
  const ro = ensurePillObserver();
  const nav = document.getElementById('nav-tabs');
  if (nav) {
    positionMorphPill(nav, '.morph-pill', '[aria-selected="true"], [aria-current], .nt.on');
    if (ro && !nav.dataset.roBound) {
      nav.dataset.roBound = '1';
      ro.observe(nav);
    }
  }
  const ccTabs = document.getElementById('cc-school-tabs');
  if (ccTabs) {
    positionMorphPill(ccTabs, '.cc-school-pill', '.cc-school-tab[aria-selected="true"]');
    if (ro && !ccTabs.dataset.roBound) {
      ccTabs.dataset.roBound = '1';
      ro.observe(ccTabs);
    }
  }
  for (const ef of document.querySelectorAll('.exam-filters')) {
    positionMorphPill(ef, '.ef-morph-pill', '.ef-btn[aria-pressed="true"]');
    if (ro && !ef.dataset.roBound) {
      ef.dataset.roBound = '1';
      ro.observe(ef);
    }
  }
  for (const cf of document.querySelectorAll('.cc-filters')) {
    positionMorphPill(cf, '.cc-morph-pill', '.cc-fbtn[aria-pressed="true"]');
    if (ro && !cf.dataset.roBound) {
      cf.dataset.roBound = '1';
      ro.observe(cf);
    }
  }
}
document.fonts?.ready?.then(() => requestAnimationFrame(syncPill));

function syncLessonScrollUI() {
  const les = document.getElementById('les');
  if (!les) return;
  const y = window.scrollY || 0;
  const top = les.querySelector('.top');
  if (top) top.classList.toggle('is-scrolled', y > 96);
  const fab = document.getElementById('les-top-fab');
  if (fab) fab.classList.toggle('is-visible', y > 420);
  const tocBtns = document.querySelectorAll('#toc button[data-target]');
  if (tocBtns.length) {
    let activeTarget = tocBtns[0].dataset.target || '';
    for (const btn of tocBtns) {
      const sec = btn.dataset.target ? document.querySelector(btn.dataset.target) : null;
      if (sec && sec.getBoundingClientRect().top <= 148) {
        activeTarget = btn.dataset.target;
      }
    }
    for (const btn of tocBtns) {
      btn.classList.toggle('is-active', btn.dataset.target === activeTarget);
    }
  }
}

function ensureModal() {
  let dlg = document.getElementById('mp-modal');
  if (!dlg) {
    dlg = document.createElement('dialog');
    dlg.id = 'mp-modal';
    dlg.className = 'modal';
    dlg.innerHTML =
      '<header class="modal__header"><div><h2 class="modal__title" id="mp-modal-t"></h2><p class="body-muted" id="mp-modal-s" style="margin:2px 0 0;font-size:12.5px"></p></div>' +
      '<button type="button" class="ib close-x" data-action="modal-close" aria-label="Fermer"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M18 6L6 18M6 6l12 12"/></svg></button></header>' +
      '<div class="modal__body" id="mp-modal-b"></div>' +
      '<footer class="modal__footer" id="mp-modal-f"></footer>';
    dlg.addEventListener('click', (e) => {
      if (e.target === dlg) dlg.close();
    });
    document.body.appendChild(dlg);
  }
  return dlg;
}

function ensureLightbox() {
  let dlg = document.getElementById('media-lb');
  if (!dlg) {
    dlg = document.createElement('dialog');
    dlg.id = 'media-lb';
    dlg.className = 'media-lightbox';
    dlg.addEventListener('click', (e) => {
      if (e.target === dlg) dlg.close();
    });
    document.body.appendChild(dlg);
  }
  return dlg;
}

function runEffects(effects) {
  for (const e of effects) {
    switch (e.type) {
      case 'init-icons': {
        for (const el of document.querySelectorAll('[data-sb-icon]')) {
          const name = el.dataset.sbIcon;
          if (e.icons && e.icons[name]) el.innerHTML = e.icons[name];
        }
        break;
      }
      case 'sync-shell': {
        const root = document.documentElement;
        const nextTheme = e.theme || '';
        const nextPalette = e.palette && e.palette !== 'quizlet' ? e.palette : '';
        const nextHasSb = !IS_ADMIN && typeof e.hasSb === 'boolean' ? (e.hasSb ? '1' : '0') : null;
        const hasSbChanged = nextHasSb !== null && (document.body.dataset.hasSb || '') !== nextHasSb;
        const themeChanged =
          (root.dataset.theme || '') !== nextTheme ||
          (root.dataset.palette || '') !== nextPalette ||
          hasSbChanged;
        if (themeChanged) {
          root.classList.add('is-theme-switching');
          void root.offsetHeight;
        }
        if (e.view) document.body.dataset.v = e.view;
        if (nextHasSb !== null) {
          document.body.dataset.hasSb = nextHasSb;
          const sbEl = document.getElementById('sidebar');
          if (sbEl) sbEl.hidden = nextHasSb === '0';
        }
        if (e.title) document.title = e.title;
        if (nextTheme) root.dataset.theme = nextTheme;
        else delete root.dataset.theme;
        if (nextPalette) root.dataset.palette = nextPalette;
        else delete root.dataset.palette;
        if (themeChanged) {
          requestAnimationFrame(() => root.classList.remove('is-theme-switching'));
        }
        const wasCollapsed = root.dataset.sb === 'collapsed';
        if (e.sbCollapsed) {
          root.dataset.sb = 'collapsed';
          if (!wasCollapsed) {
            root.dataset.sbQuiet = '1';
            const sbEl = document.getElementById('sidebar');
            if (sbEl && document.activeElement && sbEl.contains(document.activeElement)) {
              document.activeElement.blur();
            }
          }
        } else {
          delete root.dataset.sb;
          delete root.dataset.sbQuiet;
        }
        const sub = document.getElementById('sb-class-sub');
        if (sub && e.classSub) sub.textContent = e.classSub;
        const tlbl = document.getElementById('sb-theme-lbl');
        if (tlbl && e.themeLabel) tlbl.textContent = e.themeLabel;
        const tico = document.querySelector('#sb-theme [data-sb-icon]');
        if (tico && e.themeIcon) tico.innerHTML = e.themeIcon;
        if (e.themeIcon) {
          for (const el of document.querySelectorAll('[data-theme-icon]')) {
            el.innerHTML = e.themeIcon;
          }
        }
        if (e.themeLabel) {
          for (const btn of document.querySelectorAll('[data-theme-toggle]')) {
            btn.setAttribute('aria-label', e.themeLabel);
            btn.setAttribute('title', e.themeLabel);
          }
        }
        const sbIco = document.querySelector('#sb-toggle [data-sb-icon]');
        if (sbIco && e.sbToggleIcon) sbIco.innerHTML = e.sbToggleIcon;
        const sbBtn = document.getElementById('sb-toggle');
        if (sbBtn) sbBtn.setAttribute('aria-expanded', String(!e.sbCollapsed));
        break;
      }
      case 'mount': {
        const target = document.querySelector(e.selector || '#app');
        if (!target) break;
        const seq = ++mountSeq;
        const apply = () => {
          if (seq !== mountSeq) return;
          target.hidden = false;
          target.innerHTML = e.html || '';
          hydrateMath(target);
          syncPill();
          syncLessonScrollUI();
        };
        const navKind = e.navKind || e.transition || 'none';
        const navDir = e.navDir || '';
        const clearNav = () => {
          delete document.documentElement.dataset.navKind;
          delete document.documentElement.dataset.navDir;
        };
        if (!document.hidden && navKind !== 'none' && typeof document.startViewTransition === 'function') {
          if (activeVT) {
            try { activeVT.skipTransition(); } catch {}
          }
          document.documentElement.dataset.navKind = navKind;
          if (navDir) document.documentElement.dataset.navDir = navDir;
          else delete document.documentElement.dataset.navDir;
          const vt = document.startViewTransition(apply);
          activeVT = vt;
          vt.ready?.catch(() => {});
          vt.updateCallbackDone?.catch(() => {});
          vt.finished
            ?.catch(() => {})
            .finally(() => {
              if (activeVT === vt) {
                activeVT = null;
                clearNav();
              }
              syncPill();
            });
        } else {
          if (activeVT) {
            try { activeVT.skipTransition(); } catch {}
            activeVT = null;
            clearNav();
          }
          apply();
        }
        if (
          navKind === 'drill-in' ||
          navKind === 'drill-out' ||
          navKind === 'peer' ||
          navKind === 'forward' ||
          navKind === 'back' ||
          navKind === 'root'
        ) {
          window.scrollTo({ top: 0, behavior: 'instant' });
        }
        break;
      }
      case 'patch': {
        const el = document.querySelector(e.selector);
        if (el) {
          el.innerHTML = e.html || '';
          hydrateMath(el);
          syncPill();
          if (
            e.animate &&
            typeof el.animate === 'function' &&
            !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
          ) {
            try {
              el.getAnimations?.().forEach((a) => a.cancel());
              const dx = e.dir === 'right' ? 12 : e.dir === 'left' ? -12 : 0;
              const dy = dx === 0 ? 5 : 0;
              el.animate(
                [
                  { opacity: 0, transform: `translate3d(${dx}px, ${dy}px, 0)` },
                  { opacity: 1, transform: 'translate3d(0, 0, 0)' },
                ],
                { duration: 190, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' }
              );
            } catch {}
          }
        }
        break;
      }
      case 'set-attr': {
        const el = document.querySelector(e.selector);
        if (el) {
          if (e.value === null || e.value === undefined) el.removeAttribute(e.attr);
          else el.setAttribute(e.attr, String(e.value));
        }
        break;
      }
      case 'set-class': {
        const el = document.querySelector(e.selector);
        if (el) el.classList.toggle(e.class, !!e.on);
        break;
      }
      case 'set-style': {
        const el = document.querySelector(e.selector);
        if (el && e.prop) {
          if (String(e.prop).startsWith('--')) el.style.setProperty(e.prop, String(e.value ?? ''));
          else el.style[e.prop] = e.value;
        }
        break;
      }
      case 'popover-hide': {
        const el = document.querySelector(e.selector);
        if (el && typeof el.hidePopover === 'function') {
          try { el.hidePopover(); } catch {}
        }
        break;
      }
      case 'fit-math': {
        const el = e.selector ? document.querySelector(e.selector) : document;
        if (el) fitDisplayMath(el);
        break;
      }
      case 'toggle-all-details': {
        const open = !!e.open;
        for (const d of document.querySelectorAll('#les details')) {
          d.open = open;
        }
        if (open) {
          const les = document.getElementById('les');
          if (les) requestAnimationFrame(() => fitDisplayMath(les));
        }
        break;
      }
      case 'toggle-all-blanks': {
        const revealed = !!e.revealed;
        for (const b of document.querySelectorAll('#les .math-blank')) {
          b.classList.toggle('revealed', revealed);
          b.setAttribute('aria-pressed', String(revealed));
        }
        break;
      }
      case 'set-hash': {
        if (location.hash !== e.hash) {
          if (e.silent) ignoreHash = true;
          history.replaceState(null, '', e.hash);
          if (e.silent) setTimeout(() => { ignoreHash = false; }, 0);
        }
        break;
      }
      case 'storage-set': {
        const store = e.session ? sessionStorage : localStorage;
        if (e.key === 'mathplus:muted') muted = e.value === '1';
        try {
          if (e.value === null || e.value === undefined) store.removeItem(e.key);
          else store.setItem(e.key, String(e.value));
        } catch {}
        if (!e.session && !e.fromCloud) {
          if (channel) {
            try { channel.postMessage({ key: e.key, value: e.value }); } catch {}
          }
          queueCloudFromStorage(e.key, e.value);
        }
        break;
      }
      case 'auth-check': {
        runAuthCheck();
        break;
      }
      case 'auth-submit': {
        runAuthSubmit(e.action, e.passcode);
        break;
      }
      case 'auth-logout': {
        const headers = authHeaders();
        adminToken = null;
        adminTokenExpiresAt = 0;
        lastSyncRev = 0;
        pendingNamespaces.clear();
        pendingEvents.length = 0;
        if (channel) {
          try { channel.postMessage({ type: 'admin-logout' }); } catch {}
        }
        fetch(apiUrl('api/auth'), { method: 'DELETE', headers, cache: 'no-store' }).catch(() => {});
        break;
      }
      case 'auth-refresh': {
        runAuthRefresh(!!e.manual);
        break;
      }
      case 'auth-change-passcode': {
        runAuthChangePasscode(e.currentPasscode, e.newPasscode);
        break;
      }
      case 'health-fetch': {
        fetchHealth();
        break;
      }
      case 'media-list': {
        fetchMediaList();
        break;
      }
      case 'media-upload': {
        uploadMediaFile(e.inputId);
        break;
      }
      case 'copy-text': {
        if (typeof e.text === 'string') {
          navigator.clipboard?.writeText(e.text).catch(() => {});
        }
        break;
      }
      case 'cloud-sync-pull': {
        pullCloudSync({ force: !!e.force, manual: false });
        break;
      }
      case 'cloud-sync-now': {
        (async () => {
          if (!IS_ADMIN && getActiveGoogleUid()) {
            await writeStudentFirestoreDirect({ stRevHint: lastStRev, force: false });
          }
          await flushCloudPush({ keepalive: false });
          await pullCloudSync({ force: true, manual: true });
        })();
        break;
      }
      case 'firebase-google-login': {
        if (!IS_ADMIN) triggerGoogleSignIn({ onToast: showToast });
        break;
      }
      case 'firebase-google-logout': {
        if (!IS_ADMIN) triggerGoogleSignOut({ onToast: showToast });
        break;
      }
      case 'cloud-reset': {
        if (!IS_ADMIN) {
          (async () => {
            pendingNamespaces.clear();
            await writeStudentFirestoreDirect({ stRevHint: lastStRev, force: true, reset: true });
            const headers = await buildStudentOrAdminHeaders({ 'Content-Type': 'application/json' });
            await fetch(apiUrl('api/sync'), {
              method: 'POST',
              headers,
              body: JSON.stringify({
                scope: 'student',
                studentId: getActiveGoogleUid() || STUDENT_ID,
                reset: true,
                namespaces: {},
              }),
              cache: 'no-store',
            }).catch(() => {});
          })();
        }
        break;
      }
      case 'fetch': {
        if (jsonCache.has(e.url)) {
          const cached = jsonCache.get(e.url);
          queueMicrotask(() => send({ op: 'fetch-result', id: e.id, ok: cached !== null, data: cached }));
          break;
        }
        let promise = inFlightFetches.get(e.url);
        if (!promise) {
          promise = (async () => {
            for (let attempt = 0; attempt < 3; attempt++) {
              const ctrl = typeof AbortController === 'function' ? new AbortController() : null;
              const timer = ctrl ? setTimeout(() => ctrl.abort(), 12000) : null;
              try {
                const r = await fetch(e.url, { signal: ctrl?.signal });
                if (timer) clearTimeout(timer);
                if (r.ok) {
                  const data = await r.json();
                  if (data !== null) jsonCache.set(e.url, data);
                  return { ok: data !== null, data };
                }
                if (r.status === 404) return { ok: false, data: null };
              } catch {
                if (timer) clearTimeout(timer);
              }
              if (attempt < 2) {
                await new Promise((res) => setTimeout(res, attempt === 0 ? 300 : 850));
              }
            }
            return { ok: false, data: null };
          })().finally(() => inFlightFetches.delete(e.url));
          inFlightFetches.set(e.url, promise);
        }
        promise.then((res) => send({ op: 'fetch-result', id: e.id, ok: res.ok, data: res.data }));
        break;
      }
      case 'timer': {
        if (e.active && !timerId) {
          timerId = setInterval(() => send({ op: 'tick' }), 1000);
        } else if (!e.active && timerId) {
          clearInterval(timerId);
          timerId = null;
        }
        break;
      }
      case 'sync-pill': {
        requestAnimationFrame(syncPill);
        break;
      }
      case 'toast': {
        showToast(e.message || '', e.tone || 'ok');
        break;
      }
      case 'sound': {
        playSound(e.name || 'tap');
        break;
      }
      case 'modal': {
        const dlg = ensureModal();
        if (!e.open) {
          if (dlg.open) dlg.close();
          break;
        }
        dlg.classList.toggle('modal--wide', !!e.wide);
        dlg.querySelector('#mp-modal-t').textContent = e.title || '';
        const s = dlg.querySelector('#mp-modal-s');
        s.textContent = e.subtitle || '';
        s.hidden = !e.subtitle;
        const b = dlg.querySelector('#mp-modal-b');
        b.innerHTML = e.body || '';
        hydrateMath(b);
        const f = dlg.querySelector('#mp-modal-f');
        f.innerHTML = e.footer || '';
        f.hidden = !e.footer;
        const openDialogClean = (d) => {
          if (!d || d.open) return;
          if (!d.hasAttribute('tabindex')) d.setAttribute('tabindex', '-1');
          d.showModal();
          try { d.focus({ preventScroll: true }); } catch {}
        };
        if (!dlg.open) openDialogClean(dlg);
        break;
      }
      case 'lightbox': {
        const dlg = ensureLightbox();
        if (!e.open) {
          if (dlg.open) dlg.close();
          break;
        }
        dlg.innerHTML = e.html || '';
        hydrateMath(dlg);
        if (!dlg.open) {
          if (!dlg.hasAttribute('tabindex')) dlg.setAttribute('tabindex', '-1');
          dlg.showModal();
          try { dlg.focus({ preventScroll: true }); } catch {}
        }
        break;
      }
      case 'dialog': {
        const dlg = document.querySelector(e.selector);
        if (!dlg) break;
        if (!dlg.dataset.backdropBound) {
          dlg.dataset.backdropBound = '1';
          dlg.addEventListener('click', (ev) => {
            if (ev.target === dlg) dlg.close();
          });
          if (dlg.id === 'focus-dlg') {
            dlg.addEventListener('close', () => {
              send({ op: 'event', action: 'focus-closed', data: {} });
            });
          }
        }
        if (e.attrs && typeof e.attrs === 'object') {
          for (const [k, v] of Object.entries(e.attrs)) {
            if (v === null || v === undefined) dlg.removeAttribute(k);
            else dlg.setAttribute(k, String(v));
          }
        }
        if (e.html !== undefined) {
          dlg.innerHTML = e.html;
          hydrateMath(dlg);
          if (dlg.id === 'focus-dlg') enhanceFocusDialog(dlg);
        }
        if (e.open && !dlg.open) {
          if (!dlg.hasAttribute('tabindex')) dlg.setAttribute('tabindex', '-1');
          dlg.showModal();
          try { dlg.focus({ preventScroll: true }); } catch {}
        }
        else if (!e.open && dlg.open) dlg.close();
        if (e.open) {
          fitDisplayMath(dlg);
          const curStep = dlg.querySelector('.is-focus-current');
          const bodyEl = dlg.querySelector('.focus-dlg__body');
          if (curStep) {
            requestAnimationFrame(() => {
              if (!curStep.previousElementSibling && bodyEl) {
                bodyEl.scrollTop = 0;
              } else {
                curStep.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
              }
            });
          } else if (bodyEl) {
            bodyEl.scrollTop = 0;
          }
        }
        break;
      }
      case 'open-settings': {
        const dlg = document.getElementById('set');
        const form = document.getElementById('sf');
        if (!dlg || !form) break;
        const p = e.profile || {};
        if (form.elements.fn) form.elements.fn.value = p.firstName || '';
        if (form.elements.ln) form.elements.ln.value = p.lastName || '';
        if (form.elements.sc) form.elements.sc.value = p.school || '';
        const th = p.theme || 'auto';
        const r = form.querySelector(`input[name="th"][value="${th}"]`);
        if (r) r.checked = true;
        const pal = p.palette || 'quizlet';
        for (const btn of dlg.querySelectorAll('[data-pal]')) {
          btn.setAttribute('aria-pressed', String(btn.dataset.pal === pal));
        }
        const swS = document.getElementById('sw-sound');
        if (swS) {
          const on = !e.muted;
          swS.setAttribute('aria-checked', String(on));
          swS.classList.toggle('is-on', on);
        }
        const swF = document.getElementById('sw-free');
        if (swF) {
          const on = !!p.freeMode;
          swF.setAttribute('aria-checked', String(on));
          swF.classList.toggle('is-on', on);
        }
        const gBox = document.getElementById('set-google-box');
        if (gBox) {
          const gu = e.googleUser;
          if (gu && gu.uid) {
            const label = gu.displayName || gu.email || 'Compte Google';
            const sub = gu.email && gu.displayName ? gu.email : 'Cloud Firestore synchronisé';
            gBox.innerHTML =
              '<div class="set-google-info">' +
              '<span class="google-user-dot" aria-hidden="true"></span>' +
              '<div class="set-google-meta"><strong></strong><small></small></div>' +
              '</div>' +
              '<button type="button" class="btn sm" data-action="student-google-logout">Déconnexion</button>';
            gBox.querySelector('strong').textContent = label;
            gBox.querySelector('small').textContent = sub;
          } else {
            gBox.innerHTML =
              '<div class="set-google-meta"><strong>Sauvegarde Google</strong><small>Synchronisez votre progression sur tous vos appareils</small></div>' +
              '<button type="button" class="google-auth-btn google-auth-btn--sm" data-action="student-google-login">Connexion Google</button>';
          }
        }
        if (!dlg.open) {
          if (!dlg.hasAttribute('tabindex')) dlg.setAttribute('tabindex', '-1');
          dlg.showModal();
          try { dlg.focus({ preventScroll: true }); } catch {}
        }
        break;
      }
      case 'open-eval': {
        const dlg = document.getElementById('dlg');
        const dt = document.getElementById('dt');
        if (dt) dt.textContent = e.timeText || '';
        if (dlg && !dlg.open) {
          if (!dlg.hasAttribute('tabindex')) dlg.setAttribute('tabindex', '-1');
          dlg.showModal();
          try { dlg.focus({ preventScroll: true }); } catch {}
        }
        break;
      }
      case 'download': {
        const blob = new Blob([e.content || ''], { type: 'application/json;charset=utf-8' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = e.filename || 'export.json';
        document.body.appendChild(a);
        a.click();
        setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 100);
        break;
      }
      case 'print': {
        window.print();
        break;
      }
      case 'scroll-to': {
        const el = document.querySelector(e.selector);
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        break;
      }
      case 'hide-splash': {
        const app = document.getElementById('app');
        if (app) app.hidden = false;
        const sp = document.getElementById('splash-screen');
        if (sp) {
          sp.classList.add('fade-out');
          setTimeout(() => sp.remove(), 260);
        }
        break;
      }
    }
  }
}

function readAllStorage(store) {
  const out = {};
  try {
    for (let i = 0; i < store.length; i++) {
      const k = store.key(i);
      if (k && k.startsWith('mathplus:')) out[k] = store.getItem(k);
    }
  } catch {}
  return out;
}

function bindEvents() {
  const idActions = {
    'sb-toggle': 'sb-toggle',
    'sb-rail-btn': 'sb-toggle',
    'sb-theme': 'sb-theme',
    'sb-orient': 'sb-orient',
    'sb-help': 'sb-help',
    av: 'open-settings',
    'sw-sound': 'toggle-sound',
    'sw-free': 'toggle-free',
    'btn-exp-prog': 'export-backup',
    'btn-cloud-sync': 'cloud-sync',
    rst: 'reset-progress',
  };

  document.addEventListener('click', (ev) => {
    const t = ev.target;
    if (!(t instanceof Element)) return;

    // Scroll-to-top FAB in lesson view
    if (t.closest('#les-top-fab')) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    // Interactive \blank{} reveal
    const blank = t.closest('.math-blank');
    if (blank) {
      const revealed = blank.classList.toggle('revealed');
      blank.setAttribute('aria-pressed', String(revealed));
      send({ op: 'event', action: 'toggle-blank', data: { bid: blank.dataset.bid || '', revealed: String(revealed) } });
      return;
    }

    // Palette buttons in #set
    const palBtn = t.closest('[data-pal]');
    if (palBtn) {
      for (const b of document.querySelectorAll('[data-pal]')) {
        b.setAttribute('aria-pressed', String(b === palBtn));
      }
      send({ op: 'event', action: 'set-palette', data: { pal: palBtn.dataset.pal } });
      return;
    }

    // Backup file trigger
    if (t.closest('#btn-imp-prog')) {
      document.getElementById('inp-imp-prog')?.click();
      return;
    }

    // Static sidebar / settings IDs
    for (const [id, act] of Object.entries(idActions)) {
      if (t.closest(`#${id}`)) {
        send({ op: 'event', action: act, data: {} });
        return;
      }
    }

    // Password visibility toggle on admin login / setup
    const passToggle = t.closest('[data-toggle-pass]');
    if (passToggle) {
      const targetId = passToggle.getAttribute('data-toggle-pass');
      const inp = targetId ? document.getElementById(targetId) : null;
      if (inp instanceof HTMLInputElement) {
        const revealing = inp.type === 'password';
        inp.type = revealing ? 'text' : 'password';
        passToggle.setAttribute('aria-pressed', String(revealing));
        passToggle.setAttribute('aria-label', revealing ? 'Masquer le code' : 'Afficher le code');
        const showEl = passToggle.querySelector('.adm-eye-show');
        const hideEl = passToggle.querySelector('.adm-eye-hide');
        if (showEl) showEl.hidden = revealing;
        if (hideEl) hideEl.hidden = !revealing;
        inp.focus();
      }
      return;
    }

    // Declarative data-action clicks (ignore form/input/select where submit/input/change handles it)
    const actEl = t.closest('[data-action]');
    if (actEl) {
      const tag = actEl.tagName;
      if (tag === 'FORM' || tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      const action = actEl.dataset.action;
      send({ op: 'event', action, data: { ...actEl.dataset } });
    }
  });

  // Live password strength indicator (first-run admin claim) & CapsLock detection
  const updateAdminStrength = (val) => {
    const box = document.getElementById('adm-strength');
    const txt = document.getElementById('adm-strength-txt');
    const rules = document.getElementById('adm-rules');
    if (!box) return;
    const s = String(val || '');
    const hasLen = s.length >= 10;
    const hasLower = /[a-z]/.test(s);
    const hasUpper = /[A-Z]/.test(s);
    const hasDigit = /[0-9]/.test(s);
    const hasSym = /[^A-Za-z0-9]/.test(s);
    const classes = [hasLower, hasUpper, hasDigit, hasSym].filter(Boolean).length;
    const distinct = new Set(s).size;
    let score = 0;
    if (s.length > 0) score = 1;
    if (s.length >= 8 && classes >= 2) score = 2;
    if (hasLen && classes >= 3 && distinct >= 5) score = 3;
    if (s.length >= 14 && classes >= 3 && distinct >= 7) score = 4;
    box.dataset.score = String(score);
    const labels = [
      'Saisissez au moins 10 caractères',
      'Faible — ajoutez des caractères',
      'Moyen — combinez 3 types de caractères',
      'Robuste — conforme',
      'Excellent — très robuste',
    ];
    if (txt) txt.textContent = labels[score] || labels[0];
    if (rules) {
      rules.querySelector('[data-rule="len"]')?.classList.toggle('is-met', hasLen);
      rules.querySelector('[data-rule="case"]')?.classList.toggle('is-met', hasLower && hasUpper);
      rules.querySelector('[data-rule="num"]')?.classList.toggle('is-met', hasDigit || hasSym);
    }
  };

  document.addEventListener('input', (ev) => {
    const el = ev.target;
    if (el instanceof HTMLInputElement && el.id === 'adm-pass') {
      updateAdminStrength(el.value);
    }
  });

  const syncCapsWarn = (ev) => {
    const el = ev.target;
    if (!(el instanceof HTMLInputElement) || (el.id !== 'adm-pass' && el.id !== 'adm-pass-confirm')) return;
    const warn = document.getElementById('adm-caps-warn');
    if (!warn || typeof ev.getModifierState !== 'function') return;
    warn.hidden = !ev.getModifierState('CapsLock');
  };
  document.addEventListener('keydown', syncCapsWarn);
  document.addEventListener('keyup', syncCapsWarn);

  // Re-fit display formulas when any <details> (e.g. solution / socratic block) opens
  document.addEventListener('toggle', (ev) => {
    const el = ev.target;
    if (!(el instanceof HTMLDetailsElement) || !el.open) return;
    requestAnimationFrame(() => {
      fitDisplayMath(el);
      setTimeout(() => { if (el.open) fitDisplayMath(el); }, 90);
    });
  }, true);

  // Double-click (desktop) & double-tap (touch) on any lesson block opens Focus mode
  const isFocusExcluded = (t) =>
    !!t.closest('button, a, input, select, textarea, summary, .math-blank, .app-sol-summary, .media-fig__zoom');

  const triggerBlockFocus = (blk) => {
    const blkIdx = blk?.dataset?.blkIdx;
    if (blkIdx === undefined || blkIdx === '') return;
    if (blk.matches('details.blk') && !blk.open) return;
    try { window.getSelection?.()?.removeAllRanges?.(); } catch {}
    send({ op: 'event', action: 'rev-focus', data: { blkIdx } });
  };

  document.addEventListener('dblclick', (ev) => {
    const t = ev.target;
    if (!(t instanceof Element) || isFocusExcluded(t)) return;
    const blk = t.closest('#les .blk[data-blk-idx]');
    if (!blk || blk.classList.contains('is-warn-trigger')) return;
    triggerBlockFocus(blk);
  });

  let lastTapAt = 0;
  let lastTapBlk = null;
  let lastTapX = 0;
  let lastTapY = 0;
  document.addEventListener('touchend', (ev) => {
    if (ev.changedTouches.length !== 1) return;
    const t = ev.target;
    if (!(t instanceof Element) || isFocusExcluded(t)) return;
    const blk = t.closest('#les .blk[data-blk-idx]');
    if (!blk || blk.classList.contains('is-warn-trigger')) return;
    const touch = ev.changedTouches[0];
    const now = Date.now();
    const dx = Math.abs(touch.clientX - lastTapX);
    const dy = Math.abs(touch.clientY - lastTapY);
    if (lastTapBlk === blk && now - lastTapAt < 340 && dx < 32 && dy < 32) {
      lastTapAt = 0;
      lastTapBlk = null;
      ev.preventDefault();
      triggerBlockFocus(blk);
    } else {
      lastTapAt = now;
      lastTapBlk = blk;
      lastTapX = touch.clientX;
      lastTapY = touch.clientY;
    }
  }, { passive: false });

  document.addEventListener('input', (ev) => {
    const el = ev.target;
    if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) return;
    const action = el.dataset.action;
    if (!action) return;
    send({ op: 'event', action, data: { ...el.dataset }, value: el.value, checked: !!el.checked });
  });

  document.addEventListener('change', (ev) => {
    const el = ev.target;
    if (!(el instanceof Element)) return;
    if (el.id === 'inp-imp-prog' && el instanceof HTMLInputElement && el.files?.[0]) {
      const reader = new FileReader();
      reader.onload = () => send({ op: 'file-import', text: String(reader.result || '') });
      reader.readAsText(el.files[0]);
      el.value = '';
      return;
    }
    const action = el.dataset.action;
    if (!action) return;
    if (el instanceof HTMLSelectElement) {
      send({ op: 'event', action, data: { ...el.dataset }, value: el.value });
    } else if (el instanceof HTMLInputElement && (el.type === 'checkbox' || el.type === 'radio')) {
      send({ op: 'event', action, data: { ...el.dataset }, value: el.value, checked: el.checked });
    }
  });

  document.addEventListener('submit', (ev) => {
    const form = ev.target;
    if (!(form instanceof HTMLFormElement)) return;
    const action = form.dataset.action;
    if (!action) return;
    ev.preventDefault();
    const data = Object.fromEntries(new FormData(form).entries());
    send({ op: 'event', action, data });
  });

  document.getElementById('set')?.addEventListener('close', (ev) => {
    const dlg = ev.target;
    if (dlg.returnValue !== 'ok') return;
    const form = document.getElementById('sf');
    if (!form) return;
    const data = Object.fromEntries(new FormData(form).entries());
    send({ op: 'event', action: 'settings-save', data });
  });

  document.getElementById('dlg')?.addEventListener('close', (ev) => {
    const dlg = ev.target;
    if (dlg.returnValue !== 'ok') return;
    const form = dlg.querySelector('form');
    const data = form ? Object.fromEntries(new FormData(form).entries()) : {};
    send({ op: 'event', action: 'eval-save', data });
  });

  window.addEventListener('hashchange', () => {
    if (ignoreHash) return;
    send({ op: 'hashchange', hash: location.hash });
  });

  window.addEventListener('keydown', (ev) => {
    const active = document.activeElement;
    if (active instanceof Element && active.classList.contains('math-blank') && (ev.key === 'Enter' || ev.key === ' ')) {
      ev.preventDefault();
      const revealed = active.classList.toggle('revealed');
      active.setAttribute('aria-pressed', String(revealed));
      send({ op: 'event', action: 'toggle-blank', data: { bid: active.dataset.bid || '', revealed: String(revealed) } });
      return;
    }
    const tag = active?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    const focusOpen = !!document.getElementById('focus-dlg')?.hasAttribute('open');
    if ((tag === 'BUTTON' || active?.getAttribute?.('role') === 'button') && (ev.key === ' ' || ev.key === 'Enter')) {
      return;
    }
    if (focusOpen && (ev.key === ' ' || ev.key === 'ArrowLeft' || ev.key === 'ArrowRight')) {
      ev.preventDefault();
    }
    if ((ev.ctrlKey || ev.metaKey) && (ev.key === 'b' || ev.key === 'B')) ev.preventDefault();
    send({
      op: 'event',
      action: 'keydown',
      data: { key: ev.key, ctrl: ev.ctrlKey || ev.metaKey, shift: ev.shiftKey },
    });
  });

  let scrollTicking = false;
  window.addEventListener('scroll', () => {
    if (scrollTicking) return;
    scrollTicking = true;
    requestAnimationFrame(() => {
      scrollTicking = false;
      syncLessonScrollUI();
      const doc = document.documentElement;
      const max = doc.scrollHeight - window.innerHeight;
      const ratio = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 1;
      send({ op: 'scroll', ratio });
    });
  }, { passive: true });

  const sidebarEl = document.getElementById('sidebar');
  if (sidebarEl) {
    sidebarEl.addEventListener('pointerleave', () => {
      delete document.documentElement.dataset.sbQuiet;
    });
  }

  window.addEventListener('resize', () => {
    requestAnimationFrame(() => {
      syncPill();
      const app = document.getElementById('app');
      if (app) fitDisplayMath(app);
      if (!IS_ADMIN) {
        let pinned = null;
        try { pinned = localStorage.getItem('mathplus:sb-collapsed'); } catch {}
        if (pinned === null) {
          const autoCollapse = window.innerWidth > 720 && window.innerWidth < 1120;
          if (autoCollapse) document.documentElement.dataset.sb = 'collapsed';
          else delete document.documentElement.dataset.sb;
          delete document.documentElement.dataset.sbQuiet;
        }
      }
    });
  }, { passive: true });

  window.addEventListener('storage', (ev) => {
    if (ev.key && ev.key.startsWith('mathplus:')) {
      send({ op: 'storage-sync', key: ev.key, value: ev.newValue });
    }
  });
  if (channel) {
    channel.onmessage = (ev) => {
      if (IS_ADMIN && ev.data?.type === 'admin-logout') {
        adminToken = null;
        adminTokenExpiresAt = 0;
        send({ op: 'auth-result', ok: false, error: 'Session fermée depuis un autre onglet.' });
        return;
      }
      if (ev.data?.key) send({ op: 'storage-sync', key: ev.data.key, value: ev.data.value });
    };
  }

  window.matchMedia?.('(prefers-color-scheme: dark)').addEventListener?.('change', (mq) => {
    send({ op: 'media-change', prefersDark: mq.matches });
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      flushCloudPush({ keepalive: true });
    } else {
      pullCloudSync({ force: false, manual: false });
    }
  });

  window.addEventListener('pagehide', () => {
    flushCloudPush({ keepalive: true });
  });

  window.addEventListener('online', () => {
    flushCloudPush({ keepalive: false }).finally(() => pullCloudSync({ force: false, manual: false }));
  });
}

async function instantiateWasm(url) {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`Failed to load ${url}: ${resp.status}`);
  if (typeof WebAssembly.instantiateStreaming === 'function') {
    try {
      const { instance } = await WebAssembly.instantiateStreaming(resp.clone(), {});
      return instance;
    } catch {}
  }
  const bytes = await resp.arrayBuffer();
  const { instance } = await WebAssembly.instantiate(bytes, {});
  return instance;
}

async function boot() {
  const instance = await instantiateWasm(WASM_URL);
  wasm = instance.exports;

  const macroRes = callWasm({ op: 'macros' });
  if (macroRes?.macros) MACROS = macroRes.macros;

  const storage = readAllStorage(localStorage);
  const session = readAllStorage(sessionStorage);
  muted = storage['mathplus:muted'] === '1';

  bindEvents();

  send({
    op: 'init',
    isAdmin: IS_ADMIN,
    rootPrefix: ROOT_PREFIX,
    hash: location.hash,
    prefersDark: !!window.matchMedia?.('(prefers-color-scheme: dark)').matches,
    viewportWidth: window.innerWidth,
    storage,
    session,
  });

  if (!IS_ADMIN) {
    // Initialise Firebase Auth (Google Élève) + lecture/écriture directe Firestore
    initStudentFirebase({
      onAuthState: (user) => {
        send({ op: 'student-auth-state', user });
      },
      onStudentMerged: (data) => {
        if (typeof data.stRev === 'number') lastStRev = Math.max(lastStRev, data.stRev);
        if (typeof data.pubRev === 'number') lastSyncRev = Math.max(lastSyncRev, data.pubRev);
        send({
          op: 'cloud-sync-apply',
          overrides: data.overrides,
          config: data.config,
          student: data.student,
          manual: false,
        });
        // Rafraîchit le résumé dans Redis / Admin via /api/sync
        flushCloudPush({ keepalive: false });
      },
      onToast: showToast,
    });
    // Premier pull non bloquant après le rendu initial + heartbeat visible-only
    setTimeout(async () => {
      await pullCloudSync({ force: true, manual: false });
      const pub = await readPublicPlatformDirect({ force: false });
      if (pub?.exists && pub.pubRev > lastSyncRev) {
        lastSyncRev = pub.pubRev;
        send({
          op: 'cloud-sync-apply',
          overrides: pub.overrides,
          config: pub.config,
          manual: false,
        });
      }
      startCloudHeartbeat();
    }, 350);
  }

  if (!IS_ADMIN && 'serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker
      .register(`${ROOT_PREFIX}sw.js`, { updateViaCache: 'none' })
      .then((reg) => reg.update().catch(() => {}))
      .catch(() => {});
  }
}

boot().catch((err) => {
  console.error('[Mathix WASM]', err);
  const eye = document.getElementById('splash-eyebrow');
  if (eye) eye.textContent = 'Erreur de chargement WebAssembly';
});
