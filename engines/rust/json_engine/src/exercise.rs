//! Intelligence structurelle des exercices, nettoyage des titres techniques,
//! fusion CRDT de progression et calcul de maîtrise (`json_engine::exercise`).

use serde_json::{json, Map, Value};
use std::collections::BTreeSet;

use crate::helpers::norm_text;

const ROMAN_PARTS: &[&str] = &["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"];

const TECH_PREFIXES: &[&str] = &[
    "ex-", "ex_", "exo-", "exo_", "exercice-", "exercice_", "exercise-", "exercise_",
    "fiche-", "fiche_", "rev-", "rev_", "quiz-", "quiz_", "prob-", "prob_",
    "exam-", "exam_", "ch-", "ch_", "chap-", "chap_", "q-", "q_", "sq-", "sq_",
    "doc-", "doc_", "file-", "file_", "item-", "item_",
];

/// Détecte si une chaîne ressemble à un identifiant technique, un slug de fichier
/// JSON (`ex-func-rat-001`, `ex-cont-02`, `ex_01.json`) ou un libellé générique
/// redondant (`Exercice 1`).
pub fn is_technical_or_generic_title(raw: &str, id_hint: &str, path_hint: &str) -> bool {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return true;
    }

    let lower = trimmed.to_lowercase();

    // Extensions de fichiers ou chemins
    if lower.ends_with(".json")
        || lower.ends_with(".tex")
        || lower.ends_with(".md")
        || lower.ends_with(".html")
        || trimmed.contains('/')
        || trimmed.contains('\\')
    {
        return true;
    }

    // Identique à l'id technique ou au stem du fichier JSON
    let id_clean = id_hint.trim().to_lowercase();
    if !id_clean.is_empty() && lower == id_clean {
        return true;
    }
    if !path_hint.trim().is_empty() {
        let base = path_hint
            .trim()
            .rsplit('/')
            .next()
            .unwrap_or("")
            .to_lowercase();
        let stem = base.strip_suffix(".json").unwrap_or(&base);
        if !base.is_empty() && (lower == base || lower == stem) {
            return true;
        }
    }

    // Générique redondant : "Exercice 1", "Ex 2", "Ex. 03"
    if is_generic_exercise_label(&lower) {
        return true;
    }

    // Si la chaîne contient un espace, des maths ($ / \) ou des accents français,
    // il s'agit quasiment toujours d'un vrai titre humain.
    if trimmed.contains(' ') || trimmed.contains('$') || trimmed.contains('\\') {
        return false;
    }

    // Jeton unique sans espace : détecter les slugs / identifiants techniques
    if TECH_PREFIXES.iter().any(|p| lower.starts_with(p)) {
        return true;
    }

    let has_non_ascii = trimmed.chars().any(|c| !c.is_ascii());
    if has_non_ascii {
        return false;
    }

    let has_sep = trimmed.contains('-') || trimmed.contains('_');
    let has_digit = trimmed.chars().any(|c| c.is_ascii_digit());
    let all_slug_chars = trimmed
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_' || c == '.');

    // ex-func-rat-001, cont_02, func-rat-01, s1_q3
    if all_slug_chars && has_sep && (has_digit || trimmed.contains('_')) {
        return true;
    }

    // Slug entièrement minuscule composé de 3+ segments séparés par '-' (ex: "func-rat-lim")
    if all_slug_chars && trimmed == lower && trimmed.matches('-').count() >= 2 {
        return true;
    }

    // Code court alphanumérique avec chiffres uniquement (ex: "ex01", "q12", "s2b3")
    if all_slug_chars && has_digit && trimmed.len() <= 10 && trimmed == lower {
        return true;
    }

    false
}

fn is_generic_exercise_label(lower: &str) -> bool {
    let rest = if let Some(r) = lower.strip_prefix("exercice") {
        r
    } else if let Some(r) = lower.strip_prefix("exercise") {
        r
    } else if let Some(r) = lower.strip_prefix("exo") {
        r
    } else if let Some(r) = lower.strip_prefix("ex.") {
        r
    } else if let Some(r) = lower.strip_prefix("ex ") {
        r
    } else {
        return false;
    };
    let tail = rest.trim_start_matches(|c: char| c.is_whitespace() || c == '.' || c == '-' || c == '_' || c == '#' || c == '°' || c == 'n');
    !tail.is_empty() && tail.chars().all(|c| c.is_ascii_digit())
}

