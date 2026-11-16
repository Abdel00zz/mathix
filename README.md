# Math+ — Apprendre Autrement

PWA d'apprentissage des mathématiques (programme marocain : Tronc commun → 2ᵉ BAC)
avec cours interactifs, quiz, exercices, examens nationaux, olympiades et
préparation aux concours (ENSA, ENSAM, Médecine). Notifications push, mode
hors-ligne et synchronisation cloud.

## Démarrage

```bash
npm install
npm run dev          # serveur de développement Vite
npm run build        # build production (PWA précachée)
npm run type-check   # vérification TypeScript
npm run lint         # ESLint
npm run analyze:unused  # détection de code mort (knip)
```

## Architecture — Form follows function

L’application Next.js complète se trouve dans [`apps/apprendre-next`](apps/apprendre-next/ARCHITECTURE_LIVRET.md) :

```bash
cd apps/apprendre-next
npm ci
npm run dev          # http://localhost:3100
npm run verify       # architecture, types, lint, tests PWA/CSP et build
```

Le portail Vite à la racine et la maquette autonome conservent leurs entrées distinctes. Pour déployer Next sur Vercel, sélectionner `apps/apprendre-next` comme Root Directory et autoriser les sources partagées au-dessus de ce répertoire. Le projet racine Vite déploie `dist`, pas l’application Next. Les variables du modèle [`.env.example`](.env.example) doivent être configurées dans le projet cible ; pour Next local, les placer dans `apps/apprendre-next/.env.local`. Les secrets et sorties d’audit ne sont pas versionnés.

Les règles de progression, les contrôles effectués et les limites de validation cloud figurent dans le [livret d’architecture](apps/apprendre-next/ARCHITECTURE_LIVRET.md).

Chaque dossier correspond à une fonction du produit, pas à un détail technique.

```
├── index.html          Point d'entrée HTML + splash screen
├── src/                Code client (React 19 + Vite + Tailwind)
│   ├── index.tsx       Bootstrap React + KaTeX + CSS globaux
│   ├── App.tsx         Routeur de vues (lazy loading par vue)
│   ├── types.ts        Types partagés de l'application
│   ├── components/
│   │   ├── Views/      Une vue par fonction : Dashboard, Quiz, Révision,
│   │   │               Exercices, Concours (hub + quiz), Examens, Login…
│   │   ├── Dashboard/  Onglets, modules (chapitres, examens, olympiades…)
│   │   ├── Quiz/       Moteur de quiz (MCQ, vrai/faux, ordre, erreur, saisie)
│   │   ├── Revision/   Fiches de cours actives (blocs, blanks, compétences)
│   │   ├── Exercise/   Sessions d'exercices (engine, feedback, impression)
│   │   ├── Modals/     Paramètres, messages, aide, orientation
│   │   └── UI/         Primitives transverses (boutons, spinners, PWA prompt)
│   ├── hooks/          Logique réutilisable (progression, navigation, quiz…)
│   ├── services/       Accès données & plateformes (contenu, push, sync cloud,
│   │                   concours, stockage, service worker…)
│   ├── utils/          Fonctions pures (parseur math, formats, sons…)
│   ├── styles/         CSS organisé core / components / revision
│   ├── data/           Contenus statiques embarqués (orientation)
│   └── workers/        Web workers (rendu math)
├── api/                Fonctions serverless Vercel (push, progression, emails, cron)
├── public/
│   ├── data/           Contenus pédagogiques JSON (classes, chapitres, concours)
│   ├── admin/          Console d'administration (notifications, suivi)
│   └── sw-push.js      Handlers push du service worker
├── docs/               Guides de création de contenu (exercices, quiz, fiches…)
└── brain/              Notes d'architecture internes
```

Alias d'import : `@/` pointe vers `src/` (configuré dans Vite et tsconfig).

## Variables d'environnement

- `VITE_VAPID_PUBLIC_KEY` — clé publique Web Push (VAPID)
- `VAPID_PRIVATE_KEY`, `KV_*` / Upstash, `RESEND_API_KEY` — côté Vercel (api/)
- `ACCOUNT_SESSION_SECRET` — signature des sessions de compte et des liens
  temporaires d’autorisation d’un nouvel appareil
- `ADMIN_SECRET` — secret distinct réservé exclusivement à `/admin/`
- `PROF_SESSION_SECRET` — repli migratoire temporaire pour les anciennes
  sessions professeur

Voir aussi : [`docs/ARCHITECTURE_ESPACE_PROFESSEUR.md`](docs/ARCHITECTURE_ESPACE_PROFESSEUR.md).
