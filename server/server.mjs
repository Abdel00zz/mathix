#!/usr/bin/env node
/**
 * server/server.mjs — Serveur local hybride Mathix (Node HTTP + Cloud Firestore + Upstash Redis + moteurs WASM).
 *
 * Charge automatiquement `.env`, expose exactement les mêmes routes `/api/*` que Vercel
 * (`auth`, `sync`, `events`, `media`, `store/*`, `health`, `rust/audit`) connectées en direct
 * à Google Cloud Firestore (`mathix-5a799`) et Upstash Redis, et sert les fichiers statiques
 * avec liste blanche stricte et en-tête `Cross-Origin-Opener-Policy: same-origin-allow-popups`
 * (requis par Google Sign-In côté élève).
 *
 * Si `MATHIX_NATIVE_RUST=1` est défini, délègue au binaire hors-ligne `engines/mathix-server`.
 */

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import url from 'node:url';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const VROOT = path.resolve(__dirname, '..');
process.env.MATHIX_ROOT = VROOT;

/** Charge `.env` dans `process.env` sans écraser les variables déjà définies dans le shell. */
function loadDotEnv(envFile) {
  if (!fs.existsSync(envFile)) return;
  const lines = fs.readFileSync(envFile, 'utf8').split(/\r?\n/);
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eqIdx = line.indexOf('=');
    if (eqIdx <= 0) continue;
    const key = line.slice(0, eqIdx).trim();
    let val = line.slice(eqIdx + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (key && process.env[key] === undefined) {
      process.env[key] = val;
    }
  }
}

loadDotEnv(path.join(VROOT, '.env'));

