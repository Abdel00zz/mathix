// Service central des opérations de contenu du studio professeur.
// Toute lecture/écriture du contenu passe ici : les composants ne font plus
// de `fetch` ad hoc, ce qui garde l'authentification et la logique d'override
// à un seul endroit.

import {
  EMPTY_STATUS,
  EMPTY_TREE,
  type ApplyOutcome,
  type CandidateTree,
  type SyncInbox,
  type SyncStatus,
  type ThreadMessage,
} from './contentSyncTypes';
import { recordContentOverride } from './contentOverrides';
import { DEFAULT_MAX_EDGE, STUDIO_MEDIA_MAX_BYTES, blobToDataUri, importImage } from '../utils/imagePipeline';

export type ContentManifest = Record<string, number>;
export interface MediaUploadResult {
  id: string;
  url: string;
  /** Dimensions du binaire publié (après redimensionnement). */
  width: number;
  height: number;
  /** Rapport l/h natif de l'image importée. */
  ratio: number;
  bytes: number;
}
export type ClassEntry = { id: string; title: string; path: string };
type ClassManifest = {
  id?: string;
  title?: string;
  chapters?: ClassChapter[];
};
export type ClassChapter = {
  id: string;
  title: string;
  pinned?: boolean;
  manifestPath?: string;
  revisions?: { path?: string }[];
  quizzes?: { id?: string; path?: string }[];
};
export type ChapterManifest = {
  id?: string;
  title?: string;
  exercises?: { id: string; path: string }[];
};

async function fetchJson(url: string): Promise<unknown> {
  const res = await fetch(url, {
    credentials: 'same-origin',
    cache: 'no-store',
    ...(url.startsWith('/api/content') ? { headers: contentHeaders(false) } : {}),
  });
  if (!res.ok) throw new Error('Ressource indisponible');
  return res.json();
}

type AdminContentSession = { token: symbol; secret: string };
let adminContentSession: AdminContentSession | null = null;

/**
 * Active explicitement la destination « contenu officiel » pour la durée de
 * vie de la console admin. Le simple fait qu'un secret existe dans le stockage
 * du navigateur ne suffit jamais à changer l'acteur d'une publication.
 */
export function activateAdminContentSession(secret: string): () => void {
  const token = Symbol('admin-content-session');
  adminContentSession = { token, secret: secret.trim() };
  return () => {
    if (adminContentSession?.token === token) adminContentSession = null;
  };
}

function contentHeaders(json = true): Record<string, string> {
  const common = json ? { 'Content-Type': 'application/json' } : {};
  return adminContentSession?.secret
    ? { ...common, 'x-content-actor': 'admin', 'x-admin-secret': adminContentSession.secret }
    : { ...common, 'x-content-actor': 'professor' };
}

/** Dossier média courant (classe/chapitre), posé par le studio à l'ouverture. */
function mediaFolder(): string {
  try { return sessionStorage.getItem('mathplus:media-folder') || ''; } catch { return ''; }
}

