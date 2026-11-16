<#
.SYNOPSIS
    git-auto : commit + push automatisés, avec diagnostic du dépôt et détection de problèmes.

.DESCRIPTION
    Pipeline en 9 étapes :
      1. Environnement      - git / node / npm, identité git, version
      2. Dépôt              - racine, intégrité, verrous, opération en cours, HEAD, remote, connectivité
      3. Analyse            - fichiers modifiés, statistiques, classification
      4. Inspection         - secrets, gros fichiers, marqueurs de conflit, fichiers ignorés suivis...
      5. Qualité            - type-check / lint / build (déclenchés seulement si pertinent)
      6. Commit             - staging + message conventionnel généré à partir du diff
      7. Synchronisation    - fetch, ahead/behind, rebase avec autostash + ref de sauvegarde
      8. Push               - upstream auto, retries sur erreurs réseau, diagnostic des refus
      9. Rapport            - résumé, journal, JSON

.PARAMETER Message
    Message de commit imposé (sinon il est généré automatiquement).

.PARAMETER Type
    Force le type conventionnel : feat, fix, docs, style, refactor, perf, test, build, chore.

.PARAMETER Scope
    Force le scope du message.

.PARAMETER Paths
    Limite le staging à certains chemins.

.PARAMETER Doctor
    Diagnostic seul : étapes 1 à 4, aucun commit, aucun push.

.PARAMETER DryRun
    Simule tout : affiche ce qui serait fait sans rien modifier.

.PARAMETER NoVerify
    Saute les contrôles qualité (étape 5).

.PARAMETER Strict
    Les avertissements (lint, gros fichiers, etc.) deviennent bloquants.

.PARAMETER WithBuild
    Ajoute `npm run build` aux contrôles qualité.

.PARAMETER NoPush
    Commit seulement, pas de push.

.PARAMETER NoSync
    Ne synchronise pas avec le remote avant push (déconseillé).

.PARAMETER Amend
    Modifie le dernier commit au lieu d'en créer un nouveau.

.PARAMETER Fix
    Applique les corrections automatiques possibles (dé-suivi des fichiers ignorés, eslint --fix).

.PARAMETER Force
    Ignore les problèmes bloquants détectés à l'étape 4. À utiliser en connaissance de cause.

.PARAMETER Interactive
    Demande confirmation avant le commit et avant le push.

.PARAMETER Tag
    Crée et pousse un tag annoté après le push.

.PARAMETER Json
    Écrit un résumé JSON sur la sortie standard en fin d'exécution.

.PARAMETER Setup
    Prépare une nouvelle machine : outils, identité Git, connexion GitHub et
    réglages pratiques. Ce mode ne crée aucun commit.

.PARAMETER InstallTools
    Avec -Setup, installe les outils manquants via winget.

.PARAMETER GitName
    Nom à enregistrer dans la configuration Git globale pendant -Setup.

.PARAMETER GitEmail
    Adresse à enregistrer dans la configuration Git globale pendant -Setup.

.PARAMETER RemoteUrl
    Ajoute le remote origin avec cette URL s'il n'existe pas pendant -Setup.

.EXAMPLE
    .\scripts\git-auto.ps1
.EXAMPLE
    .\scripts\git-auto.ps1 -Doctor
.EXAMPLE
    .\scripts\git-auto.ps1 -Setup -InstallTools -Interactive
.EXAMPLE
    .\scripts\git-auto.ps1 -m "fix(canvas): rejet de paume" -WithBuild
.EXAMPLE
    .\scripts\git-auto.ps1 -DryRun -Interactive
#>

