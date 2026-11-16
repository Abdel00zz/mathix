import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * La progression vit dans le cloud, sous une clé qui contient la classe et le
 * téléphone. Ces tests verrouillent les deux sens du branchement :
 *  - l'admin relit ce que l'élève a écrit (téléphone normalisé ou non) ;
 *  - le détail par chapitre remonte bien jusqu'à l'écran (dernière étape,
 *    fidèles par fiche, séances, tri par fraîcheur).
 */
const mocks = vi.hoisted(() => ({
  store: new Map<string, unknown>(),
  pipelineCalls: [] as string[][],
  normalizePhone: vi.fn(),
}));

vi.mock('../../src/server/professor/shared.js', () => ({
  redis: {
    get: vi.fn(async (key: string) => mocks.store.get(key) ?? null),
    set: vi.fn(async (key: string, value: unknown) => { mocks.store.set(key, value); }),
    pipeline: vi.fn(() => {
      const keys: string[] = [];
      mocks.pipelineCalls.push(keys);
      return {
        get: (key: string) => { keys.push(key); },
        exec: async () => keys.map(key => mocks.store.get(key) ?? null),
      };
    }),
  },
  isAdmin: vi.fn(() => true),
  isValidPhone: vi.fn((phone: string) => /^\+\d{8,15}$/.test(phone)),
  normalizePhone: mocks.normalizePhone,
  readActiveAccountSession: vi.fn(),
}));

import handler from '../../api/progress';

const response = () => {
  const res = { status: vi.fn(), json: vi.fn() };
  res.status.mockReturnValue(res);
  return res;
};

const CLASS_ID = '2eme-bac-sc-ex';
const PHONE = '+212612345678';

const cloudRecord = {
  totalTimeSpent: 5400,
  lastActive: 1_700_000_000_000,
  updatedAt: 1_700_000_000_000,
  progress: {
    [`${CLASS_ID}_continuite`]: {
      revisionProgress: 72,
      revisionProgressBySheet: { fiche_continuite_cours: 72 },
      lastActiveAt: 1_700_000_000_000,
      lastActiveSection: 'section-3',
      revealedBlanks: ['b1', 'b2', 'b3'],
      masteredSkills: ['s1', 's2'],
      completedSeances: [1, 2],
      quiz: {
        isSubmitted: false,
        score: 0,
        highScore: 7,
        attempts: 1,
        totalQuestions: 20,
        currentQuestionIndex: 7,
        durationSeconds: 420,
        history: [
          { questionId: 'q1', isCorrect: true, userAnswer: 'A', timeSpent: 12 },
          { questionId: 'q2', isCorrect: false, userAnswer: 'C', timeSpent: 20 },
        ],
      },
      exercises: { 'ex-cont-02': { isCompleted: true, mastery: 'high' } },
      exerciseFeedback: { 'ex-cont-02': 'high', 'ex-cont-03': 'skipped' },
      exerciseDurations: { 'ex-cont-02': 12 },
      isChapterSubmitted: false,
    },
    [`${CLASS_ID}_derivation-etude-fonctions`]: {
      revisionProgress: 100,
      lastActiveAt: 1_600_000_000_000,
      quiz: { isSubmitted: true, score: 18, highScore: 18, attempts: 2, totalQuestions: 20, history: [] },
      exercises: {},
      exerciseFeedback: {},
      isChapterSubmitted: true,
      submittedAt: 1_600_000_000_000,
    },
  },
};

