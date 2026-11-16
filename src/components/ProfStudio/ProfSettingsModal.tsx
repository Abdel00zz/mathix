import { useState } from 'react';
import { Check, LogOut, X } from 'lucide-react';
import type { UserProfile } from '../../types';
import { SettingsNavigation, type SettingsTab } from './settings/SettingsNavigation';
import { SettingsTabContent } from './settings/SettingsTabContent';
import { useContentTransfer } from './settings/useContentTransfer';
import { useProfPageSettings } from './settings/useProfPageSettings';
import { useProfileSettings, type EditableProfProfile } from './settings/useProfileSettings';

interface ProfSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Remonte les préférences (page publique) pour synchronisation serveur. */
  onUpdateProfile?: (updates: Partial<UserProfile>) => void;
  profPage?: UserProfile['profPage'];
  profile?: EditableProfProfile;
  classId?: string;
  /** Déconnexion du compte professeur (accessible ici en plus du rail). */
  onLogout?: () => void;
}

/**
 * Réglages avancés, accessibles depuis le menu « ⋮ » : profil, langue,
 * page publique, notifications et contenu. La configuration de la session
 * tablette vit désormais dans la vue « Paramètres » de la console.
 */
export default function ProfSettingsModal({
  isOpen,
  onClose,
  onUpdateProfile,
  profPage,
  profile,
  classId,
  onLogout,
}: ProfSettingsModalProps) {
  const [tab, setTab] = useState<SettingsTab>('page');

  const page = useProfPageSettings({ isOpen, classId, profPage, onUpdateProfile });
  const profileSettings = useProfileSettings({ isOpen, profile, onUpdateProfile });
  const content = useContentTransfer();

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="relative flex max-h-[88vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-[#f0f0f0] bg-white shadow-[0_20px_60px_-15px_rgba(0,0,0,0.18)]"
        onClick={event => event.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 z-10 grid h-8 w-8 place-items-center rounded-md text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
          aria-label="Fermer"
        >
          <X size={16} />
        </button>

        <div className="flex min-h-[480px] flex-1">
          <SettingsNavigation<SettingsTab> activeTab={tab} onSelect={setTab} />

          <div className="flex min-w-0 flex-1 flex-col">
            <div className="flex items-center justify-between border-b border-[#f0f0f0] bg-[#fafafa]/80 px-6 py-4">
              <div>
                <span className="prof-chip prof-chip-blue text-[10.5px]">Espace Enseignant</span>
                <h2 className="mt-1 text-base font-bold tracking-tight text-[#141414]">Réglages avancés</h2>
                <p className="mt-0.5 text-xs text-[#8c8c8c]">Profil, langue, page publique, notifications et contenus.</p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {onLogout && (
                  <button
                    type="button"
                    onClick={onLogout}
                    className="prof-button-danger h-8 gap-1.5 px-3 text-xs"
                  >
                    <LogOut size={13} /> Déconnexion
                  </button>
                )}
                <span className="prof-chip prof-chip-green">
                  <Check size={11} /> Enregistré
                </span>
              </div>
            </div>

            <div className="min-h-0 flex-1 divide-y divide-[#f0f0f0] overflow-y-auto bg-white px-6 py-5">
              <SettingsTabContent
                tab={tab}
                page={{
                  message: page.pageMessage,
                  highlighted: page.pageHighlighted,
                  chapters: page.pageChapters,
                  loading: page.pageChaptersLoading,
                  onMessageChange: page.setPageMessage,
                  onToggleChapter: page.togglePageChapter,
                }}
                profile={{
                  profile,
                  firstName: profileSettings.firstName,
                  lastName: profileSettings.lastName,
                  email: profileSettings.email,
                  onFirstNameChange: profileSettings.setFirstName,
                  onLastNameChange: profileSettings.setLastName,
                  onEmailChange: profileSettings.setEmail,
                }}
                notifications={{
                  templates: page.notifyTemplates,
                  onPatch: page.patchTemplate,
                  onAdd: page.addTemplate,
                  onRemove: page.removeTemplate,
                  onReset: page.resetTemplates,
                }}
                content={{
                  busy: content.contentBusy,
                  message: content.contentMessage,
                  onExport: content.handleExport,
                  onImport: content.handleImportFile,
                  onReset: content.handleReset,
                }}
              />
            </div>

            <footer className="flex items-center justify-between border-t border-[#f0f0f0] bg-[#fafafa]/50 px-6 py-3.5">
              <p className="text-xs text-[#8c8c8c]">Enregistrement automatique des modifications.</p>
              <button
                type="button"
                onClick={onClose}
                className="prof-button-primary px-5"
              >
                Terminer
              </button>
            </footer>
          </div>
        </div>
      </div>
    </div>
  );
}
