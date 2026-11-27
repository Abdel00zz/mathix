//! Mathix Frontend — 100% Rust WebAssembly SPA Engine (Student & feature-gated Admin Console).
//!
//! Compiles to two strictly isolated WASM binaries:
//! - Default features → `engines/mathix_app.wasm` (Student SPA, zero admin code)
//! - `--features admin` → `engines/mathix_admin.wasm` (Admin Console + Editorial Studio)

pub mod html;
pub mod math_html;
pub mod orientation;
pub mod router;
pub mod store;
pub mod views;

use std::cell::RefCell;
use std::collections::{BTreeMap, BTreeSet};
use serde_json::{json, Map, Value};

use crate::html::{esc, format_class_short, icon};
use crate::orientation::{orientation_class_path, ORIENTATION_INDEX_PATH};
use crate::router::{classify_transition, parse_route, Route};
use crate::store::{
    storage_effect, storage_str_effect, Store, KEY_MUTED, KEY_PROFILE, KEY_SB_COLLAPSED,
};
use crate::views::dashboard::{
    active_concours_school_id, exam_themes_list, render_cadre_view, render_concours_body,
    render_concours_results, render_dashboard, render_dashboard_panel, render_exams_results,
    render_exams_subbar, render_olympiads_view, render_problems_view, DashboardData,
    DashboardState,
};
use crate::views::exercise::{
    render_exam_detail, render_exercise_detail, render_exercise_list, ExerciseState,
};
use crate::views::modals::{
    orientation_subtitle, render_help_modal_body, render_lightbox_html,
    render_orientation_chapter_items, render_orientation_modal_body,
    render_orientation_tab_content, OrientationModalState,
};
use crate::views::quiz::{render_quiz_view, QuizState};
use crate::views::revision::{
    open_focus_for_block, render_focus_dialog, render_revision_view, RevisionState,
};
use crate::views::role::{render_role_picker, render_role_results};

#[cfg(feature = "admin")]
use crate::views::admin::{
    audit_classes_local, render_admin_content, render_admin_dashboard, render_admin_journal,
    render_admin_login, render_admin_pilotage, render_admin_shell, render_admin_stats,
    render_admin_users, render_media_modal, render_passcode_modal, AdminState,
};
#[cfg(feature = "admin")]
use crate::views::studio::{render_live_preview, render_studio, StudioState};

#[cfg(target_arch = "wasm32")]
pub use wasm_abi::{alloc, dealloc, out_free, out_len, out_ptr};

#[cfg(target_arch = "wasm32")]
#[no_mangle]
pub extern "C" fn process(ptr: *const u8, len: u32) {
    let input = if ptr.is_null() || len == 0 {
        ""
    } else {
        let bytes = unsafe { std::slice::from_raw_parts(ptr, len as usize) };
        std::str::from_utf8(bytes).unwrap_or("")
    };
    let resp = dispatch_json(input);
    wasm_abi::write_output(resp.into_bytes());
}

thread_local! {
    static APP: RefCell<App> = RefCell::new(App::new());
}

/// Entry point for both WASM host and native Rust tests.
pub fn dispatch_json(input: &str) -> String {
    let req: Value = match serde_json::from_str(input) {
        Ok(v) => v,
        Err(e) => return json!({ "ok": false, "error": format!("JSON invalide: {e}"), "effects": [] }).to_string(),
    };
    let op = req["op"].as_str().unwrap_or("");
    let resp = APP.with(|cell| {
        let mut app = cell.borrow_mut();
        app.handle(op, &req)
    });
    resp.to_string()
}

pub struct App {
    pub is_admin: bool,
    pub root_prefix: String,
    pub prefers_dark: bool,
    pub viewport_width: u64,
    pub current_hash: String,
    pub current_route: Route,
    pub store: Store,
    pub classes: Vec<Value>,
    pub data_cache: BTreeMap<String, Value>,
    pub in_flight: BTreeSet<String>,
    pub failed_paths: BTreeSet<String>,
    pub role_filter: String,
    pub dash_state: DashboardState,
    pub rev_state: RevisionState,
    pub exo_state: ExerciseState,
    pub quiz_state: QuizState,
    pub quiz_loaded_key: String,
    pub orient_state: OrientationModalState,
    pub reset_armed: bool,
    pub now_ms: u64,
    #[cfg(feature = "admin")]
    pub admin_state: AdminState,
    #[cfg(feature = "admin")]
    pub studio_state: StudioState,
    #[cfg(feature = "admin")]
    pub studio_pending_open: Option<String>,
}

impl Default for App {
    fn default() -> Self {
        Self::new()
    }
}

impl App {
    pub fn new() -> Self {
        Self {
            is_admin: false,
            root_prefix: String::new(),
            prefers_dark: false,
            viewport_width: 1280,
            current_hash: String::new(),
            current_route: Route::RolePicker,
            store: Store::new(),
            classes: Vec::new(),
            data_cache: BTreeMap::new(),
            in_flight: BTreeSet::new(),
            failed_paths: BTreeSet::new(),
            role_filter: "all".into(),
            dash_state: DashboardState::default(),
            rev_state: RevisionState::default(),
            exo_state: ExerciseState::default(),
            quiz_state: QuizState::default(),
            quiz_loaded_key: String::new(),
            orient_state: OrientationModalState::default(),
            reset_armed: false,
            now_ms: 0,
            #[cfg(feature = "admin")]
            admin_state: AdminState {
                tab: "dashboard".into(),
                ..AdminState::default()
            },
            #[cfg(feature = "admin")]
            studio_state: StudioState::default(),
            #[cfg(feature = "admin")]
            studio_pending_open: None,
        }
    }

    pub fn handle(&mut self, op: &str, req: &Value) -> Value {
        if let Some(n) = req["now"].as_u64() {
            self.now_ms = n;
        }
        match op {
            "macros" => json!({ "ok": true, "macros": math_html::katex_macros_json() }),
            "init" => self.op_init(req),
            "hashchange" => self.op_hashchange(req),
            "fetch-result" => self.op_fetch_result(req),
            "event" => self.op_event(req),
            "tick" => self.op_tick(),
            "scroll" => self.op_scroll(req),
            "storage-sync" => self.op_storage_sync(req),
            "cloud-sync-apply" => self.op_cloud_sync_apply(req),
            "student-auth-state" => self.op_student_auth_state(req),
            #[cfg(feature = "admin")]
            "auth-status" => self.op_auth_status(req),
            #[cfg(feature = "admin")]
            "auth-result" => self.op_auth_result(req),
            #[cfg(feature = "admin")]
            "health-result" => self.op_health_result(req),
            #[cfg(feature = "admin")]
            "media-result" => self.op_media_result(req),
            #[cfg(feature = "admin")]
            "passcode-result" => self.op_passcode_result(req),
            "file-import" => self.op_file_import(req),
            "media-change" => {
                self.prefers_dark = req["prefersDark"].as_bool().unwrap_or(self.prefers_dark);
                let mut effs = Vec::new();
                self.push_shell_sync(&mut effs);
                json!({ "ok": true, "effects": effs })
            }
            _ => json!({ "ok": false, "error": format!("Unknown op: {op}"), "effects": [] }),
        }
    }

    fn is_dark(&self) -> bool {
        match self.store.theme() {
            "dark" => true,
            "light" => false,
            _ => self.prefers_dark,
        }
    }

    fn is_sb_collapsed(&self) -> bool {
        match self.store.sb_collapsed {
            Some(v) => v,
            None => self.viewport_width > 720 && self.viewport_width < 1120,
        }
    }

    fn canonical_path(path: &str) -> String {
        let s = path.trim().trim_start_matches('/');
        if let Some(rest) = s.strip_prefix("public/") {
            rest.to_string()
        } else {
            s.to_string()
        }
    }

    fn resolve_url(&self, canonical: &str) -> String {
        if canonical.starts_with("http://") || canonical.starts_with("https://") || canonical.starts_with('/') {
            canonical.to_string()
        } else if canonical.starts_with("data/") {
            format!("{}public/{canonical}", self.root_prefix)
        } else {
            format!("{}{canonical}", self.root_prefix)
        }
    }

    fn get_doc(&self, path: &str) -> Option<Value> {
        let key = Self::canonical_path(path);
        if let Some(ov) = self.store.get_override(&key) {
            if let Some(raw) = ov["json"].as_str() {
                if let Ok(parsed) = serde_json::from_str(raw) {
                    return Some(parsed);
                }
            }
        }
        self.data_cache.get(&key).cloned()
    }

    fn queue_fetch(&mut self, effs: &mut Vec<Value>, path: &str, optional: bool) {
        let key = Self::canonical_path(path);
        if key.is_empty() || self.get_doc(&key).is_some() || self.in_flight.contains(&key) || self.failed_paths.contains(&key) {
            return;
        }
        self.in_flight.insert(key.clone());
        effs.push(json!({
            "type": "fetch",
            "id": key,
            "url": self.resolve_url(&key),
            "optional": optional
        }));
    }

    pub(crate) fn has_problemes(class_id: &str) -> bool {
        matches!(
            class_id,
            "tronc-commun-sc" | "1ere-bac-sc-math" | "2eme-bac-sc-ex" | "2eme-bac-sc-math"
        )
    }

    pub(crate) fn has_olympiads(class_id: &str) -> bool {
        matches!(class_id, "tronc-commun-sc" | "1ere-bac-sc-math")
    }

    pub(crate) fn has_examens(class_id: &str) -> bool {
        matches!(class_id, "2eme-bac-sc-ex" | "2eme-bac-sc-math")
    }

    pub(crate) fn has_cadre(class_id: &str) -> bool {
        matches!(class_id, "2eme-bac-sc-ex" | "2eme-bac-sc-math")
    }

    pub(crate) fn has_concours(class_id: &str) -> bool {
        matches!(class_id, "2eme-bac-sc-ex" | "2eme-bac-sc-math")
    }

    fn class_manifest_path(&self, class_id: &str) -> String {
        for c in &self.classes {
            if c["id"].as_str() == Some(class_id) {
                if let Some(p) = c["path"].as_str().filter(|s| !s.is_empty()) {
                    return Self::canonical_path(p);
                }
            }
        }
        format!("data/classes/{class_id}.json")
    }

    fn push_shell_sync(&self, effs: &mut Vec<Value>) {
        let dark = self.is_dark();
        let sb_col = self.is_sb_collapsed();
        let theme_attr = match self.store.theme() {
            "dark" => "dark",
            "light" => "light",
            _ => "",
        };
        let active_cid = match &self.current_route {
            Route::Dashboard { class_id, .. }
            | Route::Cadre { class_id }
            | Route::Revision { class_id, .. }
            | Route::Quiz { class_id, .. }
            | Route::Concours { class_id, .. }
            | Route::ExerciseList { class_id, .. }
            | Route::ExerciseDetail { class_id, .. }
            | Route::ExamDetail { class_id, .. } => Some(class_id.as_str()),
            _ => self.store.class_id(),
        };
        let class_sub = active_cid
            .map(format_class_short)
            .unwrap_or_else(|| "Espace élève".into());
        effs.push(json!({
            "type": "sync-shell",
            "view": self.current_route.view_type(),
            "title": self.current_route.document_title(),
            "hasSb": self.current_route.has_sidebar(),
            "theme": theme_attr,
            "isDark": dark,
            "palette": self.store.palette(),
            "sbCollapsed": sb_col,
            "classSub": class_sub,
            "themeLabel": if dark { "Mode clair" } else { "Mode sombre" },
            "themeIcon": icon(if dark { "sun" } else { "moon" }, 18, ""),
            "sbToggleIcon": icon(if sb_col { "panel-left-open" } else { "panel-left-close" }, 18, "")
        }));
    }

    fn push_sidebar_icons(effs: &mut Vec<Value>) {
        effs.push(json!({
            "type": "init-icons",
            "icons": {
                "panel-left-close": icon("panel-left-close", 18, ""),
                "panel-left-open": icon("panel-left-open", 18, ""),
                "compass": icon("compass", 20, ""),
                "question-circle": icon("question-circle", 20, ""),
                "moon": icon("moon", 18, ""),
                "sun": icon("sun", 18, ""),
                "settings": icon("settings", 20, ""),
                "chevron-left": icon("chevron-left", 15, "")
            }
        }));
    }

    fn op_init(&mut self, req: &Value) -> Value {
        self.is_admin = req["isAdmin"].as_bool().unwrap_or(false);
        self.root_prefix = req["rootPrefix"].as_str().unwrap_or("").to_string();
        self.prefers_dark = req["prefersDark"].as_bool().unwrap_or(false);
        self.viewport_width = req["viewportWidth"].as_u64().unwrap_or(1280);
        let profile_migrated = self.store.load_from_storage(&req["storage"], &req["session"]);

        let mut effs = Vec::new();
        if profile_migrated {
            effs.push(storage_effect(KEY_PROFILE, &self.store.profile));
        }
        if !self.is_admin {
            Self::push_sidebar_icons(&mut effs);
        }
        #[cfg(feature = "admin")]
        if self.is_admin {
            self.admin_state.auth_mode = "checking".into();
            effs.push(json!({ "type": "auth-check" }));
        }

        self.queue_fetch(&mut effs, "data/manifest.json", false);

        let raw_hash = req["hash"].as_str().unwrap_or("");
        self.navigate_to(raw_hash, &mut effs, false);
        effs.push(json!({ "type": "hide-splash" }));
        json!({ "ok": true, "effects": effs })
    }

    fn op_hashchange(&mut self, req: &Value) -> Value {
        let raw_hash = req["hash"].as_str().unwrap_or("");
        let mut effs = Vec::new();
        self.navigate_to(raw_hash, &mut effs, true);
        json!({ "ok": true, "effects": effs })
    }

    fn navigate_to(&mut self, raw_hash: &str, effs: &mut Vec<Value>, with_transition: bool) {
        let prev_hash = self.current_hash.clone();
        let route = parse_route(raw_hash, self.is_admin, self.store.class_id());
        let next_hash = route.canonical_hash();
        let (nav_kind, nav_dir) = if with_transition {
            classify_transition(&prev_hash, &next_hash)
        } else {
            ("none".into(), String::new())
        };

        self.current_hash = next_hash;
        self.current_route = route.clone();
        self.reset_armed = false;
        if self.rev_state.focus_open {
            self.rev_state.focus_open = false;
            effs.push(json!({ "type": "dialog", "selector": "#focus-dlg", "open": false }));
        }

        // Route-specific state resets & required fetches
        match &route {
            Route::RolePicker => {
                effs.push(json!({ "type": "timer", "active": false }));
                if self.classes.is_empty() {
                    self.failed_paths.remove("data/manifest.json");
                    self.queue_fetch(effs, "data/manifest.json", false);
                }
            }
            Route::Dashboard { class_id, tab } => {
                effs.push(json!({ "type": "timer", "active": false }));
                self.dash_state.active_tab = tab.clone();
                if self.store.class_id() != Some(class_id.as_str()) {
                    effs.push(self.store.set_profile_field("classId", json!(class_id.as_str())));
                }
                let mp = self.class_manifest_path(class_id);
                self.failed_paths.remove(&Self::canonical_path(&mp));
                self.queue_fetch(effs, &mp, false);
                if Self::has_problemes(class_id) {
                    self.queue_fetch(effs, &format!("data/{class_id}/problemes/index.json"), true);
                }
                if Self::has_examens(class_id) {
                    self.queue_fetch(effs, &format!("data/{class_id}/examen/index.json"), true);
                    if tab == "examens" {
                        self.queue_exam_docs(effs, class_id);
                    }
                }
                if Self::has_olympiads(class_id) {
                    self.queue_fetch(effs, &format!("data/{class_id}/olympiad/manifest.json"), true);
                }
                if Self::has_cadre(class_id) {
                    self.queue_fetch(effs, &format!("data/{class_id}/examen/cadre_referentiel.json"), true);
                }
                if Self::has_concours(class_id) {
                    self.queue_fetch(effs, "data/concours/schools.json", true);
                    for sid in ["ensa", "ensam", "medecine"] {
                        self.queue_fetch(effs, &format!("data/concours/{sid}/manifest.json"), true);
                    }
                }
                self.queue_fetch(effs, ORIENTATION_INDEX_PATH, true);
                let opath = orientation_class_path(self.get_doc(ORIENTATION_INDEX_PATH).as_ref(), class_id);
                self.queue_fetch(effs, &opath, true);
            }
            Route::Cadre { class_id } => {
                effs.push(json!({ "type": "timer", "active": false }));
                if Self::has_cadre(class_id) {
                    self.queue_fetch(effs, &format!("data/{class_id}/examen/cadre_referentiel.json"), true);
                }
            }
            Route::Revision { class_id, chapter_id, path } => {
                effs.push(json!({ "type": "timer", "active": false }));
                self.rev_state.class_id = class_id.clone();
                self.rev_state.chapter_id = chapter_id.clone();
                self.rev_state.path = path.clone();
                self.rev_state.toc_open = false;
                self.rev_state.menu_open = false;
                self.failed_paths.remove(&Self::canonical_path(path));
                self.queue_fetch(effs, path, false);
                // Minimum 15% reading credit upon opening a lesson sheet
                let mut rev_effs = self.store.set_revision_pct(class_id, chapter_id, path, 15, self.now_ms);
                effs.append(&mut rev_effs);
            }
            Route::Quiz { class_id, chapter_id, path } => {
                let key = format!("quiz::{class_id}::{chapter_id}::{path}");
                if self.quiz_loaded_key != key {
                    self.quiz_loaded_key.clear();
                }
                self.failed_paths.remove(&Self::canonical_path(path));
                self.queue_fetch(effs, path, false);
                if let Some(doc) = self.get_doc(path) {
                    if self.quiz_loaded_key != key {
                        self.quiz_state.init_from_doc(class_id, chapter_id, &doc, false, "", "");
                        self.quiz_state.set_source_path(path);
                        self.quiz_loaded_key = key;
                    }
                }
                effs.push(json!({ "type": "timer", "active": true }));
            }
            Route::Concours { class_id, school_id, mode, path, theme } => {
                let key = Self::concours_quiz_key(class_id, school_id, mode, path.as_deref(), theme.as_deref());
                if self.quiz_loaded_key != key {
                    self.quiz_loaded_key.clear();
                }
                self.queue_fetch(effs, "data/concours/schools.json", true);
                let man_path = format!("data/concours/{school_id}/manifest.json");
                self.failed_paths.remove(&Self::canonical_path(&man_path));
                self.queue_fetch(effs, &man_path, false);
                if let Some(p) = path.as_deref() {
                    let qp = Self::canonical_path(p);
                    self.failed_paths.remove(&qp);
                    self.queue_fetch(effs, &qp, false);
                } else if let Some(man) = self.get_doc(&man_path) {
                    if theme.is_some() || mode == "simulation" {
                        self.queue_concours_annales(effs, &man);
                    } else if let Some(qp) = Self::pick_concours_quiz_path(&man, mode) {
                        self.failed_paths.remove(&Self::canonical_path(&qp));
                        self.queue_fetch(effs, &qp, false);
                    }
                }
                self.try_init_concours_quiz(class_id, school_id, mode, path.as_deref(), theme.as_deref());
                effs.push(json!({ "type": "timer", "active": true }));
            }
            Route::ExerciseList { class_id, chapter_id } => {
                effs.push(json!({ "type": "timer", "active": false }));
                let mp = self.class_manifest_path(class_id);
                let ch_man = format!("data/{class_id}/{chapter_id}/manifest.json");
                self.failed_paths.remove(&Self::canonical_path(&mp));
                self.failed_paths.remove(&Self::canonical_path(&ch_man));
                self.queue_fetch(effs, &mp, false);
                self.queue_fetch(effs, &ch_man, false);
            }
            Route::ExerciseDetail { class_id, chapter_id, ex_path } => {
                self.exo_state.elapsed_sec = 0;
                self.exo_state.open_hints.clear();
                self.exo_state.open_sols.clear();
                let ch_man = format!("data/{class_id}/{chapter_id}/manifest.json");
                self.failed_paths.remove(&Self::canonical_path(&ch_man));
                self.failed_paths.remove(&Self::canonical_path(ex_path));
                self.queue_fetch(effs, &ch_man, false);
                self.queue_fetch(effs, ex_path, false);
                effs.push(json!({ "type": "timer", "active": true }));
            }
            Route::ExamDetail { class_id, path, theme } => {
                let _ = class_id;
                self.exo_state.elapsed_sec = 0;
                self.exo_state.active_exam_idx = 0;
                self.exo_state.open_hints.clear();
                self.exo_state.open_sols.clear();
                self.failed_paths.remove(&Self::canonical_path(path));
                self.queue_fetch(effs, path, false);
                self.apply_exam_theme_focus(effs, path, theme.as_deref());
                effs.push(json!({ "type": "timer", "active": true }));
            }
            #[cfg(feature = "admin")]
            Route::Admin { tab, query } => {
                effs.push(json!({ "type": "timer", "active": false }));
                self.admin_state.tab = tab.clone();
                self.admin_state.drawer_open = false;
                if tab == "studio" {
                    if let Some(p) = query.get("path").filter(|s| !s.is_empty()) {
                        let clean = Self::canonical_path(p);
                        if let Some(doc) = self.get_doc(&clean) {
                            self.studio_state.open_doc(&clean, doc);
                            self.studio_pending_open = None;
                        } else {
                            self.studio_pending_open = Some(clean.clone());
                            self.queue_fetch(effs, &clean, false);
                        }
                    }
                    let cid = self.studio_state.class_id.clone();
                    let mp = self.class_manifest_path(&cid);
                    self.queue_fetch(effs, &mp, false);
                }
            }
        }

        self.push_shell_sync(effs);
        self.render_current_route_with_dir(effs, &nav_kind, &nav_dir);
    }

    fn queue_exam_docs(&mut self, effs: &mut Vec<Value>, class_id: &str) {
        let Some(idx_doc) = self.get_doc(&format!("data/{class_id}/examen/index.json")) else {
            return;
        };
        let paths: Vec<String> = idx_doc
            .get("examens")
            .or_else(|| idx_doc.get("exams"))
            .and_then(Value::as_array)
            .map(|arr| {
                arr.iter()
                    .filter_map(|e| e.get("path").and_then(Value::as_str))
                    .map(|s| s.to_string())
                    .collect()
            })
            .unwrap_or_default();
        for p in paths {
            self.queue_fetch(effs, &p, true);
        }
    }

    fn apply_exam_theme_focus(&mut self, effs: &mut Vec<Value>, path: &str, theme: Option<&str>) {
        let Some(tid) = theme.filter(|s| !s.is_empty()) else { return };
        let Some(doc) = self.get_doc(path) else { return };
        if let Some(exs) = doc.get("exercises").and_then(Value::as_array) {
            if let Some(idx) = exs.iter().position(|e| e.get("theme").and_then(Value::as_str) == Some(tid)) {
                self.exo_state.active_exam_idx = idx;
                if idx > 0 {
                    effs.push(json!({ "type": "scroll-to", "selector": format!("#exo-sheet-{idx}") }));
                }
            }
        }
    }

    fn queue_concours_annales(&mut self, effs: &mut Vec<Value>, man: &Value) {
        let paths: Vec<String> = man
            .get("annales")
            .and_then(Value::as_array)
            .map(|arr| {
                arr.iter()
                    .filter(|a| {
                        a.get("questionsCount")
                            .or_else(|| a.get("count"))
                            .and_then(Value::as_u64)
                            .unwrap_or(1)
                            > 0
                    })
                    .filter_map(|a| a.get("path").and_then(Value::as_str))
                    .map(|s| s.to_string())
                    .collect()
            })
            .unwrap_or_default();
        for p in paths {
            self.queue_fetch(effs, &p, true);
        }
    }

