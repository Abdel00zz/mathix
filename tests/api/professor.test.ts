import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  mget: vi.fn(),
  set: vi.fn(),
  eval: vi.fn(),
  zadd: vi.fn(),
  smembers: vi.fn(),
  readActiveProfessorSession: vi.fn(),
}));

vi.mock('../../src/server/professor/shared.js', () => ({
  redis: {
    get: mocks.get,
    mget: mocks.mget,
    set: mocks.set,
    smembers: mocks.smembers,
    srem: vi.fn(),
    sadd: vi.fn(),
    del: vi.fn(),
    expire: vi.fn(),
    eval: mocks.eval,
    zrem: vi.fn(),
    zadd: mocks.zadd,
  },
  readActiveProfessorSession: mocks.readActiveProfessorSession,
  readActiveAccountSession: vi.fn(),
  normalizeUrl: vi.fn((url: string) => url),
  buildNotifyPayload: vi.fn(() => '{}'),
  resolveClassSubscribers: vi.fn(async () => ({ subs: [], orphans: [] })),
  sendToSubscribers: vi.fn(),
  cleanupExpired: vi.fn(),
}));

import handler from '../../api/professor';

function response() {
  const res = { status: vi.fn(), json: vi.fn() };
  res.status.mockReturnValue(res);
  return res;
}

const professorSession = {
  accountId: 'prof-1', phone: '+212600000000', classId: 'class-a', role: 'prof',
};

