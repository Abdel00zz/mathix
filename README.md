# Mathix — Plateforme éditoriale de mathématiques (v2.0)

Application web **offline-first**, modulaire et prête pour **Vercel**, combinant un espace **Élève** strictement isolé, une console **Administration + Studio éditorial** (`/admin/`), un moteur mathématique LaTeX + `tkz-tab` natif et deux moteurs **Rust compilés en WebAssembly**.

---

## Démarrage rapide

### 1. Développement local (serveur Rust natif + persistance locale)
```bash
npm start
# → http://localhost:3000        (Espace élève)
# → http://localhost:3000/admin/ (Console administration & Studio)
```

### 2. Audit du corpus, compilation Rust & build de production
```bash
npm run build:rust   # Recompile engines/math_engine.wasm, json_engine.wasm & mathix-server
npm run audit        # Vérifie les 889 fichiers JSON, médias et formules KaTeX
npm run build        # Reconstruit assets/min/{app.min.css,main.min.js,admin.min.js}
npm run build:vercel # Build + assemblage du dossier dist/ pour Vercel
npm run check        # Audit intégral + build complet dist/
```

Ajoutez `?dev=1` à l’URL pour charger directement les modules sources non minifiés (`assets/js/` et `assets/css/`).

---

## Déploiement sur Vercel

Le dépôt est configuré pour un déploiement **Vercel** conforme aux bonnes pratiques de production :

- **`vercel.json`** :
  - `buildCommand: "npm run build:vercel"` et `outputDirectory: "dist"` (seuls les artefacts de production sont exposés sur le CDN — aucune source Rust, aucun script serveur ni documentation interne).
  - En-têtes de sécurité complets (`HSTS`, `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`, `COOP`).
  - `Content-Type: application/wasm` + cache immuable (`max-age=31536000, immutable`) pour `engines/*.wasm`, `vendor/katex/*` et `public/images/*`.
  - Redirection permanente `/admin` → `/admin/` avec `X-Robots-Tag: noindex, nofollow`.
- **Fonctions Serverless `/api/*`** :
  - `api/health.js`, `api/events.js`, `api/store/[ns].js`, `api/store/[ns]/[key].js` (Node ESM pur, zéro dépendance).
  - **Mode local-first par défaut** : sans base cloud attachée, l’application persiste intégralement en `localStorage` + export/import JSON et Service Worker hors ligne.
  - **Synchronisation cloud optionnelle** : attachez **Vercel KV** ou **Upstash Redis** (`KV_REST_API_URL` + `KV_REST_API_TOKEN`, ou `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN`) dans les variables d’environnement Vercel pour activer automatiquement la persistance cloud partagée Élève ↔ Admin.

---

## Architecture fonctionnelle

### Espace Élève (`/`)
- **8 classes officielles** (`public/data/manifest.json`), 889 fichiers JSON validés.
- **Leçons socratiques** : blocs pédagogiques dépliables avec badges fusionnés sur la bordure supérieure, formules `$$…$$` centrées, blancs interactifs `\blank{…}`, mode Focus plein écran, lexique bilingue FR/AR, schémas & médias (`MediaRenderer`), **tableaux de signes et de variations `tkz-tab`** en DOM/SVG natif.
- **Quiz, Exercices, Examens nationaux & Prépa Concours** : 5 types de questions, minuteur, auto-évaluation, annales classées par année et **Cadre référentiel** hiérarchique avec suivi de maîtrise compétence par compétence.
- **Personnalisation chromatique** : 4 palettes éditoriales (*Atelier*, *Minéral*, *Manuscrit*, *Botanique*) adaptées en mode clair et sombre, sans flash au chargement.
- **PWA hors ligne** : `manifest.webmanifest`, `sw.js`, `public/favicon.svg`, page `404.html` dédiée.

### Console Administration (`/admin/`)
Totalement isolée du bundle élève (`admin/index.html` + `assets/min/admin.min.js`, vérifié à chaque build) :
- **Tableau de bord KPIs**, **Studio éditorial** (édition visuelle & JSON, audit temps réel, diff structuré, prévisualisation LaTeX/Socratique, publication d’overrides), **Utilisateurs**, **Statistiques élèves**, **Pilotage & Audit Rust/WASM**, **Publications** et **Journal d’activité**.
- Clé de session par défaut : `mathplus-admin-2026`.

---

## Arborescence

```text
Vhtml/
├── index.html                 # Shell élève (SEO, OpenGraph, skip-link, zéro FOUC)
├── 404.html                   # Page 404 éditoriale adaptée aux thèmes/palettes
├── robots.txt                 # Indexation contrôlée (/admin et /api exclus)
├── manifest.webmanifest       # Manifeste PWA
├── sw.js                      # Service Worker offline-first
├── vercel.json                # Configuration production Vercel (headers, cache, dist/)
├── .vercelignore              # Exclusions de déploiement Vercel
├── admin/
│   └── index.html             # Shell autonome de la console d'administration
├── api/                       # Vercel Serverless Functions (Node ESM, KV optionnel)
│   ├── _store.js
│   ├── health.js
│   ├── events.js
│   └── store/
│       ├── [ns].js
│       └── [ns]/[key].js
├── assets/
│   ├── css/                   # 9 feuilles modulaires (tokens → studio)
│   ├── js/                    # Modules ES (main, admin-main, math, tkztab, views/, studio/)
│   └── min/                   # Bundles esbuild de production (app.min.css, main.min.js, admin.min.js)
├── engines/
│   ├── math_engine.wasm       # Moteur LaTeX, macros & tkz-tab (Rust → WASM)
│   ├── json_engine.wasm       # Moteur JSON, Studio, CRDT & routage (Rust → WASM)
│   ├── mathix-server          # Serveur HTTP + API natif compilé en Rust
│   └── rust/                  # Workspace Cargo (wasm_abi, math_engine, json_engine, mathix_server)
├── public/
│   ├── favicon.svg            # Icône vectorielle légère (< 500 octets)
│   ├── data/                  # 889 fichiers JSON (cours, quiz, exercices, examens, concours)
│   └── images/                # Illustrations mathématiques & portraits
├── scripts/
│   ├── build-rust.mjs         # Compilation WASM + binaire serveur Rust natif
│   ├── build.mjs              # Build esbuild + contrôle d'isolation + assemblage dist/
│   ├── audit.mjs              # Audit intégral JSON, médias et KaTeX strict
│   └── *.test.mjs             # Tests unitaires (navigation, Rust/WASM, serveur, CSS)
├── server/
│   └── server.mjs             # Lanceur fin du binaire Rust engines/mathix-server
└── vendor/katex/              # KaTeX local complet (CSS, JS, polices woff2)
```
