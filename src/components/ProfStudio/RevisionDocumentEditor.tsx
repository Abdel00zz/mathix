import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { RevisionBlock, RevisionSection, RevisionSheet } from '../../types';
import { normalizeBlockType } from '../Revision/courseBlock/blockUtils';
import { EditableText, MediaEditor } from './editable';
import CelaPermetDeBlock from '../Revision/courseBlock/CelaPermetDeBlock';
import { PALETTE_GROUPS, GROUP_LABEL, revisionPalette, revisionPaletteEntry, type PaletteGroup } from './revisionPalette';
import { ChevronDown, ChevronUp, GripVertical, Plus, Redo2, Search, Trash2, Undo2, X } from 'lucide-react';

type RevisionBlockType = RevisionBlock['type'];

// ── Palette des types de blocs ───────────────────────────────────────
// Définie dans `revisionPalette.ts`, adossée à la taxonomie partagée : un type
// ajouté au moteur apparaît ici automatiquement. Ce composant ne conserve que
// le rendu du menu.
const TYPE_PALETTE = revisionPalette;
const TYPE_LABEL: Record<string, string> = Object.fromEntries(TYPE_PALETTE.map(t => [t.type, t.label]));
const GROUP_ORDER = PALETTE_GROUPS;

/** Accents chromatiques iOS 18 par famille pédagogique de bloc. */
const GROUP_BADGE_STYLE: Record<PaletteGroup, { pill: string; num: string; dot: string; focusRing: string }> = {
  structure: {
    pill: 'border-slate-200/90 bg-slate-100/85 text-slate-700 hover:border-slate-300 hover:bg-slate-200/70',
    num: 'text-slate-400',
    dot: 'bg-slate-400',
    focusRing: 'focus-within:border-slate-300/90 focus-within:ring-slate-400/15',
  },
  cours: {
    pill: 'border-indigo-200/80 bg-indigo-50/90 text-indigo-700 hover:border-indigo-300 hover:bg-indigo-100/75',
    num: 'text-indigo-400',
    dot: 'bg-indigo-500',
    focusRing: 'focus-within:border-indigo-300/90 focus-within:ring-indigo-500/12',
  },
  pratique: {
    pill: 'border-emerald-200/80 bg-emerald-50/90 text-emerald-700 hover:border-emerald-300 hover:bg-emerald-100/75',
    num: 'text-emerald-500',
    dot: 'bg-emerald-500',
    focusRing: 'focus-within:border-emerald-300/90 focus-within:ring-emerald-500/12',
  },
  aide: {
    pill: 'border-amber-200/85 bg-amber-50/90 text-amber-800 hover:border-amber-300 hover:bg-amber-100/75',
    num: 'text-amber-500',
    dot: 'bg-amber-500',
    focusRing: 'focus-within:border-amber-300/90 focus-within:ring-amber-500/12',
  },
};

function clone(sheet: RevisionSheet): RevisionSheet {
  return JSON.parse(JSON.stringify(sheet)) as RevisionSheet;
}

function emptyBlock(type: RevisionBlockType): RevisionBlock {
  if (type === 'cela_permet_de') return { type, content: [''] };
  return { type, content: '' };
}

function toText(content: string | string[]): string {
  return Array.isArray(content) ? content.join('\\par\n') : (content ?? '');
}

function toContent(original: string | string[], next: string): string | string[] {
  return Array.isArray(original) ? [next] : next;
}

function alphabeticIndex(index: number): string {
  let value = Math.max(1, index);
  let label = '';
  while (value > 0) {
    value -= 1;
    label = String.fromCharCode(65 + (value % 26)) + label;
    value = Math.floor(value / 26);
  }
  return label;
}

