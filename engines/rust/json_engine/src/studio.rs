//! Module Rust Studio (`json_engine::studio`) :
//! Détection automatique de type, audit profond schéma + LaTeX par chemin JSON,
//! diff structurel avant publication et formatage canonique des ressources.

use serde_json::{json, Map, Value};
use crate::schemas::{v_class, v_exercise, v_manifest, v_quiz, v_revision};

/// Détecte le type canonique d'un document mathPlus (`revision` | `quiz` | `exercise` | `class` | `manifest`).
pub fn detect_kind(doc: &Value) -> &'static str {
    if doc.get("sections").and_then(Value::as_array).is_some() {
        "revision"
    } else if let Some(questions) = doc.get("questions").and_then(Value::as_array) {
        let first = questions.first();
        let quiz_markers = ["prompt", "question", "options", "isTrue", "items", "steps", "correctAnswers"];
        let is_quiz = first
            .and_then(Value::as_object)
            .map(|q| quiz_markers.iter().any(|m| q.contains_key(*m)))
            .unwrap_or(false);
        if is_quiz { "quiz" } else { "exercise" }
    } else if doc.get("chapters").and_then(Value::as_array).is_some() {
        "class"
    } else if doc.get("classes").and_then(Value::as_array).is_some() {
        "manifest"
    } else {
        "unknown"
    }
}

/// Vérification syntaxique LaTeX rapide pour l'audit Studio (délimiteurs, accolades, environnements).
fn lint_latex_field(text: &str, path: &str, issues: &mut Vec<Value>) -> (u32, u32, u32) {
    let mut blanks = 0u32;
    let mut tables = 0u32;
    let mut formulas = 0u32;

    blanks += text.matches("\\blank{").count() as u32
        + text.matches("\\blanck{").count() as u32
        + text.matches("\\balck{").count() as u32;
    tables += text.matches("\\begin{array}").count() as u32
        + text.matches("\\begin{tabular}").count() as u32;
    formulas += (text.matches("$$").count() / 2) as u32;

    // Parité des $$ et $
    if text.matches("$$").count() % 2 != 0 {
        issues.push(json!({ "severity": "error", "path": path, "message": "Délimiteur display $$ non fermé" }));
    }
    let stripped = text.replace("$$", "");
    let bytes = stripped.as_bytes();
    let mut singles = 0usize;
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'\\' && i + 1 < bytes.len() {
            i += 2;
            continue;
        }
        if bytes[i] == b'$' {
            singles += 1;
        }
        i += 1;
    }
    if singles % 2 != 0 {
        issues.push(json!({ "severity": "error", "path": path, "message": "Nombre impair de délimiteurs $ inline" }));
    } else {
        formulas += (singles / 2) as u32;
    }

    // Équilibre des accolades {}
    let mut braces = 0i32;
    let b2 = text.as_bytes();
    let mut k = 0;
    while k < b2.len() {
        if b2[k] == b'\\' && k + 1 < b2.len() {
            k += 2;
            continue;
        }
        if b2[k] == b'{' {
            braces += 1;
        } else if b2[k] == b'}' {
            braces -= 1;
            if braces < 0 {
                issues.push(json!({ "severity": "error", "path": path, "message": "Accolade } fermante sans ouvrante" }));
                braces = 0;
            }
        }
        k += 1;
    }
    if braces > 0 {
        issues.push(json!({ "severity": "error", "path": path, "message": format!("{braces} accolade(s) {{ non fermée(s)") }));
    }

    (formulas, blanks, tables)
}

fn scan_latex_fields(v: &Value, path: &str, issues: &mut Vec<Value>, totals: &mut (u32, u32, u32)) {
    match v {
        Value::String(s) => {
            if s.contains('$') || s.contains('\\') {
                let (f, b, t) = lint_latex_field(s, path, issues);
                totals.0 += f;
                totals.1 += b;
                totals.2 += t;
            }
        }
        Value::Array(arr) => {
            for (idx, item) in arr.iter().enumerate() {
                scan_latex_fields(item, &format!("{path}[{idx}]"), issues, totals);
            }
        }
        Value::Object(map) => {
            for (k, val) in map {
                if matches!(k.as_str(), "id" | "path" | "src" | "type" | "position" | "anchor") {
                    continue;
                }
                let next = if path.is_empty() { k.clone() } else { format!("{path}.{k}") };
                scan_latex_fields(val, &next, issues, totals);
            }
        }
        _ => {}
    }
}