if (process.env.MATHIX_NATIVE_RUST === '1') {
  const binName = process.platform === 'win32' ? 'mathix-server.exe' : 'mathix-server';
  const rustBin = path.join(VROOT, 'engines', binName);
  if (!fs.existsSync(rustBin)) {
    console.error(`[server] binaire Rust introuvable : ${rustBin}`);
    process.exit(1);
  }
  const child = spawn(rustBin, [], {
    cwd: VROOT,
    env: { ...process.env, MATHIX_ROOT: VROOT },
    stdio: 'inherit',
  });
  child.on('exit', (code) => process.exit(code ?? 0));
} else {
  const [
    { default: authHandler },
    { default: syncHandler },
    { default: eventsHandler },
    { default: healthHandler },
    { default: mediaHandler },
    { default: storeNsHandler },
    { default: storeKeyHandler },
    { verifyAdminRequest },
    { getPersistenceMode },
  ] = await Promise.all([
    import('../api/auth.js'),
    import('../api/sync.js'),
    import('../api/events.js'),
    import('../api/health.js'),
    import('../api/media.js'),
    import('../api/store/[ns].js'),
    import('../api/store/[ns]/[key].js'),
    import('../api/_auth.js'),
    import('../api/_store.js'),
  ]);

  let jsonWasmCall = null;
  async function getJsonWasm() {
    if (jsonWasmCall) return jsonWasmCall;
    const wasmPath = path.join(VROOT, 'engines', 'json_engine.wasm');
    if (!fs.existsSync(wasmPath)) return null;
    const enc = new TextEncoder();
    const dec = new TextDecoder();
    const { instance } = await WebAssembly.instantiate(fs.readFileSync(wasmPath), {});
    const e = instance.exports;
    jsonWasmCall = (payload) => {
      const bytes = enc.encode(JSON.stringify(payload));
      const ptr = e.alloc(bytes.length);
      new Uint8Array(e.memory.buffer, ptr, bytes.length).set(bytes);
      e.process(ptr, bytes.length);
      e.dealloc(ptr, bytes.length);
      const out = dec.decode(new Uint8Array(e.memory.buffer, e.out_ptr(), e.out_len()));
      e.out_free();
      return JSON.parse(out);
    };
    return jsonWasmCall;
  }

  const MIME_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.webmanifest': 'application/manifest+json; charset=utf-8',
    '.wasm': 'application/wasm',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.gif': 'image/gif',
    '.ico': 'image/x-icon',
    '.woff2': 'font/woff2',
    '.woff': 'font/woff',
    '.ttf': 'font/ttf',
    '.txt': 'text/plain; charset=utf-8',
  };

  function isAllowedStaticPath(pathname) {
    if (!pathname || pathname.includes('/.') || pathname.startsWith('/.') || pathname.includes('..')) {
      return false;
    }
    if (
      pathname === '/' ||
      pathname === '/index.html' ||
      pathname === '/404.html' ||
      pathname === '/sw.js' ||
      pathname === '/manifest.webmanifest' ||
      pathname === '/robots.txt' ||
      pathname === '/favicon.svg' ||
      pathname === '/icon-maskable.svg' ||
      pathname === '/logo.png' ||
      pathname === '/admin/index.html'
    ) {
      return true;
    }
    if (pathname.startsWith('/engines/') && pathname.endsWith('.wasm')) {
      return true;
    }
    return (
      pathname.startsWith('/assets/') ||
      pathname.startsWith('/vendor/') ||
      pathname.startsWith('/public/') ||
      pathname.startsWith('/data/') ||
      pathname.startsWith('/images/')
    );
  }

  function safeResolve(baseDir, reqPath) {
    const clean = decodeURIComponent(reqPath).replace(/^\/+/, '');
    const resolved = path.resolve(baseDir, clean);
    const rel = path.relative(baseDir, resolved);
    if (rel.startsWith('..') || path.isAbsolute(rel)) return null;
    return resolved;
  }

  function augmentVercelCompat(req, res, parsedUrl) {
    req.query = Object.fromEntries(parsedUrl.searchParams.entries());
    res.status = (code) => {
      res.statusCode = code;
      return res;
    };
    res.json = (obj) => {
      if (!res.headersSent) {
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
      }
      res.end(JSON.stringify(obj));
      return res;
    };
  }

  const PUBLIC_DIR = path.join(VROOT, 'public');

  const server = http.createServer(async (req, res) => {
    const parsedUrl = new URL(req.url || '/', 'http://localhost');
    const pathname = parsedUrl.pathname;

    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');

    if (pathname.startsWith('/api/')) {
      augmentVercelCompat(req, res, parsedUrl);
      try {
        if (pathname === '/api/health') return await healthHandler(req, res);
        if (pathname === '/api/auth') return await authHandler(req, res);
        if (pathname === '/api/sync') return await syncHandler(req, res);
        if (pathname === '/api/events') return await eventsHandler(req, res);
        if (pathname === '/api/media') return await mediaHandler(req, res);

        if (pathname === '/api/rust/audit' && req.method === 'POST') {
          if (!(await verifyAdminRequest(req))) {
            return res.status(401).json({ ok: false, error: 'Authentification administrateur requise' });
          }
          const chunks = [];
          for await (const c of req) chunks.push(c);
          const body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
          const call = await getJsonWasm();
          if (!call) return res.status(500).json({ ok: false, error: 'json_engine.wasm introuvable' });
          const out = call({
            op: 'studio-audit',
            name: body?.name || 'document.json',
            doc: body?.doc ?? body?.json ?? null,
          });
          return res.status(200).json(out);
        }

        if (pathname.startsWith('/api/store/')) {
          const rest = pathname.slice('/api/store/'.length);
          const parts = rest.split('/').filter(Boolean);
          if (parts.length === 1) {
            req.query.ns = decodeURIComponent(parts[0]);
            return await storeNsHandler(req, res);
          }
          if (parts.length >= 2) {
            req.query.ns = decodeURIComponent(parts[0]);
            req.query.key = decodeURIComponent(parts.slice(1).join('/'));
            return await storeKeyHandler(req, res);
          }
        }

        return res.status(404).json({ ok: false, error: `Route API inconnue : ${pathname}` });
      } catch (err) {
        if (!res.headersSent) {
          res.status(500).json({ ok: false, error: 'Erreur interne du serveur' });
        }
        return;
      }
    }

    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: 'Méthode non autorisée' }));
      return;
    }

    if (pathname === '/admin') {
      res.writeHead(301, { Location: '/admin/' });
      res.end();
      return;
    }

    const lookupPath =
      pathname === '/'
        ? '/index.html'
        : pathname === '/admin/'
          ? '/admin/index.html'
          : pathname;

    if (!isAllowedStaticPath(lookupPath)) {
      res.writeHead(403, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: 'Accès interdit' }));
      return;
    }

    let filePath = safeResolve(VROOT, lookupPath);
    if (!filePath || !fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
      const pubCandidate = safeResolve(PUBLIC_DIR, lookupPath);
      if (pubCandidate && fs.existsSync(pubCandidate) && fs.statSync(pubCandidate).isFile()) {
        filePath = pubCandidate;
      } else {
        filePath = null;
      }
    }

    if (!filePath) {
      const accept = String(req.headers.accept || '');
      const nfPath = path.join(VROOT, '404.html');
      if (accept.includes('text/html') && fs.existsSync(nfPath)) {
        res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' });
        res.end(req.method === 'HEAD' ? undefined : fs.readFileSync(nfPath));
        return;
      }
      res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: `Fichier introuvable : ${pathname}` }));
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    const cache = ext === '.woff2' ? 'public, max-age=31536000, immutable' : 'no-cache';
    const headers = { 'Content-Type': contentType, 'Cache-Control': cache };
    if (pathname.startsWith('/admin')) {
      headers['X-Robots-Tag'] = 'noindex, nofollow';
    }
    res.writeHead(200, headers);
    if (req.method === 'HEAD') {
      res.end();
    } else {
      fs.createReadStream(filePath).pipe(res);
    }
  });

  const port = Number(process.env.MATHIX_PORT || process.env.PORT || 3000) || 3000;
  const host = process.env.MATHIX_HOST || process.env.HOST || '0.0.0.0';

  server.listen(port, host, () => {
    console.log(`Mathix Hybrid Server (Firestore + Redis + Rust/WASM) → http://${host === '0.0.0.0' ? 'localhost' : host}:${port}`);
    console.log(`Persistance active : ${getPersistenceMode()} (projet Firebase : ${process.env.FIREBASE_PROJECT_ID || 'mathix-5a799'})`);
  });
}
