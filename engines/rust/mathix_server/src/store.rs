//! Persistance JSON atomique + fusion CRDT côté serveur via `json_engine::exercise`.
//! Aligne strictement son modèle de données et de révisions sur `api/_store.js` (Vercel + Upstash Redis).

use serde_json::{json, Map, Value};
use std::collections::BTreeSet;
use std::fs;
use std::path::PathBuf;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::RwLock;
use std::time::{SystemTime, UNIX_EPOCH};

pub const VALID_NS: &[&str] = &[
    "users",
    "overrides",
    "config",
    "history",
    "progress-core",
    "progress-quiz",
    "progress-exercises",
    "progress-revision",
    "profile",
];

pub const ADMIN_WRITE_NS: &[&str] = &["users", "overrides", "config", "history"];
pub const ADMIN_ONLY_READ_NS: &[&str] = &["users", "history"];

const PROGRESS_NS: &[&str] = &[
    "progress-core",
    "progress-quiz",
    "progress-exercises",
    "progress-revision",
];

const STUDENT_NS: &[&str] = &[
    "progress-core",
    "progress-quiz",
    "progress-exercises",
    "progress-revision",
    "profile",
];

static EVENT_SEQ: AtomicU64 = AtomicU64::new(1);
static TMP_SEQ: AtomicU64 = AtomicU64::new(1);

pub fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

pub fn is_valid_ns(ns: &str) -> bool {
    VALID_NS.contains(&ns)
}

pub fn is_admin_write_ns(ns: &str) -> bool {
    ADMIN_WRITE_NS.contains(&ns)
}

pub fn is_admin_only_read_ns(ns: &str) -> bool {
    ADMIN_ONLY_READ_NS.contains(&ns)
}

pub fn is_valid_key(key: &str) -> bool {
    if key.is_empty() || key.len() > 160 {
        return false;
    }
    if matches!(key, "__proto__" | "constructor" | "prototype") {
        return false;
    }
    key.bytes()
        .all(|b| b.is_ascii_alphanumeric() || matches!(b, b'_' | b':' | b'.' | b'-' | b'/'))
}

pub fn is_valid_student_id(id: &str) -> bool {
    if id.len() < 3 || id.len() > 48 {
        return false;
    }
    if matches!(id, "__proto__" | "constructor" | "prototype") {
        return false;
    }
    id.bytes()
        .all(|b| b.is_ascii_alphanumeric() || matches!(b, b'_' | b'-'))
}

fn default_db() -> Value {
    json!({
        "rev": 1,
        "pubRev": 1,
        "users": [],
        "overrides": {},
        "config": {},
        "history": {},
        "progress-core": {},
        "progress-quiz": {},
        "progress-exercises": {},
        "progress-revision": {},
        "profile": {},
        "students": {},
        "stRev": {},
        "events": [],
        "adminAuth": null,
        "tokenSecret": null,
    })
}

pub struct Store {
    db_file: PathBuf,
    data_dir: PathBuf,
    state: RwLock<Value>,
}

impl Store {
    pub fn open(data_dir: PathBuf) -> Self {
        let db_file = data_dir.join("db.json");
        let loaded = match fs::read_to_string(&db_file)
            .ok()
            .and_then(|raw| serde_json::from_str(&raw).ok())
        {
            Some(Value::Object(parsed)) => {
                let mut base = default_db();
                if let Some(base_map) = base.as_object_mut() {
                    for (k, v) in parsed {
                        base_map.insert(k, v);
                    }
                }
                base
            }
            _ => {
                let fresh = default_db();
                let _ = write_atomic(&data_dir, &db_file, &fresh);
                fresh
            }
        };

        Self {
            db_file,
            data_dir,
            state: RwLock::new(loaded),
        }
    }

    pub fn db_path_display(&self) -> String {
        self.db_file.display().to_string()
    }

