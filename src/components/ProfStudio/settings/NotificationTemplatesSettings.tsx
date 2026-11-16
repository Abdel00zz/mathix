import { Plus, RotateCcw, Trash2 } from 'lucide-react';
import type { NotifyTemplate } from '../notifyTemplates';
import { blockClass, inputClass } from './settingsUi';

interface NotificationTemplatesSettingsProps {
  templates: NotifyTemplate[];
  onPatch: (index: number, updates: Partial<NotifyTemplate>) => void;
  onAdd: () => void;
  onRemove: (index: number) => void;
  onReset: () => void;
}

export function NotificationTemplatesSettings({
  templates,
  onPatch,
  onAdd,
  onRemove,
  onReset,
}: NotificationTemplatesSettingsProps) {
  return (
    <>
      <div className={blockClass}>
        <p className="text-xs leading-relaxed text-slate-500">
          Ces modèles alimentent les boutons « Textes prédéfinis » de l'onglet Séance.
          Personnalisez-les : ils sont sauvegardés sur votre compte et partagés avec vos appareils.
        </p>
      </div>

      <div className={`${blockClass} space-y-2`}>
        {templates.map((template, index) => (
          <div key={template.key} className="rounded-xl border border-slate-100 p-2.5">
            <div className="flex items-center gap-2">
              <input
                value={template.title}
                onChange={event => onPatch(index, { title: event.target.value })}
                placeholder="Titre"
                className={inputClass}
              />
              <button
                type="button"
                onClick={() => onRemove(index)}
                className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-slate-400 transition hover:bg-red-50 hover:text-red-600"
                aria-label="Supprimer"
              >
                <Trash2 size={14} />
              </button>
            </div>
            <textarea
              value={template.body}
              onChange={event => onPatch(index, { body: event.target.value })}
              placeholder="Message"
              rows={2}
              className={`${inputClass} mt-2 resize-y`}
            />
          </div>
        ))}
      </div>

      <div className={`${blockClass} flex flex-wrap items-center gap-2`}>
        <button
          type="button"
          onClick={onAdd}
          className="inline-flex h-9 items-center gap-1.5 rounded-full border border-slate-200 bg-white px-4 text-xs font-semibold text-slate-600 transition hover:bg-slate-50"
        >
          <Plus size={14} /> Ajouter un modèle
        </button>
        <button
          type="button"
          onClick={onReset}
          className="inline-flex h-9 items-center gap-1.5 rounded-full border border-slate-200 bg-white px-4 text-xs font-semibold text-slate-600 transition hover:bg-slate-50"
        >
          <RotateCcw size={13} /> Réinitialiser
        </button>
      </div>
    </>
  );
}
