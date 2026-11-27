//! `json_engine::domain` — logique métier pure portée en Rust :
//! - Problèmes de synthèse : suppression de préfixe, métadonnées ciblées, thèmes actifs
//! - Progression globale d'un chapitre (`chapter_pct`)
//! - Pipeline image défensif : sniffing binaire (magic bytes), dimensions SVG, `fit_within`, `budget_steps`

use serde_json::{json, Value};
use std::collections::BTreeSet;

use crate::helpers::norm_text;

const EDGE_FACTORS: &[f64] = &[1.0, 0.85, 0.7, 0.55, 0.4];
const QUALITIES: &[f64] = &[0.88, 0.78, 0.68, 0.58];

/// Retire les préfixes redondants « Problème 1.2 — », « Problème : », etc.
pub fn strip_problem_prefix(text: &str) -> String {
    let s = text.trim_start();
    let lower_chars: Vec<(usize, char)> = s.char_indices().collect();
    let norm = norm_text(s);
    let mut rest = s;

    if norm.starts_with("probleme") {
        // Avance après "probleme" ou "problemes" en indices UTF-8 exacts
        let mut char_pos = 8usize;
        if norm[8..].starts_with('s') {
            char_pos = 9;
        }
        if let Some(&(byte_idx, _)) = lower_chars.get(char_pos) {
            let mut tail = &s[byte_idx..];
            tail = tail.trim_start();

            // Optionnel : "n° 12", "no 12", "n 12" ou "1.2.3"
            let mut after_num = tail;
            let t_norm = norm_text(tail);
            if t_norm.starts_with("n°") || t_norm.starts_with("no") || t_norm.starts_with("n ") {
                let skip_chars = if tail.starts_with("n°") || tail.starts_with("N°") {
                    2
                } else if t_norm.starts_with("no") {
                    2
                } else {
                    1
                };
                if let Some((b_off, _)) = tail.char_indices().nth(skip_chars) {
                    let after_n = tail[b_off..].trim_start();
                    let digits_end = after_n
                        .bytes()
                        .take_while(|b| b.is_ascii_digit())
                        .count();
                    if digits_end > 0 {
                        after_num = after_n[digits_end..].trim_start();
                    }
                }
            } else {
                // "1" ou "1.2.3"
                let mut idx = 0usize;
                let tb = tail.as_bytes();
                if tb.first().copied().map(|b| b.is_ascii_digit()).unwrap_or(false) {
                    while idx < tb.len() && tb[idx].is_ascii_digit() {
                        idx += 1;
                    }
                    while idx < tb.len() && tb[idx] == b'.' {
                        let dot_start = idx + 1;
                        let mut j = dot_start;
                        while j < tb.len() && tb[j].is_ascii_digit() {
                            j += 1;
                        }
                        if j > dot_start {
                            idx = j;
                        } else {
                            break;
                        }
                    }
                    after_num = tail[idx..].trim_start();
                }
            }

            // Séparateur obligatoire : — | – | - | :
            if let Some(first_ch) = after_num.chars().next() {
                if matches!(first_ch, '—' | '–' | '-' | ':') {
                    rest = after_num[first_ch.len_utf8()..].trim_start();
                }
            }
        }
    }

    rest.split_whitespace().collect::<Vec<_>>().join(" ")
}

/// Construit une ligne d'information ciblée et concise pour un problème.
pub fn format_problem_meta(problem: &Value, theme_map: &Value) -> String {
    if problem.is_null() || !problem.is_object() {
        return String::new();
    }
    let theme_id = problem.get("theme").and_then(Value::as_str).unwrap_or("");
    let theme_name = theme_map
        .get(theme_id)
        .and_then(Value::as_str)
        .unwrap_or("")
        .trim();

    let raw_sub = problem.get("subtitle").and_then(Value::as_str).unwrap_or("");
    let mut focus = strip_problem_prefix(raw_sub);

    let title_norm = norm_text(problem.get("title").and_then(Value::as_str).unwrap_or("")).trim().to_string();
    let theme_norm = norm_text(theme_name).trim().to_string();
    let focus_norm = norm_text(&focus).trim().to_string();

    if focus.is_empty()
        || (!theme_norm.is_empty() && focus_norm == theme_norm)
        || (!title_norm.is_empty() && !focus_norm.is_empty() && title_norm.contains(&focus_norm))
    {
        focus.clear();
    } else if focus.chars().count() > 52 {
        let prefix: String = focus.chars().take(51).collect();
        let trimmed = match prefix.rfind(|c: char| c.is_whitespace()) {
            Some(pos) => prefix[..pos].trim_end(),
            None => prefix.trim_end(),
        };
        focus = format!("{trimmed}…");
    }

    let mut parts: Vec<&str> = Vec::new();
    if !theme_name.is_empty() {
        parts.push(theme_name);
    }
    if !focus.is_empty() {
        parts.push(&focus);
    }
    parts.join(" · ")
}

