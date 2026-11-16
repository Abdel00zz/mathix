import { faGraduationCap, faMagnifyingGlass, faRotateLeft, faSort, faUsers } from '@fortawesome/free-solid-svg-icons';
import { FaIcon } from '../../UI/FaIcon';
import type { AdminClassEntry } from '../../../services/adminService';

interface AdminUserOverviewProps {
  stats: { profs: number; users: number; pending: number };
  classes: AdminClassEntry[];
  query: string;
  roleFilter: string;
  classFilter: string;
  onQueryChange: (value: string) => void;
  onRoleFilterChange: (value: string) => void;
  onClassFilterChange: (value: string) => void;
  onRefresh: () => void;
}

export default function AdminUserOverview({
  stats,
  classes,
  query,
  roleFilter,
  classFilter,
  onQueryChange,
  onRoleFilterChange,
  onClassFilterChange,
  onRefresh,
}: AdminUserOverviewProps) {
  const hasActiveFilters = Boolean(query || roleFilter || classFilter);
  const resetFilters = () => {
    onQueryChange('');
    onRoleFilterChange('');
    onClassFilterChange('');
  };

  return (
    <>
      <section aria-label="Répartition des comptes" className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Stat icon={<FaIcon icon={faGraduationCap} size={14} />} label="Professeurs" value={stats.profs} tone="emerald" />
        <Stat icon={<FaIcon icon={faUsers} size={14} />} label="Utilisateurs" value={stats.users} tone="sky" />
        <Stat icon={<FaIcon icon={faUsers} size={14} />} label="En attente" value={stats.pending} tone="amber" />
      </section>

      {/* Sticky top command bar matching table geometry */}
      <section
        aria-label="Filtres des utilisateurs"
        className="sticky top-0 z-20 -mx-1 flex flex-wrap items-center gap-2.5 rounded-2xl border border-slate-200/80 bg-white/90 p-2.5 shadow-[0_4px_24px_rgba(15,23,42,0.04)] backdrop-blur-xl sm:p-3"
      >
        <label className="relative min-w-[200px] flex-1">
          <span className="sr-only">Rechercher un utilisateur</span>
          <FaIcon icon={faMagnifyingGlass} size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden="true" />
          <input
            value={query}
            onChange={event => onQueryChange(event.target.value)}
            placeholder="Rechercher un nom, un téléphone, une classe…"
            className="w-full rounded-xl border border-slate-200/90 bg-slate-50/70 py-2 pl-9 pr-3 text-xs text-slate-800 outline-none transition focus:border-slate-900 focus:bg-white sm:text-sm"
          />
          {query && (
            <button
              type="button"
              onClick={() => onQueryChange('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-slate-400 hover:text-slate-600"
            >
              ×
            </button>
          )}
        </label>

        {/* Role segmented pill buttons */}
        <div className="flex items-center rounded-xl bg-slate-100/80 p-0.5 text-xs font-semibold text-slate-600">
          {[
            { id: '', label: 'Tous' },
            { id: 'prof', label: 'Profs' },
            { id: 'student', label: 'Élèves' },
            { id: 'pending', label: 'En attente' },
          ].map(item => (
            <button
              key={item.id}
              type="button"
              onClick={() => onRoleFilterChange(item.id)}
              className={`rounded-lg px-2.5 py-1.5 transition-all ${
                roleFilter === item.id
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        <label>
          <span className="sr-only">Filtrer par classe</span>
          <select
            value={classFilter}
            onChange={event => onClassFilterChange(event.target.value)}
            className="h-9 rounded-xl border border-slate-200/90 bg-slate-50/70 px-3 text-xs font-medium text-slate-700 outline-none transition focus:border-slate-900 focus:bg-white"
          >
            <option value="">Toutes les classes</option>
            {classes.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}
          </select>
        </label>

        {hasActiveFilters && (
          <button
            type="button"
            onClick={resetFilters}
            className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-amber-200 bg-amber-50 px-2.5 text-xs font-semibold text-amber-800 shadow-2xs transition hover:bg-amber-100"
            title="Réinitialiser les filtres"
          >
            <FaIcon icon={faRotateLeft} size={13} />
            <span className="hidden sm:inline">Réinitialiser</span>
          </button>
        )}

        <button
          type="button"
          onClick={onRefresh}
          className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 shadow-2xs transition hover:bg-slate-50 active:scale-95"
          title="Actualiser la liste"
        >
          <FaIcon icon={faSort} size={13} aria-hidden="true" />
          <span className="hidden sm:inline">Actualiser</span>
        </button>
      </section>
    </>
  );
}

function Stat({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: number; tone: 'sky' | 'emerald' | 'amber' }) {
  const toneClass = {
    sky: 'bg-sky-50 text-sky-600',
    emerald: 'bg-emerald-50 text-emerald-600',
    amber: 'bg-amber-50 text-amber-600',
  }[tone];
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">
        <span className={`grid h-7 w-7 place-items-center rounded-lg ${toneClass}`} aria-hidden="true">{icon}</span>
        {label}
      </div>
      <p className="mt-1 text-2xl font-bold text-slate-900">{value}</p>
    </div>
  );
}
