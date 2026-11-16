import { useCallback, useSyncExternalStore } from 'react';
import { professorSessionReadStore } from '../services/professorSessionReadStore';

export function useSharedProfessorSession(enabled: boolean, full = false, pilot = false) {
  const subscribe = useCallback((listener: () => void) => enabled
    ? professorSessionReadStore.subscribe(listener, full, pilot)
    : () => {}, [enabled, full, pilot]);
  return useSyncExternalStore(subscribe, professorSessionReadStore.getSnapshot, professorSessionReadStore.getSnapshot);
}
