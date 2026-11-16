import { useEffect, useState } from 'react';
import type { UserProfile } from '../../../types';

export type EditableProfProfile = Pick<UserProfile, 'firstName' | 'lastName' | 'name' | 'phone' | 'email'>;

interface UseProfileSettingsOptions {
  isOpen: boolean;
  profile?: EditableProfProfile;
  onUpdateProfile?: (updates: Partial<UserProfile>) => void;
}

/**
 * Identité éditable du compte professeur (prénom, nom, email). Le téléphone,
 * lié au compte, reste affiché mais n'est pas modifiable ici.
 */
export function useProfileSettings({ isOpen, profile, onUpdateProfile }: UseProfileSettingsOptions) {
  const [firstName, setFirstName] = useState(profile?.firstName || '');
  const [lastName, setLastName] = useState(profile?.lastName || '');
  const [email, setEmail] = useState(profile?.email || '');

  useEffect(() => {
    if (!isOpen || !onUpdateProfile) return;
    const name = `${firstName} ${lastName}`.trim() || profile?.name || '';
    const changed =
      firstName !== (profile?.firstName || '') ||
      lastName !== (profile?.lastName || '') ||
      email !== (profile?.email || '');
    if (!changed) return;
    const timer = window.setTimeout(() => {
      onUpdateProfile({ firstName, lastName, name, email });
    }, 700);
    return () => window.clearTimeout(timer);
  }, [isOpen, firstName, lastName, email, onUpdateProfile, profile]);

  return { firstName, setFirstName, lastName, setLastName, email, setEmail };
}
