//! Analyseur et segmenteur LaTeX (display, inline, environnements, images, texte)
//! + découpe \qst{…} / \question{…} pour séparer énoncé et correction.

use serde_json::{json, Map, Value};
use std::collections::HashMap;
use crate::macros::macro_map;

const STRUCTURAL_ENVS: &[&str] = &[
    "itemize", "enumerate", "center", "columns", "align", "align*", "aligned",
    "tabular", "array", "figure", "minipage", "cases", "pmatrix", "bmatrix", "vmatrix",
];

const SEMANTIC_ENVS: &[&str] = &[
    "definition", "theorem", "proposition", "lemma", "corollary", "property",
    "method", "proof", "example", "remark", "warning", "application", "note",
];

#[inline]
pub fn next_char_len(text: &str, i: usize) -> usize {
    text[i..].chars().next().map(char::len_utf8).unwrap_or(1)
}

fn find_closing(text: &str, from: usize, open: &str, close: &str) -> Option<(usize, usize)> {
    let start = from + open.len();
    text[start..].find(close).map(|rel| (start, start + rel))
}

fn read_env_block(text: &str, from: usize, name: &str) -> Option<(usize, usize)> {
    let open_tok = format!("\\begin{{{name}}}");
    let close_tok = format!("\\end{{{name}}}");
    let mut depth = 0usize;
    let mut i = from;
    while i < text.len() {
        let rest = &text[i..];
        if rest.starts_with(&open_tok) {
            depth += 1;
            i += open_tok.len();
        } else if rest.starts_with(&close_tok) {
            depth = depth.saturating_sub(1);
            i += close_tok.len();
            if depth == 0 {
                return Some((from, i));
            }
        } else {
            i += next_char_len(text, i);
        }
    }
    None
}

fn macro_name_at(text: &str, i: usize) -> Option<String> {
    let rest = &text[i..];
    if !rest.starts_with('\\') {
        return None;
    }
    let end = rest[1..]
        .find(|c: char| !c.is_ascii_alphabetic())
        .map(|k| k + 1)
        .unwrap_or(rest.len());
    if end > 1 { Some(rest[..end].to_string()) } else { None }
}

fn flush_text_run(text: &str, segments: &mut Vec<Value>, run: &mut Option<usize>, upto: usize) {
    if let Some(s) = run.take() {
        if upto > s {
            segments.push(json!({ "type": "text", "raw": &text[s..upto] }));
        }
    }
}

fn parse_image(text: &str, i: usize, cmd_len: usize) -> (String, String, String) {
    let mut j = i + cmd_len;
    if text[j..].starts_with('[') {
        if let Some(close) = text[j..].find(']') {
            j += close + 1;
        }
    }
    if text[j..].starts_with('{') {
        if let Some(close) = text[j..].find('}') {
            let src = text[j + 1..j + close].to_string();
            let mut raw_end = j + close + 1;
            let mut caption = String::new();
            if text[raw_end..].starts_with('{') {
                if let Some(c2) = text[raw_end..].find('}') {
                    caption = text[raw_end + 1..raw_end + c2].to_string();
                    raw_end += c2 + 1;
                }
            }
            return (text[i..raw_end].to_string(), src, caption);
        }
    }
    (text[i..(i + cmd_len).min(text.len())].to_string(), String::new(), String::new())
}

