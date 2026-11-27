import fs from 'node:fs';
import path from 'node:path';
import { verifyAdminRequest } from './_auth.js';
import { appendEvent, parseJsonBody, persistenceMode, setCommonHeaders } from './_store.js';

const MAX_UPLOAD_BYTES = 750 * 1024;
const IMG_EXTS = new Set(['png', 'jpg', 'jpeg', 'webp', 'svg', 'gif']);

function resolvePublicDir() {
  const candidates = [
    process.env.MATHIX_ROOT ? path.join(process.env.MATHIX_ROOT, 'public') : '',
    path.join(process.cwd(), 'public'),
    path.join(process.cwd(), 'dist', 'public'),
  ].filter(Boolean);
  for (const dir of candidates) {
    if (fs.existsSync(dir)) return dir;
  }
  return path.join(process.cwd(), 'public');
}

function walkMedia(publicRoot, dir, out) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const ent of entries) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      if (ent.name === 'aistudio') continue;
      walkMedia(publicRoot, full, out);
      continue;
    }
    const lower = ent.name.toLowerCase();
    if (lower.startsWith('favicon') || lower.startsWith('icon-') || lower.startsWith('logo')) continue;
    const ext = path.extname(lower).slice(1);
    if (!IMG_EXTS.has(ext)) continue;
    const rel = path.relative(publicRoot, full).replace(/\\/g, '/');
    const folderRaw = path.dirname(rel).replace(/\\/g, '/');
    const folder = !folderRaw || folderRaw === '.' ? '.' : folderRaw;
    let size = 0;
    try {
      size = fs.statSync(full).size;
    } catch {}
    out.push({ url: `/${rel}`, name: ent.name, folder, size });
  }
}

function sniffImageFormat(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 12) return null;
  if (
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47 &&
    buf[4] === 0x0d &&
    buf[5] === 0x0a &&
    buf[6] === 0x1a &&
    buf[7] === 0x0a
  ) {
    return 'png';
  }
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return 'jpeg';
  }
  if (
    buf[0] === 0x52 &&
    buf[1] === 0x49 &&
    buf[2] === 0x46 &&
    buf[3] === 0x46 &&
    buf[8] === 0x57 &&
    buf[9] === 0x45 &&
    buf[10] === 0x42 &&
    buf[11] === 0x50
  ) {
    return 'webp';
  }
  if (
    buf[0] === 0x47 &&
    buf[1] === 0x49 &&
    buf[2] === 0x46 &&
    buf[3] === 0x38 &&
    (buf[4] === 0x37 || buf[4] === 0x39) &&
    buf[5] === 0x61
  ) {
    return 'gif';
  }
  return null;
}

function slugifyName(rawName) {
  const stem = String(rawName || 'figure').replace(/\.[^.]+$/, '');
  const slug = stem
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  return slug || 'figure';
}

export default async function handler(req, res) {
  setCommonHeaders(res);
  try {
    if (req.method === 'GET') {
      const isAdmin = await verifyAdminRequest(req);
      if (!isAdmin) {
        return res.status(401).json({ ok: false, error: 'Authentification administrateur requise' });
      }
      const publicDir = resolvePublicDir();
      const files = [];
      walkMedia(publicDir, publicDir, files);
      files.sort((a, b) => a.folder.localeCompare(b.folder) || a.name.localeCompare(b.name));
      return res.status(200).json({ ok: true, persistence: persistenceMode, files });
    }

    if (req.method === 'POST') {
      const isAdmin = await verifyAdminRequest(req);
      if (!isAdmin) {
        return res.status(403).json({ ok: false, error: 'Droits administrateur requis' });
      }
      const body = await parseJsonBody(req);
      const dataUrl = typeof body?.dataUrl === 'string' ? body.dataUrl : '';
      const m = dataUrl.match(/^data:(image\/(?:webp|png|jpeg|gif));base64,([A-Za-z0-9+/=\s]+)$/);
      if (!m) {
        return res.status(400).json({
          ok: false,
          error: 'dataUrl image invalide (WebP, PNG, JPEG ou GIF attendu)',
        });
      }
      const mime = m[1];
      const b64 = m[2].replace(/\s+/g, '');
      const buf = Buffer.from(b64, 'base64');
      if (!buf.length || buf.length > MAX_UPLOAD_BYTES) {
        return res.status(413).json({
          ok: false,
          error: 'Image trop volumineuse (max 750 Ko après compression)',
        });
      }
      const fmtMap = {
        'image/webp': { fmt: 'webp', ext: 'webp' },
        'image/png': { fmt: 'png', ext: 'png' },
        'image/jpeg': { fmt: 'jpeg', ext: 'jpg' },
        'image/gif': { fmt: 'gif', ext: 'gif' },
      };
      const expected = fmtMap[mime];
      if (!expected || sniffImageFormat(buf) !== expected.fmt) {
        return res.status(400).json({
          ok: false,
          error: 'Signature binaire incohérente avec le format image déclaré',
        });
      }

      const publicDir = resolvePublicDir();
      const uploadDir = path.join(publicDir, 'images', 'uploads');
      try {
        fs.mkdirSync(uploadDir, { recursive: true });
        const fileName = `${Date.now().toString(36)}-${slugifyName(body?.filename)}.${expected.ext}`;
        const target = path.join(uploadDir, fileName);
        fs.writeFileSync(target, buf);
        const urlPath = `/images/uploads/${fileName}`;
        const kb = Math.round(buf.length / 1024);
        await appendEvent('media-upload', `Image importée : ${urlPath} (${kb} Ko)`, 'admin');
        return res.status(200).json({ ok: true, url: urlPath, bytes: buf.length });
      } catch {
        return res.status(501).json({
          ok: false,
          error: 'Système de fichiers en lecture seule sur cette instance Serverless : importez vos images en local puis déployez.',
        });
      }
    }

    return res.status(405).json({ ok: false, error: 'Méthode non autorisée' });
  } catch (err) {
    const status = Number(err?.statusCode) || 500;
    return res.status(status).json({
      ok: false,
      error: status >= 500 ? 'Erreur médiathèque' : String(err?.message || err),
    });
  }
}