/// Opération `studio-detect` : identifie le schéma et résume la structure du document.
pub fn op_studio_detect(doc: &Value, name: &str) -> Value {
    let kind = detect_kind(doc);
    let title = doc
        .get("header").and_then(|h| h.get("title")).and_then(Value::as_str)
        .or_else(|| doc.get("topic").and_then(Value::as_str))
        .or_else(|| doc.get("title").and_then(Value::as_str))
        .unwrap_or(name);
    json!({
        "ok": true,
        "engine": "json",
        "kind": kind,
        "title": title,
        "file": name,
    })
}

/// Opération `studio-audit` : validation de schéma + lint LaTeX complet + métriques Studio.
pub fn op_studio_audit(doc: &Value, name: &str) -> Value {
    let kind = detect_kind(doc);
    let schema_report = match kind {
        "revision" => v_revision(doc, name),
        "quiz" => v_quiz(doc, name),
        "exercise" => v_exercise(doc, name),
        "class" => v_class(doc, name),
        "manifest" => v_manifest(doc, name),
        _ => json!({ "valid": true, "errors": [], "warnings": [], "stats": {} }),
    };

    let mut latex_issues = Vec::new();
    let mut totals = (0u32, 0u32, 0u32); // (formulas, blanks, tables)
    scan_latex_fields(doc, "", &mut latex_issues, &mut totals);

    let schema_errors = schema_report.get("errors").and_then(Value::as_array).cloned().unwrap_or_default();
    let schema_warnings = schema_report.get("warnings").and_then(Value::as_array).cloned().unwrap_or_default();
    let valid = schema_errors.is_empty() && latex_issues.is_empty();

    json!({
        "ok": true,
        "engine": "json",
        "file": name,
        "kind": kind,
        "valid": valid,
        "schemaErrors": schema_errors,
        "schemaWarnings": schema_warnings,
        "latexIssues": latex_issues,
        "metrics": {
            "formulas": totals.0,
            "blanks": totals.1,
            "tables": totals.2,
            "schemaStats": schema_report.get("stats").cloned().unwrap_or_else(|| json!({})),
        }
    })
}

fn collect_diff(orig: &Value, draft: &Value, path: &str, out: &mut Vec<Value>) {
    if out.len() >= 80 || orig == draft {
        return;
    }
    match (orig, draft) {
        (Value::Object(a), Value::Object(b)) => {
            for (k, va) in a {
                let p = if path.is_empty() { k.clone() } else { format!("{path}.{k}") };
                match b.get(k) {
                    Some(vb) => collect_diff(va, vb, &p, out),
                    None => out.push(json!({ "op": "removed", "path": p })),
                }
            }
            for k in b.keys() {
                if !a.contains_key(k) {
                    let p = if path.is_empty() { k.clone() } else { format!("{path}.{k}") };
                    out.push(json!({ "op": "added", "path": p }));
                }
            }
        }
        (Value::Array(a), Value::Array(b)) => {
            let max_len = a.len().max(b.len());
            for i in 0..max_len {
                let p = format!("{path}[{i}]");
                match (a.get(i), b.get(i)) {
                    (Some(va), Some(vb)) => collect_diff(va, vb, &p, out),
                    (None, Some(_)) => out.push(json!({ "op": "added", "path": p })),
                    (Some(_), None) => out.push(json!({ "op": "removed", "path": p })),
                    (None, None) => {}
                }
            }
        }
        _ => {
            out.push(json!({ "op": "modified", "path": if path.is_empty() { "$" } else { path } }));
        }
    }
}

