#!/usr/bin/env node
/**
 * Validateur du contenu pédagogique (public/data).
 *
 * Attrape, avant qu'elles n'arrivent en production, les familles de pannes qui
 * ne provoquent aucune erreur visible à l'exécution — l'application affiche
 * simplement moins de contenu que prévu, ou le mauvais :
 *
 *   1. manifest → fichier inexistant     (le chapitre se charge vide)
 *   2. fichier orphelin                  (exercice écrit mais jamais affiché)
 *   3. id désynchronisé                  (manifest vs champ `id` du fichier)
 *   4. hiérarchie à 3 niveaux            (le rendu s'arrête à 2 → contenu invisible)
 *   5. ids dupliqués                     (collision des clés de progression élève)
 *   6. libellé/numérotation en dur       (« Partie 1 : », « I- », « 1) », « a) »)
 *   7. bloc `partie` avec sous-questions (l'imbrication est perdue au rendu)
 *   8. question totalement vide          (ne produit rien à l'écran)
 *   9. quizCount désynchronisé           (badge du tableau de bord faux)
 *  10. collision d'id de chapitre        (même id dans plusieurs classes)
 *  11. contenu inatteignable             (fichier hors de la chaîne de manifestes)
 *  12. chapitre jamais déclaré           (dossier complet mais absent du manifeste de classe)
 *  13. BOM UTF-8                         (JSON.parse direct échoue côté outillage)
 *  14. `\\[` lu comme un espacement      (réparé au rendu ; écrire `\\ {}[…]` pour un source lisible)
 *  15. environnement LaTeX déséquilibré  (`\end{…}` orphelin affiché en clair)
 *
 * Les règles 1 à 10 parcourent les chapitres DÉCLARÉS. Les règles 11 à 13 partent
 * du disque et remontent la chaîne racine → classe → chapitre → contenus, seule
 * façon de voir ce que les manifestes ne mentionnent pas.
 *
 * Usage :  node scripts/validate-content.mjs [--json] [--quiet]
 * Sortie :  0 = aucune erreur · 1 = au moins une erreur (les warnings n'échouent pas)
 */

import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, dirname, resolve, basename, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = join(ROOT, 'public');
const DATA = join(PUBLIC, 'data');

const args = new Set(process.argv.slice(2));
const AS_JSON = args.has('--json');
const QUIET = args.has('--quiet');

const errors = [];
const warnings = [];
const err = (file, msg, detail) => errors.push({ file, msg, detail });
const warn = (file, msg, detail) => warnings.push({ file, msg, detail });

/** Lecture JSON tolérante au BOM, qui signale proprement un fichier illisible. */
const readJson = (absPath, label) => {
    try {
        return JSON.parse(readFileSync(absPath, 'utf8').replace(/^﻿/, ''));
    } catch (e) {
        err(label, 'JSON illisible', e.message);
        return null;
    }
};

