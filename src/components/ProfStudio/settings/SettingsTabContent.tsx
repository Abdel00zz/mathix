import type { ClassChapter } from '../../../services/profContentService';
import type { UserProfile } from '../../../types';
import type { NotifyTemplate } from '../notifyTemplates';
import { ContentTransferSettings } from './ContentTransferSettings';
import { LanguageSettings } from './LanguageSettings';
import { NotificationTemplatesSettings } from './NotificationTemplatesSettings';
import { ProfPageSettings } from './ProfPageSettings';
import { ProfileSettings } from './ProfileSettings';
import type { SettingsTab } from './SettingsNavigation';

interface SettingsTabContentProps {
  tab: SettingsTab;
  page: {
    message: string;
    highlighted: Set<string>;
    chapters: ClassChapter[];
    loading: boolean;
    onMessageChange: (message: string) => void;
    onToggleChapter: (id: string) => void;
  };
  profile: {
    profile?: Pick<UserProfile, 'firstName' | 'lastName' | 'name' | 'phone' | 'email'>;
    firstName: string;
    lastName: string;
    email: string;
    onFirstNameChange: (value: string) => void;
    onLastNameChange: (value: string) => void;
    onEmailChange: (value: string) => void;
  };
  notifications: {
    templates: NotifyTemplate[];
    onPatch: (index: number, updates: Partial<NotifyTemplate>) => void;
    onAdd: () => void;
    onRemove: (index: number) => void;
    onReset: () => void;
  };
  content: {
    busy: boolean;
    message: string | null;
    onExport: () => Promise<void>;
    onImport: (file: File | undefined) => Promise<void>;
    onReset: () => Promise<void>;
  };
}

export function SettingsTabContent({ tab, page, profile, notifications, content }: SettingsTabContentProps) {
  if (tab === 'page') {
    return (
      <>
        <ProfileSettings
          profile={profile.profile}
          firstName={profile.firstName}
          lastName={profile.lastName}
          email={profile.email}
          onFirstNameChange={profile.onFirstNameChange}
          onLastNameChange={profile.onLastNameChange}
          onEmailChange={profile.onEmailChange}
        />
        <LanguageSettings />
        <ProfPageSettings
          message={page.message}
          highlighted={page.highlighted}
          chapters={page.chapters}
          loading={page.loading}
          onMessageChange={page.onMessageChange}
          onToggleChapter={page.onToggleChapter}
        />
      </>
    );
  }
  if (tab === 'notify') {
    return (
      <NotificationTemplatesSettings
        templates={notifications.templates}
        onPatch={notifications.onPatch}
        onAdd={notifications.onAdd}
        onRemove={notifications.onRemove}
        onReset={notifications.onReset}
      />
    );
  }
  return (
    <ContentTransferSettings
      busy={content.busy}
      message={content.message}
      onExport={content.onExport}
      onImport={content.onImport}
      onReset={content.onReset}
    />
  );
}
