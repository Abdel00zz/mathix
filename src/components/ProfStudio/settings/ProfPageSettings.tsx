import { Check, Loader2 } from 'lucide-react';
import type { ClassChapter } from '../../../services/profContentService';
import { blockClass, DEFAULT_BANNER_MESSAGE, inputClass, labelClass } from './settingsUi';

interface ProfPageSettingsProps {
  message: string;
  highlighted: Set<string>;
  chapters: ClassChapter[];
  loading: boolean;
  onMessageChange: (message: string) => void;
  onToggleChapter: (id: string) => void;
}

export function ProfPageSettings({
  message,
  highlighted,
  chapters,
  loading,
  onMessageChange,
  onToggleChapter,
}: ProfPageSettingsProps) {
  return (
    <>
      <div className={blockClass}>
        <label className={labelClass}>Message de la bannière</label>
        <p className="mt-1 text-xs text-slate-500">Affiché sous « Je suis ton professeur » sur la tablette.</p>
        <textarea
          value={message}
          onChange={event => onMessageChange(event.target.value)}
          placeholder={DEFAULT_BANNER_MESSAGE}
          rows={2}
          className={`${inputClass} mt-2`}
        />
      </div>

      <div className={blockClass}>
        <label className={labelClass}>Chapitres mis en avant</label>
        <p className="mt-1 text-xs text-slate-500">Ils apparaissent en premier sur la tablette.</p>
        {loading ? (
          <div className="flex items-center gap-2 py-4 text-xs text-slate-400">
            <Loader2 size={14} className="animate-spin" /> Chargement des chapitres…
          </div>
        ) : chapters.length === 0 ? (
          <p className="py-4 text-center text-xs text-slate-400">Aucun chapitre disponible.</p>
        ) : (
          <div className="mt-2 max-h-56 space-y-1.5 overflow-y-auto">
            {chapters.map(chapter => {
              const active = highlighted.has(chapter.id);
              return (
                <button
                  key={chapter.id}
                  type="button"
                  onClick={() => onToggleChapter(chapter.id)}
                  aria-pressed={active}
                  className={`flex min-h-10 w-full items-center justify-between rounded-xl border px-3 text-left text-[13px] font-medium transition ${
                    active
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                      : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  <span className="min-w-0 flex-1 truncate">{chapter.title}</span>
                  <span className={`ml-2 grid h-5 w-5 shrink-0 place-items-center rounded-full border ${
                    active
                      ? 'border-emerald-600 bg-emerald-600 text-white'
                      : 'border-slate-300 text-transparent'
                  }`}>
                    <Check size={13} strokeWidth={3} />
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