/** `data/x/y.json` → chemin absolu sous public/. */
const fromDataPath = (p) => join(PUBLIC, p.replace(/^\//, ''));

// ─── Règles portant sur un exercice ───────────────────────────────────────────

const PART_LABEL = /^\s*(?:Partie\s*(?:\d+|[IVX]+)\b|(?:I{1,3}|IV|V)\s*[-–.]\s)/i;
const MANUAL_NUM = /^\s*(?:\(?\d+\s*[).]|\(?[a-h]\s*[).]|[•▪])\s/;

// ─── 14 & 15 — Hygiène mathématique (contrôles purs, sans KaTeX) ─────────────
//
// Deux pannes invisibles dans le JSON :
//
//   14. `\\[` : dans un `array`, `\\` accepte un argument optionnel de dimension
//       (`\\[2pt]`). Une ligne qui COMMENCE par un intervalle — `\\[-1,2] & …` —
//       est donc lue comme un espacement de taille « -1,2 ». Le rendu insère
//       désormais la parade `\\ {}[-1,2]` (utils/parser/latexNormalize.ts) : ce
//       contrôle est un AVERTISSEMENT de lisibilité, plus un blocage.
//   15. environnement déséquilibré (`\begin{enumerate}` sans `\end{enumerate}`) :
//       la balise orpheline s'affiche en clair dans la fiche — lui reste bloquant.

/** Dimension acceptée par `\\[...]` (grammaire KaTeX : nombre + unité). */
const SIZE_ARG = /^\s*[-+]?(?:\d+(?:\.\d+)?|\.\d+)\s*(?:em|ex|mu|pt|mm|cm|in|bp|pc|dd|cc|nd|nc|sp|px)\s*$/;

const countEnvironments = (text, re) => {
    const counts = new Map();
    for (const match of text.matchAll(re)) counts.set(match[1], (counts.get(match[1]) || 0) + 1);
    return counts;
};

const checkMathHygiene = (content, file, label) => {
    const text = String(content ?? '');
    if (!text) return;

    // 14 — `\\[` ambigu : signalé pour la lisibilité de la source. Le rendu
    // insère lui-même la parade `\\ {}[…]` (cf. `utils/parser/latexNormalize`),
    // donc le tableau s'affiche : ce n'est plus une erreur bloquante.
    for (const match of text.matchAll(/\\\\\[([^\]\n]*)/g)) {
        const arg = match[1];
        if (SIZE_ARG.test(arg)) continue;
        warn(
            file,
            'ligne de tableau après `\\\\` (réparée au rendu)',
            `${label} — « \\\\[${arg.trim().slice(0, 20)}… » est lu comme un espacement de ligne : ` +
            'le rendu insère le groupe vide, mais écrire « \\\\ {}[…] » garde le source lisible'
        );
        break; // une alerte par contenu suffit : la correction est la même partout
    }

    // 15 — environnements déséquilibrés
    const begins = countEnvironments(text, /\\begin\{([^}]+)\}/g);
    const ends = countEnvironments(text, /\\end\{([^}]+)\}/g);
    for (const env of new Set([...begins.keys(), ...ends.keys()])) {
        const open = begins.get(env) || 0;
        const close = ends.get(env) || 0;
        if (open !== close) {
            err(
                file,
                'environnement LaTeX déséquilibré',
                `${label} — \\begin{${env}} × ${open} pour \\end{${env}} × ${close} : la balise orpheline s'affichera en clair`
            );
        }
    }
};

const checkExercise = (doc, label) => {
    const questions = doc.questions || [];
    if (!questions.length) {
        warn(label, 'aucune question');
        return;
    }

    const seen = new Map(); // clé de progression → premier emplacement
    const qIds = new Set(); // id de question dans l'exercice (collision canvas / progression)

    for (const q of questions) {
        if (q.id) {
            if (qIds.has(q.id)) {
                err(label, 'id de question dupliqué', `\`${q.id}\` — collision des clés de progression et des zones manuscrites (chevauchement)`);
            }
            qIds.add(q.id);
        }
        const type = String(q.type || 'question').toLowerCase();
        const content = String(q.content || '');
        const subs = q.subQuestions || [];
        checkMathHygiene(content, label, `question \`${q.id}\``);

        if (type === 'partie' || type === 'header') {
            if (subs.length) {
                err(label, 'bloc `partie` avec sous-questions', `\`${q.id}\` — un bloc partie est un séparateur autonome ; ses sous-questions perdent leur imbrication au rendu`);
            }
            if (PART_LABEL.test(content)) {
                warn(label, 'libellé de partie écrit en dur', `\`${q.id}\` — le libellé « Partie A/B » est généré automatiquement, il apparaîtra en double`);
            }
            continue;
        }

        if (!content.trim() && !subs.length) {
            warn(label, 'question vide', `\`${q.id}\` — ni énoncé ni sous-question, rien ne sera affiché`);
        }
        if (PART_LABEL.test(content)) {
            warn(label, 'libellé de partie dans une question', `\`${q.id}\` — utiliser un bloc { "type": "partie" }`);
        }
        if (MANUAL_NUM.test(content)) {
            warn(label, 'numérotation manuelle', `\`${q.id}\` — la numérotation est générée, « ${content.trim().slice(0, 14)}… » fera doublon`);
        }

        for (const sq of subs) {
            const key = `${q.id}::${sq.id}`;
            if (seen.has(key)) {
                err(label, 'id de sous-question dupliqué', `\`${key}\` — les deux partagent la même clé de progression élève`);
            } else {
                seen.set(key, true);
            }
            checkMathHygiene(sq.content, label, `sous-question \`${key}\``);
            checkMathHygiene(sq.correction, label, `correction \`${key}\``);
            if ((sq.subQuestions || []).length) {
                err(label, 'hiérarchie à 3 niveaux', `\`${q.id} > ${sq.id}\` — le rendu s'arrête à 2 niveaux, ${sq.subQuestions.length} sous-question(s) seront invisibles`);
            }
            if (MANUAL_NUM.test(String(sq.content || ''))) {
                warn(label, 'numérotation manuelle', `\`${q.id} > ${sq.id}\``);
            }
        }
    }
};

