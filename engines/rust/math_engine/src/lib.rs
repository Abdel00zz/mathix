//! `math_engine` — moteur mathématique modulaire de mathPlus (Vhtml / Rust → WASM32).
//!
//! Architecture en modules courts et ciblés :
//! - [`abi`]       : passerelle C WASM sans `static mut` (`alloc`, `dealloc`, `out_*`).
//! - [`macros`]    : registre statique des 209 macros KaTeX (`OnceLock`).
//! - [`analyze`]   : segmenteur LaTeX mixte + extraction `\qst{…}` / `\question{…}`.
//! - [`validate`]  : vérification des délimiteurs math, accolades et environnements.
//! - [`normalize`] : réparation `\\ [x]` non-dimensionnel + expansion récursive des macros.
//! - [`answer`]    : normalisation tolérante des réponses libres de quiz.

pub mod analyze;
pub mod answer;
pub mod macros;
pub mod normalize;
pub mod preprocess;
pub mod socratic;
pub mod structure;
pub mod tkztab;
pub mod validate;

#[cfg(all(target_arch = "wasm32", feature = "wasm-entry"))]
pub use wasm_abi::{alloc, dealloc, out_free, out_len, out_ptr};

use serde_json::{json, Map, Value};

const VERSION: &str = "math_engine 1.5.0 (rust/wasm32 modular + socratic + structure + tkztab + preprocess)";

#[cfg(all(target_arch = "wasm32", feature = "wasm-entry"))]
#[no_mangle]
pub extern "C" fn process(ptr: *const u8, len: u32) {
    let input = unsafe { std::slice::from_raw_parts(ptr, len as usize) };
    let text = String::from_utf8_lossy(input);
    let out = dispatch(&text);
    wasm_abi::write_output(out.into_bytes());
}

/// Point d'entrée JSON unique (`{"op": "analyze" | "validate" | "parse-tkztab" | "prepass-text-macros" | ...}`).
pub fn dispatch(input: &str) -> String {
    let parsed: Value = match serde_json::from_str(input) {
        Ok(v) => v,
        Err(e) => return json!({ "ok": false, "error": format!("JSON invalide : {e}") }).to_string(),
    };
    let op = parsed.get("op").and_then(Value::as_str).unwrap_or("");
    let res = match op {
        "analyze" => op_analyze(&parsed),
        "validate" => op_validate(&parsed),
        "normalize" => op_normalize(&parsed),
        "macros" => op_macros(),
        "expand" => op_expand(&parsed),
        "norm-answer" => op_norm_answer(&parsed),
        "plain-title" => op_plain_title(&parsed),
        "search-match" => op_search_match(&parsed),
        "split-question" => op_split_question(&parsed),
        "socratic-split" => op_socratic_split(&parsed),
        "reading-metrics" => op_reading_metrics(&parsed),
        "inspect-display" => op_inspect_display(&parsed),
        "unwrap-boxed-blanks" => op_unwrap_boxed_blanks(&parsed),
        "split-solution-steps" => op_split_solution_steps(&parsed),
        "parse-tkztab" => op_parse_tkztab(&parsed),
        "sanitize-math-bold" => op_sanitize_math_bold(&parsed),
        "normalize-bare-math" => op_normalize_bare_math(&parsed),
        "prepass-text-macros" => op_prepass_text_macros(&parsed),
        "parse-art-table" => op_parse_art_table(&parsed),
        "slice-for-figures" => op_slice_for_figures(&parsed),
        "info" => json!({
            "ok": true,
            "engine": "math",
            "version": VERSION,
            "macros": macros::MACROS.len(),
        }),
        _ => json!({ "ok": false, "error": format!("opération inconnue « {op} »") }),
    };
    res.to_string()
}

