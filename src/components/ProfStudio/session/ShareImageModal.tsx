import { useEffect, useRef, useState } from 'react';
import { ImagePlus, Loader2, X } from 'lucide-react';
import type { ClassStudentProgress } from '../../../services/professorClassroomService';

interface ShareImageModalProps {
  student: ClassStudentProgress;
  onClose: () => void;
  onSubmit: (student: ClassStudentProgress, caption: string, file: File) => Promise<void>;
}

export function ShareImageModal({ student, onClose, onSubmit }: ShareImageModalProps) {
  const [caption, setCaption] = useState('');
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const sendingRef = useRef(false);

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeButtonRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !sendingRef.current) onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      previousFocus?.focus();
    };
  }, [onClose]);

  const submitFile = async (file: File | null) => {
    if (!file) return;
    sendingRef.current = true;
    setSending(true);
    setMessage(null);
    try {
      await onSubmit(student, caption, file);
      onClose();
    } catch (error) {
      setMessage(error instanceof Error && error.message
        ? error.message
        : 'Partage impossible. Vérifiez la connexion puis réessayez.');
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[130] grid place-items-center bg-slate-950/40 px-4" role="presentation" onMouseDown={() => { if (!sending) onClose(); }}>
      <div className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-5 shadow-[0_30px_70px_-24px_rgba(15,23,42,0.45)]" role="dialog" aria-modal="true" aria-labelledby="share-title" aria-describedby="share-description" onMouseDown={event => event.stopPropagation()}>
        <div className="mb-3 flex items-start gap-2.5">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-emerald-100 text-emerald-700"><ImagePlus size={17} aria-hidden="true" /></span>
          <div className="min-w-0 flex-1">
            <h2 id="share-title" className="text-sm font-bold text-slate-900">Partager une image</h2>
            <p id="share-description" className="text-[11px] text-slate-400">À {student.name} — visible par toute la classe.</p>
          </div>
          <button ref={closeButtonRef} type="button" onClick={onClose} disabled={sending} className="grid h-8 w-8 place-items-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-700" aria-label="Fermer la fenêtre"><X size={16} /></button>
        </div>
        <label className="block">
          <span className="mb-1 block text-[11px] font-semibold text-slate-600">Légende (optionnelle)</span>
          <input value={caption} onChange={event => setCaption(event.target.value)} className="mb-3 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-indigo-400 focus-visible:ring-2 focus-visible:ring-indigo-100" />
        </label>
        <label className={`mb-3 flex h-24 cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-slate-300 bg-slate-50 text-slate-500 transition ${sending ? 'pointer-events-none opacity-60' : 'hover:border-emerald-300 hover:bg-emerald-50/40'}`}>
          {sending ? <><Loader2 size={18} className="animate-spin" aria-hidden="true" /><span className="text-[11px] font-semibold">Envoi…</span></> : <><ImagePlus size={18} aria-hidden="true" /><span className="text-[11px] font-semibold">Choisir une image (PNG ou JPEG)</span></>}
          <input type="file" accept="image/png,image/jpeg" className="sr-only" disabled={sending} onChange={event => void submitFile(event.target.files?.[0] || null)} />
        </label>
        {message && <p role="alert" aria-live="assertive" className="mb-2 text-center text-[11px] font-medium text-rose-600">{message}</p>}
        <div className="flex justify-end">
          <button type="button" onClick={onClose} disabled={sending} className="inline-flex h-9 items-center rounded-md border border-slate-200 px-3 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 disabled:opacity-40">Annuler</button>
        </div>
      </div>
    </div>
  );
}
