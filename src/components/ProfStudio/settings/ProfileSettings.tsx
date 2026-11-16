import type { UserProfile } from '../../../types';
import { blockClass, inputClass, labelClass } from './settingsUi';

interface ProfileSettingsProps {
  profile?: Pick<UserProfile, 'firstName' | 'lastName' | 'name' | 'phone' | 'email'>;
  firstName: string;
  lastName: string;
  email: string;
  onFirstNameChange: (value: string) => void;
  onLastNameChange: (value: string) => void;
  onEmailChange: (value: string) => void;
}

export function ProfileSettings({
  profile,
  firstName,
  lastName,
  email,
  onFirstNameChange,
  onLastNameChange,
  onEmailChange,
}: ProfileSettingsProps) {
  return (
    <div className={blockClass}>
      <label className={labelClass}>Profil</label>
      <p className="mt-1 text-xs text-slate-500">Ces informations sont synchronisées avec votre compte.</p>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div>
          <label className="text-xs font-medium text-slate-600">Prénom</label>
          <input
            value={firstName}
            onChange={event => onFirstNameChange(event.target.value)}
            className={`${inputClass} mt-1`}
          />
        </div>
        <div>
          <label className="text-xs font-medium text-slate-600">Nom</label>
          <input
            value={lastName}
            onChange={event => onLastNameChange(event.target.value)}
            className={`${inputClass} mt-1`}
          />
        </div>
      </div>

      <div className="mt-3">
        <label className="text-xs font-medium text-slate-600">Email</label>
        <input
          type="email"
          value={email}
          onChange={event => onEmailChange(event.target.value)}
          placeholder="exemple@domaine.com"
          className={`${inputClass} mt-1`}
        />
      </div>

      <div className="mt-3">
        <label className="text-xs font-medium text-slate-600">Téléphone</label>
        <input
          value={profile?.phone || ''}
          readOnly
          disabled
          className={`${inputClass} mt-1 cursor-not-allowed bg-slate-50 text-slate-400`}
        />
        <p className="mt-1 text-[11px] text-slate-400">Le numéro est lié au compte et ne peut pas être modifié ici.</p>
      </div>
    </div>
  );
}
