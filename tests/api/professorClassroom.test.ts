import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  eval: vi.fn(),
  get: vi.fn(),
  mget: vi.fn(),
  smembers: vi.fn(),
  resolveClassSubscribers: vi.fn(),
  sendToSubscribers: vi.fn(),
  cleanupExpired: vi.fn(),
  subscriberAllows: vi.fn(() => true),
}));

vi.mock('../../src/server/professor/shared.js', () => ({
  redis: {
    eval: mocks.eval,
    get: mocks.get,
    mget: mocks.mget,
    smembers: mocks.smembers,
  },
  buildNotifyPayload: vi.fn(() => '{}'),
  resolveClassSubscribers: mocks.resolveClassSubscribers,
  sendToSubscribers: mocks.sendToSubscribers,
  cleanupExpired: mocks.cleanupExpired,
  subscriberAllows: mocks.subscriberAllows,
}));

import {
  classroomKeys,
  notifySessionStudents,
  prepareClassroomKeys,
  resetPreparedClassrooms,
} from '../../src/server/professor/classroom';

describe('professor classroom isolation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetPreparedClassrooms();
    mocks.eval.mockResolvedValue(0);
    mocks.cleanupExpired.mockResolvedValue(0);
    mocks.mget.mockImplementation(async (...keys: string[]) => Promise.all(keys.map(key => mocks.get(key))));
  });

  it('uses distinct Redis state for each class while keeping one session pointer', () => {
    const a = classroomKeys('+212600000000', 'class-a');
    const b = classroomKeys('+212600000000', 'class-b');

    expect(a.roster).not.toBe(b.roster);
    expect(a.live).not.toBe(b.live);
    expect(a.present).not.toBe(b.present);
    expect(a.answerStatus).not.toBe(b.answerStatus);
    expect(a.session).toBe(b.session);
    expect(a.roster).toContain(':class:class-a:');
    expect(b.roster).toContain(':class:class-b:');
  });

  it('migrates legacy keys through one atomic, class-claimed script', async () => {
    const keys = await prepareClassroomKeys('+212600000000', 'class-a');
    const [, redisKeys, args] = mocks.eval.mock.calls[0];

    expect(redisKeys).toContain(keys.roster);
    expect(redisKeys).toContain(keys.session);
    expect(redisKeys.some((key: string) => key.endsWith(':legacy-owner-v1'))).toBe(true);
    expect(args[0]).toBe('class-a');
  });

  it('plays the legacy migration once per professor and class, then stays silent', async () => {
    await prepareClassroomKeys('+212600000000', 'class-a');
    await prepareClassroomKeys('+212600000000', 'class-a');
    await prepareClassroomKeys('+212600000000', 'class-a');
    expect(mocks.eval).toHaveBeenCalledTimes(1);

    // Une autre classe du même professeur a son propre marqueur de migration.
    await prepareClassroomKeys('+212600000000', 'class-b');
    expect(mocks.eval).toHaveBeenCalledTimes(2);
  });

  it('retries the migration after a failure instead of remembering it', async () => {
    mocks.eval.mockRejectedValueOnce(new Error('redis down'));
    await expect(prepareClassroomKeys('+212600000000', 'class-a')).rejects.toThrow('redis down');

    await prepareClassroomKeys('+212600000000', 'class-a');
    expect(mocks.eval).toHaveBeenCalledTimes(2);
  });

  it('resolves every linked student of a class with a single MGET', async () => {
    const ids = Array.from({ length: 25 }, (_, index) => `student-${index}`);
    mocks.smembers.mockImplementation(async (key: string) => (key === 'users:prof:prof-1' ? ids : []));
    mocks.get.mockImplementation(async (key: string) => ({
      accountId: key.replace('user:id:', ''), role: 'student', profId: 'prof-1', classId: 'class-a',
    }));
    const subs = ids.map(id => ({ key: id, data: { accountId: id } }));
    mocks.resolveClassSubscribers.mockResolvedValue({ subs, orphans: [] });
    mocks.sendToSubscribers.mockResolvedValue({ sent: 25, failed: 0, expired: [] });

    await notifySessionStudents(
      { accountId: 'prof-1' },
      { scope: 'all', classIds: [], legacy: false },
      'class-a',
      'present-key',
      { absentOnly: false, title: 'Séance', body: 'Début', tag: 'session-1' },
    );

    expect(mocks.mget).toHaveBeenCalledTimes(1);
    expect(mocks.sendToSubscribers.mock.calls[0][0]).toHaveLength(25);
  });

  it('never targets a legacy subscription that only matches by student name', async () => {
    mocks.smembers.mockImplementation(async (key: string) => (
      key === 'users:prof:prof-1' ? ['student-1'] : []
    ));
    mocks.get.mockResolvedValue({
      accountId: 'student-1', role: 'student', profId: 'prof-1', classId: 'class-a', name: 'Même nom',
    });
    const canonical = { key: 'canonical', data: { accountId: 'student-1', studentName: 'Même nom' } };
    mocks.resolveClassSubscribers.mockResolvedValue({
      subs: [canonical, { key: 'legacy', data: { studentName: 'Même nom' } }],
      orphans: [],
    });
    mocks.sendToSubscribers.mockResolvedValue({ sent: 1, failed: 0, expired: [] });

    await notifySessionStudents(
      { accountId: 'prof-1' },
      { scope: 'selected', classIds: ['class-a'], legacy: false },
      'class-a',
      'present-key',
      { absentOnly: false, title: 'Séance', body: 'Début', tag: 'session-1' },
    );

    expect(mocks.sendToSubscribers).toHaveBeenCalledWith([canonical], '{}');
  });
});
