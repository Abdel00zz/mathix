import React from 'react';
import OrientationModal from '../Modals/OrientationModal';
import HelpModal from '../Modals/HelpModal';
import SettingsModal from '../Modals/SettingsModal';
import ProfSessionHistoryModal from '../ProfStudio/ProfSessionHistoryModal';
import ProfTabletSettingsModal from '../ProfStudio/ProfTabletSettingsModal';
import type { DashboardModalId } from '../../hooks/useDashboardSessionState';
import type { AppSettings, ChapterInfo, ChapterProgress, UserProfile } from '../../types';

interface DashboardModalHostProps {
  activeModal: DashboardModalId | null;
  effectiveClassId: string;
  profSession: boolean;
  user: UserProfile;
  globalProgress: Record<string, ChapterProgress>;
  currentSettings: AppSettings;
  appManifest?: any;
  chaptersById: Map<string, ChapterInfo>;
  onClose: () => void;
  onExportData: () => void;
  onImportData: (file: File) => Promise<void>;
  onApplySettings: (settings: AppSettings) => void;
  onUpdateProfile?: (updates: any, switchView?: 'dashboard') => void;
  onLogout: () => void;
  onNavigateChapter: (chapter: ChapterInfo) => void;
}

export const DashboardModalHost: React.FC<DashboardModalHostProps> = ({
  activeModal,
  effectiveClassId,
  profSession,
  user,
  globalProgress,
  currentSettings,
  appManifest,
  chaptersById: _chaptersById,
  onClose,
  onExportData,
  onImportData,
  onApplySettings,
  onUpdateProfile,
  onLogout,
  onNavigateChapter: _onNavigateChapter,
}) => {
  if (!activeModal) return null;

  return (
    <>
      {activeModal === 'orientation' && (
        <OrientationModal onClose={onClose} classId={effectiveClassId} variant="modal" isOpen />
      )}
      {activeModal === 'help' && (
        <HelpModal onClose={onClose} variant="modal" isOpen />
      )}
      {activeModal === 'notification' && profSession && (
        <ProfSessionHistoryModal isOpen onClose={onClose} classId={effectiveClassId} />
      )}
      {activeModal === 'settings' && profSession && (
        <ProfTabletSettingsModal
          isOpen
          onClose={onClose}
          classId={effectiveClassId}
          user={user}
          onUpdateProfile={onUpdateProfile}
          onLogout={onLogout}
        />
      )}
      {activeModal === 'settings' && !profSession && (
        <SettingsModal
          onClose={onClose}
          onExportData={onExportData}
          onImportData={onImportData}
          globalProgress={{ user, ...globalProgress }}
          currentSettings={currentSettings}
          onApplySettings={onApplySettings}
          user={user}
          manifest={appManifest}
          onUpdateProfile={onUpdateProfile}
          onLogout={onLogout}
          variant="modal"
          isOpen
        />
      )}
    </>
  );
};
