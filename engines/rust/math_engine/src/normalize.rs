//! Normalisation LaTeX (`\\ [x]` non-dimensionnel → `\\ {}[x]`)
//! et expansion récursive bornée des 209 macros KaTeX.

use crate::analyze::next_char_len;
use crate::macros::macro_map;

const TEX_UNITS: &[&str] = &[
    "pt", "em", "mm", "cm", "ex", "mu", "in", "bp", "dd", "pc", "sp", "cc", "nd", "nc", "px",
];

fn looks_like_size(content: &str) -> bool {
    let s = content.trim();
    let Some(idx) = s.find(|c: char| c.is_ascii_alphabetic()) else {
        return false;
    };
    let (num_part, unit) = s.split_at(idx);
    if !TEX_UNITS.contains(&unit) {
        return false;
    }
    let n = num_part.trim_start_matches(['+', '-']);
    !n.is_empty() && n.chars().all(|c| c.is_ascii_digit() || c == '.')
}

/// Répare `\\ [intervalle]` (qui serait interprété par TeX comme un espacement vertical)
/// en insérant un groupe vide `{}` avant `[`.
pub fn repair_line_break_brackets(tex: &str) -> (String, usize) {
    let mut out = String::with_capacity(tex.len());
    let mut fixes = 0usize;
    let bytes = tex.as_bytes();
    let mut i = 0usize;

    while i < tex.len() {
        if bytes[i] == b'\\' && i + 1 < tex.len() && bytes[i + 1] == b'\\' {
            let mut j = i + 2;
            while j < tex.len() && matches!(bytes[j], b' ' | b'\t') {
                j += 1;
            }
            if j < tex.len() && bytes[j] == b'[' {
                if let Some(close) = tex[j..].find(']') {
                    let content = &tex[j + 1..j + close];
                    if !looks_like_size(content) {
                        out.push_str(&tex[i..j]);
                        out.push_str(" {}[");
                        out.push_str(content);
                        out.push(']');
                        fixes += 1;
                        i = j + close + 1;
                        continue;
                    }
                }
            }
            let end = j.min(tex.len());
            out.push_str(&tex[i..end]);
            i = end;
        } else {
            let step = next_char_len(tex, i);
            out.push_str(&tex[i..i + step]);
            i += step;
        }
    }
    (out, fixes)
}

fn arg_count(def: &str) -> usize {
    let bytes = def.as_bytes();
    let mut max = 0usize;
    let mut k = 0;
    while k + 1 < bytes.len() {
        if bytes[k] == b'#' && bytes[k + 1].is_ascii_digit() {
            max = max.max((bytes[k + 1] - b'0') as usize);
            k += 2;
        } else {
            k += 1;
        }
    }
    max
}

fn read_group(text: &[char], i: usize) -> Option<(String, usize)> {
    if i >= text.len() || text[i] != '{' {
        return None;
    }
    let mut depth = 0i64;
    let mut k = i;
    while k < text.len() {
        match text[k] {
            '\\' => k += 1,
            '{' => depth += 1,
            '}' => {
                depth -= 1;
                if depth == 0 {
                    return Some((text[i + 1..k].iter().collect(), k + 1));
                }
            }
            _ => {}
        }
        k += 1;
    }
    None
}

fn expand_once(tex: &str) -> (String, bool) {
    let chars: Vec<char> = tex.chars().collect();
    let mut out = String::with_capacity(tex.len());
    let mut i = 0usize;
    let mut expanded = false;
    let map = macro_map();

    while i < chars.len() {
        if chars[i] == '\\' && i + 1 < chars.len() && chars[i + 1].is_ascii_alphabetic() {
            let start = i + 1;
            let mut end = start;
            while end < chars.len() && chars[end].is_ascii_alphabetic() {
                end += 1;
            }
            let name: String = chars[start..end].iter().collect();
            let key = format!("\\{name}");
            if let Some(def) = map.get(key.as_str()) {
                expanded = true;
                let mut expanded_def = def.replace("##", "#");
                let n_args = arg_count(&expanded_def);
                let mut args: Vec<String> = Vec::with_capacity(n_args);
                let mut k = end;

                for _ in 0..n_args {
                    while k < chars.len() && chars[k] == ' ' {
                        k += 1;
                    }
                    if k < chars.len() && chars[k] == '{' {
                        if let Some((g, nk)) = read_group(&chars, k) {
                            args.push(g);
                            k = nk;
                            continue;
                        }
                    }
                    if k < chars.len() && chars[k] == '\\' {
                        let s2 = k + 1;
                        let mut e2 = s2;
                        while e2 < chars.len() && chars[e2].is_ascii_alphabetic() {
                            e2 += 1;
                        }
                        if e2 > s2 {
                            args.push(chars[k..e2].iter().collect());
                            k = e2;
                            continue;
                        }
                    }
                    if k < chars.len() {
                        args.push(chars[k].to_string());
                        k += 1;
                    }
                }

                for n in (1..=n_args).rev() {
                    let placeholder = format!("#{n}");
                    let val = args.get(n - 1).map(String::as_str).unwrap_or("");
                    expanded_def = expanded_def.replace(&placeholder, val);
                }
                out.push_str(&expanded_def);
                i = k;
                continue;
            }
        }
        out.push(chars[i]);
        i += 1;
    }
    (out, expanded)
}

/// Développe les macros connues jusqu'à stabilisation ou `max_depth` passes.
pub fn expand(tex: &str, max_depth: u32) -> (String, u32) {
    let mut cur = tex.to_string();
    let mut depth = 0u32;
    while depth < max_depth {
        let (next, changed) = expand_once(&cur);
        if !changed {
            break;
        }
        cur = next;
        depth += 1;
    }
    (cur, depth)
}
