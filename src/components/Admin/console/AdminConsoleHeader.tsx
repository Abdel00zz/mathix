import { faRightFromBracket, faShieldHalved, faXmark } from '@fortawesome/free-solid-svg-icons';
import { FaIcon } from '../../UI/FaIcon';
import type { AdminView } from './types';

interface AdminConsoleHeaderProps {
  view: AdminView;
  onViewChange: (view: AdminView) => void;
  onLogout: () => void;
  onClose?: () => void;
}

const views: Array<{ id: AdminView; label: string }> = [
  { id: 'users', label: 'Utilisateurs' },
  { id: 'pilotage', label: 'Pilotage' },
  { id: 'notifications', label: 'Notifications' },
  { id: 'content', label: 'Contenus' },
];

export default function AdminConsoleHeader({ view, onViewChange, onLogout, onClose }: AdminConsoleHeaderProps) {
  return (
    <header className="flex min-h-14 shrink-0 flex-wrap items-center gap-3 border-b border-slate-200 bg-white px-5 py-2">
      <FaIcon icon={faShieldHalved} size={17} className="text-slate-900" aria-hidden="true" />
      <div>
        <p className="text-sm font-bold leading-none">Administration</p>
        <p className="mt-0.5 text-[11px] text-slate-400">Gestion des utilisateurs, des classes et des rôles</p>
      </div>
      <nav aria-label="Sections de l’administration" className="ml-4 flex items-center gap-0.5 overflow-x-auto rounded-lg border border-slate-200 bg-slate-50 p-0.5">
        {views.map(item => (
          <button
            key={item.id}
            type="button"
            aria-current={view === item.id ? 'page' : undefined}
            onClick={() => onViewChange(item.id)}
            className={`shrink-0 rounded-md px-2.5 py-1 text-[11px] font-semibold transition ${view === item.id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
          >
            {item.label}
          </button>
        ))}
      </nav>
      <div className="ml-auto flex items-center gap-2">
        {onClose && (
          <button type="button" onClick={onClose} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 px-3 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900">
            <FaIcon icon={faXmark} size={14} aria-hidden="true" /> Fermer
          </button>
        )}
        <button type="button" onClick={onLogout} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 text-xs font-semibold text-red-700 transition hover:bg-red-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500">
          <FaIcon icon={faRightFromBracket} size={14} aria-hidden="true" /> Déconnexion
        </button>
      </div>
    </header>
  );
}
