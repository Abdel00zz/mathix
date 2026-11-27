//! Client-side state store (localStorage namespaces, progressive unlock, CRDT merge, backup/restore).

use serde_json::{json, Map, Value};

pub const KEY_PROFILE: &str = "mathplus:profile";
pub const KEY_REVISION: &str = "mathplus:progress:revision";
pub const KEY_QUIZ: &str = "mathplus:progress:quiz";
pub const KEY_EXERCISES: &str = "mathplus:progress:exercises";
pub const KEY_CORE: &str = "mathplus:progress:core";
pub const KEY_OVERRIDES: &str = "mathplus:overrides";
pub const KEY_CONFIG: &str = "mathplus:config";
pub const KEY_USERS: &str = "mathplus:admin:users";
pub const KEY_ACTIVITY: &str = "mathplus:activity";
pub const KEY_HISTORY: &str = "mathplus:studio:history";
pub const KEY_SB_COLLAPSED: &str = "mathplus:sb-collapsed";
pub const KEY_MUTED: &str = "mathplus:muted";
pub const KEY_GOOGLE_USER: &str = "mathplus:google-user";

pub const QUIZ_UNLOCK_THRESHOLD: u64 = 10;
pub const EXERCISE_UNLOCK_THRESHOLD: u64 = 15;

pub struct Store {
    pub profile: Value,
    pub revision: Value,
    pub quiz: Value,
    pub exercises: Value,
    pub core: Value,
    pub overrides: Value,
    pub config: Value,
    pub users: Value,
    pub activity: Value,
    pub history: Value,
    pub students_summary: Value,
    pub google_user: Option<Value>,
    pub muted: bool,
    pub sb_collapsed: Option<bool>,
    pub admin_authed: bool,
}

impl Default for Store {
    fn default() -> Self {
        Self::new()
    }
}

impl Store {
    pub fn new() -> Self {
        Self {
            profile: json!({
                "classId": null,
                "theme": "auto",
                "palette": "quizlet",
                "paletteVer": 2,
                "firstName": "",
                "lastName": "",
                "school": "",
                "freeMode": false
            }),
            revision: json!({}),
            quiz: json!({}),
            exercises: json!({}),
            core: json!({}),
            overrides: json!({}),
            config: json!({}),
            users: default_users(),
            activity: json!([]),
            history: json!({}),
            students_summary: json!([]),
            google_user: None,
            muted: false,
            sb_collapsed: None,
            admin_authed: false,
        }
    }

    pub fn load_from_storage(&mut self, storage: &Value, _session: &Value) -> bool {
        let mut migrated = false;
        if let Some(s) = storage.get(KEY_PROFILE).and_then(Value::as_str) {
            if let Ok(v) = serde_json::from_str(s) {
                if v.is_object() {
                    migrated = v.get("paletteVer").and_then(Value::as_u64) != Some(2);
                    self.profile = merge_profile_defaults(v);
                }
            }
        }
        if let Some(s) = storage.get(KEY_REVISION).and_then(Value::as_str) {
            if let Ok(v) = serde_json::from_str(s) {
                if v.is_object() { self.revision = v; }
            }
        }
        if let Some(s) = storage.get(KEY_QUIZ).and_then(Value::as_str) {
            if let Ok(v) = serde_json::from_str(s) {
                if v.is_object() { self.quiz = v; }
            }
        }
        if let Some(s) = storage.get(KEY_EXERCISES).and_then(Value::as_str) {
            if let Ok(v) = serde_json::from_str(s) {
                if v.is_object() { self.exercises = v; }
            }
        }
        if let Some(s) = storage.get(KEY_CORE).and_then(Value::as_str) {
            if let Ok(v) = serde_json::from_str(s) {
                if v.is_object() { self.core = v; }
            }
        }
        if let Some(s) = storage.get(KEY_OVERRIDES).and_then(Value::as_str) {
            if let Ok(v) = serde_json::from_str(s) {
                if v.is_object() { self.overrides = v; }
            }
        }
        if let Some(s) = storage.get(KEY_CONFIG).and_then(Value::as_str) {
            if let Ok(v) = serde_json::from_str(s) {
                if v.is_object() { self.config = v; }
            }
        }
        if let Some(s) = storage.get(KEY_USERS).and_then(Value::as_str) {
            if let Ok(v) = serde_json::from_str(s) {
                if v.is_array() { self.users = v; }
            }
        }
        if let Some(s) = storage.get(KEY_ACTIVITY).and_then(Value::as_str) {
            if let Ok(v) = serde_json::from_str(s) {
                if v.is_array() { self.activity = v; }
            }
        }
        if let Some(s) = storage.get(KEY_HISTORY).and_then(Value::as_str) {
            if let Ok(v) = serde_json::from_str(s) {
                if v.is_object() { self.history = v; }
            }
        }
        if let Some(s) = storage.get(KEY_MUTED).and_then(Value::as_str) {
            self.muted = s == "1" || s == "true";
        }
        if let Some(s) = storage.get(KEY_SB_COLLAPSED).and_then(Value::as_str) {
            self.sb_collapsed = Some(s == "1" || s == "true");
        }
        if let Some(s) = storage.get(KEY_GOOGLE_USER).and_then(Value::as_str) {
            if let Ok(v) = serde_json::from_str(s) {
                if v.get("uid").and_then(Value::as_str).map(|u| !u.is_empty()).unwrap_or(false) {
                    self.google_user = Some(v);
                }
            }
        }
        migrated
    }

