import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import test from 'node:test';

const source = await fs.readFile(new URL('../scripts/pwa-worker.js', import.meta.url), 'utf8');
const origin = 'https://apprendre.example';

function response(text, type = 'text/html') {
  const res = new Response(text, { headers: { 'Content-Type': type } });
  Object.defineProperty(res, 'type', { value: 'basic' });
  const originalClone = res.clone.bind(res);
  res.clone = () => {
    const clone = originalClone();
    Object.defineProperty(clone, 'type', { value: 'basic' });
    return clone;
  };
  return res;
}

function harness() {
  const stores = new Map();
  const listeners = new Map();
  const keyOf = (req) => new URL(typeof req === 'string' ? req : req.url, origin).href;
  const caches = {
    keys: async () => [...stores.keys()],
    delete: async (name) => stores.delete(name),
    open: async (name) => {
      if (!stores.has(name)) stores.set(name, new Map());
      const entries = stores.get(name);
      return {
        put: async (req, res) => entries.set(keyOf(req), res),
        match: async (req) => entries.get(keyOf(req))?.clone(),
        keys: async () => [...entries.keys()].map((url) => new Request(url)),
        delete: async (req) => entries.delete(keyOf(req)),
        add: async (url) => entries.set(keyOf(url), response('asset', 'image/png')),
      };
    },
  };
  const state = { fetch: async () => response('page'), skipped: 0, claimed: 0 };
  const context = vm.createContext({
    URL, Request, Response, caches,
    fetch: (...args) => state.fetch(...args),
    self: {
      location: { origin },
      addEventListener: (name, handler) => listeners.set(name, handler),
      skipWaiting: () => state.skipped++,
      clients: { claim: async () => state.claimed++ },
    },
  });
  vm.runInContext(source, context);
  const run = async (name, values = {}) => {
    const waits = [];
    let result;
    listeners.get(name)({
      ...values,
      waitUntil: (promise) => waits.push(promise),
      respondWith: (promise) => { result = promise; },
    });
    const res = await result;
    for (let i = 0; i < waits.length; i++) await waits[i];
    return res;
  };
  const request = (path, opts = {}) => ({ url: new URL(path, origin).href, method: 'GET', headers: new Headers(), mode: 'navigate', ...opts });
  const send = (data) => run('message', { data });
  return { stores, state, run, request, send };
}

test('activation preserves caches belonging to the portal and maquette', async () => {
  const h = harness();
  h.stores.set('workbox-precache-v2', new Map());
  h.stores.set('mathflow-apprendre-v1', new Map());
  h.stores.set('mathflow-apprendre-next-v4', new Map());
  await h.run('activate');
  assert(h.stores.has('workbox-precache-v2'));
  assert(h.stores.has('mathflow-apprendre-v1'));
  assert(!h.stores.has('mathflow-apprendre-next-v4'));
  assert.equal(h.state.claimed, 1);
});

test('install leaves an update waiting while an older client is open', async () => {
  const h = harness();
  await h.run('install');
  assert.equal(h.state.skipped, 0);
});

test('API, RSC, server actions and external requests never enter the cache', async () => {
  const h = harness();
  let fetched = 0;
  h.state.fetch = async () => { fetched++; return response('secret'); };
  for (const req of [
    h.request('/api'), h.request('/api/auth'), h.request('/?_rsc=abc'),
    h.request('/', { headers: new Headers({ RSC: '1' }) }),
    h.request('/', { headers: new Headers({ 'Next-Action': 'a' }) }),
    h.request('https://accounts.google.com'),
  ]) assert.equal(await h.run('fetch', { request: req }), undefined);
  assert.equal(fetched, 0);
  assert.equal(h.stores.size, 0);
});

test('a visited HTML page can be reloaded offline', async () => {
  const h = harness();
  await h.send({ type: 'SET_CLASS', classId: '2eme-bac-sc-ex' });
  await h.run('fetch', { request: h.request('/lecon/continuite') });
  h.state.fetch = async () => { throw new Error('offline'); };
  const res = await h.run('fetch', { request: h.request('/lecon/continuite') });
  assert.equal(await res.text(), 'page');
});

