import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

function loadUnlocksModule() {
  const store = new Map<string, string>();
  const context: Record<string, any> = {
    localStorage: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => { store.set(k, String(v)); },
      removeItem: (k: string) => { store.delete(k); },
    },
    module: { exports: {} },
    exports: {},
  };
  context.globalThis = context;
  const code = fs.readFileSync(path.resolve('maquette/js/core/unlocks.js'), 'utf8');
  vm.runInNewContext(code, context);
  return { unlocks: context.MathFlowUnlocks || context.module.exports, store };
}

describe('Maquette — cadenas, seuils de déblocage et interface épurée', () => {
  beforeEach(() => {
    // Chaque test charge une instance VM isolée
  });

  it('verrouille Quiz (< 10% leçon) et Exercices (< 15% quiz) puis débloque progressivement', () => {
    const { unlocks } = loadUnlocksModule();
    expect(unlocks.QUIZ_UNLOCK_THRESHOLD).toBe(10);
    expect(unlocks.EXERCISE_UNLOCK_THRESHOLD).toBe(15);

    const lockedAll = unlocks.computeLocks({
      classId: '2eme-bac-sc-ex',
      chapterId: 'continuite',
      hasLesson: true,
      hasQuiz: true,
      hasExercises: true,
      lessonPct: 5,
      quizPct: 0,
      quizSubmitted: false,
    });
    expect(lockedAll.quizLocked).toBe(true);
    expect(lockedAll.exercisesLocked).toBe(true);

    const quizOpen = unlocks.computeLocks({
      classId: '2eme-bac-sc-ex',
      chapterId: 'continuite',
      hasLesson: true,
      hasQuiz: true,
      hasExercises: true,
      lessonPct: 10,
      quizPct: 10,
      quizSubmitted: false,
    });
    expect(quizOpen.quizLocked).toBe(false);
    expect(quizOpen.exercisesLocked).toBe(true);

    const allOpen = unlocks.computeLocks({
      classId: '2eme-bac-sc-ex',
      chapterId: 'continuite',
      hasLesson: true,
      hasQuiz: true,
      hasExercises: true,
      lessonPct: 10,
      quizPct: 15,
      quizSubmitted: false,
    });
    expect(allOpen.quizLocked).toBe(false);
    expect(allOpen.exercisesLocked).toBe(false);
  });

  it('conserve les déblocages en persistance sticky et les efface sur reset', () => {
    const { unlocks, store } = loadUnlocksModule();
    unlocks.computeLocks({
      classId: '1ere-bac-sc-math',
      chapterId: 'logique',
      hasLesson: true,
      hasQuiz: true,
      hasExercises: true,
      lessonPct: 20,
      quizPct: 20,
      quizSubmitted: false,
    });
    expect(store.get('ap-u')).toContain('1ere-bac-sc-math:logique');

    // Même si un compteur redescend, le cadenas reste ouvert tant que ap-u existe
    const stickyAfter = unlocks.computeLocks({
      classId: '1ere-bac-sc-math',
      chapterId: 'logique',
      hasLesson: true,
      hasQuiz: true,
      hasExercises: true,
      lessonPct: 0,
      quizPct: 0,
      quizSubmitted: false,
    });
    expect(stickyAfter.quizLocked).toBe(false);
    expect(stickyAfter.exercisesLocked).toBe(false);

    unlocks.clearStickyUnlocks();
    expect(store.has('ap-u')).toBe(false);
  });

  it('laisse toujours débloqué le chapitre mise-a-niveau', () => {
    const { unlocks } = loadUnlocksModule();
    const res = unlocks.computeLocks({
      classId: '2eme-bac-sc-math',
      chapterId: 'mise-a-niveau',
      hasLesson: true,
      hasQuiz: true,
      hasExercises: true,
      lessonPct: 0,
      quizPct: 0,
      quizSubmitted: false,
    });
    expect(res.quizLocked).toBe(false);
    expect(res.exercisesLocked).toBe(false);
  });

  it('garantit l’absence de Messages dans la sidebar élève et l’absence de XP/streak dans l’état global', () => {
    const controlBlade = fs.readFileSync(path.resolve('src/components/UI/ControlBlade.tsx'), 'utf8');
    const sidebarJs = fs.readFileSync(path.resolve('maquette/js/core/sidebar.js'), 'utf8');
    const appHtml = fs.readFileSync(path.resolve('maquette/Apprendre.html'), 'utf8');
    const typesTs = fs.readFileSync(path.resolve('src/types.ts'), 'utf8');

    expect(controlBlade).not.toContain("tr('Messages'");
    expect(sidebarJs).not.toMatch(/Messages|Boîte de réception|notification/i);
    expect(appHtml).not.toMatch(/Messages|Boîte de réception/i);
    expect(typesTs).not.toMatch(/\bxp:\s*number|\bstreak:\s*number/);
  });

  it('synchronise toutes les 5 filières Lycée disponibles dans le manifeste canonique', () => {
    const manifest = JSON.parse(fs.readFileSync(path.resolve('maquette/public/data/manifest.json'), 'utf8'));
    const ids = (manifest.classes || []).map((c: any) => c.id);
    expect(ids).toEqual([
      'tronc-commun-sc',
      '1ere-bac-sc-ex',
      '1ere-bac-sc-math',
      '2eme-bac-sc-ex',
      '2eme-bac-sc-math',
    ]);
  });
});

