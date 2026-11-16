import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(__dirname, '..');
const livretPath = path.join(appRoot, 'ARCHITECTURE_LIVRET.md');

if (!fs.existsSync(livretPath)) {
  console.error('[verify-arch] ARCHITECTURE_LIVRET.md introuvable !');
  process.exit(1);
}

const livret = fs.readFileSync(livretPath, 'utf8');
const srcAppDir = path.join(appRoot, 'src', 'app');

function walkFiles(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walkFiles(p, out);
    else out.push(p);
  }
  return out;
}

const routeFiles = walkFiles(srcAppDir)
  .map((f) => path.relative(appRoot, f).replace(/\\/g, '/'))
  .filter((f) => /\/(?:page|route)\.tsx?$/.test(f));

const missingRoutes = routeFiles.filter((rf) => !livret.includes(rf));
if (missingRoutes.length) {
  console.error('[verify-arch] Routes non documentées dans ARCHITECTURE_LIVRET.md :', missingRoutes);
  process.exit(1);
}

const referencedPaths = [...livret.matchAll(/(?:src\/[A-Za-z0-9_.\-\[\]\/]+|scripts\/[A-Za-z0-9_.\-\/]+)/g)]
  .map((m) => m[0])
  .filter((p) => /\.(?:ts|tsx|mjs|js|css|md)$/.test(p));

const brokenPaths = [...new Set(referencedPaths)].filter((rel) => !fs.existsSync(path.join(appRoot, rel)));
if (brokenPaths.length) {
  console.error('[verify-arch] Références inexistantes dans ARCHITECTURE_LIVRET.md :', brokenPaths);
  process.exit(1);
}

if (fs.existsSync(path.join(appRoot, 'src', 'lib', 'engines'))) {
  console.error('[verify-arch] L’ancien dossier src/lib/engines/ doit rester supprimé.');
  process.exit(1);
}

console.log(`[verify-arch] OK — ${routeFiles.length} routes App Router et ${referencedPaths.length} références vérifiées dans ARCHITECTURE_LIVRET.md.`);
