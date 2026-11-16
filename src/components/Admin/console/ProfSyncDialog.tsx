import { Download, MessageCircle, PackageCheck, RefreshCw, Search, Send, X } from 'lucide-react';
import { useCallback, useDeferredValue, useEffect, useMemo, useState } from 'react';
import { adminService, type AdminUser } from '../../../services/adminService';
import { EMPTY_TREE, filterCandidateTree, KIND_LABELS, KIND_ORDER, PROPOSAL_STATUS_LABELS, treeEntries, type CandidateTree, type ContentKind, type Proposal, type ThreadMessage } from '../../../services/contentSyncTypes';
import CandidateTreePicker from '../../ContentSync/CandidateTreePicker';
import AdminModalFrame from './AdminModalFrame';

type Tab = 'content' | 'messages' | 'backup';

interface ProfSyncDialogProps {
  target: AdminUser;
  onClose: () => void;
  onChanged: () => void;
  onError: (message: string) => void;
}

export default function ProfSyncDialog({ target, onClose, onChanged, onError }: ProfSyncDialogProps) {
  const [tab, setTab] = useState<Tab>('content');
  const [tree, setTree] = useState<CandidateTree>(EMPTY_TREE);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [messages, setMessages] = useState<ThreadMessage[]>([]);
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [reply, setReply] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState('');
  const [kindFilter, setKindFilter] = useState<'all' | ContentKind>('all');
  const [conflictsOnly, setConflictsOnly] = useState(false);
  const [selectedOnly, setSelectedOnly] = useState(false);
  const deferredQuery = useDeferredValue(query);

  const load = useCallback(async () => {
    try {
      const [preview, history, thread] = await Promise.all([
        adminService.previewProfPush(target.accountId),
        adminService.listProfPushes(target.accountId),
        adminService.fetchProfThread(target.accountId),
      ]);
      setTree(preview.tree);
      setProposals(history.proposals);
      setMessages(thread);
      onChanged();
    } catch (error) {
      onError(error instanceof Error ? error.message : 'Synchronisation indisponible');
    } finally {
      setLoading(false);
    }
  }, [target.accountId, onChanged, onError]);

  useEffect(() => {
    let active = true;
    void Promise.all([
      adminService.previewProfPush(target.accountId),
      adminService.listProfPushes(target.accountId),
      adminService.fetchProfThread(target.accountId),
    ]).then(([preview, history, thread]) => {
      if (!active) return;
      setTree(preview.tree);
      setProposals(history.proposals);
      setMessages(thread);
      onChanged();
    }).catch(error => {
      if (active) onError(error instanceof Error ? error.message : 'Synchronisation indisponible');
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [target.accountId, onChanged, onError]);

  const entries = useMemo(() => treeEntries(tree).filter(entry => selected.has(entry.path)), [tree, selected]);
  const conflicts = entries.filter(entry => entry.conflict).length;
  const visibleTree = useMemo(() => filterCandidateTree(tree, {
    query: deferredQuery,
    kind: kindFilter,
    conflictsOnly,
    selectedOnly,
    selected,
  }), [tree, deferredQuery, kindFilter, conflictsOnly, selectedOnly, selected]);
  const visiblePaths = useMemo(() => treeEntries(visibleTree).map(entry => entry.path), [visibleTree]);

  const updateSelected = (next: Set<string>) => {
    setSelected(next);
    const nextEntries = treeEntries(tree).filter(entry => next.has(entry.path));
    if (!nextEntries.length) {
      setTitle('');
      setMessage('');
      return;
    }
    const nextConflicts = nextEntries.filter(entry => entry.conflict).length;
    const classes = Array.from(new Set(nextEntries.map(entry => tree.classes.find(item => item.classId === entry.classId)?.classTitle || entry.classId)));
    setTitle(`Mise à jour de contenu — ${classes.join(', ')}`);
    setMessage(`${nextEntries.length} ressource${nextEntries.length > 1 ? 's sont' : ' est'} disponible${nextEntries.length > 1 ? 's' : ''}${nextConflicts ? `, dont ${nextConflicts} remplacera${nextConflicts > 1 ? 'ont' : ''} une version existante` : ''}. Vous pouvez examiner puis appliquer la sélection.`);
  };

  const sendProposal = async () => {
    if (!selected.size) return;
    setBusy(true);
    try {
      await adminService.sendProfPush({ accountId: target.accountId, paths: Array.from(selected), title, message });
      setSelected(new Set());
      await load();
      setTab('backup');
      onChanged();
    } catch (error) {
      onError(error instanceof Error ? error.message : 'Envoi impossible');
    } finally { setBusy(false); }
  };

  const sendMessage = async () => {
    const body = reply.trim();
    if (!body) return;
    setBusy(true);
    try {
      await adminService.sendAdminMessage(target.accountId, body);
      setReply('');
      setMessages(await adminService.fetchProfThread(target.accountId));
      onChanged();
    } catch (error) {
      onError(error instanceof Error ? error.message : 'Envoi impossible');
    } finally { setBusy(false); }
  };

  const download = async () => {
    setBusy(true);
    try {
      const exported = await adminService.exportProfContent(target.accountId);
      const blob = new Blob([JSON.stringify({ exportedAt: exported.exportedAt, files: exported.files }, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `mathplus-${slug(target.name)}-${new Date(exported.exportedAt).toISOString().slice(0, 10)}.json`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      onError(error instanceof Error ? error.message : 'Export impossible');
    } finally { setBusy(false); }
  };

  const cancel = async (proposal: Proposal) => {
    if (!window.confirm(`Annuler la proposition « ${proposal.title} » ?`)) return;
    setBusy(true);
    try {
      await adminService.cancelProfPush(target.accountId, proposal.id);
      await load();
      onChanged();
    } catch (error) {
      onError(error instanceof Error ? error.message : 'Annulation impossible');
    } finally { setBusy(false); }
  };

  const titleId = 'admin-prof-sync-title';
  return (
    <AdminModalFrame labelledBy={titleId} onClose={onClose} width="xl">
      <div className="flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <span className="grid h-12 w-12 place-items-center rounded-2xl bg-emerald-100 text-emerald-800"><PackageCheck size={22} /></span>
        <div className="min-w-0 flex-1"><h2 id={titleId} className="truncate text-xl font-bold tracking-tight">Contenu de {target.name}</h2><p className="mt-1 text-sm text-slate-500">Livraison volontaire, messages et sauvegarde</p></div>
        <button type="button" onClick={() => void load()} className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 hover:bg-slate-50" aria-label="Actualiser"><RefreshCw size={15} /></button>
        <button type="button" onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 hover:bg-slate-50" aria-label="Fermer"><X size={16} /></button>
      </div>

      <div className="mt-5 grid grid-cols-3 gap-2 rounded-2xl border border-slate-200 bg-slate-200/70 p-2" role="tablist">
        {([['content', 'Contenu'], ['messages', `Messages${messages.some(item => item.from === 'prof' && !item.readAt) ? ' •' : ''}`], ['backup', 'Sauvegarde']] as const).map(([id, label]) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)} className={`rounded-xl px-4 py-3 text-sm font-semibold transition ${tab === id ? 'bg-white text-emerald-700 shadow-sm ring-1 ring-slate-200' : 'text-slate-600 hover:bg-white/60 hover:text-slate-900'}`}>{label}</button>
        ))}
      </div>

      <div className="mt-5 min-h-72 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
        {loading ? <p className="py-16 text-center text-base text-slate-500">Chargement…</p> : tab === 'content' ? (
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
            <div className="min-w-0">
              <div className="sticky top-0 z-10 mb-4 space-y-3 rounded-2xl border border-slate-200 bg-white/95 p-3 shadow-sm backdrop-blur sm:p-4">
                <label className="relative block">
                  <Search size={18} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input value={query} onChange={event => setQuery(event.target.value)} placeholder="Rechercher une classe, un chapitre ou une ressource…" className="w-full rounded-xl border border-slate-300 bg-slate-50 py-3 pl-11 pr-10 text-sm outline-none focus:border-emerald-500 focus:bg-white" />
                  {query && <button type="button" onClick={() => setQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700" aria-label="Effacer la recherche"><X size={16} /></button>}
                </label>
                <div className="flex gap-2 overflow-x-auto pb-1">
                  <FilterChip active={kindFilter === 'all'} onClick={() => setKindFilter('all')}>Tous</FilterChip>
                  {KIND_ORDER.map(kind => <FilterChip key={kind} active={kindFilter === kind} onClick={() => setKindFilter(kind)}>{KIND_LABELS[kind]}</FilterChip>)}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <FilterChip active={conflictsOnly} onClick={() => setConflictsOnly(value => !value)}>Déjà présents</FilterChip>
                  <FilterChip active={selectedOnly} onClick={() => setSelectedOnly(value => !value)}>Sélectionnés</FilterChip>
                  <span className="ml-auto text-xs font-semibold text-slate-500">{visibleTree.total} résultat(s) · {selected.size} sélectionné(s)</span>
                </div>
                <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-3">
                  <button type="button" disabled={!visiblePaths.length} onClick={() => updateSelected(new Set([...selected, ...visiblePaths]))} className="rounded-lg bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-800 hover:bg-emerald-100 disabled:opacity-40">Sélectionner les résultats</button>
                  <button type="button" disabled={!visiblePaths.length} onClick={() => { const next = new Set(selected); visiblePaths.forEach(path => next.has(path) ? next.delete(path) : next.add(path)); updateSelected(next); }} className="rounded-lg bg-slate-100 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-200 disabled:opacity-40">Inverser</button>
                  <button type="button" disabled={!selected.size} onClick={() => updateSelected(new Set())} className="rounded-lg px-3 py-2 text-xs font-bold text-red-600 hover:bg-red-50 disabled:opacity-40">Tout effacer</button>
                </div>
              </div>
              <CandidateTreePicker tree={visibleTree} selected={selected} onSelectedChange={updateSelected} />
            </div>

            <aside className="h-fit rounded-2xl border border-slate-200 bg-slate-50 p-4 lg:sticky lg:top-0">
              <div className="grid grid-cols-3 gap-2">
                <SummaryMetric label="Choisis" value={selected.size} />
                <SummaryMetric label="Nouveaux" value={Math.max(0, selected.size - conflicts)} />
                <SummaryMetric label="Remplacés" value={conflicts} warning={conflicts > 0} />
              </div>
              {conflicts > 0 && <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-3 text-xs font-semibold leading-5 text-amber-900">Les anciennes versions resteront restaurables depuis l’historique du professeur.</p>}
              <label className="mt-5 block text-xs font-bold uppercase tracking-wide text-slate-500">Titre<input value={title} onChange={event => setTitle(event.target.value)} maxLength={120} className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-sm font-medium normal-case tracking-normal text-slate-900 outline-none focus:border-emerald-500" /></label>
              <label className="mt-4 block text-xs font-bold uppercase tracking-wide text-slate-500">Message<textarea value={message} onChange={event => setMessage(event.target.value)} maxLength={1200} rows={7} className="mt-2 w-full resize-none rounded-xl border border-slate-300 bg-white px-3 py-3 text-sm font-medium normal-case tracking-normal text-slate-900 outline-none focus:border-emerald-500" /></label>
              <button type="button" disabled={busy || !selected.size} onClick={() => void sendProposal()} className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 py-3.5 text-sm font-bold text-white shadow-sm hover:bg-emerald-500 disabled:opacity-40"><Send size={17} />{busy ? 'Envoi…' : `Envoyer ${selected.size || ''} ressource${selected.size > 1 ? 's' : ''}`}</button>
            </aside>
          </div>
        ) : tab === 'messages' ? (
          <div>
            <div className="max-h-80 space-y-3 overflow-y-auto rounded-2xl border border-slate-200 bg-slate-100 p-4">
              {!messages.length && <p className="py-10 text-center text-sm text-slate-500">Aucun message.</p>}
              {messages.map(item => <MessageBubble key={item.id} message={item} admin />)}
            </div>
            <div className="mt-4 flex gap-3"><textarea value={reply} onChange={event => setReply(event.target.value)} rows={3} placeholder="Écrire au professeur…" className="min-w-0 flex-1 resize-none rounded-xl border border-slate-300 bg-slate-50 px-4 py-3 text-base outline-none focus:border-emerald-500 focus:bg-white" /><button type="button" disabled={busy || !reply.trim()} onClick={() => void sendMessage()} className="grid w-12 place-items-center rounded-xl bg-emerald-600 text-white shadow-sm disabled:opacity-40" aria-label="Envoyer"><MessageCircle size={19} /></button></div>
          </div>
        ) : (
          <div>
            <button type="button" disabled={busy} onClick={() => void download()} className="inline-flex w-full items-center justify-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm font-bold text-emerald-800 hover:bg-emerald-100"><Download size={19} /> Télécharger tout le contenu JSON du professeur</button>
            <h3 className="mb-3 mt-6 text-sm font-bold uppercase tracking-wide text-slate-500">Historique des envois</h3>
            <div className="max-h-64 space-y-2 overflow-y-auto">
              {!proposals.length && <p className="rounded-2xl border border-dashed border-slate-300 py-10 text-center text-sm text-slate-500">Aucun envoi.</p>}
              {proposals.map(proposal => <div key={proposal.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4"><div className="flex items-start gap-3"><div className="min-w-0 flex-1"><p className="truncate text-base font-bold text-slate-800">{proposal.title}</p><p className="mt-1 text-sm text-slate-500">{new Date(proposal.at).toLocaleString('fr-FR')} · {proposal.entries.length} fichier(s)</p></div><span className={`rounded-full px-3 py-1 text-xs font-bold ${proposal.status === 'pending' ? 'bg-amber-100 text-amber-800' : proposal.status === 'declined' ? 'bg-red-100 text-red-800' : 'bg-emerald-100 text-emerald-800'}`}>{PROPOSAL_STATUS_LABELS[proposal.status]}{proposal.status === 'partial' ? ` (${proposal.applied?.length || 0}/${proposal.entries.length})` : ''}</span></div>{proposal.status === 'pending' && <button type="button" disabled={busy} onClick={() => void cancel(proposal)} className="mt-3 text-sm font-semibold text-red-600 hover:underline">Annuler la proposition</button>}</div>)}
            </div>
          </div>
        )}
      </div>
    </AdminModalFrame>
  );
}

function MessageBubble({ message, admin }: { message: ThreadMessage; admin: boolean }) {
  const own = admin ? message.from === 'admin' : message.from === 'prof';
  return <div className={`flex ${own ? 'justify-end' : 'justify-start'}`}><div className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-6 ${own ? 'bg-emerald-600 text-white' : 'border border-slate-200 bg-white text-slate-800'}`}><p className="whitespace-pre-wrap">{message.body}</p><p className={`mt-1 text-xs ${own ? 'text-emerald-100' : 'text-slate-500'}`}>{new Date(message.at).toLocaleString('fr-FR')}</p></div></div>;
}

function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: string }) {
  return <button type="button" aria-pressed={active} onClick={onClick} className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold transition ${active ? 'border-emerald-300 bg-emerald-100 text-emerald-900' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-100'}`}>{children}</button>;
}

function SummaryMetric({ label, value, warning = false }: { label: string; value: number; warning?: boolean }) {
  return <div className={`rounded-xl border px-2 py-3 text-center ${warning ? 'border-amber-200 bg-amber-50' : 'border-slate-200 bg-white'}`}><p className={`text-lg font-black ${warning ? 'text-amber-800' : 'text-slate-900'}`}>{value}</p><p className="mt-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-500">{label}</p></div>;
}

function slug(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'professeur';
}
