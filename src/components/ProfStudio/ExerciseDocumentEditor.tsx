import React, { useEffect, useState } from 'react';
import { ChevronDown, ChevronUp, GripVertical, Plus, Redo2, Search, Trash2, Undo2 } from 'lucide-react';
import type { MediaConfig } from '../../types';
import { numberExercise, partLabel } from '../Exercise/engine';
import { EditableText, MediaEditor } from './editable';

export type ExerciseFile = {
  id?: string;
  theme?: string;
  difficulty?: string;
  topic?: string;
  requiresRedaction?: boolean;
  context?: string;
  media?: MediaConfig;
  questions?: ExerciseQuestion[];
};

export type ExerciseQuestion = {
  id: string;
  type?: string;
  content: string;
  hint?: string;
  media?: MediaConfig;
  subQuestions?: ExerciseSubQuestion[];
};

type ExerciseSubQuestion = {
  id: string;
  content: string;
  hint?: string;
  correction?: string;
  bareme?: number;
  media?: MediaConfig;
  subQuestions?: ExerciseSubQuestion[];
};

interface ExerciseDocumentEditorProps {
  data: ExerciseFile;
  onChange: (next: ExerciseFile) => void;
}

const alpha = (i: number): string => {
  let n = i;
  let s = '';
  do { s = String.fromCharCode(97 + (n % 26)) + s; n = Math.floor(n / 26) - 1; } while (n >= 0);
  return s;
};

/**
 * Sous-questions dans l'ordre où elles s'afficheront, avec l'étiquette que
 * l'élève lira réellement.
 *
 * Le rendu ne connaît que deux niveaux : une sous-question imbriquée est
 * remontée au niveau supérieur et prend donc la lettre suivante (`b`, `c`…),
 * pas `a.1`. Afficher `a.1` dans le studio ferait croire à une arborescence que
 * personne ne verrait. On montre donc la vérité, en le signalant.
 */
interface FlatSubQuestion {
  node: ExerciseSubQuestion;
  label: string;
  depth: number;
  /** Chemin d'accès dans l'arbre, pour modifier le bon nœud depuis une liste plate. */
  path: number[];
  /** Vrai au-delà de deux niveaux : la donnée sera remontée à l'affichage. */
  raised: boolean;
}

/**
 * L'arbre est **aplati** (pré-ordre) : chaque nœud est rendu une seule fois, une
 * sous-question imbriquée devient la ligne suivante. La récursion d'affichage
 * est donc proscrite ici — elle montrerait le même nœud deux fois, une fois
 * comme enfant, une fois comme frère remonté.
 */
function flattenSubQuestions(nodes: ExerciseSubQuestion[]): FlatSubQuestion[] {
  const out: FlatSubQuestion[] = [];
  const visit = (node: ExerciseSubQuestion, depth: number, path: number[]) => {
    // Un conteneur sans énoncé ne produit pas de ligne : le rendu le traverse
    // sans rien afficher, on ne lui attribue donc pas de lettre.
    const hasContent = Boolean((node.content || '').trim());
    const children = node.subQuestions || [];
    if (hasContent || children.length === 0) {
      out.push({ node, label: alpha(out.length), depth, path, raised: depth > 2 });
    }
    children.forEach((child, index) => visit(child, depth + 1, [...path, index]));
  };
  nodes.forEach((node, index) => visit(node, 2, [index]));
  return out;
}

function ConfirmDeleteButton({ label, onConfirm }: { label: string; onConfirm: () => void }) {
  return (
    <button
      type="button"
      onClick={() => { if (window.confirm(`Supprimer ${label} ?\n\nCette action sera définitive après publication.`)) onConfirm(); }}
      className="absolute right-1 top-1 grid h-7 w-7 place-items-center rounded-md text-slate-300 transition hover:bg-red-50 hover:text-red-600"
      aria-label={`Supprimer ${label}`}
      title={`Supprimer ${label}`}
    >
      <Trash2 size={14} />
    </button>
  );
}

