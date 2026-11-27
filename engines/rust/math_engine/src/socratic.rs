//! Moteur typographique et socratique (`math_engine::socratic`) :
//! 1. Extrait `\mathqst{…}` ou met en relief le concept mathématique central d'une question socratique française.
//! 2. Calcule le temps de lecture pondéré et l'indice de densité mathématique.

use serde_json::{json, Value};

/// Marqueurs grammaticaux français précédant le concept clé d'une question de cours.
const SOCRATIC_MARKERS: &[&str] = &[
    "est-elle ",
    "est-il ",
    "sont-elles ",
    "sont-ils ",
    "dit-on qu'une fonction est ",
    "dit-on qu'une suite est ",
    "dit-on que ",
    "qu'est-ce que ",
    "qu'est-ce qu'",
    "que signifie ",
    "à quelle condition ",
    "a quelle condition ",
    "dans quel cas ",
    "quelles sont ",
    "quelle est ",
    "quels sont ",
    "quel est ",
    "quelles fonctions sont ",
    "comment calculer ",
    "comment déterminer ",
    "comment determiner ",
    "comment montrer ",
    "comment prouver ",
    "comment étudier ",
    "comment etudier ",
    "comment résoudre ",
    "comment resoudre ",
    "comment justifier ",
    "comment ",
    "pourquoi ",
    "quand ",
];

fn extract_explicit_mathqst(s: &str) -> Option<(String, String, String)> {
    let idx = s.find("\\mathqst{")?;
    let bytes = s.as_bytes();
    let mut depth = 1usize;
    let mut i = idx + 9;
    while i < bytes.len() && depth > 0 {
        if bytes[i] == b'\\' && i + 1 < bytes.len() {
            i += 2;
            continue;
        }
        if bytes[i] == b'{' {
            depth += 1;
        } else if bytes[i] == b'}' {
            depth -= 1;
            if depth == 0 {
                break;
            }
        }
        i += 1;
    }
    if depth != 0 {
        return None;
    }
    let raw_prefix = s[..idx].trim_end_matches(|c: char| c == '\\' || c.is_whitespace());
    let focus = s[idx + 9..i].trim();
    let suffix = if i + 1 < s.len() { s[i + 1..].trim() } else { "" };
    if focus.is_empty() {
        return None;
    }
    let prefix = if raw_prefix.is_empty() {
        String::new()
    } else {
        format!("{raw_prefix} ")
    };
    let full_focus = if suffix.is_empty() {
        focus.to_string()
    } else {
        format!("{focus} {suffix}")
    };
    Some((prefix, full_focus, suffix.to_string()))
}

/// Découpe une question socratique en `(prefix, focus)` afin de souligner
/// le concept mathématique central en bleu saphir noble.
pub fn split_socratic_focus(raw_title: &str) -> (String, String) {
    let trimmed = raw_title
        .trim()
        .trim_end_matches(|c: char| c == '?' || c.is_whitespace());
    if trimmed.is_empty() {
        return (String::new(), String::new());
    }

    if let Some((prefix, focus, _)) = extract_explicit_mathqst(trimmed) {
        return (prefix, focus);
    }

    // Si l'auteur a déjà placé un \textbf{…}, on laisse le balisage auteur intact.
    if trimmed.contains("\\textbf{") || trimmed.contains("\\hl{") {
        return (trimmed.to_string(), String::new());
    }

    let lower = trimmed.to_lowercase();
    for marker in SOCRATIC_MARKERS {
        if let Some(pos) = lower.find(marker) {
            let split_at = pos + marker.len();
            if trimmed.is_char_boundary(split_at) && split_at < trimmed.len() {
                let prefix = &trimmed[..split_at];
                let focus = trimmed[split_at..].trim();
                if !focus.is_empty() {
                    return (prefix.to_string(), focus.to_string());
                }
            }
        }
    }
    (trimmed.to_string(), String::new())
}

/// Estime le temps de lecture pondéré (en minutes) en tenant compte du texte,
/// des formules centrées, des maths inline, des blancs interactifs et des tableaux.
pub fn compute_reading_metrics(text: &str) -> Value {
    let display = (text.matches("$$").count() / 2) as u32
        + text.matches("\\begin{align").count() as u32;
    let tables = text.matches("\\begin{array}").count() as u32
        + text.matches("\\begin{tabular}").count() as u32;
    let blanks = text.matches("\\blank{").count() as u32
        + text.matches("\\blanck{").count() as u32
        + text.matches("\\balck{").count() as u32;

    let stripped = text.replace("$$", " ");
    let inline = (stripped.matches('$').count() / 2) as u32;
    let words = text
        .split_whitespace()
        .filter(|w| !w.starts_with('\\') && w.chars().any(char::is_alphabetic))
        .count() as u32;

    // Modèle cognitif : 185 mots/min + 12 s/formule display + 2.5 s/inline + 5 s/blanc + 18 s/tableau
    let seconds = (words as f64 / 185.0) * 60.0
        + (display as f64) * 12.0
        + (inline as f64) * 2.5
        + (blanks as f64) * 5.0
        + (tables as f64) * 18.0;
    let minutes = (seconds / 60.0).round().max(1.0) as u32;
    let density = if display + tables >= 12 || blanks >= 20 {
        "dense"
    } else if display + tables >= 4 || blanks >= 6 {
        "équilibré"
    } else {
        "léger"
    };

    json!({
        "minutes": minutes,
        "words": words,
        "displayFormulas": display,
        "inlineFormulas": inline,
        "blanks": blanks,
        "tables": tables,
        "density": density,
    })
}
