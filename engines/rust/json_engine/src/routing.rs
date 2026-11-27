//! `json_engine::routing` — résolution hiérarchique des routes, amorçage à froid,
//! génération d'URL élève et classification sémantique des transitions morphing.

use serde_json::{json, Value};

const TAB_ORDER: &[&str] = &["chapitres", "examens", "problemes", "olympiad", "concours"];

pub fn normalize_route_key(raw: &str) -> String {
    let stripped = raw.strip_prefix('#').unwrap_or(raw).trim();
    if stripped.is_empty() {
        return "/".to_string();
    }
    if stripped.starts_with('/') {
        stripped.to_string()
    } else {
        format!("/{stripped}")
    }
}

fn split_path_query(key: &str) -> (&str, &str) {
    match key.split_once('?') {
        Some((p, q)) => (p, q),
        None => (key, ""),
    }
}

fn query_param<'a>(qs: &'a str, name: &str) -> Option<&'a str> {
    if qs.is_empty() {
        return None;
    }
    for pair in qs.split('&') {
        if let Some((k, v)) = pair.split_once('=') {
            if k == name && !v.is_empty() {
                return Some(v);
            }
        }
    }
    None
}

fn percent_encode_component(s: &str) -> String {
    let mut out = String::with_capacity(s.len() + 16);
    for b in s.bytes() {
        let unreserved = b.is_ascii_alphanumeric()
            || matches!(b, b'-' | b'_' | b'.' | b'!' | b'~' | b'*' | b'\'' | b'(' | b')');
        if unreserved {
            out.push(b as char);
        } else {
            out.push_str(&format!("%{b:02X}"));
        }
    }
    out
}

/// Déduit la route parente logique dans la hiérarchie pédagogique de Mathix.
pub fn resolve_parent_route(raw: &str) -> Option<String> {
    let key = normalize_route_key(raw);
    let (path, qs) = split_path_query(&key);

    if matches!(path, "/" | "/eleve" | "/dashboard") {
        return None;
    }
    if path == "/studio" || path.starts_with("/studio/") {
        return Some("/dashboard".to_string());
    }

    let segs: Vec<&str> = path.split('/').filter(|s| !s.is_empty()).collect();
    if segs.first() == Some(&"eleve") {
        match segs.as_slice() {
            ["eleve", class_id, "exercices", chap_id] => {
                if query_param(qs, "ex").is_some() {
                    return Some(format!("/eleve/{class_id}/exercices/{chap_id}"));
                }
                return Some(format!("/eleve/{class_id}"));
            }
            ["eleve", class_id, "revision", chap_id, ..] => {
                if *chap_id == "problemes" {
                    return Some(format!("/eleve/{class_id}?tab=problemes"));
                }
                return Some(format!("/eleve/{class_id}"));
            }
            ["eleve", class_id, "quiz", _chap_id, ..] => {
                return Some(format!("/eleve/{class_id}"));
            }
            ["eleve", class_id, "concours", _school] => {
                return Some(format!("/eleve/{class_id}?tab=concours"));
            }
            ["eleve", class_id, "examen", rest @ ..] if !rest.is_empty() => {
                return Some(format!("/eleve/{class_id}?tab=examens"));
            }
            ["eleve", class_id, "cadre"] => {
                return Some(format!("/eleve/{class_id}?tab=examens"));
            }
            ["eleve", class_id] => {
                if let Some(tab) = query_param(qs, "tab") {
                    if tab != "chapitres" {
                        return Some(format!("/eleve/{class_id}"));
                    }
                }
                return Some("/eleve".to_string());
            }
            _ => {}
        }
    }

    Some("/".to_string())
}

fn is_class_dashboard_route(route: &str) -> bool {
    let (path, _) = split_path_query(route);
    let segs: Vec<&str> = path.split('/').filter(|s| !s.is_empty()).collect();
    segs.len() == 2 && segs[0] == "eleve"
}

/// Construit la chaîne d'ancêtres à amorcer sous un lien profond ouvert à froid.
pub fn resolve_cold_start_ancestors(raw: &str, max_depth: usize) -> Vec<String> {
    let key = normalize_route_key(raw);
    let (path, _) = split_path_query(&key);
    if matches!(path, "/" | "/eleve" | "/dashboard") || is_class_dashboard_route(path) {
        return Vec::new();
    }

    let mut ancestors = Vec::new();
    let mut cursor = key;
    for _ in 0..max_depth {
        let Some(parent) = resolve_parent_route(&cursor) else {
            break;
        };
        if parent == cursor || parent == "/" || parent == "/eleve" {
            break;
        }
        ancestors.insert(0, parent.clone());
        if is_class_dashboard_route(&parent) {
            break;
        }
        cursor = parent;
    }
    ancestors
}

