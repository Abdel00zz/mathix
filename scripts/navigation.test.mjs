import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createNavigationController,
  normalizeRouteKey,
  resolveParentRoute,
  resolveColdStartAncestors,
} from '../assets/js/navigation.js';

/**
 * Simule un objet window.history + sessionStorage fidèle au navigateur
 * pour tester de bout en bout Back, Forward, multi-step Back et Modales.
 */
function createMockBrowser(initialHash = '#/') {
  const entries = [{ state: null, hash: initialHash }];
  let cursor = 0;
  let scrollY = 0;
  const store = new Map();
  let routeDispatchCount = 0;

  const storage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  };

  let onPop = null;

  const browser = {
    entries,
    get cursor() { return cursor; },
    get scrollY() { return scrollY; },
    set scrollY(v) { scrollY = v; },
    get hash() { return entries[cursor].hash; },
    get state() { return entries[cursor].state; },
    get routeDispatchCount() { return routeDispatchCount; },
    storage,
    setPopListener(fn) { onPop = fn; },
    navigate(hash) {
      entries.splice(cursor + 1);
      entries.push({ state: null, hash: hash.startsWith('#') ? hash : `#${hash}` });
      cursor = entries.length - 1;
    },
    back(steps = 1) {
      cursor = Math.max(0, cursor - steps);
      onPop?.(entries[cursor].state, entries[cursor].hash);
    },
    forward(steps = 1) {
      cursor = Math.min(entries.length - 1, cursor + steps);
      onPop?.(entries[cursor].state, entries[cursor].hash);
    },
    createController() {
      const ctrl = createNavigationController({
        getScrollY: () => scrollY,
        setScrollY: (y) => { scrollY = y; },
        getHash: () => entries[cursor].hash,
        getHistoryState: () => entries[cursor].state,
        pushHistoryState: (state, hash) => {
          entries.splice(cursor + 1);
          entries.push({ state, hash: hash || entries[cursor].hash });
          cursor = entries.length - 1;
        },
        replaceHistoryState: (state, hash) => {
          entries[cursor] = { state, hash: hash || entries[cursor].hash };
        },
        goBackNative: () => {
          browser.back(1);
        },
        dispatchRouteChange: () => {
          routeDispatchCount += 1;
        },
        storage,
      });
      onPop = (st) => ctrl.handlePopState(st);
      return ctrl;
    },
  };
  return browser;
}

test('resolveParentRoute résout toute la hiérarchie pédagogique Mathix', () => {
  assert.equal(normalizeRouteKey('eleve/2eme-bac-sc-ex'), '/eleve/2eme-bac-sc-ex');
  assert.equal(resolveParentRoute('#/'), null);
  assert.equal(resolveParentRoute('#/eleve'), null);
  assert.equal(resolveParentRoute('#/dashboard'), null);
  assert.equal(resolveParentRoute('#/studio?path=data/foo.json'), '/dashboard');
  assert.equal(resolveParentRoute('#/eleve/2eme-bac-sc-ex'), '/eleve');
  assert.equal(resolveParentRoute('#/eleve/2eme-bac-sc-ex?tab=examens'), '/eleve/2eme-bac-sc-ex');
  assert.equal(resolveParentRoute('#/eleve/2eme-bac-sc-ex/cadre'), '/eleve/2eme-bac-sc-ex?tab=examens');
  assert.equal(resolveParentRoute('#/eleve/2eme-bac-sc-ex/examen/data%2Fex.json'), '/eleve/2eme-bac-sc-ex?tab=examens');
  assert.equal(resolveParentRoute('#/eleve/2eme-bac-sc-ex/concours/ensa'), '/eleve/2eme-bac-sc-ex?tab=concours');
  assert.equal(resolveParentRoute('#/eleve/2eme-bac-sc-ex/revision/problemes/p1.json'), '/eleve/2eme-bac-sc-ex?tab=problemes');
  assert.equal(resolveParentRoute('#/eleve/2eme-bac-sc-ex/revision/continuite/f.json'), '/eleve/2eme-bac-sc-ex');
  assert.equal(resolveParentRoute('#/eleve/2eme-bac-sc-ex/quiz/continuite/q.json'), '/eleve/2eme-bac-sc-ex');
  assert.equal(resolveParentRoute('#/eleve/2eme-bac-sc-ex/exercices/logarithmes'), '/eleve/2eme-bac-sc-ex');
  assert.equal(
    resolveParentRoute('#/eleve/2eme-bac-sc-ex/exercices/logarithmes?ex=data%2Fex1.json'),
    '/eleve/2eme-bac-sc-ex/exercices/logarithmes',
  );
});

