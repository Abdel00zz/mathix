import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Isolation du contenu professeur : gel, livraison, application.
 *
 * Redis est remplacé par un magasin en mémoire (chaînes, hashes, listes) plutôt
 * que par des `mockImplementation` par clé : le mécanisme repose sur des
 * lectures/écritures croisées (photo du gel, historique, manifestes) qu'un
 * magasin réel rend lisibles, et les scripts Lua y sont rejoués fidèlement.
 */
const store = vi.hoisted(() => ({
  strings: new Map<string, string>(),
  hashes: new Map<string, Map<string, string>>(),
  lists: new Map<string, string[]>(),
}));

const mocks = vi.hoisted(() => ({
  isAdmin: vi.fn(),
  readActiveAccountSession: vi.fn(),
  readActiveProfessorSession: vi.fn(),
}));

vi.mock('../../src/server/professor/shared.js', () => {
  const hashOf = (key: string) => {
    let entries = store.hashes.get(key);
    if (!entries) { entries = new Map<string, string>(); store.hashes.set(key, entries); }
    return entries;
  };
  const listOf = (key: string) => store.lists.get(key) || [];
  // `automaticDeserialization` est actif par défaut sur le client Upstash : une
  // lecture rend un nombre ou un objet, pas la chaîne stockée. Le simulacre doit
  // en faire autant, sinon il valide un contrat que la production n'honore pas.
  const revive = (raw: string | undefined) => {
    if (raw === undefined) return null;
    try { return JSON.parse(raw); } catch { return raw; }
  };

  return {
    redis: {
      get: async (key: string) => revive(store.strings.get(key)),
      set: async (key: string, value: unknown) => {
        store.strings.set(key, typeof value === 'string' ? value : JSON.stringify(value));
        return 'OK';
      },
      del: async (...keys: string[]) => {
        for (const key of keys) { store.strings.delete(key); store.hashes.delete(key); store.lists.delete(key); }
        return keys.length;
      },
      mget: async (...keys: string[]) => keys.map(key => revive(store.strings.get(key))),
      hget: async (key: string, field: string) => revive(hashOf(key).get(field)),
      hgetall: async (key: string) => {
        const entries = store.hashes.get(key);
        if (!entries || !entries.size) return null;
        return Object.fromEntries([...entries].map(([field, value]) => [field, revive(value)]));
      },
      hset: async (key: string, kv: Record<string, unknown>) => {
        const entries = hashOf(key);
        for (const [field, value] of Object.entries(kv)) entries.set(field, String(value));
        return Object.keys(kv).length;
      },
      hdel: async (key: string, ...fields: string[]) => {
        const entries = hashOf(key);
        return fields.filter(field => entries.delete(field)).length;
      },
      lpush: async (key: string, ...values: string[]) => {
        const list = listOf(key);
        list.unshift(...values.map(String));
        store.lists.set(key, list);
        return list.length;
      },
      ltrim: async (key: string, start: number, stop: number) => {
        store.lists.set(key, listOf(key).slice(start, stop === -1 ? undefined : stop + 1));
        return 'OK';
      },
      lrange: async (key: string, start: number, stop: number) => (
        (stop === -1 ? listOf(key).slice(start) : listOf(key).slice(start, stop + 1)).map(revive)
      ),
      eval: async (script: string, keys: string[], argv: string[]) => {
        // Accusé de lecture sur place (LSET), sans jamais vider la liste.
        if (script.includes("message['readAt']")) {
          const list = listOf(keys[0]);
          let changed = 0;
          list.forEach((raw, index) => {
            const message = JSON.parse(raw);
            if (message.from === argv[0] && !message.readAt) {
              list[index] = JSON.stringify({ ...message, readAt: Number(argv[1]) });
              changed += 1;
            }
          });
          store.lists.set(keys[0], list);
          return changed;
        }
        // Publication atomique : version monotone + contenu + entrée de manifeste.
        if (script.includes('math.max')) {
          const current = Number(store.strings.get(keys[2]) || 0);
          const version = Math.max(Number(argv[2]) || 0, current + 1);
          store.strings.set(keys[2], String(version));
          store.strings.set(keys[1], argv[1]);
          hashOf(keys[0]).set(argv[0], String(version));
          return version;
        }
        // Suppression : contenu + entrée de manifeste.
        store.strings.delete(keys[1]);
        hashOf(keys[0]).delete(argv[0]);
        return 1;
      },
    },
    isAdmin: mocks.isAdmin,
    readActiveAccountSession: mocks.readActiveAccountSession,
    readActiveProfessorSession: mocks.readActiveProfessorSession,
  };
});

