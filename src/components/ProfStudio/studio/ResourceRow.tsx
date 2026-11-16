import React, { useRef, useState } from 'react';
import { ChevronDown, ChevronUp, FileJson, GripVertical, Pencil, Trash2 } from 'lucide-react';

interface ResourceRowProps {
  canRenumber: boolean;
  index: number;
  label: string;
  onDelete: () => void;
  onMove: (direction: -1 | 1) => void;
  onOpen: () => void;
  onRename?: (newName: string) => void;
  onRenumber?: (newNumber: number) => void;
  onToggleSelect?: () => void;
  selected?: boolean;
  showOrder?: boolean;
  total?: number;
  onDragReorder?: (fromIndex: number, toIndex: number) => void;
}

export default function ResourceRow({
  index,
  label,
  canRenumber,
  showOrder = true,
  selected,
  total,
  onToggleSelect,
  onOpen,
  onMove,
  onDelete,
  onRenumber,
  onRename,
  onDragReorder,
}: ResourceRowProps) {
  const [renumbering, setRenumbering] = useState(false);
  const [numberDraft, setNumberDraft] = useState('');
  const [renaming, setRenaming] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [isDragOver, setIsDragOver] = useState(false);
  const clickTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const commitRenumber = () => {
    setRenumbering(false);
    const number = parseInt(numberDraft, 10);
    if (Number.isFinite(number) && number >= 1) onRenumber?.(number);
  };
  const commitRename = () => {
    setRenaming(false);
    const nextName = nameDraft.trim();
    if (nextName && nextName !== label) onRename?.(nextName);
  };

  return (
    <div
      draggable={Boolean(onDragReorder)}
      onDragStart={e => {
        if (!onDragReorder) return;
        e.dataTransfer.setData('text/plain', String(index));
        e.dataTransfer.effectAllowed = 'move';
      }}
      onDragOver={e => {
        if (!onDragReorder) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        setIsDragOver(true);
      }}
      onDragLeave={() => setIsDragOver(false)}
      onDrop={e => {
        if (!onDragReorder) return;
        e.preventDefault();
        setIsDragOver(false);
        const from = parseInt(e.dataTransfer.getData('text/plain'), 10);
        if (Number.isFinite(from) && from !== index) {
          onDragReorder(from, index);
        }
      }}
      className={`group relative flex items-center gap-1 rounded-xl px-1.5 py-1 transition-all ${
        selected ? 'bg-indigo-50/70 ring-1 ring-indigo-200' : 'hover:bg-slate-100/70'
      } ${isDragOver ? 'border-t-2 border-indigo-500 bg-indigo-50/40' : ''}`}
    >
      {onToggleSelect && (
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggleSelect}
          className="ml-0.5 h-3.5 w-3.5 shrink-0 cursor-pointer rounded border-slate-300 accent-slate-900"
          aria-label={`Sélectionner ${label}`}
          title="Sélectionner cette ressource"
        />
      )}
      {showOrder && (
        <div className="flex items-center gap-0.5">
          {onDragReorder && (
            <span
              className="grid h-5 w-4 cursor-grab place-items-center text-slate-300 transition hover:text-slate-600 active:cursor-grabbing"
              title="Glisser pour réordonner"
            >
              <GripVertical size={12} />
            </span>
          )}
          <div className="flex items-center overflow-hidden rounded-md border border-slate-200/80 bg-white shadow-2xs">
            <button
              type="button"
              onClick={() => onMove(-1)}
              disabled={index === 0}
              className="grid h-5 w-5 shrink-0 place-items-center text-slate-400 transition hover:bg-slate-50 hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-20"
              title="Monter"
              aria-label={`Monter ${label}`}
            >
              <ChevronUp size={11} />
            </button>
            <button
              type="button"
              onClick={() => onMove(1)}
              disabled={total !== undefined ? index >= total - 1 : false}
              className="grid h-5 w-5 shrink-0 place-items-center text-slate-400 transition hover:bg-slate-50 hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-20"
              title="Descendre"
              aria-label={`Descendre ${label}`}
            >
              <ChevronDown size={11} />
            </button>
          </div>
          <span className="w-5 shrink-0 text-center font-mono text-[11px] font-bold text-slate-400">
            {index + 1}
          </span>
        </div>
      )}
      {renaming ? (
        <input
          autoFocus
          value={nameDraft}
          onChange={event => setNameDraft(event.target.value)}
          onBlur={commitRename}
          onKeyDown={event => {
            if (event.key === 'Enter') commitRename();
            if (event.key === 'Escape') setRenaming(false);
          }}
          className="h-6 min-w-0 flex-1 rounded border border-slate-300 px-1.5 text-xs font-medium text-slate-800 outline-none focus:border-slate-900"
          aria-label={`Nouveau nom de ${label}`}
        />
      ) : renumbering ? (
        <input
          autoFocus
          value={numberDraft}
          onChange={event => setNumberDraft(event.target.value)}
          onBlur={commitRenumber}
          onKeyDown={event => {
            if (event.key === 'Enter') commitRenumber();
            if (event.key === 'Escape') setRenumbering(false);
          }}
          className="h-6 min-w-0 flex-1 rounded border border-slate-300 px-1.5 text-xs font-medium text-slate-800 outline-none focus:border-slate-900"
          aria-label={`Nouvelle position de ${label}`}
          inputMode="numeric"
        />
      ) : (
        <button
          type="button"
          onClick={() => {
            if (clickTimer.current) {
              clearTimeout(clickTimer.current);
              clickTimer.current = null;
              return;
            }
            clickTimer.current = setTimeout(() => {
              clickTimer.current = null;
              onOpen();
            }, 220);
          }}
          onDoubleClick={() => {
            if (clickTimer.current) {
              clearTimeout(clickTimer.current);
              clickTimer.current = null;
            }
            if (canRenumber) {
              setRenumbering(true);
              setNumberDraft(String(index + 1));
            }
          }}
          title={canRenumber ? 'Ouvrir · double-clic pour renuméroter' : 'Ouvrir'}
          className="flex min-w-0 flex-1 items-center gap-2 rounded-md px-1.5 py-1 text-left text-xs text-slate-600 transition hover:bg-white hover:text-slate-900"
        >
          <FileJson size={12} className="shrink-0 text-slate-400" />
          <span className="truncate">{label}</span>
        </button>
      )}
      {onRename && (
        <button
          type="button"
          onClick={() => {
            setNameDraft(label);
            setRenaming(true);
          }}
          className="grid h-6 w-6 shrink-0 place-items-center rounded-md text-slate-300 transition hover:bg-white hover:text-slate-700"
          title="Renommer"
          aria-label={`Renommer ${label}`}
        >
          <Pencil size={12} />
        </button>
      )}
      <button
        type="button"
        onClick={onDelete}
        className="grid h-6 w-6 shrink-0 place-items-center rounded-md text-slate-300 transition hover:bg-red-50 hover:text-red-500"
        title="Supprimer"
        aria-label={`Supprimer ${label}`}
      >
        <Trash2 size={13} />
      </button>
    </div>
  );
}