/// Opération `studio-diff` : diff structurel entre document d'origine et brouillon édité.
pub fn op_studio_diff(parsed: &Value, draft: &Value) -> Value {
    let orig = match parsed.get("original") {
        Some(Value::String(s)) => serde_json::from_str(s).unwrap_or(Value::Null),
        Some(v) => v.clone(),
        None => Value::Null,
    };
    let mut changes = Vec::new();
    collect_diff(&orig, draft, "", &mut changes);
    json!({
        "ok": true,
        "engine": "json",
        "changed": !changes.is_empty(),
        "count": changes.len(),
        "changes": changes,
    })
}

pub fn canonical_block_type(raw: &str) -> &str {
    match raw.trim().to_lowercase().as_str() {
        "methode" | "méthode" | "point_methode" => "method",
        "lemme" => "lemma",
        "corollaire" => "corollary",
        "consequence" | "conséquence" => "consequence",
        "strategie" | "stratégie" => "strategy",
        "definition" | "définition" => "definition",
        "theoreme" | "théorème" => "theorem",
        "proposition" => "proposition",
        "propriete" | "propriété" => "property",
        "demonstration" | "démonstration" | "preuve" => "proof",
        "remarque" | "note" => "remark",
        "attention" | "avertissement" => "warning",
        "intuition" => "intuition",
        "indice" | "indices" => "hint",
        "solution" => "solution",
        "probleme" | "problème" => "problem",
        "activite" | "activité" | "exploration" => "exploration",
        "technique" => "technique",
        "rappel" => "rappel",
        "resume" | "résumé" => "summary",
        "introduction" => "intro",
        "paragraphe" => "text",
        "applicaoin" | "applicaion" | "applicatoin" | "exo" => "application",
        "exemple" | "exmpale" | "exmale" => "example",
        "astuce" => "tip",
        _ => raw.trim(),
    }
}

/// Opération `studio-format` : normalise les alias de types de blocs et formate en JSON propre.
pub fn op_studio_format(doc: &Value) -> Value {
    let mut clean = doc.clone();
    let mut normalized_types = 0u32;
    if let Some(sections) = clean.get_mut("sections").and_then(Value::as_array_mut) {
        for sec in sections {
            if let Some(blocks) = sec.get_mut("blocks").and_then(Value::as_array_mut) {
                for blk in blocks {
                    if let Some(obj) = blk.as_object_mut() {
                        if let Some(t) = obj.get("type").and_then(Value::as_str).map(str::to_string) {
                            let canon = canonical_block_type(&t);
                            if canon != t {
                                obj.insert("type".into(), Value::String(canon.to_string()));
                                normalized_types += 1;
                            }
                        }
                        // Retire les clés chaînes vides facultatives (title: "")
                        let empty_keys: Vec<String> = obj
                            .iter()
                            .filter(|(k, v)| matches!(k.as_str(), "title") && v.as_str().map(|s| s.trim().is_empty()).unwrap_or(false))
                            .map(|(k, _)| k.clone())
                            .collect();
                        for k in empty_keys {
                            obj.remove(&k);
                        }
                    }
                }
            }
        }
    }
    let formatted = serde_json::to_string_pretty(&clean).unwrap_or_else(|_| clean.to_string());
    let mut res = Map::new();
    res.insert("ok".into(), json!(true));
    res.insert("engine".into(), json!("json"));
    res.insert("normalizedTypes".into(), json!(normalized_types));
    res.insert("formatted".into(), json!(formatted));
    Value::Object(res)
}

