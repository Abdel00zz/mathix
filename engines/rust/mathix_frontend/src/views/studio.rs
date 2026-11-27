//! Editorial Studio view (strictly compiled only with `--features admin`).
//! Provides catalog rail, visual/JSON/Split/Render editing modes, live KaTeX preview,
//! Rust `json_engine::studio` diagnostics, formatting, diffing, publishing, and history.

use std::collections::{BTreeMap, BTreeSet};
use serde_json::{json, Value};

use crate::html::{esc, esc_attr, icon, search_matches};
use crate::math_html::{render_inline_title, render_math, render_structured_solution};
use crate::router::build_student_href_for_path;
use crate::store::Store;

#[derive(Clone, Debug)]
pub struct StudioState {
    pub class_id: String,
    pub open_chapters: BTreeSet<String>,
    pub chapter_exercises: BTreeMap<String, Vec<Value>>,
    pub rail_collapsed: bool,
    pub filter_text: String,
    pub current_path: Option<String>,
    pub kind: String,
    pub original_doc: Option<Value>,
    pub draft_doc: Option<Value>,
    pub raw_json: String,
    pub parse_error: Option<String>,
    pub mode: String, // "split" | "fields" | "json" | "render"
    pub dirty: bool,
}

impl Default for StudioState {
    fn default() -> Self {
        Self {
            class_id: "2eme-bac-sc-math".into(),
            open_chapters: BTreeSet::new(),
            chapter_exercises: BTreeMap::new(),
            rail_collapsed: false,
            filter_text: String::new(),
            current_path: None,
            kind: "unknown".into(),
            original_doc: None,
            draft_doc: None,
            raw_json: String::new(),
            parse_error: None,
            mode: "split".into(),
            dirty: false,
        }
    }
}

impl StudioState {
    pub fn open_doc(&mut self, path: &str, doc: Value) {
        self.current_path = Some(path.to_string());
        let det = json_engine::studio::op_studio_detect(&doc, path);
        self.kind = det["kind"].as_str().unwrap_or("unknown").to_string();
        self.raw_json = serde_json::to_string_pretty(&doc).unwrap_or_else(|_| doc.to_string());
        self.original_doc = Some(doc.clone());
        self.draft_doc = Some(doc);
        self.parse_error = None;
        self.dirty = false;
    }

    pub fn update_raw_json(&mut self, raw: &str) {
        self.raw_json = raw.to_string();
        match serde_json::from_str(raw) {
            Ok(doc) => {
                let path = self.current_path.as_deref().unwrap_or("doc.json");
                let det = json_engine::studio::op_studio_detect(&doc, path);
                self.kind = det["kind"].as_str().unwrap_or("unknown").to_string();
                self.draft_doc = Some(doc);
                self.parse_error = None;
            }
            Err(e) => {
                self.parse_error = Some(e);
            }
        }
        self.recompute_dirty();
    }

    pub fn recompute_dirty(&mut self) {
        if let (Some(orig), Some(draft)) = (&self.original_doc, &self.draft_doc) {
            let diff = json_engine::studio::op_studio_diff(&json!({ "original": orig }), draft);
            self.dirty = diff["changed"].as_bool().unwrap_or(false);
        } else {
            self.dirty = false;
        }
    }
}

