import React, { useEffect, useState } from 'react';
import { CheckCircle2, ChevronDown, ChevronUp, Circle, GripVertical, Plus, Redo2, Search, Trash2, Undo2, XCircle } from 'lucide-react';
import { EditableText, MediaEditor } from './editable';
import type { MediaConfig } from '../../types';
import MediaRenderer from '../MediaRenderer';

export type QuizFile = {
  questions?: QuizQuestionEntry[];
};

export type QuizQuestionEntry = {
  id: string;
  type: string;
  prompt?: string;
  question?: string;
  /** Image affichée sous l'énoncé de la question. */
  image?: string;
  media?: MediaConfig;
  options?: { id?: string; text: string; isCorrect: boolean }[];
  isTrue?: boolean;
  items?: { id?: string; text?: string; content?: string }[];
  correctOrder?: string[];
  steps?: { id?: string; text: string; isError: boolean; correction?: string }[];
  context?: string;
  correctAnswers?: string[];
  placeholder?: string;
  explanation?: string;
  difficulty?: string;
  category?: string;
  section?: string;
};

interface QuizDocumentEditorProps {
  data: QuizFile;
  onChange: (next: QuizFile) => void;
}

const TYPE_LABELS: Record<string, string> = {
  mcq: 'QCM',
  'true-false': 'Vrai / Faux',
  boolean: 'Vrai / Faux',
  ordering: 'Ordre',
  order: 'Ordre',
  error: 'Erreur à repérer',
  input: 'Saisie',
};

const qText = (q: QuizQuestionEntry) => q.prompt ?? q.question ?? '';
const itemText = (it: { text?: string; content?: string }) => it.text ?? it.content ?? '';

