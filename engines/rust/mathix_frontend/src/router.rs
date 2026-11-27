//! Hash router for Student SPA and feature-gated Admin Console.

use std::collections::BTreeMap;
use serde_json::json;

use crate::html::{format_class_name, url_decode};

#[derive(Clone, Debug, PartialEq)]
pub enum Route {
    RolePicker,
    Dashboard { class_id: String, tab: String },
    Cadre { class_id: String },
    Revision { class_id: String, chapter_id: String, path: String },
    Quiz { class_id: String, chapter_id: String, path: String },
    Concours { class_id: String, school_id: String, mode: String, path: Option<String>, theme: Option<String> },
    ExerciseList { class_id: String, chapter_id: String },
    ExerciseDetail { class_id: String, chapter_id: String, ex_path: String },
    ExamDetail { class_id: String, path: String, theme: Option<String> },
    #[cfg(feature = "admin")]
    Admin { tab: String, query: BTreeMap<String, String> },
}

pub fn parse_query(qs: &str) -> BTreeMap<String, String> {
    let mut map = BTreeMap::new();
    for part in qs.split('&') {
        if part.is_empty() { continue; }
        let mut it = part.splitn(2, '=');
        let k = url_decode(it.next().unwrap_or(""));
        let v = url_decode(it.next().unwrap_or(""));
        if !k.is_empty() {
            map.insert(k, v);
        }
    }
    map
}

pub fn parse_route(raw_hash: &str, is_admin: bool, default_class: Option<&str>) -> Route {
    let trimmed = raw_hash.trim_start_matches('#');
    let (path_part, query_part) = match trimmed.split_once('?') {
        Some((p, q)) => (p, q),
        None => (trimmed, ""),
    };
    let query = parse_query(query_part);
    let segs: Vec<String> = path_part
        .trim_matches('/')
        .split('/')
        .filter(|s| !s.is_empty())
        .map(url_decode)
        .collect();

    #[cfg(feature = "admin")]
    if is_admin {
        let tab = segs
            .first()
            .map(|s| s.as_str())
            .filter(|t| matches!(*t, "dashboard" | "stats" | "journal" | "studio" | "pilotage" | "contenu" | "users"))
            .unwrap_or("dashboard")
            .to_string();
        return Route::Admin { tab, query };
    }
    let _ = is_admin;

    if segs.is_empty() {
        if let Some(cid) = default_class {
            return Route::Dashboard { class_id: cid.to_string(), tab: "cours".into() };
        }
        return Route::RolePicker;
    }

    if segs[0] != "eleve" {
        return Route::RolePicker;
    }
    if segs.len() == 1 {
        return Route::RolePicker;
    }

    let class_id = segs[1].clone();
    if segs.len() == 2 {
        let tab = query.get("tab").cloned().unwrap_or_else(|| "cours".into());
        return Route::Dashboard { class_id, tab };
    }

    match segs[2].as_str() {
        "cadre" => Route::Cadre { class_id },
        "revision" if segs.len() >= 5 => Route::Revision {
            class_id,
            chapter_id: segs[3].clone(),
            path: segs[4..].join("/"),
        },
        "quiz" if segs.len() >= 5 => Route::Quiz {
            class_id,
            chapter_id: segs[3].clone(),
            path: segs[4..].join("/"),
        },
        "concours" if segs.len() >= 4 => Route::Concours {
            class_id,
            school_id: segs[3].clone(),
            mode: query.get("mode").cloned().unwrap_or_else(|| "training".into()),
            path: query
                .get("path")
                .map(|s| s.trim().to_string())
                .filter(|s| !s.is_empty()),
            theme: query
                .get("theme")
                .map(|s| s.trim().to_string())
                .filter(|s| !s.is_empty()),
        },
        "exercices" if segs.len() >= 4 => {
            if let Some(ex) = query.get("ex").filter(|s| !s.is_empty()) {
                Route::ExerciseDetail {
                    class_id,
                    chapter_id: segs[3].clone(),
                    ex_path: ex.clone(),
                }
            } else {
                Route::ExerciseList {
                    class_id,
                    chapter_id: segs[3].clone(),
                }
            }
        }
        "examen" if segs.len() >= 4 => Route::ExamDetail {
            class_id,
            path: segs[3..].join("/"),
            theme: query
                .get("theme")
                .map(|s| s.trim().to_string())
                .filter(|s| !s.is_empty()),
        },
        _ => Route::Dashboard {
            class_id,
            tab: query.get("tab").cloned().unwrap_or_else(|| "cours".into()),
        },
    }
}

