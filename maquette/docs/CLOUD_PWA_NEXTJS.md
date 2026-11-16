# Infrastructure Cloud (Redis + Firestore + Google Auth), PWA Mobile & Migration Next.js

> Ce document décrit l'architecture complète reliant `maquette/Apprendre.html`, le portail React principal (`/`), la couche hybride **Upstash Redis (L1) + Cloud Firestore (L2)**, l'authentification **Google / Firebase RS256** et l'application **Next.js App Router** (`apps/apprendre-next/`).

---

## 1. Vue d'ensemble des flux & liaisons bidirectionnelles

```
  [ Navigateur Desktop / Mobile Portrait PWA ]
         │                               │
         ├─ / (React + Vite PWA) ◄──────►├─ /apprendre/Apprendre.html (PWA dédiée)
         │     DashboardHeader           │     #set -> #cloud-account-box (lien "/")
         │     LoginView (lien direct)   │     Mode hors-ligne file:// 100% autonome
         │                               │
         ▼                               ▼
     /api/auth  (RS256 Google GIS + Firebase Auth -> Cookie HttpOnly HMAC)
     /api/sync  (CRDT mergeAppEnvelopes -> L1 Redis + L2 Firestore + DLQ retry)
```

---

## 2. Backend Cloud & Authentification (`src/server/cloud/` & `api/`)

| Module | Rôle | Points clés |
| :--- | :--- | :--- |
| [`googleAuth.ts`](../../src/server/cloud/googleAuth.ts) | Vérification cryptographique JWT RS256 | Valide signature JWK via Google OAuth2 Certs & Firebase SecureToken, vérifie `exp`, `iat`, `auth_time`, `iss`, `aud`, `email_verified`. Zéro dépendance `firebase-admin`. |
| [`firestoreRest.ts`](../../src/server/cloud/firestoreRest.ts) | Client Firestore REST v1 | Génère un JWT RS256 Service Account OAuth2 (`scope: datastore`), encode/décode les types Firestore (`mapValue`, `arrayValue`, `integerValue`, `doubleValue`, etc.). |
| [`appStateMerge.ts`](../../src/server/cloud/appStateMerge.ts) | Fusion CRDT monotone (`mergeAppEnvelopes`) | Préserve le meilleur score QCM (`1 > 0 > -1 > null`), la meilleure auto-évaluation exercice (`2 > 1 > 0 > null`), le pourcentage max par fiche `l` et le `lastVisited` / profil le plus récent. |
| [`hybridStore.ts`](../../src/server/cloud/hybridStore.ts) | Persistance hybride L1/L2 + DLQ | Écrit d'abord dans **Redis L1** (latence ms), réplique vers **Firestore L2** ; en cas d'erreur réseau Firestore, pousse dans la file Redis `cloud:sync:dlq` (rejouée par `?action=drain-dlq`). |
| [`api/auth.ts`](../../api/auth.ts) | Endpoints Auth unifiés | `GET ?action=providers|me`, `POST ?action=google`, `POST ?action=link-profile`, `POST ?action=logout`. |
| [`api/sync.ts`](../../api/sync.ts) | Endpoints Sync & Health | `GET ?action=health`, `GET/POST /api/sync` (cookie session requis), `POST ?action=drain-dlq` (secret admin/cron requis). |

---

## 3. Mécanismes internes avancés de `Apprendre.html`

- **EventBus interne** (`MathFlowApp.on` / `MathFlowApp.emit`) dans `maquette/js/app.js` : émet `route:change`, `profile:change`, `state:change`, `state:reset`, avec option `{ silent: true }` lors de l'application distante pour éviter toute boucle d'écho cloud.
- **Stockage IndexedDB & Prefetch prédictif** (`maquette/js/core/offline-db.js`) : base `mathflow-apprendre-v1` (`content_cache`, `sync_outbox`, `meta`) et préchargement `requestIdleCallback` lorsqu'un chapitre s'ouvre.
- **Synchronisation Cloud & GIS** (`maquette/js/core/cloud-sync.js`) : inerte sur `file://` (zéro erreur console), synchronise automatiquement avec `/api/auth` et `/api/sync` sur `http(s)://`, met en file d'attente hors-ligne et rejoue au retour de `online`.
- **Cycle PWA Mobile Portrait** (`maquette/js/core/pwa-mobile.js` + `maquette/css/app-mobile.css` + `maquette/sw-apprendre.js`) :
  - Breakpoints `<= 720px`, `<= 640px`, `<= 400px`, `env(safe-area-inset-*)`, adaptation clavier via `window.visualViewport`.
  - Barre de navigation pouce `nav.mnav` sur les vues hub, masquée automatiquement pendant lecture/quiz/exercice.
  - Modales `<dialog>` et sommaire `#toc[popover]` transformés en **bottom sheets** ergonomiques sur smartphone, cibles tactiles `>= 44px`, défilement horizontal isolé sur `.katex-display` et `.tkz-wrap`.
  - Service Worker dédié `sw-apprendre.js` excluant strictement `/api/*` et `accounts.google.com`, isolé du Workbox racine via `globIgnores: ['**/apprendre/**']` et `navigateFallbackDenylist`.

---

## 4. Déploiement & Préparation Next.js

1. **Build unifié** : `npm run build` compile le portail Vite dans `dist/` et exécute `scripts/copy-maquette-dist.mjs` vers `dist/apprendre/`.
2. **Firebase Firestore & Rules** : déployer [`firestore.rules`](../../firestore.rules) et [`firestore.indexes.json`](../../firestore.indexes.json) (`firebase deploy --only firestore`), puis renseigner les variables décrites dans [`.env.example`](../../.env.example).
3. **Vercel** : [`vercel.json`](../../vercel.json) route `/apprendre` et `/apprendre/` vers `/apprendre/Apprendre.html`, applique la CSP Google GIS + Firebase/Firestore et force `no-store` sur `/api/(auth|sync)` et `/apprendre/sw-apprendre.js`.
4. **Next.js App Router (`apps/apprendre-next/`)** : application complète décrite dans le [livret d’architecture](../../apps/apprendre-next/ARCHITECTURE_LIVRET.md). Le starter redondant `next-app/` a été supprimé. Les primitives auth, fusion CRDT et stockage restent partagées avec le portail.
