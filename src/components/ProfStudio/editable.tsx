import React, { useCallback, useEffect, useRef, useState } from 'react';
import MathRenderer from '../MathRenderer';
import { registerStudioDraft } from './studioDraftRegistry';

/** Formats inline disponibles pendant l'édition (macros réellement rendues par
 *  le moteur : `\textbf`, `\textit`, `\underline`, `\itemsize`, `enumerate`,
 *  `columns`, `blank`, `question`, `mathqst`, `objectif`, `defi`, `savant`…).
 *  La sélection est conservée à l'intérieur du format appliqué. */
type InlineFormat = { label: string; wrap: (text: string) => string; hint?: string };

const INLINE_FORMATS: InlineFormat[] = [
  { label: 'Gras', wrap: t => `\\textbf{${t}}` },
  { label: 'Italique', wrap: t => `\\textit{${t}}` },
  { label: 'Souligné', wrap: t => `\\underline{${t}}` },
  { label: 'Puce', wrap: t => `\\itemsize{${t}}` },
  { label: 'Numéro', wrap: t => `\\begin{enumerate}\\item ${t}\\end{enumerate}` },
  { label: 'Surligné', wrap: t => `\\hl{${t}}`, hint: 'Surlignage ambre ; \\hlyellow, \\hlgreen, \\hlpink… pour une autre couleur' },
  {
    label: 'Colonnes',
    wrap: t => `\\begin{columns}${t}\\column Seconde colonne\\end{columns}`,
    hint: 'Range la sélection dans la première colonne ; compléter la seconde',
  },
  {
    label: 'Image',
    wrap: t => `\\image[width=50%,align=center]{${t}}`,
    hint: 'Remplacer le texte par l’adresse de l’image ; options : width, height, align, position, gap…',
  },
  { label: 'Trou', wrap: t => `\\blank{${t}}` },
  { label: 'Question', wrap: t => `\\question{${t}}` },
  {
    label: 'Titre-question',
    wrap: t => `\\mathqst{${t}}`,
    hint: 'Intitulé interrogatif d’un encadré (Définition, Théorème…)',
  },
  { label: 'Objectif', wrap: t => `\\objectif{${t}}` },
  { label: 'Défi', wrap: t => `\\defi{${t}}` },
  { label: 'Savant', wrap: t => `\\savant{${t}}` },
];

/** Texte éditable : rendu LaTeX → édition inline. Vider le texte ne supprime
 * jamais implicitement son bloc parent ; les suppressions ont un contrôle dédié.
 *  `activate` contrôle l'entrée en édition (clic simple ou double-clic) ;
 *  `placeholder` s'affiche quand le contenu est vide. */
export function EditableText({ content, onChange, inline, placeholder, activate = 'dblclick' }: {
  content: string;
  onChange: (next: string) => void;
  onDelete?: () => void;
  inline?: boolean;
  placeholder?: string;
  activate?: 'click' | 'dblclick';
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const draftIdRef = useRef(Symbol('editable-text'));

  const start = () => { setDraft(content); setEditing(true); };

  const commit = useCallback((): boolean => {
    setEditing(false);
    const next = draft.trim();
    if (next !== content) onChange(next);
    return true;
  }, [content, draft, onChange]);

  useEffect(() => {
    if (!editing || draft.trim() === content) return;
    return registerStudioDraft(draftIdRef.current, commit);
  }, [commit, content, draft, editing]);

  const resize = (el: HTMLTextAreaElement) => {
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  };

  const onDraftChange = (value: string) => {
    setDraft(value);
    const el = textareaRef.current;
    if (el) resize(el);
  };

  /** Enveloppe la sélection (ou insère un texte vide) dans un format. */
  const wrapSelection = (wrap: (text: string) => string) => {
    const el = textareaRef.current;
    if (!el) return;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const selected = draft.slice(start, end);
    const text = selected || 'texte';
    const wrapped = wrap(text);
    const next = draft.slice(0, start) + wrapped + draft.slice(end);
    onDraftChange(next);
    const textIndex = wrapped.indexOf(text);
    window.requestAnimationFrame(() => {
      el.focus();
      if (textIndex >= 0) el.setSelectionRange(start + textIndex, start + textIndex + text.length);
      else el.setSelectionRange(start, start + wrapped.length);
    });
  };

  if (editing) {
    return (
      <div className="space-y-1.5">
        <div className="flex flex-wrap items-center gap-1">
          <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Format</span>
          {INLINE_FORMATS.map(format => (
            <button
              key={format.label}
              type="button"
              onMouseDown={e => e.preventDefault()}
              onClick={() => wrapSelection(format.wrap)}
              className="rounded-md border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-600 transition hover:border-slate-300 hover:bg-slate-50"
              title={format.hint ? `${format.hint} — la sélection est conservée` : `Appliquer « ${format.label} » (la sélection est conservée)`}
            >
              {format.label}
            </button>
          ))}
        </div>
        <textarea
          ref={textareaRef}
          autoFocus
          value={draft}
          onChange={e => onDraftChange(e.target.value)}
          onBlur={commit}
          onKeyDown={e => {
            if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === 's') commit();
            else if (e.key === 'Escape') setEditing(false);
          }}
          rows={Math.min(10, Math.max(2, draft.split('\n').length))}
          placeholder={placeholder}
          className="w-full resize-y overflow-hidden rounded border border-slate-300 bg-white px-2 py-1 font-mono text-[13px] leading-relaxed text-slate-800 outline-none focus:border-slate-900"
        />
      </div>
    );
  }

  return (
    <div
      onClick={activate === 'click' ? start : undefined}
      onDoubleClick={activate === 'dblclick' ? start : undefined}
      className="cursor-text"
      title={activate === 'click' ? 'Cliquez pour modifier' : 'Double-cliquez pour modifier'}
    >
      {content?.trim() ? (
        <MathRenderer inline={inline} content={content} fontSize="inherit" />
      ) : (
        <span className="select-none text-slate-300">{placeholder || '\u00A0'}</span>
      )}
    </div>
  );
}

export { MediaEditor } from './MediaEditor';