    pub fn revisions(&self) -> (u64, u64) {
        let db = self.state.read().unwrap();
        let rev = db["rev"].as_u64().unwrap_or(1);
        let pub_rev = db["pubRev"].as_u64().unwrap_or(1);
        (rev, pub_rev)
    }

    fn bump_rev(db: &mut Value, bump_pub: bool) -> (u64, u64) {
        let next_rev = db["rev"].as_u64().unwrap_or(1).saturating_add(1);
        let next_pub = if bump_pub {
            db["pubRev"].as_u64().unwrap_or(1).saturating_add(1)
        } else {
            db["pubRev"].as_u64().unwrap_or(1)
        };
        if let Some(m) = db.as_object_mut() {
            m.insert("rev".into(), json!(next_rev));
            m.insert("pubRev".into(), json!(next_pub));
        }
        (next_rev, next_pub)
    }

    fn persist_locked(&self, db: &Value) {
        if let Err(err) = write_atomic(&self.data_dir, &self.db_file, db) {
            eprintln!("[mathix-server] persistance disque indisponible : {err}");
        }
    }

    /* ── Authentification & secret interne ───────────────────────────────── */

    pub fn get_admin_auth(&self) -> Option<Value> {
        let db = self.state.read().unwrap();
        let v = db.get("adminAuth")?;
        if v.is_object() {
            Some(v.clone())
        } else {
            None
        }
    }

    pub fn claim_admin_auth(&self, record: Value) -> bool {
        let mut db = self.state.write().unwrap();
        if db.get("adminAuth").map(Value::is_object).unwrap_or(false) {
            return false;
        }
        if let Some(m) = db.as_object_mut() {
            m.insert("adminAuth".into(), record);
        }
        self.persist_locked(&db);
        true
    }

    pub fn update_admin_auth(&self, record: Value) -> bool {
        let mut db = self.state.write().unwrap();
        if let Some(m) = db.as_object_mut() {
            m.insert("adminAuth".into(), record);
            self.persist_locked(&db);
            return true;
        }
        false
    }

    pub fn get_or_create_token_secret<F: FnOnce() -> String>(&self, gen: F) -> String {
        {
            let db = self.state.read().unwrap();
            if let Some(s) = db.get("tokenSecret").and_then(Value::as_str) {
                if s.len() >= 32 {
                    return s.to_string();
                }
            }
        }
        let mut db = self.state.write().unwrap();
        if let Some(s) = db.get("tokenSecret").and_then(Value::as_str) {
            if s.len() >= 32 {
                return s.to_string();
            }
        }
        let fresh = gen();
        if let Some(m) = db.as_object_mut() {
            m.insert("tokenSecret".into(), json!(fresh));
        }
        self.persist_locked(&db);
        fresh
    }

    /* ── Événements ──────────────────────────────────────────────────────── */

    fn push_event_locked(db: &mut Value, ev_type: &str, message: &str, actor: &str) {
        let clean_msg = message.trim();
        if clean_msg.is_empty() {
            return;
        }
        let at = now_ms();
        let seq = EVENT_SEQ.fetch_add(1, Ordering::Relaxed);
        let id = format!("e-{at}-{seq:x}");
        let ev = json!({
            "id": id,
            "at": at,
            "type": ev_type,
            "message": clean_msg.chars().take(240).collect::<String>(),
            "actor": actor,
        });
        if let Some(arr) = db.get_mut("events").and_then(Value::as_array_mut) {
            arr.insert(0, ev);
            if arr.len() > 200 {
                arr.truncate(200);
            }
        }
    }

    pub fn log_event(&self, ev_type: &str, message: &str, actor: &str) {
        if let Ok(mut db) = self.state.write() {
            Self::push_event_locked(&mut db, ev_type, message, actor);
            Self::bump_rev(&mut db, false);
            self.persist_locked(&db);
        }
    }

    pub fn list_events(&self) -> Value {
        let db = self.state.read().unwrap();
        let events: Vec<Value> = db
            .get("events")
            .and_then(Value::as_array)
            .map(|a| a.iter().take(120).cloned().collect())
            .unwrap_or_default();
        json!({ "ok": true, "persistence": "file", "events": events })
    }

