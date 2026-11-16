/**
 * Politique d'accès aux niveaux d'un professeur (module interne serveur).
 *
 * Ce module reste volontairement pur : les routes chargent le compte depuis
 * Redis, puis utilisent toutes exactement la même normalisation. Cela évite
 * que la classe d'une séance, la classe principale du compte ou une valeur
 * envoyée par le client deviennent implicitement une permission.
 */

export type ProfessorClassScope = 'all' | 'selected' | 'none';

export interface ProfessorClassAccess {
  scope: ProfessorClassScope;
  classIds: string[];
  /** Vrai pour les comptes créés avant l'introduction de `profClassScope`. */
  legacy: boolean;
}

const CLASS_ID_PATTERN = /^[a-z0-9][a-z0-9_-]{0,99}$/i;

export function normalizeProfessorClassId(value: unknown): string {
  const classId = typeof value === 'string' ? value.trim() : '';
  return CLASS_ID_PATTERN.test(classId) ? classId : '';
}

export function normalizeProfessorClassIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value
    .map(normalizeProfessorClassId)
    .filter(Boolean)))
    .slice(0, 50);
}

/**
 * Sémantique canonique :
 * - `all`      : tous les niveaux du catalogue ;
 * - `selected` : uniquement `profClasses` ;
 * - `none`     : aucun niveau.
 *
 * Compatibilité : avant ce champ, une liste absente ou vide signifiait
 * historiquement « tous », tandis qu'une liste non vide était une sélection.
 */
export function resolveProfessorClassAccess(user: unknown): ProfessorClassAccess {
  const record = user && typeof user === 'object' ? user as Record<string, unknown> : {};
  const classIds = normalizeProfessorClassIds(record.profClasses);
  const rawScope = record.profClassScope;

  if (rawScope === 'all') return { scope: 'all', classIds: [], legacy: false };
  if (rawScope === 'none') return { scope: 'none', classIds: [], legacy: false };
  if (rawScope === 'selected') return { scope: 'selected', classIds, legacy: false };

  return classIds.length > 0
    ? { scope: 'selected', classIds, legacy: true }
    : { scope: 'all', classIds: [], legacy: true };
}

export function professorCanAccessAnyClass(access: ProfessorClassAccess): boolean {
  return access.scope === 'all' || (access.scope === 'selected' && access.classIds.length > 0);
}

export function professorCanAccessClass(access: ProfessorClassAccess, classId: unknown): boolean {
  const normalized = normalizeProfessorClassId(classId);
  if (!normalized || access.scope === 'none') return false;
  return access.scope === 'all' || access.classIds.includes(normalized);
}

export function dataPathBelongsToClass(path: string, classId: string): boolean {
  return path === `data/classes/${classId}.json` || path.startsWith(`data/${classId}/`);
}

export function professorCanAccessDataPath(access: ProfessorClassAccess, path: string): boolean {
  if (access.scope === 'none') return false;
  if (access.scope === 'all') return true;
  return access.classIds.some(classId => dataPathBelongsToClass(path, classId));
}

/** Vérifie le membership canonique élève -> professeur et son niveau. */
export function isLinkedStudentInClass(
  user: unknown,
  professorAccountId: string,
  classId?: string,
): user is Record<string, unknown> {
  if (!user || typeof user !== 'object') return false;
  const record = user as Record<string, unknown>;
  const role = record.role === undefined ? 'student' : record.role;
  if (role !== 'student' || String(record.profId || '') !== professorAccountId) return false;
  const studentClassId = normalizeProfessorClassId(record.classId);
  if (!studentClassId) return false;
  return !classId || studentClassId === classId;
}
