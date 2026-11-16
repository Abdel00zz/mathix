import { useEffect, useRef, useState, useCallback } from 'react';
import { logger } from '../services/logService';

// ═══════════════════════════════════════════════════════════════════════════════
// TIME TRACKING HOOK - Robuste et performant
// ═══════════════════════════════════════════════════════════════════════════════
// Mécanisme de suivi du temps passé sur la plateforme:
// - Ne compte que le temps en mode écran et onglet actifs
// - Gère la visibilité de la page (Page Visibility API)
// - Détecte les suspensions système (verrouillage écran, mise en veille)
// - Sauvegarde périodique dans localStorage
// - Récupération après crash/fermeture
// ═══════════════════════════════════════════════════════════════════════════════

const STORAGE_KEY = 'mathplus_total_time_spent';
const LAST_SESSION_KEY = 'mathplus_last_session_timestamp';
const SAVE_INTERVAL = 10000; // Sauvegarde toutes les 10 secondes
const TICK_INTERVAL = 1000; // Mise à jour chaque seconde
const SESSION_TIMEOUT = 30 * 60 * 1000; // 30 minutes d'inactivité = nouvelle session

interface TimeTrackingState {
    totalSeconds: number;
    currentSessionSeconds: number;
    isActive: boolean;
}

/**
 * Hook de suivi du temps passé sur la plateforme
 * @param userId - ID de l'utilisateur pour un suivi personnalisé
 * @returns Object contenant le temps total en secondes et l'état actif
 */