/// Construit le lien exact côté Élève pour un fichier JSON de contenu.
pub fn build_student_href_for_path(data_path: &str, prefix: &str) -> String {
    let mut clean = data_path.trim_start_matches('/').to_string();
    if let Some(r) = clean.strip_prefix("public/") {
        clean = r.to_string();
    }
    if let Some(r) = clean.strip_prefix("data/1er-bac-sc-math/") {
        clean = format!("data/1ere-bac-sc-math/{r}");
    }

    if clean == "data/olympiad-index.json" {
        return format!("{prefix}#/eleve/1ere-bac-sc-math?tab=olympiad");
    }

    let segs: Vec<&str> = clean.split('/').collect();
    let is_json = clean.ends_with(".json");

    if is_json && segs.first() == Some(&"data") {
        // data/concours/.../*.json
        if segs.len() >= 3 && segs[1] == "concours" {
            return format!("{prefix}#/eleve/2eme-bac-sc-math?tab=concours");
        }
        // data/classes/:classId.json
        if segs.len() == 3 && segs[1] == "classes" {
            if let Some(cls) = segs[2].strip_suffix(".json") {
                return format!("{prefix}#/eleve/{cls}");
            }
        }
        if segs.len() >= 4 {
            let cls = segs[1];
            let sub = segs[2];
            let file = segs[segs.len() - 1];
            let encoded = percent_encode_component(&clean);

            // data/:cls/problemes/index.json ou data/:cls/problemes/*.json
            if sub == "problemes" {
                if segs.len() == 4 && file == "index.json" {
                    return format!("{prefix}#/eleve/{cls}?tab=problemes");
                }
                return format!("{prefix}#/eleve/{cls}/revision/problemes/{encoded}");
            }
            // data/:cls/examen/cadre_referentiel.json | index.json | *.json
            if sub == "examen" && segs.len() == 4 && file == "cadre_referentiel.json" {
                return format!("{prefix}#/eleve/{cls}/cadre");
            }
            if sub == "examen" && segs.len() == 4 && file == "index.json" {
                return format!("{prefix}#/eleve/{cls}?tab=examens");
            }
            if matches!(sub, "examen" | "olympiad" | "olympiades") && file != "index.json" {
                return format!("{prefix}#/eleve/{cls}/examen/{encoded}");
            }
            // data/:cls/:chap/manifest.json
            if segs.len() == 4
                && file == "manifest.json"
                && !matches!(sub, "examen" | "problemes" | "olympiad")
            {
                return format!("{prefix}#/eleve/{cls}/exercices/{sub}");
            }
            // data/:cls/:chap/revisions|quiz|exercises/.../*.json
            if segs.len() >= 5 {
                let kind = segs[3];
                if kind == "revisions" {
                    return format!("{prefix}#/eleve/{cls}/revision/{sub}/{encoded}");
                }
                if kind == "quiz" {
                    return format!("{prefix}#/eleve/{cls}/quiz/{sub}/{encoded}");
                }
                if kind == "exercises" {
                    return format!("{prefix}#/eleve/{cls}/exercices/{sub}?ex={encoded}");
                }
            }
        }
    }

    prefix.to_string()
}

/// Calcule la profondeur hiérarchique d'une route pour le morphing directionnel.
pub fn route_depth(raw: &str) -> u32 {
    let key = normalize_route_key(raw);
    let (path, qs) = split_path_query(&key);
    if matches!(path, "/" | "/eleve" | "/dashboard") {
        return 0;
    }
    let segs: Vec<&str> = path.split('/').filter(|s| !s.is_empty()).collect();
    if segs.len() == 2 && segs[0] == "eleve" {
        return 1;
    }
    if segs.len() == 4
        && segs[0] == "eleve"
        && segs[2] == "exercices"
        && query_param(qs, "ex").is_some()
    {
        return 3;
    }
    if (segs.len() > 2 && segs[0] == "eleve") || path.starts_with("/studio") {
        return 2;
    }
    1
}

/// Classe sémantiquement la transition entre deux routes (`tab`, `drill-in`, `drill-out`, `peer`).
pub fn classify_nav_transition(from_raw: &str, to_raw: &str, dir: &str) -> Value {
    if from_raw.is_empty() || to_raw.is_empty() || from_raw == to_raw {
        return json!({ "kind": "peer", "dir": dir });
    }
    let from_key = normalize_route_key(from_raw);
    let to_key = normalize_route_key(to_raw);
    let (from_path, from_qs) = split_path_query(&from_key);
    let (to_path, to_qs) = split_path_query(&to_key);

    let f_segs: Vec<&str> = from_path.split('/').filter(|s| !s.is_empty()).collect();
    let t_segs: Vec<&str> = to_path.split('/').filter(|s| !s.is_empty()).collect();
    if f_segs.len() == 2 && t_segs.len() == 2 && f_segs[0] == "eleve" && t_segs[0] == "eleve" && f_segs[1] == t_segs[1] {
        fn canonical_tab(t: &str) -> &str {
            match t {
                "cours" => "chapitres",
                "olympiades" => "olympiad",
                other => other,
            }
        }
        let from_tab = canonical_tab(query_param(from_qs, "tab").unwrap_or("chapitres"));
        let to_tab = canonical_tab(query_param(to_qs, "tab").unwrap_or("chapitres"));
        let from_idx = TAB_ORDER.iter().position(|&t| t == from_tab);
        let to_idx = TAB_ORDER.iter().position(|&t| t == to_tab);
        let tab_dir = match (from_idx, to_idx) {
            (Some(fi), Some(ti)) => if ti >= fi { "right" } else { "left" },
            _ => if dir == "back" { "left" } else { "right" },
        };
        return json!({
            "kind": "tab",
            "tabDir": tab_dir,
            "fromTab": from_tab,
            "toTab": to_tab,
            "dir": dir,
        });
    }

    let d_from = route_depth(from_raw);
    let d_to = route_depth(to_raw);
    if dir == "back" || d_to < d_from {
        return json!({ "kind": "drill-out", "dir": dir });
    }
    if d_to > d_from {
        return json!({ "kind": "drill-in", "dir": dir });
    }
    json!({ "kind": "peer", "dir": dir })
}