    /* ── Store clé-valeur ────────────────────────────────────────────────── */

    pub fn get_store(&self, ns: &str, key: Option<&str>) -> Value {
        let db = self.state.read().unwrap();
        let ns_val = db
            .get(ns)
            .cloned()
            .unwrap_or_else(|| if ns == "users" { json!([]) } else { json!({}) });
        let data = match key {
            Some(k) => ns_val.get(k).cloned().unwrap_or(Value::Null),
            None => ns_val,
        };
        json!({ "ok": true, "ns": ns, "persistence": "file", "data": data })
    }

    pub fn set_store(&self, ns: &str, key: &str, value: Value) -> Value {
        let mut db = self.state.write().unwrap();
        let merged_val = if PROGRESS_NS.contains(&ns) && value.is_object() {
            let existing = db
                .get(ns)
                .and_then(|m| m.get(key))
                .cloned()
                .unwrap_or_else(|| Value::Object(Map::new()));
            merge_progress_ns(ns, &existing, &value)
        } else {
            value
        };

        if let Some(root_map) = db.as_object_mut() {
            let ns_entry = root_map
                .entry(ns.to_string())
                .or_insert_with(|| Value::Object(Map::new()));
            if let Some(ns_map) = ns_entry.as_object_mut() {
                ns_map.insert(key.to_string(), merged_val);
            }
        }
        let bump_pub = ns == "overrides" || ns == "config";
        Self::bump_rev(&mut db, bump_pub);
        Self::push_event_locked(
            &mut db,
            "sync",
            &format!("{ns}/{key} mis à jour"),
            if is_admin_write_ns(ns) { "admin" } else { "eleve" },
        );
        self.persist_locked(&db);
        json!({ "ok": true, "ns": ns, "key": key, "persistence": "file" })
    }

    pub fn delete_store(&self, ns: &str, key: &str) -> Value {
        let mut db = self.state.write().unwrap();
        if let Some(ns_map) = db.get_mut(ns).and_then(Value::as_object_mut) {
            ns_map.remove(key);
        }
        let bump_pub = ns == "overrides" || ns == "config";
        Self::bump_rev(&mut db, bump_pub);
        self.persist_locked(&db);
        json!({ "ok": true, "persistence": "file" })
    }

    /* ── Synchronisation Élève (partitionnée CRDT + publications Admin) ──── */

    pub fn get_student_sync(&self, student_id: &str, since_pub: u64, since_st: u64) -> Value {
        let db = self.state.read().unwrap();
        let pub_rev = db["pubRev"].as_u64().unwrap_or(1);
        let valid_st = is_valid_student_id(student_id);
        let st_rev = if valid_st {
            db["stRev"][student_id].as_u64().unwrap_or(0)
        } else {
            0
        };
        if since_pub > 0 && pub_rev <= since_pub && st_rev <= since_st {
            return json!({
                "ok": true,
                "backend": "rust",
                "persistence": "file",
                "scope": "student",
                "changed": false,
                "rev": pub_rev,
                "stRev": st_rev,
                "syncedAt": now_ms(),
            });
        }
        let student = if valid_st {
            db["students"].get(student_id).cloned().unwrap_or(Value::Null)
        } else {
            Value::Null
        };
        json!({
            "ok": true,
            "backend": "rust",
            "persistence": "file",
            "scope": "student",
            "changed": true,
            "rev": pub_rev,
            "stRev": st_rev,
            "overrides": db.get("overrides").cloned().unwrap_or_else(|| json!({})),
            "config": db.get("config").cloned().unwrap_or_else(|| json!({})),
            "student": student,
            "syncedAt": now_ms(),
        })
    }

