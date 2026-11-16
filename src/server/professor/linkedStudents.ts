/**
 * Lecture groupée des comptes liés à un professeur.
 *
 * Avant : `SMEMBERS` puis un `GET` par élève, en série. Chaque `GET` est une
 * commande Redis facturée ; avec 30 élèves, un seul appel en coûtait 31 et le
 * tableau de classe l'appelle toutes les 20 secondes. `MGET` lit toutes les
 * clés en une seule commande, quel que soit leur nombre.
 */
import { redis } from './shared.js';

/** Un `MGET` porte des centaines de clés sans souci ; le lot évite l'excès. */
const MGET_CHUNK = 250;

export function parseStoredRecord(raw: unknown): Record<string, any> {
  if (!raw) return {};
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, any> : {};
  } catch {
    return {};
  }
}

/** Lit plusieurs clés en une commande par lot. L'ordre de sortie suit l'entrée. */
export async function readRecordsByKeys(keys: string[]): Promise<Array<Record<string, any>>> {
  const records: Array<Record<string, any>> = [];
  for (let start = 0; start < keys.length; start += MGET_CHUNK) {
    const chunk = keys.slice(start, start + MGET_CHUNK);
    const raws = await redis.mget<unknown[]>(...chunk);
    chunk.forEach((_, index) => records.push(parseStoredRecord(raws?.[index])));
  }
  return records;
}

/** Comptes `user:id:*` pour une liste d'identifiants. */
export function readAccountsByIds(accountIds: string[]): Promise<Array<Record<string, any>>> {
  return readRecordsByKeys(accountIds.map(id => `user:id:${id}`));
}

/**
 * Tous les comptes rattachés à ce professeur (index `users:prof:{id}`).
 * Les entrées orphelines renvoient un objet vide : à l'appelant de filtrer,
 * comme avant, avec `isLinkedStudentInClass`.
 */
export async function readLinkedAccounts(professorAccountId: string): Promise<Array<Record<string, any>>> {
  const members = (await redis.smembers(`users:prof:${professorAccountId}`)) as string[];
  if (!members.length) return [];
  return readAccountsByIds(members.map(String));
}
