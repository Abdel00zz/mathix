import { verifyAdminRequest } from '../_auth.js';
import { ADMIN_ONLY_READ_NS, ADMIN_WRITE_NS, isValidKey } from '../_crdt.js';
import {
  VALID_NS,
  appendEvent,
  getNamespace,
  parseJsonBody,
  persistenceMode,
  setCommonHeaders,
  setNamespaceKey,
} from '../_store.js';

export default async function handler(req, res) {
  setCommonHeaders(res);
  const ns = String(req.query?.ns ?? '');
  if (!VALID_NS.has(ns)) {
    return res.status(404).json({ ok: false, error: `Namespace inconnu : ${ns}` });
  }
  try {
    if (req.method === 'GET') {
      if (ADMIN_ONLY_READ_NS.has(ns)) {
        const isAdmin = await verifyAdminRequest(req);
        if (!isAdmin) {
          return res.status(401).json({ ok: false, error: 'Authentification administrateur requise' });
        }
      }
      const data = await getNamespace(ns);
      return res.status(200).json({ ok: true, ns, persistence: persistenceMode, data });
    }
    if (req.method === 'POST') {
      if (ADMIN_WRITE_NS.has(ns)) {
        const isAdmin = await verifyAdminRequest(req);
        if (!isAdmin) {
          return res.status(403).json({ ok: false, error: 'Droits administrateur requis' });
        }
      }
      const body = await parseJsonBody(req);
      if (!isValidKey(body?.key)) {
        return res.status(400).json({ ok: false, error: 'Champ « key » requis ou invalide' });
      }
      await setNamespaceKey(ns, body.key, body.value ?? null);
      await appendEvent('sync', `${ns}/${body.key} mis à jour`, ADMIN_WRITE_NS.has(ns) ? 'admin' : 'eleve');
      return res.status(200).json({ ok: true, ns, key: body.key, persistence: persistenceMode });
    }
    return res.status(405).json({ ok: false, error: 'Méthode non autorisée' });
  } catch (err) {
    const status = Number(err?.statusCode) || 500;
    return res.status(status).json({
      ok: false,
      error: status >= 500 ? 'Erreur serveur store' : String(err?.message || err),
    });
  }
}