    pub fn apply_storage_sync(&mut self, key: &str, raw_val: Option<&str>) {
        if key == KEY_GOOGLE_USER {
            self.google_user = raw_val
                .and_then(|s| serde_json::from_str(s).ok())
                .filter(|v| v.get("uid").and_then(Value::as_str).map(|u| !u.is_empty()).unwrap_or(false));
            return;
        }
        let Some(s) = raw_val else { return };
        match key {
            KEY_PROFILE => if let Ok(v) = serde_json::from_str(s) { if v.is_object() { self.profile = merge_profile_defaults(v); } },
            KEY_REVISION => if let Ok(v) = serde_json::from_str(s) { if v.is_object() { self.revision = v; } },
            KEY_QUIZ => if let Ok(v) = serde_json::from_str(s) { if v.is_object() { self.quiz = v; } },
            KEY_EXERCISES => if let Ok(v) = serde_json::from_str(s) { if v.is_object() { self.exercises = v; } },
            KEY_CORE => if let Ok(v) = serde_json::from_str(s) { if v.is_object() { self.core = v; } },
            KEY_OVERRIDES => if let Ok(v) = serde_json::from_str(s) { if v.is_object() { self.overrides = v; } },
            KEY_CONFIG => if let Ok(v) = serde_json::from_str(s) { if v.is_object() { self.config = v; } },
            KEY_USERS => if let Ok(v) = serde_json::from_str(s) { if v.is_array() { self.users = v; } },
            KEY_ACTIVITY => if let Ok(v) = serde_json::from_str(s) { if v.is_array() { self.activity = v; } },
            KEY_HISTORY => if let Ok(v) = serde_json::from_str(s) { if v.is_object() { self.history = v; } },
            _ => {}
        }
    }

    pub fn class_id(&self) -> Option<&str> {
        self.profile.get("classId").and_then(Value::as_str).filter(|s| !s.is_empty())
    }

    pub fn theme(&self) -> &str {
        self.profile.get("theme").and_then(Value::as_str).unwrap_or("auto")
    }

    pub fn palette(&self) -> &str {
        self.profile.get("palette").and_then(Value::as_str).unwrap_or("quizlet")
    }

    pub fn first_name(&self) -> &str {
        self.profile.get("firstName").and_then(Value::as_str).unwrap_or("")
    }

    pub fn free_mode(&self) -> bool {
        self.profile.get("freeMode").and_then(Value::as_bool).unwrap_or(false)
            || self.config.get("freeMode").and_then(Value::as_bool).unwrap_or(false)
    }

    pub fn set_config_free_mode(&mut self, enabled: bool) -> Value {
        if let Some(m) = self.config.as_object_mut() {
            m.insert("freeMode".into(), json!(enabled));
        }
        storage_effect(KEY_CONFIG, &self.config)
    }

    pub fn set_config_unlock_chapter(&mut self, class_id: &str, chapter_id: &str) -> Value {
        let k = Self::chap_key(class_id, chapter_id);
        let unlocked = ensure_obj(&mut self.config, "unlockedChapters");
        if let Some(m) = unlocked.as_object_mut() {
            m.insert(k, json!(true));
        }
        storage_effect(KEY_CONFIG, &self.config)
    }

