//! Student Dashboard (Apprendre, Examens, Problèmes, Olympiades, Concours) + Cadre Référentiel.
//! Features concise editorial typography and innovative zero-search-bar Smart Facet Filtering (.flt-dock).

use std::collections::{BTreeMap, BTreeSet};
use serde_json::{json, Value};

use crate::html::{esc, esc_attr, fmt_pct, format_class_name, icon, url_encode};
use crate::math_html::{render_inline_title, render_math_inline};
use crate::store::{Store, EXERCISE_UNLOCK_THRESHOLD, QUIZ_UNLOCK_THRESHOLD};

#[derive(Clone, Debug, Default)]
pub struct DashboardState {
    pub active_tab: String,
    // Problèmes smart facets (no search bar)
    pub prob_theme: String,
    pub prob_diff: String,   // "" | "facile" | "moyen" | "difficile"
    pub prob_status: String, // "" | "unread" | "started"
    // Examens smart facets
    pub exam_filter: String,  // "" | "year" | "themes" | "simulations"
    pub exam_year: String,
    pub exam_session: String, // "" | "normale" | "rattrapage"
    pub exam_theme: String,
    // Olympiades smart facets (no search bar)
    pub oly_scope: String, // "" | "national" | "international" | ...
    pub oly_year: String,  // "" | "2025" | ...
    pub oly_asc: bool,     // false = newest first (default), true = oldest first
    // Concours smart facets
    pub conc_school: String,
    pub conc_kind: String, // "" | "annales" | "themes" | "simulation"
    pub conc_theme: String,
    // Learn tab
    pub open_chapter_id: Option<String>,
    // Cadre smart facets (no search bar)
    pub cadre_domain: String,
    pub cadre_status: String, // "" | "todo" | "done"
}

pub struct DashboardData<'a> {
    pub class_id: &'a str,
    pub class_doc: &'a Value,
    pub problems: Option<&'a Value>,
    pub exams: Option<&'a Value>,
    pub exam_docs: &'a BTreeMap<String, Value>,
    pub olympiads: Option<&'a Value>,
    pub concours: Option<&'a Value>,
    pub concours_schools: Option<&'a Value>,
    pub concours_manifests: Vec<(&'a str, Value)>,
    pub cadre: Option<&'a Value>,
}

fn has_any_array(v: Option<&Value>, keys: &[&str]) -> bool {
    let Some(doc) = v else { return false };
    for k in keys {
        if let Some(arr) = doc.get(*k).and_then(Value::as_array) {
            if !arr.is_empty() {
                return true;
            }
        }
    }
    false
}

pub fn dashboard_capabilities(class_id: &str, data: &DashboardData) -> (bool, bool, bool, bool, bool) {
    let has_exams = crate::App::has_examens(class_id) || has_any_array(data.exams, &["examens", "exams"]);
    let has_probs = crate::App::has_problemes(class_id) || has_any_array(data.problems, &["problemes", "problems"]);
    let has_oly = crate::App::has_olympiads(class_id) || has_any_array(data.olympiads, &["items", "olympiads"]);
    let has_conc = crate::App::has_concours(class_id)
        || has_any_array(data.concours_schools, &["schools", "concours"])
        || has_any_array(data.concours, &["concours", "schools"]);
    let has_cadre = crate::App::has_cadre(class_id) || data.cadre.map(|v| !v.is_null()).unwrap_or(false);
    (has_exams, has_probs, has_oly, has_conc, has_cadre)
}

pub fn render_dashboard_panel<'a>(
    data: &DashboardData<'a>,
    st: &DashboardState,
    store: &Store,
) -> (&'static str, String) {
    let class_id = data.class_id;
    let (has_exams, has_probs, has_oly, has_conc, has_cadre) = dashboard_capabilities(class_id, data);

    let active_tab = match st.active_tab.as_str() {
        "examens" if has_exams => "examens",
        "problemes" if has_probs => "problemes",
        "olympiades" if has_oly => "olympiades",
        "concours" if has_conc => "concours",
        _ => "cours",
    };

    let panel_html = match active_tab {
        "examens" => render_exams_tab(class_id, data.exams, data.exam_docs, has_cadre, data.cadre, st, store),
        "problemes" => render_problems_tab(class_id, data.problems, st, store),
        "olympiades" => render_olympiads_tab(class_id, data.olympiads, st),
        "concours" => render_concours_tab(data, st, store),
        _ => render_learn_tab(class_id, data.class_doc, st, store),
    };

    (active_tab, panel_html)
}

pub fn render_dashboard(data: &DashboardData, st: &DashboardState, store: &Store, is_dark: bool) -> String {
    let class_id = data.class_id;
    let first = store.first_name().trim();
    let greeting = if first.is_empty() {
        "Bonjour".to_string()
    } else {
        format!("Bonjour, {}", esc(first))
    };
    let cls_title = data
        .class_doc
        .get("title")
        .and_then(Value::as_str)
        .map(|s| s.to_string())
        .unwrap_or_else(|| format_class_name(class_id));

    let (has_exams, has_probs, has_oly, has_conc, _) = dashboard_capabilities(class_id, data);
    let (active_tab, panel_html) = render_dashboard_panel(data, st, store);

    let mut tabs_html = format!(
        r##"<button type="button" role="tab" data-action="dash-tab" data-tab="cours" aria-selected="{sel}">Apprendre</button>"##,
        sel = active_tab == "cours",
    );
    if has_exams {
        tabs_html.push_str(&format!(
            r##"<button type="button" role="tab" data-action="dash-tab" data-tab="examens" aria-selected="{sel}">Examens</button>"##,
            sel = active_tab == "examens",
        ));
    }
    if has_probs {
        tabs_html.push_str(&format!(
            r##"<button type="button" role="tab" data-action="dash-tab" data-tab="problemes" aria-selected="{sel}">Problèmes</button>"##,
            sel = active_tab == "problemes",
        ));
    }
    if has_oly {
        tabs_html.push_str(&format!(
            r##"<button type="button" role="tab" data-action="dash-tab" data-tab="olympiades" aria-selected="{sel}">Olympiades</button>"##,
            sel = active_tab == "olympiades",
        ));
    }
    if has_conc {
        tabs_html.push_str(&format!(
            r##"<button type="button" role="tab" data-action="dash-tab" data-tab="concours" aria-selected="{sel}">Concours</button>"##,
            sel = active_tab == "concours",
        ));
    }

    let theme_lbl = if is_dark { "Mode clair" } else { "Mode sombre" };
    let theme_ico = icon(if is_dark { "sun" } else { "moon" }, 18, "");
    let google_chip = if let Some(ref u) = store.google_user {
        let dn = u.get("displayName").and_then(Value::as_str).unwrap_or("").trim();
        let email = u.get("email").and_then(Value::as_str).unwrap_or("").trim();
        let short = if !dn.is_empty() {
            dn.split_whitespace().next().unwrap_or(dn)
        } else if !email.is_empty() {
            email.split('@').next().unwrap_or(email)
        } else {
            "Cloud"
        };
        let tip = if email.is_empty() {
            "Compte Google synchronisé (Paramètres)".to_string()
        } else {
            format!("Synchronisé sur Cloud Firestore ({email})")
        };
        format!(
            r##"<button type="button" class="google-user-chip" data-action="open-settings" title="{tip_a}"><span class="google-user-dot" aria-hidden="true"></span><span class="google-user-name">{short_e}</span></button>"##,
            tip_a = esc_attr(&tip),
            short_e = esc(short),
        )
    } else {
        r##"<button type="button" class="google-auth-btn google-auth-btn--sm" data-action="student-google-login" title="Sauvegarder ma progression avec Google"><svg class="google-g-ico" width="14" height="14" viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M23.49 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.47c-.29 1.48-1.14 2.73-2.4 3.58v3h3.86c2.26-2.09 3.56-5.17 3.56-8.82z"/><path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.86-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96H1.29v3.09C3.26 21.3 7.31 24 12 24z"/><path fill="#FBBC05" d="M5.27 14.29c-.25-.72-.38-1.49-.38-2.29s.14-1.57.38-2.29V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.98-3.09z"/><path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.98 3.09c.95-2.85 3.6-4.96 6.73-4.96z"/></svg><span>Google</span></button>"##.to_string()
    };

    format!(
        r##"<main class="page-main" id="dash">
          <header class="hero-header hero-header--compact">
            <div class="hero-top">
              <span class="hero-kicker">{cls_esc}</span>
              <div class="hero-actions">
                {google_chip}
                <a class="hero-switch" href="#/eleve">Changer</a>
                <button type="button" class="hero-theme-btn" id="hero-theme-btn" data-action="sb-theme" data-theme-toggle="1" aria-label="{theme_lbl}" title="{theme_lbl}">
                  <span class="hero-theme-ico" data-theme-icon="1">{theme_ico}</span>
                </button>
              </div>
            </div>
            <h1 id="hi" data-greet="1" tabindex="-1">{greeting}</h1>
          </header>
          <nav class="tabs" id="nav-tabs" role="tablist" aria-label="Sections">
            <span class="morph-pill" aria-hidden="true"></span>
            {tabs_html}
          </nav>
          <section id="dash-panel" data-tab="{active_tab}">{panel_html}</section>
        </main>"##,
        cls_esc = esc(&cls_title),
    )
}

