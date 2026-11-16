import { ArrowUpDown, ChartLine, Check, Settings2, Trash2, X } from 'lucide-react';
import type { AdminClassEntry, AdminUser } from '../../../services/adminService';
import type { SyncSummary } from '../../../services/contentSyncTypes';
import { dateShort, timeAgo } from './formatters';
import type { SortKey } from './types';
import LoadingSpinner from '../../UI/LoadingSpinner';

interface AdminUsersTableProps {
  users: AdminUser[];
  allUsers: AdminUser[];
  classes: AdminClassEntry[];
  loading: boolean;
  sortKey: SortKey;
  sortDirection: 'asc' | 'desc';
  onSort: (key: SortKey) => void;
  onConfigure: (user: AdminUser) => void;
  onProgress?: (user: AdminUser) => void;
  onSync: (user: AdminUser) => void;
  syncSummaries: Record<string, SyncSummary>;
  onApprove: (user: AdminUser) => void;
  onReject: (user: AdminUser) => void;
  onRemove: (user: AdminUser) => void;
}

type SectionTone = 'emerald' | 'stone' | 'amber';

interface UserSection {
  key: string;
  label: string;
  hint: string;
  tone: SectionTone;
  users: AdminUser[];
}

const toneClasses: Record<SectionTone, string> = {
  emerald: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  stone: 'border-stone-200 bg-stone-100 text-stone-800',
  amber: 'border-amber-200 bg-amber-50 text-amber-800',
};

const cellLabelClass = 'text-[10px] font-medium uppercase tracking-wider text-stone-400';

