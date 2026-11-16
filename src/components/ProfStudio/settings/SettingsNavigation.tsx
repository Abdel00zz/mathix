import type { ReactNode } from 'react';
import { Bell, Download, Settings, UserRound } from 'lucide-react';

/** Réglages restés dans le menu « ⋮ » : hors pilotage de séance. */
export type SettingsTab = 'page' | 'notify' | 'content';

const tabs: SettingsNavigationItem<SettingsTab>[] = [
  { id: 'page', label: 'Personnalisation', icon: <UserRound size={15} /> },
  { id: 'notify', label: 'Notifications', icon: <Bell size={15} /> },
  { id: 'content', label: 'Contenu', icon: <Download size={15} /> },
];

export interface SettingsNavigationItem<T extends string> { id: T; label: string; icon: ReactNode }

interface SettingsNavigationProps<T extends string> {
  activeTab: T;
  onSelect: (tab: T) => void;
  items?: SettingsNavigationItem<T>[];
  title?: string;
  responsive?: boolean;
}

export function SettingsNavigation<T extends string>({ activeTab, onSelect, items, title = 'Réglages avancés', responsive = false }: SettingsNavigationProps<T>) {
  const navigation = items || tabs as unknown as SettingsNavigationItem<T>[];
  return (
    <aside className={`${responsive ? 'w-full border-b sm:w-[200px] sm:border-b-0 sm:border-r' : 'w-[200px] border-r'} shrink-0 border-[#f0f0f0] bg-[#fafafa]/50 p-3`}>
      <div className="mb-2 flex items-center gap-2 px-2.5 pt-1.5">
        <Settings size={14} className="text-slate-400" />
        <span className="text-[11.5px] font-bold text-slate-700">{title}</span>
      </div>
      <nav className={responsive ? 'flex gap-1 overflow-x-auto sm:block sm:space-y-1' : 'space-y-1'} aria-label="Catégories de réglages">
        {navigation.map(tab => {
          const selected = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => onSelect(tab.id)}
              aria-current={selected ? 'page' : undefined}
              className={`flex shrink-0 items-center gap-2.5 rounded-md px-3 py-2 text-left text-[13px] font-medium transition-all sm:w-full ${
                selected
                  ? 'bg-[#e6f4ff] font-semibold text-[#1677ff] shadow-[inset_3px_0_0_0_#1677ff]'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              <span className={selected ? 'text-[#1677ff]' : 'text-slate-400'}>{tab.icon}</span>
              {tab.label}
            </button>
          );
        })}
      </nav>
    </aside>
  );
}
