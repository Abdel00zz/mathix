import React, { useEffect, useState } from 'react';
import { faBell, faClockRotateLeft, faPaperPlane } from '@fortawesome/free-solid-svg-icons';
import { FaIcon } from '../UI/FaIcon';
import { adminService, type AdminClassEntry } from '../../services/adminService';

interface NotificationsPanelProps {
  classes: AdminClassEntry[];
}

type Tab = 'send' | 'history';

const inputClass = 'w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none transition focus:border-slate-900';

export default function NotificationsPanel({ classes }: NotificationsPanelProps) {
  const [tab, setTab] = useState<Tab>('send');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  // ── Envoyer ──
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [targetClass, setTargetClass] = useState('');
  const [priority, setPriority] = useState('high');

  // ── Historique ──
  const [history, setHistory] = useState<any[]>([]);

  useEffect(() => {
    if (tab !== 'history') return;
    let active = true;
    (async () => {
      try {
        const h = await adminService.fetchHistory(50);
        if (!active) return;
        setHistory(h);
      } catch { /* silencieux */ }
    })();
    return () => { active = false; };
  }, [tab]);

  const loadHistory = async () => {
    try {
      const h = await adminService.fetchHistory(50);
      setHistory(h);
    } catch { /* silencieux */ }
  };

  const doSend = async () => {
    if (!title.trim() || !body.trim()) return;
    setBusy(true);
    setMessage(null);
    try {
      await adminService.sendNotification({ title, body, targetClass: targetClass || undefined, priority });
      setMessage('Notification envoyée.');
      setTitle(''); setBody(''); setTargetClass('');
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Erreur');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      {/* Onglets */}
      <div className="flex items-center gap-0.5 rounded-lg border border-slate-200 bg-slate-50 p-0.5">
        {([['send', 'Envoyer', <FaIcon key="s" icon={faPaperPlane} size={13} />], ['history', 'Historique', <FaIcon key="h" icon={faClockRotateLeft} size={13} />]] as const).map(([id, label, icon]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-[12px] font-semibold transition ${tab === id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
          >
            {icon} {label}
          </button>
        ))}
      </div>

      {message && <div className="rounded-lg border border-emerald-100 bg-emerald-50 px-4 py-2 text-xs font-medium text-emerald-700">{message}</div>}

      {tab === 'send' && (
        <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-sm font-bold">Nouvelle notification</p>
          <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Titre" className={inputClass} />
          <textarea value={body} onChange={e => setBody(e.target.value)} placeholder="Message" rows={3} className={`${inputClass} resize-y`} />
          <div className="flex flex-wrap gap-2">
            <select value={targetClass} onChange={e => setTargetClass(e.target.value)} className={inputClass + ' max-w-[260px]'}>
              <option value="">Toute la plateforme</option>
              {classes.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
            </select>
            <select value={priority} onChange={e => setPriority(e.target.value)} className={inputClass + ' max-w-[160px]'}>
              <option value="high">Priorité haute</option>
              <option value="normal">Priorité normale</option>
            </select>
          </div>
          <button type="button" onClick={() => void doSend()} disabled={!title.trim() || !body.trim() || busy} className="inline-flex h-10 items-center gap-2 rounded-lg bg-slate-900 px-4 text-xs font-semibold text-white transition hover:bg-slate-700 disabled:opacity-40">
            <FaIcon icon={faBell} size={14} /> Envoyer
          </button>
        </div>
      )}

      {tab === 'history' && (
        <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-bold">Historique des notifications</p>
            <button type="button" onClick={() => void loadHistory()} className="rounded-md border border-slate-200 px-2.5 py-1 text-[11px] font-semibold text-slate-600 transition hover:bg-slate-50">Actualiser</button>
          </div>
          {history.length === 0 ? (
            <p className="py-6 text-center text-xs text-slate-400">Aucune notification envoyée.</p>
          ) : (
            <div className="space-y-1">
              {history.map((h, i) => (
                <div key={i} className="flex items-start gap-2 rounded-lg border border-slate-100 px-3 py-2">
                  <FaIcon icon={faBell} size={13} className="mt-0.5 shrink-0 text-slate-400" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-800">{h.title || h.body || 'Notification'}</p>
                    <p className="truncate text-[11px] text-slate-400">{h.body && h.title ? h.body : ''}</p>
                  </div>
                  <span className="shrink-0 text-[11px] text-slate-400">{h.at || h.createdAt ? new Date(h.at || h.createdAt).toLocaleString('fr-FR') : ''}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
