import { AlertTriangle, BellRing, CheckCircle2, MessageCircle, RefreshCw, Search, Send, X } from 'lucide-react';
import { useCallback, useDeferredValue, useEffect, useState } from 'react';
import CandidateTreePicker from '../../ContentSync/CandidateTreePicker';
import { profContentService } from '../../../services/profContentService';
import { EMPTY_TREE, filterCandidateTree, type CandidateTree, type Proposal, type SyncInbox, type SyncStatus, type ThreadMessage } from '../../../services/contentSyncTypes';
import { PROF_SYNC_OPEN_EVENT, PROF_SYNC_UPDATED_EVENT, profSyncStatus, refreshProfSync, shouldAlert, snoozeProposal } from '../../../services/profSyncService';
import { refreshContentOverrides } from '../../../services/contentOverrides';
import LoadingSpinner from '../../UI/LoadingSpinner';

interface ProfSyncCenterProps { onContentApplied: () => void }

export default function ProfSyncCenter({ onContentApplied }: ProfSyncCenterProps) {
  const initialStatus = profSyncStatus();
  const [status, setStatus] = useState<SyncStatus>(initialStatus);
  const [alertProposal, setAlertProposal] = useState<Proposal | null>(() => shouldAlert(initialStatus) ? initialStatus.lastProposal : null);
  const [open, setOpen] = useState(false);
  const [inbox, setInbox] = useState<SyncInbox>({ proposals: [], messages: [], tree: EMPTY_TREE, frozenAt: 0 });
  const [activeProposalId, setActiveProposalId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [reply, setReply] = useState('');
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [conflictsOnly, setConflictsOnly] = useState(false);
  const deferredQuery = useDeferredValue(query);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const next = await profContentService.fetchSyncInbox();
      setInbox(next);
      await profContentService.markThreadRead();
      void refreshProfSync();
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Mises à jour indisponibles');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    const updated = (event: Event) => {
      const next = (event as CustomEvent<{ status?: SyncStatus }>).detail?.status || profSyncStatus();
      setStatus(next);
      if (shouldAlert(next) && next.lastProposal) setAlertProposal(next.lastProposal);
    };
    const requested = () => {
      setActiveProposalId(null);
      setSelected(new Set());
      setOpen(true);
      void load();
    };
    window.addEventListener(PROF_SYNC_UPDATED_EVENT, updated);
    window.addEventListener(PROF_SYNC_OPEN_EVENT, requested);
    return () => {
      window.removeEventListener(PROF_SYNC_UPDATED_EVENT, updated);
      window.removeEventListener(PROF_SYNC_OPEN_EVENT, requested);
    };
  }, [load]);

  useEffect(() => {
    if (!open) return;
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [open]);

  const pending = inbox.proposals.filter(item => item.status === 'pending');
  const activeProposal = pending.find(item => item.id === activeProposalId) || null;
  const proposalTree = activeProposal ? treeFromProposal(activeProposal) : EMPTY_TREE;
  const shownTree = activeProposal ? proposalTree : inbox.tree;
  const visibleTree = filterCandidateTree(shownTree, { query: deferredQuery, conflictsOnly });
  const shownEntries = visibleTree.classes.flatMap(item => item.chapters.flatMap(chapter => chapter.entries));
  const selectedEntries = shownEntries.filter(item => selected.has(item.path));
  const conflicts = selectedEntries.filter(item => item.conflict).length;

  const examine = (proposal: Proposal) => {
    setAlertProposal(null);
    setActiveProposalId(proposal.id);
    setSelected(new Set(proposal.entries.map(item => item.path)));
    setOpen(true);
    void load();
  };

  const chooseProposal = (proposal: Proposal) => {
    setActiveProposalId(proposal.id);
    setSelected(new Set(proposal.entries.map(item => item.path)));
  };

  const apply = async () => {
    if (!selected.size) return;
    setBusy(true);
    setError(null);
    try {
      await profContentService.applyUpdates(Array.from(selected), activeProposal?.id);
      await refreshContentOverrides();
      onContentApplied();
      setSelected(new Set());
      setActiveProposalId(null);
      await load();
      await refreshProfSync();
    } catch (applyError) {
      setError(applyError instanceof Error ? applyError.message : 'Application impossible');
    } finally { setBusy(false); }
  };

  const decline = async () => {
    if (!activeProposal || !window.confirm(`Refuser la proposition « ${activeProposal.title} » ?`)) return;
    setBusy(true);
    try {
      await profContentService.declineProposal(activeProposal.id);
      setActiveProposalId(null);
      setSelected(new Set());
      await load();
      await refreshProfSync();
    } catch (declineError) {
      setError(declineError instanceof Error ? declineError.message : 'Refus impossible');
    } finally { setBusy(false); }
  };

  const sendMessage = async () => {
    const body = reply.trim();
    if (!body) return;
    setBusy(true);
    try {
      await profContentService.sendProfMessage(body);
      setReply('');
      await load();
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : 'Envoi impossible');
    } finally { setBusy(false); }
  };

  return (
    <div className="prof-console">
      {alertProposal && (
        <div className="fixed inset-x-3 top-4 z-[140] mx-auto max-w-xl rounded-[26px] border border-slate-300 bg-[#f4f5f7] p-5 shadow-[0_28px_80px_-18px_rgba(15,23,42,0.65)] sm:p-6" role="alertdialog" aria-labelledby="prof-sync-alert-title">
          <div className="flex gap-4"><span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-blue-100 text-blue-700"><BellRing size={22} /></span><div className="min-w-0 flex-1"><h2 id="prof-sync-alert-title" className="text-lg font-bold tracking-tight text-slate-900">{alertProposal.title}</h2><p className="mt-2 text-sm leading-6 text-slate-600">{alertProposal.message}</p><div className="mt-4 flex gap-3"><button type="button" onClick={() => examine(alertProposal)} className="prof-button-primary">Examiner</button><button type="button" onClick={() => { snoozeProposal(alertProposal.id); setAlertProposal(null); }} className="prof-button-secondary">Plus tard</button></div></div></div>
        </div>
      )}

      {open && (
        <div className="fixed inset-0 z-[130] flex items-end justify-center bg-slate-950/60 p-0 backdrop-blur-sm sm:items-center sm:p-6" onMouseDown={event => { if (event.currentTarget === event.target) setOpen(false); }}>
          <section role="dialog" aria-modal="true" aria-labelledby="prof-sync-title" className="flex max-h-[92dvh] w-full max-w-4xl flex-col overflow-hidden rounded-t-[30px] border border-slate-300 bg-[#eef0f3] shadow-[0_34px_100px_-20px_rgba(15,23,42,0.65)] overscroll-contain sm:rounded-[30px]">
            <div className="mx-auto mt-2.5 h-1 w-10 shrink-0 rounded-full bg-slate-400/60 sm:hidden" />
            <header className="flex items-center gap-4 border-b border-slate-200 bg-white px-5 py-4 sm:px-7 sm:py-5">
              <span className="grid h-12 w-12 place-items-center rounded-2xl bg-blue-100 text-blue-700"><RefreshCw size={21} /></span>
              <div className="min-w-0 flex-1"><h2 id="prof-sync-title" className="text-xl font-bold tracking-tight text-slate-900">Centre de mise à jour</h2><p className="mt-1 text-sm text-slate-500">Vous décidez de chaque contenu ajouté ou remplacé.</p></div>
              {(status.pending > 0 || status.unread > 0) && <span className="prof-chip prof-chip-gold">{status.pending} en attente · {status.unread} message(s)</span>}
              <button type="button" onClick={() => setOpen(false)} className="prof-button-ghost" aria-label="Fermer"><X size={17} /></button>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-7">
              {error && <p role="alert" className="mb-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-800">{error}</p>}
              {loading ? <LoadingSpinner variant="section" label="Chargement des mises à jour…" audience="professor" /> : (
                <div className="space-y-4">
                  {pending.length > 0 && <section className="prof-panel rounded-2xl p-4 sm:p-5"><h3 className="text-base font-bold text-slate-900">Propositions de l’administration</h3><div className="mt-3 flex gap-3 overflow-x-auto">{pending.map(proposal => <button key={proposal.id} type="button" onClick={() => chooseProposal(proposal)} className={`min-w-64 rounded-2xl border p-4 text-left ${activeProposalId === proposal.id ? 'border-blue-400 bg-blue-50' : 'border-slate-300 bg-white hover:border-blue-300'}`}><p className="truncate text-base font-bold text-slate-900">{proposal.title}</p><p className="mt-2 line-clamp-2 text-sm leading-6 text-slate-600">{proposal.message}</p><p className="mt-3 text-xs font-semibold text-blue-700">{proposal.entries.length} ressource(s)</p></button>)}</div></section>}

                  <section className="prof-panel rounded-2xl p-4 sm:p-6">
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><div><h3 className="prof-section-title">{activeProposal ? activeProposal.title : 'Mises à jour disponibles'}</h3><p className="prof-meta mt-1">{activeProposal ? activeProposal.message : 'Contenus officiels publiés depuis l’activation de votre badge.'}</p></div><button type="button" onClick={() => { setActiveProposalId(null); setSelected(new Set()); }} className="prof-button-secondary">Voir toutes</button></div>
                    <div className="mb-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
                      <label className="relative block"><Search size={17} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Rechercher dans les mises à jour…" className="prof-input w-full py-2 pl-10 pr-3 text-sm" /></label>
                      <button type="button" aria-pressed={conflictsOnly} onClick={() => setConflictsOnly(value => !value)} className={`rounded-xl border px-3 py-2 text-xs font-bold ${conflictsOnly ? 'border-amber-300 bg-amber-100 text-amber-900' : 'border-slate-200 bg-white text-slate-600'}`}>Remplacements seulement</button>
                    </div>
                    <div className="mb-3 flex items-center justify-between"><span className="text-sm font-medium text-slate-600">{visibleTree.total} résultat(s) · {selected.size} sélectionnée(s)</span><button type="button" onClick={() => setSelected(new Set([...selected, ...shownEntries.map(item => item.path)]))} className="text-sm font-semibold text-blue-700">Sélectionner les résultats</button></div>
                    <CandidateTreePicker tree={visibleTree} selected={selected} onSelectedChange={setSelected} />
                    {conflicts > 0 && <div className="mt-4 flex gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-semibold leading-6 text-amber-900"><AlertTriangle size={19} className="mt-0.5 shrink-0" /><span>{conflicts} fichier{conflicts > 1 ? 's que vous avez modifiés seront remplacés' : ' que vous avez modifié sera remplacé'} — restaurable{conflicts > 1 ? 's' : ''} depuis l’historique.</span></div>}
                    <div className="mt-3 flex flex-wrap justify-end gap-2">{activeProposal && <button type="button" disabled={busy} onClick={() => void decline()} className="prof-button-danger">Refuser</button>}<button type="button" disabled={busy || !selected.size} onClick={() => void apply()} className="prof-button-primary"><CheckCircle2 size={15} />{busy ? 'Application…' : 'Appliquer la sélection'}</button></div>
                  </section>

                  <section className="prof-panel rounded-2xl p-4 sm:p-6"><div className="flex items-center gap-3"><MessageCircle size={19} className="text-blue-700" /><h3 className="text-base font-bold text-slate-900">Messages avec l’administration</h3></div><div className="mt-4 max-h-64 space-y-3 overflow-y-auto rounded-2xl bg-slate-100 p-4">{!inbox.messages.length && <p className="py-8 text-center text-sm text-slate-500">Aucun message.</p>}{inbox.messages.map(item => <MessageBubble key={item.id} message={item} />)}</div><div className="mt-4 flex gap-3"><textarea value={reply} onChange={event => setReply(event.target.value)} rows={3} placeholder="Répondre à l’administration…" className="prof-input min-w-0 flex-1 resize-none px-4 py-3 text-base" /><button type="button" disabled={busy || !reply.trim()} onClick={() => void sendMessage()} className="prof-button-primary" aria-label="Envoyer"><Send size={18} /></button></div></section>
                </div>
              )}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

function MessageBubble({ message }: { message: ThreadMessage }) {
  const own = message.from === 'prof';
  return <div className={`flex ${own ? 'justify-end' : 'justify-start'}`}><div className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-6 ${own ? 'bg-blue-600 text-white' : 'border border-slate-200 bg-white text-slate-800'}`}><p className="whitespace-pre-wrap">{message.body}</p><p className={`mt-1 text-xs ${own ? 'text-blue-100' : 'text-slate-500'}`}>{new Date(message.at).toLocaleString('fr-FR')}</p></div></div>;
}

function treeFromProposal(proposal: Proposal): CandidateTree {
  const classes = new Map<string, Map<string, Proposal['entries']>>();
  for (const entry of proposal.entries) {
    const chapters = classes.get(entry.classId) || new Map<string, Proposal['entries']>();
    const entries = chapters.get(entry.chapterId) || [];
    entries.push(entry);
    chapters.set(entry.chapterId, entries);
    classes.set(entry.classId, chapters);
  }
  return {
    classes: Array.from(classes, ([classId, chapters]) => ({ classId, classTitle: classId, chapters: Array.from(chapters, ([chapterId, entries]) => ({ chapterId, chapterTitle: chapterId || 'Sommaires', entries: entries.map(entry => ({ ...entry, version: 0 })) })) })),
    total: proposal.entries.length,
    conflicts: proposal.entries.filter(entry => entry.conflict).length,
  };
}