    pub fn merge_student_sync(&self, student_id: &str, body: &Value) -> Value {
        let mut db = self.state.write().unwrap();
        let mut current = db["students"]
            .get(student_id)
            .cloned()
            .filter(Value::is_object)
            .unwrap_or_else(|| {
                json!({
                    "profile": {},
                    "progress-revision": {},
                    "progress-quiz": {},
                    "progress-exercises": {},
                    "progress-core": {},
                    "updatedAt": 0,
                })
            });

        let mut updated = 0usize;
        if let Some(ns_obj) = body.get("namespaces").and_then(Value::as_object) {
            for (ns, incoming) in ns_obj {
                if !STUDENT_NS.contains(&ns.as_str()) || !incoming.is_object() {
                    continue;
                }
                let existing = current
                    .get(ns)
                    .cloned()
                    .unwrap_or_else(|| Value::Object(Map::new()));
                let merged = if PROGRESS_NS.contains(&ns.as_str()) {
                    merge_progress_ns(ns, &existing, incoming)
                } else {
                    merge_profile_obj(&existing, incoming)
                };
                if let Some(cm) = current.as_object_mut() {
                    cm.insert(ns.clone(), merged);
                }
                updated += 1;
            }
        }
        if let Some(cm) = current.as_object_mut() {
            cm.insert("updatedAt".into(), json!(now_ms()));
        }

        if let Some(root) = db.as_object_mut() {
            let students = root
                .entry("students".to_string())
                .or_insert_with(|| Value::Object(Map::new()));
            if let Some(sm) = students.as_object_mut() {
                sm.insert(student_id.to_string(), current.clone());
            }
            let st_rev_map = root
                .entry("stRev".to_string())
                .or_insert_with(|| Value::Object(Map::new()));
            let next_st_rev = st_rev_map
                .get(student_id)
                .and_then(Value::as_u64)
                .unwrap_or(0)
                .saturating_add(1);
            if let Some(rm) = st_rev_map.as_object_mut() {
                rm.insert(student_id.to_string(), json!(next_st_rev));
            }
        }

        if let Some(events) = body.get("events").and_then(Value::as_array) {
            for ev in events.iter().take(15) {
                let msg = ev.get("message").and_then(Value::as_str).unwrap_or("");
                let ev_type = ev.get("type").and_then(Value::as_str).unwrap_or("eleve");
                Self::push_event_locked(&mut db, ev_type, msg, "eleve");
            }
        }

        let (_rev, pub_rev) = Self::bump_rev(&mut db, false);
        let st_rev = db["stRev"][student_id].as_u64().unwrap_or(1);
        self.persist_locked(&db);

        let since_pub = body.get("sincePub").and_then(Value::as_u64).unwrap_or(0);
        let mut resp = json!({
            "ok": true,
            "backend": "rust",
            "persistence": "file",
            "scope": "student",
            "updated": updated,
            "rev": pub_rev,
            "stRev": st_rev,
            "student": current,
            "syncedAt": now_ms(),
        });
        if since_pub < pub_rev {
            if let Some(m) = resp.as_object_mut() {
                m.insert(
                    "overrides".into(),
                    db.get("overrides").cloned().unwrap_or_else(|| json!({})),
                );
                m.insert(
                    "config".into(),
                    db.get("config").cloned().unwrap_or_else(|| json!({})),
                );
            }
        }
        resp
    }

    /* ── Synchronisation Admin (vue complète + publications) ─────────────── */

    pub fn get_admin_sync(&self, since: u64) -> Value {
        let db = self.state.read().unwrap();
        let rev = db["rev"].as_u64().unwrap_or(1);
        let pub_rev = db["pubRev"].as_u64().unwrap_or(1);
        if since > 0 && rev <= since {
            return json!({
                "ok": true,
                "backend": "rust",
                "persistence": "file",
                "scope": "admin",
                "changed": false,
                "rev": rev,
                "pubRev": pub_rev,
                "syncedAt": now_ms(),
            });
        }
        Self::build_admin_snapshot(&db)
    }