/// Nettoie et valide un titre d'affichage humain ; renvoie `None` s'il s'agit
/// d'un identifiant technique, d'un nom de fichier JSON ou d'un libellé redondant.
pub fn sanitize_display_title(raw: &str, id_hint: &str, path_hint: &str) -> Option<String> {
    let trimmed = raw.trim();
    if is_technical_or_generic_title(trimmed, id_hint, path_hint) {
        None
    } else {
        Some(trimmed.to_string())
    }
}

/// Normalise une difficulté (nombre 1..5 ou libellé FR/EN) en `(étoiles, libellé FR)`.
pub fn parse_difficulty(val: Option<&Value>) -> (u32, &'static str) {
    let Some(v) = val else {
        return (0, "");
    };
    if let Some(n) = v.as_f64() {
        if n.is_finite() && n > 0.0 {
            let stars = (n.round() as i64).clamp(1, 5) as u32;
            let label = match stars {
                1 => "Facile",
                2 => "Accessible",
                3 => "Moyen",
                4 => "Soutenu",
                _ => "Difficile",
            };
            return (stars, label);
        }
    }
    if let Some(s) = v.as_str() {
        let trimmed = s.trim();
        if trimmed.is_empty() {
            return (0, "");
        }
        if let Ok(n) = trimmed.parse::<f64>() {
            if n.is_finite() && n > 0.0 {
                let stars = (n.round() as i64).clamp(1, 5) as u32;
                let label = match stars {
                    1 => "Facile",
                    2 => "Accessible",
                    3 => "Moyen",
                    4 => "Soutenu",
                    _ => "Difficile",
                };
                return (stars, label);
            }
        }
        let norm = norm_text(trimmed);
        return match norm.as_str() {
            "facile" | "easy" | "simple" | "debutant" | "base" => (1, "Facile"),
            "assez facile" | "accessible" => (2, "Accessible"),
            "moyen" | "moyenne" | "medium" | "intermediaire" | "standard" => (3, "Moyen"),
            "assez difficile" | "soutenu" | "avance" => (4, "Soutenu"),
            "difficile" | "hard" | "expert" => (5, "Difficile"),
            "concours" | "olympiade" | "olympiades" => (5, "Concours"),
            _ => (0, ""),
        };
    }
    (0, "")
}

/// Formate un libellé de partie (`Partie I`, `Partie II` ou `Partie A`, `Partie B`).
fn format_part_label(part_num: usize, node_id: &str) -> String {
    let id_trim = node_id.trim();
    let stripped = id_trim
        .strip_prefix('p')
        .or_else(|| id_trim.strip_prefix('P'))
        .unwrap_or(id_trim);
    let is_roman = ROMAN_PARTS
        .iter()
        .any(|r| r.eq_ignore_ascii_case(stripped));
    if is_roman && part_num >= 1 && part_num <= ROMAN_PARTS.len() {
        return format!("Partie {}", ROMAN_PARTS[part_num - 1]);
    }
    let mut rest = part_num;
    let mut letters = String::new();
    while rest > 0 {
        let rem = (rest - 1) % 26;
        letters.insert(0, (b'A' + rem as u8) as char);
        rest = (rest - 1) / 26;
    }
    if letters.is_empty() {
        format!("Partie {part_num}")
    } else {
        format!("Partie {letters}")
    }
}

/// Opération `sanitize-title` : vérifie et nettoie un titre d'affichage côté Rust.
pub fn op_sanitize_title(req: &Value) -> Value {
    let title = req.get("title").and_then(Value::as_str).unwrap_or("");
    let id_hint = req.get("id").and_then(Value::as_str).unwrap_or("");
    let path_hint = req.get("path").and_then(Value::as_str).unwrap_or("");
    let sanitized = sanitize_display_title(title, id_hint, path_hint);
    let is_technical = sanitized.is_none() && !title.trim().is_empty();
    json!({
        "ok": true,
        "engine": "json",
        "title": sanitized.unwrap_or_default(),
        "isTechnical": is_technical,
    })
}