import * as nextUnlocks from '../../apps/apprendre-next/src/lib/unlocks';
import * as nextResume from '../../apps/apprendre-next/src/lib/resumeStore';
import * as nextCloud from '../../apps/apprendre-next/src/lib/cloudSync';
import * as nextStorage from '../../apps/apprendre-next/src/lib/storage';

function makeMockStorage(opts?: { quotaOnBytes?: number }) {
  const map = new Map<string, string>();
  const storage = {
    get length() { return map.size; },
    key: (i: number) => Array.from(map.keys())[i] ?? null,
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => {
      const val = String(v);
      if (opts?.quotaOnBytes && val.length > opts.quotaOnBytes) {
        const err = new Error('QuotaExceededError');
        err.name = 'QuotaExceededError';
        throw err;
      }
      map.set(k, val);
    },
    removeItem: (k: string) => { map.delete(k); },
    clear: () => { map.clear(); },
  };
  return { map, storage };
}

function loadMaquetteBundle() {
  const { map, storage } = makeMockStorage();
  const context: Record<string, any> = {
    localStorage: storage,
    navigator: { onLine: true },
    location: { protocol: 'https:' },
    fetch: async () => ({ ok: true, json: async () => ({ ok: true }) }),
    setTimeout,
    clearTimeout,
    module: { exports: {} },
    exports: {},
  };
  context.globalThis = context;
  for (const rel of [
    'maquette/js/app.js',
    'maquette/js/core/unlocks.js',
    'maquette/js/core/resume-store.js',
    'maquette/js/core/offline-db.js',
    'maquette/js/core/cloud-sync.js',
  ]) {
    vm.runInNewContext(fs.readFileSync(path.resolve(rel), 'utf8'), context);
  }
  return { ctx: context, map, storage };
}

