import { useMemo, useState } from 'react';
import { isFastSync, setFastSync } from '../../utils/syncPrefs';
import type { NotifyTemplate } from './notifyTemplates';
import { ActionFeedback } from './session/ActionFeedback';
import { NotificationsSection } from './session/NotificationsSection';
import { RotationSection } from './session/RotationSection';
import { SeanceSection } from './session/SeanceSection';
import { SessionPrintOverlays } from './session/SessionPrintOverlays';
import { StudentsSection } from './session/StudentsSection';
import { SyncSettings } from './settings/SyncSettings';
import type { SessionSection } from './session/types';
import { useClassroomSession } from './session/useClassroomSession';
import { useRotationController } from './session/useRotationController';
import { useSessionActions } from './session/useSessionActions';
import { useSessionPrinting } from './session/useSessionPrinting';

interface ProfSessionPanelProps {
  classId: string;
  classLabel?: string;
  notifyTemplates?: NotifyTemplate[];
  activeSection: SessionSection;
  enabled?: boolean;
}

/**
 * Contenu d'une classe : deux vues, « Séance » et « Élèves ».
 *
 * « Séance » est pilotée par l'état : au repos elle montre la programmation et
 * l'impression, et dès que la séance tourne elle devient un cockpit unique
 * (élèves, rotation, images, réglages essentiels). « Élèves » regroupe l'appel,
 * la rotation et les messages, pour la préparation hors séance.
 */
export default function ProfSessionPanel({
  classId,
  classLabel,
  notifyTemplates,
  activeSection,
  enabled = true,
}: ProfSessionPanelProps) {
  const classroom = useClassroomSession(classId, enabled);
  const actions = useSessionActions({
    classId,
    session: classroom.session,
    setSession: classroom.setSession,
    enrolled: classroom.enrolled,
    presentIds: classroom.presentIds,
    setPresentIds: classroom.setPresentIds,
    refreshSharedImages: classroom.refreshSharedImages,
  });
  const rotation = useRotationController({
    classId,
    roster: classroom.roster,
    setRoster: classroom.setRoster,
    live: classroom.live,
    setLive: classroom.setLive,
  });
  const printing = useSessionPrinting({ classId, session: classroom.session, enrolled: classroom.enrolled, presentIds: classroom.presentIds });
  const presentCount = useMemo(
    () => classroom.enrolled.filter(student => classroom.presentIds.has(student.accountId)).length,
    [classroom.enrolled, classroom.presentIds],
  );
  const resolvedLabel = classLabel || classId || 'Aucune classe';
  const [fastSync, setFastSyncState] = useState(() => isFastSync());

  const toggleFastSync = () => {
    setFastSyncState(previous => {
      setFastSync(!previous);
      return !previous;
    });
  };

  const isLive = classroom.session.status === 'running' || classroom.session.status === 'paused';

  const studentsBlock = (
    <StudentsSection
      loading={classroom.loading}
      busy={actions.busy}
      enrolled={classroom.enrolled}
      presentIds={classroom.presentIds}
      chapterTitles={classroom.chapterTitles}
      sharedImages={classroom.sharedImages}
      inRotation={rotation.inRotation}
      onTogglePresent={actions.togglePresent}
      onMarkAllPresent={actions.markAllPresent}
      onMarkNonePresent={actions.markNonePresent}
      onSaveAttendance={actions.saveAttendance}
      onAddRotation={rotation.importStudent}
      onShareImage={actions.shareImage}
      onDeleteImage={actions.deleteSharedImage}
    />
  );

  const rotationBlock = (
    <RotationSection
      roster={classroom.roster}
      live={classroom.live}
      online={classroom.online}
      syncState={rotation.syncState}
      syncLabel={rotation.syncLabel}
      answeredIds={rotation.answeredIds}
      answeredCount={rotation.answeredCount}
      participation={rotation.participation}
      onReset={rotation.resetSession}
      onTitleChange={rotation.setGroupTitle}
      onNameChange={rotation.renameStudent}
      onMove={rotation.moveStudent}
      onRemove={rotation.removeStudent}
    />
  );
  const seanceOverview = <SeanceSection session={classroom.session} classId={classId} classLabel={resolvedLabel} livePresentCount={presentCount} archives={classroom.archives} onPrintLive={printing.openPrintForLive} onPrintArchived={id => { void printing.openPrintForArchived(id); }} onSchedule={actions.scheduleSession} onRefreshArchives={() => { void classroom.refreshArchives(); }} />;

  return (
    <>
      <main className="min-h-0 flex-1 overflow-y-auto px-4 py-5 md:px-6">
        <div className="mx-auto max-w-5xl space-y-4">
          <ActionFeedback message={actions.actionMessage} />

          {activeSection === 'seance' && (
            <div key={classroom.session.status} className="prof-session-fade space-y-4">
              {seanceOverview}
              {isLive && (
                <>
                  <section className="prof-panel p-4" aria-labelledby="cockpit-title">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                      <h2 id="cockpit-title" className="prof-section-title mr-auto">Séance en cours</h2>
                      <span className="prof-chip border-emerald-200 bg-emerald-50 text-emerald-800" role="status" aria-live="polite">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" aria-hidden="true" />
                        {classroom.session.status === 'paused' ? 'En pause' : 'En cours'}
                      </span>
                      <span className="prof-chip">{resolvedLabel}</span>
                      {classroom.session.startedAt && (
                        <span className="prof-meta">
                          depuis {new Date(classroom.session.startedAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      )}
                    </div>
                    <p className="prof-meta mt-2 border-t border-slate-100 pt-2.5">
                      Pilotage depuis la tablette. Présences, rotation et images ci-dessous.
                    </p>
                  </section>

                  {studentsBlock}
                  {rotationBlock}

                  <section className="prof-panel px-5 py-4" aria-labelledby="cockpit-sync-title">
                    <h2 id="cockpit-sync-title" className="prof-section-title">Synchronisation</h2>
                    <SyncSettings enabled={fastSync} onToggle={toggleFastSync} />
                  </section>

                </>
              )}
            </div>
          )}

          {activeSection === 'eleves' && (
            <>
              {studentsBlock}
              {rotationBlock}
              <NotificationsSection
                classLabel={resolvedLabel}
                templates={notifyTemplates}
                enrolledCount={classroom.enrolled.length}
                presentCount={presentCount}
                onSend={actions.notifyStudents}
              />
            </>
          )}
        </div>
      </main>

      <SessionPrintOverlays
        target={printing.target}
        payload={printing.printPayload}
        onClose={() => printing.setTarget(null)}
        onPrint={printing.preparePrint}
      />
    </>
  );
}