/// Opération `exercise-outline` : numérotation canonique, métadonnées sûres
/// (sans jamais fuiter d'identifiant technique JSON) et estimation cognitive.
pub fn op_exercise_outline(doc: &Value, req: &Value) -> Value {
    let id = doc.get("id").and_then(Value::as_str).unwrap_or("");
    let path_hint = req.get("path").and_then(Value::as_str).unwrap_or("");
    let raw_topic = doc.get("topic").and_then(Value::as_str).unwrap_or("");
    let display_topic = sanitize_display_title(raw_topic, id, path_hint);
    let is_technical_topic = display_topic.is_none() && !raw_topic.trim().is_empty();

    let (diff_stars, diff_label) = parse_difficulty(doc.get("difficulty"));

    let mut nodes_out: Vec<Value> = Vec::new();
    let mut part = 0usize;
    let mut question_num = 0usize;
    let mut sub_question_total = 0usize;
    let mut hint_count = 0usize;
    let mut correction_count = 0usize;

    if let Some(questions) = doc.get("questions").and_then(Value::as_array) {
        for (index, node) in questions.iter().enumerate() {
            let raw_type = node
                .get("type")
                .and_then(Value::as_str)
                .unwrap_or("")
                .trim()
                .to_lowercase();

            if raw_type == "partie" || raw_type == "header" {
                part += 1;
                let node_id = node.get("id").and_then(Value::as_str).unwrap_or("");
                let label = format_part_label(part, node_id);
                nodes_out.push(json!({
                    "index": index,
                    "kind": "part",
                    "part": part,
                    "partLabel": label,
                    "question": 0,
                    "subCount": 0,
                }));
                continue;
            }

            if raw_type == "text" {
                nodes_out.push(json!({
                    "index": index,
                    "kind": "text",
                    "part": part,
                    "partLabel": "",
                    "question": 0,
                    "subCount": 0,
                }));
                continue;
            }

            let subs = node.get("subQuestions").and_then(Value::as_array);
            let sub_len = subs.map(|a| a.len()).unwrap_or(0);
            let has_text = node
                .get("content")
                .and_then(Value::as_str)
                .map(|s| !s.trim().is_empty())
                .unwrap_or(false);
            let has_media = node.get("media").map(|m| !m.is_null()).unwrap_or(false);

            if sub_len == 0 && !has_text && !has_media {
                nodes_out.push(json!({
                    "index": index,
                    "kind": "empty",
                    "part": part,
                    "partLabel": "",
                    "question": 0,
                    "subCount": 0,
                }));
                continue;
            }

            question_num += 1;
            let mut q_hints = 0usize;
            let mut q_corrs = 0usize;
            if let Some(sub_arr) = subs {
                if !sub_arr.is_empty() {
                    sub_question_total += sub_arr.len();
                    for sq in sub_arr {
                        if sq.get("hint").and_then(Value::as_str).map(|s| !s.trim().is_empty()).unwrap_or(false) {
                            q_hints += 1;
                        }
                        if sq.get("correction").and_then(Value::as_str).map(|s| !s.trim().is_empty()).unwrap_or(false) {
                            q_corrs += 1;
                        }
                    }
                } else {
                    sub_question_total += 1;
                }
            } else {
                sub_question_total += 1;
                if node.get("hint").and_then(Value::as_str).map(|s| !s.trim().is_empty()).unwrap_or(false) {
                    q_hints += 1;
                }
                if node.get("correction").and_then(Value::as_str).map(|s| !s.trim().is_empty()).unwrap_or(false) {
                    q_corrs += 1;
                }
            }

            hint_count += q_hints;
            correction_count += q_corrs;

            nodes_out.push(json!({
                "index": index,
                "kind": "question",
                "part": part,
                "partLabel": "",
                "question": question_num,
                "subCount": sub_len.max(1),
                "hasHint": q_hints > 0,
                "hasCorrection": q_corrs > 0,
            }));
        }
    }

    let has_context = doc
        .get("context")
        .and_then(Value::as_str)
        .map(|s| !s.trim().is_empty())
        .unwrap_or(false);
    let has_media = doc.get("media").map(|m| !m.is_null()).unwrap_or(false);
    let requires_redaction = doc
        .get("requiresRedaction")
        .and_then(Value::as_bool)
        .unwrap_or(false);

    // Estimation cognitive de durée (minutes)
    let diff_factor: f64 = match diff_stars {
        1 => 0.85,
        2 => 1.0,
        3 => 1.2,
        4 => 1.45,
        5 => 1.75,
        _ => 1.1,
    };
    let base_min = (sub_question_total.max(question_num).max(1) as f64) * 3.0
        + if has_context { 2.0 } else { 0.0 }
        + if requires_redaction { 2.0 } else { 0.0 };
    let estimated_minutes = (base_min * diff_factor).round().max(3.0) as u32;

    json!({
        "ok": true,
        "engine": "json",
        "displayTopic": display_topic.unwrap_or_default(),
        "isTechnicalTopic": is_technical_topic,
        "difficultyStars": diff_stars,
        "difficultyLabel": diff_label,
        "partCount": part,
        "questionCount": question_num,
        "subQuestionCount": sub_question_total,
        "hintCount": hint_count,
        "correctionCount": correction_count,
        "hasContext": has_context,
        "hasMedia": has_media,
        "estimatedMinutes": estimated_minutes,
        "nodes": nodes_out,
    })
}