    pub fn is_config_chapter_unlocked(&self, class_id: &str, chapter_id: &str) -> bool {
        let k = Self::chap_key(class_id, chapter_id);
        self.config
            .get("unlockedChapters")
            .and_then(|u| u.get(&k))
            .and_then(Value::as_bool)
            .unwrap_or(false)
    }

    pub fn set_google_user(&mut self, user: Option<Value>) -> Vec<Value> {
        let valid_user = user.filter(|u| {
            u.get("uid")
                .and_then(Value::as_str)
                .map(|s| !s.is_empty())
                .unwrap_or(false)
        });
        let mut effs = Vec::new();
        if let Some(ref u) = valid_user {
            let cur_fn = self.first_name().trim().to_string();
            let cur_ln = self.profile.get("lastName").and_then(Value::as_str).unwrap_or("").trim().to_string();
            if cur_fn.is_empty() && cur_ln.is_empty() {
                if let Some(dn) = u.get("displayName").and_then(Value::as_str).map(str::trim).filter(|s| !s.is_empty()) {
                    let mut parts = dn.split_whitespace();
                    let first = parts.next().unwrap_or("");
                    let rest: String = parts.collect::<Vec<_>>().join(" ");
                    if let Some(m) = self.profile.as_object_mut() {
                        m.insert("firstName".into(), json!(first));
                        if !rest.is_empty() {
                            m.insert("lastName".into(), json!(rest));
                        }
                    }
                    effs.push(storage_effect(KEY_PROFILE, &self.profile));
                }
            }
        }
        self.google_user = valid_user;
        effs
    }

    pub fn apply_cloud_student(&mut self, payload: &Value) -> (bool, Vec<Value>) {
        let mut changed = false;
        let mut effs = Vec::new();

        if let Some(ov) = payload.get("overrides").filter(|v| v.is_object()) {
            if self.overrides != *ov {
                self.overrides = ov.clone();
                effs.push(storage_effect_cloud(KEY_OVERRIDES, &self.overrides));
                changed = true;
            }
        }

        if let Some(cfg) = payload.get("config").filter(|v| v.is_object()) {
            if self.config != *cfg {
                self.config = cfg.clone();
                effs.push(storage_effect_cloud(KEY_CONFIG, &self.config));
                changed = true;
            }
            if let Some(unlocked) = cfg.get("unlockedChapters").and_then(Value::as_object) {
                for (chap_key, flag) in unlocked {
                    if flag.as_bool() == Some(true) {
                        if let Some((cid, chid)) = chap_key.split_once("::") {
                            if self.mark_sticky(cid, chid, "quiz").is_some() {
                                changed = true;
                            }
                            if self.mark_sticky(cid, chid, "exercises").is_some() {
                                changed = true;
                            }
                        }
                    }
                }
                if changed {
                    effs.push(storage_effect_cloud(KEY_CORE, &self.core));
                }
            }
        }

        if let Some(st) = payload.get("student").filter(|v| v.is_object()) {
            if let Some(rprof) = st.get("profile").and_then(Value::as_object) {
                let mut prof_changed = false;
                if let Some(lprof) = self.profile.as_object_mut() {
                    for k in ["firstName", "lastName", "school"] {
                        let local_empty = lprof.get(k).and_then(Value::as_str).map(|s| s.trim().is_empty()).unwrap_or(true);
                        if local_empty {
                            if let Some(rv) = rprof.get(k).and_then(Value::as_str).filter(|s| !s.trim().is_empty()) {
                                lprof.insert(k.to_string(), json!(rv));
                                prof_changed = true;
                            }
                        }
                    }
                    let local_cid_empty = lprof.get("classId").and_then(Value::as_str).map(|s| s.is_empty()).unwrap_or(true);
                    if local_cid_empty {
                        if let Some(rcid) = rprof.get("classId").and_then(Value::as_str).filter(|s| !s.is_empty()) {
                            lprof.insert("classId".into(), json!(rcid));
                            prof_changed = true;
                        }
                    }
                }
                if prof_changed {
                    effs.push(storage_effect_cloud(KEY_PROFILE, &self.profile));
                    changed = true;
                }
            }
            let mut merge_ns = |ns_name: &str, current: &mut Value, storage_key: &str| {
                if let Some(remote) = st.get(ns_name).filter(|v| v.is_object()) {
                    let res = json_engine::exercise::op_merge_progress(&json!({
                        "namespace": ns_name,
                        "local": &*current,
                        "remote": remote,
                    }));
                    if let Some(merged) = res.get("merged").filter(|v| v.is_object()) {
                        if *current != *merged {
                            *current = merged.clone();
                            effs.push(storage_effect_cloud(storage_key, current));
                            changed = true;
                        }
                    }
                }
            };
            merge_ns("progress-revision", &mut self.revision, KEY_REVISION);
            merge_ns("progress-quiz", &mut self.quiz, KEY_QUIZ);
            merge_ns("progress-exercises", &mut self.exercises, KEY_EXERCISES);
            merge_ns("progress-core", &mut self.core, KEY_CORE);
        }

        (changed, effs)
    }

