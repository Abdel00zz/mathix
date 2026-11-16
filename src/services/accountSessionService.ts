import type { UserProfile } from '../types';

export type AccountSessionProbeResult =
  | { status: 'authenticated'; user: UserProfile }
  | { status: 'unauthenticated' }
  | { status: 'offline' };

type AccountPayload = { user?: UserProfile; error?: string };
const PENDING_LOGOUT_KEY = 'mathplus:pending-account-logout';
let logoutInFlight: Promise<void> | null = null;

function readStorage(key: string): string | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage.getItem(key) : null;
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: string | null): void {
  try {
    if (typeof localStorage === 'undefined') return;
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch { /* stockage restreint */ }
}

class AccountSessionError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
    this.name = 'AccountSessionError';
  }
}

function normalizeUser(payload: AccountPayload): UserProfile {
  const user = payload?.user;
  if (!user || typeof user.name !== 'string' || typeof user.classId !== 'string') {
    throw new AccountSessionError('Réponse de session invalide', 502, 'invalid_session_payload');
  }

  return {
    ...user,
    role: user.role === 'prof' ? 'prof' : 'student',
  };
}

async function readPayload(response: Response): Promise<AccountPayload> {
  return response.json().catch(() => ({} as AccountPayload));
}

function combineSignals(timeoutMs: number, externalSignal?: AbortSignal): AbortSignal {
  const timeoutSignal = AbortSignal.timeout(timeoutMs);
  if (!externalSignal) return timeoutSignal;
  if (typeof AbortSignal !== 'undefined' && 'any' in AbortSignal && typeof AbortSignal.any === 'function') {
    return AbortSignal.any([timeoutSignal, externalSignal]);
  }
  const controller = new AbortController();
  const abort = () => controller.abort();
  timeoutSignal.addEventListener('abort', abort, { once: true });
  externalSignal.addEventListener('abort', abort, { once: true });
  if (timeoutSignal.aborted || externalSignal.aborted) controller.abort();
  return controller.signal;
}

async function fetchCurrentUser(timeoutMs = 15_000, signal?: AbortSignal): Promise<UserProfile | null> {
  const response = await fetch('/api/users?action=me', {
    method: 'GET',
    credentials: 'same-origin',
    cache: 'no-store',
    signal: combineSignals(timeoutMs, signal),
    headers: { Accept: 'application/json' },
  });

  if (response.status === 401) return null;
  const payload = await readPayload(response);
  if (!response.ok) {
    throw new AccountSessionError(
      'Vérification du compte indisponible',
      response.status,
      payload.error,
    );
  }
  return normalizeUser(payload);
}

async function clearRemoteSession(): Promise<void> {
  const response = await fetch('/api/users?action=logout', {
    method: 'POST',
    credentials: 'same-origin',
    keepalive: true,
    signal: AbortSignal.timeout(5_000),
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
  });
  if (!response.ok && response.status !== 401) {
    const payload = await readPayload(response);
    throw new AccountSessionError(
      'Déconnexion distante indisponible',
      response.status,
      payload.error,
    );
  }
}

function finishPendingLogout(): Promise<void> {
  if (!logoutInFlight) {
    logoutInFlight = clearRemoteSession()
      .then(() => {
        writeStorage(PENDING_LOGOUT_KEY, null);
      })
      .finally(() => {
        logoutInFlight = null;
      });
  }
  return logoutInFlight;
}

export const accountSessionService = {
  hasPendingLogout(): boolean {
    return Boolean(readStorage(PENDING_LOGOUT_KEY));
  },

  clearPendingLogout(): void {
    writeStorage(PENDING_LOGOUT_KEY, null);
  },

  async flushPendingLogout(): Promise<void> {
    if (!readStorage(PENDING_LOGOUT_KEY)) return;
    await finishPendingLogout();
  },

  async getCurrentUserStatus(options?: { timeoutMs?: number; signal?: AbortSignal }): Promise<AccountSessionProbeResult> {
    if (readStorage(PENDING_LOGOUT_KEY)) {
      await finishPendingLogout().catch(() => undefined);
      return { status: 'unauthenticated' };
    }
    try {
      const user = await fetchCurrentUser(options?.timeoutMs, options?.signal);
      return user ? { status: 'authenticated', user } : { status: 'unauthenticated' };
    } catch {
      return { status: 'offline' };
    }
  },

  /** Retourne l'identité prouvée par le cookie HttpOnly de cet appareil. */
  async getCurrentUser(options?: { timeoutMs?: number; signal?: AbortSignal }): Promise<UserProfile | null> {
    // Si un précédent logout a été interrompu, terminer d'abord l'effacement
    // du cookie. Un rechargement ne doit jamais reconnecter l'ancien compte.
    if (readStorage(PENDING_LOGOUT_KEY)) {
      await finishPendingLogout();
      return null;
    }
    return fetchCurrentUser(options?.timeoutMs, options?.signal);
  },

  async logout(): Promise<void> {
    writeStorage(PENDING_LOGOUT_KEY, String(Date.now()));
    await finishPendingLogout();
  },
};