test('an unvisited URL gets an explicit offline page and never the hub HTML', async () => {
  const h = harness();
  h.state.fetch = async () => response('programme');
  await h.run('fetch', { request: h.request('/') });
  h.state.fetch = async () => { throw new Error('offline'); };
  const res = await h.run('fetch', { request: h.request('/lecon/inconnue') });
  assert.equal(res.status, 503);
  const html = await res.text();
  assert.match(html, /Vous êtes hors connexion/);
  assert.match(html, /Pages déjà consultées/);
  assert.doesNotMatch(html, /programme/);
});

test('changing class removes previous class HTML but preserves static assets', async () => {
  const h = harness();
  await h.send({ type: 'SET_CLASS', classId: '2eme-bac-sc-ex' });
  await h.run('fetch', { request: h.request('/lecon/suites') });
  await h.run('install');
  await h.send({ type: 'SET_CLASS', classId: '1ere-bac-sc-math' });
  h.state.fetch = async () => { throw new Error('offline'); };
  const res = await h.run('fetch', { request: h.request('/lecon/suites') });
  assert.equal(res.status, 503);
  assert([...h.stores.entries()].some(([name, cache]) => name.endsWith('-assets') && cache.size > 0));
});

test('a response started before class change cannot repopulate cleared HTML', async () => {
  const h = harness();
  await h.send({ type: 'SET_CLASS', classId: '2eme-bac-sc-ex' });
  let finish;
  let started;
  const loading = new Promise((resolve) => { started = resolve; });
  h.state.fetch = async () => { started(); return new Promise((resolve) => { finish = resolve; }); };
  const nav = h.run('fetch', { request: h.request('/lecon/suites') });
  await loading;
  await h.send({ type: 'SET_CLASS', classId: '1ere-bac-sc-math' });
  finish(response('ancienne classe'));
  await nav;
  h.state.fetch = async () => { throw new Error('offline'); };
  const res = await h.run('fetch', { request: h.request('/lecon/suites') });
  assert.equal(res.status, 503);
});

test('JSON fallback rejects an HTML response at a data URL', async () => {
  const h = harness();
  await h.run('fetch', { request: h.request('/data/course.json', { mode: 'cors' }) });
  h.state.fetch = async () => { throw new Error('offline'); };
  const res = await h.run('fetch', { request: h.request('/data/course.json', { mode: 'cors' }) });
  assert.equal(res.status, 503);
  assert.deepEqual(await res.json(), { error: 'offline' });
});

test('cached JSON remains available offline', async () => {
  const h = harness();
  h.state.fetch = async () => response('{"title":"Cours"}', 'application/json');
  const req = h.request('/data/course.json', { mode: 'cors' });
  await h.run('fetch', { request: req });
  h.state.fetch = async () => { throw new Error('offline'); };
  assert.deepEqual(await (await h.run('fetch', { request: req })).json(), { title: 'Cours' });
});

test('warmup caches current HTML and same-origin static chunks only', async () => {
  const h = harness();
  const fetched = [];
  h.state.fetch = async (url) => {
    fetched.push(url);
    return response('content', url.includes('/_next/static/') ? 'text/javascript' : 'text/html');
  };
  await h.send({ type: 'WARM_PAGE', url: `${origin}/lecon/continuite`, assets: [`${origin}/_next/static/a.js`, `${origin}/api/auth`, 'https://other.example/a.js'] });
  assert.equal(fetched.length, 2);
  h.state.fetch = async () => { throw new Error('offline'); };
  assert.equal(await (await h.run('fetch', { request: h.request('/lecon/continuite') })).text(), 'content');
  assert.equal(await (await h.run('fetch', { request: h.request('/_next/static/a.js', { mode: 'cors' }) })).text(), 'content');
});

test('navigation cache is bounded to 60 documents', async () => {
  const h = harness();
  for (let i = 0; i < 65; i++) await h.run('fetch', { request: h.request(`/lecon/chapitre-${i}`) });
  const pageCache = [...h.stores.entries()].find(([name]) => name.endsWith('-pages'))[1];
  assert.equal(pageCache.size, 60);
  assert(!pageCache.has(`${origin}/lecon/chapitre-0`));
});

test('warmup avoids a second SSR fetch for HTML already captured by navigation', async () => {
  const h = harness();
  let fetched = 0;
  h.state.fetch = async () => { fetched++; return response('page'); };
  await h.run('fetch', { request: h.request('/lecon/suites') });
  await h.send({ type: 'WARM_PAGE', url: `${origin}/lecon/suites#section-1`, assets: [] });
  assert.equal(fetched, 1);
});