    pub fn apply_cloud_admin(&mut self, payload: &Value) -> (bool, Vec<Value>) {
        let mut changed = false;
        let mut effs = Vec::new();

        if let Some(ov) = payload.get("overrides").filter(|v| v.is_object()) {
            if self.overrides != *ov {
                self.overrides = ov.clone();
                effs.push(storage_effect_cloud(KEY_OVERRIDES, &self.overrides));
                changed = true;
            }
        }
        if let Some(cfg) = payload.get("config").filter(|v| v.is_object()) {
            if self.config != *cfg {
                self.config = cfg.clone();
                effs.push(storage_effect_cloud(KEY_CONFIG, &self.config));
                changed = true;
            }
        }
        if let Some(users) = payload.get("users").and_then(Value::as_array) {
            if !users.is_empty() && self.users != Value::Array(users.clone()) {
                self.users = Value::Array(users.clone());
                effs.push(storage_effect_cloud(KEY_USERS, &self.users));
                changed = true;
            }
        }
        if let Some(hist) = payload.get("history").filter(|v| v.is_object()) {
            if !hist.as_object().map(|m| m.is_empty()).unwrap_or(true) && self.history != *hist {
                self.history = hist.clone();
                effs.push(storage_effect_cloud(KEY_HISTORY, &self.history));
                changed = true;
            }
        }
        if let Some(events) = payload.get("events").and_then(Value::as_array) {
            if !events.is_empty() && self.activity != Value::Array(events.clone()) {
                self.activity = Value::Array(events.clone());
                effs.push(storage_effect_cloud(KEY_ACTIVITY, &self.activity));
                changed = true;
            }
        }
        if let Some(summary) = payload.get("studentsSummary").filter(|v| v.is_array()) {
            if self.students_summary != *summary {
                self.students_summary = summary.clone();
                changed = true;
            }
        }

        (changed, effs)
    }

    pub fn set_profile_field(&mut self, key: &str, val: Value) -> Value {
        if let Some(m) = self.profile.as_object_mut() {
            m.insert(key.to_string(), val);
        }
        storage_effect(KEY_PROFILE, &self.profile)
    }

    pub fn chap_key(class_id: &str, chapter_id: &str) -> String {
        format!("{class_id}::{chapter_id}")
    }

    pub fn is_mise_a_niveau(chapter_id: &str, title: &str) -> bool {
        let id = chapter_id.to_lowercase();
        let t = title.to_lowercase();
        id.contains("mise") || id.contains("niveau") || t.contains("mise à niveau") || t.contains("mise a niveau")
    }

    pub fn revision_pct(&self, class_id: &str, chapter_id: &str, sheet_path: Option<&str>) -> u64 {
        let k = Self::chap_key(class_id, chapter_id);
        let Some(rec) = self.revision.get(&k) else { return 0 };
        let Some(sheets) = rec.get("sheets").and_then(Value::as_object) else { return 0 };
        if let Some(sp) = sheet_path {
            return sheets.get(sp).and_then(Value::as_u64).unwrap_or(0).min(100);
        }
        sheets.values().filter_map(Value::as_u64).max().unwrap_or(0).min(100)
    }

    pub fn set_revision_pct(&mut self, class_id: &str, chapter_id: &str, sheet_path: &str, pct: u64, now: u64) -> Vec<Value> {
        let k = Self::chap_key(class_id, chapter_id);
        let clamped = pct.min(100);
        let prev = self.revision_pct(class_id, chapter_id, Some(sheet_path));
        if clamped <= prev {
            return Vec::new();
        }
        let rec = ensure_obj(&mut self.revision, &k);
        let sheets = ensure_obj(rec, "sheets");
        if let Some(m) = sheets.as_object_mut() {
            m.insert(sheet_path.to_string(), json!(clamped));
        }
        if let Some(m) = rec.as_object_mut() {
            m.insert("lastActiveAt".into(), json!(now));
        }
        let mut effs = vec![storage_effect(KEY_REVISION, &self.revision)];
        if clamped >= QUIZ_UNLOCK_THRESHOLD {
            if let Some(e) = self.mark_sticky(class_id, chapter_id, "quiz") {
                effs.push(e);
            }
        }
        effs
    }

