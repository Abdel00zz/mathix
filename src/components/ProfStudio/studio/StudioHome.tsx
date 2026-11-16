import React from 'react';
import { FolderOpen, PenLine } from 'lucide-react';

interface StudioHomeProps {
  canCreateChapter: boolean;
  onBrowseCatalog: () => void;
  onCreateChapter: () => void;
}

/** Écran d'attente du studio : aucun document ouvert, deux façons d'en ouvrir un. */
export default function StudioHome({ canCreateChapter, onBrowseCatalog, onCreateChapter }: StudioHomeProps) {
  return (
    <div className="flex min-h-0 flex-1 items-center justify-center p-6">
      <div className="w-full max-w-md text-center">
        <span className="mx-auto grid h-11 w-11 place-items-center rounded-xl border border-slate-200 bg-white text-slate-400">
          <FolderOpen size={20} aria-hidden="true" />
        </span>
        <h1 className="mt-4 text-base font-bold tracking-tight text-slate-900">Aucun contenu ouvert</h1>
        <p className="mx-auto mt-1.5 max-w-sm text-xs leading-relaxed text-slate-500">
          Ouvrez le catalogue puis choisissez une révision, un quiz ou un exercice. Les modifications ne sont visibles
          par les élèves qu’après publication.
        </p>
        <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
          <button
            type="button"
            onClick={onBrowseCatalog}
            className="inline-flex h-10 items-center gap-2 rounded-lg bg-indigo-600 px-4 text-xs font-semibold text-white transition hover:bg-indigo-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
          >
            <FolderOpen size={15} aria-hidden="true" /> Parcourir le catalogue
          </button>
          {canCreateChapter && (
            <button
              type="button"
              onClick={onCreateChapter}
              className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 text-xs font-semibold text-slate-700 transition hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700"
            >
              <PenLine size={15} aria-hidden="true" /> Nouveau chapitre
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