import handler from '../../api/content';

const PHONE = '+212600000000';
const OWNER = `prof:${createHash('sha256').update(PHONE).digest('hex').slice(0, 20)}`;
const FROZEN_AT = 1_000_000;

function response() {
  const res = { status: vi.fn(), json: vi.fn(), setHeader: vi.fn() };
  res.status.mockReturnValue(res);
  return res;
}

/** Dernier payload passé à `res.json`. */
function payload(res: ReturnType<typeof response>): any {
  const calls = res.json.mock.calls;
  return calls.length ? calls[calls.length - 1][0] : null;
}

function hashOf(key: string) {
  let entries = store.hashes.get(key);
  if (!entries) { entries = new Map<string, string>(); store.hashes.set(key, entries); }
  return entries;
}

/** Publication officielle (admin) à une version donnée. */
function seedOfficial(path: string, content: unknown, version: number) {
  hashOf('content:files').set(path, String(version));
  store.strings.set(`content:file:${path}`, JSON.stringify(content));
}

/** Révision remplacée : `at` = moment du remplacement, `content` = l'ancienne. */
function seedOfficialHistory(path: string, entries: Array<{ at: number; content: unknown }>) {
  // LPUSH empile : le plus récent d'abord, comme le fait `handleSave`.
  store.lists.set(
    `content:file:${path}:history`,
    [...entries].sort((a, b) => b.at - a.at).map(entry => JSON.stringify(entry)),
  );
}

/** Override déjà présent dans l'espace du professeur. */
function seedProfFile(path: string, content: unknown, version: number) {
  hashOf(`content:files:${OWNER}`).set(path, String(version));
  store.strings.set(`content:file:${OWNER}:${path}`, JSON.stringify(content));
}

/** Photo du gel telle que la promotion l'écrit. */
function seedBaseline(files: Record<string, number>, at = FROZEN_AT) {
  store.strings.set(`content:baseline:${OWNER}`, JSON.stringify({ at, capturedAt: at }));
  const entries = hashOf(`content:baseline:${OWNER}:files`);
  for (const [path, version] of Object.entries(files)) entries.set(path, String(version));
}

function profUser(overrides: Record<string, any> = {}) {
  return {
    accountId: 'prof-1',
    role: 'prof',
    phone: PHONE,
    classId: 'class-a',
    name: 'Prof A',
    roleUpdatedAt: FROZEN_AT,
    profClassScope: 'selected',
    profClasses: ['class-a'],
    ...overrides,
  };
}

/** Le professeur *lit* : chemin `readActiveAccountSession`. */
function asProfReader(overrides: Record<string, any> = {}) {
  const user = profUser(overrides);
  store.strings.set('user:id:prof-1', JSON.stringify(user));
  mocks.readActiveAccountSession.mockResolvedValue({ user });
  return user;
}

/** Le professeur *écrit* : chemin `readActiveProfessorSession`. */
function asProfWriter(overrides: Record<string, any> = {}) {
  const user = profUser(overrides);
  store.strings.set('user:id:prof-1', JSON.stringify(user));
  mocks.readActiveProfessorSession.mockResolvedValue({
    accountId: 'prof-1', phone: PHONE, classId: 'class-a', name: 'Prof A', role: 'prof',
  });
  return user;
}

function call(query: Record<string, string>, body?: unknown, headers: Record<string, string> = {}) {
  const res = response();
  return handler(
    { method: body ? 'POST' : 'GET', query, headers, body: body as any },
    res as any,
  ).then(() => res);
}

beforeEach(() => {
  vi.clearAllMocks();
  store.strings.clear();
  store.hashes.clear();
  store.lists.clear();
  mocks.isAdmin.mockReturnValue(false);
  mocks.readActiveAccountSession.mockResolvedValue(null);
  mocks.readActiveProfessorSession.mockResolvedValue(null);
});