fn op_analyze(v: &Value) -> Value {
    let text = v.get("text").and_then(Value::as_str).unwrap_or("");
    let (segments, stats, errors) = analyze::analyze(text);
    let (repaired, fixes) = normalize::repair_line_break_brackets(text);
    json!({
        "ok": true,
        "engine": "math",
        "segments": segments,
        "stats": stats,
        "errors": errors,
        "rowBracketFixes": fixes,
        "normalized": if fixes > 0 { repaired } else { text.to_string() },
    })
}

fn op_validate(v: &Value) -> Value {
    let text = v.get("text").and_then(Value::as_str).unwrap_or("");
    let errors = validate::validate(text);
    json!({
        "ok": true,
        "engine": "math",
        "isValid": errors.is_empty(),
        "errors": errors,
    })
}

fn op_normalize(v: &Value) -> Value {
    let tex = v.get("tex").and_then(Value::as_str).unwrap_or("");
    let (repaired, fixes) = normalize::repair_line_break_brackets(tex);
    let (expanded, depth) = normalize::expand(&repaired, 8);
    json!({
        "ok": true,
        "engine": "math",
        "normalized": repaired,
        "rowBracketFixes": fixes,
        "expanded": expanded,
        "expansionDepth": depth,
    })
}

fn op_macros() -> Value {
    let map: Map<String, Value> = macros::MACROS
        .iter()
        .map(|(k, d)| ((*k).to_string(), json!(d)))
        .collect();
    json!({
        "ok": true,
        "engine": "math",
        "count": macros::MACROS.len(),
        "macros": map,
    })
}

fn op_expand(v: &Value) -> Value {
    let tex = v.get("tex").and_then(Value::as_str).unwrap_or("");
    let (expanded, depth) = normalize::expand(tex, 8);
    json!({
        "ok": true,
        "engine": "math",
        "expanded": expanded,
        "expansionDepth": depth,
    })
}

fn op_norm_answer(v: &Value) -> Value {
    let value = v.get("value").and_then(Value::as_str).unwrap_or("");
    json!({
        "ok": true,
        "engine": "math",
        "normalized": answer::norm_answer(value),
    })
}

fn op_plain_title(v: &Value) -> Value {
    let tex = v.get("tex").or_else(|| v.get("text")).and_then(Value::as_str).unwrap_or("");
    json!({
        "ok": true,
        "engine": "math",
        "plain": analyze::plain_title(tex),
    })
}

fn op_search_match(v: &Value) -> Value {
    let text = v.get("text").and_then(Value::as_str).unwrap_or("");
    let query = v.get("query").and_then(Value::as_str).unwrap_or("");
    let q_norm = answer::norm_answer(query);
    if q_norm.is_empty() {
        return json!({ "ok": true, "engine": "math", "matches": true });
    }
    let hay = answer::norm_answer(&analyze::plain_title(text));
    let matches = q_norm.split_whitespace().all(|tok| hay.contains(tok));
    json!({
        "ok": true,
        "engine": "math",
        "matches": matches,
    })
}

fn op_split_question(v: &Value) -> Value {
    let content = v.get("content").and_then(Value::as_str).unwrap_or("");
    match analyze::split_question_content(content) {
        Some((statement, correction)) => json!({
            "ok": true,
            "engine": "math",
            "hasQuestion": true,
            "statement": statement,
            "correction": correction,
        }),
        None => json!({
            "ok": true,
            "engine": "math",
            "hasQuestion": false,
            "statement": "",
            "correction": content,
        }),
    }
}

fn op_socratic_split(v: &Value) -> Value {
    let title = v.get("title").and_then(Value::as_str).unwrap_or("");
    let (prefix, focus) = socratic::split_socratic_focus(title);
    json!({
        "ok": true,
        "engine": "math",
        "prefix": prefix,
        "focus": focus,
    })
}

fn op_reading_metrics(v: &Value) -> Value {
    let text = v.get("text").and_then(Value::as_str).unwrap_or("");
    json!({
        "ok": true,
        "engine": "math",
        "metrics": socratic::compute_reading_metrics(text),
    })
}