pub fn analyze(text: &str) -> (Vec<Value>, Value, Vec<String>) {
    let mut segments = Vec::new();
    let (mut n_display, mut n_inline, mut n_envs, mut n_images) = (0u32, 0u32, 0u32, 0u32);
    let mut macro_hits: HashMap<String, u32> = HashMap::new();
    let mut errors = Vec::new();
    let known = macro_map();

    let mut i = 0usize;
    let mut run: Option<usize> = None;

    while i < text.len() {
        let rest = &text[i..];
        if rest.starts_with("$$") {
            flush_text_run(text, &mut segments, &mut run, i);
            match find_closing(text, i, "$$", "$$") {
                Some((a, b)) => {
                    n_display += 1;
                    segments.push(json!({ "type": "display", "delim": "$$…$$", "centered": true, "raw": &text[i..b + 2], "inner": &text[a..b] }));
                    i = b + 2;
                }
                None => {
                    errors.push("Délimiteur $$ ouvert mais jamais fermé".into());
                    segments.push(json!({ "type": "display-error", "raw": &text[i..] }));
                    i = text.len();
                }
            }
        } else if rest.starts_with("\\[") {
            flush_text_run(text, &mut segments, &mut run, i);
            match find_closing(text, i, "\\[", "\\]") {
                Some((a, b)) => {
                    n_display += 1;
                    segments.push(json!({ "type": "display", "delim": "\\[…\\]", "centered": true, "raw": &text[i..b + 2], "inner": &text[a..b] }));
                    i = b + 2;
                }
                None => {
                    errors.push("Délimiteur \\[ non fermé par \\]".into());
                    i += 2;
                }
            }
        } else if rest.starts_with("\\(") {
            flush_text_run(text, &mut segments, &mut run, i);
            match find_closing(text, i, "\\(", "\\)") {
                Some((a, b)) => {
                    n_inline += 1;
                    segments.push(json!({ "type": "inline", "delim": "\\(…\\)", "raw": &text[i..b + 2], "inner": &text[a..b] }));
                    i = b + 2;
                }
                None => {
                    errors.push("Délimiteur \\( non fermé par \\)".into());
                    i += 2;
                }
            }
        } else if rest.starts_with('$') {
            flush_text_run(text, &mut segments, &mut run, i);
            let close_rel = {
                let bytes = text[i + 1..].as_bytes();
                let mut k = 0;
                let mut found = None;
                while k < bytes.len() {
                    if bytes[k] == b'\\' {
                        k += 2;
                        continue;
                    }
                    if bytes[k] == b'$' {
                        found = Some(k);
                        break;
                    }
                    k += 1;
                }
                found
            };
            match close_rel {
                Some(rel) if rel > 0 => {
                    n_inline += 1;
                    let b = i + 1 + rel;
                    segments.push(json!({ "type": "inline", "delim": "$…$", "raw": &text[i..b + 1], "inner": &text[i + 1..b] }));
                    i = b + 1;
                }
                _ => {
                    errors.push("Nombre impair de délimiteurs $ inline".into());
                    i += 1;
                }
            }
        } else if rest.starts_with("\\begin{") {
            flush_text_run(text, &mut segments, &mut run, i);
            match text[i + 7..].find('}').map(|p| i + 7 + p) {
                Some(ne) => {
                    let name = &text[i + 7..ne];
                    match read_env_block(text, i, name) {
                        Some((a, b)) => {
                            n_envs += 1;
                            let kind = if SEMANTIC_ENVS.contains(&name) { "semantic" }
                                else if STRUCTURAL_ENVS.contains(&name) { "structural" }
                                else { "unknown" };
                            segments.push(json!({ "type": "environment", "env": name, "kind": kind, "raw": &text[a..b] }));
                            i = b;
                        }
                        None => {
                            errors.push(format!("Environnement '{name}' non correctement fermé"));
                            i = ne + 1;
                        }
                    }
                }
                None => { errors.push("\\begin{ sans nom d'environnement".into()); i += 7; }
            }
        } else if rest.starts_with("\\image") || rest.starts_with("\\img") || rest.starts_with("\\includegraphics") {
            flush_text_run(text, &mut segments, &mut run, i);
            let cmd_len = if rest.starts_with("\\includegraphics") { 16 } else if rest.starts_with("\\image") { 6 } else { 4 };
            let (raw, src, caption) = parse_image(text, i, cmd_len);
            n_images += 1;
            segments.push(json!({ "type": "image", "src": src, "caption": caption, "raw": raw }));
            i += raw.len().min(text.len() - i);
        } else if rest.starts_with('\\') {
            // Correctif clé : démarre le segment texte si `run` était None afin de ne jamais avaler \textbf / \par !
            if run.is_none() {
                run = Some(i);
            }
            if let Some(name) = macro_name_at(text, i) {
                if known.contains_key(name.as_str()) {
                    *macro_hits.entry(name.clone()).or_insert(0) += 1;
                }
                i += name.len();
            } else {
                i += next_char_len(text, i);
            }
        } else {
            if run.is_none() {
                run = Some(i);
            }
            i += next_char_len(text, i);
        }
    }
    flush_text_run(text, &mut segments, &mut run, text.len());

    let stats_v = json!({
        "display": n_display,
        "inline": n_inline,
        "environments": n_envs,
        "images": n_images,
        "macroHits": macro_hits.into_iter().map(|(k, v)| (k, json!(v))).collect::<Map<String, Value>>(),
        "segments": segments.len(),
    });
    (segments, stats_v, errors)
}