/// Convertit un titre français / LaTeX en slug d'identifiant propre (`nombres-complexes`).
pub fn slugify_str(raw: &str) -> String {
    let mut out = String::with_capacity(raw.len());
    let mut prev_dash = true;
    for ch in raw.chars() {
        let mapped = match ch {
            'à' | 'â' | 'ä' | 'À' | 'Â' | 'Ä' => Some('a'),
            'é' | 'è' | 'ê' | 'ë' | 'É' | 'È' | 'Ê' | 'Ë' => Some('e'),
            'î' | 'ï' | 'Î' | 'Ï' => Some('i'),
            'ô' | 'ö' | 'Ô' | 'Ö' => Some('o'),
            'ù' | 'û' | 'ü' | 'Ù' | 'Û' | 'Ü' => Some('u'),
            'ç' | 'Ç' => Some('c'),
            'œ' | 'Œ' => Some('o'),
            c if c.is_ascii_alphanumeric() => Some(c.to_ascii_lowercase()),
            _ => None,
        };
        if let Some(c) = mapped {
            out.push(c);
            prev_dash = false;
        } else if !prev_dash {
            out.push('-');
            prev_dash = true;
        }
    }
    while out.ends_with('-') {
        out.pop();
    }
    if out.is_empty() { "nouveau".to_string() } else { out }
}

/// Extrait le numéro final d'un identifiant ou chemin d'exercice (`ex_04` -> `Some(4)`).
pub fn extract_trailing_number(id_or_path: &str) -> Option<u32> {
    let base = id_or_path
        .rsplit('/')
        .next()
        .unwrap_or(id_or_path)
        .strip_suffix(".json")
        .unwrap_or(id_or_path);
    let digits_rev: String = base
        .chars()
        .rev()
        .take_while(|c| c.is_ascii_digit())
        .collect();
    if digits_rev.is_empty() {
        return None;
    }
    let digits: String = digits_rev.chars().rev().collect();
    digits.parse::<u32>().ok()
}

/// Opération `studio-slugify` : génère un slug normalisé depuis un titre.
pub fn op_studio_slugify(parsed: &Value) -> Value {
    let text = parsed.get("text").and_then(Value::as_str).unwrap_or("");
    json!({
        "ok": true,
        "engine": "json",
        "slug": slugify_str(text),
    })
}

/// Opération `studio-next-number` : calcule le prochain numéro d'exercice sans collision
/// (`max + 1`) ainsi que les numéros d'affichage de toute la liste (portage de `contentUtils.ts`).
pub fn op_studio_next_number(parsed: &Value) -> Value {
    let exercises = parsed
        .get("exercises")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    let class_id = parsed.get("classId").and_then(Value::as_str).unwrap_or("");
    let chapter_id = parsed.get("chapterId").and_then(Value::as_str).unwrap_or("");

    let mut max_num = 0u32;
    let mut display_numbers = Vec::with_capacity(exercises.len());

    for (idx, ex) in exercises.iter().enumerate() {
        let base_str = ex
            .get("id")
            .and_then(Value::as_str)
            .filter(|s| !s.trim().is_empty())
            .or_else(|| ex.get("path").and_then(Value::as_str))
            .unwrap_or("");
        let fallback = (idx as u32) + 1;
        if let Some(n) = extract_trailing_number(base_str) {
            if n > max_num {
                max_num = n;
            }
            display_numbers.push(Value::from(n));
        } else {
            display_numbers.push(Value::from(fallback));
        }
    }

    let next_num = max_num + 1;
    let suggested_id = format!("exercice-{next_num}");
    let suggested_topic = format!("Exercice {next_num}");
    let suggested_path = if !class_id.is_empty() && !chapter_id.is_empty() {
        format!("data/{class_id}/{chapter_id}/exercises/{suggested_id}.json")
    } else {
        format!("exercises/{suggested_id}.json")
    };

    json!({
        "ok": true,
        "engine": "json",
        "nextNumber": next_num,
        "displayNumbers": display_numbers,
        "suggestedId": suggested_id,
        "suggestedTopic": suggested_topic,
        "suggestedPath": suggested_path,
    })
}

