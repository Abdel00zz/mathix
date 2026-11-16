export interface CardTheme {
    accent: string;
    accentSoft: string;
}

// Palette unifiée : le parcours reprend l'accent mauve du dashboard.
const CHAPTER_CARD_THEMES: CardTheme[] = [
    { accent: 'var(--dashboard-mauve, #b5369b)', accentSoft: 'var(--dashboard-mauve-soft, rgba(181, 54, 155, 0.1))' },
];

// Thème noir « Vercel moderne » réservé aux chapitres épinglés (Mise à niveau).
const PINNED_THEME: CardTheme = {
    accent: '#000000',
    accentSoft: 'rgba(0, 0, 0, 0.06)',
};

/** Chapitre épinglé (ex. « Mise à niveau ») : noir, sans exception. */
export const isPinnedChapter = (chapter?: { id?: string; pinned?: boolean } | null): boolean =>
  !!chapter && (chapter.pinned === true || chapter.id === 'mise-a-niveau');

/**
 * Numérotation pédagogique des chapitres. Les entrées autonomes épinglées
 * (« Mise à niveau ») restent dans la liste, mais ne consomment aucun numéro.
 */
export const getChapterNumberMap = (
    chapters: Array<{ id: string; pinned?: boolean }>
): Map<string, number> => {
    const numbers = new Map<string, number>();
    let nextNumber = 0;

    for (const chapter of chapters) {
        if (isPinnedChapter(chapter)) continue;
        nextNumber += 1;
        numbers.set(chapter.id, nextNumber);
    }

    return numbers;
};

/**
 * Résout le thème d'une carte. Les chapitres épinglés (« Mise à niveau »)
 * reçoivent le thème noir ; les autres reprennent le mauve unifié.
 */
export const getChapterCardTheme = (
    chapterOrIndex?: unknown,
    _indexFallback?: number
): CardTheme => {
    const chapter = chapterOrIndex as { id?: string; pinned?: boolean } | undefined;
    if (isPinnedChapter(chapter)) {
        return PINNED_THEME;
    }
    return CHAPTER_CARD_THEMES[0];
};