    pub fn set_blank_revealed(&mut self, class_id: &str, chapter_id: &str, blank_id: &str, revealed: bool, now: u64) -> Value {
        let k = Self::chap_key(class_id, chapter_id);
        let rec = ensure_obj(&mut self.revision, &k);
        let blanks = ensure_obj(rec, "blanks");
        if let Some(m) = blanks.as_object_mut() {
            if revealed {
                m.insert(blank_id.to_string(), json!(true));
            } else {
                m.remove(blank_id);
            }
        }
        if let Some(m) = rec.as_object_mut() {
            m.insert("lastActiveAt".into(), json!(now));
        }
        storage_effect(KEY_REVISION, &self.revision)
    }

    pub fn is_blank_revealed(&self, class_id: &str, chapter_id: &str, blank_id: &str) -> bool {
        let k = Self::chap_key(class_id, chapter_id);
        self.revision
            .get(&k)
            .and_then(|r| r.get("blanks"))
            .and_then(|b| b.get(blank_id))
            .and_then(Value::as_bool)
            .unwrap_or(false)
    }

    pub fn quiz_best_pct(&self, class_id: &str, chapter_id: &str) -> Option<u64> {
        let k = Self::chap_key(class_id, chapter_id);
        let hist = self.quiz.get(&k)?.get("history")?.as_array()?;
        hist.iter().filter_map(|h| h.get("pct").and_then(Value::as_u64)).max()
    }

    pub fn quiz_answered_pct(&self, class_id: &str, chapter_id: &str) -> u64 {
        let k = Self::chap_key(class_id, chapter_id);
        self.quiz
            .get(&k)
            .and_then(|r| r.get("answeredPct"))
            .and_then(Value::as_u64)
            .unwrap_or(0)
    }

    pub fn record_quiz_answered(&mut self, class_id: &str, chapter_id: &str, answered: usize, total: usize, now: u64) -> Vec<Value> {
        let pct = if total > 0 { ((answered * 100) / total) as u64 } else { 0 };
        let k = Self::chap_key(class_id, chapter_id);
        let prev = self.quiz_answered_pct(class_id, chapter_id);
        let rec = ensure_obj(&mut self.quiz, &k);
        if let Some(m) = rec.as_object_mut() {
            m.insert("answeredPct".into(), json!(pct.max(prev)));
            m.insert("lastActiveAt".into(), json!(now));
        }
        let mut effs = vec![storage_effect(KEY_QUIZ, &self.quiz)];
        if pct >= EXERCISE_UNLOCK_THRESHOLD {
            if let Some(e) = self.mark_sticky(class_id, chapter_id, "exercises") {
                effs.push(e);
            }
        }
        effs
    }

    pub fn record_quiz_attempt(&mut self, class_id: &str, chapter_id: &str, score: usize, total: usize, duration_sec: u64, now: u64) -> Vec<Value> {
        let pct = if total > 0 { ((score * 100) / total) as u64 } else { 0 };
        let k = Self::chap_key(class_id, chapter_id);
        let rec = ensure_obj(&mut self.quiz, &k);
        let hist = rec.as_object_mut().unwrap().entry("history".into()).or_insert_with(|| json!([]));
        if let Some(arr) = hist.as_array_mut() {
            arr.push(json!({ "at": now, "score": score, "total": total, "pct": pct, "durationSec": duration_sec }));
            if arr.len() > 20 {
                let drop_n = arr.len() - 20;
                arr.drain(0..drop_n);
            }
        }
        if let Some(m) = rec.as_object_mut() {
            m.insert("answeredPct".into(), json!(100));
            m.insert("lastActiveAt".into(), json!(now));
        }
        let mut effs = vec![storage_effect(KEY_QUIZ, &self.quiz)];
        if let Some(e) = self.mark_sticky(class_id, chapter_id, "exercises") {
            effs.push(e);
        }
        effs.push(self.push_activity("quiz-complete", &format!("Quiz {chapter_id} : {score}/{total} ({pct}%)"), "eleve", now));
        effs
    }

