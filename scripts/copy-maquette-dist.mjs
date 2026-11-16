import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const maquetteDir = path.join(rootDir, 'maquette');
const distApprendreDir = path.join(rootDir, 'dist', 'apprendre');

function copyDirFiltered(src, dest) {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirFiltered(srcPath, destPath);
    } else if (entry.isFile() && !entry.name.endsWith('.bak')) {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

export function copyMaquetteToDist() {
  if (!fs.existsSync(path.join(rootDir, 'dist'))) {
    throw new Error('dist/ directory does not exist. Run vite build first.');
  }
  fs.rmSync(distApprendreDir, { recursive: true, force: true });
  fs.mkdirSync(distApprendreDir, { recursive: true });

  for (const fileName of ['Apprendre.html', 'apprendre.webmanifest', 'sw-apprendre.js']) {
    const src = path.join(maquetteDir, fileName);
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, path.join(distApprendreDir, fileName));
    }
  }

  const appHtml = path.join(distApprendreDir, 'Apprendre.html');
  if (fs.existsSync(appHtml)) {
    fs.copyFileSync(appHtml, path.join(distApprendreDir, 'index.html'));
  }

  for (const folder of ['css', 'js', 'vendor', 'icons', 'public']) {
    copyDirFiltered(path.join(maquetteDir, folder), path.join(distApprendreDir, folder));
  }

  // Fallback copy of public/data if maquette/public/data is empty or partially present
  const rootDataDir = path.join(rootDir, 'public', 'data');
  const targetDataDir = path.join(distApprendreDir, 'public', 'data');
  if (fs.existsSync(rootDataDir) && !fs.existsSync(targetDataDir)) {
    copyDirFiltered(rootDataDir, targetDataDir);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  copyMaquetteToDist();
  console.log('[copy-maquette-dist] Bundled maquette -> dist/apprendre/');
}