pub fn render_studio(
    classes: &[Value],
    class_doc: Option<&Value>,
    st: &StudioState,
    store: &Store,
) -> String {
    let class_opts: String = classes
        .iter()
        .map(|c| {
            let id = c["id"].as_str().unwrap_or("");
            let t = c["title"].as_str().unwrap_or(id);
            format!(
                r##"<option value="{id_a}"{sel}>{t_e}</option>"##,
                id_a = esc_attr(id),
                sel = if id == st.class_id { " selected" } else { "" },
                t_e = esc(t),
            )
        })
        .collect();

    let chapters = class_doc
        .and_then(|d| d["chapters"].as_array())
        .cloned()
        .unwrap_or_default();
    let q = st.filter_text.trim();
    let mut cat_html = String::new();
    for (idx, ch) in chapters.iter().enumerate() {
        let ch_id = ch["id"].as_str().unwrap_or("");
        let ch_title = math_engine::analyze::plain_title(ch["title"].as_str().unwrap_or(ch_id));
        let quizzes = ch["quizzes"].as_array().cloned().unwrap_or_default();
        let revisions = ch["revisions"].as_array().cloned().unwrap_or_default();
        let exercises = st.chapter_exercises.get(ch_id).cloned().unwrap_or_default();

        let matches = q.is_empty()
            || search_matches(&ch_title, q)
            || revisions.iter().any(|r| search_matches(r["path"].as_str().unwrap_or(""), q))
            || quizzes.iter().any(|r| search_matches(r["path"].as_str().unwrap_or(""), q));
        if !matches {
            continue;
        }

        let is_open = !q.is_empty() || st.open_chapters.contains(ch_id);
        let file_btn = |lbl: &str, path: &str, ico: &str| -> String {
            let is_active = st.current_path.as_deref() == Some(path);
            let is_ov = store.get_override(path).is_some();
            format!(
                r##"<button type="button" class="st-cat-item{act}" data-action="studio-open" data-path="{pa}">
                  {ic}
                  <span class="st-cat-item__lbl">{le}</span>
                  {ov}
                </button>"##,
                act = if is_active { " is-active" } else { "" },
                pa = esc_attr(path),
                ic = icon(ico, 12, ""),
                le = esc(lbl),
                ov = if is_ov { r##"<span class="st-ov-dot" title="Publié"></span>"## } else { "" },
            )
        };

        let files_html = if is_open {
            let mut f = String::new();
            if !revisions.is_empty() {
                f.push_str(r##"<p class="st-cat-sec-lbl">Révision</p>"##);
                for (k, r) in revisions.iter().enumerate() {
                    let p = r["path"].as_str().unwrap_or("");
                    f.push_str(&file_btn(&format!("Révision {}", k + 1), p, "file"));
                }
            }
            if !quizzes.is_empty() {
                f.push_str(r##"<p class="st-cat-sec-lbl">Quiz</p>"##);
                for (k, r) in quizzes.iter().enumerate() {
                    let p = r["path"].as_str().unwrap_or("");
                    f.push_str(&file_btn(&format!("Quiz {}", k + 1), p, "square-root"));
                }
            }
            if !exercises.is_empty() {
                f.push_str(&format!(r##"<p class="st-cat-sec-lbl">Exercices ({})</p>"##, exercises.len()));
                for (k, r) in exercises.iter().take(10).enumerate() {
                    let p = r["path"].as_str().unwrap_or("");
                    f.push_str(&file_btn(&format!("Exercice {}", k + 1), p, "calculator"));
                }
            }
            let man_path = format!("data/{}/{ch_id}/manifest.json", st.class_id);
            f.push_str(r##"<p class="st-cat-sec-lbl">Structure</p>"##);
            f.push_str(&file_btn("manifest.json", &man_path, "code"));
            format!(r##"<div class="st-cat-files">{f}</div>"##)
        } else {
            String::new()
        };

        cat_html.push_str(&format!(
            r##"<div class="st-cat-group{op}">
              <div class="st-cat-group__hd">
                <button type="button" class="st-cat-group__toggle" data-action="studio-toggle-ch" data-ch="{cid_a}" aria-expanded="{is_open}">
                  <span class="st-cat-group__chev">{chev}</span>
                  <span class="st-cat-group__num">{:02}</span>
                  <span class="st-cat-group__title">{ct_e}</span>
                </button>
              </div>
              {files_html}
            </div>"##,
            idx + 1,
            op = if is_open { " is-open" } else { "" },
            cid_a = esc_attr(ch_id),
            chev = icon("chevron-right", 13, ""),
            ct_e = esc(&ch_title),
        ));
    }

    let has_doc = st.draft_doc.is_some();
    let audit = st.draft_doc.as_ref().and_then(|d| {
        st.current_path.as_deref().map(|p| json_engine::studio::op_studio_audit(d, p))
    });
    let schema_errs = audit.as_ref().and_then(|a| a["schemaErrors"].as_array()).map(|a| a.len()).unwrap_or(0);
    let latex_errs = audit.as_ref().and_then(|a| a["latexIssues"].as_array()).map(|a| a.len()).unwrap_or(0);
    let total_errs = schema_errs + latex_errs;
    let has_err = st.parse_error.is_some() || total_errs > 0;

    let status_cls = if has_err { "is-err" } else if st.dirty { "is-dirty" } else { "is-sync" };
    let status_txt = if has_err { "Erreur" } else if st.dirty { "Brouillon" } else { "Synchronisé" };

    let diag_html = if let Some(ref aud) = audit {
        let m = &aud["metrics"];
        let mut issue_items = String::new();
        if let Some(ref pe) = st.parse_error {
            issue_items.push_str(&format!(r##"<li>JSON : {}</li>"##, esc(pe)));
        }
        let mut shown = 0usize;
        if let Some(arr) = aud["schemaErrors"].as_array() {
            for e in arr {
                if shown >= 5 { break; }
                let msg = e.as_str().map(|s| s.to_string()).unwrap_or_else(|| e.to_string());
                issue_items.push_str(&format!(r##"<li>Schéma : {}</li>"##, esc(&msg)));
                shown += 1;
            }
        }
        if let Some(arr) = aud["latexIssues"].as_array() {
            for e in arr {
                if shown >= 5 { break; }
                let msg = e["message"].as_str().or_else(|| e.as_str()).unwrap_or("Anomalie LaTeX");
                issue_items.push_str(&format!(r##"<li>LaTeX : {}</li>"##, esc(msg)));
                shown += 1;
            }
        }
        let details_ul = if !issue_items.is_empty() {
            format!(r##"<ul class="st-diag-list" style="margin:6px 0 0;padding-left:18px;font-size:12px;flex-basis:100%">{issue_items}</ul>"##)
        } else {
            String::new()
        };
        format!(
            r##"<div class="st-diag {cls}" style="flex-wrap:wrap">
              <span class="st-diag__pill">{pill}</span>
              <span>Type : <strong>{k}</strong></span>
              <span>Formules : <strong>{f}</strong></span>
              <span>Blancs : <strong>{b}</strong></span>
              <span>Tableaux : <strong>{t}</strong></span>
              {details_ul}
            </div>"##,
            cls = if has_err { "is-err" } else { "is-ok" },
            pill = if st.parse_error.is_some() {
                "JSON invalide".into()
            } else if total_errs > 0 {
                format!("{total_errs} erreur(s)")
            } else {
                "Valide · Rust OK".into()
            },
            k = esc(&st.kind),
            f = m["formulas"].as_u64().unwrap_or(0),
            b = m["blanks"].as_u64().unwrap_or(0),
            t = m["tables"].as_u64().unwrap_or(0),
        )
    } else {
        String::new()
    };

    let workspace_html = if let Some(ref doc) = st.draft_doc {
        let mut panes = String::new();
        if st.mode == "fields" || st.mode == "split" {
            panes.push_str(&format!(
                r##"<div class="st-pane st-pane--edit">{}</div>"##,
                render_fields_editor(doc, &st.kind)
            ));
        }
        if st.mode == "json" {
            let err_h = match &st.parse_error {
                Some(e) => format!(r##"<div class="st-json-err">Erreur JSON : {}</div>"##, esc(e)),
                None => String::new(),
            };
            panes.push_str(&format!(
                r##"<div class="st-pane st-pane--json">{err_h}<textarea class="st-json-ta" id="st-json-ta" data-action="studio-json-input" spellcheck="false">{}</textarea></div>"##,
                esc(&st.raw_json)
            ));
        }
        if st.mode == "render" || st.mode == "split" {
            panes.push_str(&format!(
                r##"<div class="st-pane st-pane--preview" id="st-live-preview">{}</div>"##,
                render_live_preview(doc, &st.kind)
            ));
        }
        format!(r##"<div class="st-workspace is-{}">{panes}</div>"##, esc_attr(&st.mode))
    } else {
        format!(
            r##"<div class="st-workspace"><div class="empty" style="margin:auto">
              {}
              <div><strong>Studio éditorial Mathix</strong></div>
              <div class="body-muted">Sélectionnez une fiche de cours, un quiz ou un exercice à gauche pour l’éditer avec aperçu KaTeX temps réel et validation Rust.</div>
            </div></div>"##,
            icon("edit", 28, "")
        )
    };

    let path_label = match &st.current_path {
        Some(p) => {
            let fname = p.rsplit('/').next().unwrap_or(p);
            format!(r##"<strong>{}</strong><small class="st-path__full">{}</small>"##, esc(fname), esc(p))
        }
        None => "Sélectionnez une ressource dans le catalogue".into(),
    };

    let st_btn = st
        .current_path
        .as_deref()
        .and_then(|p| build_student_href_for_path(p, "../"))
        .map(|h| format!(r##"<a class="ib" title="Ouvrir côté élève" href="{h}">{}</a>"##, icon("external", 15, "")))
        .unwrap_or_default();

    let dis = if has_doc { "" } else { " disabled" };

    format!(
        r##"<div class="studio-shell{col_cls}" id="studio-shell">
          <aside class="st-rail" aria-label="Catalogue des contenus">
            <div class="st-rail__top">
              <p class="st-rail__kicker">Chapitres</p>
              <select id="st-class-sel" data-action="studio-class" aria-label="Choisir une classe">{class_opts}</select>
              <input id="st-cat-filter" type="search" data-action="studio-filter" value="{f_val}" placeholder="Filtrer chapitres / fichiers…" aria-label="Filtrer le catalogue" />
            </div>
            <div class="st-rail__list">{cat_html}</div>
          </aside>

          <section class="st-main">
            <header class="st-bar">
              <button class="ib" type="button" data-action="studio-toggle-rail" title="Afficher / masquer le catalogue">{ico_list}</button>
              <span class="st-status-pill {status_cls}" role="status"><i class="st-status-dot"></i><span>{status_txt}</span></span>
              <span class="st-path">{path_label}</span>
              <div class="st-modes" role="tablist" aria-label="Mode du Studio">
                <button type="button" data-action="studio-mode" data-m="fields" aria-selected="{m_f}">Champs</button>
                <button type="button" data-action="studio-mode" data-m="split" aria-selected="{m_s}">Split</button>
                <button type="button" data-action="studio-mode" data-m="json" aria-selected="{m_j}">JSON</button>
                <button type="button" data-action="studio-mode" data-m="render" aria-selected="{m_r}">Rendu</button>
              </div>
              <div class="st-actions">
                {st_btn}
                <button class="ib" type="button" data-action="studio-media-modal" title="Médiathèque (/api/media)">{ico_med}</button>
                <button class="ib" type="button" data-action="studio-format" title="Formater & normaliser (Rust)"{dis}>{ico_sp}</button>
                <button class="ib" type="button" data-action="studio-download" title="Télécharger .json"{dis}>{ico_dl}</button>
                <button class="ib" type="button" data-action="studio-revert" title="Annuler les modifications"{dis}>{ico_rev}</button>
                <button class="btn primary sm" type="button" data-action="studio-publish"{pub_dis}>{ico_sv} Publier</button>
              </div>
            </header>
            {diag_html}
            {workspace_html}
          </section>
        </div>"##,
        col_cls = if st.rail_collapsed { " is-rail-collapsed" } else { "" },
        f_val = esc_attr(&st.filter_text),
        ico_list = icon("list", 16, ""),
        ico_med = icon("upload", 15, ""),
        m_f = st.mode == "fields",
        m_s = st.mode == "split",
        m_j = st.mode == "json",
        m_r = st.mode == "render",
        ico_sp = icon("sparkles", 15, ""),
        ico_dl = icon("download", 15, ""),
        ico_rev = icon("refresh", 15, ""),
        ico_sv = icon("save", 14, ""),
        pub_dis = if !has_doc || st.parse_error.is_some() { " disabled" } else { "" },
    )
}

fn render_fields_editor(doc: &Value, kind: &str) -> String {
    if kind == "revision" {
        let title = doc["header"]["title"].as_str().unwrap_or("");
        let subtitle = doc["header"]["subtitle"].as_str().unwrap_or("");
        let sections = doc["sections"].as_array().cloned().unwrap_or_default();
        let mut sec_html = String::new();
        for (si, s) in sections.iter().enumerate() {
            let stitle = s["title"].as_str().unwrap_or("");
            let blocks = s["blocks"].as_array().cloned().unwrap_or_default();
            let ltr = (b'A' + (si % 26) as u8) as char;
            let mut b_html = String::new();
            for (bi, b) in blocks.iter().enumerate() {
                let bt = b["type"].as_str().unwrap_or("text");
                let btitle = b["title"].as_str().unwrap_or("");
                let content = match &b["content"] {
                    Value::String(x) => x.clone(),
                    Value::Array(arr) => arr.iter().filter_map(|v| v.as_str()).collect::<Vec<_>>().join("\n"),
                    _ => String::new(),
                };
                b_html.push_str(&format!(
                    r##"<div class="st-blk">
                      <div class="st-blk__hd">
                        <span class="badge">{bt_e}</span>
                        <input class="st-blk__title" type="text" data-action="studio-rev-blk-title" data-si="{si}" data-bi="{bi}" value="{btl_a}" placeholder="Titre du bloc…" />
                      </div>
                      <textarea class="st-json-ta" style="min-height:92px" rows="4" data-action="studio-rev-blk-content" data-si="{si}" data-bi="{bi}">{c_e}</textarea>
                    </div>"##,
                    bt_e = esc(bt),
                    btl_a = esc_attr(btitle),
                    c_e = esc(&content),
                ));
            }
            sec_html.push_str(&format!(
                r##"<div class="st-sec">
                  <div class="st-sec__hd">
                    <span class="st-sec__ltr">{ltr}.</span>
                    <input class="st-sec__title" type="text" data-action="studio-rev-sec-title" data-si="{si}" value="{st_a}" placeholder="Titre de section…" />
                    <span class="badge">{n} blocs</span>
                  </div>
                  <div class="st-blocks">{b_html}</div>
                </div>"##,
                st_a = esc_attr(stitle),
                n = blocks.len(),
            ));
        }
        format!(
            r##"<div class="st-ed-body">
              <div class="st-card">
                <div class="st-card__hd">En-tête de la fiche</div>
                <div class="st-grid2">
                  <label class="fld">Titre<input type="text" data-action="studio-rev-title" value="{t_a}" /></label>
                  <label class="fld">Sous-titre<input type="text" data-action="studio-rev-sub" value="{s_a}" /></label>
                </div>
              </div>
              <div class="st-sections">{sec_html}</div>
            </div>"##,
            t_a = esc_attr(title),
            s_a = esc_attr(subtitle),
        )
    } else if kind == "quiz" {
        let title = doc["title"].as_str().unwrap_or("");
        let qs = doc["questions"].as_array().cloned().unwrap_or_default();
        let items: String = qs
            .iter()
            .enumerate()
            .map(|(qi, q)| {
                let pr = q["prompt"].as_str().or_else(|| q["question"].as_str()).unwrap_or("");
                let ex = q["explanation"].as_str().unwrap_or("");
                format!(
                    r##"<div class="st-blk">
                      <div class="st-blk__hd"><span class="badge">Q{}</span></div>
                      <label class="fld">Énoncé<textarea class="st-json-ta" style="min-height:68px" rows="2" data-action="studio-quiz-prompt" data-qi="{qi}">{}</textarea></label>
                      <label class="fld">Explication<textarea class="st-json-ta" style="min-height:68px" rows="2" data-action="studio-quiz-exp" data-qi="{qi}">{}</textarea></label>
                    </div>"##,
                    qi + 1,
                    esc(pr),
                    esc(ex),
                )
            })
            .collect();
        format!(
            r##"<div class="st-ed-body">
              <div class="st-card">
                <div class="st-card__hd">En-tête du quiz</div>
                <label class="fld">Titre<input type="text" data-action="studio-quiz-title" value="{}" /></label>
              </div>
              <div class="st-blocks">{items}</div>
            </div>"##,
            esc_attr(title),
        )
    } else if kind == "exercise" {
        let topic = doc["topic"].as_str().unwrap_or("");
        let diff = doc["difficulty"].as_str().unwrap_or("");
        let ctx = doc["context"].as_str().unwrap_or("");
        let qs = doc["questions"].as_array().cloned().unwrap_or_default();
        let items: String = qs
            .iter()
            .enumerate()
            .map(|(qi, q)| {
                let content = q["content"].as_str().or_else(|| q["question"].as_str()).unwrap_or("");
                let hint = q["hint"].as_str().unwrap_or("");
                let corr = q["correction"].as_str().unwrap_or("");
                format!(
                    r##"<div class="st-blk">
                      <div class="st-blk__hd"><span class="badge">Question {}</span></div>
                      <label class="fld">Énoncé<textarea class="st-json-ta" style="min-height:68px" rows="2" data-action="studio-exo-q-content" data-qi="{qi}">{}</textarea></label>
                      <label class="fld">Indice<textarea class="st-json-ta" style="min-height:52px" rows="2" data-action="studio-exo-q-hint" data-qi="{qi}">{}</textarea></label>
                      <label class="fld">Corrigé<textarea class="st-json-ta" style="min-height:84px" rows="3" data-action="studio-exo-q-corr" data-qi="{qi}">{}</textarea></label>
                    </div>"##,
                    qi + 1,
                    esc(content),
                    esc(hint),
                    esc(corr),
                )
            })
            .collect();
        format!(
            r##"<div class="st-ed-body">
              <div class="st-card">
                <div class="st-card__hd">En-tête de l’exercice</div>
                <div class="st-grid2">
                  <label class="fld">Thème / Sujet<input type="text" data-action="studio-exo-topic" value="{t_a}" /></label>
                  <label class="fld">Difficulté<input type="text" data-action="studio-exo-diff" value="{d_a}" placeholder="facile | moyen | difficile" /></label>
                </div>
                <label class="fld" style="margin-top:10px">Contexte / Énoncé initial<textarea class="st-json-ta" style="min-height:68px" rows="2" data-action="studio-exo-ctx">{c_e}</textarea></label>
              </div>
              <div class="st-blocks">{items}</div>
            </div>"##,
            t_a = esc_attr(topic),
            d_a = esc_attr(diff),
            c_e = esc(ctx),
        )
    } else {
        let pretty = serde_json::to_string_pretty(doc).unwrap_or_else(|_| doc.to_string());
        format!(
            r##"<div class="st-ed-body">
              <p class="body-muted">Édition JSON directe (aperçu temps réel synchronisé) :</p>
              <textarea class="st-json-ta" rows="20" data-action="studio-json-input" spellcheck="false">{}</textarea>
            </div>"##,
            esc(&pretty)
        )
    }
}

pub fn render_live_preview(doc: &Value, kind: &str) -> String {
    if kind == "revision" {
        let title = doc["header"]["title"].as_str().unwrap_or("Aperçu fiche");
        let sections = doc["sections"].as_array().cloned().unwrap_or_default();
        let mut body = format!(r##"<h2 class="les-h1" style="font-size:24px;margin-bottom:16px">{}</h2>"##, render_inline_title(title));
        for s in &sections {
            let st = s["title"].as_str().unwrap_or("");
            if !st.is_empty() {
                body.push_str(&format!(r##"<h3 class="les-sec-h" style="margin:18px 0 10px">{}</h3>"##, render_inline_title(st)));
            }
            for b in s["blocks"].as_array().cloned().unwrap_or_default() {
                let bt = b["type"].as_str().unwrap_or("note");
                let btl = b["title"].as_str().unwrap_or("");
                let content = match &b["content"] {
                    Value::String(x) => x.clone(),
                    Value::Array(arr) => arr.iter().filter_map(|v| v.as_str()).collect::<Vec<_>>().join("\n"),
                    _ => String::new(),
                };
                body.push_str(&format!(
                    r##"<div class="blk" data-k="b"><div class="bh"><span class="bt">{}</span>{}</div><div class="bx">{}</div></div>"##,
                    esc(bt),
                    if btl.is_empty() { String::new() } else { format!(r##"<span class="bn">{}</span>"##, render_inline_title(btl)) },
                    render_math(&content),
                ));
            }
        }
        body
    } else if kind == "quiz" {
        let title = doc["title"].as_str().unwrap_or("Aperçu quiz");
        let qs = doc["questions"].as_array().cloned().unwrap_or_default();
        let items: String = qs
            .iter()
            .enumerate()
            .map(|(i, q)| {
                let pr = q["prompt"].as_str().or_else(|| q["question"].as_str()).unwrap_or("");
                format!(
                    r##"<div class="blk" data-k="e"><div class="bh"><span class="bt">Question {}</span></div><div class="bx">{}</div></div>"##,
                    i + 1,
                    render_math(pr)
                )
            })
            .collect();
        format!(r##"<h2 style="margin-bottom:14px">{}</h2>{items}"##, render_inline_title(title))
    } else if kind == "exercise" {
        let topic = doc["topic"].as_str().unwrap_or("Exercice");
        let ctx = doc["context"].as_str().unwrap_or("");
        let qs = doc["questions"].as_array().cloned().unwrap_or_default();
        let q_html: String = qs
            .iter()
            .enumerate()
            .map(|(i, q)| {
                let c = q["content"].as_str().or_else(|| q["question"].as_str()).unwrap_or("");
                let corr = q["correction"].as_str().unwrap_or("");
                format!(
                    r##"<div class="blk" data-k="b"><div class="bh"><span class="bt">Question {}</span></div><div class="bx">{}{}</div></div>"##,
                    i + 1,
                    render_math(c),
                    if corr.is_empty() { String::new() } else { format!(r##"<div style="margin-top:10px;padding-top:10px;border-top:1px dashed var(--line)">{}</div>"##, render_structured_solution(corr)) }
                )
            })
            .collect();
        format!(
            r##"<h2 style="margin-bottom:12px">{}</h2>{}{q_html}"##,
            render_inline_title(topic),
            if ctx.is_empty() { String::new() } else { format!(r##"<div style="margin-bottom:12px">{}</div>"##, render_math(ctx)) }
        )
    } else {
        format!(r##"<pre class="t-mono" style="font-size:12px;white-space:pre-wrap">{}</pre>"##, esc(&serde_json::to_string_pretty(doc).unwrap_or_default()))
    }
}