    pub fn get_exercise(&self, class_id: &str, chapter_id: &str, ex_id: &str) -> Option<&Value> {
        let k = Self::chap_key(class_id, chapter_id);
        self.exercises.get(&k)?.get("exercises")?.get(ex_id)
    }

    pub fn set_exercise(&mut self, class_id: &str, chapter_id: &str, ex_id: &str, patch: Map<String, Value>, now: u64) -> Vec<Value> {
        let k = Self::chap_key(class_id, chapter_id);
        let rec = ensure_obj(&mut self.exercises, &k);
        let exs = ensure_obj(rec, "exercises");
        let item = ensure_obj(exs, ex_id);
        let evaluated_label = patch.get("evaluated").and_then(Value::as_str).map(|s| s.to_string());
        if let Some(m) = item.as_object_mut() {
            for (pk, pv) in patch {
                m.insert(pk, pv);
            }
            m.insert("lastActiveAt".into(), json!(now));
        }
        if let Some(m) = rec.as_object_mut() {
            m.insert("lastActiveAt".into(), json!(now));
        }
        let mut effs = vec![storage_effect(KEY_EXERCISES, &self.exercises)];
        if let Some(ev) = evaluated_label {
            effs.push(self.push_activity("exercise-eval", &format!("Exercice {ex_id} évalué ({ev})"), "eleve", now));
        }
        effs
    }

    pub fn count_exercises_done(&self, class_id: &str, chapter_id: &str) -> usize {
        let k = Self::chap_key(class_id, chapter_id);
        self.exercises
            .get(&k)
            .and_then(|r| r.get("exercises"))
            .and_then(Value::as_object)
            .map(|m| m.values().filter(|v| v.get("evaluated").and_then(Value::as_str).is_some()).count())
            .unwrap_or(0)
    }

    pub fn chapter_exercises_map(&self, class_id: &str, chapter_id: &str) -> Value {
        let k = Self::chap_key(class_id, chapter_id);
        self.exercises
            .get(&k)
            .and_then(|r| r.get("exercises"))
            .filter(|v| v.is_object())
            .cloned()
            .unwrap_or_else(|| json!({}))
    }

    pub fn is_sticky(&self, class_id: &str, chapter_id: &str, stage: &str) -> bool {
        let k = Self::chap_key(class_id, chapter_id);
        self.core
            .get("sticky")
            .and_then(|s| s.get(&k))
            .and_then(|c| c.get(stage))
            .and_then(Value::as_bool)
            .unwrap_or(false)
    }

    pub fn mark_sticky(&mut self, class_id: &str, chapter_id: &str, stage: &str) -> Option<Value> {
        if self.is_sticky(class_id, chapter_id, stage) {
            return None;
        }
        let k = Self::chap_key(class_id, chapter_id);
        let sticky = ensure_obj(&mut self.core, "sticky");
        let ch = ensure_obj(sticky, &k);
        if let Some(m) = ch.as_object_mut() {
            m.insert(stage.to_string(), json!(true));
        }
        Some(storage_effect(KEY_CORE, &self.core))
    }

    pub fn unlock_state(&self, class_id: &str, chapter_id: &str, _chapter_title: &str) -> (bool, bool) {
        if self.free_mode() || self.is_config_chapter_unlocked(class_id, chapter_id) {
            return (true, true);
        }
        let rev_pct = self.revision_pct(class_id, chapter_id, None);
        let quiz_unlocked = rev_pct >= QUIZ_UNLOCK_THRESHOLD || self.is_sticky(class_id, chapter_id, "quiz");
        let q_best = self.quiz_best_pct(class_id, chapter_id).unwrap_or(0);
        let q_ans = self.quiz_answered_pct(class_id, chapter_id);
        let ex_unlocked = q_best >= EXERCISE_UNLOCK_THRESHOLD
            || q_ans >= EXERCISE_UNLOCK_THRESHOLD
            || self.is_sticky(class_id, chapter_id, "exercises");
        (quiz_unlocked, ex_unlocked)
    }

    pub fn is_skill_mastered(&self, class_id: &str, skill_id: &str) -> bool {
        self.core
            .get("masteredSkills")
            .and_then(|ms| ms.get(class_id))
            .and_then(Value::as_array)
            .map(|arr| arr.iter().any(|v| v.as_str() == Some(skill_id)))
            .unwrap_or(false)
    }

    pub fn mastered_count(&self, class_id: &str) -> usize {
        self.core
            .get("masteredSkills")
            .and_then(|ms| ms.get(class_id))
            .and_then(Value::as_array)
            .map(|a| a.len())
            .unwrap_or(0)
    }