fn op_inspect_display(v: &Value) -> Value {
    let tex = v.get("tex").or_else(|| v.get("text")).and_then(Value::as_str).unwrap_or("");
    structure::inspect_display_formula(tex)
}

fn op_unwrap_boxed_blanks(v: &Value) -> Value {
    let tex = v.get("tex").or_else(|| v.get("text")).and_then(Value::as_str).unwrap_or("");
    json!({
        "ok": true,
        "engine": "math",
        "tex": structure::unwrap_boxed_blanks(tex),
    })
}

fn op_split_solution_steps(v: &Value) -> Value {
    let latex = v.get("latex").or_else(|| v.get("text")).and_then(Value::as_str).unwrap_or("");
    json!({
        "ok": true,
        "engine": "math",
        "steps": structure::split_solution_steps(latex),
    })
}

fn op_parse_tkztab(v: &Value) -> Value {
    let tex = v.get("tex").or_else(|| v.get("text")).and_then(Value::as_str).unwrap_or("");
    match tkztab::parse_tkztab(tex) {
        Some(model) => json!({ "ok": true, "engine": "math", "model": model }),
        None => json!({ "ok": true, "engine": "math", "model": null }),
    }
}

fn op_sanitize_math_bold(v: &Value) -> Value {
    let tex = v.get("tex").or_else(|| v.get("text")).and_then(Value::as_str).unwrap_or("");
    json!({
        "ok": true,
        "engine": "math",
        "tex": preprocess::sanitize_math_bold(tex),
    })
}

fn op_normalize_bare_math(v: &Value) -> Value {
    let text = v.get("text").or_else(|| v.get("tex")).and_then(Value::as_str).unwrap_or("");
    json!({
        "ok": true,
        "engine": "math",
        "text": preprocess::normalize_bare_math_lines(text),
    })
}

fn op_prepass_text_macros(v: &Value) -> Value {
    let text = v.get("text").or_else(|| v.get("tex")).and_then(Value::as_str).unwrap_or("");
    json!({
        "ok": true,
        "engine": "math",
        "text": preprocess::prepass_text_macros(text),
    })
}

fn op_parse_art_table(v: &Value) -> Value {
    let tex = v.get("tex").or_else(|| v.get("text")).and_then(Value::as_str).unwrap_or("");
    match preprocess::parse_art_table(tex) {
        Some(table) => json!({ "ok": true, "engine": "math", "table": table }),
        None => json!({ "ok": true, "engine": "math", "table": null }),
    }
}

fn op_slice_for_figures(v: &Value) -> Value {
    let content = v.get("content").and_then(Value::as_str).unwrap_or("");
    let figures = v.get("figures").and_then(Value::as_array).cloned().unwrap_or_default();
    preprocess::slice_for_figures(content, &figures)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn preserves_text_macros_at_segment_start() {
        let (segs, _, errs) = analyze::analyze("\\textbf{Soit} $x \\in \\R$");
        assert!(errs.is_empty());
        assert_eq!(segs[0]["type"], "text");
        assert_eq!(segs[0]["raw"], "\\textbf{Soit} ");
        assert_eq!(segs[1]["type"], "inline");
    }

    #[test]
    fn splits_question_and_correction() {
        let src = "\\qst{Calculer $f'(x)$} On dérive : $f'(x)=2x$.";
        let (q, corr) = analyze::split_question_content(src).expect("should split");
        assert_eq!(q, "Calculer $f'(x)$");
        assert_eq!(corr, "On dérive : $f'(x)=2x$.");
    }

    #[test]
    fn repairs_non_size_line_break_brackets() {
        let (repaired, fixes) = normalize::repair_line_break_brackets("a \\\\ [0, 1] \\\\ [4pt] b");
        assert_eq!(fixes, 1);
        assert!(repaired.contains("{}[0, 1]"));
        assert!(repaired.contains("[4pt]"));
    }

    #[test]
    fn normalizes_french_answers() {
        assert_eq!(answer::norm_answer("  Équation, Cœur! "), "equation cour");
    }
}
