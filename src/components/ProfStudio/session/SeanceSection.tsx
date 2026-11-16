import { useMemo, useState } from 'react';
import { CalendarClock, ExternalLink, History, Printer, RefreshCw, X } from 'lucide-react';
import type { ArchivedSessionSummary, SessionState } from '../../../services/professorClassroomService';
import { ProjectionSection } from './ProjectionSection';
import { SessionScheduleModal } from './SessionScheduleModal';
import { dayLabel, formatDuration, formatSlot, sortSessionArchives, STATUS_META } from './sessionHelpers';

interface Props {
  session: SessionState;
  classId: string;
  classLabel: string;
  livePresentCount: number;
  archives: ArchivedSessionSummary[];
  onPrintLive: () => void;
  onPrintArchived: (id: string) => void;
  onSchedule: (scheduledAt: number, meetLink: string) => Promise<void>;
  onRefreshArchives: () => void;
}

/** Badge d'état Ant Design v6.6. */
const STATUS_BADGE: Record<SessionState['status'], string> = {
  idle: 'prof-chip',
  running: 'prof-chip prof-chip-green font-semibold',
  paused: 'prof-chip prof-chip-gold font-semibold',
  stopped: 'prof-chip prof-chip-red font-semibold',
};

const time = (timestamp: number) => new Date(timestamp).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

interface SessionSummary {
  date: number;
  endedAt?: number | null;
  chapter: string;
  status: SessionState['status'];
  counts: { exercises: number; quiz: number; zones: number; present: number };
  onPrint: () => void;
}

export function SeanceSection({ session, classId, classLabel, livePresentCount, archives, onPrintLive, onPrintArchived, onSchedule, onRefreshArchives }: Props) {
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const rows = useMemo(() => sortSessionArchives(archives.filter(entry => entry.classId === classId)), [archives, classId]);
  const currentId = session.startedAt ? String(session.startedAt) : '';
  const showCurrent = Boolean(session.startedAt && ['running', 'paused', 'stopped'].includes(session.status) && !rows.some(row => row.id === currentId));
  const liveZones = Object.values(session.activity?.strokes || {}).filter(value => Array.isArray(value) && value.length > 0).length;

  // La zone « Séance » n'affiche que la dernière séance : la séance courante,
  // sinon l'archive la plus récente.
  const latest: SessionSummary | null = showCurrent
    ? {
        date: session.startedAt!,
        endedAt: session.status === 'stopped' ? session.updatedAt : undefined,
        chapter: session.chapterTitle || 'Séance',
        status: session.status,
        counts: { exercises: session.activity?.exerciseIds?.length || 0, quiz: session.activity?.quiz?.history?.length || 0, zones: liveZones, present: livePresentCount },
        onPrint: onPrintLive,
      }
    : rows[0]
      ? {
          date: rows[0].startedAt,
          endedAt: rows[0].endedAt,
          chapter: rows[0].chapterTitle || 'Séance',
          status: 'stopped',
          counts: { exercises: rows[0].exercisesCount, quiz: rows[0].quizAnswered, zones: rows[0].annotatedZones, present: rows[0].presentCount },
          onPrint: () => onPrintArchived(rows[0].id),
        }
      : null;

  return (
    <div className="space-y-4">
      <section className="prof-panel p-5" aria-labelledby="seance-title">
        <div className="flex items-center gap-2">
          <h2 id="seance-title" className="prof-section-title mr-auto">Gestion de la séance</h2>
          <button type="button" onClick={() => setScheduleOpen(true)} className="prof-button-secondary gap-1.5 px-3 text-[#1677ff] border-[#91caff] hover:border-[#1677ff]" aria-label="Programmer une séance" title="Programmer une séance">
            <CalendarClock size={15} />
            <span className="text-xs font-semibold">Programmer</span>
          </button>
          <button type="button" onClick={() => setHistoryOpen(true)} className="prof-button-secondary gap-1.5 px-3" aria-label="Historique des séances" title="Historique des séances passées">
            <History size={15} />
            <span className="text-xs font-semibold">Historique</span>
          </button>
        </div>

        {session.scheduledAt && (
          <p className="prof-meta mt-3 capitalize">
            {formatSlot(session.scheduledAt)}{' '}
            {session.meetLink && <a href={session.meetLink} target="_blank" rel="noreferrer" className="ml-1 inline-flex text-[#1677ff] hover:underline" aria-label="Ouvrir le lien visio"><ExternalLink size={12} /></a>}
          </p>
        )}

        <div className="mt-4">
          {latest ? (
            <LastSessionCard summary={latest} />
          ) : (
            <p className="py-6 text-center text-xs text-[#8c8c8c]">Aucune séance enregistrée pour cette classe.</p>
          )}
        </div>
      </section>

      <ProjectionSection />

      {scheduleOpen && <SessionScheduleModal session={session} onClose={() => setScheduleOpen(false)} onSchedule={onSchedule} />}

      {historyOpen && (
        <SessionHistoryModal rows={rows} classLabel={classLabel} onPrintArchived={onPrintArchived} onRefresh={onRefreshArchives} onClose={() => setHistoryOpen(false)} />
      )}
    </div>
  );
}

