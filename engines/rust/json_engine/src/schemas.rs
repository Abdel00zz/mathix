//! Validateurs de schémas JSON : manifeste global, classe, exercice, quiz et fiche de révision.

use std::collections::HashMap;
use serde_json::{json, Value};
use crate::helpers::{
    check_path_shape, count_inline, optional_str, push_err, require_array, require_str,
};

const DIFFICULTIES: &[&str] = &["facile", "moyen", "difficile"];
const QUIZ_TYPES: &[&str] = &["mcq", "boolean", "order", "error", "input", "qcm", "vrai-faux"];
const MEDIA_POSITIONS: &[&str] = &[
    "top", "bottom", "center", "left", "right", "float-left", "float-right", "inline", "inline-right",
];

const BLOCK_TYPES: &[&str] = &[
    "intro", "text", "definition", "theorem", "proposition", "lemma", "corollary", "property",
    "method", "methode", "proof", "demonstration", "example", "exemple", "counterexample",
    "remark", "warning", "tip", "astuce", "recall", "rappel", "summary", "keypoint", "intuition",
    "trick", "algorithm", "checklist", "application", "problem", "probleme", "hint", "solution",
    "note", "activity", "exploration", "objectif", "conclusion", "convention", "notation",
    "vocabulaire", "culture", "erreur", "perspective", "ouverture", "savoir", "historique",
    "question", "media", "figure", "cela_permet_de", "point_methode", "formule", "syntaxe",
];

fn validate_media_field(media: &Value, path: &str, errors: &mut Vec<Value>, warnings: &mut Vec<Value>) {
    let (items, is_list): (Vec<&Value>, bool) = match media {
        Value::Array(arr) => (arr.iter().collect(), true),
        Value::Object(obj) => {
            if let Some(arr) = obj.get("images").and_then(Value::as_array) {
                (arr.iter().collect(), true)
            } else {
                (vec![media], false)
            }
        }
        Value::Null => return,
        _ => {
            push_err(errors, path, "« media » doit être un objet ou un tableau d'objets".into());
            return;
        }
    };
    for (idx, item) in items.iter().enumerate() {
        let p = if is_list { format!("{path}[{idx}]") } else { path.to_string() };
        if item.get("src").and_then(Value::as_str).map(|s| s.trim().is_empty()).unwrap_or(true) {
            push_err(errors, &format!("{p}.src"), "champ src d'image manquant".into());
        }
        if let Some(pos) = item.get("position").and_then(Value::as_str) {
            if !MEDIA_POSITIONS.contains(&pos) {
                warnings.push(json!({
                    "path": format!("{p}.position"),
                    "message": format!("position média « {pos} » non standard")
                }));
            }
        }
    }
}

pub fn v_manifest(doc: &Value, name: &str) -> Value {
    let mut errors = Vec::new();
    let mut warnings = Vec::new();
    let mut n_classes = 0u32;

    if let Some(classes) = require_array(doc, "classes", &mut errors) {
        for (i, c) in classes.iter().enumerate() {
            let p = format!("classes[{i}]");
            if c.get("id").and_then(Value::as_str).map(|s| s.is_empty()).unwrap_or(true) {
                push_err(&mut errors, &format!("{p}.id"), "id de classe vide".into());
            } else {
                n_classes += 1;
            }
            if c.get("path").and_then(Value::as_str).is_none() {
                push_err(&mut errors, &format!("{p}.path"), "chemin de classe manquant".into());
            }
        }
    }
    if doc.get("concours").is_none() {
        push_err(&mut warnings, "concours", "aucune section concours dans le manifeste".into());
    }
    json!({
        "ok": true, "engine": "json", "file": name, "schema": "manifest",
        "valid": errors.is_empty(), "errors": errors, "warnings": warnings,
        "stats": { "classes": n_classes }
    })
}

