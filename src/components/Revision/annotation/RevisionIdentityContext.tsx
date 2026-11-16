import { createContext, useContext } from 'react';

/**
 * Fournit l'identité du chapitre courant aux composants profonds de la fiche
 * (sans prop-drilling), pour construire les clés d'annotation manuscrite
 * `boxnote:${chapterId}:${sectionId}:${blockIndex}`.
 */
export const RevisionChapterContext = createContext<string | null>(null);

export const useRevisionChapterId = () => useContext(RevisionChapterContext);