    pub fn toggle_skill_mastered(&mut self, class_id: &str, skill_id: &str) -> (bool, Value) {
        let ms = ensure_obj(&mut self.core, "masteredSkills");
        let arr = ms.as_object_mut().unwrap().entry(class_id.to_string()).or_insert_with(|| json!([]));
        let now_on = if let Some(list) = arr.as_array_mut() {
            if let Some(pos) = list.iter().position(|v| v.as_str() == Some(skill_id)) {
                list.remove(pos);
                false
            } else {
                list.push(json!(skill_id));
                true
            }
        } else {
            false
        };
        (now_on, storage_effect(KEY_CORE, &self.core))
    }

    pub fn record_concours_attempt(&mut self, school_id: &str, mode: &str, score: usize, total: usize, now: u64) -> Vec<Value> {
        let pct = if total > 0 { ((score * 100) / total) as u64 } else { 0 };
        let conc = ensure_obj(&mut self.core, "concours");
        let sch = ensure_obj(conc, school_id);
        let rec = ensure_obj(sch, mode);
        let prev_att = rec.get("attempts").and_then(Value::as_u64).unwrap_or(0);
        let prev_best = rec.get("bestPct").and_then(Value::as_u64).unwrap_or(0);
        if let Some(m) = rec.as_object_mut() {
            m.insert("attempts".into(), json!(prev_att + 1));
            m.insert("bestPct".into(), json!(pct.max(prev_best)));
            m.insert("lastAt".into(), json!(now));
        }
        vec![
            storage_effect(KEY_CORE, &self.core),
            self.push_activity("concours", &format!("Concours {school_id} ({mode}) : {score}/{total} ({pct}%)"), "eleve", now),
        ]
    }

    pub fn get_override(&self, path: &str) -> Option<&Value> {
        let clean = path.trim_start_matches('/');
        self.overrides.get(clean)
    }

    pub fn publish_override(&mut self, path: &str, json_str: &str, title: &str, now: u64) -> Vec<Value> {
        let clean = path.trim_start_matches('/').to_string();
        if let Some(m) = self.overrides.as_object_mut() {
            m.insert(clean.clone(), json!({
                "json": json_str,
                "title": title,
                "publishedAt": now,
                "validated": true
            }));
        }
        let h_arr = self.history.as_object_mut().unwrap().entry(clean.clone()).or_insert_with(|| json!([]));
        if let Some(arr) = h_arr.as_array_mut() {
            arr.insert(0, json!({ "at": now, "json": json_str, "note": if title.is_empty() { "Publication" } else { title } }));
            if arr.len() > 15 { arr.truncate(15); }
        }
        vec![
            storage_effect(KEY_OVERRIDES, &self.overrides),
            storage_effect(KEY_HISTORY, &self.history),
            self.push_activity("override-publish", &format!("Publication active : {clean}"), "admin", now),
        ]
    }

    pub fn remove_override(&mut self, path: &str, now: u64) -> Vec<Value> {
        let clean = path.trim_start_matches('/');
        if let Some(m) = self.overrides.as_object_mut() {
            m.remove(clean);
        }
        vec![
            storage_effect(KEY_OVERRIDES, &self.overrides),
            self.push_activity("override-remove", &format!("Publication retirée : {clean}"), "admin", now),
        ]
    }

    pub fn clear_overrides(&mut self, now: u64) -> Vec<Value> {
        self.overrides = json!({});
        vec![
            storage_effect(KEY_OVERRIDES, &self.overrides),
            self.push_activity("override-clear", "Toutes les publications annulées", "admin", now),
        ]
    }

    pub fn push_activity(&mut self, kind: &str, msg: &str, actor: &str, now: u64) -> Value {
        if let Some(arr) = self.activity.as_array_mut() {
            arr.insert(0, json!({ "at": now, "type": kind, "message": msg, "actor": actor }));
            if arr.len() > 120 { arr.truncate(120); }
        }
        storage_effect(KEY_ACTIVITY, &self.activity)
    }

    pub fn export_backup(&self, now: u64) -> String {
        let doc = json!({
            "version": 1,
            "exportedAt": now,
            "profile": self.profile,
            "revision": self.revision,
            "quiz": self.quiz,
            "exercises": self.exercises,
            "core": self.core
        });
        serde_json::to_string_pretty(&doc).unwrap_or_else(|_| doc.to_string())
    }

