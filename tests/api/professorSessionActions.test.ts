import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  set: vi.fn(),
  del: vi.fn(),
  zrem: vi.fn(),
  zadd: vi.fn(),
  smembers: vi.fn(),
  eval: vi.fn(),
  prepareClassroomKeys: vi.fn(),
  notifySessionStudents: vi.fn(),
}));

vi.mock('../../src/server/professor/shared.js', () => ({
  redis: {
    get: mocks.get,
    mget: async (...keys: string[]) => Promise.all(keys.map(key => mocks.get(key))),
    set: mocks.set,
    del: mocks.del,
    zrem: mocks.zrem,
    zadd: mocks.zadd,
    smembers: mocks.smembers,
    eval: mocks.eval,
  },
  normalizeUrl: vi.fn((value: string) => value),
}));

vi.mock('../../src/server/professor/classroom.js', () => ({
  classroomSessionKey: vi.fn(() => 'prof:classroom:owner:session'),
  classroomFocusKey: vi.fn(() => 'prof:classroom:owner:focus'),
  classroomArchiveIndexKey: vi.fn(() => 'prof:classroom:owner:archive:index'),
  classroomArchiveRecordKey: vi.fn((_phone: string, id: string) => `prof:classroom:owner:archive:${id}`),
  prepareClassroomKeys: mocks.prepareClassroomKeys,
  notifySessionStudents: mocks.notifySessionStudents,
}));

import { handleProfessorSessionAction } from '../../src/server/professor/sessionActions';

function response() {
  const res = { status: vi.fn(), json: vi.fn() };
  res.status.mockReturnValue(res);
  return res;
}

const professor = { accountId: 'prof-1', phone: '+212600000000', classId: 'class-a' };
const access = { scope: 'all' as const, classIds: [], legacy: false };

beforeEach(() => {
  mocks.eval.mockReset();
  mocks.eval.mockImplementation(async (_script: string, keys: string[], args: unknown[]) => {
    await mocks.set(keys[0], args[2], { ex: args[3] });
    return 1;
  });
});