/// Opération `studio-parse-import` : analyse un texte JSON (objet unique ou tableau de lots `[{...}]`),
/// auto-détecte le type de chaque entrée (`revision` | `quiz` | `exercise`) et retourne les diagnostics.
pub fn op_studio_parse_import(parsed: &Value) -> Value {
    let text = parsed.get("text").and_then(Value::as_str).unwrap_or("");
    let source = parsed.get("source").and_then(Value::as_str).unwrap_or("import.json");

    if text.trim().is_empty() {
        return json!({
            "ok": true,
            "engine": "json",
            "entries": [{
                "source": source,
                "kind": Value::Null,
                "error": "Fichier ou texte JSON vide",
                "content": json!({})
            }]
        });
    }

    let val: Value = match serde_json::from_str(text) {
        Ok(v) => v,
        Err(err) => {
            return json!({
                "ok": true,
                "engine": "json",
                "entries": [{
                    "source": source,
                    "kind": Value::Null,
                    "error": format!("JSON invalide : {err}"),
                    "content": json!({})
                }]
            });
        }
    };

    let items: Vec<Value> = match val {
        Value::Array(arr) => arr,
        other => vec![other],
    };

    if items.is_empty() {
        return json!({
            "ok": true,
            "engine": "json",
            "entries": [{
                "source": source,
                "kind": Value::Null,
                "error": "Aucun document JSON trouvé dans le tableau",
                "content": json!({})
            }]
        });
    }

    let total = items.len();
    let mut entries = Vec::with_capacity(total);

    for (idx, item) in items.into_iter().enumerate() {
        let item_source = if total > 1 {
            format!("{source} ({})", idx + 1)
        } else {
            source.to_string()
        };

        if !item.is_object() {
            entries.push(json!({
                "source": item_source,
                "kind": Value::Null,
                "error": "Contenu non-objet (un objet JSON est attendu)",
                "content": json!({})
            }));
            continue;
        }

        let detected = detect_kind(&item);
        let valid_kind = matches!(detected, "revision" | "quiz" | "exercise");
        if !valid_kind {
            entries.push(json!({
                "source": item_source,
                "kind": Value::Null,
                "error": "Type non reconnu (attendu : exercice, quiz ou fiche de révision)",
                "content": item
            }));
            continue;
        }

        let audit = op_studio_audit(&item, &item_source);
        let schema_errs = audit.get("schemaErrors").and_then(Value::as_array).cloned().unwrap_or_default();
        let err_msg = if !schema_errs.is_empty() {
            let first_msg = schema_errs[0].get("message").and_then(Value::as_str).unwrap_or("Erreur de schéma");
            Some(Value::String(first_msg.to_string()))
        } else {
            None
        };

        entries.push(json!({
            "source": item_source,
            "kind": detected,
            "error": err_msg.unwrap_or(Value::Null),
            "content": item
        }));
    }

    json!({
        "ok": true,
        "engine": "json",
        "entries": entries,
    })
}

/// Opération `studio-rename-doc` : renomme intelligemment une ressource selon son type
/// (`topic` pour `exercise`, `header.title` pour `revision`, `title` pour `quiz`).
pub fn op_studio_rename_doc(parsed: &Value, doc: &Value) -> Value {
    let new_name = parsed.get("newName").and_then(Value::as_str).unwrap_or("").trim();
    let kind_hint = parsed.get("kind").and_then(Value::as_str).unwrap_or("");
    let kind = if !kind_hint.is_empty() { kind_hint } else { detect_kind(doc) };

    let mut updated = doc.clone();
    if let Some(obj) = updated.as_object_mut() {
        match kind {
            "exercise" => {
                obj.insert("topic".into(), Value::String(new_name.to_string()));
            }
            "revision" => {
                let mut header = obj
                    .get("header")
                    .and_then(Value::as_object)
                    .cloned()
                    .unwrap_or_else(Map::new);
                header.insert("title".into(), Value::String(new_name.to_string()));
                obj.insert("header".into(), Value::Object(header));
            }
            _ => {
                obj.insert("title".into(), Value::String(new_name.to_string()));
            }
        }
    }
    let formatted = serde_json::to_string_pretty(&updated).unwrap_or_else(|_| updated.to_string());
    json!({
        "ok": true,
        "engine": "json",
        "kind": kind,
        "title": new_name,
        "doc": updated,
        "formatted": formatted,
    })
}
