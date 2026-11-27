#!/usr/bin/env node
/**
 * scripts/build.mjs — Construction des bundles de production via esbuild
 * et assemblage optionnel du dossier `dist/` pour Vercel (`--dist`).
 *
 * Usage :
 *   node scripts/build.mjs          # reconstruit assets/min/*
 *   node scripts/build.mjs --dist   # reconstruit assets/min/* + assemble dist/
 */
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const withDist = process.argv.includes('--dist');

const CSS_ORDER = ['tokens', 'base', 'motions', 'components', 'math', 'tkz', 'views', 'lesson', 'exercise', 'studio'];
const cssSrc = CSS_ORDER.map((f) => fs.readFileSync(`assets/css/${f}.css`, 'utf8')).join('\n');

fs.mkdirSync('assets/min', { recursive: true });
const cssMin = execSync('npx --yes esbuild --loader=css --minify', { input: cssSrc, encoding: 'utf8' });
fs.writeFileSync('assets/min/app.min.css', cssMin, 'utf8');

execSync(
  'npx --yes esbuild assets/js/wasm-host.js --bundle --format=esm --minify --external:https://www.gstatic.com/* --outfile=assets/min/host.min.js',
  { stdio: 'inherit' }
);

for (const f of ['assets/min/app.min.css', 'assets/min/host.min.js']) {
  const kb = (fs.statSync(f).size / 1024).toFixed(1);
  console.log(`  ✓ ${f} (${kb} KB)`);
}

/* ── Vérification stricte de l'isolation Élève / Admin sur le binaire WASM ── */
if (fs.existsSync('engines/mathix_app.wasm')) {
  const studentWasm = fs.readFileSync('engines/mathix_app.wasm', 'utf8');
  if (
    studentWasm.includes('Pilotage de la plateforme') ||
    studentWasm.includes('Studio éditorial Mathix') ||
    studentWasm.includes('mathplus-admin-2026')
  ) {
    console.error('✗ Erreur d’isolation : du code Admin a fuité dans engines/mathix_app.wasm !');
    process.exit(1);
  }
  console.log('  ✓ Isolation Élève / Admin vérifiée sur engines/mathix_app.wasm');
} else {
  console.error('✗ engines/mathix_app.wasm introuvable — lancez `npm run build:rust` d’abord.');
  process.exit(1);
}

if (fs.existsSync('engines/mathix_admin.wasm')) {
  const adminWasm = fs.readFileSync('engines/mathix_admin.wasm', 'utf8');
  if (adminWasm.includes('mathplus-admin-2026')) {
    console.error('✗ Erreur de sécurité : un mot de passe codé en dur a été détecté dans engines/mathix_admin.wasm !');
    process.exit(1);
  }
  console.log('  ✓ Zéro secret codé en dur vérifié sur engines/mathix_admin.wasm');
}

/* ── Assemblage propre du dossier dist/ pour déploiement Vercel ──────────── */
if (withDist) {
  const DIST = 'dist';
  fs.rmSync(DIST, { recursive: true, force: true });
  fs.mkdirSync(DIST, { recursive: true });

  const copyFile = (src, dest = path.join(DIST, src)) => {
    if (!fs.existsSync(src)) return;
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
  };

  const copyDir = (src, dest = path.join(DIST, src), exclude = null) => {
    if (!fs.existsSync(src)) return;
    fs.mkdirSync(dest, { recursive: true });
    for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
      const srcPath = path.join(src, entry.name);
      const destPath = path.join(dest, entry.name);
      if (exclude && exclude(srcPath, entry)) continue;
      if (entry.isDirectory()) copyDir(srcPath, destPath, exclude);
      else fs.copyFileSync(srcPath, destPath);
    }
  };

  // Racine & shell PWA
  for (const rootFile of ['index.html', '404.html', 'robots.txt', 'manifest.webmanifest', 'sw.js']) {
    copyFile(rootFile);
  }
  copyFile('admin/index.html');

  // Bundles minifiés uniquement (aucune source dev exposée)
  copyDir('assets/min');

  // Moteurs & frontends Rust compilés en WebAssembly uniquement (aucune source Rust)
  copyFile('engines/mathix_app.wasm');
  copyFile('engines/mathix_admin.wasm');
  copyFile('engines/math_engine.wasm');
  copyFile('engines/json_engine.wasm');

  // KaTeX local (CSS, JS, polices woff2)
  copyDir('vendor/katex');

  // Données JSON + illustrations + icônes PWA (exclut les pièces jointes dev public/assets/aistudio)
  copyDir('public', path.join(DIST, 'public'), (srcPath) => {
    const norm = srcPath.replace(/\\/g, '/');
    return norm === 'public/assets/aistudio' || norm.startsWith('public/assets/aistudio/');
  });

  // Statistiques rapides de dist/
  let files = 0;
  let bytes = 0;
  const walk = (d) => {
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, entry.name);
      if (entry.isDirectory()) walk(full);
      else { files++; bytes += fs.statSync(full).size; }
    }
  };
  walk(DIST);
  console.log(`  ✓ dist/ assemblé pour Vercel (${files} fichiers · ${(bytes / (1024 * 1024)).toFixed(2)} Mo)`);
}
