/**
 * Vues internes d'une classe portées par `ProfSessionPanel`. La rotation et les
 * messages ont été fusionnés dans « Élèves » ; « Studio » et « Paramètres »
 * sont gérés par la coque (`ProfConsoleApp`).
 */
export type SessionSection = 'seance' | 'eleves';

export type ActionMessage = {
  tone: 'success' | 'error';
  text: string;
};

export type RosterSyncState = 'saved' | 'pending' | 'saving' | 'error' | 'conflict';
