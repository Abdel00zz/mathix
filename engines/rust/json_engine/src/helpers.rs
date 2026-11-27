//! Utilitaires partagés : validation de champs JSON, comptage LaTeX,
//! normalisation diacritique et extraction d'extrait UTF-8 sécurisée.

use serde_json::{json, Value};

pub fn push_err(errors: &mut Vec<Value>, path: &str, msg: String) {
    errors.push(json!({ "path": path, "message": msg }));
}

pub fn require_str(doc: &Value, path: &str, errors: &mut Vec<Value>) -> bool {
    match doc.get(path) {
        Some(Value::String(s)) if !s.trim().is_empty() => true,
        Some(_) => {
            push_err(errors, path, format!("« {path} » doit être une chaîne non vide"));
            false
        }
        None => {
            push_err(errors, path, format!("champ obligatoire « {path} » manquant"));
            false
        }
    }
}

pub fn require_array<'a>(
    doc: &'a Value,
    path: &str,
    errors: &mut Vec<Value>,
) -> Option<&'a Vec<Value>> {
    match doc.get(path) {
        Some(Value::Array(a)) => Some(a),
        Some(_) => {
            push_err(errors, path, format!("« {path} » doit être un tableau"));
            None
        }
        None => {
            push_err(errors, path, format!("champ obligatoire « {path} » manquant"));
            None
        }
    }
}

pub fn optional_str(doc: &Value, path: &str, errors: &mut Vec<Value>) {
    if let Some(v) = doc.get(path) {
        if !v.is_string() && !v.is_null() {
            push_err(errors, path, format!("« {path} » doit être une chaîne"));
        }
    }
}

pub fn check_path_shape(path: &str, kind: &str, errors: &mut Vec<Value>) {
    let valid = match kind {
        "exercise" => path.contains("/exercises/"),
        "quiz" => path.contains("/quiz/") || path.contains("/quizzes/"),
        "revision" => path.contains("/revisions/"),
        _ => true,
    };
    if !valid {
        push_err(errors, "path", format!("chemin {kind} non canonique : {path}"));
    }
}

/// Compte les paires `$…$` inline en ignorant les blocs `$$…$$`.
pub fn count_inline(content: &str) -> u32 {
    let mut count = 0u32;
    let mut in_display = false;
    let bytes = content.as_bytes();
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'$' {
            if i + 1 < bytes.len() && bytes[i + 1] == b'$' {
                in_display = !in_display;
                i += 2;
                continue;
            }
            if !in_display {
                count += 1;
            }
        }
        i += 1;
    }
    count / 2
}

/// Normalise les accents français et la casse pour la recherche plein texte.
pub fn norm_text(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    for c in s.to_lowercase().chars() {
        let mapped = match c {
            'à' | 'â' | 'ä' => 'a',
            'é' | 'è' | 'ê' | 'ë' => 'e',
            'î' | 'ï' => 'i',
            'ô' | 'ö' => 'o',
            'ù' | 'û' | 'ü' => 'u',
            'ç' => 'c',
            'ñ' => 'n',
            'œ' => 'o',
            'æ' => 'a',
            'ÿ' => 'y',
            _ => c,
        };
        out.push(mapped);
    }
    out
}

/// Extrait un aperçu autour de `query` en respectant strictement les frontières UTF-8.
pub fn excerpt(content: &str, query: &str, radius_chars: usize) -> String {
    let chars: Vec<char> = content.chars().collect();
    if chars.is_empty() {
        return String::new();
    }
    let norm_chars: Vec<char> = chars
        .iter()
        .map(|&c| norm_text(&c.to_string()).chars().next().unwrap_or(c))
        .collect();
    let q_chars: Vec<char> = norm_text(query).chars().collect();

    let match_pos = if q_chars.is_empty() || q_chars.len() > norm_chars.len() {
        None
    } else {
        norm_chars
            .windows(q_chars.len())
            .position(|win| win == q_chars.as_slice())
    };

    match match_pos {
        Some(pos) => {
            let start = pos.saturating_sub(radius_chars);
            let end = (pos + q_chars.len() + radius_chars).min(chars.len());
            let mut s = String::new();
            if start > 0 {
                s.push('…');
            }
            for &ch in &chars[start..end] {
                s.push(if ch == '\n' || ch == '\r' { ' ' } else { ch });
            }
            if end < chars.len() {
                s.push('…');
            }
            s
        }
        None => chars
            .iter()
            .take(radius_chars * 2)
            .map(|&ch| if ch == '\n' || ch == '\r' { ' ' } else { ch })
            .collect(),
    }
}
