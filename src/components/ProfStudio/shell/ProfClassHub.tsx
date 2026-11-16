import { RefreshCw } from 'lucide-react';
import { useEffect, useState } from 'react';
import { openProfSyncCenter, PROF_SYNC_UPDATED_EVENT, profSyncStatus } from '../../../services/profSyncService';
import { PROF_SECTIONS, type ProfSection } from './profSections';

interface ProfClassHubProps {
  classLabel: string;
  onSelectSection: (section: ProfSection) => void;
}

/**
 * Accueil d'une classe : quatre grandes destinations en grille 2 × 2.
 *
 * C'est ce qu'on voit en cliquant une classe dans le rail. La navigation n'est
 * plus un rang de petits boutons dans le rail : elle occupe l'espace de travail,
 * chaque destination portant son accent et sa raison d'être. L'état de séance
 * reste volontairement dans le rail, devant le nom de la classe concernée.
 */
export function ProfClassHub({ classLabel, onSelectSection }: ProfClassHubProps) {
  const [syncStatus, setSyncStatus] = useState(profSyncStatus);

  useEffect(() => {
    const update = () => setSyncStatus(profSyncStatus());
    window.addEventListener(PROF_SYNC_UPDATED_EVENT, update);
    return () => window.removeEventListener(PROF_SYNC_UPDATED_EVENT, update);
  }, []);

  return (
    <main className="prof-hub-main min-h-0 flex-1 overflow-y-auto px-4 py-6 sm:px-6 md:px-8 md:py-8 xl:px-10">
      <div className="mx-auto w-full max-w-[1320px]">
        <div className="prof-hub-intro flex items-baseline justify-between pb-2">
          <div>
            <p className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-[#1677ff]">Espace de classe</p>
            <h1 className="prof-hub-title text-xl font-semibold tracking-[-0.02em] text-[#141821] md:text-2xl">{classLabel}</h1>
            <p className="mt-1.5 text-[13px] text-[#7b8494]">Choisissez votre espace de travail enseignant</p>
          </div>
        </div>

        <div className="prof-hub-launcher mt-5 md:mt-6">
          {PROF_SECTIONS.map(item => {
            const Icon = item.icon;
            const hintId = `prof-hub-hint-${item.id}`;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelectSection(item.id)}
                className="prof-hub-action"
                data-section={item.id}
                aria-describedby={hintId}
              >
                <span className={`prof-hub-action-icon ${item.tile}`}>
                  <Icon size={34} strokeWidth={1.8} aria-hidden="true" />
                </span>
                <span className="prof-hub-action-copy">
                  <span className="prof-hub-action-title">{item.label}</span>
                  <span id={hintId} className="prof-hub-action-hint">{item.hint}</span>
                </span>
              </button>
            );
          })}
          <button
            type="button"
            onClick={openProfSyncCenter}
            className="prof-hub-action relative"
            data-section="updates"
            aria-describedby="prof-hub-hint-updates"
          >
            {(syncStatus.pending > 0 || syncStatus.unread > 0) && (
              <span className="absolute right-5 top-4 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-bold text-amber-800 shadow-sm">
                {syncStatus.pending + syncStatus.unread} nouvelle(s)
              </span>
            )}
            <span className="prof-hub-action-icon bg-[#722ed1] text-white shadow-sm">
              <RefreshCw size={34} strokeWidth={1.8} aria-hidden="true" />
            </span>
            <span className="prof-hub-action-copy">
              <span className="prof-hub-action-title">Mises à jour</span>
              <span id="prof-hub-hint-updates" className="prof-hub-action-hint">Contenus, nouveautés, messages</span>
            </span>
          </button>
        </div>
      </div>
    </main>
  );
}