describe('/api/progress — lecture de la fiche élève', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.store.clear();
    mocks.pipelineCalls.length = 0;
    // Reproduit la normalisation réelle du serveur : « + » suivi des chiffres.
    mocks.normalizePhone.mockImplementation((value: unknown) => {
      const digits = String(value ?? '').replace(/\D/g, '');
      return digits ? `+${digits}` : '';
    });
  });

  it('refuse la lecture détaillée sans le secret administrateur', async () => {
    const shared = await import('../../src/server/professor/shared.js');
    vi.mocked(shared.isAdmin).mockReturnValueOnce(false);
    const res = response();

    await handler({ method: 'GET', query: { action: 'view', phone: PHONE, classId: CLASS_ID } } as any, res as any);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(mocks.store.size).toBe(0);
  });

  it('lit le relevé écrit par l’élève sous son téléphone normalisé', async () => {
    mocks.store.set(`progress:${CLASS_ID}:${PHONE}`, JSON.stringify(cloudRecord));
    const res = response();

    await handler({ method: 'GET', query: { action: 'view', phone: PHONE, classId: CLASS_ID } } as any, res as any);

    expect(res.status).toHaveBeenCalledWith(200);
    const payload = res.json.mock.calls[0][0];
    expect(payload.found).toBe(true);
    expect(payload.totalTimeSpent).toBe(5400);
    expect(payload.chaptersCount).toBe(2);
  });

  it('retrouve un relevé historique écrit avec le numéro brut', async () => {
    mocks.store.set(`progress:${CLASS_ID}:0612345678`, JSON.stringify(cloudRecord));
    const res = response();

    await handler({ method: 'GET', query: { action: 'view', phone: '0612345678', classId: CLASS_ID } } as any, res as any);

    const payload = res.json.mock.calls[0][0];
    expect(payload.found).toBe(true);
    expect(payload.totalTimeSpent).toBe(5400);
  });

  it('expose la dernière étape lue, le détail par fiche et les séances validées', async () => {
    mocks.store.set(`progress:${CLASS_ID}:${PHONE}`, JSON.stringify(cloudRecord));
    const res = response();

    await handler({ method: 'GET', query: { action: 'view', phone: PHONE, classId: CLASS_ID } } as any, res as any);

    const payload = res.json.mock.calls[0][0];
    const continuity = payload.chapters.find((chapter: any) => chapter.chapter === 'continuite');
    expect(continuity.lastActiveSection).toBe('section-3');
    expect(continuity.revisionBySheet).toEqual({ fiche_continuite_cours: 72 });
    expect(continuity.completedSeances).toEqual([1, 2]);
    expect(continuity.blanksRevealed).toBe(3);
    expect(continuity.masteredSkills).toBe(2);
    expect(continuity.quizAnswered).toBe(2);
    expect(continuity.quizCorrect).toBe(1);
    expect(continuity.quizProgressPct).toBe(10);
    expect(continuity.feedbackSummary).toEqual({ done: 1, skipped: 1 });
    // Le chapitre le plus récent passe en tête et alimente le bandeau d'accueil.
    expect(payload.chapters[0].chapter).toBe('continuite');
    expect(payload.lastChapter).toEqual({ chapter: 'continuite', at: 1_700_000_000_000, section: 'section-3' });
  });

  it('retire le préfixe de classe des identifiants de chapitre', async () => {
    mocks.store.set(`progress:${CLASS_ID}:${PHONE}`, JSON.stringify(cloudRecord));
    const res = response();

    await handler({ method: 'GET', query: { action: 'view', phone: PHONE, classId: CLASS_ID } } as any, res as any);

    const chapters = res.json.mock.calls[0][0].chapters.map((chapter: any) => chapter.chapter);
    expect(chapters).toContain('derivation-etude-fonctions');
    expect(chapters.some((id: string) => id.startsWith(CLASS_ID))).toBe(false);
  });

  it('annonce l’absence de relevé sans inventer de chapitres', async () => {
    const res = response();

    await handler({ method: 'GET', query: { action: 'view', phone: PHONE, classId: CLASS_ID } } as any, res as any);

    expect(res.json).toHaveBeenCalledWith({ found: false, classId: CLASS_ID, phone: PHONE });
  });

  it('résumé de classe : clé normalisée, identifiant client inchangé', async () => {
    mocks.store.set(`progress:${CLASS_ID}:${PHONE}`, JSON.stringify(cloudRecord));
    const res = response();

    await handler({
      method: 'POST',
      query: { action: 'summary' },
      body: { students: [{ phone: PHONE, classId: CLASS_ID }, { phone: '0612345678', classId: CLASS_ID }] },
    } as any, res as any);

    const summaries = res.json.mock.calls[0][0].summaries;
    // L'identifiant reste celui que le client recalcule : `classe:téléphone`.
    expect(Object.keys(summaries)).toEqual([`${CLASS_ID}:${PHONE}`, `${CLASS_ID}:0612345678`]);
    expect(summaries[`${CLASS_ID}:${PHONE}`].found).toBe(true);
    expect(summaries[`${CLASS_ID}:${PHONE}`].totalTimeSpent).toBe(5400);
    // Le second élève n'a rien écrit : il est simplement marqué absent.
    expect(summaries[`${CLASS_ID}:0612345678`].found).toBe(false);
    // Les deux variantes de clé sont lues dans un seul pipeline : la forme
    // canonique du serveur (« + » + chiffres) puis le numéro brut d'origine.
    expect(mocks.pipelineCalls[0]).toEqual([
      `progress:${CLASS_ID}:${PHONE}`,
      `progress:${CLASS_ID}:+0612345678`,
      `progress:${CLASS_ID}:0612345678`,
    ]);
  });

  it('capteurs de chapitre : le chapitre suivi est retrouvé malgré le préfixe', async () => {
    mocks.store.set(`progress:${CLASS_ID}:${PHONE}`, JSON.stringify(cloudRecord));
    const res = response();

    await handler({
      method: 'POST',
      query: { action: 'chapter-monitor' },
      body: { students: [{ phone: PHONE, classId: CLASS_ID }], chapterId: 'continuite' },
    } as any, res as any);

    const monitor = res.json.mock.calls[0][0].monitor[`${CLASS_ID}:${PHONE}`];
    expect(monitor.started).toBe(true);
    expect(monitor.revisionPercent).toBe(72);
    expect(monitor.quizAnswered).toBe(2);
    expect(monitor.exerciseFeedback).toEqual({ 'ex-cont-02': 'high', 'ex-cont-03': 'skipped' });
  });

  it('concours : lit le relevé d’essais sous les deux formes de numéro', async () => {
    mocks.store.set(`concours:${CLASS_ID}:0612345678`, JSON.stringify({ totalExams: 3, bestScores: { fmp: 62 }, lastPlayed: 1_650_000_000_000 }));
    const res = response();

    await handler({ method: 'GET', query: { action: 'concours', phone: '0612345678', classId: CLASS_ID } } as any, res as any);

    const payload = res.json.mock.calls[0][0];
    expect(payload.found).toBe(true);
    expect(payload.totalExams).toBe(3);
    expect(payload.bestScores).toEqual({ fmp: 62 });
  });
});
