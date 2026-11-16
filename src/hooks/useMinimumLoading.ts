import { useEffect, useRef, useState } from 'react';
import { LOADING_DURATION_MS } from '../components/UI/loadingConfig';

/**
 * Maintient brièvement la page de chargement une fois engagée afin d'éviter tout
 * clignotement visuel, sans appel impur au rendu ni `setState` synchrone en effet.
 */
export const useMinimumLoading = (
  isLoading: boolean,
  minimumDurationMs: number = LOADING_DURATION_MS,
) => {
  const [holding, setHolding] = useState(false);
  const startedAtRef = useRef<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    if (isLoading) {
      if (startedAtRef.current === null) {
        startedAtRef.current = Date.now();
      }
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        setHolding(true);
      }, 0);
      return;
    }

    const startedAt = startedAtRef.current;
    if (!startedAt) {
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        setHolding(false);
      }, 0);
      return;
    }

    const elapsed = Date.now() - startedAt;
    const remaining = Math.max(0, minimumDurationMs - elapsed);
    timerRef.current = setTimeout(() => {
      startedAtRef.current = null;
      timerRef.current = null;
      setHolding(false);
    }, remaining);

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [isLoading, minimumDurationMs]);

  return isLoading || holding;
};
