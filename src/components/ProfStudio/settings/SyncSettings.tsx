import { blockClass } from './settingsUi';

interface SyncSettingsProps {
  enabled: boolean;
  onToggle: () => void;
}

export function SyncSettings({ enabled, onToggle }: SyncSettingsProps) {
  return (
    <div className={blockClass}>
      <p className="text-xs leading-relaxed text-slate-500">
        La liaison tablette ↔ PC passe par le cloud (Redis) : chaque appareil interroge l'état de
        la séance périodiquement. La synchronisation rapide réduit les lectures de séance à
        environ 1,2 s, sur tout réseau. Elle augmente les requêtes cloud ; les envois d'activité restent espacés de 4 s.
      </p>
      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        onClick={onToggle}
        className="mt-3 flex w-full items-center justify-between gap-3 rounded-xl border border-slate-100 px-4 py-3 transition hover:bg-slate-50"
      >
        <span className="text-left">
          <span className="block text-[13px] font-semibold text-slate-700">
            Synchronisation cloud rapide
          </span>
          <span className="block text-[10px] text-slate-400">
            Lectures plus fréquentes, sans liaison locale directe entre les appareils.
          </span>
        </span>
        <span className={`relative h-6 w-10 shrink-0 rounded-full transition ${
          enabled ? 'bg-emerald-600' : 'bg-slate-300'
        }`}>
          <span className={`absolute top-1 h-4 w-4 rounded-full bg-white transition ${
            enabled ? 'translate-x-5' : 'translate-x-1'
          }`} />
        </span>
      </button>
    </div>
  );
}
