import { Check, GraduationCap, KeyRound, School, ShieldCheck, X } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import { adminService, type AdminClassEntry, type AdminUser } from '../../../services/adminService';
import AdminModalFrame from './AdminModalFrame';
import type { ProfClassScope } from './types';

// La progression n'est plus un onglet de configuration : elle a sa propre
// modale (`StudentProgressDialog`), ouverte depuis la liste des utilisateurs.
type ConfigTab = 'class' | 'teacher' | 'role' | 'password';

interface UserConfigurationDialogProps {
  target: AdminUser;
  classes: AdminClassEntry[];
  users: AdminUser[];
  onClose: () => void;
  onUpdated: () => Promise<void>;
  onError: (message: string) => void;
}

const scopeOptions: Array<{ id: ProfClassScope; label: string }> = [
  { id: 'all', label: 'Tous les niveaux' },
  { id: 'selected', label: 'Sélection' },
  { id: 'none', label: 'Aucun accès' },
];

export default function UserConfigurationDialog({ target, classes, users, onClose, onUpdated, onError }: UserConfigurationDialogProps) {
  const [tab, setTab] = useState<ConfigTab>('class');
  const [busy, setBusy] = useState(false);
  const [classValue, setClassValue] = useState(target.classId || '');
  const initialScope = target.profClassScope || (target.profClasses?.length ? 'selected' : 'all');
  const [classScope, setClassScope] = useState<ProfClassScope>(initialScope);
  const [classIds, setClassIds] = useState<Set<string>>(new Set(initialScope === 'selected' ? target.profClasses || [] : []));
  const [profValue, setProfValue] = useState(target.profId || '');
  const [password, setPassword] = useState('');

  const tabs = useMemo<Array<{ id: ConfigTab; label: string; icon: ReactNode }>>(() => {
    const shared: Array<{ id: ConfigTab; label: string; icon: ReactNode }> = [
      { id: 'class', label: target.role === 'prof' ? 'Classes' : 'Classe', icon: <School size={14} /> },
    ];
    if (target.role !== 'prof') {
      shared.push(
        { id: 'teacher', label: 'Enseignant', icon: <GraduationCap size={14} /> },
        { id: 'role', label: '+ Prof', icon: <ShieldCheck size={14} /> },
      );
    }
    shared.push({ id: 'password', label: 'Mot de passe', icon: <KeyRound size={14} /> });
    return shared;
  }, [target.role]);

  const runUpdate = async (operation: () => Promise<void>, fallback: string, close = false) => {
    setBusy(true);
    try {
      await operation();
      await onUpdated();
      if (close) onClose();
    } catch (error) {
      onError(error instanceof Error ? error.message : fallback);
    } finally {
      setBusy(false);
    }
  };

  const toggleClass = (id: string) => {
    setClassIds(previous => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const titleId = 'admin-user-configuration-title';
  return (
    <AdminModalFrame labelledBy={titleId} onClose={onClose} width="lg">
      <div className="flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-emerald-100 text-base font-bold text-emerald-800" aria-hidden="true">
          {(target.name || '?').charAt(0).toUpperCase()}
        </span>
        <div className="min-w-0 flex-1">
          <h2 id={titleId} className="truncate text-xl font-bold tracking-tight text-slate-900">Configuration de {target.name}</h2>
          <p className="mt-1 truncate text-sm text-slate-500">{target.phone || '—'} · {target.role === 'prof' ? 'Professeur' : 'Élève'}</p>
        </div>
        <button type="button" onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 transition hover:bg-slate-50" aria-label="Fermer">
          <X size={16} aria-hidden="true" />
        </button>
      </div>

      <div className="mt-5 flex gap-2 overflow-x-auto rounded-2xl border border-slate-200 bg-slate-200/70 p-2" role="tablist" aria-label="Options de configuration">
        {tabs.map(item => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={tab === item.id}
            onClick={() => setTab(item.id)}
            className={`inline-flex shrink-0 items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition ${tab === item.id ? 'bg-white text-emerald-700 shadow-sm ring-1 ring-slate-200' : 'text-slate-600 hover:bg-white/60 hover:text-slate-900'}`}
          >
            <span aria-hidden="true">{item.icon}</span>{item.label}
          </button>
        ))}
      </div>

      <div className="mt-5 min-h-72 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6" role="tabpanel">
        {tab === 'class' && target.role !== 'prof' && (
          <ConfigSection title="Classe de l’élève" description="Le niveau détermine le contenu servi et la progression enregistrée.">
            <select value={classValue} onChange={event => setClassValue(event.target.value)} className="mt-5 w-full rounded-xl border border-slate-300 bg-slate-50 px-4 py-3 text-base outline-none focus:border-emerald-500 focus:bg-white">
              <option value="">Choisir un niveau…</option>
              {classes.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}
            </select>
            <SaveButton busy={busy} disabled={!classValue} onClick={() => void runUpdate(() => adminService.setClass(target.accountId, classValue), 'Changement de classe impossible')} />
          </ConfigSection>
        )}

        {tab === 'class' && target.role === 'prof' && (
          <ConfigSection title="Classes autorisées" description="Définissez précisément les niveaux accessibles à ce professeur.">
            <div className="mt-4 grid grid-cols-3 gap-1.5">
              {scopeOptions.map(option => (
                <button key={option.id} type="button" aria-pressed={classScope === option.id} onClick={() => setClassScope(option.id)} className={`rounded-xl border px-3 py-3 text-sm font-semibold ${classScope === option.id ? 'border-emerald-400 bg-emerald-100 text-emerald-900' : 'border-slate-300 bg-slate-50 text-slate-700 hover:bg-slate-100'}`}>{option.label}</button>
              ))}
            </div>
            {classScope === 'selected' && (
              <div className="mt-3 max-h-44 space-y-1 overflow-y-auto rounded-lg border border-slate-100 p-2">
                {classes.map(item => (
                  <label key={item.id} className={`flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 text-sm ${classIds.has(item.id) ? 'bg-emerald-100 text-emerald-900' : 'text-slate-700 hover:bg-slate-100'}`}>
                    <input type="checkbox" checked={classIds.has(item.id)} onChange={() => toggleClass(item.id)} className="h-4 w-4 accent-emerald-600" />
                    <span>{item.title}</span>
                  </label>
                ))}
              </div>
            )}
            <SaveButton busy={busy} disabled={classScope === 'selected' && classIds.size === 0} onClick={() => void runUpdate(() => adminService.setProfClasses(target.accountId, classScope === 'selected' ? Array.from(classIds) : [], classScope), 'Modification des classes impossible')} />
          </ConfigSection>
        )}

        {tab === 'teacher' && target.role !== 'prof' && (
          <ConfigSection title="Enseignant associé" description="Le professeur sélectionné verra cet élève dans sa gestion de classe.">
            <select value={profValue} onChange={event => setProfValue(event.target.value)} className="mt-5 w-full rounded-xl border border-slate-300 bg-slate-50 px-4 py-3 text-base outline-none focus:border-emerald-500 focus:bg-white">
              <option value="">Aucun enseignant</option>
              {users.filter(user => user.role === 'prof').map(professor => <option key={professor.accountId} value={professor.accountId}>{professor.name}</option>)}
            </select>
            <SaveButton busy={busy} onClick={() => void runUpdate(() => adminService.setProf(target.accountId, profValue), 'Association au professeur impossible')} />
          </ConfigSection>
        )}

        {tab === 'role' && target.role !== 'prof' && (
          <ConfigSection title="Activer le rôle professeur" description="Le compte sera déplacé dans la liste des professeurs et recevra les outils d’enseignement.">
            <div className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-sm leading-6 text-emerald-900">La date d’affectation sera enregistrée automatiquement et servira à ordonner la liste des professeurs.</div>
            <button type="button" disabled={busy} onClick={() => { if (window.confirm(`Activer le badge professeur pour « ${target.name} » ?`)) void runUpdate(() => adminService.setRole(target.accountId, 'prof'), 'Activation du rôle impossible', true); }} className="mt-5 inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-3 text-sm font-semibold text-white shadow-sm hover:bg-emerald-500 disabled:opacity-40">
              <ShieldCheck size={16} /> {busy ? 'Activation…' : 'Activer le badge professeur'}
            </button>
          </ConfigSection>
        )}

        {tab === 'password' && (
          <ConfigSection title="Mot de passe" description={target.passwordSet ? 'Ce compte possède déjà un mot de passe personnalisé.' : 'Ce compte utilise encore le mot de passe par défaut 000000000.'}>
            <input type="text" value={password} onChange={event => setPassword(event.target.value)} placeholder="Nouveau mot de passe (6 caractères minimum)" className="mt-5 w-full rounded-xl border border-slate-300 bg-slate-50 px-4 py-3 text-base outline-none focus:border-emerald-500 focus:bg-white" />
            {password.length > 0 && password.length < 6 && <p className="mt-2 text-sm font-medium text-amber-700">6 caractères minimum.</p>}
            <SaveButton label="Définir" busy={busy} disabled={password.length < 6} onClick={() => void runUpdate(() => adminService.setPassword(target.accountId, password), 'Modification du mot de passe impossible')} />
          </ConfigSection>
        )}
      </div>
    </AdminModalFrame>
  );
}

function ConfigSection({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return <div><h3 className="text-lg font-bold tracking-tight text-slate-900">{title}</h3><p className="mt-2 text-sm leading-6 text-slate-500">{description}</p>{children}</div>;
}

function SaveButton({ label = 'Appliquer', busy, disabled = false, onClick }: { label?: string; busy: boolean; disabled?: boolean; onClick: () => void }) {
  return <button type="button" disabled={busy || disabled} onClick={onClick} className="mt-5 inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-3 text-sm font-semibold text-white shadow-sm hover:bg-emerald-500 disabled:opacity-40"><Check size={16} /> {busy ? 'Application…' : label}</button>;
}