    pub fn merge_admin_sync(&self, body: &Value) -> Value {
        let mut db = self.state.write().unwrap();
        let mut updated = 0usize;
        let mut bump_pub = false;

        if let Some(ns_obj) = body.get("namespaces").and_then(Value::as_object) {
            if let Some(ov) = ns_obj.get("overrides").filter(|v| v.is_object()) {
                if let Some(m) = db.as_object_mut() {
                    m.insert("overrides".into(), ov.clone());
                }
                bump_pub = true;
                updated += 1;
            }
            if let Some(cfg) = ns_obj.get("config").and_then(Value::as_object) {
                let mut prev = db
                    .get("config")
                    .and_then(Value::as_object)
                    .cloned()
                    .unwrap_or_default();
                for (k, v) in cfg {
                    if k == "unlockedChapters" {
                        let mut prev_u = prev
                            .get("unlockedChapters")
                            .and_then(Value::as_object)
                            .cloned()
                            .unwrap_or_default();
                        if let Some(inc_u) = v.as_object() {
                            for (uk, uv) in inc_u {
                                prev_u.insert(uk.clone(), uv.clone());
                            }
                        }
                        prev.insert("unlockedChapters".into(), Value::Object(prev_u));
                    } else {
                        prev.insert(k.clone(), v.clone());
                    }
                }
                if let Some(m) = db.as_object_mut() {
                    m.insert("config".into(), Value::Object(prev));
                }
                bump_pub = true;
                updated += 1;
            }
            if let Some(users) = ns_obj.get("users").filter(|v| v.is_array()) {
                if let Some(m) = db.as_object_mut() {
                    m.insert("users".into(), users.clone());
                }
                updated += 1;
            }
            if let Some(hist) = ns_obj.get("history").filter(|v| v.is_object()) {
                if let Some(m) = db.as_object_mut() {
                    m.insert("history".into(), hist.clone());
                }
                updated += 1;
            }
        }

        let mut added_events = 0usize;
        if let Some(events) = body.get("events").and_then(Value::as_array) {
            for ev in events.iter().take(20) {
                let msg = ev.get("message").and_then(Value::as_str).unwrap_or("");
                if msg.trim().is_empty() {
                    continue;
                }
                let ev_type = ev.get("type").and_then(Value::as_str).unwrap_or("admin");
                Self::push_event_locked(&mut db, ev_type, msg, "admin");
                added_events += 1;
            }
        }

        if updated > 0 || added_events > 0 {
            Self::bump_rev(&mut db, bump_pub);
            self.persist_locked(&db);
        }

        let mut snap = Self::build_admin_snapshot(&db);
        if let Some(obj) = snap.as_object_mut() {
            obj.insert("updated".into(), json!(updated));
        }
        snap
    }

    fn build_admin_snapshot(db: &Value) -> Value {
        let rev = db["rev"].as_u64().unwrap_or(1);
        let pub_rev = db["pubRev"].as_u64().unwrap_or(1);
        let events: Vec<Value> = db
            .get("events")
            .and_then(Value::as_array)
            .map(|a| a.iter().take(120).cloned().collect())
            .unwrap_or_default();

        let mut summaries: Vec<Value> = db
            .get("students")
            .and_then(Value::as_object)
            .map(|m| {
                m.iter()
                    .map(|(sid, rec)| summarize_student(sid, rec))
                    .collect()
            })
            .unwrap_or_default();
        summaries.sort_by(|a, b| {
            let ta = a["lastActiveAt"].as_u64().unwrap_or(0);
            let tb = b["lastActiveAt"].as_u64().unwrap_or(0);
            tb.cmp(&ta)
        });

        json!({
            "ok": true,
            "backend": "rust",
            "persistence": "file",
            "scope": "admin",
            "changed": true,
            "rev": rev,
            "pubRev": pub_rev,
            "overrides": db.get("overrides").cloned().unwrap_or_else(|| json!({})),
            "config": db.get("config").cloned().unwrap_or_else(|| json!({})),
            "users": db.get("users").cloned().unwrap_or_else(|| json!([])),
            "history": db.get("history").cloned().unwrap_or_else(|| json!({})),
            "events": events,
            "studentsSummary": summaries,
            "syncedAt": now_ms(),
        })
    }
}

