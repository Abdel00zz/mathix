import {
  authenticateAdminPasscode,
  changeAdminPasscode,
  checkAuthRateLimit,
  claimFirstRunAdmin,
  clearAuthFailures,
  getAuthStatus,
  recordAuthFailure,
  refreshAdminToken,
  revokeAdminRequest,
} from './_auth.js';
import {
  appendEvent,
  parseJsonBody,
  persistenceMode,
  setCommonHeaders,
} from './_store.js';

export default async function handler(req, res) {
  setCommonHeaders(res);
  res.setHeader('Cache-Control', 'no-store');
  try {
    if (req.method === 'GET') {
      const status = await getAuthStatus(req);
      return res.status(200).json({
        ok: true,
        backend: 'vercel',
        persistence: persistenceMode,
        ...status,
      });
    }

    if (req.method === 'POST') {
      const rl = checkAuthRateLimit(req);
      if (!rl.allowed) {
        const mins = Math.ceil((rl.retryAfterSec || 60) / 60);
        return res.status(429).json({
          ok: false,
          error: `Accès temporairement bloqué. Réessayez dans ${mins} min.`,
          retryAfterSec: rl.retryAfterSec,
        });
      }

      const body = await parseJsonBody(req);
      const action = String(body?.action || 'login');

      if (action === 'refresh') {
        const ref = await refreshAdminToken(req);
        if (!ref.ok) {
          return res.status(ref.status || 401).json({ ok: false, error: ref.error });
        }
        return res.status(200).json({
          ok: true,
          backend: 'vercel',
          persistence: persistenceMode,
          mode: ref.mode,
          token: ref.token,
          expiresAt: ref.expiresAt,
        });
      }

      if (action === 'change-passcode') {
        const curPass = String(body?.currentPasscode ?? body?.current ?? '');
        const newPass = String(body?.newPasscode ?? body?.passcode ?? '');
        const changed = await changeAdminPasscode(req, curPass, newPass);
        if (!changed.ok) {
          if (changed.status === 401) {
            const fail = recordAuthFailure(req);
            const bodyErr = { ok: false, error: changed.error, remainingAttempts: fail.remainingAttempts };
            if (fail.retryAfterSec) bodyErr.retryAfterSec = fail.retryAfterSec;
            return res.status(401).json(bodyErr);
          }
          return res.status(changed.status || 400).json({ ok: false, error: changed.error });
        }
        clearAuthFailures(req);
        await appendEvent('admin-passcode-change', 'Code administrateur mis à jour', 'admin');
        return res.status(200).json({
          ok: true,
          backend: 'vercel',
          persistence: persistenceMode,
          mode: changed.mode,
          token: changed.token,
          expiresAt: changed.expiresAt,
        });
      }

      const passcode = String(body?.passcode ?? body?.pass ?? '');

      const result = action === 'claim'
        ? await claimFirstRunAdmin(passcode)
        : await authenticateAdminPasscode(passcode);

      if (!result.ok) {
        const fail = recordAuthFailure(req);
        const bodyErr = {
          ok: false,
          error: result.error || 'Authentification refusée.',
          remainingAttempts: fail.remainingAttempts,
        };
        if (fail.retryAfterSec) bodyErr.retryAfterSec = fail.retryAfterSec;
        return res.status(result.status || 401).json(bodyErr);
      }

      clearAuthFailures(req);
      await appendEvent(
        action === 'claim' ? 'admin-setup' : 'admin-login',
        action === 'claim'
          ? 'Accès administrateur initialisé'
          : 'Connexion console administration',
        'admin'
      );

      return res.status(200).json({
        ok: true,
        backend: 'vercel',
        persistence: persistenceMode,
        mode: result.mode,
        token: result.token,
        expiresAt: result.expiresAt,
      });
    }

    if (req.method === 'DELETE') {
      const revoked = await revokeAdminRequest(req);
      if (revoked) {
        await appendEvent('admin-logout', 'Déconnexion console administration', 'admin');
      }
      return res.status(200).json({ ok: true, revoked });
    }

    return res.status(405).json({ ok: false, error: 'Méthode non autorisée' });
  } catch (err) {
    const status = Number(err?.statusCode) || 500;
    return res.status(status).json({
      ok: false,
      error: status >= 500 ? 'Erreur interne d’authentification' : String(err?.message || err),
    });
  }
}
