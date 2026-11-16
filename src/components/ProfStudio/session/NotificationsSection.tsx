import { useState, type FormEvent } from 'react';
import { CheckCircle2, Loader2, Send } from 'lucide-react';
import { resolveNotifyTemplates, type NotifyTemplate } from '../notifyTemplates';

interface NotificationsSectionProps {
  classLabel: string;
  templates?: NotifyTemplate[];
  enrolledCount: number;
  presentCount: number;
  onSend: (title: string, body: string, absentOnly: boolean) => Promise<number>;
}

/** Onglet « Messages » : une notification, une audience, un envoi. */
export function NotificationsSection({ classLabel, templates, enrolledCount, presentCount, onSend }: NotificationsSectionProps) {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [absentOnly, setAbsentOnly] = useState(false);
  const [sending, setSending] = useState(false);
  const [feedback, setFeedback] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const targetCount = Math.max(0, absentOnly ? enrolledCount - presentCount : enrolledCount);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!title.trim() || !body.trim()) return;
    if (targetCount <= 0) {
      setFeedback({ tone: 'error', text: 'Aucun élève ne correspond aux destinataires sélectionnés.' });
      return;
    }
    const recipientLabel = `${targetCount} élève${targetCount > 1 ? 's' : ''}`
      + (absentOnly ? ` marqué${targetCount > 1 ? 's' : ''} absent${targetCount > 1 ? 's' : ''}` : '');
    if (!window.confirm(`Envoyer cette notification à ${recipientLabel} ?`)) return;
    setSending(true);
    setFeedback(null);
    try {
      const sent = await onSend(title, body, absentOnly);
      setFeedback({ tone: 'ok', text: `Notification envoyée à ${sent} élève${sent > 1 ? 's' : ''}.` });
      setTitle('');
      setBody('');
    } catch {
      setFeedback({ tone: 'error', text: 'Envoi impossible. Vérifiez la connexion puis réessayez.' });
    } finally {
      setSending(false);
    }
  };

  const quickTemplates = resolveNotifyTemplates(templates);

  return (
    <section className="prof-panel overflow-hidden" aria-labelledby="notifications-title">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-slate-100 px-4 py-3">
        <div className="mr-auto">
          <h2 id="notifications-title" className="prof-section-title">Message à la classe</h2>
          <p className="prof-meta">
            Notification poussée aux comptes élèves de {classLabel}.
          </p>
        </div>
        <span className="prof-chip prof-chip-blue" role="status" aria-live="polite">
          {targetCount} destinataire{targetCount > 1 ? 's' : ''}
        </span>
      </div>

      <form onSubmit={event => void submit(event)} className="space-y-4 p-4">
        {quickTemplates.length > 0 && (
          <div>
            <span className="prof-label mb-1.5 block">Modèles rapides</span>
            <div className="flex flex-wrap gap-1.5">
              {quickTemplates.map(template => (
                <button
                  key={template.key}
                  type="button"
                  onClick={() => { setTitle(template.title); setBody(template.body); }}
                  className="prof-button-secondary px-2.5 text-[11.5px] rounded-md"
                >
                  {template.title}
                </button>
              ))}
            </div>
          </div>
        )}

        <label className="block">
          <span className="prof-label mb-1.5 block">Titre</span>
          <input
            value={title}
            onChange={event => setTitle(event.target.value)}
            placeholder="Ex. La séance commence dans 10 minutes"
            required
            className="prof-input w-full px-3 outline-none"
          />
        </label>

        <label className="block">
          <span className="prof-label mb-1.5 block">Message</span>
          <textarea
            value={body}
            onChange={event => setBody(event.target.value)}
            placeholder="Rédigez un message simple et actionnable…"
            rows={4}
            required
            className="prof-input w-full resize-y px-3 py-2.5 font-normal leading-relaxed outline-none"
          />
        </label>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-[#f0f0f0] pt-3">
          <label className="flex cursor-pointer items-center gap-2 text-[13px] font-medium text-slate-700">
            <input
              type="checkbox"
              checked={absentOnly}
              onChange={event => setAbsentOnly(event.target.checked)}
              className="h-4 w-4 rounded border-slate-300 accent-[#1677ff]"
            />
            Absents uniquement
          </label>
          <button
            type="submit"
            disabled={sending || !title.trim() || !body.trim() || targetCount === 0}
            className="prof-button-primary ml-auto px-4"
          >
            {sending ? <Loader2 size={15} className="animate-spin" aria-hidden="true" /> : <Send size={15} aria-hidden="true" />}
            {targetCount ? `Envoyer à ${targetCount}` : 'Aucun destinataire'}
          </button>
        </div>

        {feedback && (
          <p
            className={`flex items-center gap-2 text-xs font-semibold ${feedback.tone === 'ok' ? 'text-emerald-700' : 'text-rose-600'}`}
            role="status"
            aria-live="polite"
          >
            {feedback.tone === 'ok' && <CheckCircle2 size={15} aria-hidden="true" />}{feedback.text}
          </p>
        )}
      </form>
    </section>
  );
}
