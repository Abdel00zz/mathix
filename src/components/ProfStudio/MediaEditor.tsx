import React, { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowDown, ArrowUp, Image as ImageIcon, Loader2, Plus, Trash2, Upload, X } from 'lucide-react';
import type { MediaAnchor, MediaConfig, MediaImage, MediaPosition } from '../../types';
import { profContentService } from '../../services/profContentService';
import { countByAnchor, mediaFromImages, mediaImages } from '../../utils/mediaGallery';
import type { MediaZoneKind } from '../../utils/mediaGallery';
import { hasZoneChoice, placementFor, zoneKindOf, zoneOf } from './mediaPlacement';
import MediaRenderer from '../MediaRenderer';
import MathRenderer from '../MathRenderer';

const inputClass = 'w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-emerald-600';

export function MediaEditor({ media, onChange, context, corner = false, iconOnly = false, blockType, subject }: {
  media?: MediaConfig;
  onChange: (next: MediaConfig | undefined) => void;
  context?: string;
  corner?: boolean;
  iconOnly?: boolean;
  /**
   * Type du bloc édité : adapte les libellés d'emplacement au contexte
   * (`application`, `exploration`, `exercise-question`, bloc révélable…).
   */
  blockType?: string;
  /**
   * Nœud précis auquel la figure se rattache — « la question 3 », « la
   * sous-question b ». Sans lui, le professeur ne sait pas quel élément de la
   * liste numérotée il est en train d'illustrer.
   */
  subject?: string;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<MediaImage[]>([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const uploadingRef = useRef(false);
  const titleId = useId();
  const count = mediaImages(media).length;
  const placement = placementFor(blockType, context);
  const zoneChoice = hasZoneChoice(placement);
  const zoneKind: MediaZoneKind = zoneKindOf(blockType);
  const heading = subject ? `Images — ${subject}` : 'Images du contenu';

  /** Zone effective d'une figure du brouillon : ce que la fiche appliquera. */
  const anchorOf = (image: MediaImage): MediaAnchor => {
    if (image.anchor) return image.anchor;
    if (zoneKind === 'application') return (image.position || 'top') === 'bottom' ? 'content' : 'lead';
    return 'content';
  };

  /**
   * Libellé d'un emplacement. Pour la zone « question de la liste », le numéro
   * visé fait partie du libellé : « Au-dessus de la question 3 ».
   */
  const optionLabel = (image: MediaImage, id: MediaAnchor, label: string) => (
    id === 'item' ? `${label} ${Math.max(1, Math.floor(image.targetItem ?? 1))}` : label
  );

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !uploadingRef.current) { event.stopPropagation(); setOpen(false); }
      if (event.key === 'Tab') {
        const dialog = closeRef.current?.closest('[role="dialog"]');
        const controls = Array.from(dialog?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled):not([type="file"]), select:not(:disabled), [tabindex="0"]') || []);
        const first = controls[0];
        const last = controls[controls.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => { window.removeEventListener('keydown', onKey, true); previous?.focus(); };
  }, [open]);

  const openEditor = () => {
    setDraft(mediaImages(media).map(image => ({ ...image })));
    setError(null);
    setPreview(false);
    setOpen(true);
  };
  const patch = (index: number, changes: Partial<MediaImage>) => setDraft(current => current.map((image, i) => i === index ? { ...image, ...changes } : image));
  const move = (index: number, direction: -1 | 1) => setDraft(current => {
    const next = [...current];
    const target = index + direction;
    if (target < 0 || target >= next.length) return current;
    [next[index], next[target]] = [next[target], next[index]];
    return next;
  });
  const importFiles = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    event.target.value = '';
    if (!files.length) return;
    uploadingRef.current = true;
    setUploading(true);
    setError(null);
    const imported: MediaImage[] = [];
    const failures: string[] = [];
    // Séquentiel pour limiter la mémoire et conserver l'ordre des fichiers.
    for (const file of files) {
      try {
        const { url, width, height } = await profContentService.uploadMedia(file);
        imported.push({ src: url, alt: file.name.replace(/\.[^.]+$/, ''), position: 'top', naturalWidth: width, naturalHeight: height });
      } catch (cause) {
        // Le motif (format inconnu, image trop complexe…) aide à corriger le fichier.
        const reason = cause instanceof Error && cause.message ? ` (${cause.message})` : '';
        failures.push(`${file.name}${reason}`);
      }
    }
    setDraft(current => [...current, ...imported]);
    if (failures.length) setError(`Import impossible : ${failures.join(' ; ')}.${imported.length ? ' Les autres images ont été ajoutées.' : ''}`);
    uploadingRef.current = false;
    setUploading(false);
  };
  const hasBlank = draft.some(image => !image.src.trim());
  const previewMedia = mediaFromImages(draft.map(image => ({ ...image, zoomable: false })));
  const draftCounts = countByAnchor(mediaFromImages(draft), zoneKind);

  return <>
    <button type="button" onClick={openEditor} title={count ? `Modifier les images (${subject || 'contenu'}, ${count})` : `Ajouter des images (${subject || 'contenu'})`} aria-label={count ? `Modifier les images (${subject || 'contenu'}, ${count})` : `Ajouter des images (${subject || 'contenu'})`} className={`${corner ? 'absolute right-0 top-0 z-10' : ''} inline-flex min-h-7 items-center justify-center gap-1 rounded-lg border px-2 py-1 text-[11px] font-semibold ${count ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-white text-slate-500'}`}>
      <ImageIcon size={14} />{!corner && !iconOnly && <span>Images{count > 0 ? ` (${count})` : ''}</span>}
      {(corner || iconOnly) && count > 1 && <span>{count}</span>}
    </button>
    {open && createPortal(
      <div className="fixed inset-0 z-[160] flex items-end justify-center bg-black/40 p-0 backdrop-blur-sm sm:items-center sm:p-6" onMouseDown={() => { if (!uploading) setOpen(false); }}>
        <div role="dialog" aria-modal="true" aria-labelledby={titleId} className="flex max-h-[92dvh] w-full max-w-4xl flex-col overflow-hidden rounded-t-[26px] border border-slate-200 bg-white shadow-xl overscroll-contain sm:rounded-2xl" onMouseDown={event => event.stopPropagation()}>
          <div className="mx-auto mt-2.5 h-1 w-10 shrink-0 rounded-full bg-slate-300 sm:hidden" />
          <header className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
            <div><h2 id={titleId} className="text-base font-bold text-slate-900">{heading}</h2><p className="text-xs text-slate-500">{placement.zones.some(zone => zone.id === 'item')
              ? 'Associez chaque image à l’énoncé, au contenu ou à une question de la liste, puis placez-la.'
              : zoneChoice ? 'Associez chaque image à l’énoncé ou au contenu, puis placez-la.' : 'Ajoutez plusieurs images et placez chacune par rapport au texte associé.'}</p></div>
            <button ref={closeRef} type="button" disabled={uploading} onClick={() => setOpen(false)} aria-label="Fermer les images" className="grid h-9 w-9 shrink-0 place-items-center rounded-lg hover:bg-slate-100 disabled:opacity-40"><X size={18} /></button>
          </header>
          <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-slate-100 px-5 py-3">
            <input ref={inputRef} type="file" multiple accept="image/*" onChange={event => void importFiles(event)} className="hidden" />
            <button type="button" disabled={uploading} onClick={() => inputRef.current?.click()} className="inline-flex items-center gap-2 rounded-lg bg-emerald-700 px-3 py-2 text-xs font-semibold text-white disabled:opacity-40">{uploading ? <Loader2 size={15} className="animate-spin" /> : <Upload size={15} />}{uploading ? 'Import des images…' : 'Importer des images'}</button>
            <button type="button" disabled={uploading} onClick={() => { setPreview(false); setDraft(current => [...current, { src: '', position: 'top' }]); }} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold"><Plus size={15} />Ajouter une URL</button>
            <button type="button" aria-pressed={preview} onClick={() => setPreview(value => !value)} className="ml-auto rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold">{preview ? 'Modifier les images' : 'Aperçu avec le texte'}</button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-5">
            {error && <p role="alert" className="mb-3 rounded-lg bg-red-50 p-3 text-xs text-red-700">{error}</p>}
            {preview ? (
              zoneChoice ? (
                <div className="space-y-4">
                  {placement.zones.map(zone => {
                    const images = draft.filter(image => anchorOf(image) === zone.id);
                    if (!images.length) return null;
                    return (
                      <div key={zone.id} className="rounded-xl border border-slate-200 bg-slate-50 p-5">
                        <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-slate-500">{zone.label}</p>
                        <MediaRenderer media={mediaFromImages(images.map(image => ({ ...image, zoomable: false })))} editorPreview>
                          <MathRenderer content={zone.id === 'lead'
                            ? (context || "L'énoncé du bloc apparaît ici.")
                            : 'Le contenu du bloc apparaît ici — il se découvre avec la correction ou la réponse.'} />
                        </MediaRenderer>
                      </div>
                    );
                  })}
                  {draft.length === 0 && <p className="py-10 text-center text-sm text-slate-500">Importez vos images ensemble ou ajoutez leurs URL.</p>}
                </div>
              ) : (
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-5"><MediaRenderer media={previewMedia} editorPreview><MathRenderer content={context || 'Le texte associé à ces images apparaît ici. Chaque figure conserve sa position, ses dimensions et sa légende.'} /></MediaRenderer></div>
              )
            ) : <div className="space-y-4">
              {draft.length === 0 && <p className="py-10 text-center text-sm text-slate-500">Importez vos images ensemble ou ajoutez leurs URL.</p>}
              {draft.map((image, index) => <section key={index} className="rounded-xl border border-slate-200 p-4" aria-label={`Image ${index + 1}`}>
                <div className="mb-3 flex items-center gap-2"><strong className="mr-auto text-sm">Image {index + 1}</strong>
                  <button type="button" disabled={uploading || index === 0} onClick={() => move(index, -1)} aria-label={`Monter l’image ${index + 1}`} className="p-2 disabled:opacity-30"><ArrowUp size={16} /></button>
                  <button type="button" disabled={uploading || index === draft.length - 1} onClick={() => move(index, 1)} aria-label={`Descendre l’image ${index + 1}`} className="p-2 disabled:opacity-30"><ArrowDown size={16} /></button>
                  <button type="button" disabled={uploading} onClick={() => setDraft(current => current.filter((_, i) => i !== index))} aria-label={`Supprimer l’image ${index + 1}`} className="p-2 text-red-600 disabled:opacity-30"><Trash2 size={16} /></button>
                </div>
                <div className="grid gap-4 sm:grid-cols-[120px_minmax(0,1fr)]">
                  <div className="flex h-28 items-center justify-center overflow-hidden rounded-lg bg-slate-50">{image.src ? <img src={image.src} alt={image.alt || `Image ${index + 1}`} className="h-full w-full object-contain" /> : <ImageIcon className="text-slate-300" />}</div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="text-xs text-slate-600 sm:col-span-2">URL de l’image<input value={image.src} disabled={uploading} onChange={e => patch(index, { src: e.target.value })} className={inputClass} placeholder="https://… ou /data/…" /></label>
                    {zoneChoice && (
                      <fieldset className="sm:col-span-2">
                        <legend className="text-xs text-slate-600">Association</legend>
                        <div className="mt-1 grid gap-1.5 sm:grid-cols-2">
                          {placement.zones.map(zone => {
                            const active = anchorOf(image) === zone.id;
                            return (
                              <button
                                key={zone.id}
                                type="button"
                                aria-pressed={active}
                                disabled={uploading}
                                onClick={() => {
                                  // Changer de zone réinitialise le placement :
                                  // « en bas de l'énoncé » n'a aucun sens dans la
                                  // correction, et l'ancien `bottom` traînerait.
                                  const nextZone = zoneOf(placement, zone.id);
                                  const stillValid = nextZone.options.some(option => option.value === image.position);
                                  patch(index, {
                                    anchor: zone.id,
                                    position: stillValid ? image.position : nextZone.options[0].value,
                                    // La zone `item` a besoin d'une question visée.
                                    targetItem: zone.id === 'item' ? (image.targetItem ?? 1) : image.targetItem,
                                  });
                                }}
                                className={`rounded-lg border px-3 py-2 text-left text-xs font-semibold transition ${active ? 'border-emerald-400 bg-emerald-50 text-emerald-800' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'}`}
                              >
                                {zone.label}
                                <span className="mt-0.5 block text-[11px] font-normal text-slate-500">{zone.detail}</span>
                              </button>
                            );
                          })}
                        </div>
                      </fieldset>
                    )}
                    {anchorOf(image) === 'item' && (zoneOf(placement, 'item').questions?.length ?? 0) > 0 && (
                      <fieldset className="sm:col-span-2">
                        <legend className="text-xs text-slate-600">Question visée</legend>
                        <div className="mt-1 max-h-44 space-y-1 overflow-y-auto rounded-lg border border-slate-200 p-1.5">
                          {(zoneOf(placement, 'item').questions || []).map(question => {
                            const active = Math.max(1, Math.floor(image.targetItem ?? 1)) === question.index;
                            return (
                              <button
                                key={question.index}
                                type="button"
                                aria-pressed={active}
                                disabled={uploading}
                                title={question.text}
                                onClick={() => patch(index, { targetItem: question.index })}
                                className={`flex w-full items-start gap-2 rounded-md px-2.5 py-2 text-left text-xs transition ${active ? 'bg-emerald-50 font-semibold text-emerald-900 ring-1 ring-emerald-200' : 'text-slate-600 hover:bg-slate-50'}`}
                              >
                                <span className="shrink-0 font-mono text-[11px] font-bold text-slate-500">{question.index}.</span>
                                <span className="min-w-0 flex-1">{question.label}</span>
                              </button>
                            );
                          })}
                        </div>
                        <span className="mt-1 block text-[11px] leading-relaxed text-slate-500">
                          La figure s'insère entre deux questions ; la numérotation de la liste se poursuit de part et d'autre.
                        </span>
                      </fieldset>
                    )}
                    <label className="text-xs text-slate-600">Position par rapport au texte<select value={image.position || 'top'} disabled={uploading} onChange={e => patch(index, { position: e.target.value as MediaPosition })} className={inputClass}>{zoneOf(placement, anchorOf(image)).options.map(option => <option key={option.value} value={option.value}>{optionLabel(image, anchorOf(image), option.label)}</option>)}</select>{placement.hint && anchorOf(image) !== 'item' && <span className="mt-1 block text-[11px] leading-relaxed text-slate-500">{placement.hint}</span>}</label>
                    <label className="text-xs text-slate-600">Description accessible<input value={image.alt || ''} disabled={uploading} onChange={e => patch(index, { alt: e.target.value })} className={inputClass} /></label>
                    <label className="text-xs text-slate-600">Largeur (px ou %)<input value={image.width ?? ''} disabled={uploading} onChange={e => patch(index, { width: /^\d+(\.\d+)?$/.test(e.target.value) ? Number(e.target.value) : e.target.value || undefined })} className={inputClass} placeholder="auto" /></label>
                    <label className="text-xs text-slate-600">Hauteur (px ou %)<input value={image.height ?? ''} disabled={uploading} onChange={e => patch(index, { height: /^\d+(\.\d+)?$/.test(e.target.value) ? Number(e.target.value) : e.target.value || undefined })} className={inputClass} placeholder="auto" /></label>
                    <label className="text-xs text-slate-600 sm:col-span-2">Légende<input value={image.caption || ''} disabled={uploading} onChange={e => patch(index, { caption: e.target.value })} className={inputClass} /></label>
                  </div>
                </div>
              </section>)}
            </div>}
          </div>
          <footer className="flex shrink-0 items-center justify-end gap-2 border-t border-slate-100 px-5 py-3">
            <span className="mr-auto text-xs text-slate-500">
              {draft.length} image{draft.length > 1 ? 's' : ''}
              {zoneChoice && draft.length > 0
                ? ` · ${draftCounts.lead} avec l’énoncé · ${draftCounts.content} avec le contenu${draftCounts.item > 0 ? ` · ${draftCounts.item} sur une question` : ''}`
                : ''}
              {hasBlank ? ' · renseignez les URL vides' : ''}
            </span>
            <button type="button" disabled={uploading} onClick={() => setOpen(false)} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold">Annuler</button>
            <button type="button" disabled={uploading || hasBlank} onClick={() => { onChange(mediaFromImages(draft)); setOpen(false); }} className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white disabled:opacity-40">Enregistrer</button>
          </footer>
        </div>
      </div>, document.body)}
  </>;
}
