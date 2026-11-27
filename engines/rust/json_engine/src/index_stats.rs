//! Indexation structurelle et agrégation de statistiques pour tous les documents JSON.

use serde_json::{json, Value};

pub fn op_index(doc: &Value, name: &str) -> Value {
    let mut items: Vec<Value> = Vec::new();
    if let Some(chapters) = doc.get("chapters").and_then(Value::as_array) {
        for ch in chapters {
            items.push(json!({
                "kind": "chapter",
                "id": ch.get("id").and_then(Value::as_str).unwrap_or(""),
                "title": ch.get("title").and_then(Value::as_str).unwrap_or(""),
                "revisions": ch.get("revisions").and_then(Value::as_array).map(|a| a.len()).unwrap_or(0),
                "quizzes": ch.get("quizzes").and_then(Value::as_array).map(|a| a.len()).unwrap_or(0),
            }));
        }
    } else if let Some(classes) = doc.get("classes").and_then(Value::as_array) {
        for c in classes {
            items.push(json!({
                "kind": "class",
                "id": c.get("id").and_then(Value::as_str).unwrap_or(""),
                "title": c.get("title").and_then(Value::as_str).unwrap_or(""),
                "path": c.get("path").and_then(Value::as_str).unwrap_or(""),
            }));
        }
    } else if let Some(questions) = doc.get("questions").and_then(Value::as_array) {
        for q in questions {
            items.push(json!({
                "kind": "quiz-question",
                "id": q.get("id").and_then(Value::as_str).unwrap_or(""),
                "type": q.get("type").and_then(Value::as_str).unwrap_or(""),
            }));
        }
    } else if let Some(sections) = doc.get("sections").and_then(Value::as_array) {
        for s in sections {
            items.push(json!({
                "kind": "revision-section",
                "id": s.get("id").and_then(Value::as_str).unwrap_or(""),
                "title": s.get("title").and_then(Value::as_str).unwrap_or(""),
                "blocks": s.get("blocks").and_then(Value::as_array).map(|a| a.len()).unwrap_or(0),
            }));
        }
    }
    json!({ "ok": true, "engine": "json", "file": name, "index": items })
}

pub fn op_stats(doc: &Value, name: &str) -> Value {
    let mut stats = json!({ "file": name });
    let obj = stats.as_object_mut().expect("object");
    if let Some(chapters) = doc.get("chapters").and_then(Value::as_array) {
        obj.insert("chapters".into(), json!(chapters.len()));
        let mut revs = 0u32;
        let mut quizzes = 0u32;
        for ch in chapters {
            revs += ch.get("revisions").and_then(Value::as_array).map(|a| a.len()).unwrap_or(0) as u32;
            quizzes += ch.get("quizzes").and_then(Value::as_array).map(|a| a.len()).unwrap_or(0) as u32;
        }
        obj.insert("revisions".into(), json!(revs));
        obj.insert("quizzes".into(), json!(quizzes));
    }
    if let Some(questions) = doc.get("questions").and_then(Value::as_array) {
        obj.insert("questions".into(), json!(questions.len()));
    }
    if let Some(sections) = doc.get("sections").and_then(Value::as_array) {
        obj.insert("sections".into(), json!(sections.len()));
        let mut blocks = 0u32;
        for s in sections {
            blocks += s.get("blocks").and_then(Value::as_array).map(|a| a.len()).unwrap_or(0) as u32;
        }
        obj.insert("blocks".into(), json!(blocks));
    }
    json!({ "ok": true, "engine": "json", "stats": stats })
}