describe('professor session transitions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.prepareClassroomKeys.mockResolvedValue({ present: 'class-present' });
    mocks.notifySessionStudents.mockResolvedValue({ sent: 0, failed: 0 });
    mocks.smembers.mockResolvedValue([]);
  });

  it('prepares class B before repointing a stopped class A schedule and clears A state', async () => {
    mocks.get.mockResolvedValue({
      status: 'stopped',
      classId: 'class-a',
      chapterId: 'chapter-a',
      chapterTitle: 'Ancien chapitre',
      activity: { exerciseIds: ['exercise-a'], strokes: { a: [] } },
      startedAt: 111,
    });
    const res = response();

    await handleProfessorSessionAction(
      'session-schedule',
      { body: { classId: 'class-b', chapterTitle: 'Nouveau chapitre', scheduledAt: Date.now() + 60_000 } },
      res as any,
      professor,
      access,
      'class-b',
    );

    expect(mocks.prepareClassroomKeys).toHaveBeenCalledWith(professor.phone, 'class-b');
    expect(mocks.prepareClassroomKeys.mock.invocationCallOrder[0]).toBeLessThan(mocks.set.mock.invocationCallOrder[0]);
    const stored = JSON.parse(String(mocks.set.mock.calls[0][1]));
    expect(stored).toMatchObject({
      classId: 'class-b',
      chapterId: '',
      chapterTitle: 'Nouveau chapitre',
      activity: { exerciseIds: [], strokes: {} },
      startedAt: null,
    });
  });

  it('resumes a paused session without resetting activity or notifying again', async () => {
    mocks.get.mockResolvedValue({
      status: 'paused', classId: 'class-a', startedAt: 111,
      activity: { exerciseIds: ['exercise-a'], strokes: { a: [{ x: 1 }] } },
    });
    const res = response();

    await handleProfessorSessionAction(
      'session-set',
      { body: { status: 'running' } },
      res as any,
      professor,
      access,
      '',
    );

    const stored = JSON.parse(String(mocks.set.mock.calls[0][1]));
    expect(stored.startedAt).toBe(111);
    expect(stored.activity).toEqual({ exerciseIds: ['exercise-a'], strokes: { a: [{ x: 1 }] } });
    expect(mocks.notifySessionStudents).not.toHaveBeenCalled();
  });

  it('clears class A activity when selecting class B', async () => {
    mocks.get.mockResolvedValue({
      status: 'stopped',
      classId: 'class-a',
      chapterId: 'chapter-a',
      chapterTitle: 'Ancien chapitre',
      activity: { exerciseIds: ['old'], strokes: { old: [] } },
      startedAt: 111,
      scheduledAt: 222,
      meetLink: 'https://meet.test/a',
    });
    const res = response();

    await handleProfessorSessionAction(
      'session-set',
      { body: { classId: 'class-b' } },
      res as any,
      professor,
      access,
      'class-b',
    );

    const stored = JSON.parse(String(mocks.set.mock.calls[0][1]));
    expect(stored).toMatchObject({
      classId: 'class-b',
      chapterId: '',
      chapterTitle: '',
      activity: { exerciseIds: [], strokes: {} },
      startedAt: null,
      scheduledAt: null,
      meetLink: '',
    });
  });

  it('starts cleanly after stop with a fresh start timestamp and one notification', async () => {
    const now = vi.spyOn(Date, 'now').mockReturnValue(999);
    mocks.get.mockResolvedValue({
      status: 'stopped', classId: 'class-a', startedAt: 111,
      activity: { exerciseIds: ['old'], strokes: { old: [] } },
    });
    const res = response();

    await handleProfessorSessionAction(
      'session-set',
      { body: { status: 'running' } },
      res as any,
      professor,
      access,
      '',
    );

    const stored = JSON.parse(String(mocks.set.mock.calls[0][1]));
    expect(stored.startedAt).toBe(999);
    expect(stored.activity).toEqual({ exerciseIds: [], strokes: {} });
    expect(mocks.notifySessionStudents).toHaveBeenCalledTimes(1);
    now.mockRestore();
  });

  it('archives a running session before stopping without blocking the transition', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(999);
    mocks.get.mockResolvedValue({ status: 'running', classId: 'class-a', chapterId: 'ch-1', chapterTitle: 'Algèbre', startedAt: 111, activity: { exerciseIds: ['ex-1'], strokes: { zone: [] } } });
    const res = response();
    await handleProfessorSessionAction('session-set', { body: { status: 'stopped' } }, res as any, professor, access, '');
    expect(mocks.set).toHaveBeenCalledWith('prof:classroom:owner:archive:111', expect.any(String), expect.objectContaining({ ex: expect.any(Number) }));
    expect(mocks.set).toHaveBeenCalledWith('prof:classroom:owner:archive:index', expect.any(String), expect.objectContaining({ ex: expect.any(Number) }));
    const sessionWrite = mocks.set.mock.calls.find(call => call[0] === 'prof:classroom:owner:session');
    expect(JSON.parse(String(sessionWrite?.[1]))).toMatchObject({ status: 'stopped', startedAt: 111 });
    vi.restoreAllMocks();
  });
});

describe('piloted class published from the PC console', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.prepareClassroomKeys.mockResolvedValue({ present: 'class-present' });
    mocks.notifySessionStudents.mockResolvedValue({ sent: 0, failed: 0 });
    mocks.smembers.mockResolvedValue([]);
  });

  it('publishes the focus without ever touching a live session record', async () => {
    mocks.get.mockResolvedValue({ status: 'running', classId: 'class-a', startedAt: 111 });
    const res = response();

    await handleProfessorSessionAction(
      'session-focus',
      { body: { classId: 'class-b' } },
      res as any,
      professor,
      access,
      'class-b',
    );

    // La salle d'arrivée est préparée avant que la tablette n'y débarque.
    expect(mocks.prepareClassroomKeys).toHaveBeenCalledWith(professor.phone, 'class-b');
    expect(mocks.set).toHaveBeenCalledTimes(1);
    const [key, body] = mocks.set.mock.calls[0];
    expect(key).toBe('prof:classroom:owner:focus');
    expect(JSON.parse(String(body))).toMatchObject({ classId: 'class-b' });
    // Pas de 409 : publier un niveau n'est pas déplacer une séance.
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('refuses to publish without a class', async () => {
    const res = response();
    await handleProfessorSessionAction('session-focus', { body: {} }, res as any, professor, access, '');
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'class_id_required' });
    expect(mocks.set).not.toHaveBeenCalled();
  });

  it('refuses a class outside the account scope', async () => {
    const res = response();
    await handleProfessorSessionAction(
      'session-focus',
      { body: { classId: 'class-b' } },
      res as any,
      professor,
      { scope: 'selected' as const, classIds: ['class-a'], legacy: false },
      'class-b',
    );
    expect(res.status).toHaveBeenCalledWith(403);
    expect(mocks.set).not.toHaveBeenCalled();
  });

  it('follows an explicit class change accepted by session-set', async () => {
    mocks.get.mockResolvedValue({ status: 'stopped', classId: 'class-a' });
    const res = response();

    await handleProfessorSessionAction(
      'session-set',
      { body: { classId: 'class-b' } },
      res as any,
      professor,
      access,
      'class-b',
    );

    const focusWrite = mocks.set.mock.calls.find(call => call[0] === 'prof:classroom:owner:focus');
    expect(JSON.parse(String(focusWrite?.[1]))).toMatchObject({ classId: 'class-b' });
  });

  it('returns the focus alongside the session and drops it once the right is revoked', async () => {
    mocks.get.mockImplementation(async (key: string) => (
      key === 'prof:classroom:owner:focus'
        ? { classId: 'class-b', updatedAt: 77 }
        : { status: 'idle', classId: 'class-a' }
    ));

    const allowed = response();
    await handleProfessorSessionAction('session-get', { body: {} }, allowed as any, professor, access, '');
    expect(allowed.json).toHaveBeenCalledWith(expect.objectContaining({
      focus: { classId: 'class-b', updatedAt: 77 },
    }));

    const revoked = response();
    await handleProfessorSessionAction(
      'session-get',
      { body: {} },
      revoked as any,
      professor,
      { scope: 'selected' as const, classIds: ['class-a'], legacy: false },
      '',
    );
    expect(revoked.json).toHaveBeenCalledWith(expect.objectContaining({ focus: null }));
  });
});