fn render_learn_tab(
    class_id: &str,
    class_doc: &Value,
    st: &DashboardState,
    store: &Store,
) -> String {
    let chapters = class_doc
        .get("chapters")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();

    let mut total_pct_sum: u64 = 0;
    let mut chapter_rows = String::new();

    for (idx, ch) in chapters.iter().enumerate() {
        let ch_id = ch.get("id").and_then(Value::as_str).unwrap_or("");
        let title = ch.get("title").and_then(Value::as_str).unwrap_or(ch_id);
        let revisions = ch.get("revisions").and_then(Value::as_array).cloned().unwrap_or_default();
        let quizzes = ch.get("quizzes").and_then(Value::as_array).cloned().unwrap_or_default();
        let has_exercises = ch.get("hasExercises").and_then(Value::as_bool).unwrap_or(true);

        let rev_pct = store.revision_pct(class_id, ch_id, None);
        let quiz_best = store.quiz_best_pct(class_id, ch_id);
        let quiz_ans = store.quiz_answered_pct(class_id, ch_id);
        let ex_done = store.count_exercises_done(class_id, ch_id);
        let (quiz_open, ex_open) = store.unlock_state(class_id, ch_id, title);

        let ex_total_est = if has_exercises {
            ch.get("exerciseCount")
                .and_then(Value::as_u64)
                .unwrap_or((ex_done as u64).max(4))
        } else {
            0
        };
        let mastery_res = json_engine::exercise::op_chapter_mastery(&json!({
            "hasRevision": !revisions.is_empty(),
            "hasQuiz": !quizzes.is_empty(),
            "exerciseTotal": ex_total_est,
            "revPct": rev_pct,
            "quizBestPct": quiz_best.unwrap_or(0),
            "quizAnsweredPct": quiz_ans,
            "quizSubmitted": quiz_best.is_some(),
            "exercises": store.chapter_exercises_map(class_id, ch_id),
        }));
        let mastery_rec = mastery_res
            .get("recommendation")
            .and_then(Value::as_str)
            .unwrap_or("");
        let has_started = rev_pct > 0 || quiz_best.is_some() || quiz_ans > 0 || ex_done > 0;

        let pct_res = json_engine::domain::op_chapter_pct(&json!({
            "revPct": rev_pct,
            "quizBest": quiz_best.unwrap_or(0),
            "exDone": ex_done,
            "hasQuiz": !quizzes.is_empty(),
            "hasEx": has_exercises
        }));
        let ch_pct = pct_res.get("pct").and_then(Value::as_u64).unwrap_or(rev_pct);
        total_pct_sum += ch_pct;

        let is_open = match st.open_chapter_id.as_deref() {
            Some("") => false,
            Some(open_id) => open_id == ch_id,
            None => idx == 0,
        };

        let mut steps_html = String::new();

        // 1. Revision sheets (toujours déverrouillées → cadenas ouvert)
        if let Some(first_rev) = revisions.first() {
            let r_path = first_rev.get("path").and_then(Value::as_str).unwrap_or("");
            let (st_attr, si_cls, cta_attr, cta_lbl, sub_txt) = if rev_pct >= 80 {
                ("d", "si u d", "d", "Relire", format!("Lu · {}", fmt_pct(rev_pct as f64)))
            } else if rev_pct > 0 {
                ("p", "si u p", "p", "Continuer", format!("En cours · {}", fmt_pct(rev_pct as f64)))
            } else {
                ("", "si u", "", "Lire", "Rappel actif".into())
            };
            steps_html.push_str(&format!(
                r##"<li class="stp" data-state="{st_attr}">
                  <span class="{si_cls}" aria-hidden="true">{ico}</span>
                  <span class="tx"><b>Fiche de cours</b><small>{sub_txt}</small></span>
                  <a class="stp-btn" data-cta="{cta_attr}" href="#/eleve/{cid}/revision/{chid}/{rpath}">{cta_lbl}</a>
                </li>"##,
                ico = icon("lock-open", 17, ""),
                cid = esc_attr(class_id),
                chid = esc_attr(ch_id),
                rpath = esc_attr(r_path),
            ));
            for (k, extra) in revisions.iter().enumerate().skip(1) {
                let ep = extra.get("path").and_then(Value::as_str).unwrap_or("");
                let et = extra.get("title").and_then(Value::as_str).unwrap_or("Complément");
                let epct = store.revision_pct(class_id, ch_id, Some(ep));
                let (ea, esi, ec, elbl) = if epct >= 80 {
                    ("d", "si u d", "d", "Relire")
                } else if epct > 0 {
                    ("p", "si u p", "p", "Continuer")
                } else {
                    ("", "si u", "", "Lire")
                };
                steps_html.push_str(&format!(
                    r##"<li class="stp" data-state="{ea}">
                      <span class="{esi}" aria-hidden="true">{ico}</span>
                      <span class="tx"><b>Fiche {} · {}</b><small>{}</small></span>
                      <a class="stp-btn" data-cta="{ec}" href="#/eleve/{cid}/revision/{chid}/{ep}">{elbl}</a>
                    </li>"##,
                    k + 1,
                    render_inline_title(et),
                    if epct > 0 { format!("Lu · {}", fmt_pct(epct as f64)) } else { "Complément".into() },
                    ico = icon("lock-open", 17, ""),
                    cid = esc_attr(class_id),
                    chid = esc_attr(ch_id),
                    ep = esc_attr(ep),
                ));
            }
        }

        // 2. Quizzes
        if let Some(first_qz) = quizzes.first() {
            let q_path = first_qz.get("path").and_then(Value::as_str).unwrap_or("");
            if quiz_open {
                let qb = quiz_best.unwrap_or(0);
                let (st_attr, si_cls, cta_attr, cta_lbl, sub_txt) = if qb >= 60 {
                    ("d", "si u d", "d", "Refaire", format!("Score {}", fmt_pct(qb as f64)))
                } else if quiz_best.is_some() {
                    ("p", "si u p", "p", "Améliorer", format!("Score {}", fmt_pct(qb as f64)))
                } else {
                    ("", "si u", "", "Démarrer", "Chronométré".into())
                };
                steps_html.push_str(&format!(
                    r##"<li class="stp" data-state="{st_attr}">
                      <span class="{si_cls}" aria-hidden="true">{ico}</span>
                      <span class="tx"><b>Quiz</b><small>{sub_txt}</small></span>
                      <a class="stp-btn" data-cta="{cta_attr}" href="#/eleve/{cid}/quiz/{chid}/{qpath}">{cta_lbl}</a>
                    </li>"##,
                    ico = icon("lock-open", 17, ""),
                    cid = esc_attr(class_id),
                    chid = esc_attr(ch_id),
                    qpath = esc_attr(q_path),
                ));
            } else {
                steps_html.push_str(&format!(
                    r##"<li class="stp l" aria-disabled="true" title="Lisez {QUIZ_UNLOCK_THRESHOLD}&nbsp;% du cours pour débloquer">
                      <span class="si l" aria-hidden="true">{lock}</span>
                      <span class="tx"><b>Quiz</b><small>Dès {QUIZ_UNLOCK_THRESHOLD}&nbsp;% du cours</small></span>
                      <span class="stp-lock-tag">Verrouillé</span>
                    </li>"##,
                    lock = icon("lock", 17, ""),
                ));
            }
        }

        // 3. Exercises
        if has_exercises {
            if ex_open {
                let (st_attr, si_cls, cta_attr, cta_lbl, sub_txt) = if ex_done > 0 {
                    ("d", "si u d", "d", "Continuer", format!("{ex_done} validé{}", if ex_done > 1 { "s" } else { "" }))
                } else {
                    ("", "si u", "", "Ouvrir", "Série corrigée".into())
                };
                steps_html.push_str(&format!(
                    r##"<li class="stp" data-state="{st_attr}">
                      <span class="{si_cls}" aria-hidden="true">{ico}</span>
                      <span class="tx"><b>Exercices</b><small>{sub_txt}</small></span>
                      <a class="stp-btn" data-cta="{cta_attr}" href="#/eleve/{cid}/exercices/{chid}">{cta_lbl}</a>
                    </li>"##,
                    ico = icon("lock-open", 17, ""),
                    cid = esc_attr(class_id),
                    chid = esc_attr(ch_id),
                ));
            } else {
                steps_html.push_str(&format!(
                    r##"<li class="stp l" aria-disabled="true" title="Complétez {EXERCISE_UNLOCK_THRESHOLD}&nbsp;% du quiz pour débloquer">
                      <span class="si l" aria-hidden="true">{lock}</span>
                      <span class="tx"><b>Exercices</b><small>Dès {EXERCISE_UNLOCK_THRESHOLD}&nbsp;% du quiz</small></span>
                      <span class="stp-lock-tag">Verrouillé</span>
                    </li>"##,
                    lock = icon("lock", 17, ""),
                ));
            }
        }

        let prog_attr = if ch_pct >= 100 {
            r#" data-prog="done""#
        } else if ch_pct > 0 {
            r#" data-prog="active""#
        } else {
            ""
        };

        let guide_html = if has_started && !mastery_rec.is_empty() {
            format!(r##"<p class="ch-guide">{}</p>"##, esc(mastery_rec))
        } else {
            String::new()
        };

        chapter_rows.push_str(&format!(
            r##"<li class="ch{open_cls}" data-ch-id="{chid}"{prog_attr}>
              <span class="node" style="--p:{ch_pct}"><span>{num}</span></span>
              <button type="button" class="head" data-action="dash-toggle-chapter" data-ch="{chid}" aria-expanded="{is_open}">
                <span>
                  <span class="ttl">{title_html}</span>
                </span>
                <span class="rside">
                  <span>{ch_pct}&nbsp;%</span>
                  {chev}
                </span>
              </button>
              <div class="panel"><div><ul class="steps">{steps_html}</ul>{guide_html}</div></div>
            </li>"##,
            open_cls = if is_open { " open" } else { "" },
            chid = esc_attr(ch_id),
            num = idx + 1,
            title_html = render_inline_title(title),
            chev = icon("chevron-down", 14, "chev"),
        ));
    }

    let avg_pct = if !chapters.is_empty() {
        total_pct_sum / chapters.len() as u64
    } else {
        0
    };

    if chapters.is_empty() {
        return format!(
            r##"<div class="empty">{}<div>Aucun chapitre publié.</div></div>"##,
            icon("book-open", 24, "")
        );
    }

    let ch_pl = if chapters.len() > 1 { "s" } else { "" };
    format!(
        r##"<div class="sec sec--prog">
            <h2>Programme</h2>
            <span id="total">{n} chapitre{ch_pl} · {avg_pct}&nbsp;%</span>
          </div>
          <ol class="path">{chapter_rows}</ol>"##,
        n = chapters.len(),
    )
}

/* ═══════════════════════════ PROBLÈMES (SMART FACET DOCK) ═══════════════════════════ */

fn clean_problem_subtitle(raw: &str) -> String {
    let s = raw.trim();
    if s.is_empty() {
        return String::new();
    }
    let lower = s.to_lowercase();
    if lower.starts_with("problème") || lower.starts_with("probleme") {
        if let Some(pos) = s.find("—").or_else(|| s.find("–")).or_else(|| s.find(" - ")) {
            let sep_len = if s[pos..].starts_with("—") {
                "—".len()
            } else if s[pos..].starts_with("–") {
                "–".len()
            } else {
                3
            };
            return s[pos + sep_len..].trim().to_string();
        }
    }
    s.to_string()
}

fn norm_difficulty(raw: &str) -> &'static str {
    let l = raw.trim().to_lowercase();
    if l.starts_with("facil") || l == "easy" || l == "1" {
        "facile"
    } else if l.starts_with("diffic") || l == "hard" || l == "3" || l.starts_with("avanc") {
        "difficile"
    } else if l.starts_with("moy") || l == "medium" || l == "2" {
        "moyen"
    } else {
        ""
    }
}