    pub fn import_backup(&mut self, raw: &str) -> Result<Vec<Value>, String> {
        let parsed = serde_json::from_str(raw).map_err(|_| "Fichier JSON invalide".to_string())?;
        if !parsed.is_object() {
            return Err("Format de sauvegarde invalide".into());
        }
        let mut effs = Vec::new();
        if let Some(p) = parsed.get("profile").filter(|v| v.is_object()) {
            self.profile = merge_profile_defaults(p.clone());
            effs.push(storage_effect(KEY_PROFILE, &self.profile));
        }
        if let Some(r) = parsed.get("revision").filter(|v| v.is_object()) {
            self.revision = r.clone();
            effs.push(storage_effect(KEY_REVISION, &self.revision));
        }
        if let Some(q) = parsed.get("quiz").filter(|v| v.is_object()) {
            self.quiz = q.clone();
            effs.push(storage_effect(KEY_QUIZ, &self.quiz));
        }
        if let Some(e) = parsed.get("exercises").filter(|v| v.is_object()) {
            self.exercises = e.clone();
            effs.push(storage_effect(KEY_EXERCISES, &self.exercises));
        }
        if let Some(c) = parsed.get("core").filter(|v| v.is_object()) {
            self.core = c.clone();
            effs.push(storage_effect(KEY_CORE, &self.core));
        }
        Ok(effs)
    }

    pub fn reset_all(&mut self) -> Vec<Value> {
        self.revision = json!({});
        self.quiz = json!({});
        self.exercises = json!({});
        self.core = json!({});
        vec![
            storage_effect(KEY_REVISION, &self.revision),
            storage_effect(KEY_QUIZ, &self.quiz),
            storage_effect(KEY_EXERCISES, &self.exercises),
            storage_effect(KEY_CORE, &self.core),
        ]
    }
}

fn ensure_obj<'a>(root: &'a mut Value, key: &str) -> &'a mut Value {
    if !root.is_object() {
        *root = json!({});
    }
    root.as_object_mut()
        .unwrap()
        .entry(key.to_string())
        .or_insert_with(|| json!({}))
}

fn merge_profile_defaults(mut v: Value) -> Value {
    if let Some(m) = v.as_object_mut() {
        m.entry("theme".into()).or_insert_with(|| json!("auto"));
        if m.get("paletteVer").and_then(Value::as_u64) != Some(2) {
            m.insert("palette".into(), json!("quizlet"));
            m.insert("paletteVer".into(), json!(2));
        } else {
            let pal = m.get("palette").and_then(Value::as_str).unwrap_or("quizlet");
            if pal.is_empty() || pal == "botanique" {
                m.insert("palette".into(), json!("quizlet"));
            }
        }
        m.entry("firstName".into()).or_insert_with(|| json!(""));
        m.entry("lastName".into()).or_insert_with(|| json!(""));
        m.entry("school".into()).or_insert_with(|| json!(""));
        m.entry("freeMode".into()).or_insert_with(|| json!(false));
    }
    v
}

pub fn storage_effect(key: &str, val: &Value) -> Value {
    json!({
        "type": "storage-set",
        "key": key,
        "value": val.to_string(),
        "session": false
    })
}

pub fn storage_effect_cloud(key: &str, val: &Value) -> Value {
    json!({
        "type": "storage-set",
        "key": key,
        "value": val.to_string(),
        "session": false,
        "fromCloud": true
    })
}

pub fn storage_str_effect(key: &str, val: Option<&str>, session: bool) -> Value {
    json!({
        "type": "storage-set",
        "key": key,
        "value": val,
        "session": session
    })
}

fn default_users() -> Value {
    json!([
        { "id": "u-1", "name": "Yasmine El Idrissi", "phone": "06 12 34 56 78", "classId": "2eme-bac-sc-math", "role": "student", "status": "approved" },
        { "id": "u-2", "name": "Adam Benali", "phone": "06 23 45 67 89", "classId": "1ere-bac-sc-math", "role": "student", "status": "approved" },
        { "id": "u-3", "name": "Salma Chraibi", "phone": "06 34 56 78 90", "classId": "2eme-bac-sc-ex", "role": "student", "status": "pending" },
        { "id": "u-4", "name": "Prof. Karim Tazi", "phone": "06 45 67 89 01", "classId": "2eme-bac-sc-math", "role": "prof", "status": "approved" }
    ])
}