test('resolveColdStartAncestors amorce les liens profonds sans piéger le tableau de bord ni la racine', () => {
  assert.deepEqual(resolveColdStartAncestors('#/'), []);
  assert.deepEqual(resolveColdStartAncestors('#/eleve'), []);
  assert.deepEqual(resolveColdStartAncestors('#/eleve/2eme-bac-sc-ex'), []);
  assert.deepEqual(
    resolveColdStartAncestors('#/eleve/2eme-bac-sc-ex/revision/continuite/fiche.json'),
    ['/eleve/2eme-bac-sc-ex'],
  );
  assert.deepEqual(
    resolveColdStartAncestors('#/eleve/2eme-bac-sc-ex/exercices/logarithmes?ex=ex1.json'),
    ['/eleve/2eme-bac-sc-ex', '/eleve/2eme-bac-sc-ex/exercices/logarithmes'],
  );
  assert.deepEqual(
    resolveColdStartAncestors('#/eleve/2eme-bac-sc-ex/cadre'),
    ['/eleve/2eme-bac-sc-ex?tab=examens'],
  );
});

test('détecte push, back, forward et multi-step back avec restauration exacte du scroll', () => {
  const b = createMockBrowser('#/eleve/2eme-bac-sc-ex');
  const ctrl = b.createController();

  // Visite A (scroll = 420)
  let v = ctrl.recordVisit(b.hash, b.state);
  assert.equal(v.direction, 'replace');
  b.scrollY = 420;

  // Push B (scroll = 980)
  b.navigate('#/eleve/2eme-bac-sc-ex/exercices/logarithmes');
  v = ctrl.recordVisit(b.hash, b.state);
  assert.equal(v.direction, 'push');
  assert.equal(v.shouldRestoreScroll, false);
  b.scrollY = 980;

  // Push C (scroll = 1500)
  b.navigate('#/eleve/2eme-bac-sc-ex/exercices/logarithmes?ex=ex1.json');
  v = ctrl.recordVisit(b.hash, b.state);
  assert.equal(v.direction, 'push');
  b.scrollY = 1500;

  // Multi-step Back direct de C → A (2 crans)
  b.back(2);
  v = ctrl.recordVisit(b.hash, b.state);
  assert.equal(v.direction, 'back');
  assert.equal(v.shouldRestoreScroll, true);
  assert.equal(v.savedScroll, 420);

  // Forward direct de A → C (2 crans)
  b.forward(2);
  v = ctrl.recordVisit(b.hash, b.state);
  assert.equal(v.direction, 'forward');
  assert.equal(v.shouldRestoreScroll, true);
  assert.equal(v.savedScroll, 1500);

  // Back 1 cran C → B
  b.back(1);
  v = ctrl.recordVisit(b.hash, b.state);
  assert.equal(v.direction, 'back');
  assert.equal(v.savedScroll, 980);
});

test('amorçage à froid sur lien profond permet un Retour natif propre vers la série puis le programme', () => {
  const b = createMockBrowser('#/eleve/2eme-bac-sc-ex/exercices/logarithmes?ex=ex3.json');
  const ctrl = b.createController();

  const seeded = ctrl.seedColdStartParent(b.hash, b.state);
  assert.equal(seeded, true);
  assert.equal(b.entries.length, 3);
  assert.equal(b.entries[0].hash, '#/eleve/2eme-bac-sc-ex');
  assert.equal(b.entries[1].hash, '#/eleve/2eme-bac-sc-ex/exercices/logarithmes');
  assert.equal(b.entries[2].hash, '#/eleve/2eme-bac-sc-ex/exercices/logarithmes?ex=ex3.json');

  // 1er Retour natif → Série
  b.back(1);
  const v1 = ctrl.recordVisit(b.hash, b.state);
  assert.equal(v1.direction, 'back');
  assert.equal(v1.key, '/eleve/2eme-bac-sc-ex/exercices/logarithmes');

  // 2e Retour natif → Programme
  b.back(1);
  const v2 = ctrl.recordVisit(b.hash, b.state);
  assert.equal(v2.direction, 'back');
  assert.equal(v2.key, '/eleve/2eme-bac-sc-ex');
});