describe('Vague 1 Database — unlocks, resume-store, offline-db, cloud-sync & quiz-loader', () => {
  it('maquette/unlocks.js : exercisesHint sans quiz, anti-double-comptage et getExerciseStats', () => {
    const { unlocks } = loadUnlocksModule();
    const noQuizLock = unlocks.computeLocks({
      classId: '2eme-bac-sc-ex',
      chapterId: 'ch1',
      hasLesson: true,
      hasQuiz: false,
      hasExercises: true,
      lessonPct: 5,
      quizPct: 0,
      quizSubmitted: false,
    });
    expect(noQuizLock.exercisesLocked).toBe(false);
    expect(noQuizLock.exercisesHint).toContain('accessibles directement');

    // Pas de double-comptage si direct + sous-clés existent
    const stats = unlocks.getQuizStats(
      {
        '2eme-bac-sc-ex:ch1': [1, 1],
        '2eme-bac-sc-ex:ch1:q1': [1, 0],
        'ch1:q1': [1],
        '2eme-bac-sc-ex:ch1:q2': [1, null],
      },
      '2eme-bac-sc-ex',
      'ch1',
      [
        { id: 'q1', questionsCount: 2 },
        { id: 'q2', questionsCount: 2 },
      ],
      4,
    );
    expect(stats.done).toBe(3);
    expect(stats.pct).toBe(75);

    const lp = unlocks.getLessonPct(
      { '2eme-bac-sc-ex:ch1': { pct: 64 }, ch1: 20 },
      'ch1',
      [{ id: 'r1' }],
      '2eme-bac-sc-ex',
    );
    expect(lp).toBe(64);

    const ex = unlocks.getExerciseStats(
      { '2eme-bac-sc-ex:ch1:ex1': { sq1: 2, sq2: 1 } },
      '2eme-bac-sc-ex',
      'ch1',
      [{ id: 'ex1', questionsCount: 4 }],
      4,
    );
    expect(ex.done).toBe(2);
    expect(ex.pct).toBe(50);
  });

  it('maquette/resume-store.js : schemaVersion 2, mode pas/pas-a-pas, selectedIndex et clé classId', () => {
    const { ctx, map } = loadMaquetteBundle();
    const rs = ctx.MathFlowResumeStore;
    expect(rs.SCHEMA_VERSION).toBe(2);
    expect(rs.buildLessonScrollKey('2eme-bac-sc-ex', 'cont', 'rev1')).toBe('2eme-bac-sc-ex:cont:rev1');
    expect(rs.buildProblemScrollKey('2eme-bac-sc-ex', 'p1')).toBe('prob:2eme-bac-sc-ex:p1');

    rs.snapshotExerciseState('2eme-bac-sc-ex:cont', {
      index: 2,
      mode: 'pas-a-pas',
      openHints: new Set(['h1']),
      openSolutions: new Set(),
      revealed: [true],
      elapsed: 12,
      spent: [12],
      parsed: [{}, {}, {}],
      ratings: [2],
    });
    const rawStored = JSON.parse(map.get('ap-resume')!);
    expect(rawStored.schemaVersion).toBe(2);
    expect(rawStored.exercises['2eme-bac-sc-ex:cont'].mode).toBe('pas');
    expect(rs.hydrateExerciseState('2eme-bac-sc-ex:cont', [2], 'pas-a-pas', false).mode).toBe('pas-a-pas');
    expect(rs.hydrateExerciseState('2eme-bac-sc-ex:cont', [2], 'pas', false).mode).toBe('pas');

    // selectedIndex hydraté UNIQUEMENT si sc === 1 sur mcq/boolean/error, jamais sur input/order ni sc === 0
    const qHyd = rs.hydrateQuizState(
      'k1',
      '2eme-bac-sc-ex:cont:q1',
      'cont',
      true,
      [
        { type: 'mcq', correctIndex: 2 },
        { type: 'mcq', correctIndex: 1 },
        { type: 'input', correctIndex: 0 },
        { type: 'order', correctIndex: 0 },
      ],
      { q: { '2eme-bac-sc-ex:cont:q1': [1, 0, 1, 1] } },
    );
    expect(qHyd.answers[0].selectedIndex).toBe(2);
    expect(qHyd.answers[1].selectedIndex).toBeUndefined();
    expect(qHyd.answers[2].selectedIndex).toBeUndefined();
    expect(qHyd.answers[3].selectedIndex).toBeUndefined();
  });

  it('maquette/cloud-sync.js + offline-db.js : formats mixtes CRDT, tombstone resetAt, outbox compacté & purge session', async () => {
    const { ctx, map } = loadMaquetteBundle();
    const cs = ctx.MathFlowCloud;
    const app = ctx.MathFlowApp;
    const db = ctx.MathFlowOfflineDB;

    app.saveState({
      q: { ch1: [1, 0] },
      e: { ex1: { sq1: 1 } },
      l: { ch1: 30 },
      lastVisited: { title: 'Ch1', chapterId: 'ch1', at: 500 },
    }, { silent: true });

    // Merge formats Next.js { answers, isSubmitted } + Record<string,number> + { pct }
    cs.mergeRemoteEnvelope({
      profile: { cls: '2eme-bac-sc-math', profileUpdatedAt: 100 },
      state: {
        q: { ch1: { answers: [0, 1], isSubmitted: true } },
        e: { ex1: { sq1: 2, sq2: 0 } },
        l: { ch1: { pct: 75 } },
        lastVisited: { title: 'Ch2', href: '/lecon/ch2', at: 600 },
      },
      unlocks: { '2eme-bac-sc-math:ch1': { quiz: true, exercises: false } },
      updatedAt: 600,
    });
    const st1 = app.getState();
    expect(st1.q.ch1).toEqual({ answers: [1, 1], isSubmitted: true });
    expect(st1.e.ex1).toEqual({ sq1: 2, sq2: 0 });
    expect(st1.l.ch1.pct).toBe(75);
    expect(map.get('ap-u')).toContain('exercises');

    // Anti-resurrection resetAt : un reset distant > mutAt efface l'ancien progrès
    cs.mergeRemoteEnvelope({
      profile: { cls: '2eme-bac-sc-math', profileUpdatedAt: 200 },
      state: { q: {}, e: {}, l: {}, lastVisited: null },
      resetAt: 2000,
      updatedAt: 2000,
    });
    expect(app.getState().q).toEqual({});
    expect(app.getResetAt()).toBe(2000);
    expect(map.get('ap-u')).toBeUndefined();

    // Outbox compaction dans flushOutbox : fusionne tous les items en attente
    await db.enqueueOutbox({ profile: {}, state: { q: { a: [1] }, e: {}, l: {}, lastVisited: null }, updatedAt: 2100 }, 'u1');
    await db.enqueueOutbox({ profile: {}, state: { q: { b: [1] }, e: {}, l: {}, lastVisited: null }, updatedAt: 2200 }, 'u1');
    let sentBody: any = null;
    ctx.fetch = async (url: string, init: any) => {
      if (url.includes('/api/auth?action=me')) {
        return { ok: true, json: async () => ({ authenticated: true, user: { id: 'u1', email: 'u1@example.com' } }) };
      }
      if (url === '/api/sync' && init?.method === 'POST') {
        sentBody = JSON.parse(init.body);
        return { ok: true, json: async () => ({ envelope: sentBody.envelope }) };
      }
      return { ok: true, json: async () => ({}) };
    };
    await cs.refreshSession();
    expect(sentBody?.envelope?.state?.q?.a).toEqual([1]);
    expect(sentBody?.envelope?.state?.q?.b).toEqual([1]);

    // Logout purge le stockage local de session
    await cs.logout();
    expect(app.getState().q).toEqual({});
    expect(map.get('ap-reset-at')).toBeUndefined();
    expect(map.get('ap-owner')).toBeUndefined();
  });

  it('maquette/cloud-sync.js : ignore une ancienne génération renvoyée avec un timestamp récent', () => {
    const { ctx, map } = loadMaquetteBundle();
    const cloud = ctx.MathFlowCloud;
    const old = {
      profile: {}, resetAt: 0, updatedAt: 10_000,
      state: { q: { old: [1] }, e: { old: [2] }, l: { old: 90 }, lastVisited: null },
      unlocks: { old: { quiz: true, exercises: true } },
      resume: { lessons: { old: { pct: 75, maxPct: 90, updatedAt: 10_000 } } },
    };
    const current = {
      profile: {}, resetAt: 200, updatedAt: 300,
      state: { q: { current: [1] }, e: {}, l: { current: 30 }, lastVisited: null },
      unlocks: { current: { quiz: true } },
      resume: { lessons: { current: { pct: 30, maxPct: 30, updatedAt: 300 } } },
    };
    const merged = cloud.mergeEnvelopes(old, current);
    expect(merged.state.q).toEqual({ current: [1] });
    expect(merged.state.e).toEqual({});
    expect(merged.state.l).toEqual({ current: 30 });
    expect(merged.unlocks.old).toBeUndefined();
    expect(Object.keys(merged.resume.lessons)).toEqual(['current']);
    expect(cloud.mergeEnvelopes(current, old).state).toEqual(merged.state);

    ctx.MathFlowApp.saveState(old.state, { silent: true });
    ctx.MathFlowResumeStore.writeAll(old.resume);
    ctx.MathFlowUnlocks.writeStickyUnlocks(old.unlocks);
    map.set('ap-mut-at', '10000');
    cloud.mergeRemoteEnvelope(current);
    expect(ctx.MathFlowApp.getState().q).toEqual({ current: [1] });
    expect(ctx.MathFlowResumeStore.readAll().lessons.old).toBeUndefined();
    cloud.mergeRemoteEnvelope(old);
    const snapshot = cloud.buildEnvelope();
    expect(snapshot.resetAt).toBe(200);
    expect(snapshot.state.q).toEqual({ current: [1] });
    expect(snapshot.unlocks.old).toBeUndefined();
    expect(snapshot.resume.lessons.old).toBeUndefined();
  });

  it('maquette/quiz-loader.js : normalise le fallback id des annales sans préfixe ni .json', async () => {
    const context: Record<string, any> = {
      ContentService: {
        getConcoursSchoolManifest: async () => ({
          id: 'ensam',
          title: 'ENSAM',
          annales: [{ path: 'annales/ensam_2023.json', title: 'ENSAM 2023', questionsCount: 20 }],
        }),
        getQuiz: async () => ({ questions: Array.from({ length: 20 }, (_, i) => ({ id: `q${i}` })) }),
      },
      module: { exports: {} },
      exports: {},
    };
    context.globalThis = context;
    vm.runInNewContext(fs.readFileSync(path.resolve('maquette/js/pages/quiz-loader.js'), 'utf8'), context);
    const ql = context.MathFlowQuizLoader || context.module.exports;
    const bundle = await ql.loadQuizBundle({ kind: 'concours', schoolId: 'ensam' });
    expect(bundle.quizzes[0].id).toBe('ensam_2023');
    expect(bundle.quizzes[0].questionsCount).toBe(20);
    context.ContentService.getQuiz = async () => ({ questions: [] });
    expect((await ql.loadQuizBundle({ kind: 'concours', schoolId: 'ensam' })).quizzes).toEqual([]);
  });

  it('Next.js TS lib (unlocks, resumeStore, cloudSync) : contrats CRDT, mode pas, QuotaExceeded & tombstones', async () => {
    const { map, storage } = makeMockStorage({ quotaOnBytes: 4000 });
    (globalThis as any).window = { localStorage: storage };
    (globalThis as any).localStorage = storage;

    // unlocks.ts
    const hintNoQ = nextUnlocks.computeLocks({
      classId: 'tronc-commun-sc',
      chapterId: 'ordre',
      hasLesson: true,
      hasQuiz: false,
      hasExercises: true,
      lessonPct: 0,
      quizPct: 0,
      quizSubmitted: false,
    });
    expect(hintNoQ.exercisesLocked).toBe(false);
    const exStats = nextUnlocks.getExerciseStats(
      { 'tronc-commun-sc:ordre:ex_01': { sq1: 2, sq2: 0 } },
      'tronc-commun-sc',
      'ordre',
      [{ id: 'ex_01', questionsCount: 2 }],
      2,
    );
    expect(exStats.done).toBe(2);
    expect(exStats.completed).toBe(true);

    // resumeStore.ts
    expect(nextResume.normalizeExerciseMode('pas-a-pas')).toBe('pas');
    expect(nextResume.normalizeExerciseMode('examen')).toBe('examen');
    const qHyd = nextResume.hydrateQuizAnswersFromCloud(
      [
        { type: 'boolean', correctIndex: 1 },
        { type: 'mcq', correctIndex: 0 },
        { type: 'input' },
      ],
      [1, 0, 1],
    );
    expect(qHyd.answers[0]?.selectedIndex).toBe(1);
    expect(qHyd.answers[1]?.selectedIndex).toBeUndefined();
    expect(qHyd.answers[2]?.selectedIndex).toBeUndefined();

    // QuotaExceededError eviction sur storage.safeSetStorageItem
    nextResume.saveLessonResume('k_old', { maxPct: 20 });
    const huge = 'x'.repeat(4500);
    expect(() => nextStorage.safeSetStorageItem('test_huge', huge)).not.toThrow();

    // cloudSync.ts : omet resume & unlocks si vides, gère resetAt et purge
    const emptyEnv = nextCloud.createCloudEnvelope(
      { th: 'auto', cls: '2eme-bac-sc-ex', fn: '', ln: '', sc: '', docFont: 'literata', docScale: 1, tiersTemps: false, soundEnabled: false, lexiconAutoHighlight: true, reduceMotion: false, quizTimePerQuestion: 120 },
      { q: {}, e: {}, l: {}, lastVisited: null },
      undefined,
      { includeLocalStores: false },
    );
    expect(emptyEnv.resume).toBeUndefined();
    expect(emptyEnv.unlocks).toBeUndefined();
    expect(map.get(nextStorage.KEY_RESET_AT)).toBeUndefined();

    delete (globalThis as any).window;
  });
});
