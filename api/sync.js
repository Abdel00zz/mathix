import { verifyAdminRequest } from './_auth.js';
import { ADMIN_WRITE_NS, isPlainObject, isValidStudentId } from './_crdt.js';
import { extractFirebaseToken, verifyFirebaseIdToken } from './_firebase.js';
import {
  getAdminSyncSnapshot,
  getStudentSyncSnapshot,
  mergeAdminSync,
  mergeStudentSync,
  parseJsonBody,
  persistenceMode,
  setCommonHeaders,
} from './_store.js';

function getQueryParam(req, name) {
  if (req.query && req.query[name] !== undefined) {
    return Array.isArray(req.query[name]) ? req.query[name][0] : String(req.query[name]);
  }
  try {
    const u = new URL(req.url || '/', 'http://localhost');
    return u.searchParams.get(name) || '';
  } catch {
    return '';
  }
}

export default async function handler(req, res) {
  setCommonHeaders(res);
  try {
    if (req.method === 'GET') {
      const scope = getQueryParam(req, 'scope') === 'admin' ? 'admin' : 'student';
      const since = Math.max(0, Number.parseInt(getQueryParam(req, 'since'), 10) || 0);
      const stSince = Math.max(0, Number.parseInt(getQueryParam(req, 'stSince'), 10) || 0);
      const studentId = getQueryParam(req, 'studentId');

      if (scope === 'admin') {
        const isAdmin = await verifyAdminRequest(req);
        if (!isAdmin) {
          return res.status(401).json({ ok: false, error: 'Authentification administrateur requise' });
        }
        const snap = await getAdminSyncSnapshot({ since });
        return res.status(200).json({
          ok: true,
          backend: 'vercel',
          persistence: persistenceMode,
          scope: 'admin',
          ...snap,
        });
      }

      const rawFbToken = extractFirebaseToken(req);
      const fbUser = rawFbToken ? await verifyFirebaseIdToken(rawFbToken) : null;
      const snap = await getStudentSyncSnapshot(studentId, { sincePub: since, sinceSt: stSince, fbUser });
      return res.status(200).json({
        ok: true,
        backend: 'vercel',
        persistence: persistenceMode,
        scope: 'student',
        authenticated: Boolean(fbUser),
        uid: fbUser?.uid || null,
        ...snap,
      });
    }

    if (req.method === 'POST') {
      const body = await parseJsonBody(req);
      const namespaces = isPlainObject(body?.namespaces) ? body.namespaces : {};
      const events = Array.isArray(body?.events) ? body.events : [];
      const reqScope = body?.scope === 'admin' ? 'admin' : 'student';
      const touchesAdminNs = Object.keys(namespaces).some((k) => ADMIN_WRITE_NS.has(k));

      if (reqScope === 'admin' || touchesAdminNs) {
        const isAdmin = await verifyAdminRequest(req);
        if (!isAdmin) {
          return res.status(403).json({
            ok: false,
            error: 'Droits administrateur requis pour publier ou modifier la plateforme',
          });
        }
        const resAdmin = await mergeAdminSync({ namespaces, events });
        return res.status(200).json({
          ok: true,
          backend: 'vercel',
          persistence: persistenceMode,
          scope: 'admin',
          ...resAdmin,
        });
      }

      const rawFbToken = extractFirebaseToken(req, body);
      const fbUser = rawFbToken ? await verifyFirebaseIdToken(rawFbToken) : null;
      const studentId = fbUser?.uid || String(body?.studentId || '').trim();
      if (!fbUser && !isValidStudentId(studentId)) {
        return res.status(400).json({ ok: false, error: 'Identifiant élève invalide' });
      }

      const merged = await mergeStudentSync(studentId, namespaces, events, {
        fbUser,
        reset: Boolean(body?.reset),
      });
      const sincePub = Math.max(0, Number(body?.sincePub) || 0);
      const pubSnap = sincePub < merged.pubRev
        ? await getStudentSyncSnapshot(studentId, { sincePub: 0, sinceSt: merged.stRev, fbUser })
        : null;

      return res.status(200).json({
        ok: true,
        backend: 'vercel',
        persistence: persistenceMode,
        scope: 'student',
        authenticated: Boolean(fbUser),
        uid: fbUser?.uid || null,
        updated: merged.updated,
        rev: merged.pubRev,
        stRev: merged.stRev,
        student: merged.student,
        ...(pubSnap?.changed ? { overrides: pubSnap.overrides, config: pubSnap.config } : {}),
        syncedAt: Date.now(),
      });
    }

    return res.status(405).json({ ok: false, error: 'Méthode non autorisée' });
  } catch (err) {
    const status = Number(err?.statusCode) || 500;
    return res.status(status).json({
      ok: false,
      error: status >= 500 ? 'Erreur serveur de synchronisation' : String(err?.message || err),
    });
  }
}
