import type { ActionMessage } from './types';

export function ActionFeedback({ message }: { message: ActionMessage | null }) {
  if (!message) return null;
  return (
    <div
      role={message.tone === 'error' ? 'alert' : 'status'}
      aria-live={message.tone === 'error' ? 'assertive' : 'polite'}
      className={`rounded-xl border px-4 py-3 text-[12px] font-medium ${
        message.tone === 'error'
          ? 'border-rose-200 bg-rose-50 text-rose-700'
          : 'border-emerald-200 bg-emerald-50 text-emerald-700'
      }`}
    >
      {message.text}
    </div>
  );
}
