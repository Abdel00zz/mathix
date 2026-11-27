//! Data-driven loader for Official Moroccan Mathematics Curricula (MEN BIOF JSON files).
//!
//! All curriculum content, capacities, pedagogical recommendations, hors-programme limits,
//! study method tips, and orientation paths live in external JSON files under
//! `public/data/orientation/` (never hardcoded in Rust).

use serde_json::Value;

pub const ORIENTATION_INDEX_PATH: &str = "data/orientation/index.json";

#[derive(Clone, Debug)]
pub struct OrientationClassEntry {
    pub id: String,
    pub label: String,
    pub cycle: String,
    pub source: String,
    pub year: String,
    pub pdf_url: Option<String>,
    pub path: String,
}

#[derive(Clone, Debug)]
pub struct OrientationChapter {
    pub id: u32,
    pub section: String,
    pub title: String,
    pub pages: String,
    pub contents: Vec<String>,
    pub capacities: Vec<String>,
    pub recommendations: Vec<String>,
    pub hors_programme: Vec<String>,
}

#[derive(Clone, Debug)]
pub struct OrientationCurriculum {
    pub class_id: String,
    pub title: String,
    pub source: String,
    pub year: String,
    pub pdf_url: Option<String>,
    pub chapters: Vec<OrientationChapter>,
}

#[derive(Clone, Debug)]
pub struct MethodTip {
    pub title: String,
    pub summary: String,
    pub steps: Vec<String>,
}

#[derive(Clone, Debug)]
pub struct OrientationPath {
    pub title: String,
    pub tag: String,
    pub description: String,
    pub requirements: String,
}

fn str_list(v: Option<&Value>) -> Vec<String> {
    v.and_then(Value::as_array)
        .map(|arr| {
            arr.iter()
                .filter_map(Value::as_str)
                .map(|s| s.trim().to_string())
                .filter(|s| !s.is_empty())
                .collect()
        })
        .unwrap_or_default()
}

pub fn parse_classes(index_doc: Option<&Value>) -> Vec<OrientationClassEntry> {
    let Some(doc) = index_doc else {
        return Vec::new();
    };
    doc.get("classes")
        .and_then(Value::as_array)
        .map(|arr| {
            arr.iter()
                .filter_map(|c| {
                    let id = c.get("id").and_then(Value::as_str)?.trim().to_string();
                    if id.is_empty() {
                        return None;
                    }
                    let label = c
                        .get("label")
                        .and_then(Value::as_str)
                        .unwrap_or(&id)
                        .to_string();
                    let cycle = c
                        .get("cycle")
                        .and_then(Value::as_str)
                        .unwrap_or("")
                        .to_string();
                    let source = c
                        .get("source")
                        .and_then(Value::as_str)
                        .unwrap_or("")
                        .to_string();
                    let year = c
                        .get("year")
                        .and_then(Value::as_str)
                        .unwrap_or("")
                        .to_string();
                    let pdf_url = c
                        .get("pdfUrl")
                        .and_then(Value::as_str)
                        .filter(|s| !s.is_empty())
                        .map(|s| s.to_string());
                    let path = c
                        .get("path")
                        .and_then(Value::as_str)
                        .filter(|s| !s.is_empty())
                        .map(|s| s.to_string())
                        .unwrap_or_else(|| format!("data/orientation/{id}.json"));
                    Some(OrientationClassEntry {
                        id,
                        label,
                        cycle,
                        source,
                        year,
                        pdf_url,
                        path,
                    })
                })
                .collect()
        })
        .unwrap_or_default()
}

pub fn orientation_class_path(index_doc: Option<&Value>, class_id: &str) -> String {
    if let Some(entry) = parse_classes(index_doc).into_iter().find(|c| c.id == class_id) {
        return entry.path;
    }
    let clean = class_id.trim();
    if clean.is_empty() {
        "data/orientation/2eme-bac-sc-math.json".into()
    } else {
        format!("data/orientation/{clean}.json")
    }
}

