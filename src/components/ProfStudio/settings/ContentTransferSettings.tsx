import { Download, Loader2, RotateCcw, Upload } from 'lucide-react';
import { blockClass } from './settingsUi';

interface ContentTransferSettingsProps {
  busy: boolean;
  message: string | null;
  onExport: () => Promise<void>;
  onImport: (file: File | undefined) => Promise<void>;
  onReset: () => Promise<void>;
}

export function ContentTransferSettings({
  busy,
  message,
  onExport,
  onImport,
  onReset,
}: ContentTransferSettingsProps) {
  return (
    <div className={blockClass}>
      <p className="text-xs leading-relaxed text-slate-500">
        Exportez votre contenu (chapitres, quiz, révisions, exercices), réimportez-le sur un autre
        appareil, ou réinitialisez tout pour revenir au contenu d'origine.
      </p>

      <div className="mt-3 space-y-2.5">
        <button
          type="button"
          onClick={() => void onExport()}
          disabled={busy}
          className="flex h-11 w-full items-center justify-center gap-2 rounded-full bg-indigo-600 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700 disabled:opacity-40"
        >
          {busy ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />}
          Exporter le contenu
        </button>

        <label className="flex h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-full border border-slate-200 bg-white text-sm font-semibold text-slate-700 transition hover:bg-slate-50">
          {busy ? <Loader2 size={15} className="animate-spin" /> : <Upload size={15} />}
          Importer un contenu
          <input
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={event => {
              void onImport(event.target.files?.[0]);
              event.target.value = '';
            }}
          />
        </label>

        <button
          type="button"
          onClick={() => void onReset()}
          disabled={busy}
          className="flex h-11 w-full items-center justify-center gap-2 rounded-full border border-red-200 bg-red-50 text-sm font-semibold text-red-600 transition hover:bg-red-100 disabled:opacity-40"
        >
          <RotateCcw size={15} />
          Réinitialiser (contenu initial)
        </button>
      </div>

      {message && <p className="mt-2 text-xs font-medium text-slate-500">{message}</p>}
    </div>
  );
}