// ─── Parcours ─────────────────────────────────────────────────────────────────

const rootManifest = readJson(join(DATA, 'manifest.json'), 'data/manifest.json');
if (!rootManifest) {
    console.error('manifest racine illisible — abandon');
    process.exit(1);
}

const chapterIdIndex = new Map(); // id de chapitre → [classes]
let nbExercises = 0;
let nbChapters = 0;

for (const classRef of rootManifest.classes || []) {
    const classLabel = classRef.path;
    if (!existsSync(fromDataPath(classRef.path))) {
        err('data/manifest.json', 'classe introuvable', classRef.path);
        continue;
    }
    const classData = readJson(fromDataPath(classRef.path), classLabel);
    if (!classData) continue;

    for (const chapter of classData.chapters || []) {
        nbChapters += 1;
        const ids = chapterIdIndex.get(chapter.id) || [];
        ids.push(classRef.id);
        chapterIdIndex.set(chapter.id, ids);

        if (!chapter.manifestPath) continue;
        const manifestAbs = fromDataPath(chapter.manifestPath);
        if (!existsSync(manifestAbs)) {
            err(classLabel, 'manifest de chapitre introuvable', `${chapter.id} → ${chapter.manifestPath}`);
            continue;
        }
        const manifest = readJson(manifestAbs, chapter.manifestPath);
        if (!manifest) continue;

        // 1 & 3 — chaque exercice référencé existe, et son id interne concorde
        const referenced = new Set();
        const exerciseIds = new Set(); // id d'exercice dans le manifest (collision progression)
        for (const ex of manifest.exercises || []) {
            const abs = fromDataPath(ex.path);
            referenced.add(resolve(abs));
            if (ex.id) {
                if (exerciseIds.has(ex.id)) {
                    err(chapter.manifestPath, 'id d\'exercice dupliqué', `\`${ex.id}\` — collision des clés de progression des élèves`);
                }
                exerciseIds.add(ex.id);
            }
            if (!existsSync(abs)) {
                err(chapter.manifestPath, 'exercice référencé introuvable', `${ex.id} → ${ex.path}`);
                continue;
            }
            nbExercises += 1;
            const doc = readJson(abs, ex.path);
            if (!doc) continue;
            if (doc.id && ex.id && doc.id !== ex.id) {
                err(ex.path, 'id désynchronisé', `manifest « ${ex.id} » vs fichier « ${doc.id} »`);
            }
            checkExercise(doc, ex.path);
        }

        // 2 — fichiers présents sur disque mais jamais référencés
        const exDir = join(dirname(manifestAbs), 'exercises');
        if (existsSync(exDir) && statSync(exDir).isDirectory()) {
            for (const f of readdirSync(exDir)) {
                if (!f.endsWith('.json')) continue;
                if (!referenced.has(resolve(join(exDir, f)))) {
                    err(chapter.manifestPath, 'exercice orphelin', `${f} existe sur disque mais n'est dans aucun manifest`);
                }
            }
        }

        // révisions / quiz référencés
        for (const key of ['revisions', 'quizzes']) {
            for (const item of manifest[key] || []) {
                if (!item.path) continue;
                const abs = fromDataPath(item.path);
                if (!existsSync(abs)) {
                    err(chapter.manifestPath, `${key.slice(0, -1)} introuvable`, item.path);
                    continue;
                }
                // Contenu des fiches de révision : lexique (dictionnaire) + ancres de sections.
                if (key === 'revisions') {
                    const sheet = readJson(abs, item.path);
                    if (!sheet) continue;
                    const terms = new Map();
                    for (const entry of sheet.lexique || []) {
                        const term = String(entry?.term || '').trim();
                        if (!term) {
                            err(item.path, 'entrée de lexique sans terme', 'le dictionnaire de la fiche contient une entrée vide');
                            continue;
                        }
                        const norm = term.toLowerCase();
                        if (terms.has(norm)) {
                            err(item.path, 'terme de lexique dupliqué', `« ${term} » apparaît plusieurs fois — collision du dictionnaire (chevauchement)`);
                        }
                        terms.set(norm, entry);
                        if (!String(entry?.arabic || '').trim()) {
                            warn(item.path, 'entrée de lexique sans traduction arabe', `« ${term} »`);
                        }
                    }
                    const sectionIds = new Set();
                    for (const sec of sheet.sections || []) {
                        if (!sec?.id) continue;
                        if (sectionIds.has(sec.id)) {
                            warn(item.path, 'id de section dupliqué', `\`${sec.id}\` — les ancres de défilement entrent en collision`);
                        }
                        sectionIds.add(sec.id);

                        // 14 & 15 — hygiène des formules de chaque bloc.
                        for (const [bi, block] of (sec.blocks || []).entries()) {
                            const rawContent = block?.content;
                            const parts = Array.isArray(rawContent) ? rawContent : [rawContent];
                            parts.forEach((part, pi) => checkMathHygiene(
                                part,
                                item.path,
                                `section \`${sec.id}\` · bloc ${bi + 1}${Array.isArray(rawContent) ? ` (${pi + 1})` : ''}`
                            ));
                        }
                    }
                }
            }
        }

        // 9 — quizCount doit refléter le nombre réel de questions, des deux côtés
        const quizPath = (manifest.quizzes || [])[0]?.path;
        if (quizPath && existsSync(fromDataPath(quizPath))) {
            const quiz = readJson(fromDataPath(quizPath), quizPath);
            const real = (quiz?.questions || []).length;
            if (real && manifest.quizCount != null && manifest.quizCount !== real) {
                err(chapter.manifestPath, 'quizCount incorrect', `annonce ${manifest.quizCount}, le quiz en contient ${real}`);
            }
            if (real && chapter.quizCount != null && chapter.quizCount !== real) {
                err(classLabel, 'quizCount incorrect', `chapitre ${chapter.id} annonce ${chapter.quizCount}, le quiz en contient ${real}`);
            }
        }
    }
}