[CmdletBinding()]
param(
    [Alias('m')][string]$Message,
    [ValidateSet('feat', 'fix', 'docs', 'style', 'refactor', 'perf', 'test', 'build', 'chore', 'data')]
    [string]$Type,
    [string]$Scope,
    [string[]]$Paths,
    [switch]$Doctor,
    [switch]$DryRun,
    [switch]$NoVerify,
    [switch]$Strict,
    [switch]$WithBuild,
    [switch]$NoPush,
    [switch]$NoSync,
    [switch]$Amend,
    [switch]$Fix,
    [switch]$Force,
    [switch]$Interactive,
    [string]$Tag,
    [switch]$Json,
    [switch]$Setup,
    [switch]$InstallTools,
    [string]$GitName,
    [string]$GitEmail,
    [string]$RemoteUrl
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$script:StartedAt = Get-Date

try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch { }

# powershell.exe -File (utilisé par le lanceur .bat) ne transforme pas
# "src,docs" en tableau. Accepter les deux syntaxes rend -Paths fiable depuis
# PowerShell comme depuis cmd.exe.
if ($Paths) {
    $normalizedPaths = @()
    foreach ($pathArgument in $Paths) {
        foreach ($pathPart in ($pathArgument -split ',')) {
            $cleanPath = $pathPart.Trim()
            if ($cleanPath) { $normalizedPaths += $cleanPath }
        }
    }
    $Paths = @($normalizedPaths | Select-Object -Unique)
}

# ---------------------------------------------------------------------------
# Constantes / seuils
# ---------------------------------------------------------------------------

$script:Cfg = @{
    LargeFileWarnMB   = 5
    LargeFileBlockMB  = 95      # GitHub refuse au-delà de 100 Mo
    ManyFilesWarn     = 200
    MaxSubjectLength  = 72
    PushRetries       = 3
    RemoteProbeTimeout = 20
    ProtectedBranches = @('main', 'master', 'production')
}

# Codes de sortie
$EXIT_OK = 0
$EXIT_ERROR = 1
$EXIT_NOTHING = 2
$EXIT_BLOCKED = 3
$EXIT_QUALITY = 4
$EXIT_SYNC = 5
$EXIT_PUSH = 6
$EXIT_ENV = 7

$script:Issues = @()
$script:Log = New-Object System.Collections.Generic.List[string]
$script:Result = [ordered]@{
    startedAt = $script:StartedAt.ToString('o')
    dryRun    = [bool]$DryRun
    doctor    = [bool]$Doctor
    branch    = $null
    remote    = $null
    files     = 0
    commit    = $null
    pushed    = $false
    issues    = @()
    status    = 'unknown'
    exitCode  = $EXIT_OK
    durationSeconds = 0
}

# ---------------------------------------------------------------------------
# Affichage
# ---------------------------------------------------------------------------

function Write-Line {
    param([string]$Text = '', [string]$Color = 'Gray')
    $script:Log.Add(("[{0:HH:mm:ss}] {1}" -f (Get-Date), $Text))
    Write-Host $Text -ForegroundColor $Color
}

function Write-Step {
    param([int]$Number, [string]$Title)
    Write-Host ''
    Write-Line ("  {0}. {1}" -f $Number, $Title.ToUpper()) 'Cyan'
    Write-Line ("  " + ('-' * 66)) 'DarkGray'
}

function Write-Ok    { param([string]$T) Write-Line ("     [ok]   $T") 'Green' }
function Write-Info  { param([string]$T) Write-Line ("     [i]    $T") 'Gray' }
function Write-Warn2 { param([string]$T) Write-Line ("     [!]    $T") 'Yellow' }
function Write-Err2  { param([string]$T) Write-Line ("     [x]    $T") 'Red' }
function Write-Hint  { param([string]$T) Write-Line ("            -> $T") 'DarkGray' }

function Write-Banner {
    Write-Host ''
    Write-Host '  ============================================================' -ForegroundColor DarkCyan
    Write-Host '   git-auto  |  commit & push assistés' -ForegroundColor White
    $mode = @()
    if ($Doctor)      { $mode += 'DIAGNOSTIC' }
    if ($DryRun)      { $mode += 'SIMULATION' }
    if ($Force)       { $mode += 'FORCE' }
    if ($Strict)      { $mode += 'STRICT' }
    if ($NoVerify)    { $mode += 'SANS CONTROLES' }
    if ($Setup)       { $mode += 'NOUVELLE MACHINE' }
    if ($mode.Count -gt 0) {
        Write-Host ("   mode : " + ($mode -join ' + ')) -ForegroundColor Yellow
    }
    Write-Host '  ============================================================' -ForegroundColor DarkCyan
}

function Add-Issue {
    param(
        [ValidateSet('Block', 'Warn', 'Info')][string]$Severity,
        [string]$Code,
        [string]$Message,
        [string]$Hint = '',
        [scriptblock]$AutoFix = $null
    )
    $script:Issues += [pscustomobject]@{
        Severity = $Severity
        Code     = $Code
        Message  = $Message
        Hint     = $Hint
        AutoFix  = $AutoFix
        Fixed    = $false
    }
    switch ($Severity) {
        'Block' { Write-Err2  $Message }
        'Warn'  { Write-Warn2 $Message }
        'Info'  { Write-Info  $Message }
    }
    if ($Hint) { Write-Hint $Hint }
}

function Get-Blockers {
    $blockers = @($script:Issues | Where-Object { $_.Severity -eq 'Block' -and -not $_.Fixed })
    if ($Strict) {
        $blockers += @($script:Issues | Where-Object { $_.Severity -eq 'Warn' -and -not $_.Fixed })
    }
    return $blockers
}

function Confirm-Action {
    param([string]$Question, [bool]$DefaultYes = $true)
    if (-not $Interactive) { return $true }
    $suffix = '[O/n]'
    if (-not $DefaultYes) { $suffix = '[o/N]' }
    Write-Host ''
    $answer = Read-Host ("     ? $Question $suffix")
    if ([string]::IsNullOrWhiteSpace($answer)) { return $DefaultYes }
    return ($answer -match '^(o|oui|y|yes)$')
}

function Stop-Script {
    param([int]$Code, [string]$Status, [string]$Reason = '')
    $script:Result.status = $Status
    $script:Result.exitCode = $Code
    if ($Reason) { Write-Host ''; Write-Line ("  >> $Reason") 'Yellow' }
    Write-Report
    exit $Code
}

# ---------------------------------------------------------------------------
# Exécution de commandes
# ---------------------------------------------------------------------------

function Invoke-Native {
    param(
        [string]$Exe,
        [string[]]$Arguments,
        [switch]$Quiet
    )
    $prevEap = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    $raw = & $Exe @Arguments 2>&1
    $code = $LASTEXITCODE
    $ErrorActionPreference = $prevEap

    # Séparer stdout et stderr : sous PowerShell 5.1, `2>&1` transforme chaque
    # ligne d'erreur native en ErrorRecord. Sans ce tri, les avertissements de
    # git (fins de ligne CRLF, etc.) pollueraient les valeurs lues.
    $out = @()
    $err = @()
    $all = @()
    foreach ($item in @($raw)) {
        $text = [string]$item
        $all += $text
        if ($item -is [System.Management.Automation.ErrorRecord]) { $err += $text } else { $out += $text }
    }
    if (-not $Quiet -and $VerbosePreference -eq 'Continue') {
        Write-Verbose ("$Exe " + ($Arguments -join ' '))
    }
    return [pscustomobject]@{
        Ok    = ($code -eq 0)
        Code  = $code
        Out   = $out
        Err   = $err
        Lines = $all
        Text  = ($out -join [Environment]::NewLine)
        All   = ($all -join [Environment]::NewLine)
    }
}

# Fonctions simples et volontairement sans bloc param : tous les arguments,
# y compris ceux commençant par '-' ou '-c', arrivent bruts dans $args.
function Invoke-Git {
    return Invoke-Native -Exe 'git' -Arguments @($args)
}

function Get-GitValue {
    $r = Invoke-Native -Exe 'git' -Arguments @($args)
    if (-not $r.Ok) { return '' }
    return $r.Text.Trim()
}

function Test-PathMatchesFilter {
    param([string]$Candidate)
    if (-not $Paths) { return $true }

    $candidatePath = $Candidate.Replace('\', '/')
    foreach ($filter in $Paths) {
        $normalizedFilter = $filter.Replace('\', '/').TrimEnd('/')
        if (
            $candidatePath -eq $normalizedFilter -or
            $candidatePath -like "$normalizedFilter/*" -or
            $candidatePath -like $normalizedFilter
        ) {
            return $true
        }
    }
    return $false
}

function Test-CommandExists {
    param([string]$Name)
    $cmd = Get-Command $Name -ErrorAction SilentlyContinue
    return ($null -ne $cmd)
}

# ---------------------------------------------------------------------------
# 0. INSTALLATION / PREMIÈRE UTILISATION
# ---------------------------------------------------------------------------

function Update-SessionPath {
    $machinePath = [Environment]::GetEnvironmentVariable('Path', 'Machine')
    $userPath = [Environment]::GetEnvironmentVariable('Path', 'User')
    $currentPath = [Environment]::GetEnvironmentVariable('Path', 'Process')
    $parts = @(($currentPath, $userPath, $machinePath) -join ';' -split ';' |
        Where-Object { $_ } | Select-Object -Unique)
    $env:Path = $parts -join ';'
}

function Install-RequiredTool {
    param(
        [string]$Command,
        [string]$WingetId,
        [string]$Label,
        [bool]$Required
    )

    if (Test-CommandExists $Command) {
        Write-Ok "$Label déjà installé."
        return $true
    }

    if (-not $InstallTools) {
        $level = if ($Required) { 'requis' } else { 'recommandé' }
        Write-Warn2 "$Label absent ($level)."
        Write-Hint "Relancer avec -Setup -InstallTools, ou : winget install --id $WingetId -e"
        return (-not $Required)
    }

    if (-not (Test-CommandExists 'winget')) {
        Write-Err2 "winget est absent : installation automatique de $Label impossible."
        Write-Hint 'Installer « App Installer » depuis Microsoft Store, puis relancer.'
        return (-not $Required)
    }

    if ($DryRun) {
        Write-Info "[simulation] installation de $Label via winget ($WingetId)"
        return $true
    }

    if (-not (Confirm-Action "Installer $Label avec winget ?" $true)) {
        Write-Warn2 "Installation de $Label ignorée."
        return (-not $Required)
    }

    Write-Info "Installation de $Label..."
    $install = Invoke-Native -Exe 'winget' -Arguments @(
        'install', '--id', $WingetId, '--exact',
        '--accept-package-agreements', '--accept-source-agreements',
        '--disable-interactivity'
    )
    if (-not $install.Ok) {
        Write-Err2 "Échec de l'installation de $Label."
        foreach ($line in ($install.Lines | Select-Object -Last 5)) { Write-Hint $line }
        return (-not $Required)
    }

    Update-SessionPath
    if (Test-CommandExists $Command) {
        Write-Ok "$Label installé."
        return $true
    }

    Write-Warn2 "$Label semble installé, mais le PATH n'est pas encore actualisé."
    Write-Hint 'Fermer puis rouvrir le terminal et relancer setup_git.bat.'
    return (-not $Required)
}

function Set-GitDefault {
    param([string]$Key, [string]$Value)
    $current = Get-GitValue 'config' '--global' '--get' $Key
    if ($current) {
        Write-Info "$Key = $current (conservé)"
        return
    }
    if ($DryRun) {
        Write-Info "[simulation] git config --global $Key $Value"
        return
    }
    $set = Invoke-Git 'config' '--global' $Key $Value
    if ($set.Ok) { Write-Ok "$Key = $Value" } else { Write-Warn2 "Impossible de régler $Key." }
}

function Invoke-FirstMachineSetup {
    Write-Step 0 'Préparation de la machine'

    Write-Info ("PowerShell {0}" -f $PSVersionTable.PSVersion)
    $gitReady = Install-RequiredTool -Command 'git' -WingetId 'Git.Git' -Label 'Git for Windows' -Required $true
    Install-RequiredTool -Command 'gh' -WingetId 'GitHub.cli' -Label 'GitHub CLI' -Required $false | Out-Null
    Install-RequiredTool -Command 'node' -WingetId 'OpenJS.NodeJS.LTS' -Label 'Node.js LTS' -Required $false | Out-Null

    if (-not $gitReady -or (-not (Test-CommandExists 'git') -and -not $DryRun)) {
        Stop-Script $EXIT_ENV 'setup-tools-missing' 'Git est requis. Installer Git puis relancer la préparation.'
    }
    if (-not (Test-CommandExists 'git')) {
        Stop-Script $EXIT_OK 'setup-simulated' 'Simulation terminée ; aucun outil installé.'
    }

    Write-Host ''
    Write-Line '     Configuration Git globale' 'Cyan'

    $configuredName = Get-GitValue 'config' '--global' '--get' 'user.name'
    $configuredEmail = Get-GitValue 'config' '--global' '--get' 'user.email'
    $wantedName = $GitName
    $wantedEmail = $GitEmail

    if (-not $wantedName -and -not $configuredName -and $Interactive -and -not $DryRun) {
        $wantedName = Read-Host '     Votre nom pour les commits'
    }
    if (-not $wantedEmail -and -not $configuredEmail -and $Interactive -and -not $DryRun) {
        $wantedEmail = Read-Host '     Votre email GitHub pour les commits'
    }

    if ($wantedEmail -and $wantedEmail -notmatch '^[^@\s]+@[^@\s]+\.[^@\s]+$') {
        Write-Err2 "Adresse email invalide : $wantedEmail"
        Stop-Script $EXIT_ENV 'setup-invalid-email'
    }

    if ($wantedName) {
        if ($DryRun) { Write-Info "[simulation] configuration de user.name" }
        else {
            $result = Invoke-Git 'config' '--global' 'user.name' $wantedName
            if (-not $result.Ok) { Stop-Script $EXIT_ENV 'setup-git-config' 'Impossible de configurer user.name.' }
            Write-Ok "Nom Git : $wantedName"
        }
    } elseif ($configuredName) {
        Write-Ok "Nom Git : $configuredName"
    } else {
        Write-Err2 'Le nom Git est manquant.'
        Write-Hint 'Relancer avec -Interactive ou -GitName "Votre Nom".'
        Stop-Script $EXIT_ENV 'setup-identity-missing'
    }

    if ($wantedEmail) {
        if ($DryRun) { Write-Info '[simulation] configuration de user.email' }
        else {
            $result = Invoke-Git 'config' '--global' 'user.email' $wantedEmail
            if (-not $result.Ok) { Stop-Script $EXIT_ENV 'setup-git-config' 'Impossible de configurer user.email.' }
            Write-Ok "Email Git : $wantedEmail"
        }
    } elseif ($configuredEmail) {
        Write-Ok "Email Git : $configuredEmail"
    } else {
        Write-Err2 "L'email Git est manquant."
        Write-Hint 'Relancer avec -Interactive ou -GitEmail "vous@exemple.com".'
        Stop-Script $EXIT_ENV 'setup-identity-missing'
    }

    Set-GitDefault 'init.defaultBranch' 'main'
    Set-GitDefault 'pull.rebase' 'true'
    Set-GitDefault 'fetch.prune' 'true'
    Set-GitDefault 'push.autoSetupRemote' 'true'

    $insideRepo = (Get-GitValue 'rev-parse' '--is-inside-work-tree') -eq 'true'
    if (-not $insideRepo) {
        Write-Warn2 "Le dossier actuel n'est pas encore un dépôt Git."
        Write-Hint 'Cloner le dépôt, puis relancer setup_git.bat depuis celui-ci.'
        return
    }

    $repoRoot = (Get-GitValue 'rev-parse' '--show-toplevel') -replace '/', '\'
    Set-Location $repoRoot
    $script:RepoRoot = $repoRoot

    $remotes = @((Get-GitValue 'remote') -split "`n" | Where-Object { $_ })
    if ($remotes.Count -eq 0) {
        $wantedRemote = $RemoteUrl
        if (-not $wantedRemote -and $Interactive -and -not $DryRun) {
            $wantedRemote = Read-Host '     URL du dépôt distant (laisser vide pour ignorer)'
        }
        if ($wantedRemote) {
            if ($wantedRemote -notmatch '^(https://|ssh://|git@)') {
                Write-Err2 "URL distante non reconnue : $wantedRemote"
                Stop-Script $EXIT_ENV 'setup-invalid-remote'
            }
            if ($DryRun) { Write-Info '[simulation] ajout du remote origin' }
            else {
                $added = Invoke-Git 'remote' 'add' 'origin' $wantedRemote
                if (-not $added.Ok) { Stop-Script $EXIT_ENV 'setup-remote-failed' "Impossible d'ajouter origin." }
                Write-Ok 'Remote origin ajouté.'
            }
        } else {
            Write-Warn2 'Aucun remote : la connexion et le push ne peuvent pas être préparés.'
            Write-Hint 'Relancer avec -RemoteUrl https://github.com/compte/depot.git'
            return
        }
    }

    $remote = if (@((Get-GitValue 'remote') -split "`n") -contains 'origin') { 'origin' } else { @((Get-GitValue 'remote') -split "`n")[0] }
    $remoteUrl = Get-GitValue 'remote' 'get-url' $remote
    Write-Ok "Remote $remote : $remoteUrl"

    if ($remoteUrl -match 'github\.com') {
        Write-Host ''
        Write-Line '     Connexion sécurisée à GitHub' 'Cyan'

        if (Test-CommandExists 'gh') {
            $auth = Invoke-Native -Exe 'gh' -Arguments @('auth', 'status', '--hostname', 'github.com')
            if (-not $auth.Ok) {
                if ($DryRun) {
                    Write-Info '[simulation] ouverture de la connexion GitHub dans le navigateur'
                } elseif ($Interactive) {
                    Write-Info 'Une page GitHub va permettre de vous connecter sans stocker de mot de passe dans le script.'
                    & gh auth login --hostname github.com --git-protocol https --web
                    if ($LASTEXITCODE -ne 0) { Stop-Script $EXIT_ENV 'setup-auth-failed' 'Connexion GitHub annulée ou refusée.' }
                } else {
                    Write-Warn2 'GitHub CLI n’est pas encore connecté.'
                    Write-Hint 'Relancer setup_git.bat, ou : gh auth login --web'
                    return
                }
            } else {
                Write-Ok 'Session GitHub déjà active.'
            }

            if (-not $DryRun) {
                $credentialSetup = Invoke-Native -Exe 'gh' -Arguments @('auth', 'setup-git')
                if ($credentialSetup.Ok) { Write-Ok 'Git configuré pour utiliser la session GitHub.' }
                else { Write-Warn2 'GitHub CLI connecté, mais le gestionnaire Git n’a pas été configuré.' }
            }
        } else {
            $gcm = Invoke-Git 'credential-manager' '--version'
            if ($gcm.Ok -and $Interactive -and -not $DryRun) {
                Write-Info 'Connexion avec Git Credential Manager...'
                & git credential-manager github login
                if ($LASTEXITCODE -ne 0) { Stop-Script $EXIT_ENV 'setup-auth-failed' 'Connexion GitHub annulée ou refusée.' }
                Write-Ok 'Connexion GitHub enregistrée dans le coffre sécurisé Windows.'
            } else {
                Write-Warn2 'Aucun outil de connexion GitHub disponible.'
                Write-Hint 'Installer GitHub CLI : winget install --id GitHub.cli -e'
                return
            }
        }
    } else {
        Write-Info 'Remote non-GitHub : les identifiants seront demandés par son gestionnaire au premier push.'
    }

    $branch = Get-GitValue 'branch' '--show-current'
    if ($branch) {
        $upstream = Get-GitValue 'rev-parse' '--abbrev-ref' '--symbolic-full-name' '@{u}'
        $remoteRef = "refs/remotes/$remote/$branch"
        if (-not $upstream -and (Invoke-Git 'show-ref' '--verify' '--quiet' $remoteRef).Ok) {
            if ($DryRun) { Write-Info "[simulation] upstream $remote/$branch" }
            else {
                $track = Invoke-Git 'branch' "--set-upstream-to=$remote/$branch" $branch
                if ($track.Ok) { Write-Ok "Upstream configuré : $remote/$branch" }
            }
        } elseif ($upstream) {
            Write-Ok "Upstream déjà configuré : $upstream"
        } else {
            Write-Info "L’upstream sera créé automatiquement au premier push de '$branch'."
        }
    }
}

# ---------------------------------------------------------------------------
# 1. ENVIRONNEMENT
# ---------------------------------------------------------------------------

function Test-Environment {
    Write-Step 1 'Environnement'

    if (-not (Test-CommandExists 'git')) {
        Write-Err2 'git est introuvable dans le PATH.'
        Write-Hint 'Installer Git : https://git-scm.com/download/win'
        Stop-Script $EXIT_ENV 'env-error'
    }
    $gitVersion = Get-GitValue 'version'
    Write-Ok "$gitVersion"

    $name = Get-GitValue 'config' '--get' 'user.name'
    $email = Get-GitValue 'config' '--get' 'user.email'
    if (-not $name -or -not $email) {
        Write-Err2 'Identité git incomplète (user.name / user.email).'
        Write-Hint 'git config --global user.name "Votre Nom"'
        Write-Hint 'git config --global user.email "vous@exemple.com"'
        Stop-Script $EXIT_ENV 'env-error'
    }
    Write-Ok "Identité : $name <$email>"

    if (Test-CommandExists 'node') {
        $nodeVersion = (Invoke-Native -Exe 'node' -Arguments @('--version')).Text.Trim()
        Write-Ok "Node $nodeVersion"
    } else {
        Write-Info 'Node absent : les contrôles qualité seront ignorés.'
    }
}

# ---------------------------------------------------------------------------
# 2. DÉPÔT
# ---------------------------------------------------------------------------

function Test-Repository {
    Write-Step 2 'Dépôt'

    $inside = Get-GitValue 'rev-parse' '--is-inside-work-tree'
    if ($inside -ne 'true') {
        Write-Err2 "Ce dossier n'est pas un dépôt git : $PWD"
        Write-Hint 'git init  puis  git remote add origin <url>'
        Stop-Script $EXIT_ENV 'not-a-repo'
    }

    $root = (Get-GitValue 'rev-parse' '--show-toplevel') -replace '/', '\'
    Set-Location $root
    Write-Ok "Racine : $root"
    $script:RepoRoot = $root

    # Verrou d'index résiduel
    $lock = Join-Path $root '.git\index.lock'
    if (Test-Path $lock) {
        $age = (Get-Date) - (Get-Item $lock).LastWriteTime
        if ($age.TotalMinutes -gt 5) {
            Write-Warn2 ("Verrou .git/index.lock vieux de {0:N0} min (processus git mort ?)." -f $age.TotalMinutes)
            if ($Fix -and -not $DryRun) {
                Remove-Item $lock -Force
                Write-Ok 'Verrou supprimé.'
            } else {
                Write-Hint 'Relancer avec -Fix pour le supprimer, ou : Remove-Item .git\index.lock'
                Stop-Script $EXIT_ENV 'index-locked'
            }
        } else {
            Write-Err2 'Un autre processus git semble actif (.git/index.lock récent).'
            Stop-Script $EXIT_ENV 'index-locked'
        }
    }

    # Opération en cours
    $ops = @(
        @{ Path = '.git\MERGE_HEAD';         Label = 'merge';       Abort = 'git merge --abort' },
        @{ Path = '.git\rebase-merge';       Label = 'rebase';      Abort = 'git rebase --abort' },
        @{ Path = '.git\rebase-apply';       Label = 'rebase/am';   Abort = 'git rebase --abort' },
        @{ Path = '.git\CHERRY_PICK_HEAD';   Label = 'cherry-pick'; Abort = 'git cherry-pick --abort' },
        @{ Path = '.git\REVERT_HEAD';        Label = 'revert';      Abort = 'git revert --abort' },
        @{ Path = '.git\BISECT_LOG';         Label = 'bisect';      Abort = 'git bisect reset' }
    )
    foreach ($op in $ops) {
        if (Test-Path (Join-Path $root $op.Path)) {
            Write-Err2 ("Opération '{0}' en cours : impossible de committer proprement." -f $op.Label)
            Write-Hint ("Terminer l'opération, ou l'annuler : " + $op.Abort)
            Stop-Script $EXIT_ENV 'operation-in-progress'
        }
    }
    Write-Ok 'Aucune opération git en cours.'

    # Fichiers en conflit non résolus
    $unmerged = @((Get-GitValue 'diff' '--name-only' '--diff-filter=U') -split "`n" | Where-Object { $_ })
    if ($unmerged.Count -gt 0) {
        Write-Err2 ("{0} fichier(s) en conflit non résolu." -f $unmerged.Count)
        foreach ($f in $unmerged) { Write-Hint $f }
        Stop-Script $EXIT_ENV 'unmerged-files'
    }

    # HEAD / branche
    $branch = Get-GitValue 'branch' '--show-current'
    if (-not $branch) {
        $sha = Get-GitValue 'rev-parse' '--short' 'HEAD'
        Write-Err2 "HEAD détaché sur $sha : aucun commit ne serait rattaché à une branche."
        Write-Hint "git switch -c ma-branche   (pour repartir d'ici)"
        Stop-Script $EXIT_ENV 'detached-head'
    }
    $script:Branch = $branch
    $script:Result.branch = $branch
    Write-Ok "Branche : $branch"
    if ($script:Cfg.ProtectedBranches -contains $branch) {
        Write-Info "Commit direct sur '$branch' (branche principale)."
    }

    # Dépôt vierge ?
    $script:HasCommits = (Invoke-Git 'rev-parse' '--verify' 'HEAD').Ok
    if (-not $script:HasCommits) {
        Write-Info 'Dépôt sans commit : ce sera le commit initial.'
        if ($Amend) {
            Write-Err2 '-Amend impossible : aucun commit existant.'
            Stop-Script $EXIT_ENV 'no-commit-to-amend'
        }
    }

    # Santé des objets
    $counts = Get-GitValue 'count-objects' '-v'
    $loose = 0
    if ($counts -match 'count:\s*(\d+)') { $loose = [int]$Matches[1] }
    if ($loose -gt 8000) {
        Write-Info ("$loose objets isolés : un 'git gc' accélérerait le dépôt.")
    }

    # Remote
    $remotes = @((Get-GitValue 'remote') -split "`n" | Where-Object { $_ })
    if ($remotes.Count -eq 0) {
        $script:Remote = $null
        Write-Warn2 "Aucun remote configuré : le push sera ignoré."
        Write-Hint 'git remote add origin <url>'
        return
    }
    $remote = 'origin'
    if ($remotes -notcontains 'origin') { $remote = $remotes[0] }
    $script:Remote = $remote
    $url = Get-GitValue 'remote' 'get-url' $remote
    $script:Result.remote = $url
    Write-Ok "Remote $remote : $url"

    if ($url -match '^https://[^/@]+:[^/@]+@') {
        Add-Issue -Severity 'Warn' -Code 'REMOTE_CREDS' `
            -Message "L'URL du remote contient des identifiants en clair." `
            -Hint "git remote set-url $remote <url-sans-identifiants>"
    }

    # Connectivité (sans jamais bloquer sur une invite d'authentification)
    Write-Info "Test de connexion au remote..."
    $probe = Start-Job -ScriptBlock {
        param($dir, $rem)
        Set-Location $dir
        $env:GIT_TERMINAL_PROMPT = '0'
        $env:GCM_INTERACTIVE = 'never'
        $out = & git ls-remote --heads $rem 2>&1
        [pscustomobject]@{ Code = $LASTEXITCODE; Text = ($out | Out-String) }
    } -ArgumentList $root, $remote

    $done = Wait-Job $probe -Timeout $script:Cfg.RemoteProbeTimeout
    if (-not $done) {
        Stop-Job $probe -ErrorAction SilentlyContinue | Out-Null
        Remove-Job $probe -Force -ErrorAction SilentlyContinue | Out-Null
        $script:RemoteReachable = $false
        Add-Issue -Severity 'Warn' -Code 'REMOTE_TIMEOUT' `
            -Message "Le remote ne répond pas (délai de $($script:Cfg.RemoteProbeTimeout)s dépassé)." `
            -Hint 'Le commit sera fait localement ; le push sera tenté malgré tout.'
    } else {
        $res = Receive-Job $probe
        Remove-Job $probe -Force -ErrorAction SilentlyContinue | Out-Null
        if ($res.Code -eq 0) {
            $script:RemoteReachable = $true
            Write-Ok 'Remote joignable et authentification valide.'
        } else {
            $script:RemoteReachable = $false
            $txt = [string]$res.Text
            if ($txt -match 'could not read Username|Authentication failed|terminal prompts disabled') {
                Add-Issue -Severity 'Warn' -Code 'REMOTE_AUTH' `
                    -Message 'Authentification au remote non résolue automatiquement.' `
                    -Hint "Le gestionnaire d'identifiants s'ouvrira au push, ou : gh auth login"
            } elseif ($txt -match 'Could not resolve host|unable to access|Failed to connect') {
                Add-Issue -Severity 'Warn' -Code 'REMOTE_NET' `
                    -Message 'Remote injoignable (réseau / DNS).' `
                    -Hint 'Le commit local se fera quand même ; relancer le push plus tard.'
            } elseif ($txt -match 'Repository not found|not found') {
                Add-Issue -Severity 'Warn' -Code 'REMOTE_404' `
                    -Message "Dépôt distant introuvable ou droits insuffisants." `
                    -Hint "Vérifier l'URL : git remote -v"
            } else {
                Add-Issue -Severity 'Warn' -Code 'REMOTE_UNKNOWN' `
                    -Message ('Remote non vérifiable : ' + (($txt -split "`n")[0]))
            }
        }
    }
}

# ---------------------------------------------------------------------------
# 3. ANALYSE DES CHANGEMENTS
# ---------------------------------------------------------------------------

function Get-ChangeSet {
    Write-Step 3 'Analyse des changements'

    $status = Invoke-Git '-c' 'core.quotepath=false' 'status' '--porcelain'
    $entries = @()
    foreach ($line in $status.Out) {
        if ($line.Length -lt 4) { continue }
        $x = $line.Substring(0, 1)
        $y = $line.Substring(1, 1)
        $path = $line.Substring(3).Trim('"')
        if ($path -match '^(.*?) -> (.*)$') { $path = $Matches[2] }

        $kind = 'modifié'
        if ($x -eq 'A' -or $y -eq 'A') { $kind = 'ajouté' }
        if ($x -eq '?' -and $y -eq '?') { $kind = 'nouveau' }
        if ($x -eq 'D' -or $y -eq 'D') { $kind = 'supprimé' }
        if ($x -eq 'R') { $kind = 'renommé' }

        $entries += [pscustomobject]@{
            X    = $x
            Y    = $y
            Path = $path.Replace('\', '/')
            Kind = $kind
            Ext  = [System.IO.Path]::GetExtension($path).ToLower()
        }
    }

    $allEntries = @($entries)
    if ($Paths) {
        $entries = @($entries | Where-Object { Test-PathMatchesFilter $_.Path })
        Write-Info ("Filtre appliqué : " + ($Paths -join ', '))

        # Un `git commit` inclut tout ce qui était déjà indexé. Bloquer ce cas
        # évite de mélanger silencieusement un ancien travail au commit ciblé.
        $stagedOutsideScope = @($allEntries | Where-Object {
            $_.X -ne ' ' -and $_.X -ne '?' -and -not (Test-PathMatchesFilter $_.Path)
        })
        if ($stagedOutsideScope.Count -gt 0) {
            $sample = ($stagedOutsideScope.Path | Select-Object -First 4) -join ', '
            Add-Issue -Severity 'Block' -Code 'STAGED_OUTSIDE_SCOPE' `
                -Message ("{0} fichier(s) déjà indexé(s) hors de -Paths : {1}" -f $stagedOutsideScope.Count, $sample) `
                -Hint 'Les désindexer avec git restore --staged <fichier>, ou relancer sans -Paths.'
        }
    }

    $script:Changes = $entries
    $script:Result.files = $entries.Count

    if ($entries.Count -eq 0) {
        Write-Info 'Aucun changement dans le répertoire de travail.'
        return
    }

    Write-Ok ("{0} fichier(s) concerné(s)" -f $entries.Count)
    $byKind = $entries | Group-Object Kind | Sort-Object Count -Descending
    foreach ($g in $byKind) {
        Write-Info ("{0,-10} {1}" -f $g.Name, $g.Count)
    }

    $preview = @($entries | Select-Object -First 12)
    Write-Host ''
    foreach ($e in $preview) {
        $color = 'Gray'
        switch ($e.Kind) {
            'nouveau'  { $color = 'Green' }
            'ajouté'   { $color = 'Green' }
            'supprimé' { $color = 'Red' }
            'renommé'  { $color = 'Magenta' }
        }
        Write-Host ("       {0,-9} {1}" -f $e.Kind, $e.Path) -ForegroundColor $color
    }
    if ($entries.Count -gt $preview.Count) {
        Write-Host ("       ... et {0} autre(s)" -f ($entries.Count - $preview.Count)) -ForegroundColor DarkGray
    }

    if ($entries.Count -gt $script:Cfg.ManyFilesWarn) {
        Add-Issue -Severity 'Warn' -Code 'MANY_FILES' `
            -Message ("Commit très volumineux : {0} fichiers." -f $entries.Count) `
            -Hint 'Envisager de découper en plusieurs commits (-Paths <chemin>).'
    }
}

# ---------------------------------------------------------------------------
# 4. INSPECTION
# ---------------------------------------------------------------------------

$script:SecretPatterns = @(
    @{ Name = 'Clé AWS';                 Pattern = 'AKIA[0-9A-Z]{16}' },
    @{ Name = 'Token GitHub';            Pattern = 'gh[pousr]_[A-Za-z0-9]{36,}' },
    @{ Name = 'GitHub PAT';              Pattern = 'github_pat_[A-Za-z0-9_]{60,}' },
    @{ Name = 'Clé Google API';          Pattern = 'AIza[0-9A-Za-z\-_]{35}' },
    @{ Name = 'Token Slack';             Pattern = 'xox[abprs]-[0-9A-Za-z\-]{10,}' },
    @{ Name = 'Clé Stripe live';         Pattern = 'sk_live_[0-9A-Za-z]{16,}' },
    @{ Name = 'Clé API Resend';          Pattern = 're_[A-Za-z0-9]{24,}' },
    @{ Name = 'URL Redis avec secret';   Pattern = 'rediss?://[^:\s]+:[^@\s]{8,}@' },
    @{ Name = 'Clé privée';              Pattern = '-----BEGIN [A-Z ]*PRIVATE KEY-----' },
    @{ Name = 'JWT';                     Pattern = 'eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.' },
    @{ Name = 'Secret en dur';           Pattern = '(?i)\b(api[_-]?key|secret|passwd|password|access[_-]?token|bearer)\b\s*[:=]\s*["''][^"'']{16,}["'']' }
)

$script:SecretSafeWords = @('process.env', 'import.meta.env', 'xxxx', 'your-', '<your', '<votre', 'exemple', 'example', 'placeholder', 'changeme', '${', 'REDACTED', 'dummy', 'test-key')

function Test-SecretLine {
    param([string]$Line)
    foreach ($safe in $script:SecretSafeWords) {
        if ($Line -like ('*' + $safe + '*')) { return $null }
    }
    if ($Line -match 'gitauto:allow') { return $null }
    foreach ($p in $script:SecretPatterns) {
        if ($Line -match $p.Pattern) { return $p.Name }
    }
    return $null
}

function Invoke-Inspection {
    Write-Step 4 'Inspection'

    if ($script:Changes.Count -eq 0) {
        Write-Info 'Rien à inspecter.'
        return
    }

    $existing = @($script:Changes | Where-Object { $_.Kind -ne 'supprimé' })

    # --- Fichiers volumineux ---
    $bigBlock = @()
    $bigWarn = @()
    foreach ($c in $existing) {
        $full = Join-Path $script:RepoRoot ($c.Path -replace '/', '\')
        if (-not (Test-Path $full -PathType Leaf)) { continue }
        $mb = (Get-Item $full).Length / 1MB
        if ($mb -ge $script:Cfg.LargeFileBlockMB) { $bigBlock += [pscustomobject]@{ Path = $c.Path; MB = $mb } }
        elseif ($mb -ge $script:Cfg.LargeFileWarnMB) { $bigWarn += [pscustomobject]@{ Path = $c.Path; MB = $mb } }
    }
    foreach ($b in $bigBlock) {
        Add-Issue -Severity 'Block' -Code 'FILE_TOO_LARGE' `
            -Message ("{0} pèse {1:N1} Mo : au-delà de la limite GitHub." -f $b.Path, $b.MB) `
            -Hint 'Utiliser Git LFS, ou ajouter le fichier au .gitignore.'
    }
    foreach ($b in $bigWarn) {
        Add-Issue -Severity 'Warn' -Code 'FILE_LARGE' `
            -Message ("{0} pèse {1:N1} Mo." -f $b.Path, $b.MB) `
            -Hint 'Vérifier que ce fichier doit bien être versionné.'
    }
    if ($bigBlock.Count -eq 0 -and $bigWarn.Count -eq 0) { Write-Ok 'Aucun fichier volumineux.' }

    # --- Fichiers qui ne devraient pas être versionnés ---
    $suspectPatterns = @(
        @{ Glob = 'node_modules/*';  Label = 'dépendances npm' },
        @{ Glob = 'dist/*';          Label = 'build de production' },
        @{ Glob = '.env';            Label = 'variables d''environnement' },
        @{ Glob = '.env.*';          Label = 'variables d''environnement' },
        @{ Glob = '*.local';         Label = 'fichier local' },
        @{ Glob = '*.pem';           Label = 'certificat / clé' },
        @{ Glob = '*.key';           Label = 'clé' },
        @{ Glob = '*.pfx';           Label = 'certificat' },
        @{ Glob = '*.sqlite';        Label = 'base de données' },
        @{ Glob = '*.log';           Label = 'journal' }
    )
    $suspects = @()
    foreach ($c in $existing) {
        foreach ($sp in $suspectPatterns) {
            if ($c.Path -like $sp.Glob -or $c.Path -like ('*/' + $sp.Glob)) {
                $suspects += [pscustomobject]@{ Path = $c.Path; Label = $sp.Label }
                break
            }
        }
    }
    foreach ($s in $suspects) {
        Add-Issue -Severity 'Block' -Code 'SHOULD_BE_IGNORED' `
            -Message ("{0} ({1}) ne devrait pas être versionné." -f $s.Path, $s.Label) `
            -Hint "Ajouter au .gitignore, puis : git rm --cached `"$($s.Path)`""
    }

    # --- Fichiers ignorés mais déjà suivis ---
    $trackedIgnored = @((Get-GitValue 'ls-files' '--cached' '--ignored' '--exclude-standard') -split "`n" | Where-Object { $_ })
    if ($trackedIgnored.Count -gt 0) {
        $sample = ($trackedIgnored | Select-Object -First 3) -join ', '
        Add-Issue -Severity 'Warn' -Code 'TRACKED_IGNORED' `
            -Message ("{0} fichier(s) suivis alors qu'ils sont dans .gitignore ({1}...)." -f $trackedIgnored.Count, $sample) `
            -Hint 'Relancer avec -Fix pour les retirer de l''index (les fichiers restent sur le disque).' `
            -AutoFix {
                foreach ($f in $trackedIgnored) { Invoke-Git 'rm' '--cached' '--quiet' '--' $f | Out-Null }
            }
    }

    # --- Marqueurs de conflit + secrets (lecture des lignes ajoutées) ---
    $textExt = @('.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.json', '.css', '.scss', '.html', '.md', '.yml', '.yaml', '.ps1', '.sh', '.txt', '.env', '.toml', '.xml', '.svg')
    $skipFiles = @('package-lock.json', 'pnpm-lock.yaml', 'yarn.lock')
    $conflicts = @()
    $secrets = @()
    $debugMarks = @()

    foreach ($c in $existing) {
        $name = Split-Path $c.Path -Leaf
        if ($skipFiles -contains $name) { continue }
        if ($textExt -notcontains $c.Ext) { continue }
        if ($c.Path -like '*.min.*' -or $c.Path -like '*.map') { continue }
        $full = Join-Path $script:RepoRoot ($c.Path -replace '/', '\')
        if (-not (Test-Path $full -PathType Leaf)) { continue }
        if ((Get-Item $full).Length -gt 2MB) { continue }

        $lineNo = 0
        try { $content = [System.IO.File]::ReadAllLines($full) } catch { continue }
        foreach ($line in $content) {
            $lineNo++
            if ($line -match '^(<{7}|={7}|>{7})(\s|$)') {
                $conflicts += ("{0}:{1}" -f $c.Path, $lineNo)
            }
            $hit = Test-SecretLine $line
            if ($hit) {
                $secrets += [pscustomobject]@{ Path = $c.Path; Line = $lineNo; Kind = $hit }
            }
            if ($line -notmatch 'gitauto:allow' -and (
                $line -match '\b(debugger)\b' -or # gitauto:allow
                $line -match 'FIXME\s*:\s*ne\s*pas\s*committer' -or # gitauto:allow
                $line -match 'DO\s*NOT\s*COMMIT' # gitauto:allow
            )) {
                $debugMarks += ("{0}:{1}" -f $c.Path, $lineNo)
            }
        }
    }

    foreach ($cf in ($conflicts | Select-Object -First 10)) {
        Add-Issue -Severity 'Block' -Code 'CONFLICT_MARKER' `
            -Message ("Marqueur de conflit non résolu : {0}" -f $cf) `
            -Hint 'Nettoyer les <<<<<<< ======= >>>>>>> avant de committer.'
    }
    foreach ($s in ($secrets | Select-Object -First 10)) {
        Add-Issue -Severity 'Block' -Code 'SECRET' `
            -Message ("Secret probable ({0}) dans {1}:{2}" -f $s.Kind, $s.Path, $s.Line) `
            -Hint 'Déplacer la valeur dans .env (ignoré) et la révoquer si elle a fuité. Faux positif : ajouter le commentaire gitauto:allow sur la ligne.'
    }
    foreach ($d in ($debugMarks | Select-Object -First 5)) {
        Add-Issue -Severity 'Warn' -Code 'DEBUG_LEFTOVER' `
            -Message ("Reste de débogage : {0}" -f $d)
    }
    if ($conflicts.Count -eq 0) { Write-Ok 'Aucun marqueur de conflit.' }
    if ($secrets.Count -eq 0)   { Write-Ok 'Aucun secret détecté.' }

    # --- Corrections automatiques ---
    if ($Fix) {
        $fixable = @($script:Issues | Where-Object { $_.AutoFix -and -not $_.Fixed })
        foreach ($issue in $fixable) {
            if ($DryRun) {
                Write-Info ("[simulation] correction de {0}" -f $issue.Code)
                continue
            }
            try {
                & $issue.AutoFix
                $issue.Fixed = $true
                Write-Ok ("Corrigé : {0}" -f $issue.Code)
            } catch {
                Write-Warn2 ("Échec de la correction {0} : {1}" -f $issue.Code, $_.Exception.Message)
            }
        }
    }

    # --- Verdict ---
    $blockers = @(Get-Blockers)
    Write-Host ''
    if ($blockers.Count -gt 0) {
        Write-Line ("     {0} problème(s) bloquant(s)." -f $blockers.Count) 'Red'
    } else {
        $warns = @($script:Issues | Where-Object { $_.Severity -eq 'Warn' -and -not $_.Fixed })
        if ($warns.Count -gt 0) {
            Write-Line ("     Inspection passée ({0} avertissement(s))." -f $warns.Count) 'Yellow'
        } else {
            Write-Line '     Inspection passée sans réserve.' 'Green'
        }
    }
}

# ---------------------------------------------------------------------------
# 5. CONTRÔLES QUALITÉ
# ---------------------------------------------------------------------------

function Invoke-QualityGates {
    Write-Step 5 'Contrôles qualité'

    if ($NoVerify) { Write-Info 'Ignorés (-NoVerify).'; return $true }

    $pkgPath = Join-Path $script:RepoRoot 'package.json'
    if (-not (Test-Path $pkgPath)) { Write-Info 'Pas de package.json.'; return $true }
    if (-not (Test-CommandExists 'npm')) { Write-Info 'npm introuvable.'; return $true }
    if (-not (Test-Path (Join-Path $script:RepoRoot 'node_modules'))) {
        Write-Warn2 'node_modules absent : contrôles ignorés (npm install).'
        return $true
    }

    $pkg = Get-Content $pkgPath -Raw | ConvertFrom-Json
    $scripts = @{}
    if ($pkg.PSObject.Properties.Name -contains 'scripts') {
        foreach ($p in $pkg.scripts.PSObject.Properties) { $scripts[$p.Name] = $p.Value }
    }

    $codeExt = @('.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs')
    $touchedCode = @($script:Changes | Where-Object { $codeExt -contains $_.Ext -and $_.Kind -ne 'supprimé' })
    $touchedCss  = @($script:Changes | Where-Object { $_.Ext -in @('.css', '.scss') })

    if ($touchedCode.Count -eq 0 -and -not $WithBuild) {
        Write-Info 'Aucun fichier de code modifié : contrôles non nécessaires.'
        if ($touchedCss.Count -gt 0) { Write-Info ("{0} fichier(s) CSS modifié(s)." -f $touchedCss.Count) }
        return $true
    }

    $gates = @()
    if ($scripts.ContainsKey('type-check')) {
        $gates += @{ Name = 'type-check'; Script = 'type-check'; Blocking = $true }
    }
    if ($scripts.ContainsKey('lint')) {
        $gates += @{ Name = 'lint'; Script = 'lint'; Blocking = [bool]$Strict }
    }
    if ($WithBuild -and $scripts.ContainsKey('build')) {
        $gates += @{ Name = 'build'; Script = 'build'; Blocking = $true }
    }
    if ($gates.Count -eq 0) { Write-Info 'Aucun script de vérification disponible.'; return $true }

    $allOk = $true
    foreach ($gate in $gates) {
        Write-Info ("npm run {0} ..." -f $gate.Script)
        $sw = [System.Diagnostics.Stopwatch]::StartNew()
        $r = Invoke-Native -Exe 'npm' -Arguments @('run', '--silent', $gate.Script)
        $sw.Stop()
        $secs = [math]::Round($sw.Elapsed.TotalSeconds, 1)

        if ($r.Ok) {
            Write-Ok ("{0} : OK ({1}s)" -f $gate.Name, $secs)
            continue
        }

        $detail = @($r.Lines | Where-Object { $_ -match 'error|Error|ERR!' } | Select-Object -First 8)
        if ($detail.Count -eq 0) { $detail = @($r.Lines | Select-Object -Last 8) }

        if ($gate.Blocking) {
            $allOk = $false
            Add-Issue -Severity 'Block' -Code ("GATE_" + $gate.Name.ToUpper().Replace('-', '_')) `
                -Message ("{0} en échec ({1}s)." -f $gate.Name, $secs)
        } else {
            Add-Issue -Severity 'Warn' -Code ("GATE_" + $gate.Name.ToUpper().Replace('-', '_')) `
                -Message ("{0} signale des problèmes ({1}s)." -f $gate.Name, $secs) `
                -Hint 'Non bloquant. Utiliser -Strict pour bloquer, ou -Fix pour tenter eslint --fix.'
        }
        foreach ($d in $detail) { Write-Hint $d.Trim() }

        if ($gate.Name -eq 'lint' -and $Fix -and -not $DryRun) {
            Write-Info 'Tentative de correction : eslint --fix'
            $fixRun = Invoke-Native -Exe 'npx' -Arguments @('eslint', '.', '--ext', 'ts,tsx', '--fix')
            if ($fixRun.Ok) { Write-Ok 'eslint --fix appliqué.' } else { Write-Warn2 'Corrections partielles seulement.' }
        }
    }
    return $allOk
}

# ---------------------------------------------------------------------------
# 6. MESSAGE DE COMMIT
# ---------------------------------------------------------------------------

function Get-CommitScope {
    param($Entries)
    $segments = @()
    foreach ($e in $Entries) {
        $parts = $e.Path -split '/'
        if ($parts.Count -le 1) { $segments += 'racine'; continue }
        if ($parts[0] -eq 'src') {
            if ($parts.Count -ge 3 -and $parts[1] -in @('components', 'features', 'pages', 'views', 'modules')) {
                $segments += $parts[2].ToLower()
            } elseif ($parts.Count -ge 2) {
                $segments += $parts[1].ToLower()
            }
        } elseif ($parts[0] -eq 'public') {
            if ($parts.Count -ge 2) { $segments += $parts[1].ToLower() } else { $segments += 'public' }
        } else {
            $segments += $parts[0].ToLower()
        }
    }
    $segments = @($segments | ForEach-Object { $_ -replace '\.(ts|tsx|js|jsx|css|json|md)$', '' })
    if ($segments.Count -eq 0) { return '' }
    $top = $segments | Group-Object | Sort-Object Count, Name -Descending | Select-Object -First 1
    if ($top.Count -eq $Entries.Count -or $top.Count -ge [math]::Ceiling($Entries.Count * 0.6)) {
        return $top.Name
    }
    return ''
}

function Get-CommitType {
    param($Entries)
    if ($Type) { return $Type }

    $total = $Entries.Count
    $ext = @($Entries | ForEach-Object { $_.Ext })
    $paths = @($Entries | ForEach-Object { $_.Path })

    $count = @{
        docs   = @($paths | Where-Object { $_ -like '*.md' -or $_ -like 'docs/*' }).Count
        style  = @($ext | Where-Object { $_ -in @('.css', '.scss') }).Count
        test   = @($paths | Where-Object { $_ -match '\.(test|spec)\.' -or $_ -like 'tests/*' }).Count
        build  = @($paths | Where-Object { $_ -match '^(package(-lock)?\.json|vite\.config\.|tsconfig|postcss|tailwind\.config|eslint\.config)' }).Count
        data   = @($paths | Where-Object { $_ -like 'public/data/*' -or ($_ -like '*.json' -and $_ -like 'public/*') }).Count
        ci     = @($paths | Where-Object { $_ -like '.github/*' -or $_ -like 'scripts/*' }).Count
    }

    foreach ($key in @('docs', 'style', 'test', 'build', 'data')) {
        if ($count[$key] -eq $total) {
            if ($key -eq 'data') { return 'chore' }
            return $key
        }
    }
    if ($count['ci'] -eq $total) { return 'chore' }

    # Indices tirés de la branche
    if ($script:Branch -match '^(feat|feature)/') { return 'feat' }
    if ($script:Branch -match '^(fix|hotfix|bug)/') { return 'fix' }
    if ($script:Branch -match '^(refactor|chore|docs)/') { return $Matches[1] }

    $newFiles = @($Entries | Where-Object { $_.Kind -in @('nouveau', 'ajouté') }).Count
    $deleted  = @($Entries | Where-Object { $_.Kind -eq 'supprimé' }).Count

    if ($newFiles -ge [math]::Ceiling($total * 0.5) -and $newFiles -gt 0) { return 'feat' }
    if ($deleted -ge [math]::Ceiling($total * 0.6) -and $deleted -gt 0) { return 'refactor' }
    return 'fix'
}

function New-CommitMessage {
    param($Entries)

    $type = Get-CommitType -Entries $Entries
    $scope = $Scope
    if (-not $scope) { $scope = Get-CommitScope -Entries $Entries }

    # Sujet : basé sur les fichiers les plus significatifs
    $names = @()
    $ranked = @($Entries | Sort-Object @{ Expression = { if ($_.Kind -in @('nouveau', 'ajouté')) { 0 } elseif ($_.Kind -eq 'supprimé') { 2 } else { 1 } } }, Path)
    foreach ($e in ($ranked | Select-Object -First 3)) {
        $names += [System.IO.Path]::GetFileNameWithoutExtension($e.Path)
    }
    $names = @($names | Select-Object -Unique)

    $newCount = @($Entries | Where-Object { $_.Kind -in @('nouveau', 'ajouté') }).Count
    $delCount = @($Entries | Where-Object { $_.Kind -eq 'supprimé' }).Count
    $modCount = @($Entries | Where-Object { $_.Kind -eq 'modifié' }).Count

    $verb = 'mise à jour de'
    if ($newCount -gt 0 -and $modCount -eq 0 -and $delCount -eq 0) { $verb = 'ajout de' }
    elseif ($delCount -gt 0 -and $newCount -eq 0 -and $modCount -eq 0) { $verb = 'suppression de' }

    $subjectBody = "$verb " + ($names -join ', ')
    if ($Entries.Count -gt $names.Count) {
        $subjectBody += (" (+{0})" -f ($Entries.Count - $names.Count))
    }

    $prefix = $type
    if ($scope) { $prefix = "$type($scope)" }
    $subject = "${prefix}: $subjectBody"
    if ($subject.Length -gt $script:Cfg.MaxSubjectLength) {
        $subject = $subject.Substring(0, $script:Cfg.MaxSubjectLength - 3) + '...'
    }

    # Corps : détail par fichier (limité)
    $lines = @()
    $lines += ''
    foreach ($e in ($Entries | Select-Object -First 15)) {
        $lines += ("- {0} : {1}" -f $e.Kind, $e.Path)
    }
    if ($Entries.Count -gt 15) {
        $lines += ("- ... {0} autre(s) fichier(s)" -f ($Entries.Count - 15))
    }

    $cachedStatArgs = @('diff', '--cached', '--shortstat')
    $worktreeStatArgs = @('diff', '--shortstat')
    if ($Paths) {
        $cachedStatArgs += @('--') + $Paths
        $worktreeStatArgs += @('--') + $Paths
    }
    $stat = Get-GitValue @cachedStatArgs
    if (-not $stat) { $stat = Get-GitValue @worktreeStatArgs }
    if ($stat) {
        $lines += ''
        $lines += $stat.Trim()
    }

    return [pscustomobject]@{
        Subject = $subject
        Body    = ($lines -join [Environment]::NewLine)
        Type    = $type
        Scope   = $scope
    }
}

function Invoke-Commit {
    Write-Step 6 'Commit'

    # Staging
    if ($DryRun) {
        Write-Info '[simulation] git add'
    } else {
        if ($Paths) {
            $addArgs = @('add', '--all', '--') + $Paths
            $add = Invoke-Git @addArgs
        } else {
            $add = Invoke-Git 'add' '--all'
        }
        if (-not $add.Ok) {
            Write-Err2 "Échec du staging : $($add.All)"
            Stop-Script $EXIT_ERROR 'stage-failed'
        }
    }

    $staged = @((Get-GitValue 'diff' '--cached' '--name-only') -split "`n" | Where-Object { $_ })
    if (-not $DryRun -and $staged.Count -eq 0 -and -not $Amend) {
        Write-Info 'Rien dans l''index après staging.'
        return $false
    }
    if (-not $DryRun) { Write-Ok ("{0} fichier(s) indexé(s)." -f $staged.Count) }

    # Message
    if ($Message) {
        $subject = $Message
        $body = ''
        Write-Info 'Message fourni manuellement.'
    } else {
        $generated = New-CommitMessage -Entries $script:Changes
        $subject = $generated.Subject
        $body = $generated.Body
        Write-Ok ("Message généré (type : {0}{1})" -f $generated.Type, $(if ($generated.Scope) { ", scope : $($generated.Scope)" } else { '' }))
    }

    Write-Host ''
    Write-Host "       $subject" -ForegroundColor White
    if ($body) {
        foreach ($l in ($body -split "`n" | Select-Object -First 8)) {
            if ($l.Trim()) { Write-Host ("       $l") -ForegroundColor DarkGray }
        }
    }
    Write-Host ''

    if (-not (Confirm-Action 'Committer avec ce message ?' $true)) {
        Stop-Script $EXIT_OK 'cancelled' 'Commit annulé par l''utilisateur.'
    }

    if ($DryRun) {
        Write-Info '[simulation] git commit'
        $script:Result.commit = '(simulation)'
        return $true
    }

    $commitArgs = @('commit', '-m', $subject)
    if ($body) { $commitArgs += @('-m', $body.Trim()) }
    if ($Amend) { $commitArgs += '--amend' }

    $commit = Invoke-Git @commitArgs
    if (-not $commit.Ok) {
        if ($commit.All -match 'nothing to commit') {
            Write-Info 'Rien à committer.'
            return $false
        }
        if ($commit.All -match 'hook') {
            Write-Err2 'Un hook git a refusé le commit.'
            foreach ($l in ($commit.Lines | Select-Object -First 10)) { Write-Hint $l }
            Stop-Script $EXIT_ERROR 'hook-rejected'
        }
        Write-Err2 "Échec du commit : $($commit.All)"
        Stop-Script $EXIT_ERROR 'commit-failed'
    }

    $sha = Get-GitValue 'rev-parse' '--short' 'HEAD'
    $script:Result.commit = $sha
    Write-Ok "Commit $sha créé."
    return $true
}

# ---------------------------------------------------------------------------
# 7. SYNCHRONISATION
# ---------------------------------------------------------------------------

function Invoke-Sync {
    Write-Step 7 'Synchronisation'

    if (-not $script:Remote) { Write-Info 'Pas de remote : rien à synchroniser.'; return $true }
    if ($NoSync) { Write-Warn2 'Synchronisation ignorée (-NoSync).'; return $true }
    if ($DryRun) { Write-Info '[simulation] git fetch + rebase si nécessaire'; return $true }

    $fetch = Invoke-Git 'fetch' '--prune' $script:Remote
    if (-not $fetch.Ok) {
        Write-Warn2 'Fetch impossible (remote injoignable). Le push sera tenté quand même.'
        return $true
    }
    Write-Ok 'Fetch effectué.'

    $upstream = Get-GitValue 'rev-parse' '--abbrev-ref' '--symbolic-full-name' '@{u}'
    if (-not $upstream) {
        Write-Info "Aucune branche amont : elle sera créée au push (-u)."
        $script:NeedsUpstream = $true
        return $true
    }
    $script:NeedsUpstream = $false

    $counts = Get-GitValue 'rev-list' '--left-right' '--count' "$upstream...HEAD"
    $behind = 0; $ahead = 0
    if ($counts -match '^(\d+)\s+(\d+)$') { $behind = [int]$Matches[1]; $ahead = [int]$Matches[2] }
    Write-Ok ("En avance de {0} commit(s), en retard de {1}." -f $ahead, $behind)

    if ($behind -eq 0) { return $true }

    # Sauvegarde avant réécriture d'historique
    $backupRef = 'refs/gitauto/backup-' + (Get-Date -Format 'yyyyMMdd-HHmmss')
    Invoke-Git 'update-ref' $backupRef 'HEAD' | Out-Null
    Write-Info "Sauvegarde de HEAD : $backupRef"

    Write-Info "Rebase sur $upstream ..."
    $pull = Invoke-Git 'pull' '--rebase' '--autostash' $script:Remote $script:Branch
    if ($pull.Ok) {
        Write-Ok 'Rebase réussi.'
        return $true
    }

    if ($pull.All -match 'CONFLICT|could not apply|Merge conflict') {
        Write-Err2 'Conflit pendant le rebase.'
        $files = @((Get-GitValue 'diff' '--name-only' '--diff-filter=U') -split "`n" | Where-Object { $_ })
        foreach ($f in $files) { Write-Hint $f }
        Write-Hint 'Résoudre, puis : git add <fichiers> ; git rebase --continue'
        Write-Hint "Abandonner : git rebase --abort   (HEAD sauvegardé dans $backupRef)"
        Stop-Script $EXIT_SYNC 'rebase-conflict'
    }

    Write-Err2 "Échec de la synchronisation : $(($pull.Lines | Select-Object -First 3) -join ' / ')"
    Write-Hint "HEAD sauvegardé dans $backupRef"
    Stop-Script $EXIT_SYNC 'sync-failed'
}

# ---------------------------------------------------------------------------
# 8. PUSH
# ---------------------------------------------------------------------------

function Get-PushDiagnosis {
    param([string]$Text)

    if ($Text -match 'GH001|exceeds file size limit|large files detected') {
        return [pscustomobject]@{ Retry = $false; Message = 'Fichier trop volumineux refusé par GitHub.'; Hint = 'Retirer le fichier de l''historique ou passer par Git LFS.' }
    }
    if ($Text -match 'GH013|push protection|secret scanning') {
        return [pscustomobject]@{ Retry = $false; Message = 'GitHub a bloqué le push : secret détecté.'; Hint = 'Révoquer le secret, le retirer de l''historique, puis repousser.' }
    }
    if ($Text -match 'non-fast-forward|fetch first|behind its remote') {
        return [pscustomobject]@{ Retry = $false; Message = 'Le remote a avancé depuis le dernier fetch.'; Hint = 'Relancer le script (la synchronisation reprendra), ou : git pull --rebase' }
    }
    if ($Text -match 'Authentication failed|could not read Username|Invalid username or password') {
        return [pscustomobject]@{ Retry = $false; Message = 'Authentification refusée.'; Hint = 'gh auth login, ou réinitialiser le Git Credential Manager.' }
    }
    if ($Text -match 'Permission denied \(publickey\)|Host key verification failed') {
        return [pscustomobject]@{ Retry = $false; Message = 'Clé SSH refusée par le serveur.'; Hint = 'Vérifier la clé : ssh -T git@github.com' }
    }
    if ($Text -match 'protected branch|refusing to allow|pre-receive hook declined') {
        return [pscustomobject]@{ Retry = $false; Message = 'Le serveur refuse ce push (branche protégée / hook).'; Hint = 'Passer par une branche + pull request.' }
    }
    if ($Text -match 'Could not resolve host|Failed to connect|Connection timed out|unable to access|RPC failed|early EOF') {
        return [pscustomobject]@{ Retry = $true; Message = 'Problème réseau pendant le push.'; Hint = 'Nouvelle tentative...' }
    }
    if ($Text -match 'shallow update not allowed') {
        return [pscustomobject]@{ Retry = $false; Message = 'Dépôt superficiel (shallow) : push refusé.'; Hint = 'git fetch --unshallow' }
    }
    return [pscustomobject]@{ Retry = $false; Message = 'Push refusé.'; Hint = '' }
}

function Invoke-Push {
    Write-Step 8 'Push'

    if ($NoPush) { Write-Info 'Ignoré (-NoPush).'; return $true }
    if (-not $script:Remote) { Write-Warn2 'Aucun remote : push impossible.'; return $true }

    $ahead = 0
    $upstream = Get-GitValue 'rev-parse' '--abbrev-ref' '--symbolic-full-name' '@{u}'
    if ($upstream) {
        $c = Get-GitValue 'rev-list' '--count' "$upstream..HEAD"
        if ($c -match '^\d+$') { $ahead = [int]$c }
        if ($ahead -eq 0 -and -not $DryRun) {
            Write-Ok 'Le remote est déjà à jour.'
            return $true
        }
    }

    if (-not (Confirm-Action ("Pousser {0} commit(s) vers {1}/{2} ?" -f $ahead, $script:Remote, $script:Branch) $true)) {
        Write-Warn2 'Push annulé. Les commits restent locaux.'
        return $true
    }

    if ($DryRun) {
        Write-Info ("[simulation] git push {0} {1}" -f $script:Remote, $script:Branch)
        return $true
    }

    $pushArgs = @('push')
    if (-not $upstream) { $pushArgs += @('--set-upstream') }
    $pushArgs += @($script:Remote, $script:Branch)

    for ($attempt = 1; $attempt -le $script:Cfg.PushRetries; $attempt++) {
        if ($attempt -gt 1) { Write-Info ("Tentative {0}/{1}..." -f $attempt, $script:Cfg.PushRetries) }
        $push = Invoke-Git @pushArgs
        if ($push.Ok) {
            Write-Ok ("Poussé vers {0}/{1}." -f $script:Remote, $script:Branch)
            $script:Result.pushed = $true
            return $true
        }

        $diag = Get-PushDiagnosis -Text $push.All
        Write-Err2 $diag.Message
        if ($diag.Hint) { Write-Hint $diag.Hint }
        foreach ($l in ($push.Lines | Where-Object { $_ -match 'error|rejected|remote:' } | Select-Object -First 5)) {
            Write-Hint $l.Trim()
        }

        if (-not $diag.Retry) {
            Write-Hint ("Le commit local est conservé : git push {0} {1}" -f $script:Remote, $script:Branch)
            return $false
        }
        Start-Sleep -Seconds ([math]::Pow(2, $attempt))
    }

    Write-Err2 'Push abandonné après plusieurs tentatives.'
    return $false
}

function Invoke-Tag {
    if (-not $Tag) { return }
    Write-Info ("Tag {0}" -f $Tag)
    if ($DryRun) { Write-Info '[simulation] git tag + push --tags'; return }
    $t = Invoke-Git 'tag' '-a' $Tag '-m' $Tag
    if (-not $t.Ok) { Write-Warn2 ("Tag non créé : " + $t.All); return }
    if (-not $NoPush -and $script:Remote) {
        $tp = Invoke-Git 'push' $script:Remote $Tag
        if ($tp.Ok) { Write-Ok "Tag $Tag poussé." } else { Write-Warn2 'Tag non poussé.' }
    }
}

# ---------------------------------------------------------------------------
# 9. RAPPORT
# ---------------------------------------------------------------------------

function Write-Report {
    $elapsed = (Get-Date) - $script:StartedAt

    $script:Result.issues = @($script:Issues | ForEach-Object {
        [ordered]@{ severity = $_.Severity; code = $_.Code; message = $_.Message; fixed = $_.Fixed }
    })
    $script:Result.durationSeconds = [math]::Round($elapsed.TotalSeconds, 1)

    Write-Host ''
    Write-Host '  ------------------------------------------------------------' -ForegroundColor DarkCyan
    $statusColor = 'Green'
    if ($script:Result.exitCode -ne 0) { $statusColor = 'Red' }
    Write-Host ("   Résultat : {0}" -f $script:Result.status) -ForegroundColor $statusColor
    if ($script:Result.branch) { Write-Host ("   Branche  : {0}" -f $script:Result.branch) -ForegroundColor Gray }
    if ($script:Result.commit) { Write-Host ("   Commit   : {0}" -f $script:Result.commit) -ForegroundColor Gray }
    Write-Host ("   Fichiers : {0}" -f $script:Result.files) -ForegroundColor Gray
    Write-Host ("   Push     : {0}" -f $(if ($script:Result.pushed) { 'oui' } else { 'non' })) -ForegroundColor Gray
    $blockCount = @($script:Issues | Where-Object { $_.Severity -eq 'Block' -and -not $_.Fixed }).Count
    $warnCount  = @($script:Issues | Where-Object { $_.Severity -eq 'Warn'  -and -not $_.Fixed }).Count
    Write-Host ("   Problèmes: {0} bloquant(s), {1} avertissement(s)" -f $blockCount, $warnCount) -ForegroundColor Gray
    Write-Host ("   Durée    : {0}s" -f $script:Result.durationSeconds) -ForegroundColor Gray
    Write-Host '  ------------------------------------------------------------' -ForegroundColor DarkCyan
    Write-Host ''

    # Journalisation dans .git (jamais versionné)
    try {
        if ($script:RepoRoot) {
            $logDir = Join-Path $script:RepoRoot '.git\gitauto'
            if (-not (Test-Path $logDir)) { New-Item -ItemType Directory -Path $logDir -Force | Out-Null }
            $logFile = Join-Path $logDir ('log-' + (Get-Date -Format 'yyyyMMdd') + '.log')
            Add-Content -Path $logFile -Value (($script:Log.ToArray()) -join [Environment]::NewLine) -Encoding UTF8
            $jsonFile = Join-Path $logDir 'last-run.json'
            ($script:Result | ConvertTo-Json -Depth 5) | Out-File -FilePath $jsonFile -Encoding utf8
        }
    } catch { }

    if ($Json) { $script:Result | ConvertTo-Json -Depth 5 }
}

# ---------------------------------------------------------------------------
# PIPELINE
# ---------------------------------------------------------------------------

$script:RepoRoot = $null
$script:Branch = $null
$script:Remote = $null
$script:Changes = @()
$script:HasCommits = $false
$script:RemoteReachable = $false
$script:NeedsUpstream = $false

try {
    Write-Banner

    if ($Setup) {
        Invoke-FirstMachineSetup
        Test-Environment
        Test-Repository
        Stop-Script $EXIT_OK 'setup-complete' 'Préparation terminée. La machine est prête pour les commits et les push.'
    }

    Test-Environment
    Test-Repository
    Get-ChangeSet
    Invoke-Inspection

    if ($Doctor) {
        $blockers = @(Get-Blockers)
        if ($blockers.Count -gt 0) { Stop-Script $EXIT_BLOCKED 'doctor-issues' 'Diagnostic terminé : des problèmes bloqueraient un commit.' }
        Stop-Script $EXIT_OK 'doctor-clean' 'Diagnostic terminé : dépôt sain.'
    }

    if ($script:Changes.Count -eq 0 -and -not $Amend) {
        # Rien à committer, mais peut-être des commits à pousser
        $upstream = Get-GitValue 'rev-parse' '--abbrev-ref' '--symbolic-full-name' '@{u}'
        $pending = 0
        if ($upstream) {
            $c = Get-GitValue 'rev-list' '--count' "$upstream..HEAD"
            if ($c -match '^\d+$') { $pending = [int]$c }
        }
        if ($pending -gt 0 -and -not $NoPush) {
            Write-Host ''
            Write-Line ("  >> Aucun changement, mais {0} commit(s) local(aux) à pousser." -f $pending) 'Yellow'
            Invoke-Sync | Out-Null
            $pushed = Invoke-Push
            if ($pushed) { Stop-Script $EXIT_OK 'pushed-only' }
            Stop-Script $EXIT_PUSH 'push-failed'
        }
        Stop-Script $EXIT_NOTHING 'nothing-to-do' 'Rien à faire : le dépôt est propre et synchronisé.'
    }

    $blockers = @(Get-Blockers)
    if ($blockers.Count -gt 0 -and -not $Force) {
        Write-Host ''
        Write-Line '  >> Commit interrompu. Corriger les points ci-dessus, ou :' 'Yellow'
        Write-Line '     -Fix    pour appliquer les corrections automatiques' 'DarkGray'
        Write-Line '     -Force  pour passer outre (à vos risques)' 'DarkGray'
        Stop-Script $EXIT_BLOCKED 'blocked'
    }
    if ($blockers.Count -gt 0 -and $Force) {
        Write-Warn2 ("{0} problème(s) bloquant(s) ignoré(s) via -Force." -f $blockers.Count)
    }

    $qualityOk = Invoke-QualityGates
    if (-not $qualityOk -and -not $Force) {
        Write-Host ''
        Write-Line '  >> Contrôles qualité en échec. Corriger, ou relancer avec -NoVerify / -Force.' 'Yellow'
        Stop-Script $EXIT_QUALITY 'quality-failed'
    }

    $committed = Invoke-Commit
    if (-not $committed) {
        Stop-Script $EXIT_NOTHING 'nothing-committed' 'Aucun commit créé.'
    }

    Invoke-Sync | Out-Null
    $pushed = Invoke-Push
    Invoke-Tag

    if ($pushed -or $NoPush -or -not $script:Remote) {
        Stop-Script $EXIT_OK 'success'
    }
    Stop-Script $EXIT_PUSH 'push-failed'
}
catch {
    Write-Host ''
    Write-Err2 ("Erreur inattendue : " + $_.Exception.Message)
    if ($_.ScriptStackTrace) {
        foreach ($l in ($_.ScriptStackTrace -split "`n" | Select-Object -First 4)) { Write-Hint $l.Trim() }
    }
    $script:Result.status = 'crash'
    $script:Result.exitCode = $EXIT_ERROR
    Write-Report
    exit $EXIT_ERROR
}
