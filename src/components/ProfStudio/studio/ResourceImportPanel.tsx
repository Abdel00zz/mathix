import React from 'react';
import { CheckCircle2, Loader2, Upload } from 'lucide-react';
import type { ImportEntry } from './types';

interface ResourceImportPanelProps {
  busy: boolean;
  done: boolean;
  entries: ImportEntry[];
  error: string | null;
  expandedError: number | null;
  message: string | null;
  onAnalyzePaste: () => void;
  onClose: () => void;
  onExpandedErrorChange: (index: number | null) => void;
  onFiles: (files: FileList | null) => void;
  onImport: () => void;
  onPasteModeChange: (pasteMode: boolean) => void;
  onPasteTextChange: (text: string) => void;
  pasteMode: boolean;
  pasteText: string;
  ready: boolean;
}

export default function ResourceImportPanel({ busy, done, entries, error, expandedError, message, onAnalyzePaste, onClose, onExpandedErrorChange, onFiles, onImport, onPasteModeChange, onPasteTextChange, pasteMode, pasteText, ready }: ResourceImportPanelProps) {
  const validCount = entries.filter(entry => entry.kind && !entry.error).length;
  return (
    <section className="border-t border-slate-100 pt-4">
      <div className="mb-2 flex items-center justify-between">
        <label className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">Import par lot (JSON)</label>
        <button type="button" onClick={() => onPasteModeChange(!pasteMode)} className="text-[11px] font-semibold text-indigo-600 transition hover:text-indigo-700">{pasteMode ? 'Choisir des fichiers' : 'Coller du JSON'}</button>
      </div>
      {pasteMode ? <>
        <textarea value={pasteText} onChange={event => onPasteTextChange(event.target.value)} placeholder="Collez un JSON ou un tableau de JSON : [{ ... }, { ... }]" rows={4} className="mb-2 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 font-mono text-xs text-slate-800 outline-none transition focus:border-indigo-400" aria-label="JSON à importer" />
        <button type="button" onClick={onAnalyzePaste} className="mb-2 h-9 w-full rounded-lg border border-slate-200 bg-white text-xs font-semibold text-slate-600 transition hover:bg-slate-50">Analyser le JSON</button>
      </> : <input type="file" multiple accept=".json,application/json" onChange={event => { onFiles(event.target.files); event.target.value = ''; }} className="mb-2 block w-full text-xs text-slate-500 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-xs file:font-semibold file:text-slate-700" aria-label="Choisir des fichiers JSON" />}

      {entries.length > 0 && <div className="mb-2 space-y-1.5">{entries.map((entry, index) => {
        const hasError = Boolean(entry.error);
        const expanded = expandedError === index;
        return <div key={`${entry.source}-${index}`} className={`rounded-lg border px-2.5 py-2 transition ${hasError ? 'border-rose-200 bg-rose-50/60' : 'border-emerald-200 bg-emerald-50/60'}`}>
          <div className="flex items-center gap-2"><span className={`grid h-4 w-4 shrink-0 place-items-center rounded-full text-[9px] font-bold text-white ${hasError ? 'bg-rose-500' : 'bg-emerald-500'}`} aria-hidden="true">{hasError ? '✕' : '✓'}</span><span className="min-w-0 flex-1 truncate text-[11px] font-semibold text-slate-700">{entry.source}</span>
            {hasError ? <button type="button" onClick={() => onExpandedErrorChange(expanded ? null : index)} className="shrink-0 rounded-md border border-rose-200 bg-white px-2 py-0.5 text-[10px] font-bold text-rose-600 transition hover:bg-rose-50" aria-expanded={expanded}>{expanded ? 'Fermer' : 'Erreur'}</button>
              : <span className="shrink-0 rounded-full bg-white/70 px-2 py-0.5 text-[10px] font-semibold text-slate-600">{entry.kind === 'exercise' ? 'Exercice' : entry.kind === 'quiz' ? 'Quiz' : 'Révision'}</span>}
          </div>
          {hasError && expanded && <p className="mt-1.5 border-t border-rose-100 pt-1.5 text-[11px] leading-snug text-rose-700">{entry.error}</p>}
        </div>;
      })}</div>}

      {done ? <div className="space-y-2">{message && <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-center text-xs font-semibold text-emerald-700">{message}</p>}<button type="button" onClick={onClose} className="flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 text-sm font-semibold text-white transition hover:bg-emerald-700"><CheckCircle2 size={15} /> Terminer</button></div>
        : <><button type="button" onClick={onImport} disabled={busy || validCount === 0 || !ready} className="flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-indigo-200 bg-indigo-50 text-sm font-semibold text-indigo-700 transition hover:bg-indigo-100 disabled:cursor-not-allowed disabled:opacity-40">{busy ? <Loader2 size={15} className="animate-spin" /> : <Upload size={15} />}Importer {validCount} ressource{validCount > 1 ? 's' : ''}</button>{error && <p role="alert" className="mt-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-center text-xs font-semibold text-red-700">{error}</p>}</>}
    </section>
  );
}
