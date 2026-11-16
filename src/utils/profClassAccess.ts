import type { ProfessorClassScope } from '../types';

export function resolveClientProfessorClassScope(
  scope: ProfessorClassScope | null | undefined,
  classIds: string[] | null | undefined,
): ProfessorClassScope {
  if (scope === 'all' || scope === 'selected' || scope === 'none') return scope;
  return classIds && classIds.length > 0 ? 'selected' : 'all';
}

/** Filtre le catalogue selon la même convention que les API, legacy inclus. */
export function filterProfessorClasses<T extends { id: string }>(
  classes: T[],
  scope: ProfessorClassScope | null | undefined,
  classIds: string[] | null | undefined,
): T[] {
  const resolved = resolveClientProfessorClassScope(scope, classIds);
  if (resolved === 'all') return classes;
  if (resolved === 'none') return [];
  const allowed = new Set(classIds || []);
  return classes.filter(entry => allowed.has(entry.id));
}

/** Retrouve la classe propriétaire d'un chemin de contenu connu. */
export function classIdFromDataPath(path: string): string | null {
  const classManifest = /^data\/classes\/([^/]+)\.json$/.exec(path);
  if (classManifest) return classManifest[1];
  const classResource = /^data\/([^/]+)\//.exec(path);
  return classResource && classResource[1] !== 'classes' ? classResource[1] : null;
}
