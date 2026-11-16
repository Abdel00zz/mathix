# Analyse — Branchement Login / AuthPanel

Ce document trace le circuit complet d'authentification et d'identification,
du premier écran jusqu'à la session de compte signée côté serveur.

## 1. Vue d'ensemble du circuit

```
LoginView (src/components/Views/LoginView.tsx)
   │  état local : prénom/nom, téléphone, classe, mode, rôle, mot de passe
   │  ── affiche AuthPanel (src/components/Views/login/AuthPanel.tsx)
   │
   ├─ Inscription  → POST /api/users?action=register → onLogin(user)
   ├─ Connexion    → POST /api/users?action=login    → onLogin(user)
   ├─ Reprise      → accountSessionService.getCurrentUser()
   │                    → GET /api/users?action=me   → onLogin(user) / student
   │
   └─ onLogin = handleVerifiedLogin (App.tsx)
           → professorSessionService.acceptVerifiedUser(user)
           → useGlobalProgress.login(user)
```

Le point d'entrée est `App.tsx` (`renderContent`, cas `'login'`) :

```tsx
<LoginView onLogin={handleVerifiedLogin} onLogout={handleLogout} manifest={appManifest} />
```

## 2. Les deux parcours d'identification

### Inscription (rôle élève ou prof « demandé »)
`LoginView.handleSubmit` appelle `/api/users?action=register` avec
`{ name, firstName, lastName, phone, classId, className, password, requestedRole }`.
Le serveur crée le compte, pose le cookie `HttpOnly` `mathplus_account_session`
et renvoie `{ user, sessionReady }`. Le client reconstruit un `UserProfile`
et le remonte via `onLogin`.

Points de branchement :
- `data.error === 'phone_taken'` / `'name_taken'` → erreurs affichées dans `AuthPanel`.
- `data.sessionReady === false` → le compte existe mais le secret de session
  (`ACCOUNT_SESSION_SECRET`) est absent côté serveur : le client bloque.
- Le rôle `prof` demandé à l'inscription n'est **jamais** accordé seul :
  il reste `student` tant que l'administrateur n'a pas validé le compte.

### Connexion (compte existant)
`LoginView.handlePhoneLogin` appelle `/api/users?action=login` avec
`{ phone, password }`. Le serveur vérifie le mot de passe (scrypt, `_shared.ts`),
pose le cookie et renvoie `{ found: true, user }`.

Erreurs gérées : `password_not_set`, `invalid_credentials`, `too_many_attempts`,
`account_session_unavailable`, `session_account_mismatch`.

### Reprise (déjà connecté sur cet appareil)
`LoginView.handleResume` appelle `accountSessionService.getCurrentUser()`
(`GET /api/users?action=me`) qui relit le cookie `HttpOnly` et renvoie l'identité
prouvée. Hors connexion, le profil local est restauré **sans privilèges prof**.

## 3. AuthPanel — la machine d'états d'interface

`AuthPanel` est un composant **présentationnel** : il ne parle pas au réseau,
il remonte des callbacks.

- **Landing** (`!registrationStarted && !existingUser`) : accueil avec
  « Je suis élève » / « Je suis enseignant » → `openRegistration(role)`.
- **`existingUser`** : écran « continuer » → `onResume` / `onReset`.
- **Inscription en 4 étapes** (`onboardingStep` 1..4) :
  1. rôle (student / prof) — `RoleToggle` ;
  2. mode (lycée / collège) + classe — `ModeToggle`, `ClassDropdown` ;
  3. identité (prénom, nom) ;
  4. téléphone (`PhoneInput` avec `CountryPicker`) + mot de passe
     (`PasswordInput`), puis soumission `onSubmit`.
- **`returningOpen`** : panneau « déjà un compte ? » → `onPhoneLogin`.

## 4. La validation de session côté App (le verrou de sécurité)

`App.tsx` distingue l'identité **affichée localement** de l'identité
**prouvée par le serveur** :

1. Au démarrage, `accountSessionService.getCurrentUser()` est appelé une fois
   (`bootstrapPromiseRef`), puis revalidé toutes les 60 s et au retour
   `online`/`visibilitychange`.
2. `commitVerifiedUser` compare l'identité courante à la nouvelle :
   - identité identique → `applyVerifiedUser` (rafraîchit le rôle) ;
   - identité différente → `logout()` puis `login()` (aucune fusion de données) ;
   - aucun compte prouvé → `removeUnverifiedProfessorAccess` (rétrograde `prof`
     vers `student`).
3. `professorSessionService.acceptVerifiedUser(user)` ne garde qu'un cache
   **non sensible** (nom + classe) pour l'affichage. Le rôle n'est jamais
   accordé par le client : chaque écriture sensible relit le cookie côté serveur.

## 5. Services impliqués

| Service | Rôle |
|---|---|
| `accountSessionService` | `getCurrentUser()` (`/me`) + `logout()` (`/logout`), cookie `HttpOnly` |
| `professorSessionService` | cache local non sensible + `isProfessor()` (via `useProfessorAccess`) |
| `storageService` | profil local persistant (mode hors-ligne, sans privilèges) |
| `contentService` | manifest racine (liste des classes pour le `ClassDropdown`) |

## 6. API côté serveur (`api/users.ts`, `api/_shared.ts`)

- `action=register` : création du compte + cookie signé `mathplus_account_session`
  (HMAC `ACCOUNT_SESSION_SECRET`, `SameSite=Strict`, `HttpOnly`, `Secure` en prod).
- `action=login` : vérification scrypt du mot de passe + cookie.
- `action=me` : relit le cookie, contrôle `authVersion` et l'alias téléphone,
  renvoie le `UserProfile` courant (dont `role`, `profId`, `profClasses`).
- `action=logout` : révoque le cookie.
- La promotion `prof` passe exclusivement par l'admin (`/api/users?action=role-set`).

## 7. Points de vigilance

- Le rôle `prof` est **prouvé par le cookie** (`readActiveProfessorSession`),
  jamais par le `localStorage` : une rétrogradation admin est effective dès le
  prochain appel sensible.
- Le ciblage élève ↔ prof repose sur `user.profId` (`users:prof:{accountId}`).
- Le cache local `storageService.loadState().user` est utilisé **uniquement**
  pour l'écran de reprise hors-ligne ; il n'octroie aucun droit.
