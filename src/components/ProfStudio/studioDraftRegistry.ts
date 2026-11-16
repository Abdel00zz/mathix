type DraftCommit = () => boolean;

const pendingDrafts = new Map<symbol, DraftCommit>();

/** Enregistre un brouillon local afin que la publication puisse le valider avant de lire le JSON. */
export function registerStudioDraft(id: symbol, commit: DraftCommit): () => void {
  pendingDrafts.set(id, commit);
  return () => { pendingDrafts.delete(id); };
}

export function hasPendingStudioDrafts(): boolean {
  return pendingDrafts.size > 0;
}

/** Valide tous les champs encore ouverts. `false` signale au Studio un brouillon invalide. */
export function flushPendingStudioDrafts(): boolean {
  const commits = Array.from(pendingDrafts.values());
  return commits.every(commit => commit());
}