/* ── Opérations JSON dispatchées ─────────────────────────────────────────── */

pub fn op_resolve_parent_route(req: &Value) -> Value {
    let raw = req.get("hash").or_else(|| req.get("route")).and_then(Value::as_str).unwrap_or("");
    let normalized = normalize_route_key(raw);
    let parent = resolve_parent_route(raw);
    json!({
        "ok": true,
        "engine": "json",
        "normalized": normalized,
        "parent": parent,
    })
}

pub fn op_resolve_cold_start(req: &Value) -> Value {
    let raw = req.get("hash").or_else(|| req.get("route")).and_then(Value::as_str).unwrap_or("");
    let max_depth = req.get("maxDepth").and_then(Value::as_u64).unwrap_or(2) as usize;
    json!({
        "ok": true,
        "engine": "json",
        "ancestors": resolve_cold_start_ancestors(raw, max_depth),
    })
}

pub fn op_build_student_href(req: &Value) -> Value {
    let data_path = req.get("path").and_then(Value::as_str).unwrap_or("");
    let prefix = req.get("prefix").and_then(Value::as_str).unwrap_or("../");
    json!({
        "ok": true,
        "engine": "json",
        "href": build_student_href_for_path(data_path, prefix),
    })
}

pub fn op_route_depth(req: &Value) -> Value {
    let raw = req.get("route").or_else(|| req.get("hash")).and_then(Value::as_str).unwrap_or("");
    json!({
        "ok": true,
        "engine": "json",
        "depth": route_depth(raw),
    })
}

pub fn op_classify_transition(req: &Value) -> Value {
    let from = req.get("from").and_then(Value::as_str).unwrap_or("");
    let to = req.get("to").and_then(Value::as_str).unwrap_or("");
    let dir = req.get("dir").and_then(Value::as_str).unwrap_or("push");
    let mut res = classify_nav_transition(from, to, dir);
    if let Some(obj) = res.as_object_mut() {
        obj.insert("ok".to_string(), Value::Bool(true));
        obj.insert("engine".to_string(), Value::String("json".to_string()));
    }
    res
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn resolves_parent_hierarchy_and_cold_start() {
        assert_eq!(resolve_parent_route("#/"), None);
        assert_eq!(
            resolve_parent_route("#/eleve/2eme-bac-sc-math/exercices/limites?ex=e1"),
            Some("/eleve/2eme-bac-sc-math/exercices/limites".to_string())
        );
        assert_eq!(
            resolve_cold_start_ancestors("#/eleve/2eme-bac-sc-math/exercices/limites?ex=e1", 2),
            vec![
                "/eleve/2eme-bac-sc-math".to_string(),
                "/eleve/2eme-bac-sc-math/exercices/limites".to_string()
            ]
        );
    }

    #[test]
    fn builds_student_hrefs_correctly() {
        assert_eq!(
            build_student_href_for_path("public/data/1er-bac-sc-math/problemes/index.json", "../"),
            "../#/eleve/1ere-bac-sc-math?tab=problemes"
        );
        assert_eq!(
            build_student_href_for_path("data/2eme-bac-sc-math/limites/exercises/ex1.json", "../"),
            "../#/eleve/2eme-bac-sc-math/exercices/limites?ex=data%2F2eme-bac-sc-math%2Flimites%2Fexercises%2Fex1.json"
        );
    }

    #[test]
    fn classifies_tabs_and_drill_transitions() {
        let t = classify_nav_transition("#/eleve/2bac?tab=chapitres", "#/eleve/2bac?tab=problemes", "push");
        assert_eq!(t["kind"], "tab");
        assert_eq!(t["tabDir"], "right");
        let d = classify_nav_transition("#/eleve/2bac", "#/eleve/2bac/revision/ch1/f.json", "push");
        assert_eq!(d["kind"], "drill-in");
    }
}
