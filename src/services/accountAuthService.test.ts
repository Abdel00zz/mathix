import { afterEach, describe, expect, it, vi } from 'vitest';
import { authenticateAccount, parseAccountUser, accountErrorMessage } from './accountAuthService';

afterEach(() => vi.unstubAllGlobals());
describe('authentification et autorisations professeur', () => {
  const user = { name: 'Test', classId: '', role: 'prof', profClassScope: 'selected', profClasses: ['classe-a'], profPage: { bannerMessage: 'Bonjour' } };
  it('préserve le profil serveur complet, sans perdre les restrictions de classe', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ found: true, user }) });
    vi.stubGlobal('fetch', fetchMock);
    expect(await authenticateAccount('login', {})).toEqual(user);
    expect(fetchMock).toHaveBeenCalledWith('/api/users?action=login', expect.objectContaining({ credentials: 'same-origin', signal: expect.any(AbortSignal) }));
  });
  it('ne promeut pas une demande professeur', () => {
    expect(parseAccountUser({ name: 'Test', classId: 'pending:test', role: 'student', requestedRole: 'prof' }).role).toBe('student');
  });
  it.each([null, {}, { name: 'Test' }])('refuse les profils incomplets : %j', value => {
    expect(() => parseAccountUser(value)).toThrow('invalid_session_payload');
  });
  it('refuse une inscription sans session sécurisée', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ user, sessionReady: false }) }));
    await expect(authenticateAccount('register', {})).rejects.toThrow('account_session_unavailable');
  });
  it('traduit les codes d’erreur, sans afficher les messages serveur arbitraires', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 429, json: async () => ({ error: 'too_many_attempts' }) }));
    await expect(authenticateAccount('login', {})).rejects.toThrow('too_many_attempts');
    expect(accountErrorMessage('too_many_attempts', 'ar')).toContain('محاولات');
    expect(accountErrorMessage('unknown', 'fr')).toContain('réessayez');
  });
  it('refuse une réponse non JSON', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => { throw new Error('HTML'); } }));
    await expect(authenticateAccount('login', {})).rejects.toThrow('invalid_credentials');
  });
  it('traduit les codes de validation de formulaire et de conflit de compte', () => {
    expect(accountErrorMessage('first_name_invalid', 'fr')).toContain('prénom');
    expect(accountErrorMessage('last_name_invalid', 'ar')).toContain('الاسم العائلي');
    expect(accountErrorMessage('class_required', 'fr')).toContain('classe');
    expect(accountErrorMessage('account_exists', 'fr')).toContain('existe déjà');
    expect(accountErrorMessage('account_deleted', 'ar')).toContain('حذف');
  });
});
