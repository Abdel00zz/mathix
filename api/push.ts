import {
  redis,
  type ApiRequest,
  type ApiResponse,
  isAuthorized,
  buildNotifyPayload,
  loadSubscribers,
  sendToSubscribers,
  subscriberAllows,
  cleanupExpired,
  logHistory,
  getHistory,
  readActiveAccountSession,
} from '../src/server/professor/shared.js';

// ── Subscribe ──────────────────────────────────────────────────────────────
async function handleSubscribe(req: ApiRequest, res: ApiResponse) {
  const { subscription, prefs } = req.body || {};

  if (!subscription?.endpoint) {
    return res.status(400).json({ error: 'Missing subscription endpoint' });
  }

  const account = await readActiveAccountSession(req);
  if (!account) return res.status(401).json({ error: 'account_session_required' });
  if (account.user?.role !== 'student') {
    return res.status(403).json({ error: 'student_account_required' });
  }
  const accountId = String(account.user?.accountId || '').trim();
  const studentName = String(account.user?.name || '').trim();
  const classId = String(account.user?.classId || '').trim();
  if (!accountId || !studentName || !classId) {
    return res.status(409).json({ error: 'account_profile_incomplete' });
  }

  const key = `push:${Buffer.from(subscription.endpoint).toString('base64url').slice(0, 40)}`;

  // Réconcilier l'index de classe : si l'élève a changé de classe, le retirer de
  // l'ancien index pour que le ciblage par classe reste exact.
  const prevRaw = await redis.get(key) as string | null;
  let previous: any = null;
  if (prevRaw) {
    try {
      previous = typeof prevRaw === 'string' ? JSON.parse(prevRaw) : prevRaw;
      if (previous?.classId && previous.classId !== (classId || '')) {
        await redis.srem(`push:class:${previous.classId}`, key);
      }
    } catch { /* ignore */ }
  }

  await redis.set(key, JSON.stringify({
    subscription,
    studentName: studentName || 'Anonyme',
    classId: classId || '',
    // Identité canonique de l'élève : seule cible admise pour les notifications
    // du professeur (aucun repli par nom pour les anciens abonnements).
    accountId,
    subscribedAt: previous?.subscribedAt || Date.now(),
    lastActive: Date.now(),
    // Préférences de l'élève (plage silencieuse, catégories). Conservées si
    // l'appel ne les porte pas : une réparation d'abonnement en arrière-plan
    // ne doit pas réactiver ce que l'élève a coupé.
    prefs: prefs || previous?.prefs || null,
  }));

  await redis.sadd('push:subscribers', key);
  if (classId) await redis.sadd(`push:class:${classId}`, key);
  return res.status(200).json({ success: true });
}

// ── Unsubscribe ────────────────────────────────────────────────────────────
async function handleUnsubscribe(req: ApiRequest, res: ApiResponse) {
  const { endpoint } = req.body || {};

  if (!endpoint) {
    return res.status(400).json({ error: 'Missing endpoint' });
  }

  const account = await readActiveAccountSession(req);
  if (!account) return res.status(401).json({ error: 'account_session_required' });

  const key = `push:${Buffer.from(endpoint).toString('base64url').slice(0, 40)}`;

  const raw = await redis.get(key) as string | null;
  let classId = '';
  let ownerId = '';
  if (raw) {
    try {
      const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
      classId = parsed?.classId || '';
      ownerId = String(parsed?.accountId || '');
    } catch { /* ignore */ }
  }
  if (ownerId && ownerId !== String(account.user?.accountId || '')) {
    return res.status(403).json({ error: 'forbidden' });
  }

  await redis.del(key);
  await redis.srem('push:subscribers', key);
  if (classId) await redis.srem(`push:class:${classId}`, key);
  return res.status(200).json({ success: true });
}

// ── Build payload + dispatch (réutilisé par send / report / scheduled) ───────

interface NotifySpec {
  title: string;
  body: string;
  url?: string;
  tag?: string;
  type?: string;
  priority?: string;
  image?: string;
  targetClass?: string;
  targetStudent?: string;
}

async function dispatchNotification(spec: NotifySpec): Promise<{ sent: number; failed: number; cleaned: number }> {
  // Sélection des destinataires
  let keys: string[];
  if (spec.targetClass) {
    keys = await redis.smembers(`push:class:${spec.targetClass}`) as string[];
    if (!keys.length) keys = await redis.smembers('push:subscribers') as string[];
  } else {
    keys = await redis.smembers('push:subscribers') as string[];
  }
  if (!keys.length) return { sent: 0, failed: 0, cleaned: 0 };

  const { subs, orphans } = await loadSubscribers(keys);
  let targeted = subs;
  if (spec.targetClass) targeted = targeted.filter(s => s.data.classId === spec.targetClass);
  if (spec.targetStudent) targeted = targeted.filter(s => s.data.studentName === spec.targetStudent);
  // Messages humains : respecter les préférences (catégorie + plage silencieuse),
  // sauf priorité haute qui traverse la plage silencieuse.
  targeted = targeted.filter(s => subscriberAllows(s.data.prefs, 'messages', new Date(), { bypassQuiet: spec.priority === 'high' }));

  const payload = buildNotifyPayload(spec);

  const { sent, failed, expired } = await sendToSubscribers(targeted, payload);
  const cleaned = await cleanupExpired([...expired, ...orphans.map(k => ({ key: k }))]);
  return { sent, failed, cleaned };
}