    fn concours_quiz_key(class_id: &str, school_id: &str, mode: &str, path: Option<&str>, theme: Option<&str>) -> String {
        format!(
            "conc::{class_id}::{school_id}::{mode}::{}::{}",
            path.unwrap_or(""),
            theme.unwrap_or("")
        )
    }

    fn pick_concours_quiz_path(man: &Value, mode: &str) -> Option<String> {
        let primary = if mode == "simulation" { "annales" } else { "quizzes" };
        let fallback = if mode == "simulation" { "quizzes" } else { "annales" };
        for key in [primary, fallback] {
            if let Some(arr) = man.get(key).and_then(Value::as_array) {
                if let Some(p) = arr
                    .iter()
                    .find(|it| {
                        let cnt = it
                            .get("questionsCount")
                            .or_else(|| it.get("count"))
                            .and_then(Value::as_u64)
                            .unwrap_or(1);
                        cnt > 0
                            && it["path"].as_str().map(|s| !s.is_empty()).unwrap_or(false)
                    })
                    .and_then(|it| it["path"].as_str())
                {
                    return Some(Self::canonical_path(p));
                }
            }
        }
        None
    }

    fn concours_school_time(&self, school_id: &str, man: Option<&Value>) -> Option<u64> {
        man.and_then(|m| m["timePerQuestion"].as_u64())
            .or_else(|| {
                self.get_doc("data/concours/schools.json").and_then(|sc| {
                    sc["schools"]
                        .as_array()?
                        .iter()
                        .find(|s| s["id"].as_str() == Some(school_id))
                        .and_then(|s| s["timePerQuestion"].as_u64())
                })
            })
    }

    fn concours_theme_name(&self, school_id: &str, theme_id: &str) -> String {
        if let Some(sc) = self.get_doc("data/concours/schools.json") {
            if let Some(schools) = sc["schools"].as_array() {
                if let Some(s) = schools.iter().find(|s| s["id"].as_str() == Some(school_id)) {
                    if let Some(themes) = s["themes"].as_array() {
                        if let Some(t) = themes.iter().find(|t| t["id"].as_str() == Some(theme_id)) {
                            if let Some(name) = t["name"].as_str().filter(|v| !v.is_empty()) {
                                return name.to_string();
                            }
                        }
                    }
                }
            }
        }
        theme_id.to_string()
    }

    fn concours_fallback_title(&self, school_id: &str, mode: &str, man: Option<&Value>, qp: &str) -> String {
        let school_name = man
            .and_then(|m| m["name"].as_str())
            .unwrap_or_else(|| match school_id {
                "ensa" => "ENSA",
                "ensam" => "ENSAM",
                "medecine" => "Médecine",
                _ => school_id,
            });
        if let Some(m) = man {
            if let Some(arr) = m["quizzes"].as_array() {
                if let Some(q) = arr.iter().find(|it| it["path"].as_str().map(Self::canonical_path).as_deref() == Some(qp)) {
                    if let Some(t) = q["title"].as_str().filter(|s| !s.is_empty()) {
                        return format!("{school_name} — {t}");
                    }
                }
            }
            if let Some(arr) = m["annales"].as_array() {
                if let Some(a) = arr.iter().find(|it| it["path"].as_str().map(Self::canonical_path).as_deref() == Some(qp)) {
                    if let Some(y) = a["year"].as_str().filter(|s| !s.is_empty()) {
                        return format!("{school_name} {y}");
                    }
                }
            }
        }
        let mode_lbl = if mode == "simulation" { "Simulation" } else { "Entraînement" };
        format!("{school_name} — {mode_lbl}")
    }

    fn concours_school_questions_limit(&self, school_id: &str, man: Option<&Value>) -> usize {
        man.and_then(|m| m["questionsPerExam"].as_u64())
            .or_else(|| {
                self.get_doc("data/concours/schools.json").and_then(|sc| {
                    sc["schools"]
                        .as_array()?
                        .iter()
                        .find(|s| s["id"].as_str() == Some(school_id))
                        .and_then(|s| s["questionsPerExam"].as_u64())
                })
            })
            .filter(|&n| n > 0)
            .unwrap_or(30) as usize
    }

    fn try_init_concours_quiz(&mut self, class_id: &str, school_id: &str, mode: &str, path: Option<&str>, theme: Option<&str>) {
        let key = Self::concours_quiz_key(class_id, school_id, mode, path, theme);
        if self.quiz_loaded_key == key {
            return;
        }
        let man = self.get_doc(&format!("data/concours/{school_id}/manifest.json"));

        if path.is_none() && (theme.is_some() || mode == "simulation") {
            let Some(ref m) = man else { return };
            let mut ann_entries: Vec<(u32, String)> = m
                .get("annales")
                .and_then(Value::as_array)
                .map(|arr| {
                    arr.iter()
                        .filter(|a| {
                            a.get("questionsCount")
                                .or_else(|| a.get("count"))
                                .and_then(Value::as_u64)
                                .unwrap_or(1)
                                > 0
                        })
                        .filter_map(|a| {
                            let p = Self::canonical_path(a.get("path").and_then(Value::as_str)?);
                            let yr = a
                                .get("year")
                                .and_then(|v| v.as_str().map(|s| s.to_string()).or_else(|| v.as_u64().map(|n| n.to_string())))
                                .unwrap_or_default()
                                .chars()
                                .take(4)
                                .collect::<String>()
                                .parse::<u32>()
                                .unwrap_or(0);
                            Some((yr, p))
                        })
                        .collect()
                })
                .unwrap_or_default();
            ann_entries.sort_by(|a, b| b.0.cmp(&a.0));
            let ann_paths: Vec<String> = ann_entries.into_iter().map(|(_, p)| p).collect();

            if !ann_paths.is_empty()
                && ann_paths.iter().any(|p| self.get_doc(p).is_none() && !self.failed_paths.contains(p))
            {
                return;
            }

            let limit = self.concours_school_questions_limit(school_id, man.as_ref());
            let school_name = m.get("name").and_then(Value::as_str).unwrap_or(school_id);
            let time_per_q = self.concours_school_time(school_id, man.as_ref());

            if let Some(tid) = theme.filter(|s| !s.is_empty()) {
                let mut collected = Vec::new();
                for p in &ann_paths {
                    if let Some(doc) = self.get_doc(p) {
                        if let Some(qs) = doc.get("questions").and_then(Value::as_array) {
                            for q in qs {
                                if q.get("theme").and_then(Value::as_str) == Some(tid) {
                                    collected.push(q.clone());
                                    if collected.len() >= limit {
                                        break;
                                    }
                                }
                            }
                        }
                    }
                    if collected.len() >= limit {
                        break;
                    }
                }
                if collected.is_empty() {
                    if let Some(qp) = m
                        .get("quizzes")
                        .and_then(Value::as_array)
                        .and_then(|arr| arr.iter().find(|q| q.get("theme").and_then(Value::as_str) == Some(tid)))
                        .and_then(|q| q.get("path").and_then(Value::as_str))
                        .map(Self::canonical_path)
                    {
                        if let Some(doc) = self.get_doc(&qp) {
                            let fallback_title = self.concours_fallback_title(school_id, mode, man.as_ref(), &qp);
                            self.quiz_state.init_from_doc_with_opts(
                                class_id, "concours", &doc, true, school_id, mode, Some(&fallback_title), time_per_q, false,
                            );
                            self.quiz_state.set_source_path(&qp);
                            self.quiz_loaded_key = key;
                        }
                    }
                    return;
                }
                let theme_name = self.concours_theme_name(school_id, tid);
                let synth_doc = json!({
                    "title": format!("{school_name} — {theme_name}"),
                    "questions": collected
                });
                self.quiz_state.init_from_doc_with_opts(
                    class_id, "concours", &synth_doc, true, school_id, mode, None, time_per_q, false,
                );
                self.quiz_loaded_key = key;
                return;
            }

            if mode == "simulation" && !ann_paths.is_empty() {
                let mut collected = Vec::new();
                for p in &ann_paths {
                    if let Some(doc) = self.get_doc(p) {
                        if let Some(qs) = doc.get("questions").and_then(Value::as_array) {
                            for q in qs {
                                collected.push(q.clone());
                                if collected.len() >= limit {
                                    break;
                                }
                            }
                        }
                    }
                    if collected.len() >= limit {
                        break;
                    }
                }
                if !collected.is_empty() {
                    let synth_doc = json!({
                        "title": format!("{school_name} — Simulation complète"),
                        "questions": collected
                    });
                    self.quiz_state.init_from_doc_with_opts(
                        class_id, "concours", &synth_doc, true, school_id, mode, None, time_per_q, false,
                    );
                    self.quiz_loaded_key = key;
                    return;
                }
            }
        }

        let qp = if let Some(p) = path {
            Some(Self::canonical_path(p))
        } else {
            man.as_ref().and_then(|m| Self::pick_concours_quiz_path(m, mode))
        };
        let Some(qp) = qp else { return };
        let Some(doc) = self.get_doc(&qp) else { return };
        let time_per_q = self.concours_school_time(school_id, man.as_ref());
        let fallback_title = self.concours_fallback_title(school_id, mode, man.as_ref(), &qp);
        self.quiz_state.init_from_doc_with_opts(
            class_id,
            "concours",
            &doc,
            true,
            school_id,
            mode,
            Some(&fallback_title),
            time_per_q,
            path.is_none(),
        );
        self.quiz_state.set_source_path(&qp);
        self.quiz_loaded_key = key;
    }

    fn op_fetch_result(&mut self, req: &Value) -> Value {
        let id = Self::canonical_path(req["id"].as_str().unwrap_or(""));
        let ok = req["ok"].as_bool().unwrap_or(false);
        self.in_flight.remove(&id);

        let mut effs = Vec::new();
        if ok && !req["data"].is_null() {
            let data = req["data"].clone();
            self.data_cache.insert(id.clone(), data.clone());

            if id == "data/manifest.json" {
                if let Some(arr) = data["classes"].as_array() {
                    self.classes = arr.clone();
                    #[cfg(feature = "admin")]
                    if self.is_admin {
                        let paths: Vec<String> = self
                            .classes
                            .iter()
                            .map(|c| {
                                c["path"]
                                    .as_str()
                                    .map(Self::canonical_path)
                                    .unwrap_or_else(|| {
                                        format!("data/classes/{}.json", c["id"].as_str().unwrap_or(""))
                                    })
                            })
                            .collect();
                        for p in paths {
                            self.queue_fetch(&mut effs, &p, true);
                        }
                    }
                    // Validate current Dashboard class against manifest (auto-recover stale localStorage classId)
                    if !self.is_admin && !self.classes.is_empty() {
                        if let Route::Dashboard { ref class_id, .. } = self.current_route.clone() {
                            let known = self
                                .classes
                                .iter()
                                .any(|c| c["id"].as_str() == Some(class_id.as_str()));
                            if !known {
                                effs.push(self.store.set_profile_field("classId", Value::Null));
                                self.current_route = Route::RolePicker;
                                self.current_hash = "#/eleve".into();
                                effs.push(json!({ "type": "set-hash", "hash": "#/eleve", "silent": true }));
                                self.push_shell_sync(&mut effs);
                            } else {
                                let mp = self.class_manifest_path(class_id);
                                let canon = Self::canonical_path(&mp);
                                if self.get_doc(&canon).is_none() && !self.in_flight.contains(&canon) {
                                    self.failed_paths.remove(&canon);
                                    self.queue_fetch(&mut effs, &canon, false);
                                }
                            }
                        }
                    }
                }
            }

            if id.starts_with("data/orientation/") {
                if id == ORIENTATION_INDEX_PATH && self.orient_state.open {
                    let opath = orientation_class_path(Some(&data), &self.orient_state.class_id);
                    self.queue_fetch(&mut effs, &opath, true);
                }
                if self.orient_state.open {
                    self.push_orientation_modal(&mut effs);
                    return json!({ "ok": true, "effects": effs });
                }
            }

            // If Examens index arrived while viewing Examens tab, queue individual exam docs for theme filtering
            if let Route::Dashboard { ref class_id, ref tab } = self.current_route.clone() {
                if tab == "examens" && id == format!("data/{class_id}/examen/index.json") {
                    self.queue_exam_docs(&mut effs, class_id);
                }
            }

            // If ExamDetail paper arrived with a theme filter, focus matching exercise
            if let Route::ExamDetail { ref path, ref theme, .. } = self.current_route.clone() {
                if id == Self::canonical_path(path) {
                    self.apply_exam_theme_focus(&mut effs, path, theme.as_deref());
                }
            }

            // If Concours manifest or paper just loaded, fetch/init the quiz
            if let Route::Concours { ref class_id, ref school_id, ref mode, ref path, ref theme } = self.current_route.clone() {
                if path.is_none() && id == format!("data/concours/{school_id}/manifest.json") {
                    if theme.is_some() || mode == "simulation" {
                        self.queue_concours_annales(&mut effs, &data);
                    } else if let Some(qp) = Self::pick_concours_quiz_path(&data, mode) {
                        self.queue_fetch(&mut effs, &qp, false);
                    }
                }
                self.try_init_concours_quiz(class_id, school_id, mode, path.as_deref(), theme.as_deref());
            }

            // Initialize Quiz when quiz JSON arrives
            if let Route::Quiz { ref class_id, ref chapter_id, ref path } = self.current_route.clone() {
                let canon = Self::canonical_path(path);
                let key = format!("quiz::{class_id}::{chapter_id}::{path}");
                if id == canon && self.quiz_loaded_key != key {
                    if let Some(doc) = self.get_doc(&canon) {
                        self.quiz_state.init_from_doc(class_id, chapter_id, &doc, false, "", "");
                        self.quiz_state.set_source_path(&canon);
                        self.quiz_loaded_key = key;
                    }
                }
            }

            // Admin Pilotage & Studio hooks
            #[cfg(feature = "admin")]
            if self.is_admin {
                if let Some((ref cid, ref chid)) = self.admin_state.selected_chapter {
                    if id == format!("data/{cid}/{chid}/manifest.json") {
                        self.admin_state.selected_manifest = Some(data.clone());
                    }
                }
                if self.studio_pending_open.as_deref() == Some(id.as_str()) {
                    if let Some(doc) = self.get_doc(&id) {
                        self.studio_state.open_doc(&id, doc);
                    }
                    self.studio_pending_open = None;
                }
                // Populate studio chapter_exercises if a chapter manifest just arrived
                let prefix = format!("data/{}/", self.studio_state.class_id);
                if let Some(rest) = id.strip_prefix(&prefix) {
                    if let Some(ch_id) = rest.strip_suffix("/manifest.json") {
                        if let Some(exs) = data["exercises"].as_array() {
                            self.studio_state.chapter_exercises.insert(ch_id.to_string(), exs.clone());
                        }
                    }
                }
            }
        } else {
            self.failed_paths.insert(id.clone());
        }

        // Complete pending full-catalog admin audit once all class manifests finish loading
        #[cfg(feature = "admin")]
        if self.is_admin && self.admin_state.audit_pending {
            let still_loading = self.classes.iter().any(|c| {
                c["id"]
                    .as_str()
                    .map(|cid| {
                        let mp = Self::canonical_path(&self.class_manifest_path(cid));
                        self.in_flight.contains(&mp)
                    })
                    .unwrap_or(false)
            });
            if !still_loading {
                self.admin_state.audit_pending = false;
                self.admin_state.audit_running = false;
                let cache = self.build_admin_class_cache();
                self.admin_state.audit_reports =
                    audit_classes_local(&self.classes, &cache, &self.store.overrides);
                effs.push(json!({
                    "type": "toast",
                    "message": "Audit complet Rust/WASM terminé",
                    "tone": "ok"
                }));
            }
        }

        // Re-render current route (skip redundant full re-mounts from background prefetches)
        let mut should_render = match &self.current_route {
            Route::Quiz { .. } | Route::Concours { .. } => self.quiz_state.questions.is_empty() || !self.quiz_loaded_key.is_empty(),
            _ => true,
        };
        if let Route::Dashboard { ref class_id, ref tab } = self.current_route.clone() {
            let class_canon = Self::canonical_path(&self.class_manifest_path(class_id));
            if self.get_doc(&class_canon).is_some() && id != class_canon && id != "data/manifest.json" {
                let exam_prefix = format!("data/{class_id}/examen/");
                let exam_index = format!("data/{class_id}/examen/index.json");
                let cadre_path = format!("data/{class_id}/examen/cadre_referentiel.json");
                let prob_index = format!("data/{class_id}/problemes/index.json");
                let oly_man = format!("data/{class_id}/olympiad/manifest.json");
                if id == cadre_path {
                    should_render = false;
                } else if id.starts_with(&exam_prefix) && id != exam_index {
                    should_render = false;
                    if tab == "examens" && self.dash_state.exam_filter == "themes" {
                        let exams = self.get_doc(&exam_index);
                        let subbar_html = render_exams_subbar(exams.as_ref(), &self.data_cache, &self.dash_state);
                        let results_html = render_exams_results(class_id, exams.as_ref(), &self.data_cache, &self.dash_state);
                        effs.push(json!({ "type": "patch", "selector": "#exam-subbar", "html": subbar_html }));
                        effs.push(json!({ "type": "patch", "selector": "#exam-results", "html": results_html }));
                        effs.push(json!({ "type": "sync-pill" }));
                    }
                } else if (id == exam_index && tab != "examens")
                    || (id == prob_index && tab != "problemes")
                    || (id == oly_man && tab != "olympiades")
                    || (id.starts_with("data/concours/") && tab != "concours")
                {
                    should_render = false;
                }
            }
        }
        if should_render {
            self.render_current_route(&mut effs, "none");
        }
        json!({ "ok": true, "effects": effs })
    }

    fn render_current_route(&self, effs: &mut Vec<Value>, transition: &str) {
        self.render_current_route_with_dir(effs, transition, "");
    }

    fn render_current_route_with_dir(&self, effs: &mut Vec<Value>, nav_kind: &str, nav_dir: &str) {
        let html = self.render_route_html();
        effs.push(json!({
            "type": "mount",
            "selector": "#app",
            "html": html,
            "transition": nav_kind,
            "navKind": nav_kind,
            "navDir": nav_dir
        }));
        if matches!(
            self.current_route,
            Route::RolePicker | Route::Dashboard { .. } | Route::Cadre { .. }
        ) {
            effs.push(json!({ "type": "sync-pill" }));
        }
    }