pub fn v_class(doc: &Value, name: &str) -> Value {
    let mut errors = Vec::new();
    let mut warnings = Vec::new();
    let (mut n_ch, mut n_rev, mut n_quiz) = (0u32, 0u32, 0u32);

    require_str(doc, "id", &mut errors);
    require_str(doc, "title", &mut errors);
    if let Some(chapters) = require_array(doc, "chapters", &mut errors) {
        for (i, ch) in chapters.iter().enumerate() {
            let p = format!("chapters[{i}]");
            let ch_id = ch.get("id").and_then(Value::as_str).unwrap_or("");
            if ch_id.is_empty() {
                push_err(&mut errors, &format!("{p}.id"), "id de chapitre vide".into());
            }
            if ch.get("title").and_then(Value::as_str).is_none() {
                push_err(&mut errors, &format!("{p}.title"), "titre de chapitre manquant".into());
            }
            if ch.get("manifestPath").and_then(Value::as_str).is_none() {
                push_err(&mut errors, &format!("{p}.manifestPath"), "manifestPath manquant".into());
            }
            for (arr, kind) in [("revisions", "revision"), ("quizzes", "quiz")] {
                if let Some(items) = ch.get(arr).and_then(Value::as_array) {
                    for (j, it) in items.iter().enumerate() {
                        if it.get("id").and_then(Value::as_str).is_none() {
                            push_err(&mut errors, &format!("{p}.{arr}[{j}].id"), "id manquant".into());
                        }
                        if let Some(path) = it.get("path").and_then(Value::as_str) {
                            check_path_shape(path, kind, &mut errors);
                        } else {
                            push_err(&mut errors, &format!("{p}.{arr}[{j}].path"), "chemin manquant".into());
                        }
                    }
                    match arr {
                        "revisions" => n_rev += items.len() as u32,
                        "quizzes" => n_quiz += items.len() as u32,
                        _ => {}
                    }
                } else {
                    warnings.push(json!({ "path": format!("{p}.{arr}"), "message": "tableau absent" }));
                }
            }
            n_ch += 1;
        }
    }
    json!({
        "ok": true, "engine": "json", "file": name, "schema": "class",
        "valid": errors.is_empty(), "errors": errors, "warnings": warnings,
        "stats": { "chapters": n_ch, "revisions": n_rev, "quizzes": n_quiz }
    })
}

pub fn v_exercise(doc: &Value, name: &str) -> Value {
    let mut errors = Vec::new();
    let mut warnings = Vec::new();

    require_str(doc, "id", &mut errors);
    require_str(doc, "topic", &mut errors);
    match doc.get("difficulty") {
        Some(Value::String(d)) if !DIFFICULTIES.contains(&d.as_str()) => {
            push_err(&mut errors, "difficulty", format!("difficulté « {d} » hors {DIFFICULTIES:?}"));
        }
        Some(Value::String(_)) => {}
        _ => push_err(&mut errors, "difficulty", "difficulté manquante".into()),
    }
    optional_str(doc, "theme", &mut errors);
    optional_str(doc, "context", &mut errors);
    if let Some(media) = doc.get("media") {
        validate_media_field(media, "media", &mut errors, &mut warnings);
    }

    let (mut n_q, mut n_sq) = (0u32, 0u32);
    if let Some(questions) = require_array(doc, "questions", &mut errors) {
        for (i, q) in questions.iter().enumerate() {
            let p = format!("questions[{i}]");
            if q.get("id").and_then(Value::as_str).is_none() {
                push_err(&mut errors, &format!("{p}.id"), "id de question manquant".into());
            }
            if q.get("content").and_then(Value::as_str).is_none() {
                push_err(&mut errors, &format!("{p}.content"), "contenu de question manquant".into());
            }
            if let Some(media) = q.get("media") {
                validate_media_field(media, &format!("{p}.media"), &mut errors, &mut warnings);
            }
            match q.get("subQuestions") {
                Some(Value::Array(sqs)) if !sqs.is_empty() => {
                    for (j, sq) in sqs.iter().enumerate() {
                        let sp = format!("{p}.subQuestions[{j}]");
                        if sq.get("id").and_then(Value::as_str).is_none() {
                            push_err(&mut errors, &format!("{sp}.id"), "id de sous-question manquant".into());
                        }
                        if sq.get("content").and_then(Value::as_str).is_none() {
                            push_err(&mut errors, &format!("{sp}.content"), "contenu de sous-question manquant".into());
                        }
                        optional_str(sq, "hint", &mut errors);
                        optional_str(sq, "correction", &mut errors);
                        if let Some(media) = sq.get("media") {
                            validate_media_field(media, &format!("{sp}.media"), &mut errors, &mut warnings);
                        }
                        n_sq += 1;
                    }
                }
                Some(_) => push_err(&mut errors, &format!("{p}.subQuestions"), "doit être un tableau non vide".into()),
                None => {
                    if q.get("content").is_none() {
                        push_err(&mut errors, &format!("{p}.subQuestions"), "ni subQuestions ni question plate".into());
                    }
                    n_sq += 1;
                }
            }
            n_q += 1;
        }
    }
    json!({
        "ok": true, "engine": "json", "file": name, "schema": "exercise",
        "valid": errors.is_empty(), "errors": errors, "warnings": warnings,
        "stats": { "questions": n_q, "subQuestions": n_sq }
    })
}