/** Menu flottant de choix de type (groupé), défilant et animé. */
function TypeMenu({ onPick, onClose, align = 'left' }: { onPick: (t: RevisionBlockType) => void; onClose: () => void; align?: 'left' | 'right' }) {
  return (
    <>
      <div className="fixed inset-0 z-30" onClick={onClose} />
      <div className={`studio-type-menu absolute top-full z-40 mt-1.5 w-64 overflow-hidden rounded-2xl border border-slate-200/90 bg-white/95 shadow-[0_22px_50px_-14px_rgba(15,23,42,0.26)] backdrop-blur-xl ${align === 'right' ? 'right-0' : 'left-0'}`}>
        <div className="studio-type-menu-scroll max-h-[320px] overflow-y-auto p-1.5">
          {GROUP_ORDER.map(group => {
            const accent = GROUP_BADGE_STYLE[group];
            return (
              <div key={group} className="mb-1.5 last:mb-0">
                <p className="sticky top-0 z-10 -mx-1.5 -mt-1.5 mb-0.5 flex items-center gap-1.5 bg-white/95 px-3 py-1.5 text-[9px] font-bold uppercase tracking-[0.14em] text-slate-400 backdrop-blur">
                  <span className={`h-1.5 w-1.5 rounded-full ${accent.dot}`} aria-hidden="true" />
                  {GROUP_LABEL[group]}
                </p>
                {TYPE_PALETTE.filter(t => t.group === group).map(t => (
                  <button
                    key={t.type}
                    type="button"
                    onClick={() => { onPick(t.type); onClose(); }}
                    className="flex w-full items-center gap-2 rounded-xl px-2.5 py-1.5 text-left text-[12.5px] font-medium text-slate-700 transition-colors duration-100 hover:bg-indigo-50/90 hover:text-indigo-700"
                  >
                    <span className={`h-1.5 w-1.5 shrink-0 rounded-full opacity-65 ${accent.dot}`} aria-hidden="true" />
                    {t.label}
                  </button>
                ))}
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}

function BlockView({ block, number, index, total, dragging, dropEdge, insertMenuOpen, onPatch, onRemove, onChangeType, onMove, onToggleInsert, onPickInsert, onCloseInsert, onDragStart, onDragOver, onDrop, onDragEnd }: {
  block: RevisionBlock;
  number: number | null;
  index: number;
  total: number;
  dragging: boolean;
  dropEdge: 'before' | 'after' | null;
  insertMenuOpen: boolean;
  onPatch: (updates: Partial<RevisionBlock>) => void;
  onRemove: () => void;
  onChangeType: (t: RevisionBlockType) => void;
  onMove: (dir: -1 | 1) => void;
  onToggleInsert: () => void;
  onPickInsert: (t: RevisionBlockType) => void;
  onCloseInsert: () => void;
  onDragStart: (e: React.DragEvent) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
  onDragEnd: () => void;
}) {
  const [typeMenuOpen, setTypeMenuOpen] = useState(false);
  const normalized = normalizeBlockType(block.type);
  const entry = revisionPaletteEntry(normalized);
  const group: PaletteGroup = entry?.group || 'cours';
  const badgeStyle = GROUP_BADGE_STYLE[group];
  const label = TYPE_LABEL[normalized] || normalized;
  const isPurpose = normalized === 'cela_permet_de';
  const purposeItems = Array.isArray(block.content) ? block.content : [block.content];

  return (
    <div
      className={`group relative rounded-2xl border px-2.5 py-2.5 transition-all duration-200 ease-out sm:flex sm:items-start sm:gap-2.5 sm:px-3.5 lg:gap-4 lg:px-4 lg:py-3 ${
        dragging
          ? 'scale-[0.985] border-indigo-300/80 bg-indigo-50/40 opacity-50 shadow-inner ring-2 ring-indigo-400/25'
          : dropEdge
            ? 'border-indigo-300/90 bg-indigo-50/45 shadow-[0_10px_28px_-14px_rgba(79,70,229,0.2)]'
            : `border-slate-200/60 bg-white/95 shadow-[0_1px_2px_rgba(15,23,42,0.02)] hover:border-slate-300/85 hover:bg-white hover:shadow-[0_10px_26px_-14px_rgba(15,23,42,0.1)] focus-within:bg-white focus-within:shadow-[0_14px_34px_-12px_rgba(79,70,229,0.15)] focus-within:ring-3 ${badgeStyle.focusRing}`
      }`}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      {/* Indicateur lumineux d'insertion style iOS 18 */}
      {dropEdge && (
        <div
          aria-hidden="true"
          className={`pointer-events-none absolute inset-x-3 z-20 flex items-center ${dropEdge === 'after' ? '-bottom-[5px]' : '-top-[5px]'}`}
        >
          <span className="h-2.5 w-2.5 -ml-1 rounded-full border-2 border-white bg-indigo-600 shadow-[0_0_10px_rgba(79,70,229,0.75)]" />
          <span className="h-[2.5px] flex-1 rounded-full bg-gradient-to-r from-indigo-600 via-violet-500 to-sky-400 shadow-[0_0_12px_rgba(99,102,241,0.6)]" />
        </div>
      )}

      <div className="mb-2 flex items-center gap-1.5 sm:mb-0 sm:pt-0.5">
        {/* Poignée de glisser-déposer tactile & fluide */}
        <button
          type="button"
          draggable
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
          className="grid h-8 w-7 shrink-0 cursor-grab place-items-center rounded-xl text-slate-300 transition-all hover:bg-slate-100/90 hover:text-indigo-600 active:scale-95 active:cursor-grabbing"
          title="Glisser pour déplacer ce bloc"
          aria-label="Glisser pour déplacer le bloc"
        >
          <GripVertical size={15} />
        </button>

        {/* Libellé de type chromatique + menu au clic */}
        <div className="relative shrink-0">
          <button
            type="button"
            onClick={() => setTypeMenuOpen(v => !v)}
            className={`inline-flex h-8 min-w-[114px] items-center justify-between gap-2 rounded-xl border px-2.5 text-[11px] font-bold shadow-2xs transition-all active:scale-[0.98] xl:min-w-[126px] ${badgeStyle.pill}`}
            title="Changer le type du bloc"
          >
            <span className="flex items-center gap-1.5 truncate">
              <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${badgeStyle.dot}`} aria-hidden="true" />
              <span className="truncate">{label}</span>
            </span>
            {number !== null && !isPurpose && <span className={`font-mono text-[10px] font-semibold ${badgeStyle.num}`}>{number}</span>}
          </button>
          {typeMenuOpen && <TypeMenu onPick={onChangeType} onClose={() => setTypeMenuOpen(false)} />}
        </div>
      </div>

      {/* Contenu : clic simple pour éditer, placeholder si vide */}
      <div className="min-w-0 flex-1 sm:py-1">
        {block.title !== undefined && !isPurpose && (
          <div className="mb-1 font-serif text-[15px] font-semibold leading-snug text-slate-950">
            <EditableText inline content={block.title || ''} onChange={title => onPatch({ title })} onDelete={() => onPatch({ title: undefined })} placeholder="Titre…" activate="click" />
          </div>
        )}
        <div className="font-serif text-[15.5px] leading-[1.72] text-slate-800 antialiased lg:text-[16px] lg:leading-[1.75]">
          {isPurpose ? (
            <CelaPermetDeBlock content={purposeItems} renderItem={(item, idx) => (
              <EditableText
                content={item}
                onChange={text => onPatch({ content: purposeItems.map((value, i) => i === idx ? text : value) })}
                onDelete={() => onPatch({ content: purposeItems.filter((_, i) => i !== idx) })}
                placeholder="Déterminer, calculer, reconnaître…"
                activate="click"
              />
            )}>
              <button type="button" className="mt-2 text-[12px] font-semibold text-[#42668f] hover:underline" onClick={() => onPatch({ content: [...purposeItems, ''] })}>
                + Ajouter une compétence
              </button>
            </CelaPermetDeBlock>
          ) : <EditableText
            content={toText(block.content)}
            onChange={text => onPatch({ content: toContent(block.content, text) })}
            onDelete={onRemove}
            placeholder="Écrire le contenu…"
            activate="click"
          />}
        </div>
      </div>

      {/* Barre d'actions iOS capsule, lisible et alignée sur le bloc */}
      <div className="mt-2 flex shrink-0 items-center justify-end gap-1 border-t border-slate-100 pt-2 sm:mt-0 sm:self-start sm:border-0 sm:pt-0.5">
        <div className="inline-flex items-center rounded-full border border-slate-200/85 bg-slate-50/90 p-0.5 shadow-2xs">
          <button
            type="button"
            onClick={() => onMove(-1)}
            disabled={index === 0}
            className="grid h-7 w-7 place-items-center rounded-full text-slate-500 transition-all hover:bg-white hover:text-indigo-600 hover:shadow-2xs active:scale-90 disabled:cursor-not-allowed disabled:opacity-25"
            title="Monter le bloc"
            aria-label="Monter le bloc"
          >
            <ChevronUp size={14} />
          </button>
          <span className="min-w-[22px] text-center font-mono text-[10px] font-bold text-slate-400 select-none" title={`Position ${index + 1} sur ${total}`}>
            {index + 1}
          </span>
          <button
            type="button"
            onClick={() => onMove(1)}
            disabled={index === total - 1}
            className="grid h-7 w-7 place-items-center rounded-full text-slate-500 transition-all hover:bg-white hover:text-indigo-600 hover:shadow-2xs active:scale-90 disabled:cursor-not-allowed disabled:opacity-25"
            title="Descendre le bloc"
            aria-label="Descendre le bloc"
          >
            <ChevronDown size={14} />
          </button>
        </div>

        <div className="relative">
          <button
            type="button"
            onClick={onToggleInsert}
            className={`grid h-8 w-8 place-items-center rounded-xl border transition-all active:scale-95 ${insertMenuOpen ? 'border-indigo-300 bg-indigo-50 text-indigo-700 shadow-2xs' : 'border-slate-200/90 bg-white text-slate-500 hover:border-indigo-200 hover:bg-indigo-50/70 hover:text-indigo-700'}`}
            title="Insérer un bloc après"
            aria-label="Insérer un bloc après"
            aria-expanded={insertMenuOpen}
          >
            <Plus size={15} />
          </button>
          {insertMenuOpen && <TypeMenu align="right" onPick={onPickInsert} onClose={onCloseInsert} />}
        </div>
        <div className="[&>button]:!h-8 [&>button]:!w-8 [&>button]:!rounded-xl">
          <MediaEditor
            iconOnly
            media={block.media}
            blockType={normalized}
            context={toText(block.content)}
            /* Le professeur doit savoir quel encadré il illustre : « propriété 3 »
               plutôt qu'un bouton « Images » anonyme. */
            subject={number ? `${label.toLowerCase()} ${number}` : label.toLowerCase()}
            onChange={media => onPatch({ media })}
          />
        </div>
        <button
          type="button"
          onClick={onRemove}
          className="grid h-8 w-8 place-items-center rounded-xl text-slate-400 transition-all hover:bg-red-50 hover:text-red-600 active:scale-95"
          title="Supprimer"
          aria-label="Supprimer le bloc"
        >
          <Trash2 size={15} />
        </button>
      </div>
    </div>
  );
}

export default function RevisionDocumentEditor({ data, onChange }: { data: RevisionSheet; onChange: (next: RevisionSheet) => void }) {
  // ── Historique (undo / redo) ──
  const pastRef = useRef<RevisionSheet[]>([]);
  const futureRef = useRef<RevisionSheet[]>([]);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const sectionRefs = useRef<Record<number, HTMLElement | null>>({});

  const commit = useCallback((next: RevisionSheet) => {
    pastRef.current.push(data);
    if (pastRef.current.length > 100) pastRef.current.shift();
    futureRef.current = [];
    setCanUndo(true);
    setCanRedo(false);
    onChange(next);
  }, [data, onChange]);

  const undo = useCallback(() => {
    const prev = pastRef.current.pop();
    if (!prev) return;
    futureRef.current.push(data);
    setCanUndo(pastRef.current.length > 0);
    setCanRedo(true);
    onChange(prev);
  }, [data, onChange]);

  const redo = useCallback(() => {
    const next = futureRef.current.pop();
    if (!next) return;
    pastRef.current.push(data);
    setCanUndo(true);
    setCanRedo(futureRef.current.length > 0);
    onChange(next);
  }, [data, onChange]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target;
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || (target instanceof HTMLElement && target.isContentEditable)) return;
      const mod = e.ctrlKey || e.metaKey;
      if (!mod) return;
      if (e.key === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
      else if (e.key === 'y' || (e.key === 'z' && e.shiftKey)) { e.preventDefault(); redo(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo, redo]);

  // ── Numérotation continue par type ──
  const numbering = useMemo(() => {
    const counters: Record<string, number> = {};
    const map = new Map<string, number>();
    data.sections.forEach((section, si) => {
      (section.blocks || []).forEach((block, bi) => {
        const t = normalizeBlockType(block.type);
        counters[t] = (counters[t] || 0) + 1;
        map.set(`${si}:${bi}`, counters[t]);
      });
    });
    return map;
  }, [data]);

  const totalBlocksCount = useMemo(
    () => data.sections.reduce((acc, sec) => acc + (sec.blocks?.length || 0), 0),
    [data.sections],
  );

  const normalizedQuery = searchQuery.trim().toLowerCase();
  const blockMatchesQuery = useCallback((block: RevisionBlock, sectionTitle?: string) => {
    if (!normalizedQuery) return true;
    const normalized = normalizeBlockType(block.type);
    const label = (TYPE_LABEL[normalized] || normalized).toLowerCase();
    const contentText = toText(block.content).toLowerCase();
    const titleText = (block.title || '').toLowerCase();
    const secText = (sectionTitle || '').toLowerCase();
    return label.includes(normalizedQuery)
      || contentText.includes(normalizedQuery)
      || titleText.includes(normalizedQuery)
      || secText.includes(normalizedQuery);
  }, [normalizedQuery]);

  const matchedBlocksCount = useMemo(() => {
    if (!normalizedQuery) return totalBlocksCount;
    return data.sections.reduce(
      (acc, sec) => acc + (sec.blocks || []).filter(b => blockMatchesQuery(b, sec.title)).length,
      0,
    );
  }, [blockMatchesQuery, data.sections, normalizedQuery, totalBlocksCount]);

  const patchBlock = (si: number, bi: number, updates: Partial<RevisionBlock>) => {
    const draft = clone(data);
    const blocks = draft.sections[si].blocks || [];
    blocks[bi] = { ...blocks[bi], ...updates };
    draft.sections[si].blocks = blocks;
    commit(draft);
  };

  const changeBlockType = (si: number, bi: number, type: RevisionBlockType) => {
    const draft = clone(data);
    const blocks = draft.sections[si].blocks || [];
    blocks[bi] = { ...blocks[bi], type };
    draft.sections[si].blocks = blocks;
    commit(draft);
  };

  const removeBlock = (si: number, bi: number) => {
    const draft = clone(data);
    draft.sections[si].blocks = (draft.sections[si].blocks || []).filter((_, i) => i !== bi);
    commit(draft);
  };

  const moveBlock = (si: number, bi: number, dir: -1 | 1) => {
    const draft = clone(data);
    const blocks = draft.sections[si].blocks || [];
    const target = bi + dir;
    if (target < 0 || target >= blocks.length) return;
    [blocks[bi], blocks[target]] = [blocks[target], blocks[bi]];
    draft.sections[si].blocks = blocks;
    commit(draft);
  };

  const moveSection = (si: number, dir: -1 | 1) => {
    const target = si + dir;
    if (target < 0 || target >= data.sections.length) return;
    const draft = clone(data);
    [draft.sections[si], draft.sections[target]] = [draft.sections[target], draft.sections[si]];
    commit(draft);
  };

  const insertBlock = (si: number, type: RevisionBlockType, afterIndex?: number) => {
    const draft = clone(data);
    const section = draft.sections[si];
    const blocks = section.blocks || [];
    const at = afterIndex === undefined ? blocks.length : afterIndex + 1;
    blocks.splice(at, 0, emptyBlock(type));
    section.blocks = blocks;
    commit(draft);
  };

  const updateHeader = (field: 'title' | 'subtitle' | 'context', value: string) => {
    const draft = clone(data);
    draft.header = { ...draft.header, [field]: value };
    commit(draft);
  };

  const updateSection = (si: number, updates: Partial<RevisionSection>) => {
    const draft = clone(data);
    draft.sections[si] = { ...draft.sections[si], ...updates };
    commit(draft);
  };

  const addSection = () => {
    const draft = clone(data);
    draft.sections.push({ id: `section-${draft.sections.length + 1}`, title: 'Nouvelle section', blocks: [emptyBlock('text')] });
    commit(draft);
  };

  const removeSection = (si: number) => {
    const draft = clone(data);
    draft.sections = draft.sections.filter((_, i) => i !== si);
    commit(draft);
  };

  // ── Glisser-déposer haute précision (avant / après le bloc survolé) ──
  const [dragSource, setDragSource] = useState<{ si: number; bi: number } | null>(null);
  const [dropTarget, setDropTarget] = useState<{ si: number; bi: number; edge: 'before' | 'after' } | null>(null);

  const moveBlockTo = (from: { si: number; bi: number }, to: { si: number; bi: number; edge: 'before' | 'after' }) => {
    const draft = clone(data);
    const fromBlocks = draft.sections[from.si]?.blocks || [];
    const [moved] = fromBlocks.splice(from.bi, 1);
    if (!moved) return;
    draft.sections[from.si].blocks = fromBlocks;
    let targetIndex = to.bi + (to.edge === 'after' ? 1 : 0);
    if (from.si === to.si && from.bi < targetIndex) targetIndex -= 1;
    if (from.si === to.si && targetIndex === from.bi) return;
    const toBlocks = draft.sections[to.si]?.blocks || [];
    targetIndex = Math.max(0, Math.min(toBlocks.length, targetIndex));
    toBlocks.splice(targetIndex, 0, moved);
    draft.sections[to.si].blocks = toBlocks;
    commit(draft);
  };

  const handleDragStart = (si: number, bi: number) => (e: React.DragEvent) => {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', `${si}:${bi}`);
    setDragSource({ si, bi });
  };

  const handleDragOver = (si: number, bi: number) => (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const rect = e.currentTarget.getBoundingClientRect();
    const edge: 'before' | 'after' = e.clientY - rect.top > rect.height / 2 ? 'after' : 'before';
    setDropTarget(prev => (prev && prev.si === si && prev.bi === bi && prev.edge === edge ? prev : { si, bi, edge }));
  };

  const handleDrop = (si: number, bi: number) => (e: React.DragEvent) => {
    e.preventDefault();
    if (dragSource && dropTarget) moveBlockTo(dragSource, dropTarget);
    else if (dragSource) moveBlockTo(dragSource, { si, bi, edge: 'before' });
    setDragSource(null);
    setDropTarget(null);
  };

  const handleDragEnd = () => {
    setDragSource(null);
    setDropTarget(null);
  };

  const [insertTarget, setInsertTarget] = useState<{ si: number; afterIndex?: number } | null>(null);

  return (
    <div className="studio-revision-editor relative min-h-0 flex-1 overflow-y-auto bg-[#f8fafc] px-3 pb-8 pt-3 sm:px-5 sm:pb-10 lg:px-8 xl:px-10 2xl:px-12">
      {/* ── Barre supérieure sticky (Recherche + Navigation sections + Undo/Redo) alignée sur la géométrie du document ── */}
      <div className="sticky top-0 z-20 mx-auto mb-5 max-w-[1240px] pt-1">
        <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200/90 bg-white/88 px-3 py-2 shadow-[0_12px_32px_-16px_rgba(15,23,42,0.14)] backdrop-blur-xl sm:px-3.5">
          {/* Champ de recherche instantanée dans la fiche */}
          <label className="relative min-w-[180px] flex-1 sm:max-w-xs">
            <span className="sr-only">Rechercher dans la fiche</span>
            <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden="true" />
            <input
              type="search"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Rechercher un bloc, théorème, texte…"
              className="h-8 w-full rounded-xl border border-slate-200/80 bg-slate-50/80 pl-8 pr-7 text-xs font-medium text-slate-800 outline-none transition-all placeholder:text-slate-400 focus:border-indigo-400 focus:bg-white focus:ring-3 focus:ring-indigo-500/10"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-0.5 text-slate-400 transition hover:bg-slate-200/70 hover:text-slate-700"
                aria-label="Effacer la recherche"
              >
                <X size={12} />
              </button>
            )}
          </label>

          {/* Navigation rapide par section (A, B, C…) */}
          <div className="hidden items-center gap-1 overflow-x-auto md:flex" aria-label="Accès rapide aux sections">
            {data.sections.map((sec, si) => (
              <button
                key={sec.id || si}
                type="button"
                onClick={() => sectionRefs.current[si]?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                title={sec.title || `Section ${alphabeticIndex(si + 1)}`}
                className="inline-flex h-7 items-center gap-1 rounded-lg border border-slate-200/80 bg-slate-50/80 px-2 text-[11px] font-bold text-slate-600 transition hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-700 active:scale-95"
              >
                <span className="text-indigo-600">{alphabeticIndex(si + 1)}</span>
                <span className="max-w-[96px] truncate font-medium text-slate-500">{sec.title}</span>
              </button>
            ))}
          </div>

          <div className="ml-auto flex items-center gap-2">
            <span className="hidden rounded-full border border-slate-200/80 bg-slate-50 px-2.5 py-1 font-mono text-[10px] font-semibold text-slate-500 sm:inline-block">
              {normalizedQuery ? `${matchedBlocksCount}/${totalBlocksCount} bloc(s)` : `${data.sections.length} sect. · ${totalBlocksCount} bloc(s)`}
            </span>

            {/* Capsule Undo / Redo toujours affichée et intégrée à la barre supérieure */}
            <div className="inline-flex items-center rounded-xl border border-slate-200/90 bg-slate-50/90 p-0.5 shadow-2xs" role="group" aria-label="Historique d’édition">
              <button
                type="button"
                onClick={undo}
                disabled={!canUndo}
                className="inline-flex h-7 items-center gap-1 rounded-lg px-2 text-xs font-semibold text-slate-700 transition-all hover:bg-white hover:text-indigo-600 hover:shadow-2xs active:scale-95 disabled:cursor-not-allowed disabled:opacity-35"
                title="Annuler (Ctrl+Z)"
                aria-label="Annuler"
              >
                <Undo2 size={14} />
                <span className="hidden lg:inline text-[11px]">Annuler</span>
              </button>
              <div className="h-4 w-px bg-slate-200/80" aria-hidden="true" />
              <button
                type="button"
                onClick={redo}
                disabled={!canRedo}
                className="inline-flex h-7 items-center gap-1 rounded-lg px-2 text-xs font-semibold text-slate-700 transition-all hover:bg-white hover:text-indigo-600 hover:shadow-2xs active:scale-95 disabled:cursor-not-allowed disabled:opacity-35"
                title="Rétablir (Ctrl+Shift+Z)"
                aria-label="Rétablir"
              >
                <Redo2 size={14} />
                <span className="hidden lg:inline text-[11px]">Rétablir</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-[1240px] space-y-6 pb-12 xl:space-y-7">
        {/* En-tête de la fiche */}
        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_2px_12px_-4px_rgba(15,23,42,0.04)] sm:p-6">
          <div className="font-serif text-[26px] font-semibold leading-[1.18] tracking-[-0.025em] text-slate-950 sm:text-[31px] lg:text-[34px]">
            <EditableText content={data.header?.title || ''} onChange={v => updateHeader('title', v)} placeholder="Titre de la fiche…" activate="click" />
          </div>
          {data.header?.subtitle !== undefined && (
            <div className="mt-2 font-serif text-[15.5px] leading-relaxed text-slate-600">
              <EditableText content={data.header.subtitle} onChange={v => updateHeader('subtitle', v)} onDelete={() => updateHeader('subtitle', '')} placeholder="Sous-titre…" activate="click" />
            </div>
          )}
          {data.header?.context !== undefined && (
            <div className="mt-2 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">
              <EditableText inline content={data.header.context} onChange={v => updateHeader('context', v)} onDelete={() => updateHeader('context', '')} placeholder="Contexte…" activate="click" />
            </div>
          )}
        </div>

        {/* Sections + blocs */}
        {data.sections.map((section, si) => {
          const blocks = section.blocks || [];
          const visibleBlockEntries = blocks
            .map((block, bi) => ({ block, bi }))
            .filter(({ block }) => blockMatchesQuery(block, section.title));

          if (normalizedQuery && visibleBlockEntries.length === 0) return null;

          return (
            <section
              key={section.id || si}
              ref={el => { sectionRefs.current[si] = el; }}
              className="group/section scroll-mt-16 rounded-2xl border border-slate-200/80 bg-white/90 p-3 shadow-[0_4px_20px_-10px_rgba(15,23,42,0.05)] transition-all duration-200 hover:border-slate-300/80 sm:p-4 lg:p-5"
            >
              <div className="mb-3 flex flex-wrap items-center gap-2 border-b border-slate-100 pb-3">
                <span className="grid h-7 min-w-7 shrink-0 place-items-center rounded-xl bg-gradient-to-b from-indigo-500 to-indigo-600 px-2 text-[12px] font-bold text-white shadow-2xs">
                  {alphabeticIndex(si + 1)}
                </span>
                <div className="min-w-0 flex-1 font-serif text-[18px] font-semibold leading-snug tracking-[-0.01em] text-slate-900">
                  <EditableText content={section.title || ''} onChange={title => updateSection(si, { title })} placeholder="Titre de la section…" activate="click" />
                </div>

                {/* Réordonnancement de la section (Monter / Descendre) */}
                <div className="inline-flex items-center rounded-full border border-slate-200/85 bg-slate-50/90 p-0.5">
                  <button
                    type="button"
                    onClick={() => moveSection(si, -1)}
                    disabled={si === 0}
                    className="grid h-6 w-6 place-items-center rounded-full text-slate-500 transition hover:bg-white hover:text-indigo-600 active:scale-90 disabled:cursor-not-allowed disabled:opacity-25"
                    title="Monter la section"
                    aria-label="Monter la section"
                  >
                    <ChevronUp size={13} />
                  </button>
                  <button
                    type="button"
                    onClick={() => moveSection(si, 1)}
                    disabled={si === data.sections.length - 1}
                    className="grid h-6 w-6 place-items-center rounded-full text-slate-500 transition hover:bg-white hover:text-indigo-600 active:scale-90 disabled:cursor-not-allowed disabled:opacity-25"
                    title="Descendre la section"
                    aria-label="Descendre la section"
                  >
                    <ChevronDown size={13} />
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => removeSection(si)}
                  disabled={data.sections.length <= 1}
                  className="grid h-8 w-8 place-items-center rounded-xl text-slate-400 transition hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-20"
                  title="Supprimer la section"
                  aria-label="Supprimer la section"
                >
                  <Trash2 size={15} />
                </button>
              </div>

              <div className="space-y-2">
                {visibleBlockEntries.map(({ block, bi }) => {
                  const insertOpen = insertTarget?.si === si && insertTarget?.afterIndex === bi;
                  const activeDropEdge = dropTarget?.si === si && dropTarget?.bi === bi ? dropTarget.edge : null;
                  return <BlockView
                    key={block.uid || bi}
                    block={block}
                    number={TYPE_LABEL[normalizeBlockType(block.type)] ? (numbering.get(`${si}:${bi}`) ?? bi + 1) : null}
                    index={bi}
                    total={blocks.length}
                    dragging={dragSource?.si === si && dragSource?.bi === bi}
                    dropEdge={activeDropEdge}
                    insertMenuOpen={insertOpen}
                    onPatch={updates => patchBlock(si, bi, updates)}
                    onRemove={() => removeBlock(si, bi)}
                    onChangeType={type => changeBlockType(si, bi, type)}
                    onMove={dir => moveBlock(si, bi, dir)}
                    onToggleInsert={() => setInsertTarget(insertOpen ? null : { si, afterIndex: bi })}
                    onPickInsert={type => insertBlock(si, type, bi)}
                    onCloseInsert={() => setInsertTarget(null)}
                    onDragStart={handleDragStart(si, bi)}
                    onDragOver={handleDragOver(si, bi)}
                    onDrop={handleDrop(si, bi)}
                    onDragEnd={handleDragEnd}
                  />;
                })}
              </div>

              {/* Insertion en fin de section */}
              <div className="relative mt-3">
                <button
                  type="button"
                  onClick={() => setInsertTarget(prev => (prev && prev.si === si && prev.afterIndex === undefined ? null : { si }))}
                  className="flex h-9 w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-slate-200/90 bg-slate-50/50 text-[11px] font-semibold text-slate-500 transition hover:border-indigo-300 hover:bg-indigo-50/50 hover:text-indigo-700"
                >
                  <Plus size={13} /> Ajouter un bloc dans la section {alphabeticIndex(si + 1)}
                </button>
                {insertTarget && insertTarget.si === si && insertTarget.afterIndex === undefined && (
                  <TypeMenu onPick={type => insertBlock(si, type)} onClose={() => setInsertTarget(null)} />
                )}
              </div>
            </section>
          );
        })}

        {/* Ajouter une section */}
        <button
          type="button"
          onClick={addSection}
          className="flex h-11 w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-slate-300 bg-white/80 text-[12px] font-semibold text-slate-600 shadow-2xs transition hover:border-indigo-300 hover:bg-indigo-50/70 hover:text-indigo-700"
        >
          <Plus size={14} /> Ajouter une section
        </button>
      </div>
    </div>
  );
}