fn merge_progress_ns(ns: &str, existing: &Value, incoming: &Value) -> Value {
    let res = json_engine::exercise::op_merge_progress(&json!({
        "namespace": ns,
        "local": existing,
        "remote": incoming,
    }));
    if res.get("ok").and_then(Value::as_bool) == Some(true) {
        res.get("merged").cloned().unwrap_or_else(|| incoming.clone())
    } else {
        incoming.clone()
    }
}

fn merge_profile_obj(existing: &Value, incoming: &Value) -> Value {
    let mut out = existing.as_object().cloned().unwrap_or_default();
    if let Some(inc) = incoming.as_object() {
        for (k, v) in inc {
            out.insert(k.clone(), v.clone());
        }
    }
    Value::Object(out)
}

fn summarize_student(student_id: &str, rec: &Value) -> Value {
    let profile = rec.get("profile").and_then(Value::as_object);
    let rev = rec.get("progress-revision").and_then(Value::as_object);
    let quiz = rec.get("progress-quiz").and_then(Value::as_object);
    let exos = rec.get("progress-exercises").and_then(Value::as_object);
    let core = rec.get("progress-core").and_then(Value::as_object);

    let mut keys: BTreeSet<String> = BTreeSet::new();
    for map_opt in [rev, quiz, exos] {
        if let Some(m) = map_opt {
            for k in m.keys() {
                keys.insert(k.clone());
            }
        }
    }

    let mut blanks_count = 0usize;
    let mut quiz_attempts = 0usize;
    let mut exercises_done = 0usize;
    let mut last_active = rec["updatedAt"].as_u64().unwrap_or(0);
    let mut chapters = Vec::new();

    for k in &keys {
        let Some((class_id, chapter_id)) = k.split_once("::") else { continue };
        let r = rev.and_then(|m| m.get(k));
        let q = quiz.and_then(|m| m.get(k));
        let e = exos.and_then(|m| m.get(k));

        let rev_pct = r
            .and_then(|x| x.get("sheets"))
            .and_then(Value::as_object)
            .map(|s| s.values().filter_map(Value::as_u64).max().unwrap_or(0).min(100))
            .unwrap_or(0);
        let blanks = r
            .and_then(|x| x.get("blanks"))
            .and_then(Value::as_object)
            .map(|b| b.len())
            .unwrap_or(0);
        let hist = q.and_then(|x| x.get("history")).and_then(Value::as_array);
        let q_best = hist.and_then(|h| h.iter().filter_map(|i| i["pct"].as_u64()).max());
        let q_att = hist.map(|h| h.len()).unwrap_or(0);
        let q_ans = q.and_then(|x| x["answeredPct"].as_u64()).unwrap_or(0);
        let ex_done = e
            .and_then(|x| x.get("exercises"))
            .and_then(Value::as_object)
            .map(|m| m.values().filter(|v| v["evaluated"].is_string()).count())
            .unwrap_or(0);

        blanks_count += blanks;
        quiz_attempts += q_att;
        exercises_done += ex_done;

        for x in [r, q, e].into_iter().flatten() {
            if let Some(t) = x["lastActiveAt"].as_u64() {
                last_active = last_active.max(t);
            }
        }

        let sticky = core
            .and_then(|c| c.get("sticky"))
            .and_then(|s| s.get(k));
        chapters.push(json!({
            "key": k.as_str(),
            "classId": class_id,
            "chapterId": chapter_id,
            "revPct": rev_pct,
            "blanks": blanks,
            "quizBest": q_best,
            "quizAttempts": q_att,
            "quizAnsweredPct": q_ans,
            "exercisesDone": ex_done,
            "stickyQuiz": sticky.and_then(|s| s["quiz"].as_bool()).unwrap_or(false),
            "stickyExercises": sticky.and_then(|s| s["exercises"].as_bool()).unwrap_or(false),
        }));
    }

    let cadre_mastered = core
        .and_then(|c| c.get("masteredSkills"))
        .and_then(Value::as_object)
        .map(|m| m.values().filter_map(|v| v.as_array().map(|a| a.len())).sum::<usize>())
        .unwrap_or(0);

    let first = profile.and_then(|p| p.get("firstName")).and_then(Value::as_str).unwrap_or("").trim();
    let last = profile.and_then(|p| p.get("lastName")).and_then(Value::as_str).unwrap_or("").trim();
    let full = format!("{first} {last}").trim().to_string();
    let tail = if student_id.len() > 5 { &student_id[student_id.len() - 5..] } else { student_id };
    let name = if full.is_empty() { format!("Élève {tail}") } else { full };

    json!({
        "studentId": student_id,
        "name": name,
        "classId": profile.and_then(|p| p.get("classId")).and_then(Value::as_str).unwrap_or(""),
        "school": profile.and_then(|p| p.get("school")).and_then(Value::as_str).unwrap_or(""),
        "chaptersCount": chapters.len(),
        "blanksCount": blanks_count,
        "quizAttempts": quiz_attempts,
        "exercisesDone": exercises_done,
        "cadreMastered": cadre_mastered,
        "lastActiveAt": last_active,
        "chapters": chapters.into_iter().take(40).collect::<Vec<_>>(),
    })
}

