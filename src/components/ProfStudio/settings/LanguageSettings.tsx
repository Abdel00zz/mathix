import { useI18n } from '../../../i18n/I18nContext';
import type { Language } from '../../../i18n/translations';
import { blockClass, labelClass } from './settingsUi';

const OPTIONS: Array<{ id: Language; label: string }> = [
  { id: 'fr', label: 'Français' },
  { id: 'ar', label: 'العربية' },
];

/** Choix de langue de l'interface, enregistré sur l'appareil. */
export function LanguageSettings() {
  const { lang, setLang } = useI18n();

  return (
    <div className={blockClass}>
      <label className={labelClass}>Langue</label>
      <p className="mt-1 text-xs text-slate-500">Langue de l'interface sur cet appareil.</p>
      <div className="mt-3 flex gap-2">
        {OPTIONS.map(option => {
          const selected = lang === option.id;
          return (
            <button
              key={option.id}
              type="button"
              onClick={() => setLang(option.id)}
              aria-pressed={selected}
              className={`rounded-xl border px-4 py-2 text-[13px] font-semibold transition ${
                selected
                  ? 'border-indigo-400 bg-indigo-50 text-indigo-700 ring-2 ring-indigo-100'
                  : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50'
              }`}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
