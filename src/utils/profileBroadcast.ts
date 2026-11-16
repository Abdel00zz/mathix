/**
 * ProfileBroadcast — High-performance reactive profile sync system.
 *
 * Uses CustomEvent for instant same-tab propagation and BroadcastChannel
 * for cross-tab synchronisation. Subscribers receive updates within the
 * same microtask, bypassing React's batched render cycle for zero-latency
 * UI feedback.
 */
import { UserProfile } from '../types';

export type ProfileSyncEvent =
  | { kind: 'patch'; updates: Partial<UserProfile> }
  | { kind: 'logout' }
  | { kind: 'login'; user: UserProfile };

type ProfileListener = (updates: Partial<UserProfile>) => void;
type AuthEventListener = (event: ProfileSyncEvent) => void;

class ProfileBroadcast {
  private localListeners = new Set<ProfileListener>();
  private crossTabListeners = new Set<ProfileListener>();
  private crossTabAuthListeners = new Set<AuthEventListener>();
  private channel: BroadcastChannel | null = null;

  constructor() {
    try {
      if (typeof BroadcastChannel !== 'undefined') {
        this.channel = new BroadcastChannel('mathplus-profile-sync');
        this.channel.onmessage = (event: MessageEvent) => {
          const payload = event.data as ProfileSyncEvent | Partial<UserProfile> | null;
          if (!payload || typeof payload !== 'object') return;
          if ('kind' in payload && (payload.kind === 'logout' || payload.kind === 'login' || payload.kind === 'patch')) {
            this.crossTabAuthListeners.forEach(fn => {
              try { fn(payload); } catch { /* isolate */ }
            });
            if (payload.kind === 'patch') {
              this.crossTabListeners.forEach(fn => { try { fn(payload.updates); } catch { /* isolate */ } });
              this.localListeners.forEach(fn => { try { fn(payload.updates); } catch { /* isolate */ } });
            }
            return;
          }
          // Legacy plain-object patch fallback
          const patch = payload as Partial<UserProfile>;
          this.crossTabListeners.forEach(fn => { try { fn(patch); } catch { /* isolate */ } });
          this.localListeners.forEach(fn => { try { fn(patch); } catch { /* isolate */ } });
        };
      }
    } catch {
      // BroadcastChannel unavailable (e.g. old browser / SSR)
    }
  }

  /** Subscribe to local profile changes (same-tab, zero-latency). */
  subscribe(listener: ProfileListener): () => void {
    this.localListeners.add(listener);
    return () => { this.localListeners.delete(listener); };
  }

  /** Subscribe to cross-tab profile changes only (other tabs via BroadcastChannel). */
  subscribeCrossTab(listener: ProfileListener): () => void {
    this.crossTabListeners.add(listener);
    return () => { this.crossTabListeners.delete(listener); };
  }

  /** Subscribe to cross-tab auth transitions (login / logout / patch). */
  subscribeCrossTabAuth(listener: AuthEventListener): () => void {
    this.crossTabAuthListeners.add(listener);
    return () => { this.crossTabAuthListeners.delete(listener); };
  }

  /** Emit a profile change to all local UI subscribers + broadcast to other tabs. */
  emit(updates: Partial<UserProfile>): void {
    // Notify local UI listeners synchronously (zero-latency)
    this.localListeners.forEach(fn => {
      try { fn(updates); } catch { /* isolate listener errors */ }
    });
    // Broadcast to other tabs (cross-tab listeners in other tabs fire on receipt)
    try { this.channel?.postMessage({ kind: 'patch', updates } satisfies ProfileSyncEvent); } catch { /* quota / closed */ }
  }

  emitAuth(event: Exclude<ProfileSyncEvent, { kind: 'patch' }>): void {
    try { this.channel?.postMessage(event satisfies ProfileSyncEvent); } catch { /* quota / closed */ }
  }

  dispose(): void {
    this.localListeners.clear();
    this.crossTabListeners.clear();
    this.crossTabAuthListeners.clear();
    try { this.channel?.close(); } catch { /* ignore */ }
    this.channel = null;
  }
}

export const profileBroadcast = new ProfileBroadcast();
