import type { UserProfile } from '../types';

const PROFILE_KEY = 'mathplus:prof-profile';
const LEGACY_TOKEN_KEY = 'mathplus:prof-session';

let verifiedProfessorProfile: { accountId?: string; name: string; classId: string } | null = null;
const listeners = new Set<() => void>();

function publishAccessChange(previousKey: string | null): void {
  const nextKey = verifiedProfessorProfile
    ? `${verifiedProfessorProfile.accountId || ''}:${verifiedProfessorProfile.classId}:${verifiedProfessorProfile.name}`
    : null;
  if (previousKey === nextKey) return;
  listeners.forEach(listener => listener());
}

function clearLocalMarkers(): void {
  try {
    localStorage.removeItem(LEGACY_TOKEN_KEY);
    localStorage.removeItem(PROFILE_KEY);
  } catch { /* stockage restreint */ }
}

export const professorSessionService = {
  /**
   * Cette méthode ne doit recevoir qu'une identité confirmée par `/me`,
   * `/activate` ou `/login`. Le profil local persistant n'est jamais une preuve.
   */
  acceptVerifiedUser(user: UserProfile | null): void {
    const previousKey = verifiedProfessorProfile
      ? `${verifiedProfessorProfile.accountId || ''}:${verifiedProfessorProfile.classId}:${verifiedProfessorProfile.name}`
      : null;
    verifiedProfessorProfile = user?.role === 'prof'
      ? { accountId: user.accountId, name: user.name, classId: user.classId }
      : null;
    clearLocalMarkers();
    publishAccessChange(previousKey);
  },

  isProfessor(): boolean {
    return verifiedProfessorProfile !== null;
  },

  /** Classe du professeur vérifié (null tant qu'aucune identité n'est confirmée). */
  getClassId(): string | null {
    return verifiedProfessorProfile?.classId || null;
  },

  getSnapshot(): boolean {
    return verifiedProfessorProfile !== null;
  },

  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },

  clear(notifyServer = true): void {
    const previousKey = verifiedProfessorProfile
      ? `${verifiedProfessorProfile.accountId || ''}:${verifiedProfessorProfile.classId}:${verifiedProfessorProfile.name}`
      : null;
    verifiedProfessorProfile = null;
    clearLocalMarkers();
    publishAccessChange(previousKey);
    if (!notifyServer) return;
    void fetch('/api/users?action=prof-logout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
    }).catch(() => undefined);
  },

  headers(): Record<string, string> {
    return { 'Content-Type': 'application/json' };
  },
};
