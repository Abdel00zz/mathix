import { useState, type FormEvent } from 'react';
import { CalendarClock, Loader2, X } from 'lucide-react';
import type { SessionState } from '../../../services/professorClassroomService';
import { nextFullHour, toLocalInputValue } from './sessionHelpers';

export function SessionScheduleModal({ session, onClose, onSchedule }: { session: SessionState; onClose: () => void; onSchedule: (scheduledAt: number, meetLink: string) => Promise<void> }) {
  const [scheduledAt, setScheduledAt] = useState(() => toLocalInputValue(session.scheduledAt || nextFullHour()));
  const [meetLink, setMeetLink] = useState(session.meetLink || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [minValue] = useState(() => toLocalInputValue(Date.now()));
  const submit = async (event: FormEvent) => {
    event.preventDefault(); const value = new Date(scheduledAt).getTime();
    if (!Number.isFinite(value) || value <= Date.now()) { setError('Choisissez une date et une heure à venir.'); return; }
    setBusy(true); setError('');
    try { await onSchedule(value, meetLink); onClose(); }
    catch { setError('Enregistrement impossible. Vérifiez la connexion.'); }
    finally { setBusy(false); }
  };
  return <div className="fixed inset-0 z-[120] flex items-center justify-center p-4" onClick={onClose}><div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" /><form onSubmit={event => void submit(event)} onClick={event => event.stopPropagation()} className="relative w-full max-w-md overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"><header className="flex items-center justify-between border-b border-slate-100 px-5 py-4"><div><h2 className="text-sm font-bold text-slate-900">Programmer une séance</h2><p className="text-[11px] text-slate-400">Date, heure et lien de visioconférence</p></div><button type="button" onClick={onClose} className="grid h-8 w-8 place-items-center rounded-full text-slate-400 hover:bg-slate-100" aria-label="Fermer"><X size={16} /></button></header><div className="space-y-4 p-5"><label className="block"><span className="prof-label mb-1 block">Date et heure</span><input type="datetime-local" required min={minValue} value={scheduledAt} onChange={event => setScheduledAt(event.target.value)} className="prof-input w-full px-3 outline-none" /></label><label className="block"><span className="prof-label mb-1 block">Lien visio <span className="font-normal text-slate-400">(facultatif)</span></span><input type="url" value={meetLink} onChange={event => setMeetLink(event.target.value)} placeholder="https://meet.google.com/…" className="prof-input w-full px-3 outline-none" /></label>{error && <p className="text-xs font-semibold text-rose-600" role="alert">{error}</p>}</div><footer className="flex justify-end gap-2 border-t border-slate-100 px-5 py-3"><button type="button" onClick={onClose} className="prof-button-ghost px-3">Annuler</button><button type="submit" disabled={busy} className="prof-button-primary px-4">{busy ? <Loader2 size={15} className="animate-spin" /> : <CalendarClock size={15} />}{busy ? 'Enregistrement…' : 'Enregistrer'}</button></footer></form></div>;
}
