/**
 * Identifie la requête la plus récente sans dépendre du transport utilisé.
 * Une réponse asynchrone ne peut muter l'interface que si son identifiant est
 * encore courant au moment où elle se termine.
 */
export interface LatestRequestGate {
  begin: () => number;
  isCurrent: (requestId: number) => boolean;
}

export function createLatestRequestGate(): LatestRequestGate {
  let latestRequestId = 0;
  return {
    begin: () => ++latestRequestId,
    isCurrent: requestId => requestId === latestRequestId,
  };
}

export function confirmDocumentSwitch(
  dirty: boolean,
  targetPath: string,
  confirm: (message: string) => boolean,
): boolean {
  if (!dirty) return true;
  const targetName = targetPath.split('/').pop() || targetPath;
  return confirm(
    `Le document ouvert contient des modifications non publiées.\n\nOuvrir « ${targetName} » quand même ?`,
  );
}