function SubQuestionView({ sq, flat, questionNumber, onPatch, onRemove, numberBadge, hideLabel = false }: {
  sq: ExerciseSubQuestion;
  flat: FlatSubQuestion;
  /** Numéro de la question parente : deux questions peuvent avoir une « sous-question a ». */
  questionNumber: number;
  onPatch: (updates: Partial<ExerciseSubQuestion>) => void;
  onRemove: () => void;
  /**
   * Numéro de question porté par cette ligne : l'élève le lit ici, pas sur une
   * ligne d'énoncé séparée (question sans énoncé propre).
   */
  numberBadge?: string;
  /** Question « plate » : le rendu n'affiche que le numéro, jamais la lettre a. */
  hideLabel?: boolean;
}) {
  const subject = hideLabel
    ? `question ${numberBadge}`
    // Deux questions peuvent avoir une « sous-question a » : le numéro de la
    // question lève l'ambiguïté, y compris dans le titre de la modale.
    : `question ${questionNumber} › sous-question ${flat.label}`;
  // L'indentation rappelle l'intention de l'auteur sans recréer un niveau :
  // la ligne est bien rendue à la suite, en frère.
  const indent = Math.max(0, flat.depth - 2) * 18;

  return (
    <div className="group relative rounded-lg border border-slate-100 bg-white p-3" style={indent ? { marginLeft: indent } : undefined}>
      <ConfirmDeleteButton label={subject} onConfirm={onRemove} />
      <div className="flex items-start gap-2">
        {numberBadge && <span className="mt-0.5 shrink-0 font-mono text-sm font-bold text-slate-700">{numberBadge}.</span>}
        {!hideLabel && <span className="mt-0.5 shrink-0 font-mono text-sm font-bold text-slate-500">{flat.label}.</span>}
        <div className="min-w-0 flex-1 pr-8 text-[14px] leading-relaxed text-slate-800">
          <EditableText content={sq.content || ''} onChange={content => onPatch({ content })} onDelete={onRemove} />
          {flat.raised && (
            <span className="ml-1 inline-flex items-center rounded-full border border-indigo-200 bg-indigo-50 px-2 py-0.5 align-middle text-[10px] font-semibold text-indigo-700" title="Le rendu ne comporte que deux niveaux : cette sous-question est affichée à la suite de la précédente, avec cette lettre.">
              niveau {flat.depth} — remontée en « {flat.label} »
            </span>
          )}
          {sq.bareme != null && (
            <div className="mt-1 inline-flex items-center gap-1 text-[11px] font-semibold text-slate-400">
              barème :
              <EditableText inline content={String(sq.bareme)} onChange={v => { const n = Number(v); if (Number.isFinite(n)) onPatch({ bareme: n }); }} />
              pt
            </div>
          )}
          {sq.hint !== undefined && (
            <div className="mt-2 rounded border-l-2 border-amber-300 bg-amber-50 px-2 py-1">
              <span className="text-[10px] font-bold uppercase tracking-wide text-amber-600">Indice</span>
              <div className="text-[13px] text-slate-700">
                <EditableText inline content={sq.hint} onChange={hint => onPatch({ hint })} onDelete={() => onPatch({ hint: undefined })} />
              </div>
            </div>
          )}
          {sq.correction !== undefined && (
            <div className="mt-2 rounded border-l-2 border-emerald-300 bg-emerald-50 px-2 py-1">
              <span className="text-[10px] font-bold uppercase tracking-wide text-emerald-600">Correction</span>
              <div className="text-[13px] text-slate-700">
                <EditableText inline content={sq.correction} onChange={correction => onPatch({ correction })} onDelete={() => onPatch({ correction: undefined })} />
              </div>
            </div>
          )}
          <MediaEditor
            corner
            media={sq.media}
            context={sq.content}
            blockType="exercise-subquestion"
            subject={subject}
            onChange={media => onPatch({ media })}
          />
        </div>
      </div>
    </div>
  );
}

