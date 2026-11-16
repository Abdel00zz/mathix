export interface DashboardHeaderProps {
    user: { name: string; className?: string };
    stats: { totalQuizSubmitted?: number; totalTimeSpentSeconds?: number };
    chapterCount?: number;
    activeSectionId?: string;
    activeSectionTitle?: string;
    sectionColor?: string;
    /** Session professeur : bannière dédiée, sans « Conseils ». */
    isProfSession?: boolean;
    /** Message personnalisé de la bannière (page prof), sinon texte par défaut. */
    profMessage?: string;
    /** Libellé du niveau actif (choisi sur le PC), affiché dans l'en-tête. */
    levelLabel?: string;
    /** Nom complet du professeur (nom + prénom) si disponible. */
    profName?: string;
}