/* ── Fusion CRDT déterministe sans perte pour les 4 namespaces de progression ─ */

fn val_f64(v: Option<&Value>) -> f64 {
    v.and_then(Value::as_f64).unwrap_or(0.0)
}

fn val_u64(v: Option<&Value>) -> u64 {
    v.and_then(Value::as_u64).unwrap_or(0)
}

fn val_bool(v: Option<&Value>) -> bool {
    v.and_then(Value::as_bool).unwrap_or(false)
}

fn merge_string_sets(a: Option<&Value>, b: Option<&Value>) -> Value {
    let mut set: BTreeSet<String> = BTreeSet::new();
    for src in [a, b].into_iter().flatten() {
        if let Some(arr) = src.as_array() {
            for item in arr {
                if let Some(s) = item.as_str() {
                    set.insert(s.to_string());
                } else if let Some(n) = item.as_i64() {
                    set.insert(n.to_string());
                }
            }
        }
    }
    Value::Array(set.into_iter().map(Value::String).collect())
}

fn merge_revision(local: &Map<String, Value>, remote: &Map<String, Value>) -> Value {
    let mut out = local.clone();
    for (ch_key, r_val) in remote {
        let Some(r_obj) = r_val.as_object() else { continue };
        let Some(l_obj) = out.get(ch_key).and_then(Value::as_object) else {
            out.insert(ch_key.clone(), r_val.clone());
            continue;
        };

        let mut merged = l_obj.clone();
        for (k, v) in r_obj {
            merged.insert(k.clone(), v.clone());
        }

        // Max monotone des pourcentages par fiche
        let mut sheets = l_obj
            .get("sheets")
            .and_then(Value::as_object)
            .cloned()
            .unwrap_or_default();
        if let Some(r_sheets) = r_obj.get("sheets").and_then(Value::as_object) {
            for (sid, r_pct) in r_sheets {
                let prev = val_f64(sheets.get(sid));
                let next = val_f64(Some(r_pct));
                sheets.insert(sid.clone(), json!(prev.max(next).round() as i64));
            }
        }
        merged.insert("sheets".to_string(), Value::Object(sheets));

        // Union ensembliste des blancs révélés (supporte format bool-map {id: true} ET tableau [id])
        let mut blanks = l_obj
            .get("blanks")
            .and_then(Value::as_object)
            .cloned()
            .unwrap_or_default();
        if let Some(r_blanks) = r_obj.get("blanks").and_then(Value::as_object) {
            for (sid, r_val) in r_blanks {
                if r_val.is_array() || blanks.get(sid).map(Value::is_array).unwrap_or(false) {
                    let union = merge_string_sets(blanks.get(sid), Some(r_val));
                    blanks.insert(sid.clone(), union);
                } else if r_val.as_bool() == Some(true) {
                    blanks.insert(sid.clone(), json!(true));
                }
            }
        }
        merged.insert("blanks".to_string(), Value::Object(blanks));

        let last_at = val_u64(l_obj.get("lastActiveAt")).max(val_u64(r_obj.get("lastActiveAt")));
        merged.insert("lastActiveAt".to_string(), json!(last_at));

        out.insert(ch_key.clone(), Value::Object(merged));
    }
    Value::Object(out)
}