/// Ne conserve que les thèmes effectivement présents dans la liste de problèmes.
pub fn active_problem_themes(idx: &Value) -> Vec<Value> {
    let problems = idx.get("problemes").and_then(Value::as_array);
    let themes = idx.get("themes").and_then(Value::as_array);
    let (Some(problems), Some(themes)) = (problems, themes) else {
        return Vec::new();
    };
    let used: BTreeSet<&str> = problems
        .iter()
        .filter_map(|p| p.get("theme").and_then(Value::as_str))
        .filter(|s| !s.is_empty())
        .collect();
    let active: Vec<Value> = themes
        .iter()
        .filter(|t| {
            t.get("id")
                .and_then(Value::as_str)
                .map(|id| used.contains(id))
                .unwrap_or(false)
        })
        .cloned()
        .collect();
    if active.len() <= 1 {
        return Vec::new();
    }
    let mut out = Vec::with_capacity(active.len() + 1);
    out.push(json!({ "id": "all", "name": "Tous" }));
    out.extend(active);
    out
}

/// Calcule le pourcentage global de progression d'un chapitre (0–100).
pub fn op_chapter_pct(req: &Value) -> Value {
    let has_rev = req.get("hasRevision").and_then(Value::as_bool).unwrap_or(true);
    let has_quiz = req.get("hasQuiz").and_then(Value::as_bool).unwrap_or(true);
    let ex_total = req.get("exerciseTotal").and_then(Value::as_u64).unwrap_or(0);
    let rev_pct = req.get("revPct").and_then(Value::as_f64).unwrap_or(0.0);
    let quiz_submitted = req.get("quizSubmitted").and_then(Value::as_bool).unwrap_or(false);
    let quiz_answered_pct = req.get("quizAnsweredPct").and_then(Value::as_f64).unwrap_or(0.0);
    let ex_done = req.get("exercisesDone").and_then(Value::as_u64).unwrap_or(0);

    let mut sum = 0.0f64;
    let mut parts = 0u32;
    if has_rev {
        parts += 1;
        sum += (rev_pct / 100.0).clamp(0.0, 1.0);
    }
    if has_quiz {
        parts += 1;
        sum += if quiz_submitted { 1.0 } else { (quiz_answered_pct / 100.0).clamp(0.0, 1.0) };
    }
    if ex_total > 0 {
        parts += 1;
        sum += ((ex_done as f64) / (ex_total as f64)).clamp(0.0, 1.0);
    }
    let pct = if parts > 0 {
        ((sum / parts as f64) * 100.0).round() as u32
    } else {
        0
    };
    json!({ "ok": true, "engine": "json", "pct": pct })
}

/* ── Pipeline image défensif (magic bytes, SVG, fitWithin, budgetSteps) ──── */

pub fn sniff_format_bytes(b: &[u8]) -> Option<&'static str> {
    if b.len() >= 8 && b[0] == 0x89 && b[1] == 0x50 && b[2] == 0x4E && b[3] == 0x47 {
        return Some("png");
    }
    if b.len() >= 3 && b[0] == 0xFF && b[1] == 0xD8 && b[2] == 0xFF {
        return Some("jpeg");
    }
    if b.len() >= 6 && b[0] == 0x47 && b[1] == 0x49 && b[2] == 0x46 {
        return Some("gif");
    }
    if b.len() >= 12
        && b[0] == 0x52 && b[1] == 0x49 && b[2] == 0x46 && b[3] == 0x46
        && b[8] == 0x57 && b[9] == 0x45 && b[10] == 0x42 && b[11] == 0x50
    {
        return Some("webp");
    }
    let head = String::from_utf8_lossy(&b[..b.len().min(1024)]).to_lowercase();
    if head.contains("<svg") {
        return Some("svg");
    }
    None
}

fn parse_attr_num(src_lower: &str, name: &str) -> Option<f64> {
    let mut search_from = 0;
    while let Some(pos) = src_lower[search_from..].find(name) {
        let idx = search_from + pos;
        let prev_ok = idx == 0
            || !src_lower.as_bytes()[idx - 1].is_ascii_alphanumeric();
        let after = &src_lower[idx + name.len()..];
        if prev_ok {
            let trimmed = after.trim_start();
            if let Some(after_eq) = trimmed.strip_prefix('=') {
                let after_eq = after_eq.trim_start();
                let quote = after_eq.as_bytes().first().copied();
                if matches!(quote, Some(b'"' | b'\'')) {
                    let val_start = &after_eq[1..];
                    let num_end = val_start
                        .bytes()
                        .take_while(|b| b.is_ascii_digit() || *b == b'.')
                        .count();
                    if num_end > 0 {
                        if let Ok(v) = val_start[..num_end].parse::<f64>() {
                            if v.is_finite() && v > 0.0 {
                                return Some(v);
                            }
                        }
                    }
                }
            }
        }
        search_from = idx + name.len();
    }
    None
}