describe('gel du contenu professeur', () => {
  it('cache au professeur ce que l’admin publie après l’activation du badge', async () => {
    seedOfficial('data/classes/class-a.json', { title: 'Classe A' }, FROZEN_AT - 500);
    seedOfficial('data/class-a/ch1/quiz/apres.json', { title: 'Publié après' }, FROZEN_AT + 500);
    asProfReader();

    const manifest = await call({ action: 'manifest' });
    expect(payload(manifest).files).toEqual({ 'data/classes/class-a.json': FROZEN_AT - 500 });

    const file = await call({ action: 'file', path: 'data/class-a/ch1/quiz/apres.json' });
    expect(file.status).toHaveBeenCalledWith(404);
  });

  it('sert la révision du gel quand l’admin a réédité un fichier depuis', async () => {
    seedBaseline({ 'data/class-a/ch1/quiz/q1.json': FROZEN_AT - 500 });
    seedOfficial('data/class-a/ch1/quiz/q1.json', { version: 'la plus récente' }, FROZEN_AT + 9_000);
    // Deux remplacements après le gel : c'est le plus ancien qui porte le
    // contenu vivant à la date du gel.
    seedOfficialHistory('data/class-a/ch1/quiz/q1.json', [
      { at: FROZEN_AT + 9_000, content: { version: 'intermédiaire' } },
      { at: FROZEN_AT + 3_000, content: { version: 'celle du gel' } },
    ]);
    asProfReader();

    const file = await call({ action: 'file', path: 'data/class-a/ch1/quiz/q1.json' });
    expect(payload(file)).toEqual({ version: 'celle du gel' });
  });

  it('laisse passer l’officiel pour un compte promu avant l’existence du gel', async () => {
    seedOfficial('data/class-a/ch1/quiz/apres.json', { title: 'Publié après' }, FROZEN_AT + 500);
    asProfReader({ roleUpdatedAt: undefined });

    const manifest = await call({ action: 'manifest' });
    expect(payload(manifest).files).toEqual({ 'data/class-a/ch1/quiz/apres.json': FROZEN_AT + 500 });

    const file = await call({ action: 'file', path: 'data/class-a/ch1/quiz/apres.json' });
    expect(payload(file)).toEqual({ title: 'Publié après' });
  });

  it('fait hériter l’élève du gel de son professeur, sans sortir de sa classe', async () => {
    store.strings.set('user:id:prof-1', JSON.stringify(profUser({ profClasses: ['class-a', 'class-b'] })));
    seedOfficial('data/classes/class-a.json', { title: 'Classe A' }, FROZEN_AT - 500);
    seedOfficial('data/class-a/ch1/quiz/apres.json', { title: 'Publié après' }, FROZEN_AT + 500);
    seedProfFile('data/class-a/ch1/quiz/perso.json', { title: 'Quiz du prof' }, FROZEN_AT + 100);
    seedProfFile('data/class-b/ch1/quiz/autre.json', { title: 'Autre niveau' }, FROZEN_AT + 100);
    mocks.readActiveAccountSession.mockResolvedValue({
      user: { role: 'student', classId: 'class-a', profId: 'prof-1' },
    });

    const manifest = await call({ action: 'manifest' });
    expect(payload(manifest).files).toEqual({
      'data/classes/class-a.json': FROZEN_AT - 500,
      'data/class-a/ch1/quiz/perso.json': FROZEN_AT + 100,
    });
  });

  it('capture la photo du gel à la première lecture d’un compte déjà promu', async () => {
    seedOfficial('data/classes/class-a.json', { title: 'Classe A' }, FROZEN_AT - 500);
    seedOfficial('data/class-a/ch1/quiz/apres.json', { title: 'Publié après' }, FROZEN_AT + 500);
    asProfReader();

    await call({ action: 'manifest' });

    expect(Object.fromEntries(hashOf(`content:baseline:${OWNER}:files`))).toEqual({
      'data/classes/class-a.json': String(FROZEN_AT - 500),
    });
    expect(JSON.parse(store.strings.get(`content:baseline:${OWNER}`) || '{}').at).toBe(FROZEN_AT);
  });
});