// ── Send (manuel : admin ou script) ──────────────────────────────────────────
async function handleSend(req: ApiRequest, res: ApiResponse) {
  if (!isAuthorized(req)) return res.status(401).json({ error: 'Unauthorized' });

  const { title, body, url, tag, type, priority, targetStudent, targetClass, image } = req.body;
  if (!title || !body) return res.status(400).json({ error: 'Missing title or body' });

  const result = await dispatchNotification({ title, body, url, tag, type, priority, targetStudent, targetClass, image });

  await logHistory({ at: Date.now(), kind: 'manual', title, body, targetClass: targetClass || '', sent: result.sent, failed: result.failed });
  return res.status(200).json({ success: true, ...result });
}

// ── Pilotage de chapitre ─────────────────────────────────────────────────────
// pilot:{classId} → { chapterId, chapterTitle, startedAt, deadline, note,
//   quizAsap, exercises: [{ id, minutes }], updatedAt }
// L'admin déclare le chapitre « en cours » d'une classe, les exercices
// prescrits (avec objectif de temps) et la règle quiz. Les élèves lisent
// cette déclaration (lecture publique par classe, aucune donnée sensible).

async function handlePilotSet(req: ApiRequest, res: ApiResponse) {
  if (!isAuthorized(req)) return res.status(401).json({ error: 'Unauthorized' });

  const { classId, pilot } = req.body || {};
  if (!classId || !pilot?.chapterId) {
    return res.status(400).json({ error: 'Missing classId or pilot.chapterId' });
  }

  const clean = {
    chapterId: String(pilot.chapterId),
    chapterTitle: String(pilot.chapterTitle || pilot.chapterId).replace(/\$[^$]*\$/g, '').trim(),
    startedAt: pilot.startedAt || Date.now(),
    deadline: pilot.deadline || null,
    note: String(pilot.note || '').slice(0, 500),
    quizAsap: pilot.quizAsap !== false,
    exercises: Array.isArray(pilot.exercises)
      ? pilot.exercises.slice(0, 60).map((e: any) => ({
          id: String(e.id || ''),
          minutes: Number(e.minutes) > 0 ? Math.min(Number(e.minutes), 240) : null,
        })).filter((e: any) => e.id)
      : [],
    updatedAt: Date.now(),
  };

  await redis.set(`pilot:${classId}`, JSON.stringify(clean));
  return res.status(200).json({ success: true, pilot: clean });
}

async function handlePilotGet(req: ApiRequest, res: ApiResponse) {
  const classId = req.body?.classId || req.query?.classId;
  if (!classId) return res.status(400).json({ error: 'Missing classId' });

  const raw = await redis.get(`pilot:${classId}`) as string | null;
  if (!raw) return res.status(200).json({ pilot: null });

  try {
    const pilot = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return res.status(200).json({ pilot });
  } catch {
    return res.status(200).json({ pilot: null });
  }
}

async function handlePilotDelete(req: ApiRequest, res: ApiResponse) {
  if (!isAuthorized(req)) return res.status(401).json({ error: 'Unauthorized' });
  const { classId } = req.body || {};
  if (!classId) return res.status(400).json({ error: 'Missing classId' });

  await redis.del(`pilot:${classId}`);
  return res.status(200).json({ success: true });
}

// ── Historique ───────────────────────────────────────────────────────────────
async function handleHistory(req: ApiRequest, res: ApiResponse) {
  if (!isAuthorized(req)) return res.status(401).json({ error: 'Unauthorized' });
  const limit = Number(req.body?.limit || req.query?.limit || 50);
  const history = await getHistory(Math.min(Math.max(1, limit), 200));
  return res.status(200).json({ history });
}

// ── Router ─────────────────────────────────────────────────────────────────
export default async function handler(req: ApiRequest, res: ApiResponse) {
  res.setHeader?.('Cache-Control', 'private, no-store, max-age=0');
  res.setHeader?.('Vary', 'Cookie');
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const action = req.query?.action || req.body?.action;

  try {
    switch (action) {
      case 'subscribe':        return await handleSubscribe(req, res);
      case 'unsubscribe':      return await handleUnsubscribe(req, res);
      case 'send':             return await handleSend(req, res);
      case 'pilot-set':        return await handlePilotSet(req, res);
      case 'pilot-get':        return await handlePilotGet(req, res);
      case 'pilot-delete':     return await handlePilotDelete(req, res);
      case 'history':          return await handleHistory(req, res);
      default:                 return res.status(400).json({ error: 'Invalid action' });
    }
  } catch (error: any) {
    console.error('Push handler error:', error);
    return res.status(500).json({ error: 'internal_push_error' });
  }
}