pub fn svg_intrinsic_size(source: &str) -> (f64, f64) {
    let lower = source.to_lowercase();
    if let (Some(w), Some(h)) = (parse_attr_num(&lower, "width"), parse_attr_num(&lower, "height")) {
        return (w, h);
    }
    if let Some(pos) = lower.find("viewbox") {
        let after = lower[pos + 7..].trim_start();
        if let Some(after_eq) = after.strip_prefix('=') {
            let after_eq = after_eq.trim_start();
            if let Some(&q) = after_eq.as_bytes().first() {
                if q == b'"' || q == b'\'' {
                    let inner = &after_eq[1..];
                    if let Some(end) = inner.find(q as char) {
                        let nums: Vec<f64> = inner[..end]
                            .split(|c: char| c.is_whitespace() || c == ',')
                            .filter(|t| !t.is_empty())
                            .filter_map(|t| t.parse::<f64>().ok())
                            .collect();
                        if nums.len() >= 4 && nums[2] > 0.0 && nums[3] > 0.0 {
                            return (nums[2], nums[3]);
                        }
                    }
                }
            }
        }
    }
    (1024.0, 768.0)
}

pub fn fit_within(src_w: f64, src_h: f64, max_edge: f64) -> (u32, u32) {
    let max_dim = src_w.max(src_h).max(1.0);
    let scale = (max_edge / max_dim).min(1.0);
    let w = (src_w * scale).round().max(1.0) as u32;
    let h = (src_h * scale).round().max(1.0) as u32;
    (w, h)
}

pub fn budget_steps(max_edge: f64) -> Vec<Value> {
    let mut steps = Vec::with_capacity(EDGE_FACTORS.len() * QUALITIES.len());
    for &factor in EDGE_FACTORS {
        let edge = (max_edge * factor).round().max(16.0) as u32;
        for &quality in QUALITIES {
            steps.push(json!({ "edge": edge, "quality": quality }));
        }
    }
    steps
}

/* ── Opérations JSON dispatchées ─────────────────────────────────────────── */

pub fn op_problem_strip_prefix(req: &Value) -> Value {
    let text = req.get("text").and_then(Value::as_str).unwrap_or("");
    json!({ "ok": true, "engine": "json", "text": strip_problem_prefix(text) })
}

pub fn op_problem_meta(req: &Value) -> Value {
    let problem = req.get("problem").unwrap_or(&Value::Null);
    let theme_map = req.get("themeMap").unwrap_or(&Value::Null);
    json!({ "ok": true, "engine": "json", "meta": format_problem_meta(problem, theme_map) })
}

pub fn op_problem_themes(req: &Value) -> Value {
    let idx = req.get("index").unwrap_or(&Value::Null);
    json!({ "ok": true, "engine": "json", "themes": active_problem_themes(idx) })
}

pub fn op_inspect_image(req: &Value) -> Value {
    let action = req.get("action").and_then(Value::as_str).unwrap_or("");
    match action {
        "sniff" => {
            let bytes: Vec<u8> = req
                .get("bytes")
                .and_then(Value::as_array)
                .map(|arr| {
                    arr.iter()
                        .filter_map(|v| v.as_u64().map(|n| (n & 0xFF) as u8))
                        .collect()
                })
                .unwrap_or_default();
            json!({ "ok": true, "engine": "json", "format": sniff_format_bytes(&bytes) })
        }
        "svg-size" => {
            let source = req.get("source").and_then(Value::as_str).unwrap_or("");
            let (width, height) = svg_intrinsic_size(source);
            json!({ "ok": true, "engine": "json", "width": width, "height": height })
        }
        "fit-within" => {
            let src_w = req.get("srcW").and_then(Value::as_f64).unwrap_or(1.0);
            let src_h = req.get("srcH").and_then(Value::as_f64).unwrap_or(1.0);
            let max_edge = req.get("maxEdge").and_then(Value::as_f64).unwrap_or(1600.0);
            let (width, height) = fit_within(src_w, src_h, max_edge);
            json!({ "ok": true, "engine": "json", "width": width, "height": height })
        }
        "budget-steps" => {
            let max_edge = req.get("maxEdge").and_then(Value::as_f64).unwrap_or(1600.0);
            json!({ "ok": true, "engine": "json", "steps": budget_steps(max_edge) })
        }
        _ => json!({ "ok": false, "error": format!("action image inconnue « {action} »") }),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn strips_problem_prefixes_and_formats_meta() {
        assert_eq!(strip_problem_prefix("Problème 1.2 — Suites & limites"), "Suites & limites");
        assert_eq!(strip_problem_prefix("Problème : Dérivation"), "Dérivation");
        let meta = format_problem_meta(
            &json!({ "title": "Étude complète", "subtitle": "Problème 3 — Fonctions exponentielles", "theme": "analyse" }),
            &json!({ "analyse": "Analyse" }),
        );
        assert_eq!(meta, "Analyse · Fonctions exponentielles");
    }

    #[test]
    fn sniffs_formats_and_svg_dimensions() {
        assert_eq!(sniff_format_bytes(&[0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]), Some("png"));
        assert_eq!(sniff_format_bytes(b"<svg viewBox=\"0 0 400 200\"></svg>"), Some("svg"));
        assert_eq!(svg_intrinsic_size("<svg viewBox=\"0 0 400 200\"></svg>"), (400.0, 200.0));
        assert_eq!(fit_within(3200.0, 1600.0, 1600.0), (1600, 800));
    }
}
