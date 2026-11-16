/**
 * MathFlow — Synchronisation Cloud (Google Identity + Redis L1 + Firestore L2)
 * Totalement inoffensif en file:// ; synchronisation CRDT bidirectionnelle en http(s)://.
 */
(function (global) {
  'use strict';

  var QUIZ_RANK = { 'null': 0, '-1': 1, '0': 2, '1': 3 }, KEY_MUT_AT = 'ap-mut-at';
  var UNSAFE = { __proto__: 1, constructor: 1, prototype: 1 }, hasOwn = Object.prototype.hasOwnProperty;
  var status = { isHttp: typeof location !== 'undefined' && /^https?:$/i.test(location.protocol || ''), authenticated: false, user: null, providers: null, syncState: 'idle', lastSyncedAt: 0, error: '' };
  var debounceTimer = null, applyingRemote = false, gsiLoadingPromise = null, flushInFlight = null;

  function stripMap(obj) {
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return {};
    var out = {};
    Object.keys(obj).forEach(function (k) { if (!UNSAFE[k]) out[k] = obj[k]; });
    return out;
  }
  function readMutAt() { try { var v = Number(global.localStorage && global.localStorage.getItem(KEY_MUT_AT)); return Number.isFinite(v) && v > 0 ? v : 0; } catch (_) { return 0; } }
  function touchMutAt(ts) { try { if (global.localStorage) global.localStorage.setItem(KEY_MUT_AT, String(Math.max(readMutAt(), Number(ts) || Date.now()))); } catch (_) {} }
  function accountIdOf(user) { return (user && (user.id || user.sub || user.email)) ? String(user.id || user.sub || user.email) : ''; }
  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

  function mergeScores(aVal, bVal) {
    var aObj = (!Array.isArray(aVal) && aVal && typeof aVal === 'object') ? aVal : null;
    var bObj = (!Array.isArray(bVal) && bVal && typeof bVal === 'object') ? bVal : null;
    var aArr = Array.isArray(aVal) ? aVal : (aObj && Array.isArray(aObj.answers) ? aObj.answers : []);
    var bArr = Array.isArray(bVal) ? bVal : (bObj && Array.isArray(bObj.answers) ? bObj.answers : []);
    var len = Math.max(aArr.length, bArr.length), out = [];
    for (var i = 0; i < len; i++) {
      var a = aArr[i], b = bArr[i];
      var rA = QUIZ_RANK[String(a === 1 || a === 0 || a === -1 ? a : null)] || 0;
      var rB = QUIZ_RANK[String(b === 1 || b === 0 || b === -1 ? b : null)] || 0;
      out.push(rA >= rB ? (rA ? a : null) : (rB ? b : null));
    }
    if (aObj || bObj) return Object.assign({}, aObj || {}, bObj || {}, { answers: out, isSubmitted: Boolean((aObj && aObj.isSubmitted) || (bObj && bObj.isSubmitted)) });
    return out;
  }

  function mergeRatings(aVal, bVal) {
    var isArrA = Array.isArray(aVal), isArrB = Array.isArray(bVal);
    if ((aVal && !isArrA && typeof aVal === 'object') || (bVal && !isArrB && typeof bVal === 'object')) {
      var outObj = {}, copyObj = function (src) {
        if (!src || typeof src !== 'object') return;
        if (Array.isArray(src)) src.forEach(function (v, idx) { if (v === 0 || v === 1 || v === 2) outObj[String(idx)] = outObj[String(idx)] == null ? v : Math.max(outObj[String(idx)], v); });
        else Object.keys(stripMap(src)).forEach(function (k) { var v = src[k]; if (v === 0 || v === 1 || v === 2) outObj[k] = outObj[k] == null ? v : Math.max(outObj[k], v); });
      };
      copyObj(aVal); copyObj(bVal);
      return outObj;
    }
    var aArr = isArrA ? aVal : [], bArr = isArrB ? bVal : [], len = Math.max(aArr.length, bArr.length), out = [];
    for (var i = 0; i < len; i++) {
      var a = (aArr[i] === 0 || aArr[i] === 1 || aArr[i] === 2) ? aArr[i] : null;
      var b = (bArr[i] === 0 || bArr[i] === 1 || bArr[i] === 2) ? bArr[i] : null;
      out.push(a === null ? b : b === null ? a : Math.max(a, b));
    }
    return out;
  }

  function lessonPctNum(v) {
    if (typeof v === 'number') return Math.max(0, Math.min(100, Math.round(v)));
    return (v && typeof v === 'object' && typeof v.pct === 'number') ? Math.max(0, Math.min(100, Math.round(v.pct))) : 0;
  }
  function mergeLesson(aVal, bVal) {
    var pct = Math.max(lessonPctNum(aVal), lessonPctNum(bVal));
    if ((aVal && typeof aVal === 'object') || (bVal && typeof bVal === 'object')) {
      return Object.assign({}, (aVal && typeof aVal === 'object' ? aVal : {}), (bVal && typeof bVal === 'object' ? bVal : {}), { pct: pct });
    }
    return pct;
  }

  function mergeEnvelopes(aEnv, bEnv) {
    var a = aEnv || {}, b = bEnv || {}, aReset = Number(a.resetAt) || 0, bReset = Number(b.resetAt) || 0, rAt = Math.max(aReset, bReset);
    var aP = a.profile || {}, bP = b.profile || {};
    var p = (Number(bP.profileUpdatedAt) || 0) >= (Number(aP.profileUpdatedAt) || 0) ? (Object.keys(bP).length ? bP : aP) : aP;
    var aS = aReset < rAt ? { q: {}, e: {}, l: {}, lastVisited: null } : (a.state || {});
    var bS = bReset < rAt ? { q: {}, e: {}, l: {}, lastVisited: null } : (b.state || {});
    var nextQ = {}, nextE = {}, nextL = {};
    Object.keys(stripMap(aS.q)).concat(Object.keys(stripMap(bS.q))).forEach(function (k) { if (!hasOwn.call(nextQ, k)) nextQ[k] = mergeScores((aS.q || {})[k], (bS.q || {})[k]); });
    Object.keys(stripMap(aS.e)).concat(Object.keys(stripMap(bS.e))).forEach(function (k) { if (!hasOwn.call(nextE, k)) nextE[k] = mergeRatings((aS.e || {})[k], (bS.e || {})[k]); });
    Object.keys(stripMap(aS.l)).concat(Object.keys(stripMap(bS.l))).forEach(function (k) { if (!hasOwn.call(nextL, k)) nextL[k] = mergeLesson((aS.l || {})[k], (bS.l || {})[k]); });
    var lvA = aS.lastVisited && (!rAt || (Number(aS.lastVisited.at) || 0) > rAt) ? aS.lastVisited : null;
    var lvB = bS.lastVisited && (!rAt || (Number(bS.lastVisited.at) || 0) > rAt) ? bS.lastVisited : null;
    var nextLv = !lvA ? lvB : (!lvB ? lvA : ((Number(lvA.at) || 0) >= (Number(lvB.at) || 0) ? lvA : lvB));
    var out = { profile: p, state: { q: nextQ, e: nextE, l: nextL, lastVisited: nextLv }, updatedAt: Math.max(Number(a.updatedAt) || 0, Number(b.updatedAt) || 0, rAt) };
    if (rAt > 0) out.resetAt = rAt;
    if (global.MathFlowResumeStore && typeof global.MathFlowResumeStore.mergeCloudResumes === 'function') {
      var res = global.MathFlowResumeStore.mergeCloudResumes(aReset < rAt ? null : a.resume, bReset < rAt ? null : b.resume, rAt);
      if (['lessons', 'lessonActiveSheet', 'quizzes', 'chapterActiveQuiz', 'exercises'].some(function (k) { return res[k] && Object.keys(res[k]).length; })) out.resume = res;
    }
    if (global.MathFlowUnlocks && typeof global.MathFlowUnlocks.mergeStickyUnlocks === 'function') {
      var uA = aReset < rAt ? {} : a.unlocks;
      var uB = bReset < rAt ? {} : b.unlocks;
      var u = global.MathFlowUnlocks.mergeStickyUnlocks(uA, uB);
      if (Object.keys(u).length) out.unlocks = u;
    }
    return out;
  }

  function mergeRemoteEnvelope(env) {
    var app = global.MathFlowApp;
    if (!app || !env || typeof env !== 'object') return;
    applyingRemote = true;
    try {
      var localResetAt = typeof app.getResetAt === 'function' ? app.getResetAt() : 0;
      var remoteResetAt = Number(env.resetAt) || 0;
      var rAt = Math.max(localResetAt, remoteResetAt);
      if (rAt > localResetAt && typeof app.setResetAt === 'function') app.setResetAt(rAt);
      var curP = app.getProfile(), remP = stripMap(env.profile);
      if ((Number(remP.profileUpdatedAt) || 0) >= (Number(curP.profileUpdatedAt) || 0) && Object.keys(remP).length) {
        app.updateProfile(Object.assign({}, remP, { profileUpdatedAt: Math.max(Number(remP.profileUpdatedAt) || 0, Number(curP.profileUpdatedAt) || 0) }), { silent: true });
      }
      var curS = app.getState(), mutAt = Math.max(readMutAt(), (curS.lastVisited && Number(curS.lastVisited.at)) || 0);
      var localEnv = {
        profile: curP, state: curS, resetAt: localResetAt, updatedAt: mutAt,
        resume: global.MathFlowResumeStore ? global.MathFlowResumeStore.exportCloudResume() : null,
        unlocks: global.MathFlowUnlocks && global.MathFlowUnlocks.readStickyUnlocks ? global.MathFlowUnlocks.readStickyUnlocks() : null
      };
      var merged = mergeEnvelopes(localEnv, env);
      app.saveState(merged.state, { silent: true });
      if (global.MathFlowUnlocks && typeof global.MathFlowUnlocks.writeStickyUnlocks === 'function') {
        if (merged.unlocks && Object.keys(merged.unlocks).length) global.MathFlowUnlocks.writeStickyUnlocks(merged.unlocks);
        else if (rAt > 0) global.MathFlowUnlocks.clearStickyUnlocks();
      }
      if (global.MathFlowResumeStore && typeof global.MathFlowResumeStore.applyCloudResume === 'function') {
        if (rAt > localResetAt) global.MathFlowResumeStore.clearAll();
        global.MathFlowResumeStore.applyCloudResume(merged.resume || null, rAt);
      }
      if (typeof app.route === 'function') app.route();
    } finally {
      applyingRemote = false;
    }
  }

  function buildEnvelope() {
    var app = global.MathFlowApp;
    var rAt = app && typeof app.getResetAt === 'function' ? app.getResetAt() : 0;
    var st = app ? app.getState() : { q: {}, e: {}, l: {}, lastVisited: null };
    if (st && st.lastVisited && !st.lastVisited.classId && app && app.getActiveClassId) {
      st = Object.assign({}, st, { lastVisited: Object.assign({ classId: app.getActiveClassId() }, st.lastVisited) });
    }
    var env = { profile: app ? app.getProfile() : {}, state: st, updatedAt: Math.max(Date.now(), rAt || 0, readMutAt() || 0) };
    if (rAt > 0) env.resetAt = rAt;
    var res = global.MathFlowResumeStore && global.MathFlowResumeStore.exportCloudResume ? global.MathFlowResumeStore.exportCloudResume() : null;
    if (res) env.resume = res;
    var ul = global.MathFlowUnlocks && global.MathFlowUnlocks.readStickyUnlocks ? global.MathFlowUnlocks.readStickyUnlocks() : null;
    if (ul && Object.keys(ul).length) env.unlocks = ul;
    return env;
  }

  async function apiJson(url, opts) {
    var res = await global.fetch(url, Object.assign({
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' }
    }, opts || {}));
    var data = await res.json().catch(function () { return {}; });
    if (!res.ok) throw new Error(data.error || ('http_' + res.status));
    return data;
  }

  function setState(patch) {
    Object.assign(status, patch);
    var box = typeof document !== 'undefined' && document.getElementById('cloud-account-box');
    if (box) renderAccountBox(box);
  }

  async function queueCompacted(env) {
    if (!global.MathFlowOfflineDB) return;
    var acct = accountIdOf(status.user);
    if (typeof global.MathFlowOfflineDB.peekOutbox === 'function' && typeof global.MathFlowOfflineDB.replaceOutboxWith === 'function') {
      var prev = await global.MathFlowOfflineDB.peekOutbox(acct || undefined);
      var combined = prev.reduce(function (acc, item) { return mergeEnvelopes(acc, item && item.envelope); }, env);
      await global.MathFlowOfflineDB.replaceOutboxWith(combined, acct || undefined);
    } else {
      await global.MathFlowOfflineDB.enqueueOutbox(env, acct || undefined);
    }
  }

  async function pushNow() {
    if (!status.isHttp || !status.authenticated) return false;
    var env = buildEnvelope();
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      await queueCompacted(env);
      setState({ syncState: 'pending' });
      return false;
    }
    setState({ syncState: 'syncing', error: '' });
    try {
      var res = await apiJson('/api/sync', { method: 'POST', body: JSON.stringify({ envelope: env }) });
      if (res.envelope) mergeRemoteEnvelope(res.envelope);
      setState({ syncState: 'synced', lastSyncedAt: Date.now(), error: '' });
      return true;
    } catch (err) {
      await queueCompacted(env);
      setState({ syncState: 'error', error: err.message || 'sync_error' });
      return false;
    }
  }

  async function flushOutbox() {
    if (flushInFlight) return flushInFlight;
    flushInFlight = (async function () {
      if (!status.isHttp || !status.authenticated || !global.MathFlowOfflineDB) return 0;
      if (typeof navigator !== 'undefined' && navigator.onLine === false) return 0;
      var acct = accountIdOf(status.user);
      var items = await global.MathFlowOfflineDB.peekOutbox(acct || undefined);
      if (!items.length) return 0;
      var merged = items.reduce(function (acc, it) { return mergeEnvelopes(acc, it && it.envelope); }, null);
      var res = await apiJson('/api/sync', { method: 'POST', body: JSON.stringify({ envelope: merged }) });
      if (res.envelope) mergeRemoteEnvelope(res.envelope);
      await global.MathFlowOfflineDB.clearOutboxIds(items.map(function (i) { return i.id; }));
      setState({ syncState: 'synced', lastSyncedAt: Date.now(), error: '' });
      return items.length;
    })().finally(function () { flushInFlight = null; });
    return flushInFlight;
  }

  async function purgeLocalSession(prevOwner) {
    var app = global.MathFlowApp;
    clearTimeout(debounceTimer);
    if (app && typeof app.resetProgress === 'function') app.resetProgress({ silent: true, clearResetAt: true });
    if (app && typeof app.setAccountOwner === 'function') app.setAccountOwner(null);
    try { if (global.localStorage) global.localStorage.removeItem(KEY_MUT_AT); } catch (_) {}
    if (global.MathFlowOfflineDB && typeof global.MathFlowOfflineDB.clearAllOutbox === 'function') {
      await global.MathFlowOfflineDB.clearAllOutbox(prevOwner || undefined).catch(function () {});
    }
  }

  async function reconcileAccountOwner(user) {
    var app = global.MathFlowApp;
    var nextId = accountIdOf(user);
    if (!app || !nextId || typeof app.getAccountOwner !== 'function') return;
    var prevId = app.getAccountOwner();
    if (prevId && prevId !== nextId) await purgeLocalSession(prevId);
    if (typeof app.setAccountOwner === 'function') app.setAccountOwner(nextId);
  }

  function scheduleSync(immediate) {
    if (applyingRemote || !status.isHttp || !status.authenticated) return;
    clearTimeout(debounceTimer);
    if (immediate) { pushNow(); return; }
    setState({ syncState: 'pending' });
    debounceTimer = setTimeout(pushNow, 900);
  }

  function loadGsiScript() {
    if (!status.isHttp || (global.google && global.google.accounts && global.google.accounts.id)) {
      return Promise.resolve(Boolean(global.google && global.google.accounts));
    }
    if (gsiLoadingPromise) return gsiLoadingPromise;
    gsiLoadingPromise = new Promise(function (resolve) {
      var s = document.createElement('script');
      s.src = 'https://accounts.google.com/gsi/client';
      s.async = true;
      s.defer = true;
      s.onload = function () { resolve(true); };
      s.onerror = function () { resolve(false); };
      document.head.appendChild(s);
    });
    return gsiLoadingPromise;
  }

  async function signInWithToken(idToken) {
    var app = global.MathFlowApp;
    var p = app ? app.getProfile() : {};
    var data = await apiJson('/api/auth?action=google', {
      method: 'POST',
      body: JSON.stringify({ idToken: idToken, classId: p.cls, firstName: p.fn, lastName: p.ln, schoolName: p.sc })
    });
    await reconcileAccountOwner(data.user);
    setState({ authenticated: true, user: data.user, providers: data.providers || status.providers, syncState: 'synced', lastSyncedAt: Date.now() });
    if (data.cloudState) mergeRemoteEnvelope(data.cloudState);
    await pushNow();
    return data;
  }

  async function logout() {
    var prevOwner = accountIdOf(status.user);
    if (status.isHttp) {
      await apiJson('/api/auth?action=logout', { method: 'POST', body: '{}' }).catch(function () {});
    }
    await purgeLocalSession(prevOwner);
    setState({ authenticated: false, user: null, syncState: 'idle', error: '' });
  }

  async function refreshSession() {
    if (!status.isHttp) { setState({ syncState: 'offline' }); return; }
    try {
      var me = await apiJson('/api/auth?action=me', { method: 'GET' });
      if (me.authenticated && me.user) await reconcileAccountOwner(me.user);
      setState({ authenticated: Boolean(me.authenticated), user: me.user || null, providers: me.storage || null, syncState: me.authenticated ? 'syncing' : 'idle' });
      if (me.authenticated) {
        await flushOutbox().catch(function () {});
        var synced = await apiJson('/api/sync', { method: 'GET' }).catch(function () { return null; });
        if (synced && synced.envelope) mergeRemoteEnvelope(synced.envelope);
        setState({ syncState: 'synced', lastSyncedAt: Date.now() });
      }
    } catch (_) {
      setState({ syncState: navigator && navigator.onLine === false ? 'offline' : 'idle' });
    }
  }

  function renderAccountBox(box) {
    if (!box) return;
    if (!status.isHttp) {
      box.innerHTML = '<div class="mf-cloud-head"><span class="mf-cloud-title"><span class="mf-sync-dot" data-state="offline"></span>Sauvegarde autonome locale</span><span class="mf-cloud-pill">file://</span></div><p class="hint" style="margin:0">Mode hors-ligne local actif sur cet appareil.</p>';
      return;
    }
    var badgeLbl = status.syncState === 'synced' ? 'Synchronisé' : status.syncState === 'syncing' ? 'Synchro...' : status.syncState === 'pending' ? 'En attente' : status.syncState === 'error' ? 'Erreur réseau' : 'Local';
    var storageChip = (status.providers && (status.providers.redisEnabled || status.providers.firestoreEnabled))
      ? ((status.providers.redisEnabled ? 'Redis' : '') + (status.providers.redisEnabled && status.providers.firestoreEnabled ? ' + ' : '') + (status.providers.firestoreEnabled ? 'Firestore' : ''))
      : 'Cloud prêt';
    if (status.authenticated && status.user) {
      box.innerHTML = '<div class="mf-cloud-head"><span class="mf-cloud-title"><span class="mf-sync-dot" data-state="' + esc(status.syncState) + '"></span>' + esc(badgeLbl) + '</span><span class="mf-cloud-pill">' + esc(storageChip) + '</span></div>'
        + '<div class="mf-cloud-user">' + (status.user.picture ? '<img class="mf-cloud-avatar" src="' + esc(status.user.picture) + '" alt="">' : '')
        + '<div class="mf-cloud-meta"><strong>' + esc(status.user.name || 'Élève') + '</strong><span>' + esc(status.user.email || 'Compte synchronisé') + '</span></div></div>'
        + '<div class="mf-cloud-actions"><button type="button" class="mf-cloud-link" data-cloud-sync>Synchroniser</button><button type="button" class="mf-cloud-link" data-cloud-logout>Déconnexion</button><a class="mf-cloud-link" href="/">Portail MathPlus →</a></div>';
    } else {
      var canGis = Boolean(status.providers && status.providers.googleEnabled && status.providers.googleClientId);
      box.innerHTML = '<div class="mf-cloud-head"><span class="mf-cloud-title"><span class="mf-sync-dot" data-state="' + esc(status.syncState) + '"></span>Synchronisation Cloud</span><span class="mf-cloud-pill">' + esc(storageChip) + '</span></div>'
        + (canGis ? '<div id="mf-gis-btn"></div>' : '<p class="hint" style="margin:0">Progression locale active. Connectez Google sur MathPlus ou configurez GOOGLE_CLIENT_ID.</p>')
        + '<div class="mf-cloud-actions"><a class="mf-cloud-link" href="/">Ouvrir le Portail MathPlus →</a></div>';
      if (canGis) {
        loadGsiScript().then(function (ok) {
          var slot = box.querySelector('#mf-gis-btn');
          if (!ok || !slot || !global.google || !global.google.accounts || !global.google.accounts.id) return;
          global.google.accounts.id.initialize({
            client_id: status.providers.googleClientId,
            callback: function (resp) { if (resp && resp.credential) signInWithToken(resp.credential).catch(function () {}); }
          });
          global.google.accounts.id.renderButton(slot, { theme: 'outline', size: 'medium', text: 'signin_with', shape: 'pill' });
        });
      }
    }
    box.onclick = function (e) {
      if (e.target.closest('[data-cloud-sync]')) pushNow();
      if (e.target.closest('[data-cloud-logout]')) logout();
    };
  }

  function init() {
    var app = global.MathFlowApp;
    if (app && typeof app.on === 'function') {
      app.on('state:change', function () { touchMutAt(); scheduleSync(false); });
      app.on('profile:change', function () { touchMutAt(); scheduleSync(false); });
      app.on('state:reset', function () { touchMutAt(); scheduleSync(true); });
    }
    if (status.isHttp && typeof global.addEventListener === 'function') {
      global.addEventListener('online', function () { flushOutbox().catch(function () {}); });
      global.addEventListener('offline', function () { setState({ syncState: 'offline' }); });
      refreshSession();
    } else {
      setState({ syncState: 'offline' });
    }
  }

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else Promise.resolve().then(init);
  }

  var api = { init: init, refreshSession: refreshSession, pushNow: pushNow, flushOutbox: flushOutbox, scheduleSync: scheduleSync, logout: logout, renderAccountBox: renderAccountBox, mergeRemoteEnvelope: mergeRemoteEnvelope, mergeEnvelopes: mergeEnvelopes, buildEnvelope: buildEnvelope, getStatus: function () { return Object.assign({}, status); } };
  global.MathFlowCloud = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