pub fn v_quiz(doc: &Value, name: &str) -> Value {
    let mut errors = Vec::new();
    let warnings: Vec<Value> = Vec::new();
    let mut n_q = 0u32;
    let mut by_type: HashMap<String, u32> = HashMap::new();

    let questions = match doc.get("questions").and_then(Value::as_array) {
        Some(a) => a.as_slice(),
        None => {
            push_err(&mut errors, "questions", "tableau « questions » manquant".into());
            &[]
        }
    };

    for (i, q) in questions.iter().enumerate() {
        let p = format!("questions[{i}]");
        if q.get("id").and_then(Value::as_str).is_none() {
            push_err(&mut errors, &format!("{p}.id"), "id manquant".into());
        }
        if q.get("prompt").and_then(Value::as_str).is_none() {
            push_err(&mut errors, &format!("{p}.prompt"), "énoncé manquant".into());
        }
        let qtype = q.get("type").and_then(Value::as_str).unwrap_or("");
        if !QUIZ_TYPES.contains(&qtype) {
            push_err(&mut errors, &format!("{p}.type"), format!("type « {qtype} » hors {QUIZ_TYPES:?}"));
        }
        *by_type.entry(qtype.to_string()).or_insert(0) += 1;
        match qtype {
            "mcq" | "qcm" => match q.get("options").and_then(Value::as_array) {
                Some(opts) if opts.len() >= 2 => {
                    let correct = opts
                        .iter()
                        .filter(|o| o.get("isCorrect").and_then(Value::as_bool).unwrap_or(false))
                        .count();
                    if correct == 0 {
                        push_err(&mut errors, &format!("{p}.options"), "aucune option correcte".into());
                    }
                    for (j, o) in opts.iter().enumerate() {
                        if o.get("id").is_none() || o.get("text").is_none() {
                            push_err(&mut errors, &format!("{p}.options[{j}]"), "option incomplète (id/text)".into());
                        }
                    }
                }
                _ => push_err(&mut errors, &format!("{p}.options"), "au moins 2 options requises".into()),
            },
            "boolean" | "vrai-faux" => {
                if q.get("isTrue").and_then(Value::as_bool).is_none() {
                    push_err(&mut errors, &format!("{p}.isTrue"), "champ isTrue requis".into());
                }
            }
            "order" => {
                if q.get("items").and_then(Value::as_array).is_none() {
                    push_err(&mut errors, &format!("{p}.items"), "tableau items requis".into());
                }
                if q.get("correctOrder").and_then(Value::as_array).is_none() {
                    push_err(&mut errors, &format!("{p}.correctOrder"), "tableau correctOrder requis".into());
                }
            }
            "error" => {
                if q.get("steps").and_then(Value::as_array).is_none() {
                    push_err(&mut errors, &format!("{p}.steps"), "tableau steps requis".into());
                }
            }
            "input" => {
                if q.get("correctAnswers").and_then(Value::as_array).is_none() {
                    push_err(&mut errors, &format!("{p}.correctAnswers"), "tableau correctAnswers requis".into());
                }
            }
            _ => {}
        }
        n_q += 1;
    }
    json!({
        "ok": true, "engine": "json", "file": name, "schema": "quiz",
        "valid": errors.is_empty(), "errors": errors, "warnings": warnings,
        "stats": { "questions": n_q, "byType": by_type }
    })
}

