import fs from 'node:fs';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(__dirname, '..');
const publicDir = path.join(appRoot, 'public');

function shouldSkipEntry(name) {
  return (
    name.startsWith('.') ||
    name === 'Thumbs.db' ||
    /\.(tmp|bak|old\.json|bak\.json)$/i.test(name)
  );
}

// Generate installation icons from the existing artwork; no network request at build time.
for (const size of [192, 512]) {
  await sharp(path.join(publicDir, 'icons', 'icone.png'))
    .resize(size, size, { fit: 'contain', background: '#F6F4EF' })
    .png()
    .toFile(path.join(publicDir, 'icons', `app-${size}.png`));
}

const webmanifest = {
  id: '/',
  name: 'MathFlow — Apprendre & Réviser',
  short_name: 'Apprendre',
  description: 'Cahier mathématique interactif Lycée : fiches de cours, quiz chronométrés et exercices corrigés hors-ligne.',
  start_url: '/',
  scope: '/',
  display: 'standalone',
  orientation: 'any',
  theme_color: '#1D2B66',
  background_color: '#F6F4EF',
  lang: 'fr',
  dir: 'ltr',
  categories: ['education', 'books'],
  icons: [
    { src: '/icons/app-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
    { src: '/icons/app-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
    { src: '/icons/badge.png', sizes: '96x96', type: 'image/png', purpose: 'any' }
  ],
  shortcuts: [
    { name: 'Programme', short_name: 'Programme', url: '/' },
    { name: 'Examens Nationaux', short_name: 'Examens', url: '/examens' },
    { name: 'Problèmes', short_name: 'Problèmes', url: '/problemes' },
    { name: 'Prépa Concours', short_name: 'Prépa', url: '/prepa' }
  ]
};
fs.writeFileSync(path.join(publicDir, 'apprendre.webmanifest'), JSON.stringify(webmanifest, null, 2) + '\n', 'utf8');

const workerTemplate = fs.readFileSync(path.join(__dirname, 'pwa-worker.js'), 'utf8');
const buildHash = createHash('sha256').update(workerTemplate).update(JSON.stringify(webmanifest));
function hashTree(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    if (shouldSkipEntry(entry.name)) continue;
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) hashTree(file);
    else if (entry.isFile()) buildHash.update(path.relative(appRoot, file).replace(/\\/g, '/')).update(fs.readFileSync(file));
  }
}
hashTree(path.join(appRoot, 'src'));
hashTree(path.join(publicDir, 'data'));
hashTree(path.join(publicDir, 'icons'));
for (const name of ['package-lock.json', 'next.config.ts']) buildHash.update(fs.readFileSync(path.join(appRoot, name)));
const version = buildHash.digest('hex').slice(0, 16);
fs.writeFileSync(path.join(publicDir, 'sw-apprendre.js'), workerTemplate.replace('__BUILD_HASH__', version), 'utf8');

console.log('[pwa] Icônes, manifeste et service worker générés.');
