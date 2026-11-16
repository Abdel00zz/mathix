import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { lazyWithRetry } from '../../utils/lazyWithRetry';
import { adminService, type AdminClassEntry, type AdminUser } from '../../services/adminService';
import type { SyncSummary } from '../../services/contentSyncTypes';
import { activateAdminContentSession } from '../../services/profContentService';
import NotificationsPanel from './NotificationsPanel';
import PilotagePanel from './PilotagePanel';
import AdminConsoleHeader from './console/AdminConsoleHeader';
import AdminLoginView from './console/AdminLoginView';
import AdminUserOverview from './console/AdminUserOverview';
import AdminUsersTable from './console/AdminUsersTable';
import UserConfigurationDialog from './console/UserConfigurationDialog';
import StudentProgressDialog from './console/StudentProgressDialog';
import ProfSyncDialog from './console/ProfSyncDialog';
import type { AdminView, SortDir, SortKey } from './console/types';
import LoadingSpinner from '../UI/LoadingSpinner';

const ProfStudioApp = lazyWithRetry(() => import('../ProfStudio/ProfStudioApp'));

interface AdminConsoleProps {
  onBack?: () => void;
}

export default function AdminConsole({ onBack }: AdminConsoleProps) {
  const [authenticated, setAuthenticated] = useState(() => adminService.isAuthenticated());
  const [view, setView] = useState<AdminView>('users');
  const [secretInput, setSecretInput] = useState('');
  const [loginError, setLoginError] = useState<string | null>(null);
  const [logging, setLogging] = useState(false);

  const [users, setUsers] = useState<AdminUser[]>([]);
  const [classes, setClasses] = useState<AdminClassEntry[]>([]);
  const [query, setQuery] = useState('');
  const [filterClass, setFilterClass] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('registeredAt');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [configurationTarget, setConfigurationTarget] = useState<AdminUser | null>(null);
  const [progressTarget, setProgressTarget] = useState<AdminUser | null>(null);
  const [syncTarget, setSyncTarget] = useState<AdminUser | null>(null);
  const [syncSummaries, setSyncSummaries] = useState<Record<string, SyncSummary>>({});

  const refreshSyncOverview = useCallback(async (userList: AdminUser[]) => {
    const ids = userList.filter(user => user.role === 'prof').map(user => user.accountId);
    setSyncSummaries(await adminService.syncOverview(ids));
  }, []);

  const handleSyncChanged = useCallback(() => {
    void refreshSyncOverview(users);
  }, [refreshSyncOverview, users]);

  const load = async () => {
    try {
      const [userList, classList] = await Promise.all([
        adminService.fetchUsers(),
        adminService.fetchClasses(),
      ]);
      setUsers(userList);
      setClasses(classList);
      await refreshSyncOverview(userList);
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Chargement impossible');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!authenticated) return;
    let active = true;
    (async () => {
      try {
        const [userList, classList] = await Promise.all([
          adminService.fetchUsers(),
          adminService.fetchClasses(),
        ]);
        if (!active) return;
        setUsers(userList);
        setClasses(classList);
        await refreshSyncOverview(userList);
        setError(null);
      } catch (loadError) {
        if (active) setError(loadError instanceof Error ? loadError.message : 'Chargement impossible');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [authenticated, refreshSyncOverview]);

  useEffect(() => {
    if (!authenticated) return;
    return activateAdminContentSession(adminService.contentSessionSecret());
  }, [authenticated]);

  const doLogin = async () => {
    setLogging(true);
    setLoginError(null);
    adminService.login(secretInput);
    try {
      await adminService.fetchUsers();
      setAuthenticated(true);
    } catch {
      adminService.logout();
      setLoginError('Secret administrateur incorrect.');
    } finally {
      setLogging(false);
    }
  };

  const logout = () => {
    adminService.logout();
    setAuthenticated(false);
    setUsers([]);
  };

  const closeAdmin = () => {
    logout();
    onBack?.();
  };

  const stats = useMemo(() => ({
    profs: users.filter(user => user.role === 'prof').length,
    pending: users.filter(user => user.role !== 'prof' && user.requestedRole === 'prof').length,
    users: users.filter(user => user.role !== 'prof' && user.requestedRole !== 'prof').length,
  }), [users]);

  const students = useMemo(() => users.filter(user => user.role !== 'prof' && user.requestedRole !== 'prof'), [users]);

  // Liste stable : la modale de progression la prend en dépendance d'effet, une
  // nouvelle référence à chaque rendu relancerait la lecture du cloud.
  const progressClassmates = useMemo(() => {
    if (!progressTarget) return [];
    return students.filter(student => student.classId === progressTarget.classId && student.accountId !== progressTarget.accountId);
  }, [students, progressTarget]);

  const progressProfessorName = useMemo(() => {
    if (!progressTarget?.profId) return undefined;
    return users.find(user => user.accountId === progressTarget.profId)?.name;
  }, [users, progressTarget]);

  const filtered = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const matches = users.filter(user => {
      const searchableName = user.name || [user.firstName, user.lastName].filter(Boolean).join(' ') || user.phone || '';
      const matchesQuery = !normalizedQuery
        || searchableName.toLowerCase().includes(normalizedQuery)
        || (user.phone || '').includes(normalizedQuery)
        || (user.classId || '').toLowerCase().includes(normalizedQuery)
        || (user.className || '').toLowerCase().includes(normalizedQuery);
      const category = user.role === 'prof' ? 'prof' : user.requestedRole === 'prof' ? 'pending' : 'student';
      return matchesQuery
        && (!filterClass || user.classId === filterClass)
        && (!roleFilter || category === roleFilter);
    });
    return [...matches].sort((left, right) => {
      const leftValue = sortKey === 'name' ? (left.name || '').toLowerCase() : (left[sortKey] || 0);
      const rightValue = sortKey === 'name' ? (right.name || '').toLowerCase() : (right[sortKey] || 0);
      const comparison = leftValue < rightValue ? -1 : leftValue > rightValue ? 1 : 0;
      return sortDir === 'asc' ? comparison : -comparison;
    });
  }, [users, query, filterClass, roleFilter, sortKey, sortDir]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(direction => direction === 'asc' ? 'desc' : 'asc');
    else {
      setSortKey(key);
      setSortDir('asc');
    }
  };


  const removeUser = async (user: AdminUser) => {
    if (!window.confirm(`Supprimer « ${user.name} » ?\nCette action supprimera aussi sa progression cloud.`)) return;
    try {
      await adminService.deleteUser(user.accountId);
      await load();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Suppression impossible');
    }
  };

  const resolveProfessorRequest = async (user: AdminUser, approved: boolean) => {
    const action = approved ? 'Activer le mode professeur' : 'Refuser la demande professeur';
    if (!window.confirm(`${action} pour « ${user.name} » ?`)) return;
    try {
      await adminService.setRole(user.accountId, approved ? 'prof' : 'student');
      await load();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Traitement de la demande impossible');
    }
  };

  if (!authenticated) {
    return (
      <AdminLoginView
        secret={secretInput}
        error={loginError}
        logging={logging}
        onSecretChange={setSecretInput}
        onLogin={() => void doLogin()}
        onBack={onBack ? closeAdmin : undefined}
      />
    );
  }

  return (
    <div className="flex h-dvh flex-col bg-[#fafafa] text-slate-900 vercel-font">
      <AdminConsoleHeader view={view} onViewChange={setView} onLogout={logout} onClose={onBack ? closeAdmin : undefined} />

      <main className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
        {view === 'users' ? (
          <div className="mx-auto max-w-6xl space-y-5">
            <AdminUserOverview
              stats={stats}
              classes={classes}
              query={query}
              roleFilter={roleFilter}
              classFilter={filterClass}
              onQueryChange={setQuery}
              onRoleFilterChange={setRoleFilter}
              onClassFilterChange={setFilterClass}
              onRefresh={() => { setLoading(true); void load(); }}
            />
            {error && <div role="alert" className="rounded-lg border border-red-100 bg-red-50 px-4 py-2 text-xs font-medium text-red-700">{error}</div>}
            <AdminUsersTable
              users={filtered}
              allUsers={users}
              classes={classes}
              loading={loading}
              sortKey={sortKey}
              sortDirection={sortDir}
              onSort={toggleSort}
              onConfigure={setConfigurationTarget}
              onProgress={setProgressTarget}
              onSync={setSyncTarget}
              syncSummaries={syncSummaries}
              onApprove={user => void resolveProfessorRequest(user, true)}
              onReject={user => void resolveProfessorRequest(user, false)}
              onRemove={user => void removeUser(user)}
            />
          </div>
        ) : view === 'notifications' ? (
          <div className="mx-auto max-w-6xl"><NotificationsPanel classes={classes} /></div>
        ) : view === 'pilotage' ? (
          <div className="mx-auto max-w-4xl"><PilotagePanel classes={classes} users={users} /></div>
        ) : (
          <Suspense fallback={<LoadingSpinner variant="section" context="studio" audience="professor" />}>
            <ProfStudioApp classId="" adminMode />
          </Suspense>
        )}
      </main>

      {configurationTarget && (
        <UserConfigurationDialog
          key={configurationTarget.accountId}
          target={configurationTarget}
          classes={classes}
          users={users}
          onClose={() => setConfigurationTarget(null)}
          onUpdated={load}
          onError={setError}
        />
      )}
      {progressTarget && (
        <StudentProgressDialog
          key={progressTarget.accountId}
          target={progressTarget}
          classes={classes}
          classmates={progressClassmates}
          professorName={progressProfessorName}
          onClose={() => setProgressTarget(null)}
          onError={setError}
        />
      )}
      {syncTarget && (
        <ProfSyncDialog
          key={syncTarget.accountId}
          target={syncTarget}
          onClose={() => setSyncTarget(null)}
          onChanged={handleSyncChanged}
          onError={setError}
        />
      )}
    </div>
  );
}