    fn push_rev_theme_sync(&self, effs: &mut Vec<Value>) {
        let th = self.store.theme();
        let seg_idx = match th {
            "light" => "0",
            "dark" => "1",
            _ => "2",
        };
        let th_state = match th {
            "auto" => format!("Auto · {}", if self.is_dark() { "Sombre" } else { "Clair" }),
            "dark" => "Sombre".into(),
            _ => "Clair".into(),
        };
        effs.push(json!({ "type": "set-style", "selector": "#les-theme-seg", "prop": "--seg-idx", "value": seg_idx }));
        effs.push(json!({ "type": "patch", "selector": "#les-theme-state", "html": esc(&th_state) }));
        for opt in ["light", "dark", "auto"] {
            let active = th == opt;
            let sel = format!(r#"[data-les-theme="{opt}"]"#);
            effs.push(json!({ "type": "set-class", "selector": sel, "class": "is-active", "on": active }));
            effs.push(json!({ "type": "set-attr", "selector": sel, "attr": "aria-checked", "value": if active { "true" } else { "false" } }));
        }
    }

    fn render_route_html(&self) -> String {
        match &self.current_route {
            Route::RolePicker => {
                if self.classes.is_empty() {
                    if self.failed_paths.contains("data/manifest.json")
                        || !self.in_flight.contains("data/manifest.json")
                    {
                        return load_error_card(
                            "Impossible de charger la liste des classes",
                            "Vérifiez votre connexion puis réessayez.",
                            false,
                        );
                    }
                    return loading_skeleton("Chargement des classes…");
                }
                render_role_picker(&self.classes, &self.role_filter, &self.store, self.is_dark())
            }
            Route::Dashboard { class_id, .. } => {
                let mp = self.class_manifest_path(class_id);
                let canon = Self::canonical_path(&mp);
                let Some(class_doc) = self.get_doc(&canon) else {
                    if self.failed_paths.contains(&canon) || !self.in_flight.contains(&canon) {
                        return load_error_card(
                            "Impossible de charger ce programme",
                            "Le programme demandé n’a pas pu être récupéré. Réessayez ou choisissez une autre classe.",
                            true,
                        );
                    }
                    return loading_skeleton("Chargement du programme…");
                };
                let problems = if Self::has_problemes(class_id) {
                    self.get_doc(&format!("data/{class_id}/problemes/index.json"))
                } else {
                    None
                };
                let exams = if Self::has_examens(class_id) {
                    self.get_doc(&format!("data/{class_id}/examen/index.json"))
                } else {
                    None
                };
                let olympiads = if Self::has_olympiads(class_id) {
                    self.get_doc(&format!("data/{class_id}/olympiad/manifest.json"))
                } else {
                    None
                };
                let concours = if Self::has_concours(class_id) {
                    self.get_doc("data/manifest.json")
                } else {
                    None
                };
                let concours_schools = if Self::has_concours(class_id) {
                    self.get_doc("data/concours/schools.json")
                } else {
                    None
                };
                let mut concours_manifests: Vec<(&str, Value)> = Vec::new();
                if Self::has_concours(class_id) {
                    for sid in ["ensa", "ensam", "medecine"] {
                        if let Some(m) = self.get_doc(&format!("data/concours/{sid}/manifest.json")) {
                            concours_manifests.push((sid, m));
                        }
                    }
                }
                let cadre = if Self::has_cadre(class_id) {
                    self.get_doc(&format!("data/{class_id}/examen/cadre_referentiel.json"))
                } else {
                    None
                };
                let data = DashboardData {
                    class_id,
                    class_doc: &class_doc,
                    problems: problems.as_ref(),
                    exams: exams.as_ref(),
                    exam_docs: &self.data_cache,
                    olympiads: olympiads.as_ref(),
                    concours: concours.as_ref(),
                    concours_schools: concours_schools.as_ref(),
                    concours_manifests,
                    cadre: cadre.as_ref(),
                };
                render_dashboard(&data, &self.dash_state, &self.store, self.is_dark())
            }
            Route::Cadre { class_id } => {
                let path = format!("data/{class_id}/examen/cadre_referentiel.json");
                let cadre = self.get_doc(&path);
                if cadre.is_none() && self.in_flight.contains(&path) {
                    return loading_skeleton("Chargement du cadre référentiel…");
                }
                render_cadre_view(class_id, cadre.as_ref(), &self.dash_state, &self.store)
            }
            Route::Revision { path, .. } => {
                let canon = Self::canonical_path(path);
                let Some(doc) = self.get_doc(&canon) else {
                    if self.failed_paths.contains(&canon) || !self.in_flight.contains(&canon) {
                        return load_error_card(
                            "Impossible de charger cette fiche",
                            "Le contenu de la fiche n’a pas pu être récupéré.",
                            true,
                        );
                    }
                    return loading_skeleton("Chargement de la fiche…");
                };
                render_revision_view(&doc, &self.rev_state, &self.store, self.is_dark(), &self.root_prefix)
            }
            Route::Quiz { .. } | Route::Concours { .. } => {
                if self.quiz_loaded_key.is_empty() && !self.in_flight.is_empty() {
                    return loading_skeleton("Préparation du quiz…");
                }
                if self.quiz_loaded_key.is_empty() && !self.failed_paths.is_empty() {
                    return load_error_card(
                        "Impossible de charger ce sujet",
                        "Le questionnaire demandé n’a pas pu être récupéré.",
                        true,
                    );
                }
                render_quiz_view(&self.quiz_state, self.is_dark(), &self.root_prefix)
            }
            Route::ExerciseList { class_id, chapter_id } => {
                let man_path = format!("data/{class_id}/{chapter_id}/manifest.json");
                let canon = Self::canonical_path(&man_path);
                let Some(man) = self.get_doc(&canon) else {
                    if self.failed_paths.contains(&canon) || !self.in_flight.contains(&canon) {
                        return load_error_card(
                            "Impossible de charger la série d’exercices",
                            "Le manifeste de ce chapitre n’a pas pu être récupéré.",
                            true,
                        );
                    }
                    return loading_skeleton("Chargement de la série d’exercices…");
                };
                let ch_title = self
                    .get_doc(&self.class_manifest_path(class_id))
                    .and_then(|cd| {
                        cd["chapters"].as_array().and_then(|arr| {
                            arr.iter()
                                .find(|c| c["id"].as_str() == Some(chapter_id.as_str()))
                                .and_then(|c| c["title"].as_str())
                                .map(|s| s.to_string())
                        })
                    })
                    .unwrap_or_else(|| chapter_id.clone());
                render_exercise_list(class_id, chapter_id, &ch_title, &man, &self.store, self.is_dark())
            }
            Route::ExerciseDetail { class_id, chapter_id, ex_path } => {
                let canon = Self::canonical_path(ex_path);
                let Some(ex_doc) = self.get_doc(&canon) else {
                    if self.failed_paths.contains(&canon) || !self.in_flight.contains(&canon) {
                        return load_error_card(
                            "Impossible de charger cet exercice",
                            "Le fichier de l’exercice n’a pas pu être récupéré.",
                            true,
                        );
                    }
                    return loading_skeleton("Chargement de l’exercice…");
                };
                let man = self
                    .get_doc(&format!("data/{class_id}/{chapter_id}/manifest.json"))
                    .unwrap_or_else(|| json!({ "exercises": [] }));
                render_exercise_detail(
                    class_id,
                    chapter_id,
                    ex_path,
                    &ex_doc,
                    &man,
                    &self.exo_state,
                    &self.store,
                    self.is_dark(),
                    &self.root_prefix,
                )
            }
            Route::ExamDetail { class_id, path, .. } => {
                let canon = Self::canonical_path(path);
                let Some(exam_doc) = self.get_doc(&canon) else {
                    if self.failed_paths.contains(&canon) || !self.in_flight.contains(&canon) {
                        return load_error_card(
                            "Impossible de charger ce sujet",
                            "Le sujet d’examen n’a pas pu être récupéré.",
                            true,
                        );
                    }
                    return loading_skeleton("Chargement du sujet…");
                };
                render_exam_detail(class_id, path, &exam_doc, &self.exo_state, &self.store, self.is_dark(), &self.root_prefix)
            }
            #[cfg(feature = "admin")]
            Route::Admin { .. } => {
                if !self.store.admin_authed {
                    return render_admin_login(&self.admin_state, self.is_dark());
                }
                let class_cache = self.build_admin_class_cache();
                let panel = match self.admin_state.tab.as_str() {
                    "users" => render_admin_users(&self.store),
                    "pilotage" => render_admin_pilotage(&self.classes, &class_cache, &self.admin_state),
                    "contenu" => render_admin_content(&self.store, &self.admin_state),
                    "stats" => render_admin_stats(&self.store),
                    "journal" => render_admin_journal(&self.store, &self.admin_state.journal_filter),
                    "studio" => {
                        let cdoc = class_cache.get(&self.studio_state.class_id);
                        render_studio(&self.classes, cdoc, &self.studio_state, &self.store)
                    }
                    _ => render_admin_dashboard(&self.classes, &class_cache, &self.store, &self.admin_state, self.now_ms),
                };
                render_admin_shell(&self.admin_state, &self.store, &panel, self.is_dark(), self.now_ms)
            }
        }
    }

    #[cfg(feature = "admin")]
    fn build_admin_class_cache(&self) -> BTreeMap<String, Value> {
        let mut map = BTreeMap::new();
        for c in &self.classes {
            if let Some(cid) = c["id"].as_str() {
                let mp = self.class_manifest_path(cid);
                if let Some(doc) = self.get_doc(&mp) {
                    map.insert(cid.to_string(), doc);
                }
            }
        }
        map
    }

    fn op_tick(&mut self) -> Value {
        let mut effs = Vec::new();
        match &self.current_route {
            Route::Quiz { .. } | Route::Concours { .. } => {
                if !self.quiz_state.finished && !self.quiz_state.submitted && !self.quiz_state.questions.is_empty() {
                    self.quiz_state.total_elapsed += 1;
                    if self.quiz_state.time_left > 0 {
                        self.quiz_state.time_left -= 1;
                    }
                    if self.quiz_state.time_left == 0 {
                        let ok = self.quiz_state.evaluate_current();
                        effs.push(json!({ "type": "sound", "name": if ok { "ok" } else { "ko" } }));
                        self.record_quiz_step_progress(&mut effs);
                        self.render_current_route(&mut effs, "none");
                    } else {
                        let tm = crate::html::fmt_time(self.quiz_state.time_left);
                        effs.push(json!({ "type": "patch", "selector": "#quiz-timer", "html": tm }));
                        effs.push(json!({ "type": "set-class", "selector": "#quiz-timer", "class": "is-urgent", "on": self.quiz_state.time_left <= 10 }));
                    }
                }
            }
            Route::ExerciseDetail { .. } | Route::ExamDetail { .. } => {
                if !self.exo_state.timer_paused {
                    self.exo_state.elapsed_sec += 1;
                    let tm = crate::html::fmt_time(self.exo_state.elapsed_sec);
                    effs.push(json!({ "type": "patch", "selector": "#tm", "html": tm }));
                }
            }
            _ => {}
        }
        json!({ "ok": true, "effects": effs })
    }

    fn op_scroll(&mut self, req: &Value) -> Value {
        let mut effs = Vec::new();
        if let Route::Revision { ref class_id, ref chapter_id, ref path } = self.current_route.clone() {
            let ratio = req["ratio"].as_f64().unwrap_or(0.0).clamp(0.0, 1.0);
            let pct = (ratio * 100.0).round() as u64;
            let mut rev_effs = self.store.set_revision_pct(class_id, chapter_id, path, pct, self.now_ms);
            let cur = self.store.revision_pct(class_id, chapter_id, Some(path));
            if !rev_effs.is_empty() {
                effs.append(&mut rev_effs);
                effs.push(json!({ "type": "patch", "selector": "#les-pct", "html": format!("{cur}%") }));
                effs.push(json!({ "type": "set-style", "selector": "#les-prog", "prop": "width", "value": format!("{cur}%") }));
            }
        }
        json!({ "ok": true, "effects": effs })
    }

    fn op_storage_sync(&mut self, req: &Value) -> Value {
        let key = req["key"].as_str().unwrap_or("");
        let val = req["value"].as_str();
        self.store.apply_storage_sync(key, val);
        let mut effs = Vec::new();
        self.push_shell_sync(&mut effs);
        self.render_current_route(&mut effs, "none");
        json!({ "ok": true, "effects": effs })
    }

    fn op_cloud_sync_apply(&mut self, req: &Value) -> Value {
        let mut effs = Vec::new();
        let (changed, mut seffs) = if self.is_admin {
            self.store.apply_cloud_admin(req)
        } else {
            self.store.apply_cloud_student(req)
        };
        effs.append(&mut seffs);
        #[cfg(feature = "admin")]
        if self.is_admin {
            self.admin_state.last_sync_at = Some(self.now_ms);
        }

        let allow_rerender = if self.is_admin {
            #[cfg(feature = "admin")]
            {
                self.store.admin_authed && self.admin_state.tab != "studio"
            }
            #[cfg(not(feature = "admin"))]
            {
                false
            }
        } else {
            // Ne jamais interrompre un quiz ou une saisie en cours
            !matches!(self.current_route, Route::Quiz { .. } | Route::Concours { .. })
        };

        if changed && allow_rerender {
            self.push_shell_sync(&mut effs);
            self.render_current_route(&mut effs, "none");
        }
        if req["manual"].as_bool().unwrap_or(false) {
            let msg = if changed {
                "Synchronisation Cloud terminée (données mises à jour)"
            } else {
                "Synchronisation Cloud à jour"
            };
            effs.push(json!({ "type": "toast", "message": msg, "tone": "ok" }));
        }
        json!({ "ok": true, "changed": changed, "effects": effs })
    }

    fn op_student_auth_state(&mut self, req: &Value) -> Value {
        if self.is_admin {
            return json!({ "ok": true, "effects": [] });
        }
        let mut effs = Vec::new();
        let user = req.get("user").cloned().filter(|v| v.is_object());
        let mut prof_effs = self.store.set_google_user(user);
        effs.append(&mut prof_effs);
        if !matches!(self.current_route, Route::Quiz { .. } | Route::Concours { .. }) {
            self.push_shell_sync(&mut effs);
            self.render_current_route(&mut effs, "none");
        }
        json!({ "ok": true, "effects": effs })
    }

    #[cfg(feature = "admin")]
    fn op_auth_status(&mut self, req: &Value) -> Value {
        let mut effs = Vec::new();
        let mode = req["mode"].as_str().unwrap_or("env").to_string();
        let authenticated = req["authenticated"].as_bool().unwrap_or(false);
        self.admin_state.auth_mode = mode;
        self.admin_state.auth_loading = false;
        self.admin_state.session_expires_at = req["expiresAt"].as_u64();
        if let Some(b) = req["backend"].as_str() {
            self.admin_state.backend_kind = b.to_string();
        }
        if let Some(p) = req["persistence"].as_str() {
            self.admin_state.persistence_kind = p.to_string();
        }
        self.store.admin_authed = authenticated;
        if authenticated {
            effs.push(json!({ "type": "cloud-sync-pull", "force": true }));
            effs.push(json!({ "type": "health-fetch" }));
        }
        self.render_current_route(&mut effs, "none");
        json!({ "ok": true, "effects": effs })
    }

    #[cfg(feature = "admin")]
    fn op_auth_result(&mut self, req: &Value) -> Value {
        let mut effs = Vec::new();
        self.admin_state.auth_loading = false;
        let ok = req["ok"].as_bool().unwrap_or(false);
        let silent = req["silent"].as_bool().unwrap_or(false);
        let manual = req["manual"].as_bool().unwrap_or(false);
        if ok {
            self.store.admin_authed = true;
            self.admin_state.login_error = None;
            self.admin_state.remaining_attempts = None;
            self.admin_state.retry_after_sec = None;
            if let Some(exp) = req["expiresAt"].as_u64() {
                self.admin_state.session_expires_at = Some(exp);
            }
            if let Some(m) = req["mode"].as_str() {
                self.admin_state.auth_mode = m.to_string();
            }
            if let Some(b) = req["backend"].as_str() {
                self.admin_state.backend_kind = b.to_string();
            }
            if let Some(p) = req["persistence"].as_str() {
                self.admin_state.persistence_kind = p.to_string();
            }
            if manual {
                effs.push(json!({ "type": "toast", "message": "Session prolongée de 4 heures", "tone": "ok" }));
            } else if !silent {
                effs.push(self.store.push_activity("admin-login", "Connexion console administration", "admin", self.now_ms));
                effs.push(json!({ "type": "cloud-sync-pull", "force": true }));
                effs.push(json!({ "type": "health-fetch" }));
            }
        } else {
            self.store.admin_authed = false;
            self.admin_state.session_expires_at = None;
            self.admin_state.server_health = None;
            self.admin_state.remaining_attempts = req["remainingAttempts"].as_u64();
            self.admin_state.retry_after_sec = req["retryAfterSec"].as_u64();
            self.admin_state.login_error = Some(
                req["error"]
                    .as_str()
                    .unwrap_or("Code d’accès incorrect.")
                    .to_string(),
            );
        }
        self.render_current_route(&mut effs, "none");
        json!({ "ok": true, "effects": effs })
    }

    #[cfg(feature = "admin")]
    fn op_health_result(&mut self, req: &Value) -> Value {
        let mut effs = Vec::new();
        if req["ok"].as_bool().unwrap_or(false) {
            let data = req["data"].clone();
            if let Some(b) = data["backend"].as_str() {
                self.admin_state.backend_kind = b.to_string();
            }
            if let Some(p) = data["persistence"].as_str() {
                self.admin_state.persistence_kind = p.to_string();
            }
            self.admin_state.server_health = Some(data);
            if self.store.admin_authed && self.admin_state.tab == "dashboard" {
                self.render_current_route(&mut effs, "none");
            }
        }
        json!({ "ok": true, "effects": effs })
    }

    #[cfg(feature = "admin")]
    fn op_media_result(&mut self, req: &Value) -> Value {
        let mut effs = Vec::new();
        self.admin_state.media_loading = false;
        if req["ok"].as_bool().unwrap_or(false) {
            self.admin_state.media_items = req["files"].as_array().cloned().unwrap_or_default();
            effs.push(json!({
                "type": "modal",
                "open": true,
                "wide": true,
                "title": "Médiathèque",
                "subtitle": "Importez une image (PNG, JPEG, WebP, GIF ≤ 750 Ko) ou copiez son bloc JSON",
                "body": render_media_modal(&self.admin_state.media_items, false, &self.root_prefix),
                "footer": ""
            }));
        } else {
            let err = req["error"].as_str().unwrap_or("Impossible de charger la médiathèque.");
            effs.push(json!({ "type": "toast", "message": err, "tone": "err" }));
        }
        json!({ "ok": true, "effects": effs })
    }

    #[cfg(feature = "admin")]
    fn op_passcode_result(&mut self, req: &Value) -> Value {
        let mut effs = Vec::new();
        if req["ok"].as_bool().unwrap_or(false) {
            if let Some(exp) = req["expiresAt"].as_u64() {
                self.admin_state.session_expires_at = Some(exp);
            }
            if let Some(m) = req["mode"].as_str() {
                self.admin_state.auth_mode = m.to_string();
            }
            effs.push(self.store.push_activity("admin-passcode", "Code d’accès administrateur modifié", "admin", self.now_ms));
            effs.push(json!({ "type": "modal", "open": false }));
            effs.push(json!({ "type": "toast", "message": "Code d’accès mis à jour", "tone": "ok" }));
            self.render_current_route(&mut effs, "none");
        } else {
            let err = req["error"].as_str().unwrap_or("Impossible de modifier le code d’accès.");
            effs.push(json!({ "type": "toast", "message": err, "tone": "err" }));
        }
        json!({ "ok": true, "effects": effs })
    }

    fn op_file_import(&mut self, req: &Value) -> Value {
        let raw = req["text"].as_str().unwrap_or("");
        let mut effs = Vec::new();
        match self.store.import_backup(raw) {
            Ok(mut seffs) => {
                effs.append(&mut seffs);
                effs.push(json!({ "type": "toast", "message": "Sauvegarde restaurée avec succès", "tone": "ok" }));
                self.push_shell_sync(&mut effs);
                self.render_current_route(&mut effs, "none");
            }
            Err(e) => {
                effs.push(json!({ "type": "toast", "message": e, "tone": "err" }));
            }
        }
        json!({ "ok": true, "effects": effs })
    }

    fn record_quiz_step_progress(&mut self, effs: &mut Vec<Value>) {
        if !self.quiz_state.is_concours {
            let mut qe = self.store.record_quiz_answered(
                &self.quiz_state.class_id,
                &self.quiz_state.chapter_id,
                self.quiz_state.history.len(),
                self.quiz_state.questions.len(),
                self.now_ms,
            );
            effs.append(&mut qe);
        }
    }

    fn toggle_theme(&mut self, effs: &mut Vec<Value>) {
        let next = if self.is_dark() { "light" } else { "dark" };
        effs.push(self.store.set_profile_field("theme", json!(next)));
        self.push_shell_sync(effs);
    }

    fn op_event(&mut self, req: &Value) -> Value {
        let action = req["action"].as_str().unwrap_or("");
        let data = &req["data"];
        let value = req["value"].as_str().unwrap_or("");
        let checked = req["checked"].as_bool().unwrap_or(false);
        let mut effs = Vec::new();

        match action {
            // === Global shell & sidebar ===
            "retry-load" => {
                self.failed_paths.clear();
                if self.classes.is_empty() {
                    self.queue_fetch(&mut effs, "data/manifest.json", false);
                }
                let cur = self.current_hash.clone();
                self.navigate_to(&cur, &mut effs, false);
            }
            "sb-toggle" => {
                if self.current_route.has_sidebar() {
                    let next = !self.is_sb_collapsed();
                    self.store.sb_collapsed = Some(next);
                    effs.push(storage_str_effect(KEY_SB_COLLAPSED, Some(if next { "1" } else { "0" }), false));
                    self.push_shell_sync(&mut effs);
                }
            }
            "sb-theme" | "toggle-theme" => {
                self.toggle_theme(&mut effs);
                if matches!(self.current_route, Route::Revision { .. }) {
                    self.push_rev_theme_sync(&mut effs);
                }
            }
            "sb-orient" => {
                let route_cid = match &self.current_route {
                    Route::Dashboard { class_id, .. }
                    | Route::Cadre { class_id }
                    | Route::Revision { class_id, .. }
                    | Route::Quiz { class_id, .. }
                    | Route::Concours { class_id, .. }
                    | Route::ExerciseList { class_id, .. }
                    | Route::ExerciseDetail { class_id, .. }
                    | Route::ExamDetail { class_id, .. } => Some(class_id.as_str()),
                    _ => None,
                };
                if let Some(cid) = route_cid.or_else(|| self.store.class_id()) {
                    if self.orient_state.class_id != cid {
                        self.orient_state.class_id = cid.to_string();
                        self.orient_state.detail_modes.clear();
                    }
                }
                self.orient_state.open = true;
                self.queue_orientation_docs(&mut effs);
                self.push_orientation_modal(&mut effs);
            }
            "sb-help" => {
                effs.push(json!({
                    "type": "modal",
                    "open": true,
                    "title": "Aide et raccourcis",
                    "subtitle": "Guide de prise en main Mathix",
                    "body": render_help_modal_body(),
                    "footer": ""
                }));
            }
            "open-settings" => {
                self.reset_armed = false;
                effs.push(json!({
                    "type": "open-settings",
                    "profile": self.store.profile,
                    "muted": self.store.muted,
                    "googleUser": self.store.google_user
                }));
            }
            "student-google-login" => {
                if !self.is_admin {
                    effs.push(json!({ "type": "firebase-google-login" }));
                }
            }
            "student-google-logout" => {
                if !self.is_admin {
                    effs.push(json!({ "type": "firebase-google-logout" }));
                }
            }
            "set-palette" => {
                let pal = data["pal"].as_str().unwrap_or("quizlet");
                let _ = self.store.set_profile_field("paletteVer", json!(2));
                effs.push(self.store.set_profile_field("palette", json!(pal)));
                self.push_shell_sync(&mut effs);
                effs.push(json!({ "type": "sound", "name": "tap" }));
            }
            "toggle-sound" => {
                self.store.muted = !self.store.muted;
                effs.push(storage_str_effect(KEY_MUTED, Some(if self.store.muted { "1" } else { "0" }), false));
                let on = !self.store.muted;
                effs.push(json!({ "type": "set-attr", "selector": "#sw-sound", "attr": "aria-checked", "value": if on { "true" } else { "false" } }));
                effs.push(json!({ "type": "set-class", "selector": "#sw-sound", "class": "is-on", "on": on }));
                if on {
                    effs.push(json!({ "type": "sound", "name": "tap" }));
                }
            }
            "toggle-free" => {
                let next = !self.store.free_mode();
                effs.push(self.store.set_profile_field("freeMode", json!(next)));
                effs.push(json!({ "type": "set-attr", "selector": "#sw-free", "attr": "aria-checked", "value": if next { "true" } else { "false" } }));
                effs.push(json!({ "type": "set-class", "selector": "#sw-free", "class": "is-on", "on": next }));
                if matches!(self.current_route, Route::Dashboard { .. }) {
                    self.render_current_route(&mut effs, "none");
                }
            }
            "settings-save" => {
                let fn_v = data["fn"].as_str().unwrap_or("").trim();
                let ln_v = data["ln"].as_str().unwrap_or("").trim();
                let sc_v = data["sc"].as_str().unwrap_or("").trim();
                let th_v = data["th"].as_str().unwrap_or("auto");
                effs.push(self.store.set_profile_field("firstName", json!(fn_v)));
                effs.push(self.store.set_profile_field("lastName", json!(ln_v)));
                effs.push(self.store.set_profile_field("school", json!(sc_v)));
                effs.push(self.store.set_profile_field("theme", json!(th_v)));
                self.push_shell_sync(&mut effs);
                self.render_current_route(&mut effs, "none");
                effs.push(json!({ "type": "toast", "message": "Paramètres enregistrés", "tone": "ok" }));
            }
            "export-backup" => {
                let content = self.store.export_backup(self.now_ms);
                effs.push(json!({
                    "type": "download",
                    "filename": "mathix-sauvegarde.json",
                    "content": content
                }));
                effs.push(json!({ "type": "toast", "message": "Sauvegarde téléchargée", "tone": "ok" }));
            }
            "reset-progress" => {
                if !self.reset_armed {
                    self.reset_armed = true;
                    effs.push(json!({ "type": "toast", "message": "Cliquez à nouveau sur Réinitialiser pour confirmer", "tone": "warn" }));
                } else {
                    self.reset_armed = false;
                    let mut re = self.store.reset_all();
                    effs.append(&mut re);
                    if !self.is_admin {
                        effs.push(json!({ "type": "cloud-reset" }));
                    }
                    effs.push(json!({ "type": "dialog", "selector": "#set", "open": false }));
                    effs.push(json!({ "type": "toast", "message": "Progression réinitialisée", "tone": "ok" }));
                    self.render_current_route(&mut effs, "none");
                }
            }
            "cloud-sync" => {
                effs.push(json!({ "type": "cloud-sync-now" }));
            }

            // === Modals & Lightbox ===
            "modal-close" => {
                self.orient_state.open = false;
                effs.push(json!({ "type": "modal", "open": false }));
            }
            "orient-tab" => {
                let tab = data["otab"].as_str().unwrap_or("programme").to_string();
                self.orient_state.active_tab = tab.clone();
                for t in ["programme", "conseils", "filieres"] {
                    effs.push(json!({
                        "type": "set-attr",
                        "selector": format!(r#"[data-action="orient-tab"][data-otab="{t}"]"#),
                        "attr": "aria-selected",
                        "value": if t == tab { "true" } else { "false" }
                    }));
                }
                let idx_doc = self.get_doc(ORIENTATION_INDEX_PATH);
                let opath = orientation_class_path(idx_doc.as_ref(), &self.orient_state.class_id);
                let cls_doc = self.get_doc(&opath);
                let html = render_orientation_tab_content(
                    &self.orient_state,
                    idx_doc.as_ref(),
                    cls_doc.as_ref(),
                );
                effs.push(json!({ "type": "patch", "selector": "#orient-list", "html": html, "animate": true }));
                effs.push(json!({ "type": "sound", "name": "tap" }));
            }
            "orient-mode" => {
                if let Some(ch) = data["ch"].as_str().and_then(|s| s.parse::<u32>().ok()) {
                    let mode = data["mode"].as_str().unwrap_or("contents").to_string();
                    self.orient_state.detail_modes.insert(ch, mode.clone());
                    for m in ["contents", "capacities", "recommendations"] {
                        effs.push(json!({
                            "type": "set-attr",
                            "selector": format!(r#"[data-action="orient-mode"][data-ch="{ch}"][data-mode="{m}"]"#),
                            "attr": "aria-pressed",
                            "value": if m == mode { "true" } else { "false" }
                        }));
                    }
                    let idx_doc = self.get_doc(ORIENTATION_INDEX_PATH);
                    let opath = orientation_class_path(idx_doc.as_ref(), &self.orient_state.class_id);
                    let cls_doc = self.get_doc(&opath);
                    let html = render_orientation_chapter_items(cls_doc.as_ref(), ch, &mode);
                    effs.push(json!({
                        "type": "patch",
                        "selector": format!("#orient-ch-list-{ch}"),
                        "html": html,
                        "animate": true
                    }));
                    effs.push(json!({ "type": "sound", "name": "tap" }));
                }
            }
            "media-zoom" => {
                let src = data["src"].as_str().unwrap_or("");
                let alt = data["alt"].as_str().unwrap_or("");
                let cap = data["cap"].as_str().unwrap_or("");
                effs.push(json!({
                    "type": "lightbox",
                    "open": true,
                    "html": render_lightbox_html(src, alt, cap)
                }));
            }
            "lightbox-close" => {
                effs.push(json!({ "type": "lightbox", "open": false }));
            }

            // === Role Picker ===
            "role-filter" => {
                let filter = data["filter"].as_str().unwrap_or("all").to_string();
                self.role_filter = filter.clone();
                for f in ["all", "lycee", "college"] {
                    effs.push(json!({
                        "type": "set-attr",
                        "selector": format!(r#"[data-action="role-filter"][data-filter="{f}"]"#),
                        "attr": "aria-pressed",
                        "value": if f == filter { "true" } else { "false" }
                    }));
                }
                let html = render_role_results(&self.classes, &self.role_filter, &self.store);
                effs.push(json!({ "type": "patch", "selector": "#role-results", "html": html, "animate": true }));
                effs.push(json!({ "type": "sync-pill" }));
            }
            "pick-class" => {
                if let Some(cid) = data["class"].as_str() {
                    effs.push(self.store.set_profile_field("classId", json!(cid)));
                }
            }

            // === Dashboard & Cadre ===
            "dash-tab" => {
                let tab = data["tab"].as_str().unwrap_or("cours").to_string();
                let tab_rank = |t: &str| -> i32 {
                    match t {
                        "cours" => 0,
                        "examens" => 1,
                        "problemes" => 2,
                        "olympiades" => 3,
                        "concours" => 4,
                        _ => 0,
                    }
                };
                let prev_tab = if self.dash_state.active_tab.is_empty() {
                    "cours"
                } else {
                    self.dash_state.active_tab.as_str()
                };
                let prev_rank = tab_rank(prev_tab);
                let next_rank = tab_rank(&tab);
                let dir = if next_rank > prev_rank {
                    "right"
                } else if next_rank < prev_rank {
                    "left"
                } else {
                    ""
                };
                self.dash_state.active_tab = tab.clone();
                if let Route::Dashboard { ref class_id, .. } = self.current_route.clone() {
                    if tab == "examens" && Self::has_examens(class_id) {
                        self.queue_exam_docs(&mut effs, class_id);
                    }
                    let next_hash = if tab == "cours" {
                        format!("#/eleve/{class_id}")
                    } else {
                        format!("#/eleve/{class_id}?tab={tab}")
                    };
                    self.current_route = Route::Dashboard { class_id: class_id.clone(), tab: tab.clone() };
                    self.current_hash = next_hash.clone();
                    effs.push(json!({ "type": "set-hash", "hash": next_hash, "silent": true }));

                    let mp = self.class_manifest_path(class_id);
                    let canon = Self::canonical_path(&mp);
                    if let Some(class_doc) = self.get_doc(&canon) {
                        let problems = if Self::has_problemes(class_id) {
                            self.get_doc(&format!("data/{class_id}/problemes/index.json"))
                        } else {
                            None
                        };
                        let exams = if Self::has_examens(class_id) {
                            self.get_doc(&format!("data/{class_id}/examen/index.json"))
                        } else {
                            None
                        };
                        let olympiads = if Self::has_olympiads(class_id) {
                            self.get_doc(&format!("data/{class_id}/olympiad/manifest.json"))
                        } else {
                            None
                        };
                        let concours = if Self::has_concours(class_id) {
                            self.get_doc("data/manifest.json")
                        } else {
                            None
                        };
                        let concours_schools = if Self::has_concours(class_id) {
                            self.get_doc("data/concours/schools.json")
                        } else {
                            None
                        };
                        let mut concours_manifests: Vec<(&str, Value)> = Vec::new();
                        if Self::has_concours(class_id) {
                            for sid in ["ensa", "ensam", "medecine"] {
                                if let Some(m) = self.get_doc(&format!("data/concours/{sid}/manifest.json")) {
                                    concours_manifests.push((sid, m));
                                }
                            }
                        }
                        let cadre = if Self::has_cadre(class_id) {
                            self.get_doc(&format!("data/{class_id}/examen/cadre_referentiel.json"))
                        } else {
                            None
                        };
                        let ddata = DashboardData {
                            class_id,
                            class_doc: &class_doc,
                            problems: problems.as_ref(),
                            exams: exams.as_ref(),
                            exam_docs: &self.data_cache,
                            olympiads: olympiads.as_ref(),
                            concours: concours.as_ref(),
                            concours_schools: concours_schools.as_ref(),
                            concours_manifests,
                            cadre: cadre.as_ref(),
                        };
                        let (active_tab, panel_html) = render_dashboard_panel(&ddata, &self.dash_state, &self.store);
                        for t in ["cours", "examens", "problemes", "olympiades", "concours"] {
                            effs.push(json!({
                                "type": "set-attr",
                                "selector": format!(r#"#nav-tabs [data-action="dash-tab"][data-tab="{t}"]"#),
                                "attr": "aria-selected",
                                "value": if t == active_tab { "true" } else { "false" }
                            }));
                        }
                        effs.push(json!({
                            "type": "set-attr",
                            "selector": "#dash-panel",
                            "attr": "data-tab",
                            "value": active_tab
                        }));
                        effs.push(json!({
                            "type": "patch",
                            "selector": "#dash-panel",
                            "html": panel_html,
                            "animate": true,
                            "dir": dir
                        }));
                        effs.push(json!({ "type": "sync-pill" }));
                    } else {
                        self.render_current_route(&mut effs, "none");
                    }
                    effs.push(json!({ "type": "sound", "name": "tap" }));
                }
            }
            "dash-toggle-chapter" => {
                let ch = data["ch"].as_str().unwrap_or("").to_string();
                let prev_open = match self.dash_state.open_chapter_id.as_deref() {
                    Some(cur) => cur.to_string(),
                    None => {
                        if let Route::Dashboard { ref class_id, .. } = self.current_route {
                            self.get_doc(&self.class_manifest_path(class_id))
                                .and_then(|d| d["chapters"].as_array().and_then(|a| a.first()).and_then(|c| c["id"].as_str()).map(|s| s.to_string()))
                                .unwrap_or_default()
                        } else {
                            String::new()
                        }
                    }
                };
                let next_open = if prev_open == ch { String::new() } else { ch };
                self.dash_state.open_chapter_id = Some(next_open.clone());
                if !prev_open.is_empty() && prev_open != next_open {
                    effs.push(json!({
                        "type": "set-class",
                        "selector": format!(r#".ch[data-ch-id="{prev_open}"]"#),
                        "class": "open",
                        "on": false
                    }));
                    effs.push(json!({
                        "type": "set-attr",
                        "selector": format!(r#"[data-action="dash-toggle-chapter"][data-ch="{prev_open}"]"#),
                        "attr": "aria-expanded",
                        "value": "false"
                    }));
                }
                if !next_open.is_empty() {
                    effs.push(json!({
                        "type": "set-class",
                        "selector": format!(r#".ch[data-ch-id="{next_open}"]"#),
                        "class": "open",
                        "on": true
                    }));
                    effs.push(json!({
                        "type": "set-attr",
                        "selector": format!(r#"[data-action="dash-toggle-chapter"][data-ch="{next_open}"]"#),
                        "attr": "aria-expanded",
                        "value": "true"
                    }));
                }
            }
            "prob-theme" => {
                let theme = data["theme"].as_str().unwrap_or("").to_string();
                if !theme.is_empty() && self.dash_state.prob_theme == theme {
                    self.dash_state.prob_theme.clear();
                } else {
                    self.dash_state.prob_theme = theme;
                }
                if let Route::Dashboard { ref class_id, .. } = self.current_route.clone() {
                    let probs = self.get_doc(&format!("data/{class_id}/problemes/index.json"));
                    let html = render_problems_view(class_id, probs.as_ref(), &self.dash_state, &self.store);
                    effs.push(json!({ "type": "patch", "selector": "#prob-view", "html": html }));
                    effs.push(json!({ "type": "sync-pill" }));
                }
            }
            "prob-diff" => {
                let diff = data["diff"].as_str().unwrap_or("").to_string();
                if !diff.is_empty() && self.dash_state.prob_diff == diff {
                    self.dash_state.prob_diff.clear();
                } else {
                    self.dash_state.prob_diff = diff;
                }
                if let Route::Dashboard { ref class_id, .. } = self.current_route.clone() {
                    let probs = self.get_doc(&format!("data/{class_id}/problemes/index.json"));
                    let html = render_problems_view(class_id, probs.as_ref(), &self.dash_state, &self.store);
                    effs.push(json!({ "type": "patch", "selector": "#prob-view", "html": html }));
                    effs.push(json!({ "type": "sync-pill" }));
                }
            }
            "prob-status" => {
                let status = data["status"].as_str().unwrap_or("").to_string();
                if self.dash_state.prob_status == status {
                    self.dash_state.prob_status.clear();
                } else {
                    self.dash_state.prob_status = status;
                }
                if let Route::Dashboard { ref class_id, .. } = self.current_route.clone() {
                    let probs = self.get_doc(&format!("data/{class_id}/problemes/index.json"));
                    let html = render_problems_view(class_id, probs.as_ref(), &self.dash_state, &self.store);
                    effs.push(json!({ "type": "patch", "selector": "#prob-view", "html": html }));
                    effs.push(json!({ "type": "sync-pill" }));
                }
            }
            "prob-reset" => {
                self.dash_state.prob_theme.clear();
                self.dash_state.prob_diff.clear();
                self.dash_state.prob_status.clear();
                if let Route::Dashboard { ref class_id, .. } = self.current_route.clone() {
                    let probs = self.get_doc(&format!("data/{class_id}/problemes/index.json"));
                    let html = render_problems_view(class_id, probs.as_ref(), &self.dash_state, &self.store);
                    effs.push(json!({ "type": "patch", "selector": "#prob-view", "html": html }));
                    effs.push(json!({ "type": "sync-pill" }));
                }
            }
            "exam-filter" => {
                let filter = data["filter"].as_str().unwrap_or("").to_string();
                self.dash_state.exam_filter = filter.clone();
                if filter != "year" {
                    self.dash_state.exam_year.clear();
                }
                if filter != "themes" {
                    self.dash_state.exam_theme.clear();
                }
                if let Route::Dashboard { ref class_id, .. } = self.current_route.clone() {
                    for f in ["", "year", "themes", "simulations"] {
                        effs.push(json!({
                            "type": "set-attr",
                            "selector": format!(r#"[data-action="exam-filter"][data-filter="{f}"]"#),
                            "attr": "aria-pressed",
                            "value": if f == filter { "true" } else { "false" }
                        }));
                    }
                    let exams = self.get_doc(&format!("data/{class_id}/examen/index.json"));
                    let sub_html = render_exams_subbar(exams.as_ref(), &self.data_cache, &self.dash_state);
                    let res_html = render_exams_results(class_id, exams.as_ref(), &self.data_cache, &self.dash_state);
                    effs.push(json!({ "type": "patch", "selector": "#exam-subbar", "html": sub_html }));
                    effs.push(json!({ "type": "patch", "selector": "#exam-results", "html": res_html }));
                    effs.push(json!({ "type": "sync-pill" }));
                }
            }
            "exam-year" => {
                let yr = data["year"].as_str().unwrap_or("").to_string();
                let next_yr = if !yr.is_empty() && self.dash_state.exam_year == yr {
                    String::new()
                } else {
                    yr
                };
                self.dash_state.exam_year = next_yr.clone();
                if let Route::Dashboard { ref class_id, .. } = self.current_route.clone() {
                    let exams = self.get_doc(&format!("data/{class_id}/examen/index.json"));
                    let mut years = vec![String::new()];
                    if let Some(arr) = exams
                        .as_ref()
                        .and_then(|d| d.get("examens").or_else(|| d.get("exams")))
                        .and_then(Value::as_array)
                    {
                        for ex in arr {
                            if let Some(y) = ex.get("year").and_then(Value::as_u64) {
                                let ys = y.to_string();
                                if !years.contains(&ys) {
                                    years.push(ys);
                                }
                            }
                        }
                    }
                    for y in years {
                        effs.push(json!({
                            "type": "set-attr",
                            "selector": format!(r#"[data-action="exam-year"][data-year="{y}"]"#),
                            "attr": "aria-pressed",
                            "value": if y == next_yr { "true" } else { "false" }
                        }));
                    }
                    let html = render_exams_results(class_id, exams.as_ref(), &self.data_cache, &self.dash_state);
                    effs.push(json!({ "type": "patch", "selector": "#exam-results", "html": html }));
                    effs.push(json!({ "type": "sync-pill" }));
                }
            }
            "exam-session" => {
                let sess = data["session"].as_str().unwrap_or("").to_string();
                self.dash_state.exam_session = sess;
                if let Route::Dashboard { ref class_id, .. } = self.current_route.clone() {
                    let exams = self.get_doc(&format!("data/{class_id}/examen/index.json"));
                    let sub_html = render_exams_subbar(exams.as_ref(), &self.data_cache, &self.dash_state);
                    let res_html = render_exams_results(class_id, exams.as_ref(), &self.data_cache, &self.dash_state);
                    effs.push(json!({ "type": "patch", "selector": "#exam-subbar", "html": sub_html }));
                    effs.push(json!({ "type": "patch", "selector": "#exam-results", "html": res_html }));
                    effs.push(json!({ "type": "sync-pill" }));
                }
            }
            "exam-theme" => {
                let theme = data["theme"].as_str().unwrap_or("").to_string();
                let next_theme = if !theme.is_empty() && self.dash_state.exam_theme == theme {
                    String::new()
                } else {
                    theme
                };
                self.dash_state.exam_theme = next_theme.clone();
                if let Route::Dashboard { ref class_id, .. } = self.current_route.clone() {
                    let exams = self.get_doc(&format!("data/{class_id}/examen/index.json"));
                    let mut tids = vec![String::new()];
                    for (tid, _) in exam_themes_list(exams.as_ref(), &self.data_cache) {
                        tids.push(tid);
                    }
                    for tid in tids {
                        effs.push(json!({
                            "type": "set-attr",
                            "selector": format!(r#"[data-action="exam-theme"][data-theme="{tid}"]"#),
                            "attr": "aria-pressed",
                            "value": if tid == next_theme { "true" } else { "false" }
                        }));
                    }
                    let html = render_exams_results(class_id, exams.as_ref(), &self.data_cache, &self.dash_state);
                    effs.push(json!({ "type": "patch", "selector": "#exam-results", "html": html }));
                    effs.push(json!({ "type": "sync-pill" }));
                }
            }
            "oly-scope" => {
                let scope = data["scope"].as_str().unwrap_or("").to_string();
                if !scope.is_empty() && self.dash_state.oly_scope == scope {
                    self.dash_state.oly_scope.clear();
                } else {
                    self.dash_state.oly_scope = scope;
                }
                if let Route::Dashboard { ref class_id, .. } = self.current_route.clone() {
                    let oly = self.get_doc(&format!("data/{class_id}/olympiad/manifest.json"));
                    // Clear selected year if it no longer has a matching item in the new scope
                    if !self.dash_state.oly_year.is_empty() && !self.dash_state.oly_scope.is_empty() {
                        let has_match = oly
                            .as_ref()
                            .and_then(|d| d.get("items").or_else(|| d.get("olympiads")))
                            .and_then(Value::as_array)
                            .map(|arr| {
                                arr.iter().any(|it| {
                                    let yr = it.get("year")
                                        .and_then(|v| v.as_u64().map(|y| y.to_string()).or_else(|| v.as_str().map(|s| s.to_string())))
                                        .unwrap_or_default();
                                    let sc = it.get("badge")
                                        .or_else(|| it.get("stage"))
                                        .or_else(|| it.get("phase"))
                                        .and_then(Value::as_str)
                                        .unwrap_or("")
                                        .trim()
                                        .to_lowercase();
                                    yr == self.dash_state.oly_year && sc == self.dash_state.oly_scope
                                })
                            })
                            .unwrap_or(false);
                        if !has_match {
                            self.dash_state.oly_year.clear();
                        }
                    }
                    let html = render_olympiads_view(class_id, oly.as_ref(), &self.dash_state);
                    effs.push(json!({ "type": "patch", "selector": "#oly-view", "html": html }));
                    effs.push(json!({ "type": "sync-pill" }));
                }
            }
            "oly-year" => {
                let yr = data["year"].as_str().unwrap_or("").to_string();
                if !yr.is_empty() && self.dash_state.oly_year == yr {
                    self.dash_state.oly_year.clear();
                } else {
                    self.dash_state.oly_year = yr;
                }
                if let Route::Dashboard { ref class_id, .. } = self.current_route.clone() {
                    let oly = self.get_doc(&format!("data/{class_id}/olympiad/manifest.json"));
                    let html = render_olympiads_view(class_id, oly.as_ref(), &self.dash_state);
                    effs.push(json!({ "type": "patch", "selector": "#oly-view", "html": html }));
                    effs.push(json!({ "type": "sync-pill" }));
                }
            }
            "oly-sort" => {
                self.dash_state.oly_asc = !self.dash_state.oly_asc;
                if let Route::Dashboard { ref class_id, .. } = self.current_route.clone() {
                    let oly = self.get_doc(&format!("data/{class_id}/olympiad/manifest.json"));
                    let html = render_olympiads_view(class_id, oly.as_ref(), &self.dash_state);
                    effs.push(json!({ "type": "patch", "selector": "#oly-view", "html": html }));
                    effs.push(json!({ "type": "sync-pill" }));
                }
            }
            "oly-reset" => {
                self.dash_state.oly_scope.clear();
                self.dash_state.oly_year.clear();
                if let Route::Dashboard { ref class_id, .. } = self.current_route.clone() {
                    let oly = self.get_doc(&format!("data/{class_id}/olympiad/manifest.json"));
                    let html = render_olympiads_view(class_id, oly.as_ref(), &self.dash_state);
                    effs.push(json!({ "type": "patch", "selector": "#oly-view", "html": html }));
                    effs.push(json!({ "type": "sync-pill" }));
                }
            }
            "conc-school" => {
                let school = if !value.trim().is_empty() {
                    value.trim().to_string()
                } else {
                    data["school"].as_str().unwrap_or("ensa").to_string()
                };
                self.dash_state.conc_school = school;
                self.dash_state.conc_theme.clear();
                if let Route::Dashboard { ref class_id, .. } = self.current_route.clone() {
                    let mp = self.class_manifest_path(class_id);
                    if let Some(class_doc) = self.get_doc(&mp) {
                        let concours = self.get_doc("data/manifest.json");
                        let concours_schools = self.get_doc("data/concours/schools.json");
                        let mut concours_manifests: Vec<(&str, Value)> = Vec::new();
                        for sid in ["ensa", "ensam", "medecine"] {
                            if let Some(m) = self.get_doc(&format!("data/concours/{sid}/manifest.json")) {
                                concours_manifests.push((sid, m));
                            }
                        }
                        let dd = DashboardData {
                            class_id,
                            class_doc: &class_doc,
                            problems: None,
                            exams: None,
                            exam_docs: &self.data_cache,
                            olympiads: None,
                            concours: concours.as_ref(),
                            concours_schools: concours_schools.as_ref(),
                            concours_manifests,
                            cadre: None,
                        };
                        let active_sid = active_concours_school_id(&dd, &self.dash_state);
                        for sid in ["ensa", "ensam", "medecine"] {
                            effs.push(json!({
                                "type": "set-attr",
                                "selector": format!(r#".cc-school-tab[data-school="{sid}"]"#),
                                "attr": "aria-selected",
                                "value": if sid == active_sid { "true" } else { "false" }
                            }));
                        }
                        let body_html = render_concours_body(&dd, &self.dash_state, &self.store);
                        effs.push(json!({ "type": "set-attr", "selector": "#conc-body", "attr": "data-school", "value": active_sid }));
                        effs.push(json!({ "type": "patch", "selector": "#conc-body", "html": body_html }));
                        effs.push(json!({ "type": "sync-pill" }));
                        effs.push(json!({ "type": "sound", "name": "tap" }));
                    }
                }
            }
            "conc-kind" => {
                let kind = data["kind"].as_str().unwrap_or("").to_string();
                self.dash_state.conc_kind = kind.clone();
                if kind == "annales" {
                    self.dash_state.conc_theme.clear();
                }
                if let Route::Dashboard { ref class_id, .. } = self.current_route.clone() {
                    let mp = self.class_manifest_path(class_id);
                    if let Some(class_doc) = self.get_doc(&mp) {
                        for k in ["", "annales", "themes", "simulation"] {
                            effs.push(json!({
                                "type": "set-attr",
                                "selector": format!(r#"[data-action="conc-kind"][data-kind="{k}"]"#),
                                "attr": "aria-pressed",
                                "value": if k == kind { "true" } else { "false" }
                            }));
                        }
                        let concours = self.get_doc("data/manifest.json");
                        let concours_schools = self.get_doc("data/concours/schools.json");
                        let mut concours_manifests: Vec<(&str, Value)> = Vec::new();
                        for sid in ["ensa", "ensam", "medecine"] {
                            if let Some(m) = self.get_doc(&format!("data/concours/{sid}/manifest.json")) {
                                concours_manifests.push((sid, m));
                            }
                        }
                        let dd = DashboardData {
                            class_id,
                            class_doc: &class_doc,
                            problems: None,
                            exams: None,
                            exam_docs: &self.data_cache,
                            olympiads: None,
                            concours: concours.as_ref(),
                            concours_schools: concours_schools.as_ref(),
                            concours_manifests,
                            cadre: None,
                        };
                        let res_html = render_concours_results(&dd, &self.dash_state);
                        effs.push(json!({ "type": "patch", "selector": "#conc-results", "html": res_html }));
                        effs.push(json!({ "type": "sync-pill" }));
                    }
                }
            }
            "cadre-domain" => {
                let dom = data["domain"].as_str().unwrap_or("").to_string();
                if !dom.is_empty() && self.dash_state.cadre_domain == dom {
                    self.dash_state.cadre_domain.clear();
                } else {
                    self.dash_state.cadre_domain = dom;
                }
                self.render_current_route(&mut effs, "none");
            }
            "cadre-status" => {
                let st = data["status"].as_str().unwrap_or("").to_string();
                if !st.is_empty() && self.dash_state.cadre_status == st {
                    self.dash_state.cadre_status.clear();
                } else {
                    self.dash_state.cadre_status = st;
                }
                self.render_current_route(&mut effs, "none");
            }
            "cadre-reset" => {
                self.dash_state.cadre_domain.clear();
                self.dash_state.cadre_status.clear();
                self.render_current_route(&mut effs, "none");
            }
            "cadre-toggle" => {
                if let Route::Cadre { ref class_id } = self.current_route.clone() {
                    let sid = data["skill"].as_str().unwrap_or("");
                    let (_on, se) = self.store.toggle_skill_mastered(class_id, sid);
                    effs.push(se);
                    self.render_current_route(&mut effs, "none");
                }
            }

            // === Revision / Problems ===
            "rev-jump" => {
                self.rev_state.toc_open = false;
                effs.push(json!({ "type": "popover-hide", "selector": "#toc" }));
                if let Some(t) = data["target"].as_str() {
                    effs.push(json!({ "type": "scroll-to", "selector": t }));
                }
            }
            "rev-theme" => {
                let th = data["lesTheme"].as_str().unwrap_or("auto");
                effs.push(self.store.set_profile_field("theme", json!(th)));
                self.push_shell_sync(&mut effs);
                self.push_rev_theme_sync(&mut effs);
            }
            "rev-zoom" => {
                let delta = data["delta"].as_str().and_then(|s| s.parse::<i32>().ok()).unwrap_or(0);
                self.rev_state.zoom = (self.rev_state.zoom + delta).clamp(80, 140);
                let z = format!("{}%", self.rev_state.zoom);
                effs.push(json!({ "type": "set-style", "selector": "#les", "prop": "fontSize", "value": z }));
                effs.push(json!({ "type": "patch", "selector": "#les-zoom-val", "html": z }));
                effs.push(json!({ "type": "fit-math", "selector": "#les" }));
            }
            "rev-seyes" => {
                self.rev_state.seyes = !self.rev_state.seyes;
                let is_problem = self.rev_state.chapter_id == "problemes";
                let paper = if self.rev_state.seyes && !is_problem { "seyes" } else { "plain" };
                effs.push(json!({ "type": "set-attr", "selector": "#les", "attr": "data-paper", "value": paper }));
                effs.push(json!({ "type": "set-attr", "selector": r#"[data-action="rev-seyes"]"#, "attr": "aria-checked", "value": if self.rev_state.seyes { "true" } else { "false" } }));
            }
            "rev-toggle-all" => {
                self.rev_state.all_open = !self.rev_state.all_open;
                effs.push(json!({ "type": "toggle-all-details", "open": self.rev_state.all_open }));
                let lbl = if self.rev_state.all_open { "Tout replier" } else { "Tout déplier" };
                effs.push(json!({ "type": "patch", "selector": r#"[data-action="rev-toggle-all"] span"#, "html": lbl }));
            }
            "rev-toggle-blanks" => {
                self.rev_state.all_blanks = !self.rev_state.all_blanks;
                effs.push(json!({ "type": "set-class", "selector": "#les", "class": "reveal-all-blanks", "on": self.rev_state.all_blanks }));
                effs.push(json!({ "type": "toggle-all-blanks", "revealed": self.rev_state.all_blanks }));
                let lbl = if self.rev_state.all_blanks { "Masquer les blancs" } else { "Révéler les blancs" };
                effs.push(json!({ "type": "patch", "selector": r#"[data-action="rev-toggle-blanks"] span"#, "html": lbl }));
            }
            "rev-print" | "exo-print" => {
                effs.push(json!({ "type": "print" }));
            }
            "rev-mark-done" => {
                let cid = self.rev_state.class_id.clone();
                let chid = self.rev_state.chapter_id.clone();
                let p = self.rev_state.path.clone();
                let mut re = self.store.set_revision_pct(&cid, &chid, &p, 100, self.now_ms);
                effs.append(&mut re);
                effs.push(json!({ "type": "set-style", "selector": "#les-prog", "prop": "width", "value": "100%" }));
                effs.push(json!({ "type": "patch", "selector": "#les-pct", "html": "100%" }));
                effs.push(json!({ "type": "sound", "name": "ok" }));
                effs.push(json!({ "type": "toast", "message": "Fiche marquée comme lue à 100 % !", "tone": "ok" }));
            }
            "rev-focus" | "focus-nav-block" => {
                let blk_idx = data["blkIdx"].as_str().and_then(|s| s.parse::<usize>().ok()).unwrap_or(0);
                if let Some(doc) = self.get_doc(&self.rev_state.path) {
                    if open_focus_for_block(&doc, blk_idx, &mut self.rev_state, &self.root_prefix) {
                        if action == "focus-nav-block" {
                            effs.push(json!({ "type": "sound", "name": "tap" }));
                        }
                        self.push_focus_dialog_effects(&mut effs);
                    }
                }
            }
            "focus-prev" => {
                if self.rev_state.focus_step_mode && self.rev_state.focus_idx > 0 {
                    self.rev_state.focus_idx -= 1;
                    self.push_focus_dialog_effects(&mut effs);
                }
            }
            "focus-next" => {
                if self.rev_state.focus_step_mode
                    && self.rev_state.focus_idx + 1 < self.rev_state.focus_steps.len()
                {
                    self.rev_state.focus_idx += 1;
                    self.push_focus_dialog_effects(&mut effs);
                }
            }
            "focus-goto" => {
                if let Some(idx) = data["idx"].as_str().and_then(|s| s.parse::<usize>().ok()) {
                    if idx < self.rev_state.focus_steps.len() {
                        self.rev_state.focus_idx = idx;
                        self.rev_state.focus_step_mode = true;
                        self.push_focus_dialog_effects(&mut effs);
                    }
                }
            }
            "focus-toggle-mode" => {
                if self.rev_state.focus_steps.len() > 1 {
                    self.rev_state.focus_step_mode = !self.rev_state.focus_step_mode;
                    if self.rev_state.focus_step_mode && self.rev_state.focus_idx >= self.rev_state.focus_steps.len() {
                        self.rev_state.focus_idx = 0;
                    }
                    self.push_focus_dialog_effects(&mut effs);
                }
            }
            "focus-close" => {
                self.rev_state.focus_open = false;
                effs.push(json!({ "type": "dialog", "selector": "#focus-dlg", "open": false }));
            }
            "focus-closed" => {
                self.rev_state.focus_open = false;
            }
            "toggle-blank" => {
                let bid = data["bid"].as_str().unwrap_or("");
                let revealed = data["revealed"].as_str() == Some("true");
                if !bid.is_empty() && !self.rev_state.class_id.is_empty() {
                    let cid = self.rev_state.class_id.clone();
                    let chid = self.rev_state.chapter_id.clone();
                    effs.push(self.store.set_blank_revealed(&cid, &chid, bid, revealed, self.now_ms));
                }
            }

            // === Exercises & Exams ===
            "exo-toggle-hint" => {
                let target = data["target"].as_str().unwrap_or("").to_string();
                if self.exo_state.open_hints.contains(&target) {
                    self.exo_state.open_hints.remove(&target);
                } else {
                    self.exo_state.open_hints.insert(target);
                }
                self.render_current_route(&mut effs, "none");
            }
            "exo-toggle-sol" => {
                let target = data["target"].as_str().unwrap_or("").to_string();
                if self.exo_state.open_sols.contains(&target) {
                    self.exo_state.open_sols.remove(&target);
                } else {
                    self.exo_state.open_sols.insert(target);
                    if let Route::ExerciseDetail { ref class_id, ref chapter_id, ref ex_path } = self.current_route.clone() {
                        let ex_id = self.get_doc(ex_path).and_then(|d| d["id"].as_str().map(|s| s.to_string())).unwrap_or_else(|| ex_path.clone());
                        let mut p = Map::new();
                        p.insert("correctionsViewed".into(), json!(true));
                        let mut se = self.store.set_exercise(class_id, chapter_id, &ex_id, p, self.now_ms);
                        effs.append(&mut se);
                    }
                }
                self.render_current_route(&mut effs, "none");
            }
            "exo-open-eval" => {
                self.exo_state.pending_eval_idx = data["evalIdx"].as_str().and_then(|s| s.parse::<usize>().ok()).unwrap_or(0);
                let time_txt = format!("Temps passé : {}", crate::html::fmt_time(self.exo_state.elapsed_sec));
                effs.push(json!({ "type": "open-eval", "timeText": time_txt }));
            }
            "eval-save" => {
                let level = data["lv"].as_str().unwrap_or("medium");
                match self.current_route.clone() {
                    Route::ExerciseDetail { class_id, chapter_id, ex_path } => {
                        let ex_id = self.get_doc(&ex_path).and_then(|d| d["id"].as_str().map(|s| s.to_string())).unwrap_or(ex_path);
                        let mut p = Map::new();
                        p.insert("evaluated".into(), json!(level));
                        p.insert("durationSec".into(), json!(self.exo_state.elapsed_sec));
                        let mut se = self.store.set_exercise(&class_id, &chapter_id, &ex_id, p, self.now_ms);
                        effs.append(&mut se);
                    }
                    Route::ExamDetail { class_id, path, .. } => {
                        if let Some(exam) = self.get_doc(&path) {
                            let exam_id = exam["id"].as_str().unwrap_or("exam");
                            let exam_ch = format!("exam-{exam_id}");
                            if let Some(ex) = exam["exercises"].as_array().and_then(|a| a.get(self.exo_state.pending_eval_idx)) {
                                let eid = ex["id"].as_str().unwrap_or("ex");
                                let mut p = Map::new();
                                p.insert("evaluated".into(), json!(level));
                                p.insert("durationSec".into(), json!(self.exo_state.elapsed_sec));
                                let mut se = self.store.set_exercise(&class_id, &exam_ch, eid, p, self.now_ms);
                                effs.append(&mut se);
                            }
                        }
                    }
                    _ => {}
                }
                effs.push(json!({ "type": "sound", "name": "ok" }));
                effs.push(json!({ "type": "toast", "message": "Auto-évaluation enregistrée", "tone": "ok" }));
                self.render_current_route(&mut effs, "none");
            }
            "exam-tab" | "exam-jump" => {
                let idx = data["exI"].as_str().and_then(|s| s.parse::<usize>().ok()).unwrap_or(0);
                self.exo_state.active_exam_idx = idx;
                self.render_current_route(&mut effs, "none");
                effs.push(json!({ "type": "scroll-to", "selector": format!("#exo-sheet-{idx}") }));
            }

            // === Quiz & Concours ===
            "quiz-pick" => {
                if !self.quiz_state.submitted {
                    if let Some(idx) = data["idx"].as_str().and_then(|s| s.parse::<usize>().ok()) {
                        self.quiz_state.selected_choice = Some(idx);
                        effs.push(json!({ "type": "sound", "name": "tap" }));
                        self.render_current_route(&mut effs, "none");
                    }
                }
            }
            "quiz-input" => {
                if !self.quiz_state.submitted {
                    self.quiz_state.input_value = value.to_string();
                    let can = !self.quiz_state.input_value.trim().is_empty();
                    effs.push(json!({ "type": "set-attr", "selector": "[data-action=\"quiz-submit\"]", "attr": "disabled", "value": if can { Value::Null } else { json!("") } }));
                }
            }
            "quiz-move" => {
                if !self.quiz_state.submitted {
                    let pos = data["pos"].as_str().and_then(|s| s.parse::<usize>().ok()).unwrap_or(0);
                    let dir = data["dir"].as_str().and_then(|s| s.parse::<i32>().ok()).unwrap_or(0);
                    let len = self.quiz_state.order_items.len();
                    if dir < 0 && pos > 0 && pos < len {
                        self.quiz_state.order_items.swap(pos, pos - 1);
                    } else if dir > 0 && pos + 1 < len {
                        self.quiz_state.order_items.swap(pos, pos + 1);
                    }
                    self.render_current_route(&mut effs, "none");
                }
            }
            "quiz-submit" => {
                if !self.quiz_state.submitted && !self.quiz_state.finished {
                    let ok = self.quiz_state.evaluate_current();
                    effs.push(json!({ "type": "sound", "name": if ok { "ok" } else { "ko" } }));
                    self.record_quiz_step_progress(&mut effs);
                    self.render_current_route(&mut effs, "none");
                }
            }
            "quiz-next" => {
                if self.quiz_state.submitted && !self.quiz_state.finished {
                    let done = self.quiz_state.advance();
                    if done {
                        effs.push(json!({ "type": "timer", "active": false }));
                        if self.quiz_state.is_concours {
                            let mut ce = self.store.record_concours_attempt(
                                &self.quiz_state.school_id,
                                &self.quiz_state.mode,
                                self.quiz_state.score,
                                self.quiz_state.questions.len(),
                                self.now_ms,
                            );
                            effs.append(&mut ce);
                        } else {
                            let mut qe = self.store.record_quiz_attempt(
                                &self.quiz_state.class_id,
                                &self.quiz_state.chapter_id,
                                self.quiz_state.score,
                                self.quiz_state.questions.len(),
                                self.quiz_state.total_elapsed,
                                self.now_ms,
                            );
                            effs.append(&mut qe);
                        }
                    }
                    self.render_current_route(&mut effs, "none");
                }
            }
            "quiz-hint" => {
                if !self.quiz_state.submitted && !self.quiz_state.finished {
                    self.quiz_state.hint_revealed = true;
                    self.render_current_route(&mut effs, "none");
                }
            }
            "quiz-retry" => {
                self.quiz_state.restart_full();
                effs.push(json!({ "type": "timer", "active": true }));
                self.render_current_route(&mut effs, "none");
            }
            "quiz-retry-wrong" => {
                if self.quiz_state.retry_wrong_only() > 0 {
                    effs.push(json!({ "type": "timer", "active": true }));
                    self.render_current_route(&mut effs, "none");
                }
            }
            "keydown" => {
                let key = data["key"].as_str().unwrap_or("");
                let ctrl = data["ctrl"].as_bool().unwrap_or(false);
                let shift = data["shift"].as_bool().unwrap_or(false);
                if self.rev_state.focus_open {
                    match key {
                        "ArrowRight" | " " => {
                            if self.rev_state.focus_step_mode
                                && self.rev_state.focus_idx + 1 < self.rev_state.focus_steps.len()
                            {
                                self.rev_state.focus_idx += 1;
                                self.push_focus_dialog_effects(&mut effs);
                            }
                        }
                        "ArrowLeft" => {
                            if self.rev_state.focus_step_mode && self.rev_state.focus_idx > 0 {
                                self.rev_state.focus_idx -= 1;
                                self.push_focus_dialog_effects(&mut effs);
                            }
                        }
                        "v" | "V" => {
                            if self.rev_state.focus_steps.len() > 1 {
                                self.rev_state.focus_step_mode = !self.rev_state.focus_step_mode;
                                self.push_focus_dialog_effects(&mut effs);
                            }
                        }
                        "Home" => {
                            if !self.rev_state.focus_steps.is_empty() {
                                self.rev_state.focus_idx = 0;
                                self.rev_state.focus_step_mode = self.rev_state.focus_steps.len() > 1;
                                self.push_focus_dialog_effects(&mut effs);
                            }
                        }
                        "End" => {
                            if !self.rev_state.focus_steps.is_empty() {
                                self.rev_state.focus_idx = self.rev_state.focus_steps.len() - 1;
                                self.push_focus_dialog_effects(&mut effs);
                            }
                        }
                        _ => {}
                    }
                    return json!({ "ok": true, "effects": effs });
                }
                if ctrl && (key == "b" || key == "B") && !self.is_admin && self.current_route.has_sidebar() {
                    let next = !self.is_sb_collapsed();
                    self.store.sb_collapsed = Some(next);
                    effs.push(storage_str_effect(KEY_SB_COLLAPSED, Some(if next { "1" } else { "0" }), false));
                    self.push_shell_sync(&mut effs);
                } else if shift && (key == "D" || key == "d") {
                    self.toggle_theme(&mut effs);
                } else if matches!(self.current_route, Route::Quiz { .. } | Route::Concours { .. }) && !self.quiz_state.finished {
                    let pick = match key {
                        "a" | "A" | "1" => Some(0),
                        "b" | "B" | "2" => Some(1),
                        "c" | "C" | "3" => Some(2),
                        "d" | "D" | "4" => Some(3),
                        _ => None,
                    };
                    if let Some(i) = pick {
                        if !self.quiz_state.submitted {
                            self.quiz_state.selected_choice = Some(i);
                            self.render_current_route(&mut effs, "none");
                        }
                    } else if key == "Enter" {
                        if self.quiz_state.submitted {
                            return self.op_event(&json!({ "action": "quiz-next" }));
                        } else if self.quiz_state.selected_choice.is_some() || !self.quiz_state.input_value.trim().is_empty() {
                            return self.op_event(&json!({ "action": "quiz-submit" }));
                        }
                    }
                }
            }

            // === Admin & Editorial Studio (feature-gated) ===
            #[cfg(feature = "admin")]
            _ if action.starts_with("admin-") || action.starts_with("studio-") => {
                self.handle_admin_event(action, data, value, checked, &mut effs);
            }

            _ => {
                let _ = checked;
            }
        }

        json!({ "ok": true, "effects": effs })
    }

    fn push_focus_dialog_effects(&self, effs: &mut Vec<Value>) {
        effs.push(json!({
            "type": "dialog",
            "selector": "#focus-dlg",
            "open": true,
            "attrs": {
                "data-k": self.rev_state.focus_kind,
                "data-ctype": self.rev_state.focus_ctype
            },
            "html": render_focus_dialog(&self.rev_state)
        }));
    }

    fn queue_orientation_docs(&mut self, effs: &mut Vec<Value>) {
        self.queue_fetch(effs, ORIENTATION_INDEX_PATH, true);
        let idx_doc = self.get_doc(ORIENTATION_INDEX_PATH);
        let opath = orientation_class_path(idx_doc.as_ref(), &self.orient_state.class_id);
        self.queue_fetch(effs, &opath, true);
    }

    fn push_orientation_modal(&self, effs: &mut Vec<Value>) {
        let idx_doc = self.get_doc(ORIENTATION_INDEX_PATH);
        let opath = orientation_class_path(idx_doc.as_ref(), &self.orient_state.class_id);
        let cls_doc = self.get_doc(&opath);
        let (body, footer) = render_orientation_modal_body(
            &self.orient_state,
            idx_doc.as_ref(),
            cls_doc.as_ref(),
            Self::has_cadre(&self.orient_state.class_id),
        );
        effs.push(json!({
            "type": "modal",
            "open": true,
            "wide": true,
            "title": "Orientation & Programme officiel",
            "subtitle": orientation_subtitle(&self.orient_state.class_id),
            "body": body,
            "footer": footer
        }));
    }

    #[cfg(feature = "admin")]
    fn handle_admin_event(
        &mut self,
        action: &str,
        data: &Value,
        value: &str,
        checked: bool,
        effs: &mut Vec<Value>,
    ) {
        match action {
            "admin-login" => {
                let pass = data["pass"].as_str().unwrap_or("").trim();
                if pass.is_empty() {
                    self.admin_state.login_error = Some("Saisissez votre code d’accès.".into());
                    self.render_current_route(effs, "none");
                } else {
                    self.admin_state.auth_loading = true;
                    self.admin_state.login_error = None;
                    effs.push(json!({
                        "type": "auth-submit",
                        "action": "login",
                        "passcode": pass
                    }));
                    self.render_current_route(effs, "none");
                }
            }
            "admin-claim" => {
                let pass = data["pass"].as_str().unwrap_or("").trim();
                let confirm = data["confirm"].as_str().unwrap_or("").trim();
                let len = pass.chars().count();
                let classes = [
                    pass.chars().any(|c| c.is_ascii_lowercase()),
                    pass.chars().any(|c| c.is_ascii_uppercase()),
                    pass.chars().any(|c| c.is_ascii_digit()),
                    pass.chars().any(|c| !c.is_ascii_alphanumeric()),
                ]
                .iter()
                .filter(|&&b| b)
                .count();
                let distinct: std::collections::HashSet<char> = pass.chars().collect();
                if len < 10 || len > 128 {
                    self.admin_state.login_error = Some("Choisissez un code entre 10 et 128 caractères.".into());
                    self.render_current_route(effs, "none");
                } else if classes < 3 {
                    self.admin_state.login_error = Some("Combinez au moins 3 types : minuscules, majuscules, chiffres ou symboles.".into());
                    self.render_current_route(effs, "none");
                } else if distinct.len() < 5 {
                    self.admin_state.login_error = Some("Code trop répétitif : utilisez davantage de caractères différents.".into());
                    self.render_current_route(effs, "none");
                } else if pass != confirm {
                    self.admin_state.login_error = Some("Les deux codes ne correspondent pas.".into());
                    self.render_current_route(effs, "none");
                } else {
                    self.admin_state.auth_loading = true;
                    self.admin_state.login_error = None;
                    effs.push(json!({
                        "type": "auth-submit",
                        "action": "claim",
                        "passcode": pass
                    }));
                    self.render_current_route(effs, "none");
                }
            }
            "admin-logout" => {
                self.store.admin_authed = false;
                self.admin_state.auth_loading = false;
                self.admin_state.login_error = None;
                self.admin_state.remaining_attempts = None;
                self.admin_state.retry_after_sec = None;
                self.admin_state.session_expires_at = None;
                self.admin_state.server_health = None;
                effs.push(json!({ "type": "auth-logout" }));
                self.render_current_route(effs, "none");
            }
            "admin-refresh-session" => {
                effs.push(json!({ "type": "auth-refresh", "manual": true }));
            }
            "admin-passcode-modal" => {
                effs.push(json!({
                    "type": "modal",
                    "open": true,
                    "title": "Modifier le code d’accès",
                    "subtitle": "Rotation sécurisée avec renouvellement immédiat de la session",
                    "body": render_passcode_modal(),
                    "footer": ""
                }));
            }
            "admin-passcode-submit" => {
                let cur = data["current"].as_str().unwrap_or("").trim();
                let next = data["next"].as_str().unwrap_or("").trim();
                let confirm = data["confirm"].as_str().unwrap_or("").trim();
                let len = next.chars().count();
                let classes = [
                    next.chars().any(|c| c.is_ascii_lowercase()),
                    next.chars().any(|c| c.is_ascii_uppercase()),
                    next.chars().any(|c| c.is_ascii_digit()),
                    next.chars().any(|c| !c.is_ascii_alphanumeric()),
                ]
                .iter()
                .filter(|&&b| b)
                .count();
                let distinct: std::collections::HashSet<char> = next.chars().collect();
                if cur.is_empty() {
                    effs.push(json!({ "type": "toast", "message": "Saisissez le code actuel.", "tone": "err" }));
                } else if len < 10 || len > 128 {
                    effs.push(json!({ "type": "toast", "message": "Le nouveau code doit contenir 10 à 128 caractères.", "tone": "err" }));
                } else if classes < 3 {
                    effs.push(json!({ "type": "toast", "message": "Combinez au moins 3 types de caractères.", "tone": "err" }));
                } else if distinct.len() < 5 {
                    effs.push(json!({ "type": "toast", "message": "Nouveau code trop répétitif.", "tone": "err" }));
                } else if next != confirm {
                    effs.push(json!({ "type": "toast", "message": "La confirmation ne correspond pas.", "tone": "err" }));
                } else {
                    effs.push(json!({
                        "type": "auth-change-passcode",
                        "currentPasscode": cur,
                        "newPasscode": next
                    }));
                }
            }
            "admin-tab" => {
                let tab = data["tab"].as_str().unwrap_or("dashboard").to_string();
                self.admin_state.tab = tab.clone();
                self.admin_state.drawer_open = false;
                self.current_route = Route::Admin { tab: tab.clone(), query: BTreeMap::new() };
                let h = format!("#/{tab}");
                self.current_hash = h.clone();
                effs.push(json!({ "type": "set-hash", "hash": h, "silent": true }));
                if tab == "studio" {
                    let cid = self.studio_state.class_id.clone();
                    let mp = self.class_manifest_path(&cid);
                    self.queue_fetch(effs, &mp, false);
                }
                self.render_current_route(effs, "none");
            }
            "admin-toggle-sb" => {
                self.admin_state.collapsed = !self.admin_state.collapsed;
                self.render_current_route(effs, "none");
            }
            "admin-toggle-drawer" => {
                self.admin_state.drawer_open = !self.admin_state.drawer_open;
                self.render_current_route(effs, "none");
            }
            "admin-close-drawer" => {
                self.admin_state.drawer_open = false;
                self.render_current_route(effs, "none");
            }
            "admin-theme" => {
                self.toggle_theme(effs);
                self.render_current_route(effs, "none");
            }
            "admin-open-class" => {
                let cid = data["class"].as_str().unwrap_or("").to_string();
                if !cid.is_empty() && !self.admin_state.open_classes.contains(&cid) {
                    self.admin_state.open_classes.push(cid);
                }
                self.admin_state.tab = "pilotage".into();
                self.current_route = Route::Admin { tab: "pilotage".into(), query: BTreeMap::new() };
                effs.push(json!({ "type": "set-hash", "hash": "#/pilotage", "silent": true }));
                self.render_current_route(effs, "none");
            }
            "admin-tree-class" => {
                let cid = data["class"].as_str().unwrap_or("").to_string();
                if let Some(pos) = self.admin_state.open_classes.iter().position(|x| x == &cid) {
                    self.admin_state.open_classes.remove(pos);
                } else {
                    self.admin_state.open_classes.push(cid.clone());
                    let mp = self.class_manifest_path(&cid);
                    self.queue_fetch(effs, &mp, false);
                }
                self.render_current_route(effs, "none");
            }
            "admin-tree-ch" => {
                let cid = data["class"].as_str().unwrap_or("").to_string();
                let chid = data["ch"].as_str().unwrap_or("").to_string();
                let man_path = format!("data/{cid}/{chid}/manifest.json");
                self.admin_state.selected_chapter = Some((cid, chid));
                self.admin_state.selected_manifest = self.get_doc(&man_path);
                if self.admin_state.selected_manifest.is_none() {
                    self.queue_fetch(effs, &man_path, false);
                }
                self.render_current_route(effs, "none");
            }
            "admin-tree-search" => {
                self.admin_state.tree_search = value.to_string();
                self.render_current_route(effs, "none");
            }
            "admin-run-audit" => {
                let mut waiting = false;
                let class_ids: Vec<String> = self
                    .classes
                    .iter()
                    .filter_map(|c| c["id"].as_str().map(|s| s.to_string()))
                    .collect();
                for cid in &class_ids {
                    let mp = Self::canonical_path(&self.class_manifest_path(cid));
                    if self.get_doc(&mp).is_none() {
                        self.failed_paths.remove(&mp);
                        self.queue_fetch(effs, &mp, false);
                        if self.in_flight.contains(&mp) {
                            waiting = true;
                        }
                    }
                }
                if waiting {
                    self.admin_state.audit_pending = true;
                    self.admin_state.audit_running = true;
                    self.render_current_route(effs, "none");
                } else {
                    self.admin_state.audit_pending = false;
                    self.admin_state.audit_running = false;
                    let cache = self.build_admin_class_cache();
                    self.admin_state.audit_reports =
                        audit_classes_local(&self.classes, &cache, &self.store.overrides);
                    effs.push(json!({ "type": "toast", "message": "Audit complet Rust/WASM terminé", "tone": "ok" }));
                    self.render_current_route(effs, "none");
                }
            }
            "admin-ov-del" => {
                let p = data["path"].as_str().unwrap_or("");
                let mut oe = self.store.remove_override(p, self.now_ms);
                effs.append(&mut oe);
                effs.push(json!({ "type": "toast", "message": "Publication supprimée", "tone": "ok" }));
                self.render_current_route(effs, "none");
            }
            "admin-ov-clear" => {
                let mut oe = self.store.clear_overrides(self.now_ms);
                effs.append(&mut oe);
                effs.push(json!({ "type": "toast", "message": "Toutes les publications annulées", "tone": "ok" }));
                self.render_current_route(effs, "none");
            }
            "admin-user-status" => {
                let id = data["id"].as_str().unwrap_or("");
                let status = data["status"].as_str().unwrap_or("approved");
                if let Some(arr) = self.store.users.as_array_mut() {
                    for u in arr.iter_mut() {
                        if u["id"].as_str() == Some(id) {
                            if let Some(m) = u.as_object_mut() {
                                m.insert("status".into(), json!(status));
                            }
                        }
                    }
                }
                effs.push(storage_effect(crate::store::KEY_USERS, &self.store.users));
                effs.push(self.store.push_activity("user-status", &format!("Compte {id} → {status}"), "admin", self.now_ms));
                self.render_current_route(effs, "none");
            }
            "admin-user-del" => {
                let id = data["id"].as_str().unwrap_or("");
                if let Some(arr) = self.store.users.as_array_mut() {
                    arr.retain(|u| u["id"].as_str() != Some(id));
                }
                effs.push(storage_effect(crate::store::KEY_USERS, &self.store.users));
                self.render_current_route(effs, "none");
            }
            "admin-add-user-modal" => {
                let body = r#"<form id="adm-new-user" data-action="admin-add-user-submit">
                  <label class="fld">Nom complet<input name="name" required placeholder="Ex. Nadia Bennani" /></label>
                  <label class="fld">Téléphone<input name="phone" placeholder="06 00 00 00 00" /></label>
                  <label class="fld">Classe<input name="classId" value="2eme-bac-sc-math" /></label>
                  <label class="fld">Rôle<select name="role"><option value="student">Élève</option><option value="prof">Professeur</option></select></label>
                  <div class="row" style="margin-top:16px">
                    <button type="button" class="btn" data-action="modal-close">Annuler</button>
                    <button type="submit" class="btn primary">Créer</button>
                  </div>
                </form>"#;
                effs.push(json!({
                    "type": "modal",
                    "open": true,
                    "title": "Nouveau compte",
                    "subtitle": "Ajouter un élève ou un professeur",
                    "body": body,
                    "footer": ""
                }));
            }
            "admin-add-user-submit" => {
                let name = data["name"].as_str().unwrap_or("").trim();
                if !name.is_empty() {
                    let uid = format!("u-{}", self.now_ms);
                    if let Some(arr) = self.store.users.as_array_mut() {
                        arr.insert(0, json!({
                            "id": uid,
                            "name": name,
                            "phone": data["phone"].as_str().unwrap_or("—"),
                            "classId": data["classId"].as_str().unwrap_or("2eme-bac-sc-math"),
                            "role": data["role"].as_str().unwrap_or("student"),
                            "status": "approved"
                        }));
                    }
                    effs.push(storage_effect(crate::store::KEY_USERS, &self.store.users));
                    effs.push(json!({ "type": "modal", "open": false }));
                    effs.push(json!({ "type": "toast", "message": "Compte ajouté", "tone": "ok" }));
                    self.render_current_route(effs, "none");
                }
            }
            "admin-free-mode" => {
                effs.push(self.store.set_profile_field("freeMode", json!(checked)));
                effs.push(self.store.set_config_free_mode(checked));
                effs.push(self.store.push_activity("free-mode", if checked { "Mode libre global activé" } else { "Mode libre global désactivé" }, "admin", self.now_ms));
                self.render_current_route(effs, "none");
            }
            "admin-unlock-ch" => {
                let cid = data["class"].as_str().unwrap_or("");
                let chid = data["ch"].as_str().unwrap_or("");
                if let Some(e) = self.store.mark_sticky(cid, chid, "quiz") { effs.push(e); }
                if let Some(e) = self.store.mark_sticky(cid, chid, "exercises") { effs.push(e); }
                effs.push(self.store.set_config_unlock_chapter(cid, chid));
                effs.push(self.store.push_activity("chapter-unlock", &format!("Chapitre {cid}/{chid} débloqué"), "admin", self.now_ms));
                effs.push(json!({ "type": "toast", "message": format!("Chapitre {chid} débloqué pour les élèves"), "tone": "ok" }));
                self.render_current_route(effs, "none");
            }
            "admin-journal-filter" => {
                self.admin_state.journal_filter = data["af"].as_str().unwrap_or("all").to_string();
                self.render_current_route(effs, "none");
            }

            // === Editorial Studio ===
            "studio-class" => {
                self.studio_state.class_id = value.to_string();
                self.studio_state.open_chapters.clear();
                let mp = self.class_manifest_path(value);
                self.queue_fetch(effs, &mp, false);
                self.render_current_route(effs, "none");
            }
            "studio-filter" => {
                self.studio_state.filter_text = value.to_string();
                self.render_current_route(effs, "none");
            }
            "studio-toggle-rail" => {
                self.studio_state.rail_collapsed = !self.studio_state.rail_collapsed;
                self.render_current_route(effs, "none");
            }
            "studio-toggle-ch" => {
                let ch = data["ch"].as_str().unwrap_or("").to_string();
                if self.studio_state.open_chapters.contains(&ch) {
                    self.studio_state.open_chapters.remove(&ch);
                } else {
                    self.studio_state.open_chapters.insert(ch.clone());
                    let mp = format!("data/{}/{ch}/manifest.json", self.studio_state.class_id);
                    self.queue_fetch(effs, &mp, true);
                }
                self.render_current_route(effs, "none");
            }
            "studio-open" => {
                let p = Self::canonical_path(data["path"].as_str().unwrap_or(""));
                if let Some(doc) = self.get_doc(&p) {
                    self.studio_state.open_doc(&p, doc);
                    self.studio_pending_open = None;
                } else {
                    self.studio_pending_open = Some(p.clone());
                    self.queue_fetch(effs, &p, false);
                }
                self.render_current_route(effs, "none");
            }
            "studio-mode" => {
                self.studio_state.mode = data["m"].as_str().unwrap_or("split").to_string();
                self.render_current_route(effs, "none");
            }
            "studio-json-input" => {
                self.studio_state.update_raw_json(value);
                if let Some(ref doc) = self.studio_state.draft_doc {
                    effs.push(json!({
                        "type": "patch",
                        "selector": "#st-live-preview",
                        "html": render_live_preview(doc, &self.studio_state.kind)
                    }));
                }
            }
            "studio-rev-title" | "studio-rev-sub" | "studio-rev-sec-title" | "studio-rev-blk-title" | "studio-rev-blk-content" => {
                if let Some(ref mut doc) = self.studio_state.draft_doc {
                    match action {
                        "studio-rev-title" => {
                            if let Some(h) = doc.get_mut("header").and_then(Value::as_object_mut) {
                                h.insert("title".into(), json!(value));
                            }
                        }
                        "studio-rev-sub" => {
                            if let Some(h) = doc.get_mut("header").and_then(Value::as_object_mut) {
                                h.insert("subtitle".into(), json!(value));
                            }
                        }
                        "studio-rev-sec-title" => {
                            let si = data["si"].as_str().and_then(|s| s.parse::<usize>().ok()).unwrap_or(0);
                            if let Some(sec) = doc.get_mut("sections").and_then(Value::as_array_mut).and_then(|a| a.get_mut(si)).and_then(Value::as_object_mut) {
                                sec.insert("title".into(), json!(value));
                            }
                        }
                        "studio-rev-blk-title" => {
                            let si = data["si"].as_str().and_then(|s| s.parse::<usize>().ok()).unwrap_or(0);
                            let bi = data["bi"].as_str().and_then(|s| s.parse::<usize>().ok()).unwrap_or(0);
                            if let Some(blk) = doc.get_mut("sections").and_then(Value::as_array_mut).and_then(|a| a.get_mut(si)).and_then(|s| s.get_mut("blocks")).and_then(Value::as_array_mut).and_then(|b| b.get_mut(bi)).and_then(Value::as_object_mut) {
                                blk.insert("title".into(), json!(value));
                            }
                        }
                        "studio-rev-blk-content" => {
                            let si = data["si"].as_str().and_then(|s| s.parse::<usize>().ok()).unwrap_or(0);
                            let bi = data["bi"].as_str().and_then(|s| s.parse::<usize>().ok()).unwrap_or(0);
                            if let Some(blk) = doc.get_mut("sections").and_then(Value::as_array_mut).and_then(|a| a.get_mut(si)).and_then(|s| s.get_mut("blocks")).and_then(Value::as_array_mut).and_then(|b| b.get_mut(bi)).and_then(Value::as_object_mut) {
                                blk.insert("content".into(), json!(value));
                            }
                        }
                        _ => {}
                    }
                    self.studio_state.raw_json = serde_json::to_string_pretty(doc).unwrap_or_else(|_| doc.to_string());
                    let prev_html = render_live_preview(doc, &self.studio_state.kind);
                    self.studio_state.recompute_dirty();
                    effs.push(json!({ "type": "patch", "selector": "#st-live-preview", "html": prev_html }));
                }
            }
            "studio-quiz-title" | "studio-quiz-prompt" | "studio-quiz-exp" => {
                if let Some(ref mut doc) = self.studio_state.draft_doc {
                    match action {
                        "studio-quiz-title" => {
                            if let Some(m) = doc.as_object_mut() { m.insert("title".into(), json!(value)); }
                        }
                        "studio-quiz-prompt" => {
                            let qi = data["qi"].as_str().and_then(|s| s.parse::<usize>().ok()).unwrap_or(0);
                            if let Some(q) = doc.get_mut("questions").and_then(Value::as_array_mut).and_then(|a| a.get_mut(qi)).and_then(Value::as_object_mut) {
                                q.insert("prompt".into(), json!(value));
                            }
                        }
                        "studio-quiz-exp" => {
                            let qi = data["qi"].as_str().and_then(|s| s.parse::<usize>().ok()).unwrap_or(0);
                            if let Some(q) = doc.get_mut("questions").and_then(Value::as_array_mut).and_then(|a| a.get_mut(qi)).and_then(Value::as_object_mut) {
                                q.insert("explanation".into(), json!(value));
                            }
                        }
                        _ => {}
                    }
                    self.studio_state.raw_json = serde_json::to_string_pretty(doc).unwrap_or_else(|_| doc.to_string());
                    let prev_html = render_live_preview(doc, &self.studio_state.kind);
                    self.studio_state.recompute_dirty();
                    effs.push(json!({ "type": "patch", "selector": "#st-live-preview", "html": prev_html }));
                }
            }
            "studio-exo-topic" | "studio-exo-diff" | "studio-exo-ctx" | "studio-exo-q-content" | "studio-exo-q-hint" | "studio-exo-q-corr" => {
                if let Some(ref mut doc) = self.studio_state.draft_doc {
                    match action {
                        "studio-exo-topic" => {
                            if let Some(m) = doc.as_object_mut() { m.insert("topic".into(), json!(value)); }
                        }
                        "studio-exo-diff" => {
                            if let Some(m) = doc.as_object_mut() { m.insert("difficulty".into(), json!(value)); }
                        }
                        "studio-exo-ctx" => {
                            if let Some(m) = doc.as_object_mut() { m.insert("context".into(), json!(value)); }
                        }
                        "studio-exo-q-content" => {
                            let qi = data["qi"].as_str().and_then(|s| s.parse::<usize>().ok()).unwrap_or(0);
                            if let Some(q) = doc.get_mut("questions").and_then(Value::as_array_mut).and_then(|a| a.get_mut(qi)).and_then(Value::as_object_mut) {
                                let key = if q.contains_key("content") || !q.contains_key("question") { "content" } else { "question" };
                                q.insert(key.into(), json!(value));
                            }
                        }
                        "studio-exo-q-hint" => {
                            let qi = data["qi"].as_str().and_then(|s| s.parse::<usize>().ok()).unwrap_or(0);
                            if let Some(q) = doc.get_mut("questions").and_then(Value::as_array_mut).and_then(|a| a.get_mut(qi)).and_then(Value::as_object_mut) {
                                q.insert("hint".into(), json!(value));
                            }
                        }
                        "studio-exo-q-corr" => {
                            let qi = data["qi"].as_str().and_then(|s| s.parse::<usize>().ok()).unwrap_or(0);
                            if let Some(q) = doc.get_mut("questions").and_then(Value::as_array_mut).and_then(|a| a.get_mut(qi)).and_then(Value::as_object_mut) {
                                q.insert("correction".into(), json!(value));
                            }
                        }
                        _ => {}
                    }
                    self.studio_state.raw_json = serde_json::to_string_pretty(doc).unwrap_or_else(|_| doc.to_string());
                    let prev_html = render_live_preview(doc, &self.studio_state.kind);
                    self.studio_state.recompute_dirty();
                    effs.push(json!({ "type": "patch", "selector": "#st-live-preview", "html": prev_html }));
                }
            }
            "studio-media-modal" => {
                self.admin_state.media_loading = true;
                effs.push(json!({ "type": "media-list" }));
                effs.push(json!({
                    "type": "modal",
                    "open": true,
                    "wide": true,
                    "title": "Médiathèque",
                    "subtitle": "Importez une image (PNG, JPEG, WebP, GIF ≤ 750 Ko) ou copiez son bloc JSON",
                    "body": render_media_modal(&self.admin_state.media_items, true, &self.root_prefix),
                    "footer": ""
                }));
            }
            "studio-media-upload" => {
                effs.push(json!({ "type": "media-upload", "inputId": "st-media-file" }));
            }
            "studio-copy-media" => {
                let url = data["url"].as_str().unwrap_or("");
                if !url.is_empty() {
                    let snippet = serde_json::to_string_pretty(&json!({
                        "src": url,
                        "position": "bottom",
                        "width": "72%",
                        "alt": "",
                        "caption": ""
                    }))
                    .unwrap_or_default();
                    effs.push(json!({ "type": "copy-text", "text": snippet }));
                    effs.push(json!({ "type": "toast", "message": "Extrait JSON média copié", "tone": "ok" }));
                }
            }
            "studio-format" => {
                if let Some(ref doc) = self.studio_state.draft_doc {
                    let res = json_engine::studio::op_studio_format(doc);
                    if let Some(txt) = res["text"].as_str() {
                        self.studio_state.raw_json = txt.to_string();
                        effs.push(json!({ "type": "toast", "message": "JSON formaté et normalisé par Rust", "tone": "ok" }));
                        self.render_current_route(effs, "none");
                    }
                }
            }
            "studio-download" => {
                if let Some(ref p) = self.studio_state.current_path {
                    let fname = p.rsplit('/').next().unwrap_or("document.json");
                    effs.push(json!({
                        "type": "download",
                        "filename": fname,
                        "content": self.studio_state.raw_json
                    }));
                }
            }
            "studio-revert" => {
                if let Some(orig) = self.studio_state.original_doc.clone() {
                    if let Some(p) = self.studio_state.current_path.clone() {
                        self.studio_state.open_doc(&p, orig);
                        effs.push(json!({ "type": "toast", "message": "Modifications annulées", "tone": "ok" }));
                        self.render_current_route(effs, "none");
                    }
                }
            }
            "studio-publish" => {
                if let (Some(p), Some(doc)) = (self.studio_state.current_path.clone(), self.studio_state.draft_doc.clone()) {
                    let title = doc["header"]["title"]
                        .as_str()
                        .or_else(|| doc["title"].as_str())
                        .unwrap_or("Publication Studio")
                        .to_string();
                    let raw = serde_json::to_string_pretty(&doc).unwrap_or_else(|_| doc.to_string());
                    let mut pe = self.store.publish_override(&p, &raw, &title, self.now_ms);
                    effs.append(&mut pe);
                    self.studio_state.original_doc = Some(doc);
                    self.studio_state.dirty = false;
                    effs.push(json!({ "type": "toast", "message": "Publié côté élève en temps réel !", "tone": "ok" }));
                    self.render_current_route(effs, "none");
                }
            }
            _ => {}
        }
    }
}

fn loading_skeleton(label: &str) -> String {
    format!(
        r#"<main class="page-main"><div class="empty"><div class="skeleton" style="width:180px;height:14px;margin-bottom:10px"></div><div class="body-muted">{}</div></div></main>"#,
        esc(label)
    )
}

fn load_error_card(title: &str, detail: &str, show_classes_btn: bool) -> String {
    let classes_btn = if show_classes_btn {
        r##"<a class="btn" href="#/eleve">Choisir une classe</a>"##
    } else {
        ""
    };
    format!(
        r##"<main class="page-main"><div class="empty" role="alert"><div style="font:600 18px/1.3 var(--display, var(--serif));color:var(--ink);margin-bottom:6px">{t}</div><p class="body-muted" style="max-width:420px;margin:0 auto 16px">{d}</p><div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap"><button class="btn primary" type="button" data-action="retry-load">Réessayer</button>{classes_btn}</div></div></main>"##,
        t = esc(title),
        d = esc(detail),
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::math_html::{render_inline_title, render_math};

    #[test]
    fn route_parsing_student() {
        assert_eq!(parse_route("#/eleve", false, None), Route::RolePicker);
        assert_eq!(
            parse_route("#/eleve/2eme-bac-sc-math?tab=problemes", false, None),
            Route::Dashboard {
                class_id: "2eme-bac-sc-math".into(),
                tab: "problemes".into()
            }
        );
        assert_eq!(
            parse_route("#/eleve/2eme-bac-sc-math/revision/problemes/data/2eme-bac-sc-math/problemes/prob_vote.json", false, None),
            Route::Revision {
                class_id: "2eme-bac-sc-math".into(),
                chapter_id: "problemes".into(),
                path: "data/2eme-bac-sc-math/problemes/prob_vote.json".into(),
            }
        );
        assert!(App::has_problemes("1ere-bac-sc-math"));
        assert!(!App::has_problemes("1ere-bac-sc-ex"));
        assert!(App::has_problemes("2eme-bac-sc-math"));
    }

    #[test]
    fn math_html_supports_textbf_setcounter_nested_lists_and_tables() {
        let html = render_math(r"\textbf{Définition} : \begin{enumerate}\setcounter{enumi}{2}\item Premier\begin{enumerate}\item Sous-item\end{enumerate}\end{enumerate}");
        assert!(html.contains("<strong>Définition</strong>"), "got: {html}");
        assert!(!html.contains(r"\textbf"), "literal \\textbf leaked: {html}");
        assert!(html.contains(">3</span>"), "setcounter missing: {html}");
        assert!(html.contains(">a)</span>"), "nested marker missing: {html}");
        assert!(html.contains("Sous-item"), "nested item missing: {html}");

        // \textbf wrapping math and \textbf after \$ escaped dollar
        let mixed = render_math(r"Coût $5\$$ puis \textbf{Théorème $a = b$} et \textbf{Note} : $x \iff y$.");
        assert!(mixed.contains("<strong>Théorème"), "mixed math in textbf failed: {mixed}");
        assert!(mixed.contains("<strong>Note</strong>"), "textbf after escaped dollar failed: {mixed}");
        assert!(!mixed.contains(r"\textbf"), "literal \\textbf leaked in mixed: {mixed}");

        // \textbf on a line with math command must not be wrapped into display math
        let line = render_math("Intro\n\\textbf{A} \\iff B\nSuite");
        assert!(line.contains("<strong>A</strong>"), "mid-line textbf broken: {line}");
        assert!(!line.contains(r"\textbf"), "literal \\textbf leaked on line: {line}");

        let title = render_inline_title(r"Notion de logique : $P \Rightarrow Q$");
        assert!(title.contains("math-tex"), "inline title math missing: {title}");
        assert!(title.contains("Notion de logique"), "inline title text missing: {title}");
    }

    #[test]
    fn store_progressive_unlock_and_backup() {
        let mut st = Store::new();
        assert_eq!(st.unlock_state("1ere-bac-sc-math", "logique", "Logique"), (false, false));
        let _ = st.set_revision_pct("1ere-bac-sc-math", "logique", "rev.json", 15, 1000);
        assert_eq!(st.unlock_state("1ere-bac-sc-math", "logique", "Logique"), (true, false));
        let _ = st.record_quiz_answered("1ere-bac-sc-math", "logique", 2, 10, 2000);
        assert_eq!(st.unlock_state("1ere-bac-sc-math", "logique", "Logique"), (true, true));

        // Mise à niveau follows standard padlock unlock rules unless freeMode is enabled
        assert_eq!(st.unlock_state("2eme-bac-sc-math", "mise-a-niveau", "Mise à niveau"), (false, false));
        let _ = st.set_revision_pct("2eme-bac-sc-math", "mise-a-niveau", "rev.json", 10, 1500);
        assert_eq!(st.unlock_state("2eme-bac-sc-math", "mise-a-niveau", "Mise à niveau"), (true, false));
        let _ = st.record_quiz_answered("2eme-bac-sc-math", "mise-a-niveau", 3, 20, 2500);
        assert_eq!(st.unlock_state("2eme-bac-sc-math", "mise-a-niveau", "Mise à niveau"), (true, true));

        let backup = st.export_backup(3000);
        let mut st2 = Store::new();
        assert!(st2.import_backup(&backup).is_ok());
        assert_eq!(st2.revision_pct("1ere-bac-sc-math", "logique", Some("rev.json")), 15);
    }

    #[test]
    fn quiz_grading_engine() {
        let doc = json!({
            "title": "Logique",
            "questions": [
                { "type": "mcq", "prompt": "$2+2=$", "options": ["3", "4"], "correctIndex": 1 },
                { "type": "input", "prompt": "Calculer $3 \\times 5$", "answer": "15" }
            ]
        });
        let mut qs = QuizState::default();
        qs.init_from_doc("1ere-bac-sc-math", "logique", &doc, false, "", "");
        qs.selected_choice = Some(1);
        assert!(qs.evaluate_current());
        assert!(!qs.advance());
        qs.input_value = " 15 ".into();
        assert!(qs.evaluate_current());
        assert!(qs.advance());
        assert!(qs.finished);
        assert_eq!(qs.score, 2);
    }

    #[test]
    fn app_end_to_end_init_and_render() {
        let mut app = App::new();
        let res = app.handle("init", &json!({
            "isAdmin": false,
            "rootPrefix": "",
            "hash": "#/eleve",
            "prefersDark": false,
            "viewportWidth": 1280,
            "storage": {},
            "session": {},
            "now": 1000
        }));
        assert_eq!(res["ok"], json!(true));
        let manifest = json!({
            "classes": [
                { "id": "1ere-bac-sc-math", "title": "1ère Bac Sciences Mathématiques", "path": "data/1ere-bac-sc-math/manifest.json" }
            ]
        });
        let r2 = app.handle("fetch-result", &json!({
            "id": "data/manifest.json",
            "ok": true,
            "data": manifest
        }));
        let effs = r2["effects"].as_array().unwrap();
        let mount = effs.iter().find(|e| e["type"] == "mount").unwrap();
        assert!(mount["html"].as_str().unwrap().contains("1ère Bac Sciences Mathématiques"));
    }

    #[test]
    fn dashboard_recovers_from_invalid_class_and_transient_fetch_error() {
        // 1. Stale/invalid classId in localStorage redirects to RolePicker once manifest loads
        let mut app = App::new();
        let _ = app.handle("init", &json!({
            "isAdmin": false,
            "rootPrefix": "",
            "hash": "",
            "prefersDark": false,
            "viewportWidth": 1280,
            "storage": { "mathplus:profile": r#"{"classId":"obsolete-class"}"# },
            "session": {},
            "now": 1000
        }));
        let manifest = json!({
            "classes": [
                { "id": "2eme-bac-sc-math", "title": "2ème Bac Sciences Mathématiques", "path": "data/classes/2eme-bac-sc-math.json" }
            ]
        });
        let r = app.handle("fetch-result", &json!({
            "id": "data/manifest.json",
            "ok": true,
            "data": manifest
        }));
        assert_eq!(app.current_route, Route::RolePicker);
        let mount = r["effects"].as_array().unwrap().iter().find(|e| e["type"] == "mount").unwrap();
        assert!(mount["html"].as_str().unwrap().contains("Votre classe"));

        // 2. Transient fetch failure shows error card (not infinite skeleton) and retry-load re-queues fetch
        let _ = app.handle("hashchange", &json!({ "hash": "#/eleve/2eme-bac-sc-math", "now": 2000 }));
        let r_fail = app.handle("fetch-result", &json!({
            "id": "data/classes/2eme-bac-sc-math.json",
            "ok": false,
            "data": null
        }));
        let err_html = r_fail["effects"].as_array().unwrap().iter().find(|e| e["type"] == "mount").unwrap()["html"].as_str().unwrap();
        assert!(err_html.contains("Réessayer"), "expected retry button, got: {err_html}");
        assert!(!err_html.contains("Chargement du programme"), "should not stay stuck on skeleton");

        let r_retry = app.handle("event", &json!({ "action": "retry-load", "data": {}, "now": 3000 }));
        let has_refetch = r_retry["effects"].as_array().unwrap().iter().any(|e| {
            e["type"] == "fetch" && e["id"] == "data/classes/2eme-bac-sc-math.json"
        });
        assert!(has_refetch, "retry-load must re-queue failed class manifest fetch");
    }

    #[test]
    fn dashboard_hides_cadre_in_learn_tab_and_locks_mise_a_niveau() {
        let mut app = App::new();
        let _ = app.handle("init", &json!({
            "isAdmin": false,
            "rootPrefix": "",
            "hash": "#/eleve/2eme-bac-sc-math",
            "prefersDark": false,
            "viewportWidth": 1280,
            "storage": {},
            "session": {},
            "now": 1000
        }));
        let _ = app.handle("fetch-result", &json!({
            "id": "data/manifest.json",
            "ok": true,
            "data": { "classes": [{ "id": "2eme-bac-sc-math", "title": "2ème Bac Sc Math" }] }
        }));
        let _ = app.handle("fetch-result", &json!({
            "id": "data/2eme-bac-sc-math/examen/cadre_referentiel.json",
            "ok": true,
            "data": { "sections": [{ "category": "method", "id": "m1", "title": "Savoir dériver" }] }
        }));
        let _ = app.handle("fetch-result", &json!({
            "id": "data/2eme-bac-sc-math/examen/index.json",
            "ok": true,
            "data": { "examens": [{ "title": "Bac 2024", "year": 2024, "session": "Normale", "path": "data/2eme-bac-sc-math/examen/e1.json" }] }
        }));
        let res = app.handle("fetch-result", &json!({
            "id": "data/classes/2eme-bac-sc-math.json",
            "ok": true,
            "data": {
                "title": "2ème Bac Sc Math",
                "chapters": [
                    {
                        "id": "mise-a-niveau",
                        "title": "Mise à niveau",
                        "revisions": [{ "path": "data/2eme-bac-sc-math/mise-a-niveau/rev.json" }],
                        "quizzes": [{ "path": "data/2eme-bac-sc-math/mise-a-niveau/quiz.json" }],
                        "hasExercises": true
                    }
                ]
            }
        }));
        let learn_html = res["effects"].as_array().unwrap().iter().find(|e| e["type"] == "mount").unwrap()["html"].as_str().unwrap();
        assert!(!learn_html.contains("Cadre référentiel officiel"), "Cadre banner must not appear in Apprendre tab: {learn_html}");
        assert!(!learn_html.contains("cadre-link"), "cadre-link must not appear in Apprendre tab");
        assert!(learn_html.contains("Verrouillé"), "Mise à niveau must start locked with padlock");
        assert!(!learn_html.contains(r#"class="meta""#), "Chapter rows must not display fiche/quiz/exercices metadata subline");

        let ex_tab = app.handle("event", &json!({ "action": "dash-tab", "data": { "tab": "examens" }, "now": 2000 }));
        let ex_html = ex_tab["effects"]
            .as_array()
            .unwrap()
            .iter()
            .find(|e| (e["type"] == "patch" && e["selector"] == "#dash-panel") || e["type"] == "mount")
            .unwrap()["html"]
            .as_str()
            .unwrap();
        assert!(ex_html.contains("Cadre ↗"), "Cadre link should remain in Examens tab");
    }

    #[test]
    fn revision_warning_button_and_upgraded_focus_mode() {
        let mut app = App::new();
        let sheet_path = "data/2eme-bac-sc-math/limites-continuite/revisions/fiche.json";
        let _ = app.handle("init", &json!({
            "isAdmin": false,
            "rootPrefix": "",
            "hash": format!("#/eleve/2eme-bac-sc-math/revision/limites-continuite/{sheet_path}"),
            "prefersDark": false,
            "viewportWidth": 1280,
            "storage": {},
            "session": {},
            "now": 1000
        }));
        let doc = json!({
            "header": { "title": "Limites" },
            "sections": [{
                "id": "s1",
                "title": "Limites",
                "blocks": [
                    {
                        "type": "definition",
                        "title": "C'est quoi \\mathqst{la continuité}",
                        "content": "Soit $f$ définie au voisinage de $a$.\\par\\smallskip On dit que $f$ est continue en $a$ si $\\lim_{x \\to a} f(x) = f(a)$."
                    },
                    {
                        "type": "application",
                        "content": "\\qst{Calculer $\\lim_{x \\to 1} \\frac{x^2-1}{x-1}$.}\\begin{enumerate}\\item On factorise : $(x-1)(x+1)$.\\item On simplifie et on passe à la limite : $2$.\\end{enumerate}"
                    },
                    {
                        "type": "warning",
                        "content": "Ne pas confondre $\\sqrt{x^2}=|x|$ et $x$ au voisinage de $-\\infty$."
                    }
                ]
            }]
        });
        let r = app.handle("fetch-result", &json!({
            "id": sheet_path,
            "ok": true,
            "data": doc
        }));
        let html = r["effects"].as_array().unwrap().iter().find(|e| e["type"] == "mount").unwrap()["html"].as_str().unwrap();
        assert!(html.contains(r#"class="warn-btn""#), "warning block must render sticky-note warn-btn");
        assert!(html.contains(r#"data-blk-idx="3""#), "warning trigger must carry block index");
        assert!(html.contains(">Attention</span>"), "warning button must show Attention label");

        // Open Focus on warning block (blk 3)
        let r_warn = app.handle("event", &json!({ "action": "rev-focus", "data": { "blkIdx": "3" }, "now": 2000 }));
        let dlg_w = r_warn["effects"].as_array().unwrap().iter().find(|e| e["type"] == "dialog").unwrap();
        assert_eq!(dlg_w["open"], json!(true));
        assert_eq!(dlg_w["attrs"]["data-k"], json!("a"));
        let w_html = dlg_w["html"].as_str().unwrap();
        assert!(w_html.contains("Point de vigilance"), "warning focus mode should display vigilance context");
        assert!(!w_html.contains("focus-step-hidden"), "single warning card must be immediately legible");

        // Open Focus on application block (blk 2): statement separated + progressive steps
        let r_app = app.handle("event", &json!({ "action": "rev-focus", "data": { "blkIdx": "2" }, "now": 3000 }));
        let dlg_a = r_app["effects"].as_array().unwrap().iter().find(|e| e["type"] == "dialog").unwrap();
        assert_eq!(dlg_a["attrs"]["data-k"], json!("e"));
        let a_html = dlg_a["html"].as_str().unwrap();
        assert!(a_html.contains("focus-stmt"), "application focus must separate statement");
        assert!(a_html.contains("focus-sol"), "application focus must separate solution steps");
        assert!(a_html.contains("Étape 1 / 2"), "step progress indicator should appear");
        assert!(a_html.contains("focus-step-hidden"), "second step should start veiled");

        // Advance via ArrowRight keyboard shortcut
        let r_key = app.handle("event", &json!({ "action": "keydown", "data": { "key": "ArrowRight", "ctrl": false, "shift": false }, "now": 3500 }));
        let dlg_k = r_key["effects"].as_array().unwrap().iter().find(|e| e["type"] == "dialog").unwrap();
        assert!(dlg_k["html"].as_str().unwrap().contains("Étape 2 / 2"));

        // Toggle full view mode
        let r_tog = app.handle("event", &json!({ "action": "focus-toggle-mode", "data": {}, "now": 4000 }));
        let dlg_t = r_tog["effects"].as_array().unwrap().iter().find(|e| e["type"] == "dialog").unwrap();
        let t_html = dlg_t["html"].as_str().unwrap();
        assert!(t_html.contains("Étape par étape"), "full view should offer switching back to step-by-step");
        assert!(!t_html.contains("focus-step-hidden"), "full view must unblur all steps");
    }

    #[test]
    fn examens_unboxed_clean_rows_and_filters() {
        let mut app = App::new();
        let _ = app.handle("init", &json!({
            "isAdmin": false,
            "rootPrefix": "",
            "hash": "#/eleve/2eme-bac-sc-math?tab=examens",
            "prefersDark": false,
            "viewportWidth": 1280,
            "storage": {},
            "session": {},
            "now": 1000
        }));
        let _ = app.handle("fetch-result", &json!({
            "id": "data/manifest.json",
            "ok": true,
            "data": { "classes": [{ "id": "2eme-bac-sc-math", "title": "2ème Bac Sc Math" }] }
        }));
        let _ = app.handle("fetch-result", &json!({
            "id": "data/2eme-bac-sc-math/examen/index.json",
            "ok": true,
            "data": {
                "themes": [
                    { "id": "analyse", "name": "Analyse" },
                    { "id": "arithmetique", "name": "Arithmétique" },
                    { "id": "algebre", "name": "Algèbre & Structures" }
                ],
                "themeDistribution": { "analyse": 2, "arithmetique": 1 },
                "examens": [
                    { "title": "Session Normale 2024", "type": "national", "year": 2024, "session": "normale", "exerciseCount": 4, "path": "data/2eme-bac-sc-math/examen/nat_2024_normale.json" },
                    { "title": "Session Rattrapage 2024", "type": "national", "year": 2024, "session": "rattrapage", "exerciseCount": 5, "path": "data/2eme-bac-sc-math/examen/nat_2024_rattrapage.json" }
                ]
            }
        }));
        let _ = app.handle("fetch-result", &json!({
            "id": "data/2eme-bac-sc-math/examen/nat_2024_normale.json",
            "ok": true,
            "data": {
                "exercises": [
                    { "id": "ex1", "number": 1, "theme": "arithmetique", "topic": "Arithmétique dans Z" },
                    { "id": "ex2", "number": 2, "theme": "analyse", "topic": "Étude de fonctions" }
                ]
            }
        }));
        let _ = app.handle("fetch-result", &json!({
            "id": "data/2eme-bac-sc-math/examen/nat_2024_rattrapage.json",
            "ok": true,
            "data": {
                "exercises": [
                    { "id": "ex1", "number": 1, "theme": "analyse", "topic": "Intégrales" }
                ]
            }
        }));
        let res = app.handle("fetch-result", &json!({
            "id": "data/classes/2eme-bac-sc-math.json",
            "ok": true,
            "data": { "title": "2ème Bac Sc Math", "chapters": [] }
        }));
        let html = res["effects"].as_array().unwrap().iter().find(|e| e["type"] == "mount").unwrap()["html"].as_str().unwrap();
        assert!(html.contains(r#"class="flt-dock""#));
        assert!(html.contains(r#"data-action="exam-filter" data-filter="year""#));
        assert!(html.contains(r#"data-action="exam-filter" data-filter="themes""#));
        assert!(html.contains(r#"data-action="exam-filter" data-filter="simulations""#));
        assert!(html.contains(r#"class="idx-yr">2024</span>"#));
        assert!(html.contains("Session rattrapage"));
        assert!(html.contains("5 ex."));
        assert!(html.contains("Session normale"));
        assert!(html.contains("4 ex."));
        assert!(!html.contains(r#"class="it""#), "Examens must not render boxed .it cards");
        assert!(!html.contains(r#"class="tg "#), "Examens must not render .tg badge boxes");
        assert!(!html.contains(r#"type="search""#), "Examens must have zero search inputs");

        // Switch to Thèmes filter -> exposes themes sub-bar & filters exercises
        let th_tab = app.handle("event", &json!({ "action": "exam-filter", "data": { "filter": "themes" }, "now": 1400 }));
        let sub_html = th_tab["effects"].as_array().unwrap().iter().find(|e| e["type"] == "patch" && e["selector"] == "#exam-subbar").unwrap()["html"].as_str().unwrap();
        assert!(sub_html.contains(r#"data-action="exam-theme" data-theme="arithmetique""#));
        assert!(!sub_html.contains(r#"data-theme="algebre""#), "0-count theme must be omitted once exams load");

        let th_filt = app.handle("event", &json!({ "action": "exam-theme", "data": { "theme": "arithmetique" }, "now": 1500 }));
        let th_html = th_filt["effects"].as_array().unwrap().iter().find(|e| e["type"] == "patch" && e["selector"] == "#exam-results").unwrap()["html"].as_str().unwrap();
        assert!(th_html.contains("Session normale"));
        assert!(th_html.contains("Arithmétique dans Z"));
        assert!(!th_html.contains("Session rattrapage"));
        assert!(th_html.contains("?theme=arithmetique"));

        // Switch to Simulations filter
        let sim_filt = app.handle("event", &json!({ "action": "exam-filter", "data": { "filter": "simulations" }, "now": 2000 }));
        let sim_html = sim_filt["effects"].as_array().unwrap().iter().find(|e| e["type"] == "patch" && e["selector"] == "#exam-results").unwrap()["html"].as_str().unwrap();
        assert!(sim_html.contains("Simulation · Session normale"));
        assert!(!sim_html.contains("Session rattrapage"));
    }

    #[test]
    fn concours_school_tabs_filters_and_is_correct_grading() {
        let mut app = App::new();
        let _ = app.handle("init", &json!({
            "isAdmin": false,
            "rootPrefix": "",
            "hash": "#/eleve/2eme-bac-sc-math?tab=concours",
            "prefersDark": false,
            "viewportWidth": 1280,
            "storage": {},
            "session": {},
            "now": 1000
        }));
        let _ = app.handle("fetch-result", &json!({
            "id": "data/manifest.json",
            "ok": true,
            "data": {
                "classes": [{ "id": "2eme-bac-sc-math", "title": "2ème Bac Sc Math" }],
                "concours": [
                    { "id": "ensa", "name": "ENSA" },
                    { "id": "ensam", "name": "ENSAM" },
                    { "id": "medecine", "name": "Médecine" }
                ]
            }
        }));
        let _ = app.handle("fetch-result", &json!({
            "id": "data/concours/schools.json",
            "ok": true,
            "data": {
                "schools": [
                    {
                        "id": "ensa", "name": "ENSA", "questionsPerExam": 30, "totalQuestions": 155, "timePerQuestion": 45,
                        "themes": [
                            { "id": "analyse", "name": "Analyse" },
                            { "id": "algebre", "name": "Algèbre & Géométrie" },
                            { "id": "probabilites", "name": "Probabilités" }
                        ],
                        "themeCounts": { "analyse": 72, "algebre": 54, "probabilites": 29 }
                    },
                    {
                        "id": "ensam", "name": "ENSAM", "questionsPerExam": 25, "totalQuestions": 64, "timePerQuestion": 50,
                        "themes": [
                            { "id": "analyse", "name": "Analyse" },
                            { "id": "algebre", "name": "Algèbre" }
                        ],
                        "themeCounts": { "analyse": 33, "algebre": 31 }
                    },
                    {
                        "id": "medecine", "name": "Faculté Médecine", "questionsPerExam": 20, "totalQuestions": 403, "timePerQuestion": 60,
                        "themes": [
                            { "id": "analyse", "name": "Analyse" },
                            { "id": "algebre", "name": "Algèbre" },
                            { "id": "complexes", "name": "Nombres complexes" },
                            { "id": "probabilites", "name": "Probabilités & Statistiques" }
                        ],
                        "themeCounts": { "analyse": 261, "algebre": 28, "complexes": 52, "probabilites": 45 }
                    }
                ]
            }
        }));
        let _ = app.handle("fetch-result", &json!({
            "id": "data/concours/ensa/manifest.json",
            "ok": true,
            "data": {
                "id": "ensa",
                "name": "ENSA",
                "questionsPerExam": 30,
                "timePerQuestion": 45,
                "annales": [
                    { "year": "2025", "path": "data/concours/ensa/ensa_2025.json", "questionsCount": 20 }
                ],
                "quizzes": [
                    { "theme": "analyse", "title": "Analyse", "path": "data/concours/ensa/quiz/ensa_analyse_quiz.json", "questionsCount": 20 },
                    { "theme": "algebre", "title": "Algèbre & Géométrie", "path": "data/concours/ensa/quiz/ensa_algebre_quiz.json", "questionsCount": 15 }
                ]
            }
        }));
        let _ = app.handle("fetch-result", &json!({
            "id": "data/concours/medecine/manifest.json",
            "ok": true,
            "data": {
                "id": "medecine",
                "name": "Faculté Médecine",
                "questionsPerExam": 20,
                "timePerQuestion": 60,
                "annales": [
                    { "year": "2016 · Rabat", "path": "data/concours/medecine/med_rabat_2016.json", "questionsCount": 11 },
                    { "year": "2015", "path": "data/concours/medecine/med_2015.json", "questionsCount": 0 }
                ],
                "quizzes": [
                    { "theme": "analyse", "title": "Analyse", "path": "data/concours/medecine/quiz/med_analyse_quiz.json", "questionsCount": 13 },
                    { "theme": "probabilites", "title": "Probabilités & Statistiques", "path": "data/concours/medecine/quiz/med_probabilites_quiz.json", "questionsCount": 10 }
                ]
            }
        }));
        let res = app.handle("fetch-result", &json!({
            "id": "data/classes/2eme-bac-sc-math.json",
            "ok": true,
            "data": { "title": "2ème Bac Sc Math", "chapters": [] }
        }));
        let html = res["effects"].as_array().unwrap().iter().find(|e| e["type"] == "mount").unwrap()["html"].as_str().unwrap();
        assert!(html.contains(r#"class="cc-school-tab" data-action="conc-school" data-school="ensa" aria-selected="true">ENSA</button>"#));
        assert!(html.contains(r#"class="cc-school-tab" data-action="conc-school" data-school="ensam" aria-selected="false">ENSAM</button>"#));
        assert!(html.contains(r#"class="cc-school-tab" data-action="conc-school" data-school="medecine" aria-selected="false">Médecine</button>"#));
        assert!(html.contains(r#"data-action="conc-kind" data-kind="simulation""#));
        assert!(html.contains("Simulation complète"));
        assert!(html.contains("30 q."));
        assert!(html.contains("Session 2025"));
        assert!(html.contains("29 q."), "Probabilités must keep its min(29, 30) count");
        assert!(html.contains("Algèbre &amp; Géométrie"));
        assert!(!html.contains(r#"class="it""#), "Concours must not render boxed .it cards");

        // Switch via segmented school button `data.school` payload to Médecine
        let med = app.handle("event", &json!({ "action": "conc-school", "data": { "school": "medecine" }, "now": 2000 }));
        let med_patch = med["effects"].as_array().unwrap().iter().find(|e| e["type"] == "patch" && e["selector"] == "#conc-body").unwrap();
        let med_html = med_patch["html"].as_str().unwrap();
        assert!(med_html.contains("Simulation complète"));
        assert!(med_html.contains("20 q."));
        assert!(med_html.contains("Session 2016 · Rabat"));
        assert!(!med_html.contains("Session 2015"), "0-question annales must be filtered out");
        assert!(med_html.contains("Nombres complexes"));

        // Filter by kind "annales"
        let ann = app.handle("event", &json!({ "action": "conc-kind", "data": { "kind": "annales" }, "now": 2500 }));
        let ann_html = ann["effects"].as_array().unwrap().iter().find(|e| e["type"] == "patch" && e["selector"] == "#conc-results").unwrap()["html"].as_str().unwrap();
        assert!(ann_html.contains("Session 2016 · Rabat"));
        assert!(!ann_html.contains("Simulation complète"));
        assert!(!ann_html.contains("Nombres complexes"));

        // Filter by kind "simulation"
        let sim = app.handle("event", &json!({ "action": "conc-kind", "data": { "kind": "simulation" }, "now": 3000 }));
        let sim_html = sim["effects"].as_array().unwrap().iter().find(|e| e["type"] == "patch" && e["selector"] == "#conc-results").unwrap()["html"].as_str().unwrap();
        assert!(sim_html.contains("Simulation complète"));
        assert!(!sim_html.contains("Session 2016 · Rabat"));

        // Route::Concours parses explicit path & thematic bank routes
        let route = parse_route("#/eleve/2eme-bac-sc-math/concours/medecine?mode=simulation&path=data%2Fconcours%2Fmedecine%2Fmed_rabat_2016.json", false, None);
        assert_eq!(route, Route::Concours {
            class_id: "2eme-bac-sc-math".into(),
            school_id: "medecine".into(),
            mode: "simulation".into(),
            path: Some("data/concours/medecine/med_rabat_2016.json".into()),
            theme: None,
        });
        let _ = app.handle("hashchange", &json!({ "hash": "#/eleve/2eme-bac-sc-math/concours/medecine?mode=training&theme=complexes", "now": 3500 }));
        let r_ann = app.handle("fetch-result", &json!({
            "id": "data/concours/medecine/med_rabat_2016.json",
            "ok": true,
            "data": {
                "questions": [
                    { "type": "mcq", "theme": "analyse", "prompt": "Lim", "options": ["0", "1"], "correctIndex": 0 },
                    { "type": "mcq", "theme": "complexes", "prompt": "Module de $1+i$", "options": ["1", "$\\sqrt{2}$"], "correctIndex": 1 }
                ]
            }
        }));
        let q_mount = r_ann["effects"].as_array().unwrap().iter().find(|e| e["type"] == "mount").unwrap()["html"].as_str().unwrap();
        assert!(q_mount.contains("Module de"), "Thematic Concours quiz must aggregate matching theme questions");
        assert!(!q_mount.contains("Lim"), "Non-matching theme questions must be excluded");

        let qdoc = json!({
            "questions": [{
                "type": "mcq",
                "prompt": "Test $1+1$",
                "options": [
                    { "id": "a", "text": "$1$", "isCorrect": false },
                    { "id": "b", "text": "$2$", "isCorrect": true }
                ]
            }]
        });
        let mut qs = QuizState::default();
        qs.init_from_doc_with_opts("2eme-bac-sc-math", "concours", &qdoc, true, "medecine", "simulation", Some("Médecine 2016"), Some(60), false);
        assert_eq!(qs.time_left, 60);
        assert_eq!(qs.title, "Médecine 2016");
        qs.selected_choice = Some(1);
        assert!(qs.evaluate_current(), "isCorrect option flag must grade accurately");
    }

    #[test]
    fn sidebar_only_on_student_dashboard() {
        let mut app = App::new();
        let has_sb_for = |app: &mut App, hash: &str| -> bool {
            let res = app.handle("hashchange", &json!({ "hash": hash, "now": 1000 }));
            res["effects"]
                .as_array()
                .unwrap()
                .iter()
                .find(|e| e["type"] == "sync-shell")
                .unwrap()["hasSb"]
                .as_bool()
                .unwrap()
        };

        assert!(has_sb_for(&mut app, "#/eleve/2eme-bac-sc-math"));
        assert!(has_sb_for(&mut app, "#/eleve/2eme-bac-sc-math?tab=examens"));
        assert!(has_sb_for(&mut app, "#/eleve/2eme-bac-sc-math?tab=concours"));
        assert!(!has_sb_for(&mut app, "#/eleve"));
        assert!(!has_sb_for(&mut app, "#/eleve/2eme-bac-sc-math/cadre"));
        assert!(!has_sb_for(&mut app, "#/eleve/2eme-bac-sc-math/revision/ch1/data/r.json"));
        assert!(!has_sb_for(&mut app, "#/eleve/2eme-bac-sc-math/quiz/ch1/data/q.json"));
        assert!(!has_sb_for(&mut app, "#/eleve/2eme-bac-sc-math/concours/ensa?mode=training"));
        assert!(!has_sb_for(&mut app, "#/eleve/2eme-bac-sc-math/exercices/ch1"));
        assert!(!has_sb_for(&mut app, "#/eleve/2eme-bac-sc-math/exercices/ch1?ex=data/e.json"));
        assert!(!has_sb_for(&mut app, "#/eleve/2eme-bac-sc-math/examen/data/ex.json"));
    }

    #[test]
    fn orientation_active_class_direct_and_patch_in_place() {
        let mut app = App::new();
        let init_res = app.handle("init", &json!({
            "isAdmin": false,
            "rootPrefix": "",
            "hash": "#/eleve/2eme-bac-sc-math",
            "prefersDark": false,
            "viewportWidth": 1280,
            "storage": {},
            "session": {},
            "now": 1000
        }));
        let init_effs = init_res["effects"].as_array().unwrap();
        assert!(init_effs.iter().any(|e| e["type"] == "fetch" && e["id"] == "data/orientation/index.json"));
        assert!(init_effs.iter().any(|e| e["type"] == "fetch" && e["id"] == "data/orientation/2eme-bac-sc-math.json"));

        let _ = app.handle("event", &json!({ "action": "sb-orient", "data": {}, "now": 1100 }));
        let _ = app.handle("fetch-result", &json!({
            "id": "data/orientation/index.json",
            "ok": true,
            "data": {
                "classes": [
                    { "id": "2eme-bac-sc-math", "short": "2e Bac SM", "label": "2ème Bac Sc. Math", "file": "data/orientation/2eme-bac-sc-math.json" }
                ],
                "methodTips": [{ "title": "Fiche", "text": "Synthèse." }],
                "orientationPaths": [{ "name": "CPGE", "badge": "Excellence", "desc": "MPSI", "req": "SM" }]
            }
        }));
        let hyd = app.handle("fetch-result", &json!({
            "id": "data/orientation/2eme-bac-sc-math.json",
            "ok": true,
            "data": {
                "classId": "2eme-bac-sc-math",
                "source": "MEN BIOF — Juin 2015",
                "pdfUrl": "public/assets/aistudio/recommandations_p_dagogiques_bac_biof_ccab4a64.pdf",
                "chapters": [
                    {
                        "id": "limites",
                        "section": "Analyse",
                        "title": "Limites et continuité",
                        "pages": "p. 21-22",
                        "contents": ["Continuité en un point"],
                        "capacities": ["Utiliser le TVI"],
                        "recommendations": ["On admet le TVI."],
                        "horsProgramme": ["La notion de continuité uniforme est hors programme."]
                    },
                    {
                        "id": "arith",
                        "section": "Algèbre",
                        "title": "Arithmétique",
                        "pages": "p. 25",
                        "contents": ["Divisibilité dans Z"],
                        "capacities": ["Utiliser Bézout"],
                        "recommendations": ["Relier au PGCD."],
                        "horsProgramme": []
                    }
                ]
            }
        }));
        let modal_body = hyd["effects"].as_array().unwrap().iter()
            .find(|e| e["type"] == "modal").unwrap()["body"].as_str().unwrap();
        // Direct student-focused content: both chapters visible, no class picker, no search, no HP/PDF/domain chips/counts
        assert!(modal_body.contains("Limites et continuité"));
        assert!(modal_body.contains("Arithmétique"));
        assert!(modal_body.contains("Continuité en un point"));
        assert!(modal_body.contains(">Contenus</button>"));
        assert!(modal_body.contains(">Capacités</button>"));
        assert!(modal_body.contains(">Conseils</button>"));
        assert!(!modal_body.contains("orient-class-sel"));
        assert!(!modal_body.contains("orient-search"));
        assert!(!modal_body.contains("orient-domains"));
        assert!(!modal_body.contains("Bulletin PDF"));
        assert!(!modal_body.contains("Hors programme"));
        assert!(!modal_body.contains("p. 21-22"));
        assert!(!modal_body.contains("pts</span>"));

        // Switch chapter 1 facet to Conseils -> patches #orient-ch-list-1 cleanly in place
        let rec = app.handle("event", &json!({ "action": "orient-mode", "data": { "ch": "1", "mode": "recommendations" }, "now": 1200 }));
        let rec_patch = rec["effects"].as_array().unwrap().iter()
            .find(|e| e["type"] == "patch" && e["selector"] == "#orient-ch-list-1").unwrap()["html"].as_str().unwrap();
        assert!(rec_patch.contains("On admet le TVI."));
    }

    #[test]
    fn olympiads_and_problems_smart_facet_filtering_without_search_bar() {
        let mut app = App::new();
        let _ = app.handle("init", &json!({
            "isAdmin": false,
            "rootPrefix": "",
            "hash": "#/eleve/1ere-bac-sc-math?tab=olympiades",
            "prefersDark": false,
            "viewportWidth": 1280,
            "storage": {},
            "session": {},
            "now": 1000
        }));
        let _ = app.handle("fetch-result", &json!({
            "id": "data/manifest.json",
            "ok": true,
            "data": { "classes": [{ "id": "1ere-bac-sc-math", "title": "1ère Bac Sc Math" }] }
        }));
        let _ = app.handle("fetch-result", &json!({
            "id": "data/1ere-bac-sc-math/olympiad/manifest.json",
            "ok": true,
            "data": {
                "items": [
                    { "year": 2014, "title": "Olympiade Internationale de Mathématiques (IMO) 2014 — Sujet officiel", "badge": "International", "duration": 240, "exerciseCount": 2, "path": "data/1er-bac-sc-math/olympiad/2014.json" },
                    { "year": 2015, "title": "Olympiade Mathématique Marocaine 2015 — Épreuve nationale", "badge": "National", "duration": 180, "exerciseCount": 2, "path": "data/1er-bac-sc-math/olympiad/2015.json" },
                    { "year": 2024, "title": "Olympiade Internationale de Mathématiques (IMO) 2024 — Sujet officiel", "badge": "International", "duration": 240, "exerciseCount": 2, "path": "data/1er-bac-sc-math/olympiad/2024.json" },
                    { "year": 2025, "title": "Olympiade Mathématique Marocaine 2025 — Épreuve nationale", "badge": "National", "duration": 180, "exerciseCount": 2, "path": "data/1er-bac-sc-math/olympiad/2025.json" }
                ]
            }
        }));
        let res = app.handle("fetch-result", &json!({
            "id": "data/classes/1ere-bac-sc-math.json",
            "ok": true,
            "data": { "title": "1ère Bac Sc Math", "chapters": [] }
        }));
        let html = res["effects"].as_array().unwrap().iter().find(|e| e["type"] == "mount").unwrap()["html"].as_str().unwrap();
        assert!(!html.contains(r#"type="search""#), "Olympiades must have zero search inputs");
        assert!(html.contains("IMO · Internationale"), "IMO titles must be concise");
        assert!(html.contains("Olympiade Marocaine"), "Moroccan Olympiad titles must be concise");
        assert!(!html.contains("Sujet officiel"), "Verbose suffix must be stripped");
        assert!(html.find("2025").unwrap() < html.find("2014").unwrap(), "Default order must be newest first");

        // Filter to International -> dims 2015 & 2025 ticks and shows 2/4 reset
        let intl = app.handle("event", &json!({ "action": "oly-scope", "data": { "scope": "international" }, "now": 1200 }));
        let intl_html = intl["effects"].as_array().unwrap().iter().find(|e| e["type"] == "patch" && e["selector"] == "#oly-view").unwrap()["html"].as_str().unwrap();
        assert!(intl_html.contains("2/4 · ×"));
        assert!(intl_html.contains(r#"class="flt-yr is-dim" data-action="oly-year" data-year="2025" aria-pressed="false" disabled"#));
        assert!(intl_html.contains("IMO · Internationale"));
        assert!(!intl_html.contains("Olympiade Marocaine"));

        // Click year 2024 -> narrows to 1/4
        let y24 = app.handle("event", &json!({ "action": "oly-year", "data": { "year": "2024" }, "now": 1300 }));
        let y24_html = y24["effects"].as_array().unwrap().iter().find(|e| e["type"] == "patch" && e["selector"] == "#oly-view").unwrap()["html"].as_str().unwrap();
        assert!(y24_html.contains("1/4 · ×"));
        assert!(y24_html.contains("2024.json"));
        assert!(!y24_html.contains("2014.json"));

        // Reset -> restores all 4 and flips chronological sort
        let rst = app.handle("event", &json!({ "action": "oly-reset", "data": {}, "now": 1400 }));
        let rst_html = rst["effects"].as_array().unwrap().iter().find(|e| e["type"] == "patch" && e["selector"] == "#oly-view").unwrap()["html"].as_str().unwrap();
        assert!(rst_html.contains("Olympiade Marocaine"));
        assert!(rst_html.contains("IMO · Internationale"));

        let flip = app.handle("event", &json!({ "action": "oly-sort", "data": {}, "now": 1500 }));
        let flip_html = flip["effects"].as_array().unwrap().iter().find(|e| e["type"] == "patch" && e["selector"] == "#oly-view").unwrap()["html"].as_str().unwrap();
        assert!(flip_html.contains("↑ Ancien"));
        let res_part = flip_html.split(r#"id="oly-results""#).nth(1).unwrap();
        assert!(res_part.find("2014.json").unwrap() < res_part.find("2025.json").unwrap());
    }

    #[test]
    fn chapter_steps_use_only_padlock_icons() {
        let mut app = App::new();
        let _ = app.handle("init", &json!({
            "isAdmin": false,
            "rootPrefix": "",
            "hash": "#/eleve/2eme-bac-sc-math",
            "prefersDark": false,
            "viewportWidth": 1280,
            "storage": {},
            "session": {},
            "now": 1000
        }));
        let _ = app.handle("fetch-result", &json!({
            "id": "data/manifest.json",
            "ok": true,
            "data": { "classes": [{ "id": "2eme-bac-sc-math", "title": "2e Bac SM" }] }
        }));
        let res = app.handle("fetch-result", &json!({
            "id": "data/classes/2eme-bac-sc-math.json",
            "ok": true,
            "data": {
                "title": "2e Bac SM",
                "chapters": [{
                    "id": "limites",
                    "title": "Limites et continuité",
                    "revisions": [{ "path": "data/2eme-bac-sc-math/limites/revision.json" }],
                    "quizzes": [{ "path": "data/2eme-bac-sc-math/limites/quiz.json" }],
                    "exercises": [{ "path": "data/2eme-bac-sc-math/limites/ex1.json" }]
                }]
            }
        }));
        let html = res["effects"].as_array().unwrap().iter()
            .find(|e| e["type"] == "mount").unwrap()["html"].as_str().unwrap();
        // Fiche de cours unlocked -> si u + lock-open path; Quiz & Exercices locked -> si l + lock path
        assert!(html.contains(r#"<span class="si u" aria-hidden="true">"#));
        assert!(html.contains(r#"<span class="si l" aria-hidden="true">"#));
        assert!(html.contains("M7.5 10.5V7.2a4.5 4.5 0 0 1 8.4-2.1"), "Unlocked step must use lock-open icon");
        assert!(html.contains("M8 10.5V7.2a4 4 0 0 1 8 0v3.3"), "Locked step must use lock icon");
        assert!(!html.contains("M12 6.5C10.6 5 8.5 4.2"), "Old book-open icon must not appear on steps");
        assert!(!html.contains("M3 13h2.5l2 6.5L12 4h9"), "Old square-root icon must not appear on steps");
        assert!(!html.contains("M8.5 18.5h.01"), "Old calculator icon must not appear on steps");
    }

    #[cfg(feature = "admin")]
    #[test]
    fn admin_login_and_studio_preview() {
        let mut app = App::new();
        let init_res = app.handle("init", &json!({
            "isAdmin": true,
            "rootPrefix": "../",
            "hash": "#/dashboard",
            "prefersDark": false,
            "storage": {},
            "session": {},
            "now": 1000
        }));
        assert!(init_res["effects"].as_array().unwrap().iter().any(|e| e["type"] == "auth-check"));

        let submit = app.handle("event", &json!({
            "action": "admin-login",
            "data": { "pass": "test-server-secret" },
            "now": 2000
        }));
        assert!(!app.store.admin_authed);
        assert!(submit["effects"].as_array().unwrap().iter().any(|e| e["type"] == "auth-submit" && e["action"] == "login"));

        let verified = app.handle("auth-result", &json!({
            "ok": true,
            "mode": "env",
            "now": 2100
        }));
        assert!(app.store.admin_authed);
        let effs = verified["effects"].as_array().unwrap();
        let mount = effs.iter().find(|e| e["type"] == "mount").unwrap();
        assert!(mount["html"].as_str().unwrap().contains("Mathix Admin"));
        assert!(effs.iter().any(|e| e["type"] == "cloud-sync-pull"));
    }

    #[cfg(feature = "admin")]
    #[test]
    fn admin_claim_rejects_weak_passcode_and_renders_lockout() {
        let mut app = App::new();
        app.handle("init", &json!({
            "isAdmin": true,
            "rootPrefix": "../",
            "hash": "#/dashboard",
            "prefersDark": false,
            "storage": {},
            "session": {},
            "now": 1000
        }));
        app.handle("auth-status", &json!({
            "mode": "setup",
            "claimed": false,
            "authenticated": false,
            "now": 1100
        }));

        // Weak password rejected locally before hitting server
        let weak = app.handle("event", &json!({
            "action": "admin-claim",
            "data": { "pass": "password12", "confirm": "password12" },
            "now": 1200
        }));
        assert!(!weak["effects"].as_array().unwrap().iter().any(|e| e["type"] == "auth-submit"));
        let weak_html = weak["effects"].as_array().unwrap().iter()
            .find(|e| e["type"] == "mount").unwrap()["html"].as_str().unwrap();
        assert!(weak_html.contains("Combinez au moins 3 types"));

        // Lockout feedback from server disables submit button
        let locked = app.handle("auth-result", &json!({
            "ok": false,
            "error": "Accès temporairement bloqué.",
            "remainingAttempts": 0,
            "retryAfterSec": 900,
            "now": 1300
        }));
        let locked_html = locked["effects"].as_array().unwrap().iter()
            .find(|e| e["type"] == "mount").unwrap()["html"].as_str().unwrap();
        assert!(locked_html.contains("Verrouillage actif"));
    }

    #[test]
    fn dashboard_places_theme_toggle_next_to_changer() {
        let mut app = App::new();
        app.handle("init", &json!({
            "isAdmin": false,
            "rootPrefix": "",
            "hash": "#/eleve/2eme-bac-sc-math",
            "prefersDark": false,
            "storage": {},
            "session": {},
            "now": 1000
        }));
        let res = app.handle("fetch-result", &json!({
            "id": "data/classes/2eme-bac-sc-math.json",
            "ok": true,
            "data": { "id": "2eme-bac-sc-math", "title": "2e Bac Sc. Math", "chapters": [] },
            "now": 1100
        }));
        let html = res["effects"].as_array().unwrap().iter()
            .find(|e| e["type"] == "mount").unwrap()["html"].as_str().unwrap();
        assert!(html.contains(r#"class="hero-actions""#));
        assert!(html.contains(r#"class="hero-switch""#));
        assert!(html.contains(r#"class="hero-theme-btn""#));
        assert!(html.contains(r#"data-action="sb-theme""#));
    }

    #[test]
    fn config_chapter_unlock_immediately_unlocks_student_steps() {
        let mut st = Store::new();
        assert_eq!(st.unlock_state("2eme-bac-sc-math", "limites", "Limites"), (false, false));
        let _ = st.set_config_unlock_chapter("2eme-bac-sc-math", "limites");
        assert!(st.is_config_chapter_unlocked("2eme-bac-sc-math", "limites"));
        assert_eq!(st.unlock_state("2eme-bac-sc-math", "limites", "Limites"), (true, true));
    }

    #[test]
    fn quiz_hint_and_retry_wrong_only_events() {
        let mut app = App::new();
        app.handle("init", &json!({
            "isAdmin": false,
            "rootPrefix": "",
            "hash": "#/eleve/2eme-bac-sc-math/quiz/limites/data/2eme-bac-sc-math/limites/quiz.json",
            "prefersDark": false,
            "storage": {},
            "session": {},
            "now": 1000
        }));
        let _ = app.handle("fetch-result", &json!({
            "id": "data/2eme-bac-sc-math/limites/quiz.json",
            "ok": true,
            "data": {
                "title": "Limites",
                "questions": [
                    { "type": "input", "prompt": "Calculer $1/2$", "answer": "0.5", "hint": "Diviser 1 par 2" },
                    { "type": "input", "prompt": "Calculer $-3+1$", "answer": "-2" }
                ]
            },
            "now": 1100
        }));
        // Hint toggle reveals inline hint
        let hres = app.handle("event", &json!({ "action": "quiz-hint", "data": {}, "now": 1200 }));
        let hhtml = hres["effects"].as_array().unwrap().iter()
            .find(|e| e["type"] == "mount").unwrap()["html"].as_str().unwrap();
        assert!(hhtml.contains("Diviser 1 par 2"));

        // Q1 right with French decimal / fraction equivalence
        app.handle("event", &json!({ "action": "quiz-input", "data": {}, "value": "\\frac{1}{2}", "now": 1300 }));
        app.handle("event", &json!({ "action": "quiz-submit", "data": {}, "now": 1400 }));
        assert_eq!(app.quiz_state.score, 1);
        app.handle("event", &json!({ "action": "quiz-next", "data": {}, "now": 1500 }));

        // Q2 wrong with sign error -> diagnostic hint
        app.handle("event", &json!({ "action": "quiz-input", "data": {}, "value": "2", "now": 1600 }));
        let sub = app.handle("event", &json!({ "action": "quiz-submit", "data": {}, "now": 1700 }));
        let sub_html = sub["effects"].as_array().unwrap().iter()
            .find(|e| e["type"] == "mount").unwrap()["html"].as_str().unwrap();
        assert!(sub_html.contains("Attention au signe"), "missing sign diagnostic: {sub_html}");
        app.handle("event", &json!({ "action": "quiz-next", "data": {}, "now": 1800 }));
        assert!(app.quiz_state.finished);

        // Retry wrong only -> keeps only the missed question
        let retry = app.handle("event", &json!({ "action": "quiz-retry-wrong", "data": {}, "now": 1900 }));
        assert!(!app.quiz_state.finished);
        assert_eq!(app.quiz_state.questions.len(), 1);
        assert!(retry["effects"].as_array().unwrap().iter().any(|e| e["type"] == "timer" && e["active"] == true));
    }

    #[cfg(feature = "admin")]
    #[test]
    fn admin_full_audit_fetches_missing_classes_and_audits_overrides() {
        let mut app = App::new();
        app.handle("init", &json!({
            "isAdmin": true,
            "rootPrefix": "../",
            "hash": "#/pilotage",
            "prefersDark": false,
            "storage": {},
            "session": {},
            "now": 1000
        }));
        app.handle("auth-result", &json!({
            "ok": true,
            "mode": "claimed",
            "expiresAt": 14_401_000,
            "now": 1100
        }));
        app.handle("fetch-result", &json!({
            "id": "data/manifest.json",
            "ok": true,
            "data": { "classes": [{ "id": "tc-sc", "title": "Tronc Commun", "path": "data/classes/tc-sc.json" }] },
            "now": 1200
        }));
        // Simulate initial prefetch failure so admin-run-audit must actively retry fetching it
        app.handle("fetch-result", &json!({
            "id": "data/classes/tc-sc.json",
            "ok": false,
            "data": null,
            "now": 1220
        }));
        let _ = app.store.publish_override(
            "data/tc-sc/ordre/quiz.json",
            r#"{"title":"Bad","questions":[{"prompt":"$x + 1"}]}"#,
            "Bad",
            1250,
        );

        let run = app.handle("event", &json!({ "action": "admin-run-audit", "data": {}, "now": 1300 }));
        assert!(app.admin_state.audit_pending);
        assert!(run["effects"].as_array().unwrap().iter().any(|e| e["type"] == "fetch" && e["id"] == "data/classes/tc-sc.json"));

        let done = app.handle("fetch-result", &json!({
            "id": "data/classes/tc-sc.json",
            "ok": true,
            "data": { "id": "tc-sc", "title": "Tronc Commun", "chapters": [{ "id": "ordre", "title": "Ordre" }] },
            "now": 1400
        }));
        assert!(!app.admin_state.audit_pending);
        assert_eq!(app.admin_state.audit_reports.len(), 2);
        assert_eq!(app.admin_state.audit_reports[0]["chapters"].as_u64(), Some(1));
        assert_eq!(app.admin_state.audit_reports[1]["kind"].as_str(), Some("override"));
        assert_eq!(app.admin_state.audit_reports[1]["valid"].as_bool(), Some(false));
        assert!(done["effects"].as_array().unwrap().iter().any(|e| e["type"] == "toast"));
    }
}