pub fn parse_curriculum(doc: &Value) -> OrientationCurriculum {
    let class_id = doc
        .get("classId")
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_string();
    let title = doc
        .get("title")
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_string();
    let source = doc
        .get("source")
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_string();
    let year = doc
        .get("year")
        .and_then(Value::as_str)
        .unwrap_or("")
        .to_string();
    let pdf_url = doc
        .get("pdfUrl")
        .and_then(Value::as_str)
        .filter(|s| !s.is_empty())
        .map(|s| s.to_string());

    let chapters = doc
        .get("chapters")
        .and_then(Value::as_array)
        .map(|arr| {
            arr.iter()
                .enumerate()
                .map(|(idx, ch)| OrientationChapter {
                    id: ch
                        .get("id")
                        .and_then(Value::as_u64)
                        .map(|n| n as u32)
                        .unwrap_or((idx + 1) as u32),
                    section: ch
                        .get("section")
                        .and_then(Value::as_str)
                        .unwrap_or("Programme")
                        .to_string(),
                    title: ch
                        .get("title")
                        .and_then(Value::as_str)
                        .unwrap_or("")
                        .to_string(),
                    pages: ch
                        .get("pages")
                        .and_then(Value::as_str)
                        .unwrap_or("")
                        .to_string(),
                    contents: str_list(ch.get("contents")),
                    capacities: str_list(ch.get("capacities")),
                    recommendations: str_list(ch.get("recommendations")),
                    hors_programme: str_list(ch.get("horsProgramme")),
                })
                .collect()
        })
        .unwrap_or_default();

    OrientationCurriculum {
        class_id,
        title,
        source,
        year,
        pdf_url,
        chapters,
    }
}

fn parse_tips_array(v: Option<&Value>) -> Vec<MethodTip> {
    v.and_then(Value::as_array)
        .map(|arr| {
            arr.iter()
                .map(|t| MethodTip {
                    title: t.get("title").and_then(Value::as_str).unwrap_or("").to_string(),
                    summary: t.get("summary").and_then(Value::as_str).unwrap_or("").to_string(),
                    steps: str_list(t.get("steps")),
                })
                .filter(|t| !t.title.is_empty())
                .collect()
        })
        .unwrap_or_default()
}

pub fn parse_method_tips(index_doc: Option<&Value>, class_id: &str) -> Vec<MethodTip> {
    let Some(mt) = index_doc.and_then(|d| d.get("methodTips")) else {
        return Vec::new();
    };
    let mut tips = parse_tips_array(mt.get("common"));
    let specific_key = if mt.get(class_id).is_some() {
        class_id
    } else if class_id.contains("college") {
        "college"
    } else if class_id.contains("2eme-bac") {
        if class_id.contains("sc-math") {
            "2eme-bac-sc-math"
        } else {
            "2eme-bac-sc-ex"
        }
    } else {
        "lycee"
    };
    tips.extend(parse_tips_array(mt.get(specific_key)));
    tips
}

pub fn parse_orientation_paths(index_doc: Option<&Value>, class_id: &str) -> Vec<OrientationPath> {
    let Some(op) = index_doc.and_then(|d| d.get("orientationPaths")) else {
        return Vec::new();
    };
    let key = if class_id.contains("college") {
        "college"
    } else if class_id.contains("tronc-commun") {
        "tronc-commun"
    } else {
        "bac"
    };
    op.get(key)
        .and_then(Value::as_array)
        .map(|arr| {
            arr.iter()
                .map(|p| OrientationPath {
                    title: p.get("title").and_then(Value::as_str).unwrap_or("").to_string(),
                    tag: p.get("tag").and_then(Value::as_str).unwrap_or("").to_string(),
                    description: p
                        .get("description")
                        .and_then(Value::as_str)
                        .unwrap_or("")
                        .to_string(),
                    requirements: p
                        .get("requirements")
                        .and_then(Value::as_str)
                        .unwrap_or("")
                        .to_string(),
                })
                .filter(|p| !p.title.is_empty())
                .collect()
        })
        .unwrap_or_default()
}
