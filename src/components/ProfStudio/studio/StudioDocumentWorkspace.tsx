import React from 'react';
import JsonFieldEditor, { type JsonNode } from '../JsonFieldEditor';
import LoadingSpinner from '../../UI/LoadingSpinner';
import RevisionDocumentEditor from '../RevisionDocumentEditor';
import ExerciseDocumentEditor, { type ExerciseFile } from '../ExerciseDocumentEditor';
import QuizDocumentEditor, { type QuizFile } from '../QuizDocumentEditor';
import type { RevisionSheet } from '../../../types';
import type { JsonParseError, StudioMode } from './types';
import StudioHome from './StudioHome';

interface StudioDocumentWorkspaceProps {
  content: string;
  currentPath: string | null;
  editorRevision: number;
  isExercise: boolean;
  isQuiz: boolean;
  isRevision: boolean;
  jsonError: string | null;
  loading: boolean;
  mode: StudioMode;
  onBrowseCatalog: () => void;
  onContentChange: (content: string) => void;
  onCreateChapter: () => void;
  parseError: JsonParseError | null;
  parsedContent: JsonNode | null;
  selectedClassId: string;
}

export default function StudioDocumentWorkspace(props: StudioDocumentWorkspaceProps) {
  const { content, currentPath, editorRevision, isExercise, isQuiz, isRevision, jsonError, loading, mode, onBrowseCatalog, onContentChange, onCreateChapter, parseError, parsedContent, selectedClassId } = props;
  const changeStructured = (next: unknown) => onContentChange(JSON.stringify(next, null, 2));

  return (
    <main className="prof-studio-document flex min-w-0 flex-1 flex-col">
      {jsonError && <div className="shrink-0 border-b border-red-100 bg-red-50 px-4 py-2 text-xs font-medium text-red-700" role="alert">{jsonError}</div>}
      {parseError && <div className="shrink-0 border-b border-red-100 bg-red-50 px-4 py-2 text-xs font-medium text-red-700" role="alert">JSON invalide — ligne {parseError.line}, colonne {parseError.col} : {parseError.message}</div>}
      {loading ? (
        <LoadingSpinner variant="section" label="Chargement du fichier…" audience="professor" className="flex-1" />
      ) : currentPath ? (
        mode === 'render' && isRevision && parsedContent !== null ? <RevisionDocumentEditor key={`${currentPath}:${editorRevision}`} data={parsedContent as unknown as RevisionSheet} onChange={changeStructured} />
          : mode === 'render' && isExercise && parsedContent !== null ? <ExerciseDocumentEditor key={`${currentPath}:${editorRevision}`} data={parsedContent as unknown as ExerciseFile} onChange={changeStructured} />
            : mode === 'render' && isQuiz && parsedContent !== null ? <QuizDocumentEditor key={`${currentPath}:${editorRevision}`} data={parsedContent as unknown as QuizFile} onChange={changeStructured} />
              : mode === 'fields' && parsedContent !== null ? <JsonFieldEditor data={parsedContent} onChange={changeStructured} />
                : <div className="min-h-0 flex-1 overflow-y-auto px-5 py-8 sm:px-8 sm:py-10"><textarea value={content} onChange={event => onContentChange(event.target.value)} spellCheck={false} aria-label="Contenu JSON du document" aria-invalid={Boolean(parseError)} className={`mx-auto block min-h-full w-full max-w-4xl resize-none rounded-md border bg-white p-6 font-mono text-[13px] leading-7 shadow-[0_8px_30px_rgba(15,23,42,0.05)] outline-none transition focus:border-slate-300 focus:ring-4 focus:ring-slate-100 ${parseError ? 'border-rose-200 text-red-700' : 'border-slate-200 text-slate-800'}`} placeholder="{ … JSON … }" /></div>
      ) : <StudioHome canCreateChapter={Boolean(selectedClassId)} onBrowseCatalog={onBrowseCatalog} onCreateChapter={onCreateChapter} />}
    </main>
  );
}