export default function QuizDocumentEditor({ data, onChange }: QuizDocumentEditorProps) {
  const [past, setPast] = useState<QuizFile[]>([]);
  const [future, setFuture] = useState<QuizFile[]>([]);
  const [query, setQuery] = useState('');
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dropTarget, setDropTarget] = useState<{ index: number; position: 'before' | 'after' } | null>(null);

  const patchWithHistory = (next: QuizFile) => {
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

  const patchQuestion = (qi: number, updates: Partial<QuizQuestionEntry>) => {
    const next = JSON.parse(JSON.stringify(data)) as QuizFile;
    const questions = next.questions || [];
    questions[qi] = { ...questions[qi], ...updates };
    next.questions = questions;
    patchWithHistory(next);
  };

  const removeQuestion = (qi: number) => {
    const next = JSON.parse(JSON.stringify(data)) as QuizFile;
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
    const next = JSON.parse(JSON.stringify(data)) as QuizFile;
    const questions = next.questions || [];
    const newId = `quiz-${Date.now()}`;
    questions.push({
      id: newId,
      type: 'mcq',
      prompt: 'Nouvelle question',
      options: [
        { text: 'Option 1', isCorrect: true },
        { text: 'Option 2', isCorrect: false },
      ],
    });
    next.questions = questions;
    patchWithHistory(next);
  };

  const patchArray = (qi: number, field: 'options' | 'items' | 'steps' | 'correctAnswers', index: number, updates: Record<string, unknown>) => {
    const next = JSON.parse(JSON.stringify(data)) as QuizFile;
    const q = next.questions?.[qi];
    const arr = (q as any)?.[field] as any[] | undefined;
    if (arr) arr[index] = { ...arr[index], ...updates };
    patchWithHistory(next);
  };

  const removeArrayItem = (qi: number, field: 'options' | 'items' | 'steps' | 'correctAnswers', index: number) => {
    const next = JSON.parse(JSON.stringify(data)) as QuizFile;
    const q = next.questions?.[qi] as any;
    if (q && Array.isArray(q[field])) q[field] = q[field].filter((_: unknown, i: number) => i !== index);
    patchWithHistory(next);
  };

  const toggleCorrect = (qi: number, oi: number) => {
    const next = JSON.parse(JSON.stringify(data)) as QuizFile;
    const q = next.questions?.[qi] as any;
    const options = q?.options as any[] | undefined;
    if (!options || !options[oi]) return;
    const willBeCorrect = !options[oi].isCorrect;
    if (q.type === 'mcq') {
      options.forEach((o, i) => { o.isCorrect = i === oi && willBeCorrect; });
    } else {
      options[oi].isCorrect = willBeCorrect;
    }
    patchWithHistory(next);
  };

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
              placeholder="Rechercher dans le quiz…"
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

      <div className="mx-auto max-w-[720px] space-y-6 pb-20">
        {allQuestions.map((q, qi) => {
          const type = q.type;
          const label = TYPE_LABELS[type] || type;
          const isError = type === 'error';
          const isOrder = type === 'order' || type === 'ordering';
          const isInput = type === 'input';

          const text = qText(q);
          const matchesQuery = !normalizedQuery ||
            text.toLowerCase().includes(normalizedQuery) ||
            (q.explanation || '').toLowerCase().includes(normalizedQuery) ||
            (q.options || []).some(o => (o.text || '').toLowerCase().includes(normalizedQuery));

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

              <section className="rounded-xl border border-slate-200/80 border-l-[3px] border-l-transparent bg-white p-5 shadow-[0_4px_18px_rgba(15,23,42,0.035)] transition-all duration-200 hover:border-l-indigo-500 hover:shadow-[0_8px_28px_rgba(15,23,42,0.06)]">
                <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 pb-2.5">
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

                  <span className="shrink-0 rounded-md bg-slate-900 px-2 py-0.5 font-mono text-xs font-bold text-white">Q{qi + 1}</span>
                  <span className="shrink-0 rounded-md bg-indigo-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-indigo-700">{label}</span>
                  {q.difficulty && <span className="shrink-0 rounded-md bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-700">{q.difficulty}</span>}
                  {q.category && <span className="shrink-0 rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500">{q.category}</span>}
                  {q.section && <span className="shrink-0 rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500">{q.section}</span>}
                  <button
                    type="button"
                    onClick={() => { if (window.confirm(`Supprimer la question ${qi + 1} ?\n\nCette action sera définitive après publication.`)) removeQuestion(qi); }}
                    className="ml-auto grid h-7 w-7 place-items-center rounded-md text-slate-300 transition hover:bg-red-50 hover:text-red-600"
                    aria-label={`Supprimer la question ${qi + 1}`}
                    title={`Supprimer la question ${qi + 1}`}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>

                <div className="mt-3 text-[15px] leading-relaxed text-slate-800">
                  <MediaRenderer media={q.media || (q.image ? { src: q.image, position: 'bottom' } : undefined)} editorPreview>
                    <EditableText
                      content={text}
                      onChange={t => patchQuestion(qi, { prompt: t, question: undefined })}
                      onDelete={() => removeQuestion(qi)}
                    />
                  </MediaRenderer>
                </div>

                <div className="mt-3">
                  <MediaEditor media={q.media || (q.image ? { src: q.image, position: 'bottom' } : undefined)} context={text} onChange={media => patchQuestion(qi, { media, image: undefined })} />
                </div>

                {isError && q.context !== undefined && (
                  <div className="mt-2 rounded border-l-2 border-slate-300 bg-slate-50 px-2 py-1">
                    <span className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Énoncé / contexte</span>
                    <div className="text-[13px] text-slate-700">
                      <EditableText inline content={q.context} onChange={context => patchQuestion(qi, { context })} onDelete={() => patchQuestion(qi, { context: undefined })} />
                    </div>
                  </div>
                )}

                {Array.isArray(q.options) && (
                  <div className="mt-3 space-y-1.5">
                    <div className="mb-1 text-[10px] font-bold uppercase tracking-wide text-slate-400">
                      Cliquez sur l'icône pour définir la bonne réponse
                    </div>
                    {q.options.map((opt, oi) => (
                      <div key={oi} className="flex items-start gap-2">
                        <button
                          type="button"
                          onClick={() => toggleCorrect(qi, oi)}
                          aria-pressed={opt.isCorrect}
                          aria-label={opt.isCorrect ? 'Bonne réponse — cliquer pour retirer' : 'Définir comme bonne réponse'}
                          title={opt.isCorrect ? 'Bonne réponse' : 'Définir comme bonne réponse'}
                          className="mt-0.5 shrink-0 rounded-full p-0.5 transition hover:scale-110"
                        >
                          {opt.isCorrect
                            ? <CheckCircle2 size={17} className="text-emerald-600" />
                            : <Circle size={17} className="text-slate-300 hover:text-emerald-500" />}
                        </button>
                        <div className="min-w-0 flex-1 text-[14px] text-slate-700">
                          <EditableText
                            inline
                            content={opt.text}
                            onChange={t => patchArray(qi, 'options', oi, { text: t })}
                            onDelete={() => removeArrayItem(qi, 'options', oi)}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {(type === 'true-false' || type === 'boolean') && (
                  <div className="mt-3 text-[14px] text-slate-700">
                    Réponse :{' '}
                    <span className={`font-bold ${q.isTrue ? 'text-emerald-700' : 'text-red-600'}`}>{q.isTrue ? 'Vrai' : 'Faux'}</span>
                  </div>
                )}

                {isOrder && Array.isArray(q.items) && (
                  <div className="mt-3 space-y-1.5">
                    {q.items.map((item, ii) => (
                      <div key={item.id || ii} className="flex items-start gap-2">
                        <span className="mt-1 shrink-0 font-mono text-xs font-bold text-slate-400">{q.correctOrder?.indexOf(String(item.id)) !== undefined && q.correctOrder?.indexOf(String(item.id)) >= 0 ? q.correctOrder!.indexOf(String(item.id)) + 1 : ii + 1}.</span>
                        <div className="min-w-0 flex-1 text-[14px] text-slate-700">
                          <EditableText
                            inline
                            content={itemText(item)}
                            onChange={t => patchArray(qi, 'items', ii, { content: t, text: undefined })}
                            onDelete={() => removeArrayItem(qi, 'items', ii)}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {isError && Array.isArray(q.steps) && (
                  <div className="mt-3 space-y-1.5">
                    {q.steps.map((step, si) => (
                      <div key={step.id || si} className={`flex items-start gap-2 rounded-lg px-2.5 py-1.5 ${step.isError ? 'bg-red-50' : 'bg-slate-50'}`}>
                        <span className="mt-0.5 shrink-0">
                          {step.isError ? <XCircle size={15} className="text-red-500" /> : <CheckCircle2 size={15} className="text-emerald-500" />}
                        </span>
                        <div className="min-w-0 flex-1 text-[14px] text-slate-700">
                          <EditableText inline content={step.text} onChange={t => patchArray(qi, 'steps', si, { text: t })} onDelete={() => removeArrayItem(qi, 'steps', si)} />
                          {step.correction !== undefined && (
                            <div className="mt-1 rounded border-l-2 border-emerald-300 bg-emerald-50 px-2 py-0.5 text-[12px] text-emerald-800">
                              <EditableText inline content={step.correction} onChange={correction => patchArray(qi, 'steps', si, { correction })} onDelete={() => patchArray(qi, 'steps', si, { correction: undefined })} />
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {isInput && q.correctAnswers !== undefined && (
                  <div className="mt-3 text-[14px] text-slate-700">
                    Réponse(s) attendue(s) :
                    {q.correctAnswers.map((a, ai) => (
                      <span key={ai} className="ml-1 inline-flex items-center gap-1 rounded bg-emerald-50 px-1.5 py-0.5 font-mono text-[12px] text-emerald-800">
                        <EditableText inline content={a} onChange={t => {
                          const next = JSON.parse(JSON.stringify(data)) as QuizFile;
                          const qEntry = next.questions?.[qi] as any;
                          if (qEntry && Array.isArray(qEntry.correctAnswers)) qEntry.correctAnswers[ai] = t;
                          patchWithHistory(next);
                        }} />
                      </span>
                    ))}
                  </div>
                )}

                {q.explanation !== undefined && (
                  <div className="mt-3 rounded border-l-2 border-emerald-300 bg-emerald-50 px-2.5 py-1.5">
                    <span className="text-[10px] font-bold uppercase tracking-wide text-emerald-600">Explication</span>
                    <div className="text-[13px] text-slate-700">
                      <EditableText inline content={q.explanation} onChange={explanation => patchQuestion(qi, { explanation })} onDelete={() => patchQuestion(qi, { explanation: undefined })} />
                    </div>
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

        {allQuestions.length === 0 && (
          <p className="py-10 text-center text-sm text-slate-400">Aucune question dans ce quiz.</p>
        )}
      </div>
    </div>
  );
}