// ─── 11 à 13 — Audit de chaîne bout-en-bout ───────────────────────────────────
//
// Le parcours ci-dessus ne visite que les chapitres DÉCLARÉS, et ne cherche les
// orphelins que dans leur dossier `exercises/`. Un fichier de révision jamais
// référencé, ou un chapitre entier absent du manifeste de classe, lui échappait
// donc entièrement : c'est ainsi que des chapitres complets (fiche + exercices +
// quiz) ont pu rester invisibles. Ce balayage part du disque et reconstruit la
// chaîne des manifestes pour rendre visible tout contenu inatteignable.

/** Noms de DOSSIERS sur disque. À ne pas confondre avec les clés des manifestes. */
const CONTENT_DIRS = ['revisions', 'exercises', 'quiz'];

/** Clés des manifestes — `quiz` sur disque devient `quizzes` dans le manifeste. */
const MANIFEST_KEYS = ['revisions', 'exercises', 'quizzes'];

/** Dossiers servis par des fonctionnalités dédiées, hors chaîne de chapitres. */
const AUXILIARY_DIRS = new Set(['classes', 'concours', 'quizzes', 'pictures', 'ds', 'olympiad', 'problemes', 'examen']);

const walkJson = (dir, acc = []) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) walkJson(full, acc);
        else if (entry.name.endsWith('.json')) acc.push(full);
    }
    return acc;
};

const allJson = walkJson(DATA);
const rootAbs = resolve(join(DATA, 'manifest.json'));
const reachable = new Set([rootAbs]);