fn diff_display(code: &str) -> &'static str {
    match code {
        "facile" => "Facile",
        "moyen" => "Moyen",
        "difficile" => "Difficile",
        _ => "",
    }
}

pub fn render_problems_view(
    class_id: &str,
    problems_doc: Option<&Value>,
    st: &DashboardState,
    store: &Store,
) -> String {
    let list = problems_doc
        .and_then(|d| d.get("problemes").or_else(|| d.get("problems")))
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    if list.is_empty() {
        return format!(r##"<div class="empty">{}<div>Aucun problème publié.</div></div>"##, icon("compass", 22, ""));
    }

    // Build theme map & order
    let mut theme_labels: BTreeMap<String, String> = BTreeMap::new();
    let mut theme_order: Vec<String> = Vec::new();
    if let Some(arr) = problems_doc.and_then(|d| d.get("themes")).and_then(Value::as_array) {
        for t in arr {
            if let Some(id) = t.get("id").and_then(Value::as_str) {
                let name = t.get("name").and_then(Value::as_str).unwrap_or(id);
                theme_labels.insert(id.to_string(), name.to_string());
                theme_order.push(id.to_string());
            }
        }
    }
    if theme_order.is_empty() {
        let themes_val = json_engine::domain::op_problem_themes(&json!({ "problems": list }));
        if let Some(arr) = themes_val.get("themes").and_then(Value::as_array) {
            for v in arr {
                if let Some(s) = v.as_str() {
                    theme_labels.insert(s.to_string(), s.to_string());
                    theme_order.push(s.to_string());
                }
            }
        }
    }

    // Analyze available difficulties & progress across list
    let mut present_diffs: BTreeSet<&'static str> = BTreeSet::new();
    let mut any_started = false;
    for p in &list {
        let d = norm_difficulty(p.get("difficulty").and_then(Value::as_str).unwrap_or(""));
        if !d.is_empty() {
            present_diffs.insert(d);
        }
        let path = p.get("path").and_then(Value::as_str).unwrap_or("");
        if store.revision_pct(class_id, "problemes", Some(path)) > 0 {
            any_started = true;
        }
    }

    // Count matches per theme under active difficulty & status
    let matches_lens = |p: &Value| -> bool {
        if !st.prob_diff.is_empty() {
            let d = norm_difficulty(p.get("difficulty").and_then(Value::as_str).unwrap_or(""));
            if d != st.prob_diff {
                return false;
            }
        }
        if !st.prob_status.is_empty() {
            let path = p.get("path").and_then(Value::as_str).unwrap_or("");
            let pct = store.revision_pct(class_id, "problemes", Some(path));
            if st.prob_status == "unread" && pct > 0 {
                return false;
            }
            if st.prob_status == "started" && pct == 0 {
                return false;
            }
        }
        true
    };

    let mut theme_counts: BTreeMap<String, usize> = BTreeMap::new();
    let mut lens_total = 0usize;
    for p in &list {
        if matches_lens(p) {
            lens_total += 1;
            let tid = p.get("theme").and_then(Value::as_str).unwrap_or("");
            if !tid.is_empty() {
                *theme_counts.entry(tid.to_string()).or_insert(0) += 1;
            }
        }
    }

    // Build difficulty + progress lens row (only when >1 difficulty exists or student started reading)
    let mut lens_btns = String::new();
    if present_diffs.len() > 1 || any_started {
        lens_btns.push_str(&format!(
            r##"<button type="button" class="ef-btn" data-action="prob-diff" data-diff="" aria-pressed="{sel}">Tous</button>"##,
            sel = st.prob_diff.is_empty() && st.prob_status.is_empty(),
        ));
        for code in ["facile", "moyen", "difficile"] {
            if present_diffs.contains(code) {
                let cnt = list
                    .iter()
                    .filter(|p| {
                        let ok_t = st.prob_theme.is_empty()
                            || p.get("theme").and_then(Value::as_str).unwrap_or("") == st.prob_theme;
                        ok_t && norm_difficulty(p.get("difficulty").and_then(Value::as_str).unwrap_or("")) == code
                    })
                    .count();
                lens_btns.push_str(&format!(
                    r##"<button type="button" class="ef-btn{dim}" data-action="prob-diff" data-diff="{code}" aria-pressed="{sel}">{lbl} <em class="flt-cnt">{cnt}</em></button>"##,
                    dim = if cnt == 0 && st.prob_diff != code { " is-dim" } else { "" },
                    sel = st.prob_diff == code,
                    lbl = diff_display(code),
                ));
            }
        }
        if any_started {
            lens_btns.push_str(&format!(
                r##"<button type="button" class="ef-btn" data-action="prob-status" data-status="unread" aria-pressed="{sel}">Non lus</button>"##,
                sel = st.prob_status == "unread",
            ));
        }
    }

    // Build theme ribbon
    let mut theme_chips = format!(
        r##"<button type="button" class="flt-chip" data-action="prob-theme" data-theme="" aria-pressed="{sel}">Tous <em class="flt-cnt">{lens_total}</em></button>"##,
        sel = st.prob_theme.is_empty(),
    );
    for th_id in &theme_order {
        let cnt = *theme_counts.get(th_id).unwrap_or(&0);
        // Hide themes with 0 total problems in the catalog
        let catalog_cnt = list
            .iter()
            .filter(|p| p.get("theme").and_then(Value::as_str).unwrap_or("") == th_id)
            .count();
        if catalog_cnt == 0 {
            continue;
        }
        let lbl = theme_labels.get(th_id).map(|s| s.as_str()).unwrap_or(th_id);
        theme_chips.push_str(&format!(
            r##"<button type="button" class="flt-chip{dim}" data-action="prob-theme" data-theme="{ta}" aria-pressed="{sel}">{te} <em class="flt-cnt">{cnt}</em></button>"##,
            dim = if cnt == 0 && st.prob_theme != *th_id { " is-dim" } else { "" },
            ta = esc_attr(th_id),
            sel = st.prob_theme == *th_id,
            te = esc(lbl),
        ));
    }

    let (results_html, shown) = render_problems_results_counted(class_id, problems_doc, st, store);
    let has_active = !st.prob_theme.is_empty() || !st.prob_diff.is_empty() || !st.prob_status.is_empty();
    let total = list.len();
    let count_lbl = if has_active {
        format!(
            r##"<button type="button" class="flt-reset" data-action="prob-reset" title="Tout afficher">{shown}/{total} · ×</button>"##
        )
    } else {
        format!(r##"<span class="flt-total">{total}</span>"##)
    };

    let top_row = if !lens_btns.is_empty() {
        format!(
            r##"<div class="flt-row">
              <div class="exam-filters" role="group" aria-label="Niveau">{lens_btns}<span class="ef-morph-pill" aria-hidden="true"></span></div>
              <div class="flt-meta">{count_lbl}</div>
            </div>"##
        )
    } else {
        String::new()
    };

    format!(
        r##"<div class="flt-dock">
            {top_row}
            <div class="flt-rail" role="group" aria-label="Thèmes">
              {theme_chips}
              {inline_meta}
            </div>
          </div>
          <div id="prob-results">{results_html}</div>"##,
        inline_meta = if lens_btns.is_empty() {
            format!(r##"<span class="flt-rail__meta">{count_lbl}</span>"##)
        } else {
            String::new()
        },
    )
}

fn render_problems_tab(class_id: &str, problems_doc: Option<&Value>, st: &DashboardState, store: &Store) -> String {
    format!(r##"<div id="prob-view">{}</div>"##, render_problems_view(class_id, problems_doc, st, store))
}

fn render_problems_results_counted(
    class_id: &str,
    problems_doc: Option<&Value>,
    st: &DashboardState,
    store: &Store,
) -> (String, usize) {
    let list = problems_doc
        .and_then(|d| d.get("problemes").or_else(|| d.get("problems")))
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    let mut theme_labels: BTreeMap<String, String> = BTreeMap::new();
    if let Some(arr) = problems_doc.and_then(|d| d.get("themes")).and_then(Value::as_array) {
        for t in arr {
            if let Some(id) = t.get("id").and_then(Value::as_str) {
                let name = t.get("name").and_then(Value::as_str).unwrap_or(id);
                theme_labels.insert(id.to_string(), name.to_string());
            }
        }
    }

    let mut rows = String::new();
    let mut shown = 0usize;
    for p in &list {
        let raw_title = p.get("title").and_then(Value::as_str).unwrap_or("");
        let stripped = json_engine::domain::op_problem_strip_prefix(&json!({ "title": raw_title }));
        let clean_title = stripped.get("title").and_then(Value::as_str).unwrap_or(raw_title);
        let theme_id = p.get("theme").and_then(Value::as_str).unwrap_or("");
        let theme_name = theme_labels.get(theme_id).map(|s| s.as_str()).unwrap_or(theme_id);
        let raw_sub = p.get("subtitle").and_then(Value::as_str).unwrap_or("");
        let clean_sub = clean_problem_subtitle(raw_sub);
        let diff_code = norm_difficulty(p.get("difficulty").and_then(Value::as_str).unwrap_or(""));
        let path = p.get("path").and_then(Value::as_str).unwrap_or("");
        let pct = store.revision_pct(class_id, "problemes", Some(path));

        if !st.prob_theme.is_empty() && theme_id != st.prob_theme {
            continue;
        }
        if !st.prob_diff.is_empty() && diff_code != st.prob_diff {
            continue;
        }
        if st.prob_status == "unread" && pct > 0 {
            continue;
        }
        if st.prob_status == "started" && pct == 0 {
            continue;
        }
        shown += 1;

        let mut meta_parts: Vec<String> = Vec::new();
        if !theme_name.is_empty() {
            meta_parts.push(esc(theme_name));
        }
        if !clean_sub.is_empty() && clean_sub.to_lowercase() != theme_name.to_lowercase() {
            meta_parts.push(render_inline_title(&clean_sub));
        }
        if !diff_code.is_empty() {
            meta_parts.push(diff_display(diff_code).to_string());
        }
        if pct > 0 {
            meta_parts.push(format!("{pct}&nbsp;%"));
        }
        let sub_html = if !meta_parts.is_empty() {
            format!(r##"<span class="clean-it__s">{}</span>"##, meta_parts.join(" · "))
        } else {
            String::new()
        };
        rows.push_str(&format!(
            r##"<li>
              <a class="clean-it" href="#/eleve/{cid}/revision/problemes/{path_attr}">
                <div class="clean-it__main">
                  <span class="clean-it__t">{title_html}</span>
                  {sub_html}
                </div>
                <span class="clean-it__ch">{chev}</span>
              </a>
            </li>"##,
            cid = esc_attr(class_id),
            path_attr = esc_attr(path),
            title_html = render_inline_title(clean_title),
            chev = icon("chevron-right", 14, ""),
        ));
    }

    let html = if shown == 0 {
        r##"<div class="empty"><div>Aucun problème pour cette sélection.</div><button type="button" class="flt-reset" data-action="prob-reset">Tout afficher</button></div>"##.into()
    } else {
        format!(r##"<ul class="clean-lst">{rows}</ul>"##)
    };
    (html, shown)
}

pub fn render_problems_results(
    class_id: &str,
    problems_doc: Option<&Value>,
    st: &DashboardState,
    store: &Store,
) -> String {
    render_problems_results_counted(class_id, problems_doc, st, store).0
}

/* ═══════════════════════════ EXAMENS NATIONAUX ═══════════════════════════ */

fn capitalize_word(s: &str) -> String {
    let mut ch = s.chars();
    match ch.next() {
        Some(first) => first.to_uppercase().collect::<String>() + ch.as_str(),
        None => String::new(),
    }
}

fn canonical_doc_key(path: &str) -> &str {
    let s = path.trim().trim_start_matches('/');
    s.strip_prefix("public/").unwrap_or(s)
}

pub fn exam_themes_list(
    exams_doc: Option<&Value>,
    exam_docs: &BTreeMap<String, Value>,
) -> Vec<(String, String)> {
    let list = exams_doc
        .and_then(|d| d.get("examens").or_else(|| d.get("exams")))
        .and_then(Value::as_array);
    let total_exams = list.map(|a| a.len()).unwrap_or(0);
    let loaded_exams: Vec<&Value> = list
        .map(|a| {
            a.iter()
                .filter_map(|ex| ex.get("path").and_then(Value::as_str))
                .filter_map(|p| exam_docs.get(canonical_doc_key(p)))
                .collect()
        })
        .unwrap_or_default();
    let all_loaded = total_exams > 0 && loaded_exams.len() == total_exams;

    let dist = exams_doc
        .and_then(|d| d.get("themeDistribution"))
        .and_then(Value::as_object)
        .filter(|m| !m.is_empty());

    let mut out = Vec::new();
    if let Some(arr) = exams_doc.and_then(|d| d.get("themes")).and_then(Value::as_array) {
        for t in arr {
            let Some(id) = t.get("id").and_then(Value::as_str).filter(|s| !s.is_empty()) else {
                continue;
            };
            let name = t.get("name").and_then(Value::as_str).unwrap_or(id);
            if all_loaded {
                let matches_any = loaded_exams.iter().any(|doc| {
                    doc.get("exercises")
                        .and_then(Value::as_array)
                        .map(|exs| exs.iter().any(|e| e.get("theme").and_then(Value::as_str) == Some(id)))
                        .unwrap_or(false)
                });
                if !matches_any {
                    continue;
                }
            } else if let Some(d) = dist {
                let cnt = d.get(id).and_then(Value::as_u64).unwrap_or(0);
                if cnt == 0 {
                    continue;
                }
            }
            out.push((id.to_string(), name.to_string()));
        }
    }

    if out.is_empty() && !loaded_exams.is_empty() {
        let mut seen = BTreeMap::new();
        for doc in loaded_exams {
            if let Some(exs) = doc.get("exercises").and_then(Value::as_array) {
                for e in exs {
                    if let Some(tid) = e.get("theme").and_then(Value::as_str).filter(|s| !s.is_empty()) {
                        seen.entry(tid.to_string())
                            .or_insert_with(|| capitalize_word(&tid.replace('-', " ")));
                    }
                }
            }
        }
        out = seen.into_iter().collect();
    }
    out
}

fn exam_years_list(exams_doc: Option<&Value>) -> Vec<String> {
    let list = exams_doc
        .and_then(|d| d.get("examens").or_else(|| d.get("exams")))
        .and_then(Value::as_array);
    let mut years: Vec<u64> = Vec::new();
    if let Some(arr) = list {
        for ex in arr {
            if let Some(y) = ex.get("year").and_then(Value::as_u64) {
                if !years.contains(&y) {
                    years.push(y);
                }
            }
        }
    }
    years.sort_by(|a, b| b.cmp(a));
    years.into_iter().map(|y| y.to_string()).collect()
}

pub fn render_exams_subbar(
    exams_doc: Option<&Value>,
    exam_docs: &BTreeMap<String, Value>,
    st: &DashboardState,
) -> String {
    match st.exam_filter.as_str() {
        "year" => {
            let years = exam_years_list(exams_doc);
            if years.is_empty() {
                return String::new();
            }
            let mut ticks = format!(
                r##"<button type="button" class="flt-yr" data-action="exam-year" data-year="" aria-pressed="{sel}">Toutes</button>"##,
                sel = st.exam_year.is_empty(),
            );
            for y in &years {
                ticks.push_str(&format!(
                    r##"<button type="button" class="flt-yr" data-action="exam-year" data-year="{ya}" aria-pressed="{sel}">{ye}</button>"##,
                    ya = esc_attr(y),
                    sel = st.exam_year == *y,
                    ye = esc(y),
                ));
            }
            format!(r##"<div class="flt-timeline" role="group" aria-label="Année">{ticks}</div>"##)
        }
        "themes" => {
            let themes = exam_themes_list(exams_doc, exam_docs);
            if themes.is_empty() {
                return String::new();
            }
            let mut chips = format!(
                r##"<button type="button" class="flt-chip" data-action="exam-theme" data-theme="" aria-pressed="{sel}">Tous</button>"##,
                sel = st.exam_theme.is_empty(),
            );
            for (tid, tname) in &themes {
                chips.push_str(&format!(
                    r##"<button type="button" class="flt-chip" data-action="exam-theme" data-theme="{ta}" aria-pressed="{sel}">{te}</button>"##,
                    ta = esc_attr(tid),
                    sel = st.exam_theme == *tid,
                    te = esc(tname),
                ));
            }
            format!(r##"<div class="flt-rail" role="group" aria-label="Thème">{chips}</div>"##)
        }
        "" => {
            // Subtle session micro-filter when both normale & rattrapage exist
            let list = exams_doc
                .and_then(|d| d.get("examens").or_else(|| d.get("exams")))
                .and_then(Value::as_array);
            let mut has_norm = false;
            let mut has_ratt = false;
            if let Some(arr) = list {
                for ex in arr {
                    let s = ex.get("session").and_then(Value::as_str).unwrap_or("").to_lowercase();
                    if s.contains("normale") { has_norm = true; }
                    if s.contains("rattrapage") { has_ratt = true; }
                }
            }
            if !(has_norm && has_ratt) {
                return String::new();
            }
            format!(
                r##"<div class="flt-rail" role="group" aria-label="Session">
                  <button type="button" class="flt-chip" data-action="exam-session" data-session="" aria-pressed="{s0}">Toutes sessions</button>
                  <button type="button" class="flt-chip" data-action="exam-session" data-session="normale" aria-pressed="{s1}">Normale</button>
                  <button type="button" class="flt-chip" data-action="exam-session" data-session="rattrapage" aria-pressed="{s2}">Rattrapage</button>
                </div>"##,
                s0 = st.exam_session.is_empty(),
                s1 = st.exam_session == "normale",
                s2 = st.exam_session == "rattrapage",
            )
        }
        _ => String::new(),
    }
}

fn sorted_exams_list(exams_doc: Option<&Value>) -> Vec<Value> {
    let mut list = exams_doc
        .and_then(|d| d.get("examens").or_else(|| d.get("exams")))
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    list.sort_by(|a, b| {
        let ya = a.get("year").and_then(Value::as_u64).unwrap_or(0);
        let yb = b.get("year").and_then(Value::as_u64).unwrap_or(0);
        let sa = match a.get("session").and_then(Value::as_str).unwrap_or("").to_lowercase().as_str() {
            s if s.contains("rattrapage") => 2u8,
            s if s.contains("normale") => 1u8,
            _ => 0u8,
        };
        let sb = match b.get("session").and_then(Value::as_str).unwrap_or("").to_lowercase().as_str() {
            s if s.contains("rattrapage") => 2u8,
            s if s.contains("normale") => 1u8,
            _ => 0u8,
        };
        yb.cmp(&ya).then_with(|| sb.cmp(&sa))
    });
    list
}

fn render_exam_row(
    class_id: &str,
    ex: &Value,
    exam_docs: &BTreeMap<String, Value>,
    st: &DashboardState,
    sim_mode: bool,
) -> Option<String> {
    let year = ex.get("year").and_then(Value::as_u64).map(|y| y.to_string()).unwrap_or_default();
    let session = ex.get("session").and_then(Value::as_str).unwrap_or("");
    let path = ex.get("path").and_then(Value::as_str).unwrap_or("");
    let duration = ex.get("duration").and_then(Value::as_u64).unwrap_or(0);
    let ex_count = ex.get("exerciseCount").and_then(Value::as_u64).unwrap_or(0);
    let doc = exam_docs.get(canonical_doc_key(path));

    if st.exam_filter == "year" && !st.exam_year.is_empty() && year != st.exam_year {
        return None;
    }
    if !st.exam_session.is_empty() && !session.to_lowercase().contains(&st.exam_session) {
        return None;
    }
    if sim_mode && !session.is_empty() && !session.to_lowercase().contains("normale") {
        return None;
    }

    let mut theme_match_lbl = String::new();
    let active_theme = if st.exam_filter == "themes" { st.exam_theme.as_str() } else { "" };
    if !active_theme.is_empty() {
        if let Some(d) = doc {
            let matching: Vec<&Value> = d
                .get("exercises")
                .and_then(Value::as_array)
                .map(|exs| {
                    exs.iter()
                        .filter(|e| e.get("theme").and_then(Value::as_str) == Some(active_theme))
                        .collect()
                })
                .unwrap_or_default();
            if matching.is_empty() {
                return None;
            }
            if matching.len() == 1 {
                let e = matching[0];
                let num = e.get("number").and_then(Value::as_u64).unwrap_or(1);
                let topic = e.get("topic").and_then(Value::as_str).unwrap_or("").trim();
                theme_match_lbl = if !topic.is_empty() {
                    format!("Ex. {num} · {topic}")
                } else {
                    format!("Ex. {num}")
                };
            } else {
                theme_match_lbl = format!("{} ex.", matching.len());
            }
        }
    }

    let sess_lbl = if !session.is_empty() {
        let lower = session.to_lowercase();
        if lower.starts_with("session") {
            capitalize_word(&lower)
        } else {
            format!("Session {lower}")
        }
    } else {
        ex.get("title").and_then(Value::as_str).unwrap_or("National").to_string()
    };

    let head_title = if sim_mode {
        format!("Simulation · {}", esc(&sess_lbl))
    } else {
        esc(&sess_lbl)
    };

    let dur_lbl = if sim_mode {
        let mins = doc
            .and_then(|d| d.get("duration").and_then(Value::as_u64))
            .unwrap_or(if duration > 0 { duration } else { 240 });
        format!("{} h", (mins + 30) / 60)
    } else {
        String::new()
    };
    let ex_lbl = if !theme_match_lbl.is_empty() {
        theme_match_lbl
    } else if ex_count > 0 {
        format!("{ex_count} ex.")
    } else {
        String::new()
    };
    let meta = [dur_lbl, ex_lbl]
        .into_iter()
        .filter(|s| !s.is_empty())
        .collect::<Vec<_>>()
        .join(" · ");

    let yr_html = if !year.is_empty() {
        format!(r##"<span class="idx-yr">{}</span>"##, esc(&year))
    } else {
        String::new()
    };
    let meta_html = if !meta.is_empty() {
        format!(r##"<span class="idx-meta">{}</span>"##, esc(&meta))
    } else {
        String::new()
    };

    let href = if active_theme.is_empty() {
        format!("#/eleve/{}/examen/{}", esc_attr(class_id), esc_attr(path))
    } else {
        format!(
            "#/eleve/{}/examen/{}?theme={}",
            esc_attr(class_id),
            esc_attr(path),
            url_encode(active_theme)
        )
    };

    Some(format!(
        r##"<li>
          <a class="clean-it idx-row" href="{href}">
            {yr_html}
            <span class="clean-it__t">{head_title}</span>
            {meta_html}
            <span class="clean-it__ch">{chev}</span>
          </a>
        </li>"##,
        chev = icon("chevron-right", 14, ""),
    ))
}

pub fn render_exams_results(
    class_id: &str,
    exams_doc: Option<&Value>,
    exam_docs: &BTreeMap<String, Value>,
    st: &DashboardState,
) -> String {
    let list = sorted_exams_list(exams_doc);
    if list.is_empty() {
        return format!(r##"<div class="empty">{}<div>Aucun examen publié.</div></div>"##, icon("file", 22, ""));
    }

    if st.exam_filter == "year" && st.exam_year.is_empty() {
        let mut by_year: BTreeMap<u64, String> = BTreeMap::new();
        for ex in &list {
            let y = ex.get("year").and_then(Value::as_u64).unwrap_or(0);
            if let Some(row) = render_exam_row(class_id, ex, exam_docs, st, false) {
                by_year.entry(y).or_default().push_str(&row);
            }
        }
        if by_year.is_empty() {
            return r##"<div class="empty"><div>Aucun examen trouvé.</div></div>"##.into();
        }
        let mut out = String::new();
        for (y, rows) in by_year.into_iter().rev() {
            if y > 0 {
                out.push_str(&format!(r##"<div class="cc-sec-hd">{y}</div>"##));
            }
            out.push_str(&format!(r##"<ul class="clean-lst">{rows}</ul>"##));
        }
        return out;
    }

    let sim_mode = st.exam_filter == "simulations";
    let mut rows = String::new();
    let mut shown = 0usize;
    for ex in &list {
        if let Some(row) = render_exam_row(class_id, ex, exam_docs, st, sim_mode) {
            shown += 1;
            rows.push_str(&row);
        }
    }

    if shown == 0 {
        r##"<div class="empty"><div>Aucun examen trouvé.</div></div>"##.into()
    } else {
        format!(r##"<ul class="clean-lst">{rows}</ul>"##)
    }
}

fn render_exams_tab(
    class_id: &str,
    exams_doc: Option<&Value>,
    exam_docs: &BTreeMap<String, Value>,
    has_cadre: bool,
    _cadre: Option<&Value>,
    st: &DashboardState,
    _store: &Store,
) -> String {
    let list = exams_doc
        .and_then(|d| d.get("examens").or_else(|| d.get("exams")))
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    if list.is_empty() {
        return format!(r##"<div class="empty">{}<div>Aucun examen publié.</div></div>"##, icon("file", 22, ""));
    }

    let cadre_link = if has_cadre {
        format!(
            r##"<a class="cadre-link" href="#/eleve/{cid}/cadre">Cadre ↗</a>"##,
            cid = esc_attr(class_id),
        )
    } else {
        String::new()
    };

    let subbar_html = render_exams_subbar(exams_doc, exam_docs, st);
    let results_html = render_exams_results(class_id, exams_doc, exam_docs, st);

    format!(
        r##"<div class="flt-dock">
            <div class="flt-row">
              <div class="exam-filters" role="group" aria-label="Vue">
                <span class="ef-morph-pill" aria-hidden="true"></span>
                <button type="button" class="ef-btn" data-action="exam-filter" data-filter="" aria-pressed="{f_all}">Tous</button>
                <button type="button" class="ef-btn" data-action="exam-filter" data-filter="year" aria-pressed="{f_year}">Années</button>
                <button type="button" class="ef-btn" data-action="exam-filter" data-filter="themes" aria-pressed="{f_thm}">Thèmes</button>
                <button type="button" class="ef-btn" data-action="exam-filter" data-filter="simulations" aria-pressed="{f_sim}">Simulations</button>
              </div>
              <div class="flt-meta">{cadre_link}</div>
            </div>
            <div id="exam-subbar">{subbar_html}</div>
          </div>
          <div id="exam-results">{results_html}</div>"##,
        f_all = st.exam_filter.is_empty(),
        f_year = st.exam_filter == "year",
        f_thm = st.exam_filter == "themes",
        f_sim = st.exam_filter == "simulations",
    )
}

/* ═══════════════════════════ OLYMPIADES (CHRONO-RIBBON SMART FACET) ═══════════════════════════ */

fn format_olympiad_short_title(raw: &str, badge: &str, year: &str) -> String {
    let lower = raw.to_lowercase();
    if lower.contains("(imo)") || lower.contains("internationale de mathématiques") || lower.contains("international mathematical") {
        return "IMO · Internationale".into();
    }
    if lower.contains("marocaine") {
        return "Olympiade Marocaine".into();
    }
    // Generic clean fallback: strip trailing "— Sujet officiel" / "— Épreuve nationale" and redundant year
    let mut s = raw
        .split("—")
        .next()
        .unwrap_or(raw)
        .split("–")
        .next()
        .unwrap_or(raw)
        .trim()
        .to_string();
    if !year.is_empty() {
        s = s.replace(year, "").trim().to_string();
    }
    if s.is_empty() {
        if !badge.is_empty() {
            format!("Olympiade · {}", capitalize_word(badge))
        } else {
            "Olympiade".into()
        }
    } else {
        s
    }
}

fn item_year_str(item: &Value) -> String {
    item.get("year")
        .and_then(|v| v.as_u64().map(|y| y.to_string()).or_else(|| v.as_str().map(|s| s.to_string())))
        .unwrap_or_default()
}

fn item_scope_str(item: &Value) -> String {
    item.get("badge")
        .or_else(|| item.get("stage"))
        .or_else(|| item.get("phase"))
        .and_then(Value::as_str)
        .unwrap_or("")
        .trim()
        .to_lowercase()
}

pub fn render_olympiads_view(class_id: &str, oly_doc: Option<&Value>, st: &DashboardState) -> String {
    let mut list = oly_doc
        .and_then(|d| d.get("items").or_else(|| d.get("olympiads")))
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    if list.is_empty() {
        return format!(r##"<div class="empty">{}<div>Aucun sujet publié.</div></div>"##, icon("sparkles", 22, ""));
    }

    // Sort chronologically: newest first by default, or oldest first when st.oly_asc == true
    list.sort_by(|a, b| {
        let ya = item_year_str(a).parse::<u64>().unwrap_or(0);
        let yb = item_year_str(b).parse::<u64>().unwrap_or(0);
        if st.oly_asc { ya.cmp(&yb) } else { yb.cmp(&ya) }
    });

    // Collect distinct scopes (e.g., national, international) and years
    let mut scopes_order: Vec<String> = Vec::new();
    let mut scope_counts: BTreeMap<String, usize> = BTreeMap::new();
    let mut all_years: Vec<String> = Vec::new();
    let mut matching_years: BTreeSet<String> = BTreeSet::new();

    for item in &list {
        let sc = item_scope_str(item);
        let yr = item_year_str(item);
        if !sc.is_empty() {
            if !scopes_order.contains(&sc) {
                scopes_order.push(sc.clone());
            }
            if st.oly_year.is_empty() || yr == st.oly_year {
                *scope_counts.entry(sc.clone()).or_insert(0) += 1;
            }
        }
        if !yr.is_empty() && !all_years.contains(&yr) {
            all_years.push(yr.clone());
        }
        if st.oly_scope.is_empty() || sc == st.oly_scope {
            if !yr.is_empty() {
                matching_years.insert(yr);
            }
        }
    }

    // Put "national" before "international" for predictable order
    scopes_order.sort_by(|a, b| {
        let rank = |s: &str| match s {
            "regional" | "régional" => 0,
            "national" => 1,
            "international" => 2,
            _ => 3,
        };
        rank(a).cmp(&rank(b)).then_with(|| a.cmp(b))
    });

    // Build scope segmented buttons
    let total = list.len();
    let mut scope_btns = format!(
        r##"<button type="button" class="ef-btn" data-action="oly-scope" data-scope="" aria-pressed="{sel}">Toutes <em class="flt-cnt">{total}</em></button>"##,
        sel = st.oly_scope.is_empty(),
    );
    for sc in &scopes_order {
        let cnt = *scope_counts.get(sc).unwrap_or(&0);
        scope_btns.push_str(&format!(
            r##"<button type="button" class="ef-btn{dim}" data-action="oly-scope" data-scope="{sa}" aria-pressed="{sel}">{sl} <em class="flt-cnt">{cnt}</em></button>"##,
            dim = if cnt == 0 && st.oly_scope != *sc { " is-dim" } else { "" },
            sa = esc_attr(sc),
            sel = st.oly_scope == *sc,
            sl = esc(&capitalize_word(sc)),
        ));
    }

    // Build Chrono-Ribbon timeline (dims years unavailable under current scope!)
    let mut year_ticks = format!(
        r##"<button type="button" class="flt-yr" data-action="oly-year" data-year="" aria-pressed="{sel}">Tout</button>"##,
        sel = st.oly_year.is_empty(),
    );
    for yr in &all_years {
        let avail = matching_years.contains(yr);
        let active = st.oly_year == *yr;
        let cls = if !avail && !active { "flt-yr is-dim" } else { "flt-yr" };
        let dis = if !avail && !active { " disabled" } else { "" };
        year_ticks.push_str(&format!(
            r##"<button type="button" class="{cls}" data-action="oly-year" data-year="{ya}" aria-pressed="{active}"{dis}>{ye}</button>"##,
            ya = esc_attr(yr),
            ye = esc(yr),
        ));
    }

    let (results_html, shown) = render_olympiads_results_counted(class_id, &list, st);
    let has_active = !st.oly_scope.is_empty() || !st.oly_year.is_empty();
    let sort_lbl = if st.oly_asc { "↑ Ancien" } else { "↓ Récent" };
    let reset_html = if has_active {
        format!(
            r##"<button type="button" class="flt-reset" data-action="oly-reset" title="Réinitialiser">{shown}/{total} · ×</button>"##
        )
    } else {
        String::new()
    };

    format!(
        r##"<div class="flt-dock">
            <div class="flt-row">
              <div class="exam-filters" role="group" aria-label="Épreuve">
                <span class="ef-morph-pill" aria-hidden="true"></span>
                {scope_btns}
              </div>
              <div class="flt-meta">
                {reset_html}
                <button type="button" class="flt-sort" data-action="oly-sort" title="Inverser l’ordre chronologique">{sort_lbl}</button>
              </div>
            </div>
            <div class="flt-timeline" role="group" aria-label="Années">{year_ticks}</div>
          </div>
          <div id="oly-results">{results_html}</div>"##,
    )
}

fn render_olympiads_results_counted(
    class_id: &str,
    sorted_list: &[Value],
    st: &DashboardState,
) -> (String, usize) {
    let mut rows = String::new();
    let mut shown = 0usize;
    for item in sorted_list {
        let raw_title = item.get("title").and_then(Value::as_str).unwrap_or("Olympiade");
        let year = item_year_str(item);
        let scope = item_scope_str(item);
        let path = item.get("path").and_then(Value::as_str).unwrap_or("");
        let ex_count = item.get("exerciseCount").and_then(Value::as_u64).unwrap_or(0);
        let dur = item.get("duration").and_then(Value::as_u64).unwrap_or(0);

        if !st.oly_scope.is_empty() && scope != st.oly_scope {
            continue;
        }
        if !st.oly_year.is_empty() && year != st.oly_year {
            continue;
        }
        shown += 1;

        let short_title = format_olympiad_short_title(raw_title, &scope, &year);
        let meta_parts: Vec<String> = [
            if dur > 0 { format!("{} h", (dur + 30) / 60) } else { String::new() },
            if ex_count > 0 { format!("{ex_count} ex.") } else { String::new() },
        ]
        .into_iter()
        .filter(|s| !s.is_empty())
        .collect();

        let yr_html = if !year.is_empty() {
            format!(r##"<span class="idx-yr">{}</span>"##, esc(&year))
        } else {
            String::new()
        };
        let meta_html = if !meta_parts.is_empty() {
            format!(r##"<span class="idx-meta">{}</span>"##, esc(&meta_parts.join(" · ")))
        } else {
            String::new()
        };

        rows.push_str(&format!(
            r##"<li>
              <a class="clean-it idx-row" href="#/eleve/{cid}/examen/{path_attr}">
                {yr_html}
                <span class="clean-it__t">{title_html}</span>
                {meta_html}
                <span class="clean-it__ch">{chev}</span>
              </a>
            </li>"##,
            cid = esc_attr(class_id),
            path_attr = esc_attr(path),
            title_html = render_inline_title(&short_title),
            chev = icon("chevron-right", 14, ""),
        ));
    }

    let html = if shown == 0 {
        r##"<div class="empty"><div>Aucun sujet pour cette sélection.</div><button type="button" class="flt-reset" data-action="oly-reset">Tout afficher</button></div>"##.into()
    } else {
        format!(r##"<ul class="clean-lst">{rows}</ul>"##)
    };
    (html, shown)
}

pub fn render_olympiads_results(class_id: &str, oly_doc: Option<&Value>, st: &DashboardState) -> String {
    let mut list = oly_doc
        .and_then(|d| d.get("items").or_else(|| d.get("olympiads")))
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    if list.is_empty() {
        return format!(r##"<div class="empty">{}<div>Aucun sujet publié.</div></div>"##, icon("sparkles", 22, ""));
    }
    list.sort_by(|a, b| {
        let ya = item_year_str(a).parse::<u64>().unwrap_or(0);
        let yb = item_year_str(b).parse::<u64>().unwrap_or(0);
        if st.oly_asc { ya.cmp(&yb) } else { yb.cmp(&ya) }
    });
    render_olympiads_results_counted(class_id, &list, st).0
}

fn render_olympiads_tab(class_id: &str, oly_doc: Option<&Value>, st: &DashboardState) -> String {
    format!(r##"<div id="oly-view">{}</div>"##, render_olympiads_view(class_id, oly_doc, st))
}

/* ═══════════════════════════ CONCOURS (SLEEK DUAL-RAIL) ═══════════════════════════ */

#[derive(Clone)]
struct ConcoursSchoolMeta {
    id: String,
    tab_label: String,
    questions_per_exam: u64,
    annales: Vec<ConcoursItem>,
    themes: Vec<ConcoursThemeItem>,
}

#[derive(Clone)]
struct ConcoursItem {
    label: String,
    path: String,
    count: u64,
}

#[derive(Clone)]
struct ConcoursThemeItem {
    id: String,
    name: String,
    total_count: u64,
    quiz_path: Option<String>,
    quiz_count: u64,
}

fn collect_concours_schools(data: &DashboardData) -> Vec<ConcoursSchoolMeta> {
    let base_list = data
        .concours_schools
        .and_then(|d| d.get("schools"))
        .and_then(Value::as_array)
        .or_else(|| {
            data.concours
                .and_then(|d| d.get("concours").or_else(|| d.get("schools")))
                .and_then(Value::as_array)
        })
        .cloned()
        .unwrap_or_default();

    let mut out = Vec::new();
    for s in base_list {
        let sid = s.get("id").and_then(Value::as_str).unwrap_or("").to_string();
        if sid.is_empty() {
            continue;
        }
        let manifest = data
            .concours_manifests
            .iter()
            .find(|(id, _)| *id == sid)
            .map(|(_, v)| v);

        let raw_name = manifest
            .and_then(|m| m.get("name").and_then(Value::as_str))
            .or_else(|| s.get("name").and_then(Value::as_str))
            .unwrap_or(&sid);
        let tab_label = if sid == "medecine" || raw_name.contains("Médecine") {
            "Médecine".to_string()
        } else {
            raw_name.to_string()
        };
        let questions_per_exam = manifest
            .and_then(|m| m.get("questionsPerExam").and_then(Value::as_u64))
            .or_else(|| s.get("questionsPerExam").and_then(Value::as_u64))
            .filter(|&n| n > 0)
            .unwrap_or(30);

        let mut theme_names: BTreeMap<String, String> = BTreeMap::new();
        let mut theme_order: Vec<String> = Vec::new();
        if let Some(themes) = s.get("themes").and_then(Value::as_array) {
            for t in themes {
                if let Some(tid) = t.get("id").and_then(Value::as_str).filter(|v| !v.is_empty()) {
                    let tname = t.get("name").and_then(Value::as_str).unwrap_or(tid);
                    theme_names.insert(tid.to_string(), tname.to_string());
                    theme_order.push(tid.to_string());
                }
            }
        }
        let theme_counts = s.get("themeCounts").and_then(Value::as_object);

        let annales_arr = manifest
            .and_then(|m| m.get("annales").and_then(Value::as_array))
            .or_else(|| s.get("annales").and_then(Value::as_array))
            .cloned()
            .unwrap_or_default();
        let mut annales = Vec::new();
        for a in annales_arr {
            let count = a
                .get("questionsCount")
                .or_else(|| a.get("count"))
                .and_then(Value::as_u64)
                .unwrap_or(0);
            let path = a.get("path").and_then(Value::as_str).unwrap_or("").to_string();
            let label = a
                .get("year")
                .and_then(|v| v.as_str().map(|s| s.to_string()).or_else(|| v.as_u64().map(|n| n.to_string())))
                .or_else(|| a.get("title").and_then(Value::as_str).map(|s| s.to_string()))
                .unwrap_or_default();
            if count > 0 && !path.is_empty() && !label.is_empty() {
                annales.push(ConcoursItem { label, path, count });
            }
        }

        let mut quiz_by_theme: BTreeMap<String, (String, String, u64)> = BTreeMap::new();
        if let Some(q_arr) = manifest.and_then(|m| m.get("quizzes").and_then(Value::as_array)) {
            for q in q_arr {
                let count = q
                    .get("questionsCount")
                    .or_else(|| q.get("count"))
                    .and_then(Value::as_u64)
                    .unwrap_or(0);
                let path = q.get("path").and_then(Value::as_str).unwrap_or("").to_string();
                let theme_id = q.get("theme").and_then(Value::as_str).unwrap_or("").to_string();
                let title = q
                    .get("title")
                    .and_then(Value::as_str)
                    .map(|s| s.to_string())
                    .or_else(|| theme_names.get(&theme_id).cloned())
                    .unwrap_or_else(|| theme_id.clone());
                if count > 0 && !path.is_empty() && !theme_id.is_empty() {
                    if !theme_names.contains_key(&theme_id) {
                        theme_names.insert(theme_id.clone(), title.clone());
                        theme_order.push(theme_id.clone());
                    }
                    quiz_by_theme.insert(theme_id, (title, path, count));
                }
            }
        } else if let Some(fb_arr) = s.get("fallbackQuizPaths").and_then(Value::as_array) {
            for q in fb_arr {
                let path = q.get("path").and_then(Value::as_str).unwrap_or("").to_string();
                let theme_id = q.get("themeId").and_then(Value::as_str).unwrap_or("").to_string();
                let title = theme_names.get(&theme_id).cloned().unwrap_or_else(|| theme_id.clone());
                if !path.is_empty() && !theme_id.is_empty() {
                    if !theme_names.contains_key(&theme_id) {
                        theme_names.insert(theme_id.clone(), title.clone());
                        theme_order.push(theme_id.clone());
                    }
                    quiz_by_theme.insert(theme_id, (title, path, 0));
                }
            }
        }

        let mut themes = Vec::new();
        for tid in theme_order {
            let total_count = theme_counts
                .and_then(|m| m.get(&tid))
                .and_then(Value::as_u64)
                .unwrap_or(0);
            let quiz_info = quiz_by_theme.get(&tid);
            let quiz_count = quiz_info.map(|(_, _, c)| *c).unwrap_or(0);
            let quiz_path = quiz_info.map(|(_, p, _)| p.clone());
            if total_count == 0 && quiz_path.is_none() {
                continue;
            }
            let name = quiz_info
                .map(|(t, _, _)| t.clone())
                .or_else(|| theme_names.get(&tid).cloned())
                .unwrap_or_else(|| tid.clone());
            themes.push(ConcoursThemeItem {
                id: tid,
                name,
                total_count,
                quiz_path,
                quiz_count,
            });
        }

        annales.sort_by(|a, b| {
            let ya = a.label.chars().take(4).collect::<String>().parse::<u32>().unwrap_or(0);
            let yb = b.label.chars().take(4).collect::<String>().parse::<u32>().unwrap_or(0);
            yb.cmp(&ya)
        });

        out.push(ConcoursSchoolMeta {
            id: sid,
            tab_label,
            questions_per_exam,
            annales,
            themes,
        });
    }
    out
}

pub fn active_concours_school_id<'a>(data: &DashboardData, st: &DashboardState) -> String {
    let schools = collect_concours_schools(data);
    if !st.conc_school.is_empty() && schools.iter().any(|s| s.id == st.conc_school) {
        st.conc_school.clone()
    } else {
        schools.first().map(|s| s.id.clone()).unwrap_or_else(|| "ensa".into())
    }
}

pub fn render_concours_results(data: &DashboardData, st: &DashboardState) -> String {
    let class_id = data.class_id;
    let schools = collect_concours_schools(data);
    let active_sid = active_concours_school_id(data, st);
    let Some(school) = schools.into_iter().find(|s| s.id == active_sid) else {
        return String::new();
    };

    let show_sim = st.conc_kind.is_empty() || st.conc_kind == "simulation";
    let show_annales = st.conc_kind.is_empty() || st.conc_kind == "annales";
    let show_themes = st.conc_kind.is_empty() || st.conc_kind == "themes";

    let mut rows = String::new();
    let mut shown = 0usize;

    if show_sim {
        shown += 1;
        let sim_href = format!(
            "#/eleve/{}/concours/{}?mode=simulation",
            esc_attr(class_id),
            url_encode(&school.id),
        );
        rows.push_str(&format!(
            r##"<li>
              <a class="clean-it idx-row" href="{sim_href}">
                <span class="clean-it__t">Simulation complète</span>
                <span class="idx-meta">Chrono · {qpe} q.</span>
                <span class="clean-it__ch">{chev}</span>
              </a>
            </li>"##,
            qpe = school.questions_per_exam,
            chev = icon("chevron-right", 14, ""),
        ));
    }

    if show_annales {
        for a in &school.annales {
            shown += 1;
            let href = format!(
                "#/eleve/{}/concours/{}?mode=simulation&path={}",
                esc_attr(class_id),
                url_encode(&school.id),
                url_encode(&a.path),
            );
            let title_lbl = if a.label.to_lowercase().starts_with("session") {
                a.label.clone()
            } else {
                format!("Session {}", a.label)
            };
            rows.push_str(&format!(
                r##"<li>
                  <a class="clean-it idx-row" href="{href}">
                    <span class="clean-it__t">{title}</span>
                    <span class="idx-meta">{cnt} q.</span>
                    <span class="clean-it__ch">{chev}</span>
                  </a>
                </li>"##,
                title = esc(&title_lbl),
                cnt = a.count,
                chev = icon("chevron-right", 14, ""),
            ));
        }
    }

    if show_themes {
        for t in &school.themes {
            if !st.conc_theme.is_empty() && t.id != st.conc_theme {
                continue;
            }
            shown += 1;
            let raw_count = if t.total_count > 0 { t.total_count } else { t.quiz_count };
            let count = if school.questions_per_exam > 0 && raw_count > 0 {
                raw_count.min(school.questions_per_exam)
            } else {
                raw_count
            };
            let href = if t.total_count > 0 || t.quiz_path.is_none() {
                format!(
                    "#/eleve/{}/concours/{}?mode=training&theme={}",
                    esc_attr(class_id),
                    url_encode(&school.id),
                    url_encode(&t.id),
                )
            } else {
                format!(
                    "#/eleve/{}/concours/{}?mode=training&path={}",
                    esc_attr(class_id),
                    url_encode(&school.id),
                    url_encode(t.quiz_path.as_deref().unwrap_or("")),
                )
            };
            let meta_html = if count > 0 {
                format!(r##"<span class="idx-meta">{count} q.</span>"##)
            } else {
                String::new()
            };
            rows.push_str(&format!(
                r##"<li>
                  <a class="clean-it idx-row" href="{href}">
                    <span class="clean-it__t">{title}</span>
                    {meta_html}
                    <span class="clean-it__ch">{chev}</span>
                  </a>
                </li>"##,
                title = esc(&t.name),
                chev = icon("chevron-right", 14, ""),
            ));
        }
    }

    if shown == 0 {
        r##"<div class="empty"><div>Aucun sujet disponible.</div></div>"##.into()
    } else {
        format!(r##"<ul class="clean-lst">{rows}</ul>"##)
    }
}

pub fn render_concours_body(data: &DashboardData, st: &DashboardState, _store: &Store) -> String {
    let results_html = render_concours_results(data, st);
    format!(r##"<div id="conc-results">{results_html}</div>"##)
}

fn render_concours_tab(data: &DashboardData, st: &DashboardState, store: &Store) -> String {
    let schools = collect_concours_schools(data);
    if schools.is_empty() {
        return format!(r##"<div class="empty">{}<div>Aucun concours configuré.</div></div>"##, icon("target", 22, ""));
    }
    let active_sid = active_concours_school_id(data, st);

    let school_btns: String = schools
        .iter()
        .map(|s| {
            format!(
                r##"<button type="button" class="cc-school-tab" data-action="conc-school" data-school="{sid}" aria-selected="{sel}">{lbl}</button>"##,
                sid = esc_attr(&s.id),
                sel = s.id == active_sid,
                lbl = esc(&s.tab_label),
            )
        })
        .collect();

    let body_html = render_concours_body(data, st, store);

    format!(
        r##"<div class="flt-dock">
            <div class="flt-row">
              <div class="cc-school-tabs" id="cc-school-tabs" role="tablist" aria-label="École">
                <span class="cc-school-pill" aria-hidden="true"></span>
                {school_btns}
              </div>
              <div class="cc-filters" role="group" aria-label="Mode">
                <span class="cc-morph-pill" aria-hidden="true"></span>
                <button type="button" class="cc-fbtn" data-action="conc-kind" data-kind="" aria-pressed="{k_all}">Tous</button>
                <button type="button" class="cc-fbtn" data-action="conc-kind" data-kind="annales" aria-pressed="{k_ann}">Annales</button>
                <button type="button" class="cc-fbtn" data-action="conc-kind" data-kind="themes" aria-pressed="{k_thm}">Thèmes</button>
                <button type="button" class="cc-fbtn" data-action="conc-kind" data-kind="simulation" aria-pressed="{k_sim}">Simulation</button>
              </div>
            </div>
          </div>
          <div id="conc-body" class="cc-body" data-school="{active_sid}">{body_html}</div>"##,
        k_all = st.conc_kind.is_empty(),
        k_ann = st.conc_kind == "annales",
        k_thm = st.conc_kind == "themes",
        k_sim = st.conc_kind == "simulation",
        active_sid = esc_attr(&active_sid),
    )
}

/* ═══════════════════════════ CADRE RÉFÉRENTIEL (MASTERY LENS) ═══════════════════════════ */

fn count_cadre_skills(cadre: Option<&Value>) -> usize {
    let Some(doc) = cadre else { return 0 };
    if let Some(secs) = doc.get("sections").and_then(Value::as_array) {
        return secs.iter().filter(|s| s["category"].as_str() == Some("method")).count();
    }
    let mut n = 0;
    if let Some(domains) = doc.get("domains").or_else(|| doc.get("domaines")).and_then(Value::as_array) {
        for d in domains {
            if let Some(chs) = d.get("chapters").or_else(|| d.get("chapitres")).and_then(Value::as_array) {
                for ch in chs {
                    if let Some(sk) = ch.get("skills").or_else(|| ch.get("competences")).and_then(Value::as_array) {
                        n += sk.len();
                    }
                }
            } else if let Some(sk) = d.get("skills").or_else(|| d.get("competences")).and_then(Value::as_array) {
                n += sk.len();
            }
        }
    }
    n
}

pub fn render_cadre_view(class_id: &str, cadre: Option<&Value>, st: &DashboardState, store: &Store) -> String {
    let Some(doc) = cadre else {
        return format!(
            r##"<main class="page-main"><div class="empty">{}<div>Cadre référentiel indisponible.</div><a class="btn sm" href="#/eleve/{}">Retour</a></div></main>"##,
            icon("target", 22, ""),
            esc_attr(class_id)
        );
    };

    let total_skills = count_cadre_skills(Some(doc));
    let mastered = store.mastered_count(class_id);
    let remaining = total_skills.saturating_sub(mastered);
    let pct = if total_skills > 0 { (mastered * 100) / total_skills } else { 0 };

    // Parse flat `sections` format (category: domain | subdomain | method)
    let mut grouped: Vec<(String, Vec<(String, Vec<(String, String)>)>)> = Vec::new();
    if let Some(secs) = doc.get("sections").and_then(Value::as_array) {
        for (i, item) in secs.iter().enumerate() {
            let cat = item["category"].as_str().unwrap_or("");
            let id = item["id"].as_str().map(|s| s.to_string()).unwrap_or_else(|| format!("sk-{i}"));
            let txt = item["title"].as_str().unwrap_or("").to_string();
            match cat {
                "domain" => {
                    grouped.push((txt, Vec::new()));
                }
                "subdomain" => {
                    if grouped.is_empty() {
                        grouped.push(("Programme".into(), Vec::new()));
                    }
                    grouped.last_mut().unwrap().1.push((txt, Vec::new()));
                }
                "method" => {
                    if grouped.is_empty() {
                        grouped.push(("Programme".into(), Vec::new()));
                    }
                    let subs = &mut grouped.last_mut().unwrap().1;
                    if subs.is_empty() {
                        subs.push(("Compétences".into(), Vec::new()));
                    }
                    subs.last_mut().unwrap().1.push((id, txt));
                }
                _ => {}
            }
        }
    }

    // Domain chips with live mastery fraction
    let mut domain_chips = format!(
        r##"<button type="button" class="flt-chip" data-action="cadre-domain" data-domain="" aria-pressed="{}">Tous</button>"##,
        st.cadre_domain.is_empty()
    );
    for (dom_title, subs) in &grouped {
        let mut d_tot = 0usize;
        let mut d_done = 0usize;
        for (_, skills) in subs {
            for (sk_id, _) in skills {
                d_tot += 1;
                if store.is_skill_mastered(class_id, sk_id) {
                    d_done += 1;
                }
            }
        }
        domain_chips.push_str(&format!(
            r##"<button type="button" class="flt-chip" data-action="cadre-domain" data-domain="{da}" aria-pressed="{sel}">{de} <em class="flt-cnt">{d_done}/{d_tot}</em></button>"##,
            da = esc_attr(dom_title),
            sel = st.cadre_domain == *dom_title,
            de = esc(dom_title),
        ));
    }

    let mut sections_html = String::new();
    for (dom_title, subs) in &grouped {
        if !st.cadre_domain.is_empty() && st.cadre_domain != *dom_title {
            continue;
        }
        let mut subs_html = String::new();
        for (sub_title, skills) in subs {
            let mut done_in_sub = 0usize;
            let mut skills_html = String::new();
            let mut visible_in_sub = 0usize;
            for (sk_id, sk_txt) in skills {
                let done = store.is_skill_mastered(class_id, sk_id);
                if st.cadre_status == "todo" && done {
                    continue;
                }
                if st.cadre_status == "done" && !done {
                    continue;
                }
                visible_in_sub += 1;
                if done { done_in_sub += 1; }
                skills_html.push_str(&format!(
                    r##"<button type="button" class="cadre-skill{dcls}" data-action="cadre-toggle" data-skill="{sid}" aria-pressed="{done}">
                      <span class="cadre-skill__txt">{txt}</span>
                      <span class="cadre-skill__box" aria-hidden="true">✓</span>
                    </button>"##,
                    dcls = if done { " is-done" } else { "" },
                    sid = esc_attr(sk_id),
                    txt = render_math_inline(sk_txt),
                ));
            }
            if visible_in_sub > 0 {
                let complete_cls = if done_in_sub == visible_in_sub { " is-complete" } else { "" };
                subs_html.push_str(&format!(
                    r##"<div class="cadre-sub{complete_cls}">
                      <div class="cadre-sub__hd">
                        <h3 class="cadre-sub__title"><i class="cadre-sub__dot" aria-hidden="true"></i>{}</h3>
                        <span class="cadre-sub__cnt">{done_in_sub}/{visible_in_sub}</span>
                      </div>
                      <div class="cadre-sub__rail">{skills_html}</div>
                    </div>"##,
                    render_inline_title(sub_title),
                ));
            }
        }
        if !subs_html.is_empty() {
            sections_html.push_str(&format!(
                r##"<h2 class="cadre-domain">{}</h2>{subs_html}"##,
                render_inline_title(dom_title),
            ));
        }
    }

    if sections_html.is_empty() {
        sections_html = r##"<div class="empty"><div>Aucune compétence dans cette vue.</div><button type="button" class="flt-reset" data-action="cadre-reset">Tout afficher</button></div>"##.into();
    }

    let done_banner = if total_skills > 0 && mastered >= total_skills {
        r##"<div class="cadre-done-banner"><strong>Bravo !</strong> Cadre référentiel entièrement maîtrisé.</div>"##
    } else {
        ""
    };

    format!(
        r##"<main class="page-main" id="cadre-page">
          <div class="top">
            <a class="back" href="#/eleve/{cid}">{ico_back} Programme</a>
            <span class="cnt">{mastered} / {total_skills} · {pct}%</span>
          </div>
          <div class="bar"><i style="width:{pct}%"></i></div>
          <header class="hero-header hero-header--compact">
            <p class="hero-kicker">{cls_esc}</p>
            <h1 tabindex="-1">Cadre référentiel</h1>
          </header>
          <div class="flt-dock">
            <div class="flt-row">
              <div class="exam-filters" role="group" aria-label="Maîtrise">
                <span class="ef-morph-pill" aria-hidden="true"></span>
                <button type="button" class="ef-btn" data-action="cadre-status" data-status="" aria-pressed="{s_all}">Tout <em class="flt-cnt">{total_skills}</em></button>
                <button type="button" class="ef-btn" data-action="cadre-status" data-status="todo" aria-pressed="{s_todo}">À revoir <em class="flt-cnt">{remaining}</em></button>
                <button type="button" class="ef-btn" data-action="cadre-status" data-status="done" aria-pressed="{s_done}">Maîtrisé <em class="flt-cnt">{mastered}</em></button>
              </div>
            </div>
            <div class="flt-rail" role="group" aria-label="Domaines">{domain_chips}</div>
          </div>
          <div>{sections_html}</div>
          {done_banner}
        </main>"##,
        cid = esc_attr(class_id),
        ico_back = icon("chevron-left", 15, ""),
        cls_esc = esc(&format_class_name(class_id)),
        s_all = st.cadre_status.is_empty(),
        s_todo = st.cadre_status == "todo",
        s_done = st.cadre_status == "done",
    )
}