export default function ExerciseDocumentEditor({ data, onChange }: ExerciseDocumentEditorProps) {
  const [past, setPast] = useState<ExerciseFile[]>([]);
  const [future, setFuture] = useState<ExerciseFile[]>([]);
  const [query, setQuery] = useState('');
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dropTarget, setDropTarget] = useState<{ index: number; position: 'before' | 'after' } | null>(null);

  const patchWithHistory = (next: ExerciseFile) => {
    setPast(prev => [...prev.slice(-30), JSON.parse(JSON.stringify(data))]);
    setFuture([]);
    onChange(next);
  };

  const undo = () => {
    if (past.length === 0) return;
    const previous = past[past.length - 1];
    setPast(past.slice(0, -1));
    setFuture([JSON.parse(JSON.stringify(data)), ...future]);
    onChange(previous);
  };

  const redo = () => {
    if (future.length === 0) return;
    const next = future[0];
    setFuture(future.slice(1));
    setPast([...past, JSON.parse(JSON.stringify(data))]);
    onChange(next);
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
      const cmdOrCtrl = isMac ? e.metaKey : e.ctrlKey;
      if (!cmdOrCtrl) return;
      if (e.key === 'z' || e.key === 'Z') {
        if (e.shiftKey) {
          e.preventDefault();
          redo();
        } else {
          e.preventDefault();
          undo();
        }
      } else if (e.key === 'y' || e.key === 'Y') {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  });

  const patchQuestion = (qi: number, updates: Partial<ExerciseQuestion>) => {
    const next = JSON.parse(JSON.stringify(data)) as ExerciseFile;
    const questions = next.questions || [];
    questions[qi] = { ...questions[qi], ...updates };
    next.questions = questions;
    patchWithHistory(next);
  };

  const removeQuestion = (qi: number) => {
    const next = JSON.parse(JSON.stringify(data)) as ExerciseFile;
    next.questions = (next.questions || []).filter((_, i) => i !== qi);
    patchWithHistory(next);
  };

  const moveQuestion = (fromIndex: number, toIndex: number) => {
    const questions = [...(data.questions || [])];
    if (fromIndex < 0 || fromIndex >= questions.length || toIndex < 0 || toIndex >= questions.length || fromIndex === toIndex) return;
    const [moved] = questions.splice(fromIndex, 1);
    questions.splice(toIndex, 0, moved);
    const next = { ...JSON.parse(JSON.stringify(data)), questions };
    patchWithHistory(next);
  };

  const addQuestion = () => {
    const next = JSON.parse(JSON.stringify(data)) as ExerciseFile;
    const questions = next.questions || [];
    const newId = `q-${Date.now()}`;
    questions.push({ id: newId, content: '' });
    next.questions = questions;
    patchWithHistory(next);
  };

  const patchSubQuestion = (qi: number, path: number[], updates: Partial<ExerciseSubQuestion>) => {
    const next = JSON.parse(JSON.stringify(data)) as ExerciseFile;
    let list = (next.questions || [])[qi]?.subQuestions || [];
    for (let i = 0; i < path.length - 1; i += 1) {
      const branch = list[path[i]];
      if (!branch) return;
      if (!branch.subQuestions) branch.subQuestions = [];
      list = branch.subQuestions;
    }
    const last = path[path.length - 1];
    if (!list[last]) return;
    list[last] = { ...list[last], ...updates };
    patchWithHistory(next);
  };

  const removeSubQuestion = (qi: number, path: number[]) => {
    const next = JSON.parse(JSON.stringify(data)) as ExerciseFile;
    let list = (next.questions || [])[qi]?.subQuestions || [];
    for (let i = 0; i < path.length - 1; i += 1) {
      const branch = list[path[i]];
      if (!branch) return;
      if (!branch.subQuestions) branch.subQuestions = [];
      list = branch.subQuestions;
    }
    list.splice(path[path.length - 1], 1);
    patchWithHistory(next);
  };

  const updateMeta = (updates: Partial<ExerciseFile>) => {
    patchWithHistory({ ...JSON.parse(JSON.stringify(data)), ...updates });
  };

  // Numérotation réelle : une seule règle, partagée avec la page de l'élève.
  const numbering = numberExercise(data.questions || []);
  const allQuestions = data.questions || [];
  const normalizedQuery = query.trim().toLowerCase();

  return (
    <div className="min-h-0 flex-1 overflow-y-auto bg-[#f7f8fa] px-6 py-6 sm:px-10 sm:py-8">
      {/* Sticky command bar matching document geometry */}
      <div className="sticky top-0 z-30 mx-auto max-w-[720px] pb-4">
        <div className="flex flex-wrap items-center justify-between gap-2.5 rounded-2xl border border-slate-200/80 bg-white/88 px-3.5 py-2 shadow-[0_8px_32px_rgba(15,23,42,0.06)] backdrop-blur-xl transition-all">
          <div className="flex min-w-[200px] flex-1 items-center gap-2 rounded-xl bg-slate-100/80 px-2.5 py-1 text-xs text-slate-700 ring-1 ring-black/[0.04] focus-within:bg-white focus-within:ring-2 focus-within:ring-indigo-500/40">
            <Search size={14} className="shrink-0 text-slate-400" />
            <input
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Rechercher dans l'exercice…"
              className="w-full bg-transparent text-xs text-slate-800 placeholder-slate-400 outline-none"
            />
            {query && (
              <button type="button" onClick={() => setQuery('')} className="rounded p-0.5 text-slate-400 hover:text-slate-600">
                ×
              </button>
            )}
          </div>

          <div className="flex items-center gap-1.5">
            <span className="rounded-full bg-indigo-50 px-2.5 py-0.5 font-mono text-[11px] font-bold text-indigo-700">
              {allQuestions.length} {allQuestions.length > 1 ? 'questions' : 'question'}
            </span>

            <div className="flex items-center overflow-hidden rounded-xl border border-slate-200/90 bg-white shadow-sm">
              <button
                type="button"
                onClick={undo}
                disabled={past.length === 0}
                className="grid h-7 w-7 place-items-center text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-25"
                title="Annuler (Ctrl+Z)"
                aria-label="Annuler"
              >
                <Undo2 size={13} />
              </button>
              <span className="h-3.5 w-px bg-slate-200" />
              <button
                type="button"
                onClick={redo}
                disabled={future.length === 0}
                className="grid h-7 w-7 place-items-center text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-25"
                title="Rétablir (Ctrl+Y)"
                aria-label="Rétablir"
              >
                <Redo2 size={13} />
              </button>
            </div>

            <button
              type="button"
              onClick={addQuestion}
              className="inline-flex h-7 items-center gap-1 rounded-xl bg-slate-900 px-2.5 text-[11px] font-semibold text-white shadow-sm transition hover:bg-slate-800 active:scale-95"
            >
              <Plus size={13} /> Question
            </button>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-[720px] space-y-10 pb-20">
        <div className="pb-2">
          <div className="text-[30px] font-bold leading-tight tracking-tight text-slate-900">
            <EditableText content={data.topic || 'Exercice'} onChange={topic => updateMeta({ topic })} />
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
            {data.theme !== undefined && (
              <EditableText inline content={data.theme} onChange={theme => updateMeta({ theme })} onDelete={() => updateMeta({ theme: undefined })} />
            )}
            {data.difficulty !== undefined && <span className="text-slate-300">·</span>}
            {data.difficulty !== undefined && (
              <EditableText inline content={data.difficulty} onChange={difficulty => updateMeta({ difficulty })} onDelete={() => updateMeta({ difficulty: undefined })} />
            )}
            {data.requiresRedaction && <span className="rounded-full bg-rose-50 px-2 py-0.5 text-rose-600">Rédaction</span>}
          </div>

          {data.context !== undefined && (
            <div className="mt-3 rounded border-l-2 border-slate-300 bg-slate-50 px-3 py-2">
              <span className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Énoncé / contexte</span>
              <div className="text-[14px] text-slate-800">
                <EditableText content={data.context} onChange={context => updateMeta({ context })} onDelete={() => updateMeta({ context: undefined })} />
              </div>
            </div>
          )}
          <MediaEditor
            media={data.media}
            context={data.context}
            blockType="exercise-lead"
            subject="énoncé"
            onChange={media => updateMeta({ media })}
          />
        </div>

        {allQuestions.map((q, qi) => {
          const { kind, part } = numbering[qi];
          const isPart = kind === 'part';
          const isText = kind === 'text';
          const number = kind === 'question' ? numbering[qi].question : 0;
          const hasOwnStatement = Boolean((q.content || '').trim());
          const subQuestions = flattenSubQuestions(q.subQuestions || []);
          const numberOnSubs = number > 0 && !hasOwnStatement && subQuestions.length > 0;
          const flatQuestion = numberOnSubs && subQuestions.length === 1;

          const matchesQuery = !normalizedQuery ||
            (q.content || '').toLowerCase().includes(normalizedQuery) ||
            (q.hint || '').toLowerCase().includes(normalizedQuery) ||
            subQuestions.some(sq => (sq.node.content || '').toLowerCase().includes(normalizedQuery));

          if (!matchesQuery) return null;

          const isDragOver = dropTarget?.index === qi;
          const isBeingDragged = draggedIndex === qi;

          return (
            <div
              key={q.id || qi}
              draggable
              onDragStart={e => {
                setDraggedIndex(qi);
                e.dataTransfer.setData('text/plain', String(qi));
                e.dataTransfer.effectAllowed = 'move';
              }}
              onDragOver={e => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                const rect = e.currentTarget.getBoundingClientRect();
                const mid = rect.top + rect.height / 2;
                const position = e.clientY < mid ? 'before' : 'after';
                if (!dropTarget || dropTarget.index !== qi || dropTarget.position !== position) {
                  setDropTarget({ index: qi, position });
                }
              }}
              onDragLeave={e => {
                if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                  if (dropTarget?.index === qi) setDropTarget(null);
                }
              }}
              onDrop={e => {
                e.preventDefault();
                if (draggedIndex === null) return;
                const targetIndex = dropTarget?.position === 'after'
                  ? (draggedIndex < qi ? qi : qi + 1)
                  : (draggedIndex < qi ? qi - 1 : qi);
                const safeTarget = Math.max(0, Math.min(allQuestions.length - 1, targetIndex));
                if (safeTarget !== draggedIndex) {
                  moveQuestion(draggedIndex, safeTarget);
                }
                setDraggedIndex(null);
                setDropTarget(null);
              }}
              onDragEnd={() => {
                setDraggedIndex(null);
                setDropTarget(null);
              }}
              className={`relative transition-all duration-200 ${isBeingDragged ? 'opacity-40 scale-[0.99]' : ''}`}
            >
              {/* Glowing iOS drop indicator */}
              {isDragOver && dropTarget?.position === 'before' && (
                <div className="absolute -top-3 left-0 right-0 z-10 flex items-center">
                  <div className="h-2 w-2 rounded-full bg-indigo-600 shadow-[0_0_8px_rgba(99,102,241,0.8)]" />
                  <div className="h-[3px] flex-1 rounded-full bg-gradient-to-r from-indigo-600 via-indigo-500 to-indigo-600 shadow-[0_0_12px_rgba(99,102,241,0.6)]" />
                  <div className="h-2 w-2 rounded-full bg-indigo-600 shadow-[0_0_8px_rgba(99,102,241,0.8)]" />
                </div>
              )}

              <section className="group relative rounded-xl border border-slate-200/70 bg-white p-4 shadow-[0_2px_12px_rgba(15,23,42,0.03)] transition-all hover:border-slate-300 hover:shadow-[0_4px_18px_rgba(15,23,42,0.06)]">
                {/* Header bar: Drag handle + Stepper pills + Delete */}
                <div className="mb-2 flex items-center justify-between gap-1.5 border-b border-slate-100 pb-2">
                  <div className="flex items-center gap-1">
                    <span
                      className="grid h-6 w-5 cursor-grab place-items-center text-slate-300 transition hover:text-slate-600 active:cursor-grabbing"
                      title="Glisser pour réordonner"
                    >
                      <GripVertical size={14} />
                    </span>
                    <div className="flex items-center overflow-hidden rounded-lg border border-slate-200/80 bg-slate-50/80 shadow-xs">
                      <button
                        type="button"
                        onClick={() => moveQuestion(qi, qi - 1)}
                        disabled={qi === 0}
                        className="grid h-5 w-5 place-items-center text-slate-400 transition hover:bg-white hover:text-slate-800 disabled:cursor-not-allowed disabled:opacity-20"
                        title="Monter"
                        aria-label="Monter"
                      >
                        <ChevronUp size={12} />
                      </button>
                      <button
                        type="button"
                        onClick={() => moveQuestion(qi, qi + 1)}
                        disabled={qi === allQuestions.length - 1}
                        className="grid h-5 w-5 place-items-center text-slate-400 transition hover:bg-white hover:text-slate-800 disabled:cursor-not-allowed disabled:opacity-20"
                        title="Descendre"
                        aria-label="Descendre"
                      >
                        <ChevronDown size={12} />
                      </button>
                    </div>
                    <span className="font-mono text-xs font-bold text-slate-500">#{qi + 1}</span>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      if (window.confirm(`Supprimer ${number > 0 ? `la question ${number}` : 'cet élément'} ?\n\nCette action est irréversible après enregistrement.`)) {
                        removeQuestion(qi);
                      }
                    }}
                    className="grid h-6 w-6 place-items-center rounded-md text-slate-300 transition hover:bg-red-50 hover:text-red-600"
                    title="Supprimer"
                    aria-label="Supprimer"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>

                {isPart ? (
                  <div>
                    <div className="flex items-center justify-center gap-2.5">
                      <span className="h-px w-10 bg-gradient-to-r from-transparent to-slate-300" />
                      <span className="font-itim text-base font-normal tracking-wide text-black">
                        Partie {partLabel(part)}
                      </span>
                      <span className="h-px w-10 bg-gradient-to-l from-transparent to-slate-300" />
                    </div>
                    <div className="mt-2 text-center">
                      <EditableText content={q.content || ''} onChange={content => patchQuestion(qi, { content })} onDelete={() => removeQuestion(qi)} />
                    </div>
                  </div>
                ) : isText ? (
                  <div className="group relative pr-8 text-[14px] leading-relaxed text-slate-700">
                    <EditableText content={q.content || ''} onChange={content => patchQuestion(qi, { content })} onDelete={() => removeQuestion(qi)} />
                    <MediaEditor
                      corner
                      media={q.media}
                      context={q.content}
                      blockType="exercise-text"
                      subject="bloc de texte"
                      onChange={media => patchQuestion(qi, { media })}
                    />
                  </div>
                ) : (
                  <div>
                    {kind === 'empty' && (
                      <p className="mb-1 inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                        Aucun numéro à l'écran — ni énoncé ni sous-question
                      </p>
                    )}
                    <div className="flex items-start gap-2">
                      {numberOnSubs ? (
                        <span className="mt-0.5 w-6 shrink-0" aria-hidden="true" />
                      ) : (
                        <span className="mt-0.5 shrink-0 font-mono text-base font-bold text-slate-700">{number > 0 ? `${number}` : '—'}</span>
                      )}
                      <div className="group relative min-w-0 flex-1 pr-8 text-[15px] leading-relaxed text-slate-800">
                        <EditableText content={q.content || ''} onChange={content => patchQuestion(qi, { content })} onDelete={() => removeQuestion(qi)} />
                        {q.hint !== undefined && (
                          <div className="mt-1 rounded border-l-2 border-amber-300 bg-amber-50 px-2 py-1">
                            <span className="text-[10px] font-bold uppercase tracking-wide text-amber-600">Indice</span>
                            <div className="text-[13px] text-slate-700">
                              <EditableText inline content={q.hint} onChange={hint => patchQuestion(qi, { hint })} onDelete={() => patchQuestion(qi, { hint: undefined })} />
                            </div>
                          </div>
                        )}
                        <MediaEditor
                          corner
                          media={q.media}
                          context={q.content}
                          blockType="exercise-question"
                          subject={number > 0 ? `question ${number}` : 'question sans numéro'}
                          onChange={media => patchQuestion(qi, { media })}
                        />
                      </div>
                    </div>
                    {subQuestions.length > 0 && (
                      <div className={`mt-2 space-y-2 ${numberOnSubs ? '' : 'pl-6'}`}>
                        {subQuestions.map(flat => (
                          <SubQuestionView
                            key={`${flat.path.join('.')}:${flat.node.id || flat.label}`}
                            sq={flat.node}
                            flat={flat}
                            questionNumber={number}
                            numberBadge={numberOnSubs && (flatQuestion || flat.path[0] === 0) ? String(number) : undefined}
                            hideLabel={flatQuestion}
                            onPatch={updates => patchSubQuestion(qi, flat.path, updates)}
                            onRemove={() => removeSubQuestion(qi, flat.path)}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </section>

              {/* Glowing iOS drop indicator */}
              {isDragOver && dropTarget?.position === 'after' && (
                <div className="absolute -bottom-3 left-0 right-0 z-10 flex items-center">
                  <div className="h-2 w-2 rounded-full bg-indigo-600 shadow-[0_0_8px_rgba(99,102,241,0.8)]" />
                  <div className="h-[3px] flex-1 rounded-full bg-gradient-to-r from-indigo-600 via-indigo-500 to-indigo-600 shadow-[0_0_12px_rgba(99,102,241,0.6)]" />
                  <div className="h-2 w-2 rounded-full bg-indigo-600 shadow-[0_0_8px_rgba(99,102,241,0.8)]" />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
