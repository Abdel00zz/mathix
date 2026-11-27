import { pingStore, setCommonHeaders } from './_store.js';

export default async function handler(req, res) {
  setCommonHeaders(res);
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return res.status(405).json({ ok: false, error: 'Méthode non autorisée' });
  }
  const status = await pingStore();
  return res.status(status.ok ? 200 : 503).json({
    ...status,
    backend: process.env.MATHIX_LOCAL_NODE === '1' ? 'node+firestore' : 'vercel',
    version: '2.3.0',
    engines: {
      math: 'math_engine 1.5.0',
      json: 'json_engine 1.7.0',
    },
  });
}
