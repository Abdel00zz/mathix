import { verifyAdminRequest } from './_auth.js';
import {
  appendEvent,
  listEvents,
  parseJsonBody,
  persistenceMode,
  setCommonHeaders,
} from './_store.js';

export default async function handler(req, res) {
  setCommonHeaders(res);
  try {
    if (req.method === 'GET') {
      const isAdmin = await verifyAdminRequest(req);
      if (!isAdmin) {
        return res.status(401).json({ ok: false, error: 'Authentification administrateur requise' });
      }
      const events = await listEvents(120);
      return res.status(200).json({ ok: true, persistence: persistenceMode, events });
    }
    if (req.method === 'POST') {
      const body = await parseJsonBody(req);
      const isAdmin = await verifyAdminRequest(req);
      const actor = isAdmin ? (body?.actor || 'admin') : 'eleve';
      const ok = await appendEvent(body?.type || 'info', body?.message || '', actor);
      if (!ok) {
        return res.status(400).json({ ok: false, error: 'Message d’événement requis' });
      }
      return res.status(200).json({ ok: true, persistence: persistenceMode });
    }
    return res.status(405).json({ ok: false, error: 'Méthode non autorisée' });
  } catch (err) {
    const status = Number(err?.statusCode) || 500;
    return res.status(status).json({
      ok: false,
      error: status >= 500 ? 'Erreur serveur événements' : String(err?.message || err),
    });
  }
}