impl Route {
    pub fn view_type(&self) -> &'static str {
        match self {
            Route::RolePicker => "classes",
            Route::Dashboard { .. } | Route::Cadre { .. } => "learn",
            Route::Revision { .. } => "les",
            Route::Quiz { .. } | Route::Concours { .. } => "quiz",
            Route::ExerciseList { .. } => "exo-list",
            Route::ExerciseDetail { .. } | Route::ExamDetail { .. } => "exo",
            #[cfg(feature = "admin")]
            Route::Admin { .. } => "admin",
        }
    }

    pub fn has_sidebar(&self) -> bool {
        matches!(self, Route::Dashboard { .. })
    }

    pub fn document_title(&self) -> String {
        match self {
            Route::RolePicker => "Mathix — Choisir une classe".into(),
            Route::Dashboard { class_id, .. } => format!("Mathix — {}", format_class_name(class_id)),
            Route::Cadre { class_id } => format!("Cadre référentiel — {}", format_class_name(class_id)),
            Route::Revision { .. } => "Mathix — Fiche de cours".into(),
            Route::Quiz { .. } => "Mathix — Quiz interactif".into(),
            Route::Concours { school_id, .. } => format!("Mathix — Concours {}", school_id.to_uppercase()),
            Route::ExerciseList { .. } => "Mathix — Série d’exercices".into(),
            Route::ExerciseDetail { .. } => "Mathix — Exercice".into(),
            Route::ExamDetail { .. } => "Mathix — Examen".into(),
            #[cfg(feature = "admin")]
            Route::Admin { .. } => "Mathix — Administration".into(),
        }
    }

    pub fn canonical_hash(&self) -> String {
        match self {
            Route::RolePicker => "#/eleve".into(),
            Route::Dashboard { class_id, tab } => {
                if tab == "cours" || tab.is_empty() {
                    format!("#/eleve/{class_id}")
                } else {
                    format!("#/eleve/{class_id}?tab={tab}")
                }
            }
            Route::Cadre { class_id } => format!("#/eleve/{class_id}/cadre"),
            Route::Revision { class_id, chapter_id, path } => format!("#/eleve/{class_id}/revision/{chapter_id}/{path}"),
            Route::Quiz { class_id, chapter_id, path } => format!("#/eleve/{class_id}/quiz/{chapter_id}/{path}"),
            Route::Concours { class_id, school_id, mode, path, theme } => {
                let mut h = format!("#/eleve/{class_id}/concours/{school_id}?mode={mode}");
                if let Some(p) = path.as_deref().filter(|s| !s.is_empty()) {
                    h.push_str("&path=");
                    h.push_str(&crate::html::url_encode(p));
                }
                if let Some(t) = theme.as_deref().filter(|s| !s.is_empty()) {
                    h.push_str("&theme=");
                    h.push_str(&crate::html::url_encode(t));
                }
                h
            }
            Route::ExerciseList { class_id, chapter_id } => format!("#/eleve/{class_id}/exercices/{chapter_id}"),
            Route::ExerciseDetail { class_id, chapter_id, ex_path } => {
                format!("#/eleve/{class_id}/exercices/{chapter_id}?ex={}", crate::html::url_encode(ex_path))
            }
            Route::ExamDetail { class_id, path, theme } => match theme.as_deref().filter(|s| !s.is_empty()) {
                Some(t) => format!("#/eleve/{class_id}/examen/{path}?theme={}", crate::html::url_encode(t)),
                None => format!("#/eleve/{class_id}/examen/{path}"),
            },
            #[cfg(feature = "admin")]
            Route::Admin { tab, .. } => format!("#/{tab}"),
        }
    }
}

pub fn classify_transition(prev_hash: &str, next_hash: &str) -> (String, String) {
    if prev_hash.is_empty() {
        return ("none".into(), String::new());
    }
    let res = json_engine::routing::op_classify_transition(&json!({
        "from": prev_hash,
        "to": next_hash
    }));
    let kind = res.get("kind").and_then(|v| v.as_str()).unwrap_or("peer");
    let dir = match kind {
        "tab" => match res.get("tabDir").and_then(|v| v.as_str()) {
            Some("left") => "back",
            _ => "forward",
        },
        "drill-out" => "back",
        "drill-in" => "forward",
        _ => "forward",
    };
    (kind.to_string(), dir.to_string())
}

pub fn build_student_href_for_path(path: &str, prefix: &str) -> Option<String> {
    let res = json_engine::routing::op_build_student_href(&json!({
        "path": path,
        "prefix": prefix
    }));
    res.get("href").and_then(|v| v.as_str()).map(|s| s.to_string())
}
