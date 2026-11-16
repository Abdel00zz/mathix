import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronRight, X } from 'lucide-react';
import { registerStudioDraft } from './studioDraftRegistry';

export type JsonNode = string | number | boolean | null | JsonNode[] | { [key: string]: JsonNode };

interface JsonFieldEditorProps {
  data: JsonNode;
  onChange: (next: JsonNode) => void;
}

function isObject(v: JsonNode): v is Record<string, JsonNode> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isArray(v: JsonNode): v is JsonNode[] {
  return Array.isArray(v);
}

function cloneUpdate(root: JsonNode, path: (string | number)[], value: JsonNode): JsonNode {
  if (path.length === 0) return value;
  const [head, ...rest] = path;
  if (isArray(root)) {
    const copy = root.slice();
    const index = Number(head);
    if (index >= 0 && index < copy.length) copy[index] = cloneUpdate(copy[index], rest, value);
    return copy;
  }
  if (isObject(root)) {
    const key = String(head);
    return { ...root, [key]: cloneUpdate(root[key], rest, value) };
  }
  return root;
}

function kindOf(v: JsonNode): 'object' | 'array' | 'string' | 'number' | 'boolean' | 'null' {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'array';
  if (typeof v === 'object') return 'object';
  return typeof v as 'string' | 'number' | 'boolean';
}

function renderValue(v: JsonNode): string {
  const k = kindOf(v);
  if (k === 'string') return `"${v as string}"`;
  return String(v);
}

function Node({ label, value, path, depth, onChange }: {
  label: string | number | null;
  value: JsonNode;
  path: (string | number)[];
  depth: number;
  onChange: (next: JsonNode) => void;
}) {
  const [open, setOpen] = useState(depth < 2);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [editError, setEditError] = useState<string | null>(null);
  const draftIdRef = useRef(Symbol('json-field'));

  const kind = kindOf(value);
  const isContainer = kind === 'object' || kind === 'array';

  const entries = useMemo(() => {
    if (kind === 'object') {
      return Object.entries(value as Record<string, JsonNode>).map(([k, v]) => ({ key: k, childPath: [...path, k], child: v }));
    }
    if (kind === 'array') {
      return (value as JsonNode[]).map((v, i) => ({ key: i, childPath: [...path, i], child: v }));
    }
    return [];
  }, [value, path, kind]);

  const labelText = label === null ? '' : `${String(label)}:`;

  const startEdit = () => {
    setDraft(value === null ? 'null' : JSON.stringify(value));
    setEditError(null);
    setEditing(true);
  };

  const commitEdit = useCallback((): boolean => {
    try {
      onChange(JSON.parse(draft));
      setEditError(null);
      setEditing(false);
      return true;
    } catch {
      setEditError('Valeur JSON invalide');
      return false;
    }
  }, [draft, onChange]);

  useEffect(() => {
    if (!editing || draft === (value === null ? 'null' : JSON.stringify(value))) return;
    return registerStudioDraft(draftIdRef.current, commitEdit);
  }, [commitEdit, draft, editing, value]);

  if (editing) {
    return (
      <div className="flex items-start gap-2 py-0.5">
        {label !== null && <span className="shrink-0 pt-1.5 font-mono text-xs text-slate-400">{labelText}</span>}
        {kind === 'string' ? (
          <textarea
            autoFocus
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onBlur={commitEdit}
            onKeyDown={e => {
              if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === 's') commitEdit();
              else if (e.key === 'Escape') setEditing(false);
            }}
            rows={Math.min(8, Math.max(2, draft.split('\n').length))}
            className="min-w-0 flex-1 resize-y rounded border border-slate-300 bg-white px-2 py-1 font-mono text-xs outline-none focus:border-slate-900"
          />
        ) : (
          <input
            autoFocus
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onBlur={commitEdit}
            onKeyDown={e => {
              if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === 's') commitEdit();
              else if (e.key === 'Enter') commitEdit();
              else if (e.key === 'Escape') setEditing(false);
            }}
            className="min-w-0 flex-1 rounded border border-slate-300 bg-white px-2 py-1 font-mono text-xs outline-none focus:border-slate-900"
          />
        )}
        <button onMouseDown={e => e.preventDefault()} onClick={commitEdit} className="shrink-0 pt-1 text-emerald-600" aria-label="Valider"><Check size={14} /></button>
        <button onMouseDown={e => e.preventDefault()} onClick={() => setEditing(false)} className="shrink-0 pt-1 text-slate-400" aria-label="Annuler"><X size={14} /></button>
        {editError && <span className="pt-1 font-sans text-[11px] font-medium text-red-600" role="alert">{editError}</span>}
      </div>
    );
  }

  if (isContainer) {
    const count = entries.length;
    return (
      <div>
        <button
          type="button"
          onClick={() => setOpen(v => !v)}
          className="flex items-center gap-1 py-0.5 font-mono text-xs font-semibold text-slate-600 hover:text-slate-900"
        >
          <ChevronRight size={12} className={`shrink-0 transition-transform ${open ? 'rotate-90' : ''}`} />
          <span className="text-slate-400">{labelText}</span>
          <span>{kind === 'array' ? `[${count}]` : `{${count}}`}</span>
        </button>
        {open && (
          <div className="ml-3 border-l border-slate-100 pl-2">
            {count === 0 ? (
              <span className="py-0.5 font-mono text-xs text-slate-300">{kind === 'array' ? '[]' : '{}'}</span>
            ) : entries.map(e => (
              <Node
                key={String(e.key)}
                label={e.key}
                value={e.child}
                path={e.childPath}
                depth={depth + 1}
                onChange={next => onChange(cloneUpdate(value, [e.key], next))}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  const colorClass = kind === 'string' ? 'text-emerald-700' : kind === 'number' ? 'text-blue-700' : kind === 'boolean' ? 'text-purple-700' : 'text-slate-400';
  return (
    <div onDoubleClick={startEdit} className="cursor-text py-0.5 font-mono text-xs leading-relaxed" title="Double-cliquez pour modifier">
      <span className="text-slate-400">{labelText} </span>
      <span className={colorClass}>{renderValue(value)}</span>
    </div>
  );
}

export default function JsonFieldEditor({ data, onChange }: JsonFieldEditorProps) {
  return (
    <div className="min-h-0 flex-1 overflow-auto p-4">
      <Node label={null} value={data} path={[]} depth={0} onChange={onChange} />
    </div>
  );
}
