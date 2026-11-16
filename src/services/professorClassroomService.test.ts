import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { professorClassroomService } from './professorClassroomService';

vi.mock('./professorSessionService', () => ({
  professorSessionService: {
    isProfessor: () => true,
    headers: () => ({ 'Content-Type': 'application/json' }),
  },
}));

describe('professor classroom session requests', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ session: { status: 'paused' } }),
    });
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    fetchMock.mockReset();
  });

  it.each(['paused', 'running', 'stopped'] as const)(
    'posts a %s transition without a classId',
    async status => {
      await professorClassroomService.setSessionState({ status });

      expect(fetchMock).toHaveBeenCalledWith(
        '/api/professor?action=session-set',
        expect.objectContaining({ body: JSON.stringify({ status }) }),
      );
    },
  );

  it('posts an explicit classId when starting a new session', async () => {
    await professorClassroomService.startSession('1bac');

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/professor?action=session-set',
      expect.objectContaining({ body: '{"status":"running","classId":"1bac"}' }),
    );
  });

  it('posts a classId only when the caller selects it explicitly', async () => {
    await professorClassroomService.setSessionState({ classId: '1bac', chapterId: 'fonctions' });

    const request = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(JSON.parse(String(request.body))).toEqual({ classId: '1bac', chapterId: 'fonctions' });
  });

  it('does not post a workspace classId while reading the active session', async () => {
    await professorClassroomService.getSessionState();

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/professor?action=session-get',
      expect.objectContaining({ body: '{}' }),
    );
  });

  it('loads the archive index', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ archives: [{ id: '1', classId: '1bac' }] }) });
    await expect(professorClassroomService.listArchivedSessions()).resolves.toEqual([{ id: '1', classId: '1bac' }]);
    expect(fetchMock).toHaveBeenCalledWith('/api/professor?action=session-archive-list', expect.objectContaining({ body: '{}' }));
  });

  it('loads one archived session by id', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ archive: { id: '123', status: 'stopped', classId: '1bac', presentNames: [] } }) });
    await expect(professorClassroomService.getArchivedSession('123')).resolves.toMatchObject({ id: '123', status: 'stopped' });
    expect(fetchMock).toHaveBeenCalledWith('/api/professor?action=session-archive-get', expect.objectContaining({ body: '{"id":"123"}' }));
  });
});