describe('/api/professor class authorization', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.readActiveProfessorSession.mockResolvedValue(professorSession);
    mocks.smembers.mockResolvedValue([]);
    mocks.mget.mockImplementation(async (...keys: string[]) => Promise.all(keys.map(key => mocks.get(key))));
  });

  it('rejects session-set before writing when the requested class is forbidden', async () => {
    mocks.get.mockResolvedValue({ profClassScope: 'selected', profClasses: ['class-a'] });
    const res = response();

    await handler({
      method: 'POST',
      query: { action: 'session-set' },
      body: { classId: 'class-b', status: 'running' },
    }, res as any);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ error: 'professor_class_access_denied' });
    expect(mocks.set).not.toHaveBeenCalled();
  });

  it('rejects a forged shared-image recipient not linked to the professor', async () => {
    mocks.get.mockImplementation(async (key: string) => {
      if (key === 'user:id:prof-1') return { profClassScope: 'selected', profClasses: ['class-a'] };
      if (key === 'user:id:student-1') {
        return { accountId: 'student-1', role: 'student', profId: 'prof-2', classId: 'class-a', name: 'Élève' };
      }
      return { images: [] };
    });
    const res = response();

    await handler({
      method: 'POST',
      query: { action: 'shared-save' },
      body: {
        classId: 'class-a',
        studentAccountId: 'student-1',
        studentName: 'Nom falsifié',
        dataUri: 'data:image/png;base64,AAAA',
      },
    }, res as any);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ error: 'student_not_linked_to_professor' });
    expect(mocks.set).not.toHaveBeenCalled();
  });

  it('cannot switch the class of a running session from a stale client', async () => {
    mocks.get.mockImplementation(async (key: string) => {
      if (key === 'user:id:prof-1') {
        return { profClassScope: 'all', profClasses: [] };
      }
      if (key.endsWith(':session')) {
        return { status: 'running', classId: 'class-a', chapterId: 'chapter-1' };
      }
      return null;
    });
    const res = response();

    await handler({
      method: 'POST',
      query: { action: 'session-set' },
      body: { classId: 'class-b', status: 'running' },
    }, res as any);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith({ error: 'active_session_class_conflict' });
    expect(mocks.eval).not.toHaveBeenCalled();
    expect(mocks.set).not.toHaveBeenCalled();
  });

  it('cannot schedule another class by overwriting a running session', async () => {
    mocks.get.mockImplementation(async (key: string) => {
      if (key === 'user:id:prof-1') return { profClassScope: 'all', profClasses: [] };
      if (key.endsWith(':session')) return { status: 'running', classId: 'class-a' };
      return null;
    });
    const res = response();

    await handler({
      method: 'POST',
      query: { action: 'session-schedule' },
      body: { classId: 'class-b', scheduledAt: Date.now() + 60_000 },
    }, res as any);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith({ error: 'active_session_class_conflict' });
    expect(mocks.set).not.toHaveBeenCalled();
    expect(mocks.zadd).not.toHaveBeenCalled();
  });

  it('does not write class B attendance into an active class A session', async () => {
    mocks.get.mockImplementation(async (key: string) => {
      if (key === 'user:id:prof-1') return { profClassScope: 'all', profClasses: [] };
      if (key.endsWith(':session')) return { status: 'running', classId: 'class-a', history: [] };
      return null;
    });
    const res = response();

    await handler({
      method: 'POST',
      query: { action: 'present-set' },
      body: { classId: 'class-b', studentIds: ['student-1'] },
    }, res as any);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith({ error: 'active_session_class_conflict' });
    expect(mocks.eval).not.toHaveBeenCalled();
    expect(mocks.set).not.toHaveBeenCalled();
  });

  it('does not present a class B message as part of an active class A session', async () => {
    mocks.get.mockImplementation(async (key: string) => {
      if (key === 'user:id:prof-1') return { profClassScope: 'all', profClasses: [] };
      if (key.endsWith(':session')) return { status: 'running', classId: 'class-a' };
      return null;
    });
    const res = response();

    await handler({
      method: 'POST',
      query: { action: 'session-notify' },
      body: { classId: 'class-b', title: 'Séance', body: 'Rejoignez-nous' },
    }, res as any);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith({ error: 'active_session_class_conflict' });
    expect(mocks.eval).not.toHaveBeenCalled();
  });

  it('keeps class-students routed outside the classroom state handler', async () => {
    mocks.smembers.mockResolvedValue(['student-1']);
    mocks.get.mockImplementation(async (key: string) => {
      if (key === 'user:id:prof-1') {
        return { profClassScope: 'selected', profClasses: ['class-a'] };
      }
      if (key === 'user:id:student-1') {
        return {
          accountId: 'student-1', role: 'student', profId: 'prof-1',
          classId: 'class-a', name: 'Élève', phone: '+212611111111',
        };
      }
      if (key.startsWith('progress:class-a:')) return { progress: {} };
      return null;
    });
    const res = response();

    await handler({
      method: 'POST', query: { action: 'class-students' }, body: { classId: 'class-a' },
    }, res as any);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      students: [expect.objectContaining({ accountId: 'student-1', name: 'Élève' })],
    });
    expect(mocks.eval).not.toHaveBeenCalled();
  });

  describe('image-save (copie cloud des images du canvas)', () => {
    const IMAGE_ID = 'img_12345678-aaaa';
    const pngUri = (width: number, height: number) => {
      const header = Buffer.alloc(33);
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(header, 0);
      header.writeUInt32BE(13, 8);
      header.write('IHDR', 12, 'ascii');
      header.writeUInt32BE(width, 16);
      header.writeUInt32BE(height, 20);
      return `data:image/png;base64,${header.toString('base64')}`;
    };
    const save = async (image: unknown) => {
      mocks.get.mockImplementation(async (key: string) => (
        key === 'user:id:prof-1' ? { profClassScope: 'all', profClasses: [] } : null
      ));
      const res = response();
      await handler({ method: 'POST', query: { action: 'image-save' }, body: { imageId: IMAGE_ID, image } }, res as any);
      return res;
    };

    it('rejects a data URI whose bytes are not the announced image', async () => {
      const fake = `data:image/png;base64,${Buffer.from('<script>alert(1)</script>').toString('base64')}`;
      const res = await save({ dataUri: fake });
      expect(res.status).toHaveBeenCalledWith(400);
      expect(mocks.set).not.toHaveBeenCalled();
    });

    it('rejects an image larger than the accepted edge', async () => {
      const res = await save({ dataUri: pngUri(9000, 100) });
      expect(res.status).toHaveBeenCalledWith(413);
      expect(mocks.set).not.toHaveBeenCalled();
    });

    it('stores only the expected fields, with dimensions read from the binary', async () => {
      const dataUri = pngUri(800, 400);
      const res = await save({
        dataUri, width: 1, height: 1, ratio: 99, bytes: 123456789, payload: 'x'.repeat(1000), extra: { nested: true },
      });
      expect(res.json).toHaveBeenCalledWith({ success: true });
      const stored = JSON.parse(String(mocks.set.mock.calls[0][1]));
      expect(Object.keys(stored).sort()).toEqual(['bytes', 'createdAt', 'dataUri', 'height', 'ratio', 'width']);
      expect(stored).toMatchObject({ width: 800, height: 400, ratio: 2 });
      // Le poids vient du binaire décodé, pas de la valeur annoncée par le client.
      expect(stored.bytes).toBe(33);
    });
  });

  it('reads a whole class with two MGET commands, whatever its size', async () => {
    const ids = Array.from({ length: 30 }, (_, index) => `student-${index}`);
    mocks.smembers.mockResolvedValue(ids);
    mocks.get.mockImplementation(async (key: string) => {
      if (key === 'user:id:prof-1') return { profClassScope: 'selected', profClasses: ['class-a'] };
      const match = /^user:id:(student-\d+)$/.exec(key);
      if (match) {
        return {
          accountId: match[1], role: 'student', profId: 'prof-1',
          classId: 'class-a', name: match[1], phone: `+2126${match[1].replace(/\D/g, '').padStart(8, '0')}`,
        };
      }
      return key.startsWith('progress:class-a:') ? { progress: { c1: { revisionProgress: 40 } } } : null;
    });
    const res = response();

    await handler({
      method: 'POST', query: { action: 'class-students' }, body: { classId: 'class-a' },
      // Compte déjà lu avec la session : aucune relecture de la portée.
    }, res as any);

    const payload = res.json.mock.calls[0][0] as { students: Array<{ progress: { revisionAvg: number } }> };
    expect(payload.students).toHaveLength(30);
    expect(payload.students[0].progress.revisionAvg).toBe(40);
    expect(mocks.mget).toHaveBeenCalledTimes(2);
  });

  it('derives the class scope from the session account instead of re-reading Redis', async () => {
    mocks.readActiveProfessorSession.mockResolvedValue({
      ...professorSession,
      user: { accountId: 'prof-1', role: 'prof', profClassScope: 'selected', profClasses: ['class-a'] },
    });
    const res = response();

    await handler({
      method: 'POST', query: { action: 'class-students' }, body: { classId: 'class-b' },
    }, res as any);

    // La portée provient du compte déjà lu : class-b est refusée sans `GET user:id`.
    expect(res.status).toHaveBeenCalledWith(403);
    expect(mocks.get).not.toHaveBeenCalled();
  });

  it('replaces the attendance list in one script and logs it through the session CAS', async () => {
    const running = { status: 'running', classId: 'class-a', revision: 4, updatedAt: 10, history: [], activity: { exerciseIds: ['e1'], strokes: {} } };
    mocks.get.mockImplementation(async (key: string) => {
      if (key === 'user:id:prof-1') return { profClassScope: 'all', profClasses: [] };
      if (key.endsWith(':session')) return running;
      return null;
    });
    mocks.eval.mockResolvedValue(1);
    const res = response();

    await handler({
      method: 'POST', query: { action: 'present-set' }, body: { classId: 'class-a', studentIds: ['s1', 's2'] },
    }, res as any);

    expect(res.status).not.toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith({ success: true, presentIds: ['s1', 's2'] });
    const scripts = mocks.eval.mock.calls.map(call => ({ keys: call[1] as string[], args: call[2] as unknown[] }));
    const attendance = scripts.find(call => call.keys[0].endsWith(':present') && call.args.includes('s1'));
    expect(attendance?.args.slice(1)).toEqual(['s1', 's2']);
    // L'historique passe par le CAS de séance (revision + updatedAt) : l'activité de la tablette est conservée.
    const sessionCommit = scripts.find(call => call.keys[0].endsWith(':session') && typeof call.args[2] === 'string' && String(call.args[2]).includes('present'));
    expect(sessionCommit).toBeDefined();
    expect(sessionCommit?.args.slice(0, 2)).toEqual([4, 10]);
    expect(JSON.parse(String(sessionCommit?.args[2]))).toMatchObject({ revision: 5, activity: { exerciseIds: ['e1'] } });
    expect(mocks.set).not.toHaveBeenCalled();
  });
});
