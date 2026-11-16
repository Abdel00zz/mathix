# Analyse d'architecture — Espace professeur (état actuel vs vision cible)

> Analyse des circuits, règles, logiques, système cloud et infrastructure, confrontés à la vision produit :
> badge prof activé depuis l'admin, canvas/éléments visuels exclusifs prof, synchronisation PC ↔ tablette,
> édition de contenu en temps réel, liste d'élèves avec rotation façon jeux TV, interface PC « pro »,
> contenu prof isolé du contenu officiel, suggestions intelligentes.

---

## 1. Synthèse exécutive

Le socle est **déjà très solide et en grande partie conforme à la vision** :

- ✅ Badge prof activé par l'admin sans code pour le prof (`role-set` → lien à usage unique).
- ✅ Canvas exclusif prof (zones de notes sous les blocs de révision et sous les images, verrouillées pour les élèves).
- ✅ Synchronisation PC ↔ tablette (contenu override, canvas, roster/live, médias).
- ✅ Liste d'élèves numérotée, réordonnable, rotation déterministe, passage vert, reset de session.
- ✅ Contenu prof isolé du contenu officiel (override Redis + repli statique).

**Les vrais écarts** (où la vision n'est pas encore satisfaite) :

1. **La console PC `/prof/` n'a aucun canvas** — le dessin n'existe que dans l'app React (interface « pédagogique »), pas dans l'interface « pro » de gestion/édition.
2. **Le prof édite en JSON brut uniquement** dans le Studio (éditeurs visuels masqués par `data-prof-hidden`).
3. **La rotation quiz n'est pas complète** : pas d'auto-avance de manche (`roundId`), le signal `stale` du serveur n'est pas exploité, pas de logique « tout le monde a répondu → manche suivante ».
4. **Suggestions intelligentes (IA) : absentes** — `GEMINI_API_KEY` est défini dans `vite.config.ts` sans aucun consommateur.
5. **Infrastructure à nettoyer** : artefacts morts (`public/editor.html`, `public/admin.html`, `public/public/`, defines GEMINI orphelins).
6. **Dépendance d'environnement fragile** : `ACCOUNT_SESSION_SECRET` manquant ⇒ 503 `account_session_unavailable` (cause du bug rapporté).

---

## 2. Circuits actuels (ce qui existe)

### 2.1 Circuit d'authentification et badge prof

```
Admin (console /admin/)
  └─ POST /api/users?action=role-set  (x-admin-secret == ADMIN_SECRET)
       ├─ rôle=prof → promoteAndCreateDeviceActivation()
       │    ├─ PROMOTE_AND_ISSUE_LINK_SCRIPT (Lua atomique)
       │    │    ├─ role=prof, roleUpdatedAt, profSessionVersion+1, deviceLinkVersion+1
       │    │    └─ écrit auth:device-link:{sha256(token)} (TTL 15 min)
       │    └─ renvoie /#activate=<token>  → affiché par la console admin
       └─ rôle=student → SET_ROLE_SCRIPT (profSessionVersion+1, deviceLinkVersion+1)

Prof (1er appareil)
  └─ ouvre /#activate=<token>  → src/services/accountSessionService.ts
       └─ POST /api/users?action=activate
            ├─ vérifie accountId + authVersion + profSessionVersion + deviceLinkVersion + role
            ├─ CONSUME_DEVICE_LINK_SCRIPT (usage unique)
            └─ setAccountCookie(trust:'admin') → cookie HttpOnly mathplus_account_session (30 j)

Tout appel sensible (api/professor, api/content écriture, /me)
  └─ readActiveProfessorSession()
       ├─ chemin A : cookie compte avec trust==='admin' ET user.role==='prof'
       └─ chemin B (migration) : ancien cookie mathplus_prof_session si versions ==
```

**Règles de sécurité clés** :
- `isAdmin()` = header `x-admin-secret` === `ADMIN_SECRET`. Le prof ne connaît jamais ce secret.
- Un cookie `trust:'self'` sur un compte prof n'accorde **rien** (`account_activation_required`). Seul le lien d'activation (ou la migration) monte le trust à `admin`.
- Trois compteurs de version invalident tout à la moindre rotation : `authVersion`, `profSessionVersion`, `deviceLinkVersion`. Rétrogradation ⇒ tous les liens et sessions prof meurent instantanément.
- Périmètre classe : `classId` du prof doit être strictement égal à celui de sa session (403 sinon) ; clés Redis préfixées par `sha256(phone)`.

### 2.2 Système cloud (Upstash Redis)

| Domaine | Clés | TTL |
|---|---|---|
| Comptes | `user:id:`, `user:phone:{3 variantes}`, `user:name:{classId}:{name}`, `users:all`, `users:class:{classId}`, `user:tombstone:` | — |
| Liens appareil | `auth:device-link:{sha256(token)}` | 15 min |
| Canvas | `prof:canvas:{sha20(phone)}:{sha256(docKey)}` | 365 j |
| Images | `prof:image:{sha20(phone)}:{imageId}` | 365 j |
| Classe live | `prof:classroom:{sha20(phone)}:{classId}:roster` / `:live` / `:answered` | 365 j |
| Contenu | `content:files` (hash), `content:file:{path}`, `content:media` (hash), `content:media:{id}`, `content:version` | — |
| Push | `push:subscribers`, `push:class:{classId}`, `scheduled:*`, `schedule:{classId}`, `notif:*`, `pilot:{classId}` | — |

### 2.3 Circuit de contenu (isolation officiel vs prof)

```
Base statique public/data/** (contenu officiel de la plateforme)
        │  resolveDataUrl(path) — manifeste content:files au boot
        ▼
Override Redis content:file:{path} (écrit par prof/admin via /api/content?action=save)
        │  SAVE_CONTENT_SCRIPT (version monotone, atomique)
        ▼
Application → lit l'override s'il existe, sinon le fichier statique
Revert → DEL content:file:{path} ⇒ retour au contenu officiel
```

- Le prof ne peut écrire que `data/{sa classe}/…` ; l'admin peut tout écrire.
- Les médias sont content-addressed (`sha256(owner:dataUri)`), propriété vérifiée.
- La suppression d'un override restaure immédiatement le contenu officiel (pas de tombeau).

### 2.4 Circuit classe en direct (liste d'élèves + rotation)

```
PC prof (/prof/?view=classroom — public/admin/ui-classroom.js)
  ├─ roster : titre, élèves [{id,name}], version — possédé par le PC
  │    ├─ numérotation 01..N, boutons ↑/↓, drag&drop, suppression, import
  │    └─ autosave 650 ms → ROSTER_SAVE_SCRIPT (CAS sur version, 409 si conflit)
  └─ live : currentStudentIndex, questionIndex, roundId, answeredIds — possédé par la tablette
       └─ polling 5 s (roster complet toutes les 30 s, pause si onglet caché)

Tablette (React — TeacherQuizGamePanel + useProfessorQuizGame)
  └─ question n → élève n modulo N (rotation déterministe)
  └─ live-update (LIVE_MERGE_SCRIPT : SADD answered, clamp indexes, roundId++)
  └─ passage vert : .is-answered (PC) / chip émeraude (tablette)

Reset de session (PC) → reset:true → roundId+1, vidage answered
```

### 2.5 Circuit canvas (exclusif prof)

```
Révision : BoxNoteZone sous les blocs (RevisionSectionBlock.tsx:103)
Exercices : BoxNoteZone sous chaque image, PC lg+ (MediaRenderer.tsx:214)
  └─ garde : useProfessorAccess() — jamais monté pour un élève

useAnnotationEngine (par docKey)
  ├─ état local : marks normalisés (coords 0→1) + undo/redo (60 max)
  ├─ stockage local : localStorage mathplus:annotations:v2 (debounce 1200 ms)
  ├─ images : IndexedDB mathplus-canvas-images (Blob)
  └─ cloud prof : teacherCanvasSyncService (debounce 750 ms, retry, replay online)
       └─ /api/professor canvas-save → CANVAS_SAVE_SCRIPT (LWW sur updatedAt client, clamp now+1s)
```

---

## 3. Vision ↔ Réalité

| # | Vision | État | Détail |
|---|---|---|---|
| 1 | Canvas et éléments visuels **exclusifs prof** | ✅ Fait | `useProfessorAccess()` ; élèves : traits locaux uniquement (jamais cloud) |
| 2 | Badge prof activé depuis l'admin (clic sur utilisateur) | ✅ Fait | `+ Prof` / `✓ Prof` / `Appareil` ; **aucun code pour le prof** — un lien à usage unique suffit |
| 3 | Compte prof synchronisé PC ↔ tablette | ✅ Fait | Contenu (overrides), canvas, images, roster/live |
| 4 | Canvas **tablette en mode prof** (jamais PC, jamais élève) | ⚠️ À corriger | Garde `useProfessorAccess()` ✅ (élèves exclus) ; mais le canvas sous les images d'exercice est verrouillé `lg:block` (PC) au lieu de tablette, et le canvas de révision n'est pas borné à la tablette |
| 5 | Édition temps réel révision/quiz/exercices | ✅ Fait | Overrides publiés instantanément ; tablettes pollent le manifeste toutes les 5 s |
| 6 | Liste d'élèves : numérotée, réordonnable PC, affichée tablette | ✅ Fait | Numérotation `01..N`, ↑/↓, drag&drop, import ; live 5 s |
| 7 | Quiz : associer élève ↔ question, boutons suivant/précédent, vert quand répondu | ⚠️ Partiel | Rotation déterministe + vert ✅ ; **pas de manche automatique** (`roundId` jamais incrémenté côté client), `stale` non exploité |
| 8 | Méthode « tourne comme les jeux TV » | ⚠️ Partiel | Reset manuel OK ; pas d'auto-rotation quand tout le monde a répondu |
| 9 | Interface PC **pro** (édition/gestion, pas pédagogique) | ⚠️ Partiel | Console `/prof/` = 2 vues (classe + studio JSON) ; pas de canvas, éditeurs visuels masqués |
| 10 | Contenu prof séparé, sans toucher l'officiel | ✅ Fait | Override Redis + repli statique ; scope par classe |
| 11 | Suggestions intelligentes | ❌ Absent | `GEMINI_API_KEY` défini dans `vite.config.ts` sans consommateur |
| 12 | Inspiration « générateur de fiches » (sync, édition, injection d'images) | 🔶 À intégrer | Méthode code 6 chars + push/pull versionné + merge préservant les traits locaux |

---

## 4. Écarts, bugs et risques

### 4.1 Bug bloquant (déjà identifié)
- **503 `account_session_unavailable`** : `ACCOUNT_SESSION_SECRET` (ou repli `PROF_SESSION_SECRET`) absent de l'environnement. `issueAccountSession()` retourne `null` → `handleSetRole`/`handleDeviceLink`/`handleActivate` renvoient 503. **Correctif** : définir les variables d'environnement (Vercel ou `.env` + `vercel dev`).

### 4.2 Écarts fonctionnels
1. **Inversion du verrouillage canvas** — le canvas sous les images d'exercice est `hidden lg:block` (`MediaRenderer.tsx:214`) donc **visible sur PC uniquement**, alors que la règle voulue est « canvas tablette prof uniquement, jamais PC ». Le canvas de révision (`RevisionSectionBlock.tsx:102`) n'est pas borné à la tablette. Les élèves, eux, sont correctement exclus (`useProfessorAccess`).
2. **Édition JSON-only pour le prof** — `st-mode-group` porte `data-prof-hidden="true"` ; les formulaires visuels (`editors.js`) sont réservés à l'admin. Le prof doit connaître le schéma JSON.
3. **Rotation de manche incomplète** — rien n'incrémente `roundId` automatiquement ; le `stale:true` renvoyé par `LIVE_MERGE_SCRIPT` n'est pas traité par `updateLive` ; pas de règle « tous répondus → manche suivante ».
4. **Pas de brouillon / prévisualisation temps réel** — l'override est publié tel quel (Ctrl+S). Pas d'aperçu multi-appareils pendant l'édition, pas de « publication différée ».

### 4.3 Risques d'architecture
1. **LWW sur horloge client pour les canvas** — le clamp `now+1s` réduit mais n'élimine pas la dérive d'horloge entre deux PC. (Modèle du générateur de fiches : `version = Date.now()` côté source unique — plus simple car un seul écrivain.)
2. **Override = remplacement de fichier entier** — pas de merge fin ; deux profs éditent le même fichier → dernier publié gagne. Acceptable aujourd'hui (1 prof/classe), à documenter.
3. **Taille Upstash ~1 Mo/commande** — caps `MAX_FILE_CHARS` 900 000, `MAX_MEDIA_CHARS` 950 000, `MAX_CANVAS_CHARS` 750 000. Les gros médias restent locaux.
4. **`GEMINI_API_KEY` défini dans le bundle client** (`process.env.GEMINI_API_KEY`) — **danger** : la clé serait exposée dans le JS si un futur consommateur l'utilisait côté client. Toute suggestion IA devra passer par une route serveur (`api/`), jamais le client.

### 4.4 Nettoyage infrastructure (dead code)
| Élément | Constat | Action |
|---|---|---|
| `public/editor.html` (1367 lignes) | Éditeur standalone non branché au pipeline d'overrides | Supprimer ou brancher |
| `public/admin.html` | Fichier vide | Supprimer |
| `public/public/pictures/` | Dossier imbriqué résiduel | Déplacer/supprimer |
| `process.env.GEMINI_API_KEY` / `API_KEY` (vite.config) | Defines sans consommateur | Réserver à un futur endpoint serveur |
| `knip.json` | Existe | Lancer `npm run analyze:unused` pour traquer le reste |

---

## 5. Architecture cible proposée (clean)

### 5.1 Répartition des surfaces (PC vs tablette) — règle confirmée

> **PC `/prof/` = gestion + édition de contenu + liste d'élèves. AUCUN canvas.**
> **Tablette (app React) en mode prof = canvas.**
> **Élèves (non prof) = jamais de canvas.**

```
PC — /prof/ (console pro, SPA existante public/admin, mode prof)
├── Gestion de classe   (déjà OK : roster, live, reset)
└── Studio de contenus  (à enrichir)
     ├── arborescence classe + onglets Révision / Quiz / Exercices
     ├── mode visuel (réactiver editors.js pour le prof) + mode JSON en repli
     ├── aperçu « Rendu application » (KaTeX) — déjà présent
     └── [nouveau] Suggestions intelligentes (IA serveur)
     (PAS de canvas ici)

Tablette — app React, mode prof
├── canvas sous les blocs de révision (BoxNoteZone)
├── canvas sous chaque image d'exercice (BoxNoteZone)
└── injection d'images + sauvegarde /api/professor (déjà existant)

Élèves — app React, mode non prof
└── aucun canvas (garde useProfessorAccess() déjà en place)
```

**À corriger pour respecter cette règle** :
- `MediaRenderer.tsx:214` — le canvas sous les images d'exercice est `hidden lg:block` (PC uniquement) → doit être **visible en dessous de `lg` (tablette) et caché à `lg+` (PC)**.
- `RevisionSectionBlock.tsx:102` — le canvas de révision n'est pas borné → l'ajouter derrière la même condition tablette (caché PC).

### 5.2 Rotation « jeux TV » (compléter le circuit existant)

- Client tablette : détecter « tous les élèves de la manche ont répondu » → envoyer `reset:true` (roundId+1) automatiquement, ou un nouvel état `advance:true` (nouvelle manche sans vider l'historique visuel).
- PC : exploiter le flag `stale` du serveur pour forcer un rechargement du live.
- Garder la rotation déterministe `question n → élève n mod N` ; afficher clairement « manche k / élève suivant ».

### 5.3 Sync inspirée du générateur de fiches (méthode code + merge)

Le projet de référence (`générateur-de-fiches-d'exercices-v1.01`) utilise :
```
source (PC)  : POST /api/sync/push {code, worksheets, version: Date.now()} → Redis sync:{CODE}
receiver     : GET  /api/sync/pull?code&since → {worksheets, version} (unchanged si version <= since)
merge        : contenu distant prioritaire, traits locaux conservés (strokes)
```

**À transposer dans mathPlus** (sans changer l'infra Redis existante) :
- La paire PC↔tablette est déjà gérée par les cookies de session prof (pas besoin de code de session — c'est un **plus** vs le générateur).
- Ajouter un `?since=` sur `classroom-load`/`live-load` et renvoyer `{unchanged:true}` si `version <= since` → économise la bande passante et permet un merge type « contenu distant prioritaire, traits locaux conservés » pour les canvas (aujourd'hui LWW global).
- Le merge canvas peut évoluer : au lieu de remplacer tout le document par `updatedAt`, fusionner par trait (comme `mergeQuestion` qui garde `local?.strokes ?? remoteQ.strokes`) — **seulement si** la coédition multi-écrivains devient un besoin réel (sinon garder LWW, plus simple et prévisible).

### 5.4 Suggestions intelligentes (IA — route serveur uniquement)

- **Jamais** de clé API dans le client (risque identifié en 4.3.4).
- Nouveau endpoint `api/suggest.ts` (admin/prof, session requise) :
  - `POST ?action=generate` — prompt construit côté serveur à partir du JSON de la fiche (type détecté, classe, objectif) → Gemini renvoie un JSON de suggestion.
  - `POST ?action=improve` — amélioration ciblée (question mal posée, distracteurs, variation d'exercice).
  - `POST ?action=diagnose` — analyse du JSON (s'appuie sur `diagnostics.js` existant, enrichi par IA).
- Rendu UI : le résultat arrive dans le Studio en **brouillon local** (jamais publié automatiquement) ; le prof valide/édite puis publie via le pipeline d'override existant.

### 5.5 Nettoyage + organisation (clean)

1. Supprimer `public/editor.html`, `public/admin.html`, `public/public/`.
2. Retirer `process.env.API_KEY`/`GEMINI_API_KEY` du `define` de Vite ; les réserver à un endpoint serveur.
3. Regrouper les services prof (`professorSessionService`, `professorClassroomService`, `teacherCanvasSyncService`, `contentOverrides`) sous `src/services/professor/` — cohérence de nommage.
4. Documenter le schéma Redis (ce document + `docs/ARCHITECTURE_ESPACE_PROFESSEUR.md`) : ajouter une section « Clés Redis » unique et à jour.
5. Lancer `npm run analyze:unused` (knip) et éliminer les imports morts.
6. Garantir la configuration d'environnement : créer `.env.example` avec `ACCOUNT_SESSION_SECRET`, `PROF_SESSION_SECRET`, `ADMIN_SECRET` documentés.

---

## 6. Feuille de route suggérée (par ordre de valeur/risque)

| Phase | Contenu | Effort |
|---|---|---|
| **P0 — Configuration** | `.env.example` ; vérifier `ACCOUNT_SESSION_SECRET`/`PROF_SESSION_SECRET` (fixe le 503) | Très faible |
| **P1 — Nettoyage** | Suppression artefacts morts ; retrait defines GEMINI du client ; knip | Faible |
| **P2 — Rotation jeux TV** | Manche automatique (tous répondus → roundId+1), traitement de `stale`, UX « manche k » | Moyen |
| **P3 — Canvas tablette prof** | Aligner la visibilité : canvas sous les images + blocs de révision uniquement sur tablette prof (`lg:hidden`), jamais sur PC ; le PC `/prof/` reste sans canvas (gestion + édition + liste) | Faible |
| **P4 — Sync optimisée** | `since`/`unchanged` sur classroom-load/live-load ; merge par trait pour canvas si coédition | Moyen |
| **P5 — Suggestions IA** | `api/suggest.ts` (Gemini côté serveur), brouillon local, bouton « Suggérer » dans le Studio | Élevé |

---

## 7. Questions ouvertes (à trancher avant implémentation)

1. **Verrouillage canvas** : confirmer que le canvas est **exclusivement tablette prof** (caché sur PC, y compris l'app React en grand écran) → corriger `MediaRenderer.tsx` (`lg:block` → visible `< lg`) et borner `RevisionSectionBlock.tsx`. C'est l'écart détecté.
2. **Périmètre d'édition du prof** : uniquement sa classe (`data/{classId}/…`) — à confirmer. Faut-il un « mode brouillon » avant publication ?
3. **Manche automatique** : quand TOUS les élèves ont répondu, on avance automatiquement ? Ou on attend le clic du prof sur « Manche suivante » ?
4. **Suggestions IA** : clé Gemini existante ? Coût/quotas ? Validation humaine obligatoire avant publication ?