export const useTimeTracking = (userId: string): TimeTrackingState => {
    // État du temps total accumulé (en secondes)
    const [totalSeconds, setTotalSeconds] = useState<number>(() => {
        try {
            const stored = localStorage.getItem(`${STORAGE_KEY}_${userId}`);
            return stored ? parseInt(stored, 10) : 0;
        } catch {
            logger.warn('Failed to load time tracking data', { context: 'useTimeTracking' });
            return 0;
        }
    });

    // État de la session courante
    const [currentSessionSeconds, setCurrentSessionSeconds] = useState<number>(0);
    const [isActive, setIsActive] = useState<boolean>(!document.hidden);

    // Refs pour la gestion du timing
    const tickIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const saveIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const sessionStartRef = useRef<number>(0);
    const lastTickRef = useRef<number>(0);
    const accumulatedSecondsRef = useRef<number>(0);

    // Initialize refs that need Date.now()
    useEffect(() => {
        if (sessionStartRef.current === 0) {
            sessionStartRef.current = Date.now();
            lastTickRef.current = Date.now();
        }
    }, []);

    // Fonction de sauvegarde dans localStorage
    const saveToStorage = useCallback((seconds: number) => {
        try {
            localStorage.setItem(`${STORAGE_KEY}_${userId}`, seconds.toString());
            localStorage.setItem(`${LAST_SESSION_KEY}_${userId}`, Date.now().toString());
        } catch (error) {
            logger.error('Failed to save time tracking data', error as Error, { context: 'useTimeTracking' });
        }
    }, [userId]);

    // Fonction de nettoyage des sessions expirées
    const checkSessionValidity = useCallback(() => {
        try {
            const lastSession = localStorage.getItem(`${LAST_SESSION_KEY}_${userId}`);
            if (lastSession) {
                const lastSessionTime = parseInt(lastSession, 10);
                const now = Date.now();
                const timeSinceLastSession = now - lastSessionTime;

                // Si la dernière session date de plus de SESSION_TIMEOUT, on considère que c'est une nouvelle session
                if (timeSinceLastSession > SESSION_TIMEOUT) {
                    logger.info(`New session started after ${Math.round(timeSinceLastSession / 1000)}s timeout`, { context: 'useTimeTracking' });
                    setCurrentSessionSeconds(0);
                    accumulatedSecondsRef.current = 0;
                }
            }
        } catch {
            logger.warn('Failed to check session validity', { context: 'useTimeTracking' });
        }
    }, [userId]);

    // Démarrer le compteur
    const startTracking = useCallback(() => {
        setIsActive(true);
        lastTickRef.current = Date.now();
        sessionStartRef.current = Date.now();

        // Tick interval pour incrémenter le compteur
        if (!tickIntervalRef.current) {
            tickIntervalRef.current = setInterval(() => {
                const now = Date.now();
                const elapsed = now - lastTickRef.current;

                // Vérifier que le temps écoulé est raisonnable (pas de saut temporel suspect)
                if (elapsed >= 900 && elapsed <= 2000) {
                    const secondsToAdd = Math.floor(elapsed / 1000);

                    accumulatedSecondsRef.current += secondsToAdd;
                    setCurrentSessionSeconds(prev => prev + secondsToAdd);
                    setTotalSeconds(prev => prev + secondsToAdd);
                } else if (elapsed > 2000) {
                    // Suspension détectée (verrouillage écran, mise en veille, etc.)
                    logger.info(`Suspension detected (${Math.round(elapsed / 1000)}s), skipping time increment`, { context: 'useTimeTracking' });
                }

                lastTickRef.current = now;
            }, TICK_INTERVAL);
        }

        // Save interval pour persister les données
        if (!saveIntervalRef.current) {
            saveIntervalRef.current = setInterval(() => {
                if (accumulatedSecondsRef.current > 0) {
                    const stored = localStorage.getItem(`${STORAGE_KEY}_${userId}`);
                    const currentStored = stored ? parseInt(stored, 10) : 0;
                    const newTotal = currentStored + accumulatedSecondsRef.current;

                    saveToStorage(newTotal);
                    accumulatedSecondsRef.current = 0;
                }
            }, SAVE_INTERVAL);
        }
    }, [userId, saveToStorage]);

    // Arrêter le compteur
    const stopTracking = useCallback(() => {
        setIsActive(false);

        // Nettoyer les intervals
        if (tickIntervalRef.current) {
            clearInterval(tickIntervalRef.current);
            tickIntervalRef.current = null;
        }

        if (saveIntervalRef.current) {
            clearInterval(saveIntervalRef.current);
            saveIntervalRef.current = null;
        }

        // Sauvegarder immédiatement avant d'arrêter
        if (accumulatedSecondsRef.current > 0) {
            const stored = localStorage.getItem(`${STORAGE_KEY}_${userId}`);
            const currentStored = stored ? parseInt(stored, 10) : 0;
            const newTotal = currentStored + accumulatedSecondsRef.current;

            saveToStorage(newTotal);
            accumulatedSecondsRef.current = 0;
        }
    }, [userId, saveToStorage]);

    // Gérer les changements de visibilité (Page Visibility API)
    useEffect(() => {
        const handleVisibilityChange = () => {
            if (document.hidden) {
                // Onglet caché -> arrêter le compteur
                stopTracking();
            } else {
                // Onglet visible -> reprendre le compteur
                checkSessionValidity();
                startTracking();
            }
        };

        // Écouter les événements de visibilité
        document.addEventListener('visibilitychange', handleVisibilityChange);

        // Démarrer immédiatement si visible
        if (!document.hidden) {
            setTimeout(() => {
                checkSessionValidity();
                startTracking();
            }, 0);
        }

        // Cleanup
        return () => {
            document.removeEventListener('visibilitychange', handleVisibilityChange);
            stopTracking();
        };
    }, [startTracking, stopTracking, checkSessionValidity]);

    // Gérer les événements de focus/blur de la fenêtre (sécurité supplémentaire)
    useEffect(() => {
        const handleFocus = () => {
            if (!document.hidden) {
                checkSessionValidity();
                startTracking();
            }
        };

        const handleBlur = () => {
            stopTracking();
        };

        window.addEventListener('focus', handleFocus);
        window.addEventListener('blur', handleBlur);

        return () => {
            window.removeEventListener('focus', handleFocus);
            window.removeEventListener('blur', handleBlur);
        };
    }, [startTracking, stopTracking, checkSessionValidity]);

    // Sauvegarder avant fermeture (beforeunload)
    useEffect(() => {
        const handleBeforeUnload = () => {
            if (accumulatedSecondsRef.current > 0) {
                const stored = localStorage.getItem(`${STORAGE_KEY}_${userId}`);
                const currentStored = stored ? parseInt(stored, 10) : 0;
                const newTotal = currentStored + accumulatedSecondsRef.current;

                saveToStorage(newTotal);
            }
        };

        window.addEventListener('beforeunload', handleBeforeUnload);

        return () => {
            window.removeEventListener('beforeunload', handleBeforeUnload);
        };
    }, [userId, saveToStorage]);

    return {
        totalSeconds,
        currentSessionSeconds,
        isActive
    };
};
