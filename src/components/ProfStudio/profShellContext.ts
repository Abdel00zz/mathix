import { createContext, useContext } from 'react';

/**
 * Pont entre la coque professeur (`ProfConsoleApp`) et le panneau actif.
 *
 * La coque est persistante : rail, barre d'état, titre de fenêtre et raccourcis
 * clavier survivent aux changements de panneau. Elle a donc besoin de connaître
 * l'état du document en cours d'édition, et le Studio a besoin de lui confier sa
 * fonction de publication pour que Ctrl+S fonctionne depuis n'importe où.
 *
 * Le contexte vaut `null` hors coque (console admin, qui monte le Studio seul) :
 * les panneaux doivent rester utilisables sans elle.
 */

/** État du document ouvert, remonté par le Studio à la coque. */
export interface ProfDocumentState {
  /** Chemin `data/<classe>/…` du fichier ouvert, `null` si aucun. */
  path: string | null;
  /** Modifications non publiées. */
  dirty: boolean;
  /** Publication en cours. */
  saving: boolean;
  /** JSON invalide : la publication est bloquée. */
  invalid: boolean;
}

export interface ProfShellApi {
  /** Publie l'état du document (barre d'état + titre de fenêtre). `null` = aucun document. */
  reportDocument: (doc: ProfDocumentState | null) => void;
  /** Confie la fonction de publication à la coque (Ctrl+S). `null` au démontage. */
  registerSave: (save: (() => void) | null) => void;
}

export const ProfShellContext = createContext<ProfShellApi | null>(null);

/** `null` hors coque : le panneau tourne alors en autonomie. */
export const useProfShell = (): ProfShellApi | null => useContext(ProfShellContext);
