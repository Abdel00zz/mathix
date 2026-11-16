import { useEffect, useState } from 'react';

export interface StickyUnlock {
    quiz: boolean;
    exercises: boolean;
}

const readStickyUnlock = (key: string): StickyUnlock => {
    if (typeof window === 'undefined') return { quiz: false, exercises: false };
    try {
        const raw = localStorage.getItem(key);
        if (raw) {
            const parsed = JSON.parse(raw);
            return { quiz: !!parsed.quiz, exercises: !!parsed.exercises };
        }
    } catch { /* ignore */ }
    return { quiz: false, exercises: false };
};

/**
 * Déblocage définitif (« sticky ») des étapes Quiz et Exercices.
 *
 * Une fois une étape ouverte, elle le reste : si la progression régresse (quiz
 * refait, leçon ré-ouverte), l'élève n'est jamais re-verrouillé. On suit le
 * pattern React « mémoriser une info des rendus précédents » : l'état est ajusté
 * pendant le rendu (pas dans un effet) puis persisté séparément dans localStorage.
 */
export function useStickyUnlock(
    chapterId: string,
    liveQuizLocked: boolean,
    liveExercisesLocked: boolean
): StickyUnlock {
    const stickyKey = `mathplus:sticky-unlock:${chapterId}`;
    const [sticky, setSticky] = useState<StickyUnlock>(() => readStickyUnlock(stickyKey));

    let effectiveSticky = sticky;
    if ((!liveQuizLocked && !sticky.quiz) || (!liveExercisesLocked && !sticky.exercises)) {
        effectiveSticky = {
            quiz: sticky.quiz || !liveQuizLocked,
            exercises: sticky.exercises || !liveExercisesLocked,
        };
        setSticky(effectiveSticky);
    }

    useEffect(() => {
        try {
            localStorage.setItem(stickyKey, JSON.stringify(sticky));
        } catch { /* ignore */ }
    }, [stickyKey, sticky]);

    return effectiveSticky;
}
