import { useEffect, useState } from 'react';
import type { RootManifest } from '../../../types';
import { contentService } from '../../../services/contentService';

const hasClasses = (manifest: RootManifest | null | undefined): manifest is RootManifest => (
  Boolean(manifest && Array.isArray(manifest.classes) && manifest.classes.length > 0)
);

/** Le catalogue est une dépendance de l'inscription élève, jamais de la connexion. */
export function useRegistrationCatalog(provided: RootManifest | null, enabled: boolean) {
  const [local, setLocal] = useState<RootManifest | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  const usableProvided = hasClasses(provided) ? provided : null;
  const usableLocal = hasClasses(local) ? local : null;
  const manifest = usableProvided || usableLocal;

  useEffect(() => {
    if (usableProvided || usableLocal || !enabled) return;
    let active = true;
    const timeout = window.setTimeout(() => { if (active) setFailed(true); }, 12_000);
    void contentService.fetchRootManifest().then(data => {
      if (!active) return;
      if (hasClasses(data)) {
        setLocal(data);
        setFailed(false);
      } else {
        setFailed(true);
      }
    }).catch(() => {
      if (active) setFailed(true);
    }).finally(() => window.clearTimeout(timeout));
    return () => { active = false; window.clearTimeout(timeout); };
  }, [usableProvided, usableLocal, enabled, attempt]);

  useEffect(() => {
    if (!enabled || !failed) return;
    const handleOnline = () => {
      setFailed(false);
      setAttempt(value => value + 1);
    };
    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, [enabled, failed]);

  return {
    manifest,
    failed: !manifest && failed,
    retry: () => { setFailed(false); setAttempt(value => value + 1); },
  };
}
