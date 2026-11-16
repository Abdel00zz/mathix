/**
 * MathFlow — Stockage Hors-Ligne IndexedDB (LRU contenu + File de synchro + Prefetch)
 * Fonctionne sans erreur en mode prive, file:// et navigateur headless.
 */
(function (global) {
  'use strict';

  var DB_NAME = 'mathflow-apprendre-v1';
  var DB_VERSION = 1;
  var STORE_CONTENT = 'content_cache';
  var STORE_OUTBOX = 'sync_outbox';
  var STORE_META = 'meta';
  var MAX_CACHE_ITEMS = 120;
  var MAX_OUTBOX_ITEMS = 50;

  var dbPromise = null;
  var memContent = new Map();
  var memOutbox = [];
  var memMeta = new Map();
  var nextOutboxId = 1;

  function hasIdb() {
    try {
      return typeof global.indexedDB !== 'undefined' && global.indexedDB !== null;
    } catch (_) {
      return false;
    }
  }

  function openDb() {
    if (!hasIdb()) return Promise.resolve(null);
    if (dbPromise) return dbPromise;
    dbPromise = new Promise(function (resolve) {
      try {
        var req = global.indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = function (e) {
          var db = e.target.result;
          if (!db.objectStoreNames.contains(STORE_CONTENT)) {
            db.createObjectStore(STORE_CONTENT, { keyPath: 'path' });
          }
          if (!db.objectStoreNames.contains(STORE_OUTBOX)) {
            db.createObjectStore(STORE_OUTBOX, { keyPath: 'id', autoIncrement: true });
          }
          if (!db.objectStoreNames.contains(STORE_META)) {
            db.createObjectStore(STORE_META, { keyPath: 'key' });
          }
        };
        req.onsuccess = function () { resolve(req.result); };
        req.onerror = function () { resolve(null); };
      } catch (_) {
        resolve(null);
      }
    });
    return dbPromise;
  }

  function withStore(storeName, mode, fn, fallback) {
    return openDb().then(function (db) {
      if (!db) return fallback();
      return new Promise(function (resolve) {
        try {
          var tx = db.transaction(storeName, mode);
          var store = tx.objectStore(storeName);
          fn(store, resolve, tx);
          tx.onerror = function () { resolve(fallback()); };
        } catch (_) {
          resolve(fallback());
        }
      });
    });
  }

  function getCachedJson(path) {
    var key = String(path || '');
    return withStore(STORE_CONTENT, 'readonly', function (store, resolve) {
      var req = store.get(key);
      req.onsuccess = function () { resolve(req.result ? req.result.data : null); };
      req.onerror = function () { resolve(null); };
    }, function () {
      var hit = memContent.get(key);
      return hit ? hit.data : null;
    });
  }

  function putCachedJson(path, data) {
    var key = String(path || '');
    var entry = { path: key, data: data, at: Date.now() };
    if (memContent.has(key)) memContent.delete(key);
    memContent.set(key, entry);
    while (memContent.size > MAX_CACHE_ITEMS) {
      var firstKey = memContent.keys().next().value;
      if (!firstKey) break;
      memContent.delete(firstKey);
    }
    return withStore(STORE_CONTENT, 'readwrite', function (store, resolve, tx) {
      store.put(entry);
      var cntReq = store.count();
      cntReq.onsuccess = function () {
        if ((cntReq.result || 0) <= MAX_CACHE_ITEMS) return;
        var allReq = store.getAll();
        allReq.onsuccess = function () {
          var rows = Array.isArray(allReq.result) ? allReq.result : [];
          if (rows.length <= MAX_CACHE_ITEMS) return;
          rows.sort(function (a, b) { return (Number(a && a.at) || 0) - (Number(b && b.at) || 0); });
          for (var i = 0; i < rows.length - MAX_CACHE_ITEMS; i++) {
            try { store.delete(rows[i].path); } catch (_) {}
          }
        };
      };
      tx.oncomplete = function () { resolve(true); };
    }, function () { return true; });
  }

  function enqueueOutbox(envelope, accountId) {
    var acct = accountId ? String(accountId) : null;
    var item = { envelope: envelope, accountId: acct, createdAt: Date.now() };
    return withStore(STORE_OUTBOX, 'readwrite', function (store, resolve, tx) {
      var addedId = null;
      var req = store.add(item);
      req.onsuccess = function () {
        addedId = req.result;
        var allReq = store.getAll();
        allReq.onsuccess = function () {
          var rows = Array.isArray(allReq.result) ? allReq.result : [];
          if (rows.length <= MAX_OUTBOX_ITEMS) return;
          rows.sort(function (a, b) { return (Number(a && a.createdAt) || 0) - (Number(b && b.createdAt) || 0); });
          for (var i = 0; i < rows.length - MAX_OUTBOX_ITEMS; i++) {
            try { store.delete(rows[i].id); } catch (_) {}
          }
        };
      };
      tx.oncomplete = function () { resolve(addedId); };
      req.onerror = function () { resolve(null); };
    }, function () {
      var id = nextOutboxId++;
      memOutbox.push({ id: id, envelope: envelope, accountId: acct, createdAt: item.createdAt });
      while (memOutbox.length > MAX_OUTBOX_ITEMS) memOutbox.shift();
      return id;
    });
  }

  function peekOutbox(accountId) {
    var filterAcct = accountId ? String(accountId) : '';
    var match = function (x) { return !filterAcct || !x.accountId || x.accountId === filterAcct; };
    return withStore(STORE_OUTBOX, 'readonly', function (store, resolve) {
      var req = store.getAll();
      req.onsuccess = function () {
        var rows = Array.isArray(req.result) ? req.result : [];
        resolve(rows.filter(match));
      };
      req.onerror = function () { resolve([]); };
    }, function () {
      return memOutbox.filter(match);
    });
  }

  function replaceOutboxWith(envelope, accountId) {
    var acct = accountId ? String(accountId) : null;
    var item = { envelope: envelope, accountId: acct, createdAt: Date.now() };
    memOutbox = [{ id: nextOutboxId++, envelope: envelope, accountId: acct, createdAt: item.createdAt }];
    return withStore(STORE_OUTBOX, 'readwrite', function (store, resolve, tx) {
      var newId = null;
      store.clear();
      var req = store.add(item);
      req.onsuccess = function () { newId = req.result; };
      tx.oncomplete = function () { resolve(newId); };
    }, function () {
      return memOutbox[0].id;
    });
  }

  function clearAllOutbox(accountId) {
    var acct = accountId ? String(accountId) : '';
    if (!acct) {
      memOutbox = [];
      return withStore(STORE_OUTBOX, 'readwrite', function (store, resolve, tx) {
        store.clear();
        tx.oncomplete = function () { resolve(true); };
      }, function () { return true; });
    }
    memOutbox = memOutbox.filter(function (x) { return x.accountId !== acct; });
    return withStore(STORE_OUTBOX, 'readwrite', function (store, resolve, tx) {
      var req = store.getAll();
      req.onsuccess = function () {
        var rows = Array.isArray(req.result) ? req.result : [];
        rows.forEach(function (r) { if (r && r.accountId === acct) try { store.delete(r.id); } catch (_) {} });
      };
      tx.oncomplete = function () { resolve(true); };
    }, function () { return true; });
  }

  function clearOutboxIds(ids) {
    var idSet = new Set(Array.isArray(ids) ? ids : []);
    if (!idSet.size) return Promise.resolve(0);
    memOutbox = memOutbox.filter(function (x) { return !idSet.has(x.id); });
    return withStore(STORE_OUTBOX, 'readwrite', function (store, resolve, tx) {
      idSet.forEach(function (id) { try { store.delete(id); } catch (_) {} });
      tx.oncomplete = function () { resolve(idSet.size); };
    }, function () { return idSet.size; });
  }

  function setMeta(key, value) {
    var k = String(key || '');
    memMeta.set(k, value);
    return withStore(STORE_META, 'readwrite', function (store, resolve, tx) {
      store.put({ key: k, value: value, at: Date.now() });
      tx.oncomplete = function () { resolve(true); };
    }, function () { return true; });
  }

  function getMeta(key) {
    var k = String(key || '');
    return withStore(STORE_META, 'readonly', function (store, resolve) {
      var req = store.get(k);
      req.onsuccess = function () { resolve(req.result ? req.result.value : null); };
      req.onerror = function () { resolve(null); };
    }, function () { return memMeta.has(k) ? memMeta.get(k) : null; });
  }

  var prefetchedKeys = new Set();
  function scheduleIdle(fn) {
    if (typeof global.requestIdleCallback === 'function') {
      global.requestIdleCallback(fn, { timeout: 1500 });
    } else {
      setTimeout(fn, 180);
    }
  }

  function prefetchChapter(classId, chapterId) {
    var cs = global.ContentService;
    if (!cs || !chapterId) return Promise.resolve(false);
    var key = String(classId || '2eme-bac-sc-ex') + ':' + String(chapterId);
    if (prefetchedKeys.has(key)) return Promise.resolve(false);
    prefetchedKeys.add(key);

    return new Promise(function (resolve) {
      scheduleIdle(function () {
        Promise.allSettled([
          cs.getChapterManifest(chapterId, classId),
          cs.getRevisionSheet(chapterId, classId).then(function (d) { return putCachedJson('rev:' + key, d); }),
          cs.getQuiz(chapterId, classId).then(function (d) { return putCachedJson('quiz:' + key, d); }),
          cs.getExercise(chapterId, classId).then(function (d) { return putCachedJson('exo:' + key, d); })
        ]).then(function () { resolve(true); }).catch(function () { resolve(false); });
      });
    });
  }

  var api = {
    getCachedJson: getCachedJson,
    putCachedJson: putCachedJson,
    enqueueOutbox: enqueueOutbox,
    peekOutbox: peekOutbox,
    clearOutboxIds: clearOutboxIds,
    replaceOutboxWith: replaceOutboxWith,
    clearAllOutbox: clearAllOutbox,
    setMeta: setMeta,
    getMeta: getMeta,
    prefetchChapter: prefetchChapter
  };

  global.MathFlowOfflineDB = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