/** Chemin relatif lisible dans les messages. */
const pretty = (abs) => abs.replace(ROOT, '').split(sep).join('/').replace(/^\//, '');

// Étage 1 : racine → manifestes de classe → contenus déclarés par la classe.
// Attention : beaucoup de chapitres déclarent leurs révisions/exercices/quiz
// directement dans le manifeste de classe, SANS clé dans le manifeste de
// chapitre. `fetchChapterDetails` fait `{...chapterRef, ...fetchedChapter}` :
// une clé absente du manifeste de chapitre ne masque donc rien, et ces chemins
// sont bien ceux utilisés par l'application. Les ignorer ferait apparaître des
// faux positifs « contenu inatteignable ».
for (const classRef of rootManifest.classes || []) {
    const classAbs = fromDataPath(classRef.path);
    if (!existsSync(classAbs)) continue;
    reachable.add(resolve(classAbs));
    const classData = readJson(classAbs, classRef.path);
    if (!classData) continue;
    for (const chapter of classData.chapters || []) {
        if (chapter.manifestPath) reachable.add(resolve(fromDataPath(chapter.manifestPath)));
        for (const key of MANIFEST_KEYS) {
            for (const item of chapter[key] || []) {
                if (item?.path) reachable.add(resolve(fromDataPath(item.path)));
            }
        }
    }
}

// Étage 2 : tout manifeste présent sur disque déclare son contenu. On suit donc
// TOUS les `manifest.json` (chapitres, concours…), pas seulement ceux rattachés à
// la racine : un dossier peut avoir son propre index légitime (data/concours),
// et une fiche y est alors intentionnelle, pas orpheline.
// Les dossiers entiers hors chaîne restent signalés par la règle 12.
for (const abs of allJson) {
    if (basename(abs) !== 'manifest.json' || abs === rootAbs) continue;
    reachable.add(resolve(abs));
    const manifest = readJson(abs, pretty(abs));
    if (!manifest) continue;
    for (const key of MANIFEST_KEYS) {
        for (const item of manifest[key] || []) {
            if (item?.path) reachable.add(resolve(fromDataPath(item.path)));
        }
    }
}

// Index annexes dont les références ne sont pas nommées `revisions`/`quizzes`
// (ex. `data/concours/schools.json` → annales). On suit tout champ `path`.
const collectPaths = (value, acc) => {
    if (Array.isArray(value)) {
        value.forEach((v) => collectPaths(v, acc));
        return;
    }
    if (!value || typeof value !== 'object') return;
    for (const [key, v] of Object.entries(value)) {
        if (key === 'path' && typeof v === 'string' && v.startsWith('data/')) acc.push(v);
        else collectPaths(v, acc);
    }
};

for (const index of ['data/concours/schools.json']) {
    const abs = fromDataPath(index);
    if (!existsSync(abs)) continue;
    reachable.add(resolve(abs));
    const refs = [];
    collectPaths(readJson(abs, index), refs);
    for (const ref of refs) {
        const target = fromDataPath(ref);
        if (existsSync(target)) reachable.add(resolve(target));
    }
}

// 11 — fichier de contenu absent de la chaîne de manifestes.
const staleByFolder = new Map();
for (const abs of allJson) {
    if (reachable.has(resolve(abs))) continue;
    if (!CONTENT_DIRS.includes(basename(dirname(abs)))) continue;
    const folder = `${pretty(dirname(abs))}/`;
    const names = staleByFolder.get(folder) || [];
    names.push(basename(abs));
    staleByFolder.set(folder, names);
}
for (const [folder, names] of staleByFolder) {
    const shown = names.slice(0, 4).join(', ');
    const more = names.length > 4 ? ` (+${names.length - 4})` : '';
    warn(folder, 'contenu inatteignable', `${names.length} fichier(s) — ${shown}${more} — écrit mais jamais affiché`);
}

// 12 — dossier de chapitre présent sur disque mais jamais déclaré par sa classe.
for (const classRef of rootManifest.classes || []) {
    const classAbs = fromDataPath(classRef.path);
    if (!existsSync(classAbs)) continue;
    const classData = readJson(classAbs, classRef.path);
    if (!classData) continue;
    const declared = new Set((classData.chapters || []).map((c) => c.id));
    const classDir = join(DATA, classRef.id);
    if (!existsSync(classDir)) continue;

    for (const entry of readdirSync(classDir, { withFileTypes: true })) {
        if (!entry.isDirectory() || AUXILIARY_DIRS.has(entry.name) || declared.has(entry.name)) continue;
        const counts = CONTENT_DIRS.map((dirName) => {
            const dirAbs = join(classDir, entry.name, dirName);
            return existsSync(dirAbs) ? readdirSync(dirAbs).filter((f) => f.endsWith('.json')).length : 0;
        });
        if (!counts.some((n) => n > 0)) continue;
        warn(
            `${classRef.id}/${entry.name}`,
            'chapitre jamais déclaré — contenu invisible',
            `fiches=${counts[0]}, exercices=${counts[1]}, quiz=${counts[2]} — à déclarer dans data/classes/${classRef.id}.json ou à supprimer`,
        );
    }
}

// 13 — BOM UTF-8 : le navigateur le retire, `JSON.parse` non.
for (const abs of allJson) {
    const buf = readFileSync(abs);
    if (buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) {
        warn(pretty(abs), 'BOM UTF-8', "retirer l'en-tête \\uFEFF : JSON.parse direct échoue côté scripts");
    }
}

// 10 — collisions d'id de chapitre entre classes
for (const [id, classes] of chapterIdIndex) {
    if (classes.length > 1) {
        warn('(global)', 'id de chapitre partagé entre classes', `« ${id} » dans ${classes.join(', ')} — tout filtrage sur chapterId DOIT aussi filtrer sur classId`);
    }
}

// 14 — images statiques : fichier présent, poids raisonnable, pas de dépendance
// à un tiers. Les avertissements ne font pas échouer le build : ils signalent
// ce qu'un élève verrait cassé ou lent (image vide, 900 Ko sur une connexion
// mobile, figure hébergée chez Wikimedia et absente hors ligne).
const IMAGE_EXT = /\.(png|jpe?g|webp|gif|svg)$/i;
const RASTER_BUDGET = 500 * 1024; // aligné sur STUDIO_MEDIA_MAX_BYTES (utils/imagePipeline.ts)
const SVG_BUDGET = 150 * 1024;
const kb = (bytes) => `${Math.round(bytes / 1024)} Ko`;

const collectImageRefs = (value, acc) => {
    if (Array.isArray(value)) { value.forEach((v) => collectImageRefs(v, acc)); return; }
    if (!value || typeof value !== 'object') return;
    for (const [key, v] of Object.entries(value)) {
        if ((key === 'src' || key === 'image') && typeof v === 'string') acc.push({ key, value: v });
        else collectImageRefs(v, acc);
    }
};

for (const abs of allJson) {
    let doc;
    try { doc = JSON.parse(readFileSync(abs, 'utf8').replace(/^/, '')); } catch { continue; }
    const refs = [];
    collectImageRefs(doc, refs);
    let external = 0;
    for (const { key, value } of refs) {
        const ref = value.trim();
        if (!ref || ref.startsWith('data:') || ref.startsWith('/api/')) continue;
        const clean = ref.split(/[?#]/)[0];
        if (/^https?:\/\//i.test(ref)) { if (IMAGE_EXT.test(clean)) external += 1; continue; }
        if (!IMAGE_EXT.test(clean)) continue;

        // Même règle que `resolveMediaPaths` (contentService) : un `src` relatif se
        // lit depuis le dossier du JSON ; un chemin absolu ou un champ `image` se
        // lit depuis la racine du site.
        const target = key === 'src' && !ref.startsWith('/')
            ? join(dirname(abs), clean)
            : join(PUBLIC, clean.replace(/^\//, ''));
        if (!existsSync(target)) {
            warn(pretty(abs), 'image introuvable', ref);
            continue;
        }
        const size = statSync(target).size;
        const budget = /\.svg$/i.test(clean) ? SVG_BUDGET : RASTER_BUDGET;
        if (size > budget) warn(pretty(abs), 'image trop lourde', `${ref} — ${kb(size)} pour un budget de ${kb(budget)}`);
    }
    if (external > 0) {
        warn(pretty(abs), 'image hébergée chez un tiers', `${external} image(s) distante(s) : absente(s) hors ligne et dépendante(s) du service d'origine`);
    }
}

// ─── Rapport ──────────────────────────────────────────────────────────────────

if (AS_JSON) {
    console.log(JSON.stringify({ errors, warnings, nbChapters, nbExercises }, null, 2));
    process.exit(errors.length ? 1 : 0);
}

const group = (list) => {
    const byFile = new Map();
    for (const it of list) {
        const arr = byFile.get(it.file) || [];
        arr.push(it);
        byFile.set(it.file, arr);
    }
    return byFile;
};

const print = (list, icon, title) => {
    if (!list.length) return;
    console.log(`\n${icon}  ${title} (${list.length})`);
    for (const [file, items] of group(list)) {
        console.log(`\n   ${file}`);
        for (const it of items) {
            console.log(`     • ${it.msg}${it.detail ? ` — ${it.detail}` : ''}`);
        }
    }
};

if (!QUIET || errors.length) {
    print(errors, '✖', 'ERREURS');
    if (!QUIET) print(warnings, '⚠', 'AVERTISSEMENTS');
}

console.log(
    `\n${nbChapters} chapitres · ${nbExercises} exercices — ` +
    `${errors.length} erreur(s), ${warnings.length} avertissement(s)\n`
);

process.exit(errors.length ? 1 : 0);