test('pile LIFO de modales fermée sur Retour natif + protection Forward état fantôme', () => {
  const b = createMockBrowser('#/eleve/2eme-bac-sc-ex');
  const ctrl = b.createController();
  ctrl.recordVisit(b.hash, b.state);

  const closedOrder = [];
  ctrl.registerModal('orient', () => closedOrder.push('orient'));
  ctrl.registerModal('lightbox', () => closedOrder.push('lightbox'));
  assert.equal(ctrl.getModalCount(), 2);
  assert.equal(b.entries.length, 3);

  // 1er Retour → ferme lightbox
  b.back(1);
  assert.deepEqual(closedOrder, ['lightbox']);
  assert.equal(ctrl.getModalCount(), 1);

  // 2e Retour → ferme orient
  b.back(1);
  assert.deepEqual(closedOrder, ['lightbox', 'orient']);
  assert.equal(ctrl.getModalCount(), 0);
  assert.equal(b.cursor, 0);

  // Bouton Suivant dans une modale déjà fermée → neutralisé (revient à cursor 0)
  b.forward(1);
  assert.equal(b.cursor, 0);
  assert.equal(ctrl.getModalCount(), 0);
});

test('closeAndNavigate remplace atomiquement la modale sans course history.back()', () => {
  const b = createMockBrowser('#/eleve/2eme-bac-sc-ex');
  const ctrl = b.createController();
  ctrl.recordVisit(b.hash, b.state);
  b.scrollY = 310;

  let modalClosed = false;
  ctrl.registerModal('orient', () => { modalClosed = true; });
  assert.equal(b.entries.length, 2);

  ctrl.closeAndNavigate('orient', '#/eleve/2eme-bac-sc-ex/cadre');
  assert.equal(modalClosed, true);
  assert.equal(ctrl.getModalCount(), 0);
  assert.equal(b.hash, '#/eleve/2eme-bac-sc-ex/cadre');
  assert.equal(b.routeDispatchCount, 1);

  const vCadre = ctrl.recordVisit(b.hash, b.state);
  assert.equal(vCadre.direction, 'push');
  assert.equal(vCadre.shouldRestoreScroll, false);

  // Un seul Retour depuis /cadre ramène directement au tableau de bord avec scroll=310
  b.back(1);
  const vBack = ctrl.recordVisit(b.hash, b.state);
  assert.equal(vBack.key, '/eleve/2eme-bac-sc-ex');
  assert.equal(vBack.direction, 'back');
  assert.equal(vBack.savedScroll, 310);
});

test('replaceRoute garde la pile Retour propre entre exercices frères d’une même série', () => {
  const b = createMockBrowser('#/eleve/2eme-bac-sc-ex/exercices/logarithmes');
  const ctrl = b.createController();
  ctrl.recordVisit(b.hash, b.state);
  b.scrollY = 260;

  // Ouvre Ex. 1
  b.navigate('#/eleve/2eme-bac-sc-ex/exercices/logarithmes?ex=ex1.json');
  ctrl.recordVisit(b.hash, b.state);

  // Bascule Ex. 1 → Ex. 2 → Ex. 3 via replaceRoute
  ctrl.replaceRoute('#/eleve/2eme-bac-sc-ex/exercices/logarithmes?ex=ex2.json');
  ctrl.recordVisit(b.hash, b.state);
  ctrl.replaceRoute('#/eleve/2eme-bac-sc-ex/exercices/logarithmes?ex=ex3.json');
  ctrl.recordVisit(b.hash, b.state);

  assert.equal(b.entries.length, 2);
  assert.equal(b.hash, '#/eleve/2eme-bac-sc-ex/exercices/logarithmes?ex=ex3.json');

  // Un seul Retour natif ramène directement à la liste Série avec scroll=260
  b.back(1);
  const vList = ctrl.recordVisit(b.hash, b.state);
  assert.equal(vList.key, '/eleve/2eme-bac-sc-ex/exercices/logarithmes');
  assert.equal(vList.direction, 'back');
  assert.equal(vList.savedScroll, 260);
});