fn merge_quiz(local: &Map<String, Value>, remote: &Map<String, Value>) -> Value {
    let mut out = local.clone();
    for (ch_key, r_val) in remote {
        let Some(r_obj) = r_val.as_object() else { continue };
        let Some(l_obj) = out.get(ch_key).and_then(Value::as_object) else {
            out.insert(ch_key.clone(), r_val.clone());
            continue;
        };

        let mut merged = l_obj.clone();
        for (k, v) in r_obj {
            merged.insert(k.clone(), v.clone());
        }

        // Union dédupliquée & triée chronologiquement de l'historique des tentatives
        let mut dedup: Map<String, Value> = Map::new();
        for src in [l_obj.get("history"), r_obj.get("history")].into_iter().flatten() {
            if let Some(arr) = src.as_array() {
                for item in arr {
                    if let Some(h) = item.as_object() {
                        let qid = h.get("quizId").and_then(Value::as_str).unwrap_or("q");
                        let at = val_u64(h.get("at"));
                        let pct = val_u64(h.get("pct"));
                        dedup.insert(format!("{qid}-{at}-{pct}"), item.clone());
                    }
                }
            }
        }
        let mut history: Vec<Value> = dedup.into_values().collect();
        history.sort_by_key(|h| val_u64(h.get("at")));

        let answered_pct = val_u64(l_obj.get("answeredPct")).max(val_u64(r_obj.get("answeredPct")));
        let is_submitted = val_bool(l_obj.get("isSubmitted"))
            || val_bool(r_obj.get("isSubmitted"))
            || !history.is_empty();
        let last_at = val_u64(l_obj.get("lastActiveAt")).max(val_u64(r_obj.get("lastActiveAt")));

        merged.insert("history".to_string(), Value::Array(history));
        merged.insert("answeredPct".to_string(), json!(answered_pct));
        merged.insert("isSubmitted".to_string(), json!(is_submitted));
        merged.insert("lastActiveAt".to_string(), json!(last_at));

        out.insert(ch_key.clone(), Value::Object(merged));
    }
    Value::Object(out)
}

fn merge_exercises(local: &Map<String, Value>, remote: &Map<String, Value>) -> Value {
    let mut out = local.clone();
    for (ch_key, r_val) in remote {
        let Some(r_obj) = r_val.as_object() else { continue };
        let Some(l_obj) = out.get(ch_key).and_then(Value::as_object) else {
            out.insert(ch_key.clone(), r_val.clone());
            continue;
        };

        let mut merged = l_obj.clone();
        for (k, v) in r_obj {
            merged.insert(k.clone(), v.clone());
        }

        let mut ex_map = l_obj
            .get("exercises")
            .and_then(Value::as_object)
            .cloned()
            .unwrap_or_default();
        if let Some(r_ex_map) = r_obj.get("exercises").and_then(Value::as_object) {
            for (ex_id, r_ex) in r_ex_map {
                let Some(r_ex_obj) = r_ex.as_object() else { continue };
                let Some(l_ex_obj) = ex_map.get(ex_id).and_then(Value::as_object) else {
                    ex_map.insert(ex_id.clone(), r_ex.clone());
                    continue;
                };

                let l_at = val_u64(l_ex_obj.get("lastActiveAt"));
                let r_at = val_u64(r_ex_obj.get("lastActiveAt"));
                let (older, newer) = if r_at >= l_at {
                    (l_ex_obj, r_ex_obj)
                } else {
                    (r_ex_obj, l_ex_obj)
                };

                let mut ex_merged = older.clone();
                for (k, v) in newer {
                    ex_merged.insert(k.clone(), v.clone());
                }
                // Préserve une évaluation si la version plus récente n'a fait qu'ouvrir le corrigé
                if ex_merged.get("evaluated").map(Value::is_null).unwrap_or(true) {
                    if let Some(ev) = older.get("evaluated") {
                        if !ev.is_null() {
                            ex_merged.insert("evaluated".to_string(), ev.clone());
                        }
                    }
                }
                let corr_viewed = val_bool(l_ex_obj.get("correctionsViewed"))
                    || val_bool(r_ex_obj.get("correctionsViewed"));
                ex_merged.insert("correctionsViewed".to_string(), json!(corr_viewed));
                ex_merged.insert("lastActiveAt".to_string(), json!(l_at.max(r_at)));
                ex_map.insert(ex_id.clone(), Value::Object(ex_merged));
            }
        }
        merged.insert("exercises".to_string(), Value::Object(ex_map));
        let last_at = val_u64(l_obj.get("lastActiveAt")).max(val_u64(r_obj.get("lastActiveAt")));
        merged.insert("lastActiveAt".to_string(), json!(last_at));

        out.insert(ch_key.clone(), Value::Object(merged));
    }
    Value::Object(out)
}