fn write_atomic(data_dir: &PathBuf, db_file: &PathBuf, data: &Value) -> std::io::Result<()> {
    fs::create_dir_all(data_dir)?;
    let seq = TMP_SEQ.fetch_add(1, Ordering::Relaxed);
    let tmp = data_dir.join(format!("db.json.{}.{}.tmp", std::process::id(), seq));
    let serialized = serde_json::to_string_pretty(data).unwrap_or_else(|_| "{}".to_string());
    fs::write(&tmp, serialized)?;
    fs::rename(&tmp, db_file)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn crdt_student_sync_merges_without_overwriting_higher_progress() {
        let dir = std::env::temp_dir().join(format!("mathix-store-test-{}", now_ms()));
        let store = Store::open(dir.clone());
        let first = json!({
            "namespaces": {
                "progress-revision": {
                    "2bac::cont": { "sheets": { "f1": 90 }, "blanks": { "f1": ["b1"] }, "lastActiveAt": 100 }
                }
            }
        });
        let second = json!({
            "namespaces": {
                "progress-revision": {
                    "2bac::cont": { "sheets": { "f1": 40, "f2": 75 }, "blanks": { "f1": ["b2"] }, "lastActiveAt": 200 }
                }
            }
        });
        store.merge_student_sync("st-alice", &first);
        let snap = store.merge_student_sync("st-alice", &second);
        let sheets = &snap["student"]["progress-revision"]["2bac::cont"]["sheets"];
        assert_eq!(sheets["f1"], 90);
        assert_eq!(sheets["f2"], 75);
        let blanks = snap["student"]["progress-revision"]["2bac::cont"]["blanks"]["f1"]
            .as_array()
            .unwrap();
        assert_eq!(blanks.len(), 2);

        // Delta revision check returns changed=false when up to date
        let pub_rev = snap["rev"].as_u64().unwrap();
        let st_rev = snap["stRev"].as_u64().unwrap();
        let idle = store.get_student_sync("st-alice", pub_rev, st_rev);
        assert_eq!(idle["changed"], false);

        // Admin publish bumps pubRev -> student sees changed=true with new override
        store.merge_admin_sync(&json!({
            "namespaces": {
                "overrides": {
                    "data/test.json": { "json": "{}", "title": "Test", "publishedAt": 300, "validated": true }
                }
            }
        }));
        let updated = store.get_student_sync("st-alice", pub_rev, st_rev);
        assert_eq!(updated["changed"], true);
        assert!(updated["overrides"]["data/test.json"].is_object());

        let _ = fs::remove_dir_all(&dir);
    }
}