export default function AdminUsersTable({
  users,
  allUsers,
  classes,
  loading,
  sortKey,
  sortDirection,
  onSort,
  onConfigure,
  onProgress,
  onSync,
  syncSummaries,
  onApprove,
  onReject,
  onRemove,
}: AdminUsersTableProps) {
  const ariaSort = (key: SortKey) => sortKey === key
    ? (sortDirection === 'asc' ? 'ascending' : 'descending')
    : 'none';

  const sections = ([
    {
      key: 'professors',
      label: 'Professeurs',
      hint: 'Comptes enseignants validés',
      tone: 'emerald',
      users: users.filter(user => user.role === 'prof'),
    },
    {
      key: 'students',
      label: 'Élèves & Utilisateurs',
      hint: 'Comptes actifs',
      tone: 'stone',
      users: users.filter(user => user.role !== 'prof' && user.requestedRole !== 'prof'),
    },
    {
      key: 'pending',
      label: 'En attente',
      hint: 'Demandes professeur à vérifier',
      tone: 'amber',
      users: users.filter(user => user.role !== 'prof' && user.requestedRole === 'prof'),
    },
  ] as UserSection[]).filter(section => section.users.length > 0);

  if (loading) {
    return (
      <div className="rounded-xl border border-stone-200/80 bg-white">
        <LoadingSpinner variant="section" label="Chargement des utilisateurs…" audience="professor" />
      </div>
    );
  }

  if (users.length === 0) {
    return (
      <div className="rounded-xl border border-stone-200/80 bg-white px-4 py-16 text-center text-xs font-normal text-stone-400">
        Aucun utilisateur ne correspond aux critères de recherche.
      </div>
    );
  }

  const sharedActions = { onConfigure, onProgress, onSync, syncSummaries, onApprove, onReject, onRemove };

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-xs">
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full min-w-[1040px] text-left text-sm">
          <thead className="sticky top-0 z-10 border-b border-slate-200/80 bg-slate-50/95 backdrop-blur-md">
            <tr className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              <th scope="col" aria-sort={ariaSort('name')} className="px-5 py-3">
                <SortButton label="Utilisateur" onClick={() => onSort('name')} />
              </th>
              <th scope="col" className="px-5 py-3">Téléphone</th>
              <th scope="col" className="px-5 py-3">Classe</th>
              <th scope="col" className="px-5 py-3">Rôle</th>
              <th scope="col" aria-sort={ariaSort('registeredAt')} className="px-5 py-3">
                <SortButton label="Inscrit" onClick={() => onSort('registeredAt')} />
              </th>
              <th scope="col" aria-sort={ariaSort('lastActive')} className="px-5 py-3">
                <SortButton label="Activité" onClick={() => onSort('lastActive')} />
              </th>
              <th scope="col" className="px-5 py-3 text-right">Actions</th>
            </tr>
          </thead>
          {sections.map(section => (
            <tbody key={section.key} className="divide-y divide-stone-100">
              <tr className="bg-stone-50/30 border-y border-stone-100">
                <th colSpan={7} className="px-5 py-2">
                  <SectionBar section={section} />
                </th>
              </tr>
              {section.users.map(user => (
                <DesktopUserRow
                  key={user.accountId}
                  user={user}
                  classes={classes}
                  allUsers={allUsers}
                  {...sharedActions}
                />
              ))}
            </tbody>
          ))}
        </table>
      </div>

      <div className="space-y-3 p-3 md:hidden">
        {sections.map(section => (
          <section key={section.key} className="space-y-2">
            <div className="px-1 pt-1">
              <SectionBar section={section} compact />
            </div>
            <div className="space-y-2">
              {section.users.map(user => (
                <MobileUserCard
                  key={user.accountId}
                  user={user}
                  classes={classes}
                  allUsers={allUsers}
                  {...sharedActions}
                />
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

function SectionBar({ section, compact = false }: { section: UserSection; compact?: boolean }) {
  return (
    <div className={`flex ${compact ? 'flex-col items-start gap-1.5' : 'items-center gap-3'}`} aria-label={`${section.label} — ${section.users.length}`}>
      <div className="flex items-center gap-2">
        <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-medium ${toneClasses[section.tone]}`}>
          {section.label}
        </span>
        <span className="rounded-full bg-stone-50 px-2 py-0.5 font-mono text-[11px] font-normal text-stone-600 border border-stone-200/70">
          {section.users.length}
        </span>
      </div>
      <span className="text-xs text-stone-400 font-normal">{section.hint}</span>
      {!compact && <span className="h-px flex-1 bg-stone-200/60" />}
    </div>
  );
}

interface UserPresentationProps {
  user: AdminUser;
  classes: AdminClassEntry[];
  allUsers: AdminUser[];
  onConfigure: (user: AdminUser) => void;
  onProgress?: (user: AdminUser) => void;
  onSync: (user: AdminUser) => void;
  syncSummaries: Record<string, SyncSummary>;
  onApprove: (user: AdminUser) => void;
  onReject: (user: AdminUser) => void;
  onRemove: (user: AdminUser) => void;
}

function DesktopUserRow({ user, classes, allUsers, ...actions }: UserPresentationProps) {
  const { className, professor } = resolveUserContext(user, classes, allUsers);
  return (
    <tr className="bg-white text-stone-800 transition-colors hover:bg-stone-50/70">
      <td className="px-5 py-2.5">
        <UserIdentity user={user} />
      </td>
      <td className="px-5 py-2.5">
        <span className="font-mono text-xs text-stone-600">{user.phone || '—'}</span>
        <PasswordStatus user={user} />
      </td>
      <td className="px-5 py-2.5">
        <p className="text-xs font-medium text-stone-800">{className}</p>
        {user.role !== 'prof' && user.requestedRole !== 'prof' && (
          <p className="mt-0.5 truncate text-[11px] text-stone-500">
            {user.profId ? (
              <span className="inline-flex items-center rounded border border-stone-200/80 bg-stone-50 px-1.5 py-0.2 text-[10px] font-normal text-stone-600">
                Prof : {professor?.name || '—'}
              </span>
            ) : (
              'Sans prof'
            )}
          </p>
        )}
      </td>
      <td className="px-5 py-2.5">
        <RoleBadge user={user} />
      </td>
      <td className="px-5 py-2.5 text-xs text-stone-500">{dateShort(user.registeredAt)}</td>
      <td className="px-5 py-2.5 text-xs font-normal text-stone-600">{timeAgo(user.lastActive)}</td>
      <td className="px-5 py-2.5">
        <UserActions user={user} {...actions} />
      </td>
    </tr>
  );
}

function MobileUserCard({ user, classes, allUsers, ...actions }: UserPresentationProps) {
  const { className, professor } = resolveUserContext(user, classes, allUsers);
  return (
    <article className="rounded-xl border border-stone-200/80 bg-white p-3.5 hover:border-stone-300 transition-colors">
      <div className="flex items-start justify-between gap-3">
        <UserIdentity user={user} />
        <RoleBadge user={user} />
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2.5 border-t border-stone-100 pt-3 text-xs">
        <div className="min-w-0">
          <dt className={cellLabelClass}>Téléphone</dt>
          <dd className="mt-0.5 truncate font-mono text-stone-700">{user.phone || '—'}</dd>
          <PasswordStatus user={user} />
        </div>
        <div className="min-w-0">
          <dt className={cellLabelClass}>Classe</dt>
          <dd className="mt-0.5 truncate font-medium text-stone-800">{className}</dd>
        </div>
        <div className="min-w-0">
          <dt className={cellLabelClass}>Inscrit</dt>
          <dd className="mt-0.5 text-stone-500">{dateShort(user.registeredAt)}</dd>
        </div>
        <div className="min-w-0">
          <dt className={cellLabelClass}>Activité</dt>
          <dd className="mt-0.5 font-normal text-stone-600">{timeAgo(user.lastActive)}</dd>
        </div>
        {user.role !== 'prof' && user.requestedRole !== 'prof' && (
          <div className="col-span-2 min-w-0">
            <dt className={cellLabelClass}>Enseignant</dt>
            <dd className="mt-0.5 truncate text-stone-600">
              {user.profId ? (
                <span className="inline-flex items-center rounded border border-stone-200/80 bg-stone-50 px-1.5 py-0.2 text-[11px] font-normal text-stone-600">
                  Prof : {professor?.name || '—'}
                </span>
              ) : (
                'Sans prof'
              )}
            </dd>
          </div>
        )}
      </dl>
      <div className="mt-3 border-t border-stone-100 pt-2.5">
        <UserActions user={user} compact {...actions} />
      </div>
    </article>
  );
}

function UserIdentity({ user }: { user: AdminUser }) {
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <span
        className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-stone-200/90 bg-stone-100 text-xs font-medium text-stone-700"
        aria-hidden="true"
      >
        {(user.name || '?').charAt(0).toUpperCase()}
      </span>
      <div className="min-w-0">
        <p className="truncate text-xs font-semibold text-stone-800">{user.name || 'Utilisateur sans nom'}</p>
        {user.schoolName && <p className="truncate text-[11px] text-stone-400">{user.schoolName}</p>}
      </div>
    </div>
  );
}

function PasswordStatus({ user }: { user: AdminUser }) {
  return (
    <span className="mt-0.5 block">
      {user.passwordSet ? (
        <span className="text-[10px] text-stone-400 font-normal">MDP configuré</span>
      ) : (
        <span className="inline-block rounded border border-stone-200 bg-stone-50 px-1.5 py-0.2 text-[9px] font-normal text-stone-600">
          Défaut (000000000)
        </span>
      )}
    </span>
  );
}

function RoleBadge({ user }: { user: AdminUser }) {
  const pending = user.role !== 'prof' && user.requestedRole === 'prof';
  return (
    <span
      className={`inline-flex rounded-full border px-2.5 py-0.5 text-[11px] font-normal ${
        user.role === 'prof'
          ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
          : pending
            ? 'border-amber-200 bg-amber-50 text-amber-800'
            : 'border-stone-200 bg-stone-50 text-stone-600'
      }`}
    >
      {user.role === 'prof' ? 'Prof' : pending ? 'En attente' : 'Élève'}
    </span>
  );
}

function UserActions({
  user,
  compact = false,
  onConfigure,
  onProgress,
  onSync,
  syncSummaries,
  onApprove,
  onReject,
  onRemove,
}: Omit<UserPresentationProps, 'classes' | 'allUsers'> & { compact?: boolean }) {
  const pending = user.role !== 'prof' && user.requestedRole === 'prof';
  const isStudent = user.role !== 'prof';
  return (
    <div className={`flex ${compact ? 'flex-wrap justify-end' : 'items-center justify-end'} gap-1.5`}>
      {pending && (
        <>
          <button
            type="button"
            onClick={() => onApprove(user)}
            className="inline-flex items-center gap-1 rounded-lg bg-stone-800 px-2.5 py-1.5 text-xs font-medium text-white transition hover:bg-stone-900"
            aria-label={`Activer ${user.name} comme professeur`}
          >
            <Check size={13} strokeWidth={2} aria-hidden="true" /> Activer
          </button>
          <button
            type="button"
            onClick={() => onReject(user)}
            className="inline-flex items-center gap-1 rounded-lg border border-stone-200 bg-stone-50 px-2.5 py-1.5 text-xs font-normal text-stone-700 transition hover:bg-stone-100"
            aria-label={`Refuser la demande de ${user.name}`}
          >
            <X size={13} strokeWidth={1.75} aria-hidden="true" /> Refuser
          </button>
        </>
      )}
      {user.role === 'prof' && (
        <button
          type="button"
          onClick={() => onSync(user)}
          className="relative inline-flex items-center gap-1 rounded-lg border border-stone-200/80 bg-stone-50 px-2.5 py-1.5 text-xs font-medium text-stone-700 transition hover:bg-stone-100"
          aria-label={`Gérer le contenu de ${user.name}`}
        >
          Contenu
          {((syncSummaries[user.accountId]?.pending || 0) > 0 || (syncSummaries[user.accountId]?.adminUnread || 0) > 0) && (
            <span className="absolute -right-1 -top-1 h-2 w-2 rounded-full border-2 border-white bg-stone-800" aria-label="Activité en attente" />
          )}
        </button>
      )}
      {!pending && isStudent && onProgress && (
        <button
          type="button"
          onClick={() => onProgress(user)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-stone-200/80 bg-white px-2.5 py-1.5 text-xs font-medium text-stone-700 transition hover:border-stone-300 hover:bg-stone-50"
          aria-label={`Voir la progression de ${user.name}`}
        >
          <ChartLine size={13} strokeWidth={1.75} className="text-stone-500" aria-hidden="true" /> Progression
        </button>
      )}
      {!pending && (
        <button
          type="button"
          onClick={() => onConfigure(user)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-stone-200/80 bg-white px-2.5 py-1.5 text-xs font-medium text-stone-700 transition hover:border-stone-300 hover:bg-stone-50"
          aria-label={`Configurer ${user.name}`}
        >
          <Settings2 size={13} strokeWidth={1.75} className="text-stone-500" aria-hidden="true" /> Config
        </button>
      )}
      <button
        type="button"
        onClick={() => onRemove(user)}
        className="grid h-7 w-7 place-items-center rounded-lg text-stone-400 transition hover:bg-stone-100 hover:text-stone-700"
        aria-label={`Supprimer ${user.name}`}
      >
        <Trash2 size={14} strokeWidth={1.75} aria-hidden="true" />
      </button>
    </div>
  );
}

function resolveUserContext(user: AdminUser, classes: AdminClassEntry[], allUsers: AdminUser[]) {
  const classEntry = classes.find(item => item.id === user.classId);
  const professor = user.profId ? allUsers.find(item => item.accountId === user.profId) : undefined;
  const pending = user.role !== 'prof' && user.requestedRole === 'prof';
  return {
    className: pending ? 'À définir après validation' : classEntry?.title || user.className || user.classId || '—',
    professor,
  };
}

function SortButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1 text-stone-600 transition hover:text-stone-900"
    >
      {label} <ArrowUpDown size={11} strokeWidth={1.5} className="text-stone-400" aria-hidden="true" />
    </button>
  );
}
