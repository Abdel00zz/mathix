# Maquette Autonome — `Apprendre.html`

> **Point d’entrée élève autonome** (compatible serveur HTTP `http(s)://` et ouverture directe hors-ligne `file://`), sans dépendance React/Tailwind/Node à l’exécution.

---

## Démarrage rapide

### 1. Ouverture locale directe (`file://`)
Ouvrir directement `maquette/Apprendre.html` dans un navigateur moderne. Les données manifestes, fiches, exercices, quiz et concours sont déjà embarqués dans [`maquette/js/data/embedded-*.js`](./js/data/embedded-manifests.js) et résolus via [`ContentService`](./js/content-data.js).

### 2. Mode serveur HTTP (recommandé pour le développement)
Servir le dossier `maquette/` (port exemple `4176`) puis ouvrir `/Apprendre.html` :
- `ContentService` interroge d’abord `./public/data/...` (avec mise en cache mémoire + `CacheStorage` `mathflow-student-content-v3`) et bascule automatiquement sur `EMBEDDED_DB` en cas d’indisponibilité réseau.

### 3. Resynchronisation après modification de `public/data/`
```bash
# Filières par défaut (2eme-bac-sc-ex, 2eme-bac-sc-math)
npm run maquette:sync

# Sélection personnalisée ou toutes les filières disponibles
node scripts/sync-maquette-data.mjs --classes=2eme-bac-sc-ex,2eme-bac-sc-math,1ere-bac-sc-math
node scripts/sync-maquette-data.mjs --all-classes
```

---

## Dossier d’architecture (`maquette/docs/`)

Ce dossier documente de bout en bout les flux, les états, les nœuds DOM/CSS et les modules (« threads ») afin de garder le projet maintenable, extensible et conforme aux règles qualité.

| Document | Rôle | Contenu principal |
| :--- | :--- | :--- |
| [**WORKFLOW.md**](./docs/WORKFLOW.md) | Flux global & cycle de vie | Boot DAG des 26 `<script>`, routeur SPA `#hash`, résolution hybride HTTP/offline, pipeline de synchronisation `sync-maquette-data.mjs`. |
| [**STATES_AND_NODES.md**](./docs/STATES_AND_NODES.md) | États, nœuds DOM & CSS | Schémas `localStorage` (`ap-p`, `ap`), états internes des contrôleurs, nœuds DOM (`#learn`..`#lib`, `<dialog>`, `[popover]`), tokens CSS & attributs `data-*`. |
| [**THREADS_AND_ENGINES.md**](./docs/THREADS_AND_ENGINES.md) | Moteurs & couches (« threads ») | API publiques des 4 couches (Data, Math/TeX/TikZ/Lexique, Shell/Modales, Pages), invariants du pipeline `renderMathInHtml`. |
| [**GUIDE_EVOLUTION_ET_MISE_A_JOUR.md**](./docs/GUIDE_EVOLUTION_ET_MISE_A_JOUR.md) | Évolutions & mises à jour conformes | Procédures pas-à-pas pour ajouter une filière, un chapitre, une fiche, un exercice avec indice, un quiz, une macro LaTeX et exécuter les validations. |
| [**CLOUD_PWA_NEXTJS.md**](./docs/CLOUD_PWA_NEXTJS.md) | Cloud, PWA Mobile & Next.js | Architecture Redis L1 + Firestore L2 + Google/Firebase Auth, IndexedDB, PWA portrait `nav.mnav` et guide de migration `next-app/`. |

---

## Règles architecturales non négociables

1. **Plafond strict de taille** : tout fichier de code source (`.html`, `.css`, `.js`, `.mjs`) sous `maquette/` et `scripts/sync-maquette-data.mjs` doit rester **≤ 380 lignes**.
2. **Périmètre session élève uniquement** : zéro espace Professeur/Admin/Tablette/Scratchpad, zéro gamification/XP, zéro mécanique `Marquer acquis` / `Terminer la séance`.
3. **Zéro classe utilitaire Tailwind, zéro lien `.html` interne** : navigation exclusivement par ancre (`#learn`, `#examens`, `#problemes`, `#prepa`, `#lecon-...`, `#quiz-...`, `#exo-...`, `#examen-...`, `#concours-...`, `#probleme-...`) et CSS sémantique (`./css/app-*.css`).
4. **Hors-ligne d’abord** : KaTeX CSS/JS/polices sont vendoring-inclus dans `./vendor/katex/`, les polices Google Fonts chargent de manière asynchrone non bloquante, et toute route fonctionne sans backend.