describe('session concurrency and lightweight reads', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.prepareClassroomKeys.mockResolvedValue({ present: 'class-present' });
    mocks.smembers.mockResolvedValue([]);
  });

  it('re-reads a concurrent pause before saving activity, preserving the pause', async () => {
    mocks.get.mockResolvedValueOnce({ status: 'running', classId: 'class-a', startedAt: 111, revision: 1 })
      .mockResolvedValueOnce({ status: 'paused', classId: 'class-a', startedAt: 111, revision: 2 });
    mocks.eval.mockResolvedValueOnce(0);
    const res = response();
    await handleProfessorSessionAction('session-activity', { body: { startedAt: 111, position: { type: 'revision' } } }, res as any, professor, access, 'class-a');
    expect(mocks.eval).toHaveBeenCalledTimes(2);
    const stored = JSON.parse(String(mocks.set.mock.calls[0][1]));
    expect(stored).toMatchObject({ status: 'paused', revision: 3 });
    expect(mocks.eval.mock.calls[1][2][0]).toBe(2);
  });

  it('rejects a delayed activity if a concurrent stop won the write', async () => {
    mocks.get.mockResolvedValueOnce({ status: 'running', classId: 'class-a', startedAt: 111 })
      .mockResolvedValueOnce({ status: 'stopped', classId: 'class-a', startedAt: 111 });
    mocks.eval.mockResolvedValueOnce(0);
    const res = response();
    await handleProfessorSessionAction('session-activity', { body: { startedAt: 111 } }, res as any, professor, access, 'class-a');
    expect(res.json).toHaveBeenCalledWith({ error: 'session_not_active' });
    expect(mocks.set).not.toHaveBeenCalled();
  });

  it('rejects activity from a previous session in the same class', async () => {
    mocks.get.mockResolvedValue({ status: 'running', classId: 'class-a', startedAt: 222 });
    const res = response();
    await handleProfessorSessionAction('session-activity', { body: { startedAt: 111 } }, res as any, professor, access, 'class-a');
    expect(res.json).toHaveBeenCalledWith({ error: 'session_replaced' });
    expect(mocks.eval).not.toHaveBeenCalled();
  });

  it('does not send strokes or history in a summary read', async () => {
    mocks.get.mockResolvedValue({ status: 'running', classId: 'class-a', activity: { strokes: { zone: [1] } }, history: [1] });
    const res = response();
    await handleProfessorSessionAction('session-get', { body: { summary: true } }, res as any, professor, access, '');
    const body = JSON.parse(JSON.stringify(res.json.mock.calls[0][0]));
    expect(body.session).not.toHaveProperty('activity');
    expect(body.session).not.toHaveProperty('history');
    expect(body.session.status).toBe('running');
  });

  it('bounds retries without archiving or notifying an uncommitted transition', async () => {
    mocks.get.mockResolvedValue({ status: 'running', classId: 'class-a', revision: 1 });
    mocks.eval.mockResolvedValue(0);
    const res = response();
    await handleProfessorSessionAction('session-set', { body: { status: 'stopped' } }, res as any, professor, access, '');
    expect(mocks.eval).toHaveBeenCalledTimes(4);
    expect(res.json).toHaveBeenCalledWith({ error: 'session_concurrent_update' });
    expect(mocks.set).not.toHaveBeenCalled();
  });
});
