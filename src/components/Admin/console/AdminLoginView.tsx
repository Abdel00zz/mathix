import { type FormEvent } from 'react';
import { faShieldHalved } from '@fortawesome/free-solid-svg-icons';
import { FaIcon } from '../../UI/FaIcon';

interface AdminLoginViewProps {
  secret: string;
  error: string | null;
  logging: boolean;
  onSecretChange: (value: string) => void;
  onLogin: () => void;
  onBack?: () => void;
}

export default function AdminLoginView({
  secret,
  error,
  logging,
  onSecretChange,
  onLogin,
  onBack,
}: AdminLoginViewProps) {
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onLogin();
  };

  return (
    <div className="flex h-dvh items-center justify-center bg-[#fafafa] p-4 vercel-font">
      <form onSubmit={submit} className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-5 flex items-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-xl bg-slate-900 text-white" aria-hidden="true">
            <FaIcon icon={faShieldHalved} size={20} />
          </span>
          <div>
            <h1 className="text-sm font-bold">Console d’administration</h1>
            <p className="text-[11px] text-slate-400">Accès réservé à l’administrateur</p>
          </div>
        </div>

        <label htmlFor="admin-secret" className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-slate-400">
          Secret administrateur
        </label>
        <input
          id="admin-secret"
          type="password"
          value={secret}
          onChange={event => onSecretChange(event.target.value)}
          placeholder="••••••••"
          autoComplete="current-password"
          aria-invalid={Boolean(error)}
          aria-describedby={error ? 'admin-login-error' : undefined}
          className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-slate-900"
          autoFocus
        />
        {error && <p id="admin-login-error" role="alert" className="mt-2 text-xs font-medium text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={!secret.trim() || logging}
          className="mt-4 w-full rounded-lg bg-slate-900 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:opacity-40"
        >
          {logging ? 'Vérification…' : 'Se connecter'}
        </button>
        {onBack && (
          <button type="button" onClick={onBack} className="mt-2 w-full rounded-lg py-2 text-xs font-semibold text-slate-500 transition hover:text-slate-700">
            Retour
          </button>
        )}
      </form>
    </div>
  );
}
