import type { DocDrawing } from '../utils/annotationsStore';
import { professorSessionService } from './professorSessionService';

const timers = new Map<string, ReturnType<typeof setTimeout>>();
const pending = new Map<string, DocDrawing>();
const inFlight = new Set<string>();
let onlineListenerBound = false;

function scheduleFlush(docKey: string, delay = 750): void {
  const previous = timers.get(docKey);
  if (previous) clearTimeout(previous);
  timers.set(docKey, setTimeout(() => {
    timers.delete(docKey);
    void flush(docKey);
  }, delay));
}

async function flush(docKey: string): Promise<void> {
  if (inFlight.has(docKey) || !professorSessionService.isProfessor()) return;
  const drawing = pending.get(docKey);
  if (!drawing) return;
  pending.delete(docKey);
  inFlight.add(docKey);

  try {
    const res = await fetch('/api/professor?action=canvas-save', {
      method: 'POST',
      headers: professorSessionService.headers(),
      body: JSON.stringify({ docKey, drawing }),
      keepalive: true,
    });
    if (!res.ok) throw new Error('Canvas sync failed');
  } catch {
    const newer = pending.get(docKey);
    if (!newer || Number(newer.updatedAt) < Number(drawing.updatedAt)) pending.set(docKey, drawing);
    scheduleFlush(docKey, 2_500);
  } finally {
    inFlight.delete(docKey);
    if (pending.has(docKey) && !timers.has(docKey)) scheduleFlush(docKey, 120);
  }
}

function bindOnlineRetry(): void {
  if (onlineListenerBound || typeof window === 'undefined') return;
  onlineListenerBound = true;
  window.addEventListener('online', () => {
    for (const docKey of pending.keys()) scheduleFlush(docKey, 50);
  });
}

export const teacherCanvasSyncService = {
  async load(docKey: string): Promise<DocDrawing | null> {
    if (!professorSessionService.isProfessor()) return null;
    try {
      const res = await fetch('/api/professor?action=canvas-load', {
        method: 'POST',
        headers: professorSessionService.headers(),
        body: JSON.stringify({ docKey }),
        cache: 'no-store',
      });
      if (!res.ok) return null;
      const data = await res.json();
      return data.found ? data.drawing as DocDrawing : null;
    } catch { return null; }
  },

  scheduleSave(docKey: string, drawing: DocDrawing): void {
    if (!professorSessionService.isProfessor()) return;
    bindOnlineRetry();
    pending.set(docKey, drawing);
    scheduleFlush(docKey);
  },

  async saveImage(imageId: string, image: { dataUri: string; width: number; height: number; ratio: number; bytes: number; createdAt: number }): Promise<void> {
    if (!professorSessionService.isProfessor()) return;
    const res = await fetch('/api/professor?action=image-save', {
      method: 'POST',
      headers: professorSessionService.headers(),
      body: JSON.stringify({ imageId, image }),
    });
    // Le statut permet à la file d'envoi de distinguer un refus définitif
    // (413, 400) d'une panne passagère à rejouer.
    if (!res.ok) throw Object.assign(new Error('Synchronisation de l’image impossible'), { status: res.status });
  },

  async loadImage(imageId: string): Promise<{ dataUri: string; width: number; height: number; ratio: number; bytes: number; createdAt: number } | null> {
    if (!professorSessionService.isProfessor()) return null;
    try {
      const res = await fetch('/api/professor?action=image-load', {
        method: 'POST',
        headers: professorSessionService.headers(),
        body: JSON.stringify({ imageId }),
        cache: 'no-store',
      });
      if (!res.ok) return null;
      const data = await res.json();
      return data.found ? data.image : null;
    } catch { return null; }
  },
};