pub fn v_revision(doc: &Value, name: &str) -> Value {
    let mut errors = Vec::new();
    let mut warnings = Vec::new();

    match doc.get("header") {
        Some(h) if h.is_object() => {
            require_str(h, "title", &mut errors);
            optional_str(h, "subtitle", &mut errors);
            optional_str(h, "context", &mut errors);
        }
        _ => push_err(&mut errors, "header", "bloc « header » requis".into()),
    }

    let (mut n_sec, mut n_blocks, mut n_media, mut display_math, mut inline_math) = (0u32, 0u32, 0u32, 0u32, 0u32);
    if let Some(sections) = require_array(doc, "sections", &mut errors) {
        for (i, s) in sections.iter().enumerate() {
            let p = format!("sections[{i}]");
            if s.get("title").and_then(Value::as_str).is_none() {
                push_err(&mut errors, &format!("{p}.title"), "titre de section manquant".into());
            }
            let Some(blocks) = s.get("blocks").and_then(Value::as_array) else {
                push_err(&mut errors, &format!("{p}.blocks"), "tableau de blocs requis".into());
                continue;
            };
            for (j, b) in blocks.iter().enumerate() {
                let bp = format!("{p}.blocks[{j}]");
                let btype = b.get("type").and_then(Value::as_str).unwrap_or("text");
                if !BLOCK_TYPES.contains(&btype.trim()) {
                    warnings.push(json!({
                        "path": format!("{bp}.type"),
                        "message": format!("type « {btype} » inconnu (rendu générique)")
                    }));
                }
                if let Some(media) = b.get("media") {
                    validate_media_field(media, &format!("{bp}.media"), &mut errors, &mut warnings);
                    n_media += match media {
                        Value::Array(a) => a.len() as u32,
                        Value::Object(_) => 1,
                        _ => 0,
                    };
                }
                match b.get("content") {
                    Some(Value::String(c)) => {
                        display_math += c.matches("$$").count() as u32 / 2;
                        inline_math += count_inline(c);
                    }
                    Some(Value::Array(items)) => {
                        for (k, it) in items.iter().enumerate() {
                            if let Some(c) = it.as_str() {
                                display_math += c.matches("$$").count() as u32 / 2;
                                inline_math += count_inline(c);
                            } else {
                                push_err(&mut errors, &format!("{bp}.content[{k}]"), "élément de contenu non textuel".into());
                            }
                        }
                    }
                    Some(_) => push_err(&mut errors, &format!("{bp}.content"), "contenu doit être une chaîne ou un tableau de chaînes".into()),
                    None => push_err(&mut errors, &format!("{bp}.content"), "contenu manquant".into()),
                }
                n_blocks += 1;
            }
            n_sec += 1;
        }
    }

    let mut n_lex = 0u32;
    if let Some(lex) = doc.get("lexique").and_then(Value::as_array) {
        for (i, l) in lex.iter().enumerate() {
            if l.get("term").and_then(Value::as_str).is_none() {
                push_err(&mut errors, &format!("lexique[{i}].term"), "terme manquant".into());
            }
            n_lex += 1;
        }
    }

    json!({
        "ok": true, "engine": "json", "file": name, "schema": "revision",
        "valid": errors.is_empty(), "errors": errors, "warnings": warnings,
        "stats": {
            "sections": n_sec, "blocks": n_blocks, "media": n_media, "lexique": n_lex,
            "displayMath": display_math, "inlineMath": inline_math
        }
    })
}
