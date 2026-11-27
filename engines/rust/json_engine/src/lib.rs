//! `json_engine` — moteur JSON modulaire de mathPlus (Vhtml / Rust → WASM32).
//!
//! Architecture découpée :
//! - [`abi`]         : passerelle C WASM sans `static mut`.
//! - [`helpers`]     : validation de champs, comptage math, normalisation et `excerpt` UTF-8 sûr.
//! - [`schemas`]     : validation des 5 schémas (`manifest`, `class`, `exercise`, `quiz`, `revision`).
//! - [`index_stats`] : indexation structurelle et agrégation statistique.
//! - [`studio`]      : détection de type, audit qualité, diff structuré et formatage Studio Admin.

pub mod domain;
pub mod exercise;
pub mod helpers;
pub mod index_stats;
pub mod routing;
pub mod schemas;
pub mod studio;

#[cfg(all(target_arch = "wasm32", feature = "wasm-entry"))]
pub use wasm_abi::{alloc, dealloc, out_free, out_len, out_ptr};

use serde_json::{json, Value};

const VERSION: &str = "json_engine 1.7.0 (rust/wasm32 modular + studio + exercise-intelligence + crdt-sync + routing + domain)";

#[cfg(all(target_arch = "wasm32", feature = "wasm-entry"))]
#[no_mangle]
pub extern "C" fn process(ptr: *const u8, len: u32) {
    let input = unsafe { std::slice::from_raw_parts(ptr, len as usize) };
    let text = String::from_utf8_lossy(input);
    let out = dispatch(&text);
    wasm_abi::write_output(out.into_bytes());
}

/// Point d'entrée JSON unique (`{"op": ..., "json": ...}`).
pub fn dispatch(input: &str) -> String {
    let parsed: Value = match serde_json::from_str(input) {
        Ok(v) => v,
        Err(e) => return json!({ "ok": false, "error": format!("entrée JSON invalide : {e}") }).to_string(),
    };
    let op = parsed.get("op").and_then(Value::as_str).unwrap_or("");
    match op {
        "info" => return json!({ "ok": true, "engine": "json", "version": VERSION }).to_string(),
        "studio-slugify" => return studio::op_studio_slugify(&parsed).to_string(),
        "studio-next-number" => return studio::op_studio_next_number(&parsed).to_string(),
        "studio-parse-import" => return studio::op_studio_parse_import(&parsed).to_string(),
        "sanitize-title" => return exercise::op_sanitize_title(&parsed).to_string(),
        "merge-progress" => return exercise::op_merge_progress(&parsed).to_string(),
        "chapter-mastery" => return exercise::op_chapter_mastery(&parsed).to_string(),
        "resolve-parent-route" => return routing::op_resolve_parent_route(&parsed).to_string(),
        "resolve-cold-start" => return routing::op_resolve_cold_start(&parsed).to_string(),
        "build-student-href" => return routing::op_build_student_href(&parsed).to_string(),
        "route-depth" => return routing::op_route_depth(&parsed).to_string(),
        "classify-transition" => return routing::op_classify_transition(&parsed).to_string(),
        "problem-strip-prefix" => return domain::op_problem_strip_prefix(&parsed).to_string(),
        "problem-meta" => return domain::op_problem_meta(&parsed).to_string(),
        "problem-themes" => return domain::op_problem_themes(&parsed).to_string(),
        "chapter-pct" => return domain::op_chapter_pct(&parsed).to_string(),
        "inspect-image" => return domain::op_inspect_image(&parsed).to_string(),
        _ => {}
    }

    let doc: Value = match parsed.get("json") {
        Some(Value::String(s)) => match serde_json::from_str(s) {
            Ok(v) => v,
            Err(e) => return json!({ "ok": false, "error": format!("JSON du contenu invalide : {e}") }).to_string(),
        },
        Some(v @ Value::Object(_)) => v.clone(),
        _ => return json!({ "ok": false, "error": "champ « json » manquant" }).to_string(),
    };
    let name = parsed.get("name").and_then(Value::as_str).unwrap_or("(sans nom)");

    let res = match op {
        "validate-manifest" => schemas::v_manifest(&doc, name),
        "validate-class" => schemas::v_class(&doc, name),
        "validate-exercise" => schemas::v_exercise(&doc, name),
        "validate-quiz" => schemas::v_quiz(&doc, name),
        "validate-revision" => schemas::v_revision(&doc, name),
        "index" => index_stats::op_index(&doc, name),
        "stats" => index_stats::op_stats(&doc, name),
        "studio-detect" => studio::op_studio_detect(&doc, name),
        "studio-audit" => studio::op_studio_audit(&doc, name),
        "studio-diff" => studio::op_studio_diff(&parsed, &doc),
        "studio-format" => studio::op_studio_format(&doc),
        "studio-rename-doc" => studio::op_studio_rename_doc(&parsed, &doc),
        "exercise-outline" => exercise::op_exercise_outline(&doc, &parsed),
        _ => json!({ "ok": false, "error": format!("opération inconnue « {op} »") }),
    };
    res.to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn excerpt_is_utf8_safe_on_french_accents() {
        let content = "Étude de la dérivée d'une fonction numérique continue sur l'intervalle [a, b] — équation réduite.";
        let out = helpers::excerpt(content, "derivee", 12);
        assert!(out.contains("dérivée"));
    }

    #[test]
    fn revision_validates_cela_permet_de_and_media() {
        let doc = json!({
            "header": { "title": "Dérivation" },
            "sections": [{
                "title": "Introduction",
                "blocks": [{
                    "type": "cela_permet_de",
                    "content": ["Étudier les variations", "Calculer une tangente"],
                    "media": { "src": "/images/revision/tangente-parabole.svg", "position": "right" }
                }]
            }]
        });
        let res = schemas::v_revision(&doc, "test.json");
        assert_eq!(res["valid"], true);
        assert_eq!(res["stats"]["media"], 1);
    }

    #[test]
    fn studio_audit_and_diff_work_together() {
        let orig = json!({
            "header": { "title": "Suites" },
            "sections": [{ "title": "Définitions", "blocks": [{ "type": "definition", "content": "Soit $(u_n)$ une suite $\\blank{réelle}$." }] }]
        });
        let draft = json!({
            "header": { "title": "Suites numériques" },
            "sections": [{ "title": "Définitions", "blocks": [{ "type": "definition", "content": "Soit $(u_n)$ une suite $\\blank{réelle}$." }] }]
        });
        let audit = studio::op_studio_audit(&draft, "suites.json");
        assert_eq!(audit["valid"], true);
        assert_eq!(audit["metrics"]["blanks"], 1);

        let diff = studio::op_studio_diff(&json!({ "original": orig }), &draft);
        assert_eq!(diff["changed"], true);
        assert_eq!(diff["count"], 1);
    }
}