export const profContentService = {
  /** Manifest des overrides publiés (Redis). */
  async fetchOverrides(): Promise<ContentManifest> {
    const data = (await fetchJson('/api/content?action=manifest').catch(() => ({ files: {} }))) as { files?: ContentManifest };
    return data.files && typeof data.files === 'object' ? data.files : {};
  },

  /** Catalogue des niveaux (classes) depuis le manifest racine statique. */
  async fetchClasses(): Promise<ClassEntry[]> {
    const root = (await fetchJson('/data/manifest.json')) as { classes?: ClassEntry[] };
    return Array.isArray(root.classes) ? root.classes : [];
  },

  /** Chapitres d'un niveau (quiz + révisions + manifest de chapitre).
   *  Lecture « override-aware » : un prof voit ses propres ajouts de quiz/révision
   *  déjà publiés dans le manifest de sa classe, comme l'app côté élève. */
  async fetchClassChapters(cls: ClassEntry, overrides: ContentManifest): Promise<ClassChapter[]> {
    const data = (await this.fetchFile(cls.path, overrides)) as ClassManifest;
    const chapters = Array.isArray(data.chapters) ? data.chapters : [];
    // Chapitres épinglés (« Mise à niveau ») toujours en tête, insensibles au
    // réordonnancement des autres chapitres.
    const isAnchorChapter = (chapter: ClassChapter) => chapter.id === 'mise-a-niveau' || chapter.pinned === true;
    return [...chapters].sort((a, b) => Number(isAnchorChapter(b)) - Number(isAnchorChapter(a)));
  },

  /** Manifest d'un chapitre (liste des exercices), override-aware. */
  async fetchChapterManifest(manifestPath: string, overrides: ContentManifest): Promise<ChapterManifest> {
    return this.fetchFile(manifestPath, overrides) as Promise<ChapterManifest>;
  },

  /** Charge un fichier (override publié si présent, sinon statique). */
  async fetchFile(path: string, overrides: ContentManifest): Promise<unknown> {
    const url = overrides[path] !== undefined
      ? `/api/content?action=file&path=${encodeURIComponent(path)}`
      : `/${path}`;
    return fetchJson(url);
  },

  /** Publie un override. Retourne la version (updatedAt) renvoyée par le serveur. */
  async save(path: string, content: unknown): Promise<number> {
    const res = await fetch('/api/content?action=save', {
      method: 'POST',
      credentials: 'same-origin',
      headers: contentHeaders(),
      body: JSON.stringify({ path, content }),
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string; updatedAt?: number };
    if (!res.ok) throw new Error(data.error || 'Publication impossible');
    const updatedAt = data.updatedAt || Date.now();
    recordContentOverride(path, updatedAt);
    return updatedAt;
  },

  /** Supprime un override → retour au fichier statique d'origine. */
  async remove(path: string): Promise<void> {
    const res = await fetch('/api/content?action=delete', {
      method: 'POST',
      credentials: 'same-origin',
      headers: contentHeaders(),
      body: JSON.stringify({ path }),
    });
    if (!res.ok) throw new Error('Suppression impossible');
    recordContentOverride(path, null);
  },

  /** Historique des versions d'un fichier (les 20 dernières révisions). */
  async fetchHistory(path: string): Promise<Array<{ at: number; content: unknown }>> {
    const res = await fetch(`/api/content?action=history&path=${encodeURIComponent(path)}`, {
      method: 'GET',
      credentials: 'same-origin',
      cache: 'no-store',
      headers: contentHeaders(false),
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string; history?: Array<{ at: number; content: unknown }> };
    if (!res.ok) throw new Error(data.error || 'Historique indisponible');
    return data.history || [];
  },

  /** Exporte tout le contenu propre au compte (overrides) sous forme { path: contenu }. */
  async exportContent(): Promise<{ files: Record<string, unknown>; exportedAt: number }> {
    const res = await fetch('/api/content?action=export', {
      credentials: 'same-origin',
      cache: 'no-store',
      headers: contentHeaders(false),
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string; files?: Record<string, unknown>; exportedAt?: number };
    if (!res.ok) throw new Error(data.error || 'Export impossible');
    return { files: data.files || {}, exportedAt: data.exportedAt || Date.now() };
  },

  /** Réimporte un ensemble de fichiers (overrides). */
  async importContent(files: Record<string, unknown>): Promise<void> {
    const res = await fetch('/api/content?action=import', {
      method: 'POST',
      credentials: 'same-origin',
      headers: contentHeaders(),
      body: JSON.stringify({ files }),
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) throw new Error(data.error || 'Import impossible');
  },

  /** Supprime tous les overrides du compte → retour au contenu initial. */
  async resetContent(): Promise<void> {
    const res = await fetch('/api/content?action=reset', {
      method: 'POST',
      credentials: 'same-origin',
      headers: contentHeaders(),
      body: JSON.stringify({}),
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) throw new Error(data.error || 'Réinitialisation impossible');
  },

  /**
   * Importe une image depuis le PC dans le store média, rangée sous le dossier
   * classe/chapitre courant (sessionStorage).
   *
   * Le fichier passe d'abord par le pipeline d'image : signature vérifiée,
   * redimensionné (1600 px max) et ré-encodé jusqu'à tenir dans le budget du
   * serveur. Une photo de plusieurs Mo est donc compressée au lieu d'être
   * refusée, et les dimensions finales sont renvoyées pour réserver la place
   * de la figure avant son chargement.
   */
  async uploadMedia(file: File): Promise<MediaUploadResult> {
    const imported = await importImage(file, { maxEdge: DEFAULT_MAX_EDGE, maxBytes: STUDIO_MEDIA_MAX_BYTES });
    const dataUri = await blobToDataUri(imported.blob);
    const res = await fetch('/api/content?action=media-upload', {
      method: 'POST',
      credentials: 'same-origin',
      headers: contentHeaders(),
      body: JSON.stringify({ name: file.name, dataUri, folder: mediaFolder() }),
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string; id?: string; url?: string; width?: number | null; height?: number | null };
    if (!res.ok || !data.url) throw new Error(data.error || 'Import de l\'image impossible');
    return {
      id: data.id || '',
      url: data.url,
      width: data.width || imported.width,
      height: data.height || imported.height,
      ratio: imported.ratio,
      bytes: imported.bytes,
    };
  },
  // ── Mises à jour proposées par l'administration ────────────────────────────
  // Depuis l'activation du badge, le contenu officiel ne descend plus tout seul.
  // Ces méthodes sont le seul chemin par lequel il entre chez le professeur.

  /** État léger pour la boucle de veille : pastilles seulement. */
  async fetchSyncStatus(): Promise<SyncStatus> {
    const res = await fetch('/api/content?action=sync-status', {
      credentials: 'same-origin',
      cache: 'no-store',
      headers: contentHeaders(false),
    });
    if (!res.ok) throw new Error('Veille des mises à jour indisponible');
    const data = (await res.json().catch(() => ({}))) as Partial<SyncStatus>;
    return { ...EMPTY_STATUS, ...data };
  },

  /** Tout ce qu'affiche le centre de mise à jour : propositions, fil, arbre. */
  async fetchSyncInbox(): Promise<SyncInbox> {
    const res = await fetch('/api/content?action=sync-inbox', {
      credentials: 'same-origin',
      cache: 'no-store',
      headers: contentHeaders(false),
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string } & Partial<SyncInbox>;
    if (!res.ok) throw new Error(data.error || 'Mises à jour indisponibles');
    return {
      proposals: data.proposals || [],
      messages: data.messages || [],
      tree: data.tree || EMPTY_TREE,
      frozenAt: data.frozenAt || 0,
    };
  },

  /** Ce que l'officiel a publié depuis le gel, à l'initiative du professeur. */
  async fetchAvailableUpdates(): Promise<CandidateTree> {
    const res = await fetch('/api/content?action=sync-available', {
      credentials: 'same-origin',
      cache: 'no-store',
      headers: contentHeaders(false),
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string; tree?: CandidateTree };
    if (!res.ok) throw new Error(data.error || 'Mises à jour indisponibles');
    return data.tree || EMPTY_TREE;
  },

  /** Copie les chemins choisis dans l'espace du professeur (remplacements inclus). */
  async applyUpdates(paths: string[], proposalId?: string): Promise<ApplyOutcome> {
    const res = await fetch('/api/content?action=sync-apply', {
      method: 'POST',
      credentials: 'same-origin',
      headers: contentHeaders(),
      body: JSON.stringify({ paths, ...(proposalId ? { proposalId } : {}) }),
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string } & Partial<ApplyOutcome>;
    if (!res.ok) throw new Error(data.error || 'Mise à jour impossible');
    return {
      applied: data.applied || [],
      overwritten: data.overwritten || [],
      skipped: data.skipped || [],
      version: data.version || 0,
      proposal: data.proposal,
    };
  },

  /** Refuse une proposition, en totalité ou pour les chemins indiqués. */
  async declineProposal(proposalId: string, paths?: string[]): Promise<void> {
    const res = await fetch('/api/content?action=sync-decline', {
      method: 'POST',
      credentials: 'same-origin',
      headers: contentHeaders(),
      body: JSON.stringify({ proposalId, ...(paths?.length ? { paths } : {}) }),
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) throw new Error(data.error || 'Refus impossible');
  },

  /** Réponse du professeur dans le fil unique partagé avec l'administration. */
  async sendProfMessage(body: string): Promise<ThreadMessage> {
    const res = await fetch('/api/content?action=prof-message', {
      method: 'POST',
      credentials: 'same-origin',
      headers: contentHeaders(),
      body: JSON.stringify({ body }),
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string; message?: ThreadMessage };
    if (!res.ok || !data.message) throw new Error(data.error || 'Envoi impossible');
    return data.message;
  },

  /** Accusé de lecture : éteint la pastille du professeur. */
  async markThreadRead(): Promise<void> {
    await fetch('/api/content?action=message-read', {
      method: 'POST',
      credentials: 'same-origin',
      headers: contentHeaders(),
      body: JSON.stringify({}),
    }).catch(() => undefined);
  },
};