fn merge_core(local: &Map<String, Value>, remote: &Map<String, Value>) -> Value {
    let mut out = local.clone();
    for (k, v) in remote {
        out.insert(k.clone(), v.clone());
    }

    // Sticky unlocks (OR logique monotone)
    let mut sticky = local
        .get("sticky")
        .and_then(Value::as_object)
        .cloned()
        .unwrap_or_default();
    if let Some(r_sticky) = remote.get("sticky").and_then(Value::as_object) {
        for (k, r_st) in r_sticky {
            let l_st = sticky.get(k);
            let q = val_bool(l_st.and_then(|v| v.get("quiz"))) || val_bool(r_st.get("quiz"));
            let e = val_bool(l_st.and_then(|v| v.get("exercises")))
                || val_bool(r_st.get("exercises"));
            sticky.insert(k.clone(), json!({ "quiz": q, "exercises": e }));
        }
    }
    out.insert("sticky".to_string(), Value::Object(sticky));

    // Cadre référentiel : union ensembliste par classe (masteredSkills + cadre hérité)
    for field in ["masteredSkills", "cadre"] {
        let mut skills = local
            .get(field)
            .and_then(Value::as_object)
            .cloned()
            .unwrap_or_default();
        if let Some(r_skills) = remote.get(field).and_then(Value::as_object) {
            for (cls_id, r_arr) in r_skills {
                let union = merge_string_sets(skills.get(cls_id), Some(r_arr));
                skills.insert(cls_id.clone(), union);
            }
        }
        if !skills.is_empty() {
            out.insert(field.to_string(), Value::Object(skills));
        }
    }

    // Concours (max monotone par école & session)
    let mut concours = local
        .get("concours")
        .and_then(Value::as_object)
        .cloned()
        .unwrap_or_default();
    if let Some(r_concours) = remote.get("concours").and_then(Value::as_object) {
        for (sch_id, r_sch) in r_concours {
            let Some(r_sch_obj) = r_sch.as_object() else { continue };
            let mut l_sch_obj = concours
                .get(sch_id)
                .and_then(Value::as_object)
                .cloned()
                .unwrap_or_default();
            for (k, r_rec) in r_sch_obj {
                if let Some(l_rec) = l_sch_obj.get(k) {
                    let best = val_u64(l_rec.get("bestPct")).max(val_u64(r_rec.get("bestPct")));
                    let attempts = val_u64(l_rec.get("attempts")).max(val_u64(r_rec.get("attempts")));
                    let last_at = val_u64(l_rec.get("lastAt")).max(val_u64(r_rec.get("lastAt")));
                    l_sch_obj.insert(
                        k.clone(),
                        json!({ "bestPct": best, "attempts": attempts, "lastAt": last_at }),
                    );
                } else {
                    l_sch_obj.insert(k.clone(), r_rec.clone());
                }
            }
            concours.insert(sch_id.clone(), Value::Object(l_sch_obj));
        }
    }
    out.insert("concours".to_string(), Value::Object(concours));

    Value::Object(out)
}

/// Opération `merge-progress` : fusion CRDT sans perte d'un namespace élève.
pub fn op_merge_progress(req: &Value) -> Value {
    let ns = req.get("namespace").and_then(Value::as_str).unwrap_or("");
    let local_map = req
        .get("local")
        .and_then(Value::as_object)
        .cloned()
        .unwrap_or_default();
    let remote_map = req
        .get("remote")
        .and_then(Value::as_object)
        .cloned()
        .unwrap_or_default();

    let merged = match ns {
        "progress-revision" => merge_revision(&local_map, &remote_map),
        "progress-quiz" => merge_quiz(&local_map, &remote_map),
        "progress-exercises" => merge_exercises(&local_map, &remote_map),
        "progress-core" => merge_core(&local_map, &remote_map),
        _ => {
            return json!({
                "ok": false,
                "error": format!("namespace de progression inconnu « {ns} »")
            });
        }
    };

    json!({
        "ok": true,
        "engine": "json",
        "namespace": ns,
        "merged": merged,
    })
}