fn strip_leading_layout_cmds(mut s: &str) -> &str {
    loop {
        s = s.trim_start();
        let mut matched = false;
        for cmd in ["\\par", "\\smallskip", "\\medskip", "\\bigskip", "\\noindent"] {
            if let Some(rest) = s.strip_prefix(cmd) {
                if rest.is_empty() || !rest.as_bytes()[0].is_ascii_alphabetic() {
                    s = rest;
                    matched = true;
                    break;
                }
            }
        }
        if !matched {
            break;
        }
    }
    s
}

/// Extrait les commandes `\qst{…}` / `\question{…}` en tête de bloc pour séparer énoncé et correction.
pub fn split_question_content(content: &str) -> Option<(String, String)> {
    let cleaned = strip_leading_layout_cmds(content);
    let bytes = cleaned.as_bytes();
    let mut pos = 0usize;
    while pos < bytes.len() && bytes[pos].is_ascii_whitespace() { pos += 1; }

    let mut parts = Vec::new();
    while pos < cleaned.len() {
        let sub = strip_leading_layout_cmds(&cleaned[pos..]);
        pos = cleaned.len() - sub.len();
        if pos >= cleaned.len() { break; }
        let rest = &cleaned[pos..];
        let clen = if rest.starts_with("\\question{") { 10 }
            else if rest.starts_with("\\qst{") { 5 }
            else { break };

        let mut depth = 1usize;
        let mut i = pos + clen;
        while i < cleaned.len() && depth > 0 {
            let b = cleaned.as_bytes()[i];
            if b == b'\\' && i + 1 < cleaned.len() {
                i += 1 + next_char_len(cleaned, i + 1);
                continue;
            }
            if b == b'{' { depth += 1; i += 1; }
            else if b == b'}' { depth -= 1; i += 1; }
            else { i += next_char_len(cleaned, i); }
        }
        if depth != 0 { break; }
        parts.push(cleaned[pos + clen..i - 1].trim().to_string());
        pos = i;
    }

    if parts.is_empty() { return None; }
    let correction = strip_leading_layout_cmds(&cleaned[pos..]).trim().to_string();
    Some((parts.join("\n\n"), correction))
}

/// Convertit un titre ou fragment LaTeX en texte lisible pur (sans balises TeX ni `$`).
pub fn plain_title(raw: &str) -> String {
    if raw.trim().is_empty() {
        return String::new();
    }
    let mut s = raw
        .replace("\\[", " ")
        .replace("\\]", " ")
        .replace("\\(", " ")
        .replace("\\)", " ")
        .replace("$$", " ")
        .replace('$', " ")
        .replace("\\R", "ℝ")
        .replace("\\N", "ℕ")
        .replace("\\Z", "ℤ")
        .replace("\\Q", "ℚ")
        .replace("\\C", "ℂ")
        .replace("\\infty", "∞")
        .replace("\\to", "→")
        .replace("\\rightarrow", "→")
        .replace("\\Rightarrow", "⇒")
        .replace("\\iff", "⇔")
        .replace("\\leq", "≤")
        .replace("\\le", "≤")
        .replace("\\geq", "≥")
        .replace("\\ge", "≥")
        .replace("\\neq", "≠")
        .replace("\\ne", "≠")
        .replace("\\times", "×")
        .replace("\\cdot", "·")
        .replace("\\pm", "±")
        .replace("\\pi", "π")
        .replace("\\alpha", "α")
        .replace("\\beta", "β")
        .replace("\\lambda", "λ")
        .replace("\\Delta", "Δ");

    // Supprime les commandes d'habillage (\mathqst{...}, \textbf{...}, etc.) en conservant leur contenu
    let mut out = String::with_capacity(s.len());
    let bytes = s.as_bytes();
    let mut i = 0usize;
    while i < s.len() {
        if bytes[i] == b'\\' {
            let mut j = i + 1;
            while j < s.len() && bytes[j].is_ascii_alphabetic() {
                j += 1;
            }
            if j > i + 1 {
                let cmd = &s[i + 1..j];
                if matches!(cmd, "dfrac" | "frac" | "tfrac") && s[j..].starts_with('{') {
                    i = j;
                    continue;
                }
                i = j;
                continue;
            }
            // Ignore un antislash isolé
            i += 1;
            continue;
        }
        if bytes[i] == b'{' || bytes[i] == b'}' {
            out.push(' ');
            i += 1;
            continue;
        }
        let ch = s[i..].chars().next().unwrap_or(' ');
        out.push(ch);
        i += ch.len_utf8();
    }
    s.clear();
    for word in out.split_whitespace() {
        if !s.is_empty() {
            s.push(' ');
        }
        s.push_str(word);
    }
    s
}
