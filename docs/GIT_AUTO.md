# Git Auto — commit et push assistés

`scripts/git-auto.ps1` automatise le diagnostic, les contrôles qualité, le
commit, la synchronisation et le push sans forcer un changement de branche.

## Démarrage rapide

```powershell
# Première utilisation sur une nouvelle machine
.\setup_git.bat

# Diagnostic uniquement, sans modifier le dépôt
.\git_doctor.bat

# Simulation complète
.\auto_commit.bat -DryRun

# Commit + push automatiques
.\auto_commit.bat

# Demander confirmation avant le commit et le push
.\auto_commit.bat -Interactive

# Limiter le commit à des chemins précis
.\auto_commit.bat -Paths src/components,src/styles

# Imposer le message et exécuter aussi le build
.\auto_commit.bat -Message "fix(auth): compacte la connexion" -WithBuild

# Créer seulement le commit local
.\auto_commit.bat -NoPush
```

Le script PowerShell peut aussi être lancé directement :

```powershell
.\scripts\git-auto.ps1 -Doctor
```

## Nouvelle machine

Lancer `setup_git.bat` une seule fois. L'assistant :

- installe, avec confirmation, Git for Windows, GitHub CLI et Node.js LTS
  lorsqu'ils sont absents et que `winget` est disponible ;
- configure le nom et l'email Git ;
- active une branche initiale `main`, le rebase au pull, le nettoyage des
  références et la création automatique de l'upstream ;
- ouvre la connexion officielle GitHub dans le navigateur ;
- confie les identifiants à GitHub CLI ou au coffre sécurisé de Windows ;
- détecte le remote et prépare le suivi de la branche courante ;
- vérifie enfin la connexion sans afficher ni enregistrer de mot de passe
  dans le projet.

La préparation peut aussi être automatisée sans saisie pour l'identité :

```powershell
.\scripts\git-auto.ps1 -Setup -InstallTools -Interactive `
  -GitName "Votre Nom" -GitEmail "vous@exemple.com"

# Ajouter origin si le projet copié n'en possède pas
.\scripts\git-auto.ps1 -Setup -Interactive `
  -RemoteUrl "https://github.com/compte/depot.git"
```

Si une installation vient de modifier le `PATH`, fermer et rouvrir le
terminal puis relancer `setup_git.bat`.

## Ce que le programme vérifie

- présence de Git, Node, npm et de l’identité Git ;
- dépôt valide, branche détachée, conflits et opérations Git inachevées ;
- verrou `index.lock` abandonné ;
- état du remote, authentification et connectivité ;
- secrets probables, clés privées et jetons connus ;
- fichiers trop volumineux ou normalement ignorés ;
- marqueurs de conflit et restes de débogage ;
- `npm run type-check`, puis ESLint lorsque du code est modifié ;
- build de production avec `-WithBuild` ;
- divergence avec la branche distante avant le push.

Le message de commit suit automatiquement le format Conventional Commits et
utilise le type, le scope et les fichiers réellement modifiés.

## Sécurité et récupération

- `-DryRun` ne modifie rien.
- `-Doctor` effectue uniquement le diagnostic.
- `-Paths` évite de mélanger des changements indépendants.
- `-Strict` rend les avertissements bloquants.
- `-Fix` applique les corrections sûres disponibles.
- `-Force` contourne les blocages et doit rester exceptionnel.
- avant un rebase, une sauvegarde de `HEAD` est créée sous
  `refs/gitauto/backup-AAAAmmjj-HHMMSS`.
- un push refusé ne supprime jamais le commit local.
- les rapports sont enregistrés dans `.git/gitauto/`.

## Codes de sortie

| Code | Signification |
| ---: | --- |
| 0 | succès |
| 1 | erreur inattendue |
| 2 | rien à faire |
| 3 | problème bloquant détecté |
| 4 | contrôle qualité en échec |
| 5 | synchronisation/rebase en échec |
| 6 | push en échec |
| 7 | environnement Git invalide |