/** Carte de la dernière séance : date, chapitre, mots-clés, état, impression. */
function LastSessionCard({ summary }: { summary: SessionSummary }) {
  const meta = STATUS_META[summary.status];
  const label = `${dayLabel(summary.date)} ${time(summary.date)}`;
  return (
    <div className="flex items-center gap-3.5 rounded-lg border border-[#f0f0f0] bg-[#fafafa]/50 p-3">
      <div className="w-32 shrink-0">
        <p className="text-xs font-bold text-[#141414]">{dayLabel(summary.date)}</p>
        <p className="prof-meta text-[11px]">
          {time(summary.date)}{summary.endedAt ? `–${time(summary.endedAt)}` : ''}
          {summary.endedAt ? ` · ${formatDuration(summary.date, summary.endedAt)}` : ''}
        </p>
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-bold text-[#141414]">{summary.chapter}</p>
        <p className="prof-meta mt-0.5 truncate text-[11px]">
          {summary.counts.exercises} exercices · {summary.counts.quiz} quiz · {summary.counts.zones} zones · {summary.counts.present} présents
        </p>
      </div>
      <span className={`shrink-0 ${STATUS_BADGE[summary.status]}`}>{meta.label}</span>
      <button type="button" onClick={summary.onPrint} className="prof-button-secondary h-9 px-3 gap-1.5 text-xs text-[#1677ff] border-[#91caff] hover:border-[#1677ff] shrink-0" aria-label={`Imprimer la séance du ${label}`} title={`Imprimer la séance du ${label}`}>
        <Printer size={15} />
        <span className="font-semibold">Imprimer</span>
      </button>
    </div>
  );
}

/** Modale listant toutes les séances passées, ouverte par le bouton « Historique ». */
function SessionHistoryModal({ rows, classLabel, onPrintArchived, onRefresh, onClose }: { rows: ArchivedSessionSummary[]; classLabel: string; onPrintArchived: (id: string) => void; onRefresh: () => void; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" />
      <div
        className="relative flex max-h-[80vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
        onClick={event => event.stopPropagation()}
      >
        <header className="flex shrink-0 items-center justify-between border-b border-slate-100 px-5 py-4">
          <div>
            <h2 className="text-sm font-bold text-slate-900">Historique des séances</h2>
            <p className="text-[11px] text-slate-400">{classLabel}</p>
          </div>
          <div className="flex items-center gap-1">
            <button type="button" onClick={onRefresh} className="prof-button-ghost" aria-label="Actualiser l’historique" title="Actualiser l’historique">
              <RefreshCw size={15} />
            </button>
            <button type="button" onClick={onClose} className="prof-button-ghost" aria-label="Fermer" title="Fermer">
              <X size={17} />
            </button>
          </div>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
          {rows.length === 0 ? (
            <p className="py-10 text-center text-xs text-slate-400">Aucune séance passée.</p>
          ) : (
            <ul>
              {rows.map(row => (
                <li key={row.id}>
                  <SessionRow
                    date={row.startedAt}
                    endedAt={row.endedAt}
                    chapter={row.chapterTitle || 'Séance'}
                    classLabel={classLabel}
                    counts={{ exercises: row.exercisesCount, quiz: row.quizAnswered, zones: row.annotatedZones, present: row.presentCount }}
                    onPrint={() => onPrintArchived(row.id)}
                  />
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

function SessionRow({ date, endedAt, chapter, classLabel, counts, onPrint }: { date: number; endedAt?: number | null; chapter: string; classLabel: string; counts: { exercises: number; quiz: number; zones: number; present: number }; onPrint: () => void }) {
  const label = `${dayLabel(date)} ${time(date)}`;
  return (
    <div className="prof-row flex items-center gap-3 px-1 py-3">
      <div className="w-36 shrink-0">
        <p className="text-xs font-bold text-slate-800">{dayLabel(date)}</p>
        <p className="prof-meta">{time(date)}{endedAt ? `–${time(endedAt)} · ${formatDuration(date, endedAt)}` : ''}</p>
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-semibold text-slate-800">{chapter}</p>
        <p className="prof-meta truncate">{counts.exercises} exercices · {counts.quiz} quiz · {counts.zones} zones · {counts.present} présents</p>
      </div>
      <span className="prof-chip prof-chip-blue hidden sm:inline-flex">{classLabel}</span>
      <button type="button" onClick={onPrint} className="prof-button-secondary h-8 px-2.5 gap-1.5 text-xs text-[#1677ff] border-[#91caff] hover:border-[#1677ff] shrink-0" aria-label={`Imprimer la séance du ${label}`} title={`Imprimer la séance du ${label}`}>
        <Printer size={14} />
        <span className="font-semibold">Imprimer</span>
      </button>
    </div>
  );
}
