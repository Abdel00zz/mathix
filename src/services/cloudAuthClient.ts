/**
 * Passerelle client React <-> /api/auth + /api/sync + liens bidirectionnels vers Apprendre.html.
 */
import type { CloudAppEnvelope } from '../server/cloud/appStateMerge';

export interface CloudProviderInfo {
  googleEnabled: boolean;
  googleClientId: string;
  firebaseEnabled: boolean;
  firestoreEnabled: boolean;
  redisEnabled: boolean;
  firebaseWebConfig: {
    apiKey: string;
    authDomain: string;
    projectId: string;
  } | null;
}

export interface CloudSessionStatus {
  authenticated: boolean;
  user: Record<string, any> | null;
  storage?: CloudProviderInfo;
  cloudState?: CloudAppEnvelope | null;
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...(init?.headers || {}) },
    ...init,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const code = typeof data?.error === 'string' ? data.error : `http_${res.status}`;
    throw new Error(code);
  }
  return data as T;
}

export function getCloudProviders(): Promise<CloudProviderInfo> {
  return fetchJson<CloudProviderInfo>('/api/auth?action=providers', { method: 'GET' });
}

export function fetchCloudSession(): Promise<CloudSessionStatus> {
  return fetchJson<CloudSessionStatus>('/api/auth?action=me', { method: 'GET' });
}

export function signInWithGoogleToken(
  idToken: string,
  overrides: { classId?: string; className?: string; firstName?: string; lastName?: string; schoolName?: string } = {},
): Promise<CloudSessionStatus> {
  return fetchJson<CloudSessionStatus>('/api/auth?action=google', {
    method: 'POST',
    body: JSON.stringify({ idToken, ...overrides }),
  });
}

export function updateCloudProfile(patch: {
  firstName?: string;
  lastName?: string;
  classId?: string;
  className?: string;
  schoolName?: string;
  dashboardTheme?: string;
}): Promise<{ ok: boolean; user: Record<string, any> }> {
  return fetchJson('/api/auth?action=link-profile', {
    method: 'POST',
    body: JSON.stringify(patch),
  });
}

export function logoutCloudSession(): Promise<{ ok: boolean }> {
  return fetchJson('/api/auth?action=logout', { method: 'POST', body: '{}' });
}

export function pullApprendreState(): Promise<{ ok: boolean; envelope: CloudAppEnvelope | null; source: string }> {
  return fetchJson('/api/sync', { method: 'GET' });
}

export function pushApprendreState(
  envelope: Partial<CloudAppEnvelope>,
): Promise<{ ok: boolean; envelope: CloudAppEnvelope; source: string }> {
  return fetchJson('/api/sync', {
    method: 'POST',
    body: JSON.stringify({ envelope }),
  });
}

export function getApprendreUrl(chapterId?: string | null): string {
  const base = '/apprendre/Apprendre.html';
  return chapterId ? `${base}#ch-${encodeURIComponent(chapterId)}` : base;
}

export function getMainAppUrl(): string {
  return '/';
}
