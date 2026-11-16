import type { Dispatch, SetStateAction } from 'react';
import type { ClassChapter, ClassEntry } from '../../../services/profContentService';
import type { Exercise } from '../../../types';
import type { PrintLayout } from '../../../services/printLayout';

export type ChapterEntry = ClassChapter;
export type SaveState = 'idle' | 'saving' | 'saved' | 'error';
export type StudioMode = 'json' | 'fields' | 'render';
export type ImportableKind = 'exercise' | 'quiz' | 'revision';

export type ImportEntry = {
  source: string;
  content: Record<string, unknown>;
  kind: ImportableKind | null;
  error?: string;
};

export type HistoryEntry = { at: number; content: unknown };
export type ManagedExercise = { id: string; path: string };
export type PrintJob = { exercises: Exercise[]; chapterTitle: string; classId: string; layout: PrintLayout };
export type JsonParseError = { message: string; line: number; col: number };

export type StateSetter<T> = Dispatch<SetStateAction<T>>;

export interface StudioHeaderProps {
  adminMode: boolean;
  adminClassId: string;
  classes: ClassEntry[];
  catalogCollapsed: boolean;
  currentPath: string | null;
  isDirty: boolean;
  isVisualSupported: boolean;
  mode: StudioMode;
  onAdminClassChange: (classId: string) => void;
  onHistory: () => void;
  onLogout?: () => void;
  onModeChange: (mode: StudioMode) => void;
  onRemove: () => void;
  onRevert: () => void;
  onSave: () => void;
  overrides: Record<string, number>;
  parseError: JsonParseError | null;
  saveState: SaveState;
  shellActive: boolean;
}
