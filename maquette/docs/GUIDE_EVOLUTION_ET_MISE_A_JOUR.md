# GUIDE D’ÉVOLUTION ET DE MISE À JOUR CONFORME

Ce guide explique comment agrandir le projet [`Apprendre.html`](../Apprendre.html) tout en préservant la compatibilité hors-ligne, le style cahier et les garanties qualité.

---

## 1. Ajouter une nouvelle filière / classe (0 modification JS requise)

L’interface (`app.js`, `ui-modals.js`, `programme-page.js`) découvre désormais les filières **dynamiquement** via `manifest.json` :

1. Créer le manifeste canonique `public/data/classes/<nouvelle-filiere>.json` (`{ "id", "title", "className", "chapters": [...] }`) et ses chapitres sous `public/data/<nouvelle-filiere>/...`.
2. Référencer `<nouvelle-filiere>` dans `public/data/manifest.json` (`classes[]`).
3. Vérifier la validité du contenu :
   ```bash
   npm run validate:content
   ```
4. Synchroniser la maquette avec la nouvelle filière (ou toutes) :
   ```bash
   node scripts/sync-maquette-data.mjs --classes=2eme-bac-sc-ex,2eme-bac-sc-math,<nouvelle-filiere>
   # ou toutes les filières disponibles :
   node scripts/sync-maquette-data.mjs --all-classes
   ```
5. Vérifier en navigateur que `<select name="cls">` (dans `#set`) et `[data-switch-cls]` basculent bien vers la nouvelle filière.

---

## 2. Ajouter ou mettre à jour du contenu pédagogique

### A. Fiche de révision (`fiche_*.json`)
- **Titre chapitre / fiche avec LaTeX** : utiliser la notation standard `$...$` dans `header.title`, `sections[].title`, `manifest.json -> title` (pris en charge automatiquement dans `<h1 class="lt">`, `.kick`, `.sheet-tab`, `#toc`, `.head` et `.top-title`).
- **Numérotation des paragraphes** : `LeconRenderer` préfixe automatiquement les sections avec `A.`, `B.`, `C.`… dans `<span class="ltr">` et `#toc-sections`.
- **Blocs & solutions repliables** : définir `type` parmi `TYPE_LABELS` (`definition`, `theorem`, `property`, `method`, `example`, `application`, `warning`, `rappel`, etc.). Toute sous-question ou solution utilisant `\solution` ou un bloc `proof`/`solution` est encapsulée dans un panneau compact repliable `details.sol` (bouton aligné à droite).

### B. Exercice avec indice interactif (`ex_*.json`)
- Ajouter `"hint": "..."` sur une question ou sous-question : `ExerciceRenderer` place automatiquement le bouton pill gris **Indice** (avec `HINT_LAMP_SVG`) à droite sur la même ligne que la question (`.exo-row-aside`).
- Les directives `\method`, `\step`, `\conclusion`, ainsi que les formules isolées sur leur propre ligne (avec ou sans `$...$`) sont automatiquement rendues en KaTeX.
- Après modification JSON, relancer `npm run validate:content && npm run maquette:sync`.

### C. Images, figures SVG & tableaux de variations
- Placer les figures dans le sous-dossier `figures/` adjacent au JSON source (référence relative `./figures/ma-figure.svg`).
- Privilégier le format `.svg` pour les schémas TikZ exportés : `sync-maquette-data.mjs` écarte les `.tex` et préfère `.svg` lorsque présent.
- Pour les tableaux de variations/signes, utiliser `\tkzTabInit` / `\tkzTabLine` / `\tkzTabVar` ou `\begin{array}` compatible ; ne jamais inclure de classe utilitaire CSS externe.

---

## 3. Étendre les moteurs JS ou les feuilles CSS

### Règles de modularité obligatoires
1. **Ne jamais dépasser 380 lignes par fichier** (`Apprendre.html`, `css/*.css`, `js/**/*.js`, `scripts/sync-maquette-data.mjs`). Si un module approche 330 lignes, extraire un sous-module thématique (comme `lecon-search.js` ou `exercice-parser.js`) et l’ajouter dans `Apprendre.html` **avant** son consommateur.
2. **Respecter le DAG de chargement** dans `Apprendre.html` :
   - Couche 1 (`data/`) -> `content-data.js` -> Couche 2 (`math/` puis `math-engine.js`) -> `ui-modals.js` -> Couche 4 (`pages/`) -> `app.js`.
3. **Conserver l’ordre d’extraction dans `MathEngine.renderMathInHtml`** :
   - Toujours extraire `\(...\)` et `$...$` **avant** `\begin{cases|array|...}` pour éviter toute fuite de placeholder `@@MF_HOLD_*@@`.
   - Tout helper `renderSub(...)` récursif ne doit jamais altérer le tableau `held` du parent (garanti par `holdTag`).
4. **Conserver la cohérence CSS sémantique** :
   - Utiliser les variables `:root` de `app-tokens-base.css` et `light-dark(...)`.
   - Protéger les titres flex avec KaTeX (`.lht`, `.toc-sec-ttl` avec `min-width: 0`) pour ne pas casser l’espacement autour des symboles mathématiques inline.

---

## 4. Checklist de validation avant toute livraison

Exécuter systématiquement après modification :

```bash
# 1. Validation du contenu JSON et des liens
npm run validate:content

# 2. Resynchronisation des données autonomes (si public/data a changé)
npm run maquette:sync

# 3. Suite de tests unitaires & intégration
npx vitest run
```

Puis vérifier sur la maquette :
- Aucun fichier sous `maquette/` (hors `vendor/`) et `scripts/sync-maquette-data.mjs` ne dépasse **380 lignes**.
- Aucune erreur de syntaxe JS (`node --check`) ni CSS.
- Aucun résidu `@@MF_HOLD`, `\mathqst` brut, `katex-error`, `Marquer acquis`, `Terminer la séance` ni lien `.html` interne dans les vues rendues.
- Ouverture sans erreur en `http://` **et** en `file://`.