describe('livraison admin → professeur', () => {
  function asAdmin() {
    mocks.isAdmin.mockReturnValue(true);
    store.strings.set('user:id:prof-1', JSON.stringify(profUser()));
  }

  it('refuse un envoi sans secret admin', async () => {
    store.strings.set('user:id:prof-1', JSON.stringify(profUser()));
    const res = await call({ action: 'push-send' }, { accountId: 'prof-1', paths: ['data/class-a/ch1/quiz/q1.json'] });
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('ne propose que ce que le professeur ne reçoit plus, dans sa portée', async () => {
    asAdmin();
    seedBaseline({});
    seedOfficial('data/classes/class-a.json', {
      title: 'Classe A',
      chapters: [{ id: 'ch1', title: 'Suites' }],
    }, FROZEN_AT - 500);
    seedOfficial('data/class-a/ch1/quiz/limites.json', { title: 'Limites' }, FROZEN_AT + 1_000);
    seedOfficial('data/class-b/ch1/quiz/hors-portee.json', { title: 'Hors portée' }, FROZEN_AT + 1_000);

    const res = await call({ action: 'push-preview', accountId: 'prof-1' });
    const tree = payload(res).tree;

    expect(tree.total).toBe(1);
    expect(tree.classes).toHaveLength(1);
    expect(tree.classes[0].classId).toBe('class-a');
    expect(tree.classes[0].chapters[0].chapterTitle).toBe('Suites');
    expect(tree.classes[0].chapters[0].entries[0]).toMatchObject({
      path: 'data/class-a/ch1/quiz/limites.json',
      kind: 'quiz',
      label: 'Limites',
      conflict: false,
    });
  });

  it('signale le conflit quand le professeur a déjà son propre fichier', async () => {
    asAdmin();
    seedBaseline({});
    seedOfficial('data/class-a/ch1/quiz/limites.json', { title: 'Limites' }, FROZEN_AT + 1_000);
    seedProfFile('data/class-a/ch1/quiz/limites.json', { title: 'Ma version' }, FROZEN_AT + 200);

    const res = await call({ action: 'push-preview', accountId: 'prof-1' });
    expect(payload(res).tree.conflicts).toBe(1);
    expect(payload(res).tree.classes[0].chapters[0].entries[0].conflict).toBe(true);
  });

  it('compose un message par défaut modifiable et met la proposition en attente', async () => {
    asAdmin();
    seedBaseline({});
    seedOfficial('data/classes/class-a.json', { title: 'Classe A' }, FROZEN_AT - 500);
    seedOfficial('data/class-a/ch1/quiz/limites.json', { title: 'Limites' }, FROZEN_AT + 1_000);

    const sent = await call({ action: 'push-send' }, {
      accountId: 'prof-1',
      paths: ['data/class-a/ch1/quiz/limites.json'],
    });
    const proposal = payload(sent).proposal;
    expect(proposal.status).toBe('pending');
    expect(proposal.title).toBe('Mise à jour du contenu');
    expect(proposal.message).toContain('Classe A');
    expect(proposal.entries).toHaveLength(1);

    const custom = await call({ action: 'push-send' }, {
      accountId: 'prof-1',
      paths: ['data/class-a/ch1/quiz/limites.json'],
      title: 'Nouveau chapitre',
      message: 'À intégrer avant lundi.',
    });
    expect(payload(custom).proposal.title).toBe('Nouveau chapitre');
    expect(payload(custom).proposal.message).toBe('À intégrer avant lundi.');
  });

  it('rejette un chemin que le professeur n’a pas le droit de recevoir', async () => {
    asAdmin();
    seedBaseline({});
    seedOfficial('data/class-b/ch1/quiz/hors-portee.json', { title: 'Hors portée' }, FROZEN_AT + 1_000);

    const res = await call({ action: 'push-send' }, {
      accountId: 'prof-1',
      paths: ['data/class-b/ch1/quiz/hors-portee.json'],
    });
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

describe('application par le professeur', () => {
  it('remplace un document et garde l’ancienne révision dans l’historique', async () => {
    asProfWriter();
    seedBaseline({});
    seedOfficial('data/class-a/ch1/quiz/limites.json', { title: 'Limites (officiel)' }, FROZEN_AT + 1_000);
    seedProfFile('data/class-a/ch1/quiz/limites.json', { title: 'Ma version' }, FROZEN_AT + 200);

    const res = await call({ action: 'sync-apply' }, { paths: ['data/class-a/ch1/quiz/limites.json'] });

    expect(payload(res)).toMatchObject({
      applied: ['data/class-a/ch1/quiz/limites.json'],
      overwritten: ['data/class-a/ch1/quiz/limites.json'],
      skipped: [],
    });
    expect(JSON.parse(store.strings.get(`content:file:${OWNER}:data/class-a/ch1/quiz/limites.json`) || 'null'))
      .toEqual({ title: 'Limites (officiel)' });
    const history = (store.lists.get(`content:file:${OWNER}:data/class-a/ch1/quiz/limites.json:history`) || [])
      .map(entry => JSON.parse(entry));
    expect(history[0].content).toEqual({ title: 'Ma version' });
  });

  it('fusionne un sommaire au lieu de l’écraser', async () => {
    asProfWriter();
    seedBaseline({});
    seedOfficial('data/classes/class-a.json', {
      title: 'Classe A',
      chapters: [
        { id: 'ch1', title: 'Suites (officiel)', quizzes: [{ path: 'off.json' }], manifestPath: 'data/class-a/ch1/manifest.json' },
        { id: 'ch2', title: 'Nouveau chapitre officiel' },
      ],
    }, FROZEN_AT + 1_000);
    seedProfFile('data/classes/class-a.json', {
      title: 'Ma classe',
      chapters: [
        { id: 'ch1', title: 'Mon titre', quizzes: [{ path: 'perso.json' }] },
        { id: 'ch-perso', title: 'Chapitre que j’ai créé' },
      ],
    }, FROZEN_AT + 200);

    await call({ action: 'sync-apply' }, { paths: ['data/classes/class-a.json'] });

    const merged = JSON.parse(store.strings.get(`content:file:${OWNER}:data/classes/class-a.json`) || 'null');
    // Les champs du professeur gagnent, ses ressources restent en tête.
    expect(merged.title).toBe('Ma classe');
    expect(merged.chapters.map((chapter: any) => chapter.id)).toEqual(['ch1', 'ch-perso', 'ch2']);
    expect(merged.chapters[0].title).toBe('Mon titre');
    expect(merged.chapters[0].quizzes).toEqual([{ path: 'perso.json' }, { path: 'off.json' }]);
    expect(merged.chapters[0].manifestPath).toBe('data/class-a/ch1/manifest.json');
  });

  it('ignore un chemin hors de la portée du compte, même coché par l’admin', async () => {
    asProfWriter({ profClassScope: 'none', profClasses: [] });
    seedBaseline({});
    seedOfficial('data/class-a/ch1/quiz/limites.json', { title: 'Limites' }, FROZEN_AT + 1_000);

    const res = await call({ action: 'sync-apply' }, { paths: ['data/class-a/ch1/quiz/limites.json'] });

    expect(payload(res)).toMatchObject({ applied: [], skipped: ['data/class-a/ch1/quiz/limites.json'] });
    expect(store.strings.has(`content:file:${OWNER}:data/class-a/ch1/quiz/limites.json`)).toBe(false);
  });

  it('retire le chemin appliqué de la photo du gel', async () => {
    asProfWriter();
    seedBaseline({ 'data/class-a/ch1/quiz/limites.json': FROZEN_AT - 500 });
    seedOfficial('data/class-a/ch1/quiz/limites.json', { title: 'Limites' }, FROZEN_AT + 1_000);

    await call({ action: 'sync-apply' }, { paths: ['data/class-a/ch1/quiz/limites.json'] });

    expect(hashOf(`content:baseline:${OWNER}:files`).has('data/class-a/ch1/quiz/limites.json')).toBe(false);
  });

  it('marque la proposition appliquée et la fait disparaître de l’attente', async () => {
    mocks.isAdmin.mockReturnValue(true);
    store.strings.set('user:id:prof-1', JSON.stringify(profUser()));
    seedBaseline({});
    seedOfficial('data/class-a/ch1/quiz/limites.json', { title: 'Limites' }, FROZEN_AT + 1_000);

    const sent = await call({ action: 'push-send' }, {
      accountId: 'prof-1',
      paths: ['data/class-a/ch1/quiz/limites.json'],
    });
    const proposalId = payload(sent).proposal.id;

    mocks.isAdmin.mockReturnValue(false);
    asProfWriter();
    mocks.readActiveAccountSession.mockResolvedValue(null);

    const status = await call({ action: 'sync-status' }, undefined, { 'x-content-actor': 'professor' });
    expect(payload(status).pending).toBe(1);
    expect(payload(status).lastProposal.id).toBe(proposalId);

    const applied = await call({ action: 'sync-apply' }, { proposalId }, { 'x-content-actor': 'professor' });
    expect(payload(applied).proposal.status).toBe('applied');

    const after = await call({ action: 'sync-status' }, undefined, { 'x-content-actor': 'professor' });
    expect(payload(after).pending).toBe(0);
  });

  it('n’expose pas la proposition d’un autre professeur', async () => {
    asProfWriter();
    // Proposition déposée dans l'espace d'un autre enseignant.
    hashOf('content:push:prof:autre').set('abc', JSON.stringify({ id: 'abc', at: 1, entries: [], status: 'pending' }));

    const res = await call({ action: 'sync-apply' }, { proposalId: 'abc' });
    expect(res.status).toHaveBeenCalledWith(404);
  });
});

describe('messagerie admin ↔ professeur', () => {
  it('fait circuler le fil dans les deux sens et éteint la pastille à la lecture', async () => {
    mocks.isAdmin.mockReturnValue(true);
    store.strings.set('user:id:prof-1', JSON.stringify(profUser()));

    await call({ action: 'admin-message' }, { accountId: 'prof-1', body: 'Pensez à intégrer le chapitre 3.' });
    let summary = JSON.parse(store.strings.get(`content:sync:${OWNER}`) || '{}');
    expect(summary.profUnread).toBe(1);

    mocks.isAdmin.mockReturnValue(false);
    asProfWriter();
    await call({ action: 'message-read' }, {}, { 'x-content-actor': 'professor' });
    await call({ action: 'prof-message' }, { body: 'C’est fait, merci.' }, { 'x-content-actor': 'professor' });

    summary = JSON.parse(store.strings.get(`content:sync:${OWNER}`) || '{}');
    expect(summary.profUnread).toBe(0);
    expect(summary.adminUnread).toBe(1);

    mocks.isAdmin.mockReturnValue(true);
    mocks.readActiveProfessorSession.mockResolvedValue(null);
    const thread = await call({ action: 'admin-thread', accountId: 'prof-1' });
    const messages = payload(thread).messages;
    expect(messages.map((message: any) => message.from)).toEqual(['admin', 'prof']);
    expect(messages[1].body).toBe('C’est fait, merci.');

    summary = JSON.parse(store.strings.get(`content:sync:${OWNER}`) || '{}');
    expect(summary.adminUnread).toBe(0);
  });

  it("l'accusé de lecture garde tout le fil, dans l'ordre, et ne marque que l'autre côté", async () => {
    store.strings.set('user:id:prof-1', JSON.stringify(profUser()));
    // Stockage décroissant (LPUSH) : le plus récent en premier.
    store.lists.set(`content:thread:${OWNER}`, [
      JSON.stringify({ id: 'c', at: 3, from: 'prof', body: 'Merci' }),
      JSON.stringify({ id: 'b', at: 2, from: 'admin', body: 'Deuxième' }),
      JSON.stringify({ id: 'a', at: 1, from: 'admin', body: 'Premier', readAt: 50 }),
    ]);

    mocks.isAdmin.mockReturnValue(false);
    asProfWriter();
    await call({ action: 'message-read' }, {}, { 'x-content-actor': 'professor' });

    const stored = (store.lists.get(`content:thread:${OWNER}`) || []).map(raw => JSON.parse(raw));
    expect(stored.map(message => message.id)).toEqual(['c', 'b', 'a']);
    expect(stored[0].readAt).toBeUndefined();
    expect(typeof stored[1].readAt).toBe('number');
    // Un accusé déjà posé n'est jamais réécrit.
    expect(stored[2].readAt).toBe(50);
  });

  it('refuse un message vide', async () => {
    mocks.isAdmin.mockReturnValue(true);
    store.strings.set('user:id:prof-1', JSON.stringify(profUser()));
    const res = await call({ action: 'admin-message' }, { accountId: 'prof-1', body: '   ' });
    expect(res.status).toHaveBeenCalledWith(400);
  });
});