/// Opération `chapter-mastery` : calcul pondéré de maîtrise & recommandation adaptative.
pub fn op_chapter_mastery(req: &Value) -> Value {
    let has_rev = val_bool(req.get("hasRevision"));
    let has_quiz = val_bool(req.get("hasQuiz"));
    let ex_total = val_u64(req.get("exerciseTotal"));

    let rev_pct = val_f64(req.get("revPct")).clamp(0.0, 100.0);
    let quiz_best = val_f64(req.get("quizBestPct")).clamp(0.0, 100.0);
    let quiz_answered = val_f64(req.get("quizAnsweredPct")).clamp(0.0, 100.0);
    let quiz_submitted = val_bool(req.get("quizSubmitted"));

    let mut ex_done = 0u64;
    let mut ex_hard = 0u64;
    let mut ex_quality_sum = 0.0f64;

    if let Some(ex_map) = req.get("exercises").and_then(Value::as_object) {
        for rec in ex_map.values() {
            if let Some(ev) = rec.get("evaluated").and_then(Value::as_str) {
                ex_done += 1;
                match ev {
                    "easy" => ex_quality_sum += 100.0,
                    "medium" => ex_quality_sum += 82.0,
                    "hard" => {
                        ex_quality_sum += 55.0;
                        ex_hard += 1;
                    }
                    _ => ex_quality_sum += 75.0,
                }
            }
        }
    }

    let mut weight_sum = 0.0;
    let mut score_sum = 0.0;
    if has_rev {
        weight_sum += 0.30;
        score_sum += 0.30 * rev_pct;
    }
    if has_quiz {
        weight_sum += 0.30;
        let q_eff = if quiz_submitted {
            quiz_best
        } else {
            quiz_answered * 0.6
        };
        score_sum += 0.30 * q_eff;
    }
    if ex_total > 0 {
        weight_sum += 0.40;
        let completion = ((ex_done as f64) / (ex_total as f64)).min(1.0);
        let quality = if ex_done > 0 {
            ex_quality_sum / (ex_done as f64)
        } else {
            0.0
        };
        score_sum += 0.40 * (completion * quality);
    }

    let mastery = if weight_sum > 0.0 {
        (score_sum / weight_sum).round().clamp(0.0, 100.0) as u32
    } else {
        0
    };

    let level = match mastery {
        0..=24 => "debutant",
        25..=59 => "en_cours",
        60..=84 => "solide",
        _ => "maitrise",
    };

    let (next_action, recommendation) = if has_rev && rev_pct < 60.0 {
        ("revision", "Poursuivre la fiche de révision")
    } else if has_quiz && (!quiz_submitted || quiz_best < 70.0) {
        ("quiz", "Consolider les acquis avec le quiz")
    } else if ex_total > 0 && ex_done < ex_total {
        ("exercises", "Continuer la série d'exercices")
    } else if ex_hard > 0 {
        ("review_hard", "Retravailler les exercices jugés difficiles")
    } else {
        ("complete", "Chapitre maîtrisé — prêt pour les annales")
    };

    json!({
        "ok": true,
        "engine": "json",
        "masteryScore": mastery,
        "level": level,
        "exercisesDone": ex_done,
        "exercisesHard": ex_hard,
        "nextAction": next_action,
        "recommendation": recommendation,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_raw_json_ids_and_preserves_human_topics() {
        assert_eq!(sanitize_display_title("ex-func-rat-001", "ex-func-rat-001", ""), None);
        assert_eq!(sanitize_display_title("ex-cont-02", "", ""), None);
        assert_eq!(sanitize_display_title("ex_cont_03.json", "", ""), None);
        assert_eq!(sanitize_display_title("Exercice 2", "", ""), None);
        assert_eq!(sanitize_display_title("func-rat-lim", "", ""), None);
        assert_eq!(
            sanitize_display_title("Analyse - Fonctions", "ex-func-rat-001", "data/c/ch/exercises/ex_cont_01.json"),
            Some("Analyse - Fonctions".to_string())
        );
        assert_eq!(
            sanitize_display_title("Analyse", "ex-cont-02", ""),
            Some("Analyse".to_string())
        );
        assert_eq!(
            sanitize_display_title("Étude de $f(x) = e^x - x$", "ex_01", ""),
            Some("Étude de $f(x) = e^x - x$".to_string())
        );
    }

    #[test]
    fn builds_complete_exercise_outline_with_roman_and_alpha_parts() {
        let doc = json!({
            "id": "ex-exp-01",
            "topic": "Fonction auxiliaire et asymptotes",
            "difficulty": "difficile",
            "context": "Soit $g$ définie sur $\\mathbb{R}$.",
            "questions": [
                { "id": "pI", "type": "header", "content": "Étude de $g$" },
                { "id": "q1", "content": "Calculer $g(0)$.", "hint": "Remplacer $x$ par $0$." },
                { "id": "empty", "content": "   " },
                { "id": "note", "type": "text", "content": "On admet la suite." },
                { "id": "pII", "type": "partie", "content": "Étude de $f$" },
                { "id": "q2", "content": "Limites", "subQuestions": [
                    { "id": "a", "content": "En $+\\infty$", "correction": "$+\\infty$" },
                    { "id": "b", "content": "En $-\\infty$", "hint": "Factoriser", "correction": "$0$" }
                ]}
            ]
        });
        let out = op_exercise_outline(&doc, &json!({}));
        assert_eq!(out["ok"], true);
        assert_eq!(out["displayTopic"], "Fonction auxiliaire et asymptotes");
        assert_eq!(out["difficultyStars"], 5);
        assert_eq!(out["difficultyLabel"], "Difficile");
        assert_eq!(out["partCount"], 2);
        assert_eq!(out["questionCount"], 2);
        assert_eq!(out["subQuestionCount"], 3);
        assert_eq!(out["hintCount"], 2);
        assert_eq!(out["correctionCount"], 2);
        assert_eq!(out["nodes"][0]["partLabel"], "Partie I");
        assert_eq!(out["nodes"][4]["partLabel"], "Partie II");
        assert_eq!(out["nodes"][5]["question"], 2);
    }

    #[test]
    fn merges_progress_losslessly_across_devices() {
        let local = json!({
            "2bac::cont": {
                "sheets": { "f1": 40, "f2": 80 },
                "blanks": { "f1": ["b1", "b2"] },
                "lastActiveAt": 100
            }
        });
        let remote = json!({
            "2bac::cont": {
                "sheets": { "f1": 90, "f2": 30 },
                "blanks": { "f1": ["b2", "b3"] },
                "lastActiveAt": 250
            }
        });
        let res = op_merge_progress(&json!({
            "namespace": "progress-revision",
            "local": local,
            "remote": remote
        }));
        assert_eq!(res["ok"], true);
        assert_eq!(res["merged"]["2bac::cont"]["sheets"]["f1"], 90);
        assert_eq!(res["merged"]["2bac::cont"]["sheets"]["f2"], 80);
        assert_eq!(res["merged"]["2bac::cont"]["blanks"]["f1"].as_array().unwrap().len(), 3);
        assert_eq!(res["merged"]["2bac::cont"]["lastActiveAt"], 250);

        // Boolean-map blanks (format natif du store élève) sont fusionnés sans perte
        let rev_map_merge = op_merge_progress(&json!({
            "namespace": "progress-revision",
            "local": { "2bac::lim": { "sheets": { "f1": 50 }, "blanks": { "b1": true }, "lastActiveAt": 10 } },
            "remote": { "2bac::lim": { "sheets": { "f1": 70 }, "blanks": { "b2": true }, "lastActiveAt": 20 } }
        }));
        assert_eq!(rev_map_merge["merged"]["2bac::lim"]["blanks"]["b1"], true);
        assert_eq!(rev_map_merge["merged"]["2bac::lim"]["blanks"]["b2"], true);

        // masteredSkills (Cadre référentiel) fusionné par union ensembliste sans écrasement
        let core_merge = op_merge_progress(&json!({
            "namespace": "progress-core",
            "local": { "masteredSkills": { "2eme-bac-sc-math": ["sk-1", "sk-2"] } },
            "remote": { "masteredSkills": { "2eme-bac-sc-math": ["sk-2", "sk-3"] } }
        }));
        let ms = core_merge["merged"]["masteredSkills"]["2eme-bac-sc-math"].as_array().unwrap();
        assert_eq!(ms.len(), 3);
    }

    #[test]
    fn computes_weighted_chapter_mastery_and_recommendation() {
        let res = op_chapter_mastery(&json!({
            "hasRevision": true,
            "hasQuiz": true,
            "exerciseTotal": 4,
            "revPct": 100,
            "quizSubmitted": true,
            "quizBestPct": 85,
            "exercises": {
                "e1": { "evaluated": "easy" },
                "e2": { "evaluated": "hard" }
            }
        }));
        assert_eq!(res["ok"], true);
        assert_eq!(res["exercisesDone"], 2);
        assert_eq!(res["exercisesHard"], 1);
        assert_eq!(res["nextAction"], "exercises");
        assert!(res["masteryScore"].as_u64().unwrap() >= 65);
    }
}
