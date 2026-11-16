import { beforeEach, describe, expect, it, vi } from 'vitest';

const store = vi.hoisted(() => ({ data: new Map<string, string>() }));

vi.mock('../../src/server/professor/shared.js', () => ({
  redis: {
    get: vi.fn(async (key: string) => {
      const raw = store.data.get(key);
      return raw === undefined ? null : JSON.parse(raw);
    }),
    set: vi.fn(async (key: string, value: string) => { store.data.set(key, value); return 'OK'; }),
    del: vi.fn(async (key: string) => { store.data.delete(key); return 1; }),
    mget: vi.fn(async (...keys: string[]) => keys.map(key => {
      const raw = store.data.get(key);
      return raw === undefined ? null : JSON.parse(raw);
    })),
  },
  readActiveAccountSession: vi.fn(),
  buildNotifyPayload: vi.fn(() => '{}'),
  resolveClassSubscribers: vi.fn(async () => ({ subs: [], orphans: [] })),
  sendToSubscribers: vi.fn(),
  cleanupExpired: vi.fn(),
}));

import { createHash } from 'node:crypto';
import { handleProfessorSharedAction } from '../../src/server/professor/sharing';

const PHONE = '+212600000000';
const owner = createHash('sha256').update(PHONE).digest('hex').slice(0, 20);
const legacyKey = `prof:shared:${owner}`;
const indexKey = `${legacyKey}:index`;
const imageKey = (id: string) => `${legacyKey}:img:${id}`;

const professor = { accountId: 'prof-1', phone: PHONE };
const access = { scope: 'all', classIds: [] } as any;

const pngUri = (() => {
  const header = Buffer.alloc(33);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(header, 0);
  header.writeUInt32BE(13, 8);
  header.write('IHDR', 12, 'ascii');
  header.writeUInt32BE(64, 16);
  header.writeUInt32BE(48, 20);
  return `data:image/png;base64,${header.toString('base64')}`;
})();

function response() {
  const res: any = { status: vi.fn(), json: vi.fn() };
  res.status.mockReturnValue(res);
  return res;
}

const student = {
  accountId: 'student-1', role: 'student', profId: 'prof-1', classId: 'class-a', name: 'Élève',
};

function seedStudent() {
  store.data.set('user:id:student-1', JSON.stringify(student));
}

async function save(caption = 'figure') {
  const res = response();
  await handleProfessorSharedAction(
    'shared-save',
    { method: 'POST', body: { classId: 'class-a', studentAccountId: 'student-1', dataUri: pngUri, caption } } as any,
    res,
    professor,
    access,
    'class-a',
  );
  return res;
}

describe('partage d\'images : une clé par image', () => {
  beforeEach(() => {
    store.data.clear();
    seedStudent();
  });

  it('écrit l\'image et un index léger sans data URI', async () => {
    const res = await save();
    expect(res.status).toHaveBeenCalledWith(200);
    const { image } = res.json.mock.calls[0][0];

    expect(store.data.has(imageKey(image.id))).toBe(true);
    const index = JSON.parse(store.data.get(indexKey)!);
    expect(index.images).toHaveLength(1);
    expect(index.images[0]).not.toHaveProperty('dataUri');
    expect(index.images[0]).toMatchObject({ id: image.id, classId: 'class-a', studentAccountId: 'student-1' });
    expect(store.data.has(legacyKey)).toBe(false);
  });

  it('liste les images complètes à partir de l\'index', async () => {
    const saved = (await save('a')).json.mock.calls[0][0].image;
    const res = response();
    await handleProfessorSharedAction('shared-list', { method: 'POST', body: {} } as any, res, professor, access, 'class-a');
    const { images } = res.json.mock.calls[0][0];
    expect(images).toHaveLength(1);
    expect(images[0]).toMatchObject({ id: saved.id, caption: 'a', dataUri: pngUri });
  });

  it('migre l\'ancien format à la première lecture', async () => {
    const legacy = {
      images: [
        { id: 'old_1', studentAccountId: 'student-1', studentName: 'Élève', classId: 'class-a', caption: 'ancienne', dataUri: pngUri, createdAt: 1 },
      ],
    };
    store.data.set(legacyKey, JSON.stringify(legacy));

    const res = response();
    await handleProfessorSharedAction('shared-list', { method: 'POST', body: {} } as any, res, professor, access, 'class-a');

    expect(res.json.mock.calls[0][0].images[0]).toMatchObject({ id: 'old_1', dataUri: pngUri });
    expect(store.data.has(legacyKey)).toBe(false);
    expect(store.data.has(imageKey('old_1'))).toBe(true);
    expect(JSON.parse(store.data.get(indexKey)!).images[0]).not.toHaveProperty('dataUri');
  });

  it('supprime l\'image et son entrée d\'index', async () => {
    const saved = (await save()).json.mock.calls[0][0].image;
    const res = response();
    await handleProfessorSharedAction('shared-delete', { method: 'POST', body: { id: saved.id } } as any, res, professor, access, 'class-a');

    expect(store.data.has(imageKey(saved.id))).toBe(false);
    expect(JSON.parse(store.data.get(indexKey)!).images).toHaveLength(0);
  });

  it('plafonne à 60 images et supprime les plus anciennes', async () => {
    const firstId = (await save('0')).json.mock.calls[0][0].image.id;
    for (let i = 1; i <= 60; i += 1) await save(String(i));

    const index = JSON.parse(store.data.get(indexKey)!);
    expect(index.images).toHaveLength(60);
    expect(store.data.has(imageKey(firstId))).toBe(false);
    const imageKeys = Array.from(store.data.keys()).filter(key => key.includes(':img:'));
    expect(imageKeys).toHaveLength(60);
  });

  it('refuse un contenu dont la signature ne correspond pas au type annoncé', async () => {
    const res = response();
    const fakeJpeg = `data:image/jpeg;base64,${Buffer.from(pngUri.split(',')[1], 'base64').toString('base64')}`;
    await handleProfessorSharedAction(
      'shared-save',
      { method: 'POST', body: { classId: 'class-a', studentAccountId: 'student-1', dataUri: fakeJpeg } } as any,
      res, professor, access, 'class-a',
    );
    expect(res.status).toHaveBeenCalledWith(400);
    expect(store.data.has(indexKey)).toBe(false);
  });
});
