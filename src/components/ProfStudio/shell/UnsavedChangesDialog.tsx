import { AlertTriangle } from 'lucide-react';

export interface PendingProfAction {
  label: string;
  run: () => void;
}

interface UnsavedChangesDialogProps {
  action: PendingProfAction | null;
  documentName: string | null;
  onCancel: () => void;
  onPublish: () => void;
  onConfirm: () => void;
}

export function UnsavedChangesDialog({
  action,
  documentName,
  onCancel,
  onPublish,
  onConfirm,
}: UnsavedChangesDialogProps) {
  if (!action) return null;

  return (
    <div className="fixed inset-0 z-[130] grid place-items-center bg-slate-950/45 px-4" role="presentation" onMouseDown={onCancel}>
      <div
        className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-[0_30px_80px_-24px_rgba(15,23,42,0.5)]"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="prof-exit-title"
        aria-describedby="prof-exit-description"
        onMouseDown={event => event.stopPropagation()}
      >
        <div className="mb-3 flex items-center gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-amber-100 text-amber-700">
            <AlertTriangle size={19} aria-hidden="true" />
          </span>
          <h2 id="prof-exit-title" className="text-base font-bold text-slate-950">Modifications non publiées</h2>
        </div>
        <p id="prof-exit-description" className="text-sm leading-6 text-slate-600">
          {documentName ? <><span className="font-mono text-xs text-slate-700">{documentName}</span> contient des modifications non publiées. </> : 'Un document contient des modifications non publiées. '}
          L’action « {action.label} » les perdrait.
        </p>
        <div className="mt-6 flex flex-wrap justify-end gap-2">
          <button type="button" onClick={onCancel} className="inline-flex min-h-10 items-center rounded-xl border border-slate-200 px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500">
            Rester ici
          </button>
          <button type="button" onClick={onPublish} className="inline-flex min-h-10 items-center rounded-xl bg-indigo-600 px-4 text-sm font-semibold text-white transition hover:bg-indigo-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2">
            Publier d’abord
          </button>
          <button type="button" onClick={onConfirm} className="inline-flex min-h-10 items-center rounded-xl border border-rose-200 px-4 text-sm font-semibold text-rose-700 transition hover:bg-rose-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500">
            {action.label} quand même
          </button>
        </div>
      </div>
    </div>
  );
}
