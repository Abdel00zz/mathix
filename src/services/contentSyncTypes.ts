// Contrat d'échange des mises à jour de contenu (admin ↔ professeur).
//
// Miroir client des formes produites par `src/server/content/sync.ts`. La
// frontière est volontaire : rien sous `api/` n'importe hors de `src/server/`,
// donc les deux côtés déclarent le contrat plutôt que de le partager — même
// convention que `ClassChapter` / `ChapterManifest` dans `profContentService`.

export type ContentKind = 'quiz' | 'revision' | 'exercise' | 'class-manifest' | 'chapter-manifest' | 'other';

export const KIND_LABELS: Record<ContentKind, string> = {
  quiz: 'Quiz',
  revision: 'Révisions',
  exercise: 'Exercices',
  'class-manifest': 'Sommaire de la classe',
  'chapter-manifest': 'Sommaire du chapitre',
  other: 'Autres',
};

/** Ordre d'affichage des types dans l'arbre, du plus courant au plus rare. */
export const KIND_ORDER: ContentKind[] = ['quiz', 'revision', 'exercise', 'class-manifest', 'chapter-manifest', 'other'];

export interface CandidateEntry {
  path: string;
  kind: ContentKind;
  classId: string;
  chapterId: string;
  label: string;
  version: number;
  /** Le professeur a déjà un fichier à ce chemin : il sera remplacé. */
  conflict: boolean;
}

export interface CandidateChapter {
  chapterId: string;
  chapterTitle: string;
  entries: CandidateEntry[];
}

export interface CandidateClass {
  classId: string;
  classTitle: string;
  chapters: CandidateChapter[];
}

export interface CandidateTree {
  classes: CandidateClass[];
  total: number;
  conflicts: number;
}

export const EMPTY_TREE: CandidateTree = { classes: [], total: 0, conflicts: 0 };

export type ProposalStatus = 'pending' | 'applied' | 'partial' | 'declined';

export interface ProposalEntry {
  path: string;
  kind: ContentKind;
  classId: string;
  chapterId: string;
  label: string;
  conflict: boolean;
}

export interface Proposal {
  id: string;
  at: number;
  title: string;
  message: string;
  entries: ProposalEntry[];
  status: ProposalStatus;
  decidedAt?: number;
  applied?: string[];
  declined?: string[];
}

export const PROPOSAL_STATUS_LABELS: Record<ProposalStatus, string> = {
  pending: 'En attente',
  applied: 'Acceptée',
  partial: 'Partielle',
  declined: 'Refusée',
};

export interface ThreadMessage {
  id: string;
  at: number;
  from: 'admin' | 'prof';
  body: string;
  readAt?: number;
}

export interface SyncSummary {
  owner: string;
  pending: number;
  lastPushAt: number;
  /** Messages de l'admin que le professeur n'a pas encore lus. */
  profUnread: number;
  /** Réponses du professeur que l'admin n'a pas encore lues. */
  adminUnread: number;
  lastMessageAt: number;
}

/** Identité du professeur ciblé, telle que la renvoient les actions admin. */
export interface SyncProfIdentity {
  accountId: string;
  name: string;
  classId: string;
  profClassScope: 'all' | 'selected' | 'none';
  profClasses: string[];
  /** Date d'activation du badge : rien de plus récent ne lui parvient seul. */
  frozenAt: number;
}

/** État léger interrogé en boucle par le poste du professeur. */
export interface SyncStatus {
  pending: number;
  lastProposal: Proposal | null;
  unread: number;
  lastMessageAt: number;
  frozenAt: number;
}

export const EMPTY_STATUS: SyncStatus = {
  pending: 0, lastProposal: null, unread: 0, lastMessageAt: 0, frozenAt: 0,
};

export interface SyncInbox {
  proposals: Proposal[];
  messages: ThreadMessage[];
  tree: CandidateTree;
  frozenAt: number;
}

export interface ApplyOutcome {
  applied: string[];
  overwritten: string[];
  skipped: string[];
  version: number;
  proposal?: Proposal;
}

/** Sélection à plat d'un arbre, pour les compteurs des deux modales. */
export function treeEntries(tree: CandidateTree): CandidateEntry[] {
  return tree.classes.flatMap(entry => entry.chapters.flatMap(chapter => chapter.entries));
}

/** « 3 nouveautés, dont 1 qui remplace votre version ». */
export function describeSelection(entries: CandidateEntry[]): string {
  if (!entries.length) return 'Aucune ressource sélectionnée';
  const conflicts = entries.filter(entry => entry.conflict).length;
  const base = entries.length === 1 ? '1 ressource' : `${entries.length} ressources`;
  if (!conflicts) return base;
  return `${base}, dont ${conflicts === 1 ? '1 qui remplace' : `${conflicts} qui remplacent`} une version existante`;
}

/** Filtrage client conservant la hiérarchie classe → chapitre. */
export function filterCandidateTree(tree: CandidateTree, options: {
  query?: string;
  kind?: 'all' | ContentKind;
  conflictsOnly?: boolean;
  selectedOnly?: boolean;
  selected?: Set<string>;
}): CandidateTree {
  const query = (options.query || '').trim().toLocaleLowerCase('fr');
  const selected = options.selected || new Set<string>();
  const classes = tree.classes.flatMap(classEntry => {
    const classMatches = !query || `${classEntry.classTitle} ${classEntry.classId}`.toLocaleLowerCase('fr').includes(query);
    const chapters = classEntry.chapters.flatMap(chapter => {
      const chapterMatches = classMatches || `${chapter.chapterTitle} ${chapter.chapterId}`.toLocaleLowerCase('fr').includes(query);
      const entries = chapter.entries.filter(entry => {
        const matchesQuery = chapterMatches || `${entry.label} ${entry.path} ${KIND_LABELS[entry.kind]}`.toLocaleLowerCase('fr').includes(query);
        return matchesQuery
          && (!options.kind || options.kind === 'all' || entry.kind === options.kind)
          && (!options.conflictsOnly || entry.conflict)
          && (!options.selectedOnly || selected.has(entry.path));
      });
      return entries.length ? [{ ...chapter, entries }] : [];
    });
    return chapters.length ? [{ ...classEntry, chapters }] : [];
  });
  const entries = classes.flatMap(item => item.chapters.flatMap(chapter => chapter.entries));
  return { classes, total: entries.length, conflicts: entries.filter(entry => entry.conflict).length };
}
