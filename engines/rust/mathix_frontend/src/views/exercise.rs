//! Exercise List, Exercise Detail, and Exam/Olympiad Detail views (Cahier Seyès).

use std::collections::BTreeSet;
use serde_json::{json, Value};

use crate::html::{dir_of_path, esc, esc_attr, fmt_time, icon, render_difficulty_stars, url_encode};
use crate::math_html::{
    render_inline_title, render_math, render_structured_solution, wrap_with_media,
};
use crate::store::Store;

#[derive(Clone, Debug, Default)]
pub struct ExerciseState {
    pub elapsed_sec: u64,
    pub timer_paused: bool,
    pub open_hints: BTreeSet<String>,
    pub open_sols: BTreeSet<String>,
    pub active_exam_idx: usize,
    pub pending_eval_idx: usize,
}

fn eval_label(code: &str) -> (&'static str, &'static str) {
    match code {
        "easy" => ("Facile", "easy"),
        "hard" => ("Difficile", "hard"),
        _ => ("Correct", "medium"),
    }
}

fn validate_label(evaluated: Option<&str>) -> String {
    match evaluated {
        Some(code) => format!("✓ {}", eval_label(code).0),
        None => "Valider l’exercice".into(),
    }
}

fn render_exercise_parts(
    questions: &[Value],
    done: bool,
    uid_prefix: &str,
    base_dir: &str,
    root_prefix: &str,
    st: &ExerciseState,
) -> String {
    let mut parts_html = String::new();
    // Group flat or hierarchical questions cleanly
    let has_parts = questions.iter().any(|q| q.get("subQuestions").and_then(Value::as_array).is_some() || q.get("questions").and_then(Value::as_array).is_some());

    let groups: Vec<(Option<&str>, Vec<&Value>)> = if has_parts {
        questions
            .iter()
            .map(|p| {
                let p_title = p.get("title").or_else(|| p.get("part")).or_else(|| p.get("label")).and_then(Value::as_str);
                let sub = p
                    .get("subQuestions")
                    .or_else(|| p.get("questions"))
                    .and_then(Value::as_array)
                    .map(|a| a.iter().collect())
                    .unwrap_or_else(|| vec![p]);
                (p_title, sub)
            })
            .collect()
    } else {
        vec![(None, questions.iter().collect())]
    };

    for (pi, (p_title, qs)) in groups.iter().enumerate() {
        let mut qs_html = String::new();
        for (qi, sq) in qs.iter().enumerate() {
            let q_id = format!("{uid_prefix}-p{pi}-q{qi}");
            let hint_id = format!("{q_id}-hint");
            let sol_id = format!("{q_id}-sol");

            let q_num = sq
                .get("number")
                .or_else(|| sq.get("label"))
                .and_then(|v| v.as_str().map(|s| s.to_string()).or_else(|| v.as_u64().map(|n| format!("{n}."))))
                .unwrap_or_else(|| format!("{}.", qi + 1));

            let content = sq
                .get("content")
                .or_else(|| sq.get("question"))
                .or_else(|| sq.get("statement"))
                .or_else(|| sq.get("prompt"))
                .and_then(Value::as_str)
                .unwrap_or("");
            let pts = sq.get("points").and_then(|v| {
                v.as_f64().map(|f| if f.fract() == 0.0 { format!("{} pt{}", f as i64, if f > 1.0 { "s" } else { "" }) } else { format!("{f} pts") })
                    .or_else(|| v.as_str().map(|s| s.to_string()))
            });
            let hint = sq.get("hint").or_else(|| sq.get("indication")).and_then(Value::as_str).filter(|s| !s.trim().is_empty());
            let corr = sq.get("correction").or_else(|| sq.get("solution")).and_then(Value::as_str).filter(|s| !s.trim().is_empty());

            let media = &sq["media"];
            let q_body = wrap_with_media(media, &render_math(content), "default", "exercise", base_dir, root_prefix);

            let pts_badge = pts.map(|p| format!(r##"<span class="exo-q-pts">{}</span>"##, esc(&p))).unwrap_or_default();

            let hint_open = st.open_hints.contains(&hint_id);
            let sol_open = done || st.open_sols.contains(&sol_id);

            let mut acts = String::new();
            if hint.is_some() {
                acts.push_str(&format!(
                    r##"<button type="button" class="exo-idx" data-action="exo-toggle-hint" data-target="{hint_id}" aria-expanded="{hint_open}" aria-controls="{hint_id}">Indice</button>"##
                ));
            }
            if corr.is_some() {
                acts.push_str(&format!(
                    r##"<button type="button" class="exo-sol-btn" data-action="exo-toggle-sol" data-target="{sol_id}" aria-expanded="{sol_open}" aria-controls="{sol_id}">Corrigé</button>"##
                ));
            }
            let has_acts = !acts.is_empty();
            let acts_html = if has_acts {
                format!(r##"<div class="exo-q-actions no-print">{acts}</div>"##)
            } else {
                String::new()
            };

            let hint_html = match hint {
                Some(h) => format!(
                    r##"<div class="exo-hint" id="{hint_id}"{}>{}</div>"##,
                    if hint_open { "" } else { " hidden" },
                    if hint_open { render_math(h) } else { String::new() }
                ),
                None => String::new(),
            };

            let sol_html = match corr {
                Some(c) => format!(
                    r##"<div class="exo-sol-panel" id="{sol_id}"{}><div class="sol-slot app-steps-list">{}</div></div>"##,
                    if sol_open { "" } else { " hidden" },
                    if sol_open { render_structured_solution(c) } else { String::new() }
                ),
                None => String::new(),
            };

            let q_cls = if has_acts { "exo-q" } else { "exo-q no-actions" };
            let _ = &q_num;
            qs_html.push_str(&format!(
                r##"<li class="{q_cls}">
                  <div class="exo-qt">{q_body}{pts_badge}</div>
                  {acts_html}
                  {hint_html}
                  {sol_html}
                </li>"##,
            ));
        }

        let part_hd = match p_title {
            Some(t) if !t.trim().is_empty() => format!(r##"<div class="exo-part-divider"><span class="exo-part-pill">{}</span></div>"##, render_inline_title(t)),
            _ => String::new(),
        };
        let qs_cls = if qs.len() <= 1 { "exo-qs solo" } else { "exo-qs" };
        parts_html.push_str(&format!(
            r##"<li class="exo-part">{part_hd}<ol class="{qs_cls}">{qs_html}</ol></li>"##
        ));
    }

    parts_html
}

fn exercise_card_subtitle(ex: &Value) -> Option<String> {
    for key in ["title", "topic", "theme", "subtitle"] {
        if let Some(raw) = ex[key].as_str() {
            let trimmed = raw.trim();
            if !trimmed.is_empty() && !trimmed.to_lowercase().starts_with("exercice ") {
                return Some(render_inline_title(trimmed));
            }
        }
    }
    let id = ex["id"].as_str().unwrap_or("").to_lowercase();
    for year in 2010..=2030u32 {
        let y = year.to_string();
        if id.contains(&y) {
            if id.contains("rattrapage") || id.contains("ratt") {
                return Some(format!("Bac {y} · Rattrapage"));
            }
            if id.contains("normale") || id.contains("norm") {
                return Some(format!("Bac {y} · Normale"));
            }
            return Some(format!("Bac {y}"));
        }
    }
    None
}

pub fn render_exercise_list(
    class_id: &str,
    chapter_id: &str,
    chapter_title: &str,
    manifest: &Value,
    store: &Store,
    is_dark: bool,
) -> String {
    let exercises = manifest["exercises"].as_array().cloned().unwrap_or_default();
    let clean_ch = math_engine::analyze::plain_title(chapter_title);

    let mut done_count = 0usize;
    let mut hard_count = 0usize;
    let mut first_pending: Option<usize> = None;
    let mut first_hard: Option<usize> = None;
    let mut rows = String::new();

    for (i, ex) in exercises.iter().enumerate() {
        let ex_id = ex["id"].as_str().unwrap_or("");
        let ex_path = ex["path"].as_str().unwrap_or("");
        let saved = store.get_exercise(class_id, chapter_id, ex_id);
        let ev_code = saved.and_then(|s| s["evaluated"].as_str());
        let is_done = ev_code.is_some();
        if is_done {
            done_count += 1;
            if ev_code == Some("hard") {
                hard_count += 1;
                if first_hard.is_none() {
                    first_hard = Some(i);
                }
            }
        } else if first_pending.is_none() {
            first_pending = Some(i);
        }

        let outline = json_engine::exercise::op_exercise_outline(ex, &json!({ "path": ex_path }));
        let q_count = outline["questionCount"].as_u64().unwrap_or(0);
        let est_min = outline["estimatedMinutes"].as_u64().unwrap_or(0);
        let q_lbl = match (q_count > 0, est_min > 0) {
            (true, true) => format!("{q_count} question{} · ~{est_min} min", if q_count > 1 { "s" } else { "" }),
            (true, false) => format!("{q_count} question{}", if q_count > 1 { "s" } else { "" }),
            (false, true) => format!("~{est_min} min"),
            (false, false) => String::new(),
        };
        let sub_span = exercise_card_subtitle(ex)
            .map(|t| format!(r##"<span class="exo-series-title">{t}</span>"##))
            .unwrap_or_default();
        let stars_html = render_difficulty_stars(
            ex["difficulty"].as_str(),
            outline["difficultyStars"].as_u64(),
            outline["difficultyLabel"].as_str(),
        );
        let ex_num = ex["number"].as_u64().unwrap_or((i + 1) as u64);
        let (stamp_cls, stamp_txt) = if let Some(code) = ev_code {
            let (lbl, cls) = eval_label(code);
            (format!(" is-{cls}"), format!("✓ {lbl}"))
        } else if saved.and_then(|s| s["correctionsViewed"].as_bool()).unwrap_or(false) {
            (String::new(), "Corrigé vu".into())
        } else {
            (String::new(), "À faire".into())
        };
        let q_span = if q_lbl.is_empty() {
            String::new()
        } else {
            format!(r##"<span class="exo-series-qcount">{q_lbl}</span>"##)
        };
        let body_inner = format!("{sub_span}{q_span}{stars_html}");

        rows.push_str(&format!(
            r##"<a class="exo-series-item{done_cls}" role="listitem" href="#/eleve/{cid}/exercices/{chid}?ex={ex_enc}" data-ex-idx="{i}">
              <span class="exo-series-lead">
                <span class="exo-title-badge exo-title-badge--mini{done_cls}">
                  <span class="exo-badge-label"><i class="exo-badge-dot" aria-hidden="true"></i>Exercice</span>
                  <span class="exo-badge-num">{ex_num:02}</span>
                </span>
              </span>
              <span class="exo-series-body">{body_inner}</span>
              <span class="exo-series-meta">
                <span class="exo-stamp{stamp_cls}">{stamp_txt}</span>
                <span class="exo-series-arrow" aria-hidden="true">{chev}</span>
              </span>
            </a>"##,
            done_cls = if is_done { " is-done" } else { "" },
            cid = esc_attr(class_id),
            chid = esc_attr(chapter_id),
            ex_enc = url_encode(ex_path),
            chev = icon("chevron-right", 16, ""),
        ));
    }

    let total = exercises.len();
    let all_done = total > 0 && done_count == total;
    let ratio = if total > 0 { done_count as f64 / total as f64 } else { 0.0 };
    let resume_idx = if all_done && hard_count > 0 {
        first_hard.unwrap_or(0)
    } else {
        first_pending.unwrap_or(0)
    };
    let resume_path = exercises.get(resume_idx).and_then(|e| e["path"].as_str()).unwrap_or("");
    let resume_lbl = if done_count == 0 {
        "Commencer la série".into()
    } else if all_done && hard_count > 0 {
        format!("Retravailler les difficiles ({hard_count})")
    } else if all_done {
        "Revoir la série".into()
    } else {
        format!("Continuer (Ex. {})", resume_idx + 1)
    };

    let body = if total > 0 {
        format!(
            r##"<div class="exo-series-list" id="ex-list" role="list">{rows}</div>
            <footer class="exo-foot exo-foot--end no-print">
              <a class="exo-val exo-ico" aria-pressed="{all_done}" href="#/eleve/{cid}/exercices/{chid}?ex={r_enc}">{resume_lbl}</a>
            </footer>"##,
            cid = esc_attr(class_id),
            chid = esc_attr(chapter_id),
            r_enc = url_encode(resume_path),
        )
    } else {
        format!(r##"<div class="empty">{}<div>Aucun exercice publié pour ce chapitre.</div></div>"##, icon("calculator", 26, ""))
    };

    format!(
        r##"<main class="page-main page-main--exo" id="exo">
          <header class="exo-bar is-single no-print">
            <div class="exo-bar__in">
              <a class="exo-ib" href="#/eleve/{cid}" aria-label="Retour au programme" title="Retour">{ico_back}</a>
              <span class="exo-chrono exo-ico{done_cls}">{chrono_txt}</span>
              <button type="button" class="exo-ib exo-ib--print" data-action="exo-print" title="Imprimer" aria-label="Imprimer">{ico_print}</button>
              <button type="button" class="exo-ib" data-action="toggle-theme" data-theme-toggle="1" title="{th_lbl}" aria-label="{th_lbl}"><span data-theme-icon="1">{ico_theme}</span></button>
            </div>
            <div id="exo-prog" style="transform:scaleX({ratio:.3})"></div>
          </header>

          <div class="exo-sheets">
            <section class="exo-sheet exo-sheet--list{sheet_done}">
              <header class="exo-sheet-head exo-sheet-head--list">
                <span class="exo-title-badge exo-title-badge--series">
                  <span class="exo-badge-label"><i class="exo-badge-dot" aria-hidden="true"></i>Série</span>
                  <span class="exo-badge-num">{total:02}</span>
                </span>
                {done_chip}
              </header>
              <h1 class="exo-title exo-title--list" tabindex="-1" id="ex-ch-title" data-plain-title="{clean_attr}">{title_html}</h1>
              {body}
            </section>
          </div>
        </main>"##,
        cid = esc_attr(class_id),
        ico_back = icon("chevron-left", 16, ""),
        done_cls = if all_done { " is-done" } else { "" },
        chrono_txt = if total > 0 {
            format!("{done_count} / {total} validé{}", if done_count > 1 { "s" } else { "" })
        } else {
            "Série d’exercices".into()
        },
        ico_print = icon("print", 16, ""),
        th_lbl = if is_dark { "Mode clair (Maj+D)" } else { "Mode sombre (Maj+D)" },
        ico_theme = icon(if is_dark { "sun" } else { "moon" }, 16, ""),
        sheet_done = if all_done { " done" } else { "" },
        done_chip = if done_count > 0 {
            format!(r##"<span class="exo-done-chip">{done_count} / {total} validé{}</span>"##, if done_count > 1 { "s" } else { "" })
        } else {
            String::new()
        },
        clean_attr = esc_attr(&clean_ch),
        title_html = render_inline_title(chapter_title),
    )
}

pub fn render_exercise_detail(
    class_id: &str,
    chapter_id: &str,
    ex_path: &str,
    exercise: &Value,
    manifest: &Value,
    st: &ExerciseState,
    store: &Store,
    is_dark: bool,
    root_prefix: &str,
) -> String {
    let all_ex = manifest["exercises"].as_array().cloned().unwrap_or_default();
    let cur_idx = all_ex.iter().position(|it| it["path"].as_str() == Some(ex_path));
    let ex_id = exercise["id"].as_str().unwrap_or(ex_path);
    let ex_num = exercise["number"].as_u64().unwrap_or(cur_idx.map(|i| (i + 1) as u64).unwrap_or(1));
    let saved = store.get_exercise(class_id, chapter_id, ex_id);
    let ev_code = saved.and_then(|s| s["evaluated"].as_str());
    let done = ev_code.is_some();
    let saved_dur = saved.and_then(|s| s["durationSec"].as_u64()).unwrap_or(0);

    let outline = json_engine::exercise::op_exercise_outline(exercise, &json!({ "path": ex_path }));
    let diff_html = render_difficulty_stars(
        exercise["difficulty"].as_str(),
        outline["difficultyStars"].as_u64(),
        outline["difficultyLabel"].as_str(),
    );
    let base_dir = dir_of_path(ex_path);

    let tabs_html = if all_ex.len() > 1 {
        let items: String = all_ex
            .iter()
            .enumerate()
            .map(|(k, item)| {
                let p = item["path"].as_str().unwrap_or("");
                let iid = item["id"].as_str().unwrap_or("");
                let is_cur = Some(k) == cur_idx;
                let item_done = store.get_exercise(class_id, chapter_id, iid).and_then(|s| s["evaluated"].as_str()).is_some();
                format!(
                    r##"<a class="exo-tab{cur}{dn}" href="#/eleve/{cid}/exercices/{chid}?ex={p_enc}"{aria}>Ex. {}</a>"##,
                    k + 1,
                    cur = if is_cur { " on" } else { "" },
                    dn = if item_done { " done" } else { "" },
                    cid = esc_attr(class_id),
                    chid = esc_attr(chapter_id),
                    p_enc = url_encode(p),
                    aria = if is_cur { r##" aria-current="page""## } else { "" },
                )
            })
            .collect();
        format!(r##"<nav class="exo-tabs" aria-label="Exercices de la série">{items}</nav>"##)
    } else {
        String::new()
    };

    let ctx_raw = exercise["context"].as_str().unwrap_or("");
    let ctx_media = &exercise["media"];
    let ctx_html = if !ctx_raw.is_empty() || !ctx_media.is_null() {
        let inner = if !ctx_raw.is_empty() { render_math(ctx_raw) } else { String::new() };
        format!(
            r##"<div class="exo-stmt" id="ex-context">{}</div>"##,
            wrap_with_media(ctx_media, &inner, "default", "exercise", &base_dir, root_prefix)
        )
    } else {
        String::new()
    };

    let qs = exercise["questions"].as_array().cloned().unwrap_or_default();
    let parts_html = render_exercise_parts(&qs, done, "ex0", &base_dir, root_prefix, st);

    let prev_btn = match cur_idx.and_then(|i| if i > 0 { all_ex.get(i - 1) } else { None }) {
        Some(prev) => format!(
            r##"<a class="exo-lnk prev" href="#/eleve/{}/exercices/{}?ex={}">Précédent</a>"##,
            esc_attr(class_id),
            esc_attr(chapter_id),
            url_encode(prev["path"].as_str().unwrap_or(""))
        ),
        None => r##"<button type="button" class="exo-lnk prev" disabled>Précédent</button>"##.into(),
    };
    let next_btn = match cur_idx.and_then(|i| all_ex.get(i + 1)) {
        Some(next) => format!(
            r##"<a class="exo-lnk" href="#/eleve/{}/exercices/{}?ex={}">Exercice suivant</a>"##,
            esc_attr(class_id),
            esc_attr(chapter_id),
            url_encode(next["path"].as_str().unwrap_or(""))
        ),
        None => r##"<button type="button" class="exo-lnk" disabled>Exercice suivant</button>"##.into(),
    };

    let chrono_inner = if let Some(code) = ev_code {
        let lbl = eval_label(code).0;
        if saved_dur > 0 {
            format!("{lbl} · {}", fmt_time(saved_dur))
        } else {
            lbl.to_string()
        }
    } else {
        format!(r##"<span id="tm">{}</span>"##, fmt_time(st.elapsed_sec))
    };

    let pts_html = match exercise["points"].as_f64() {
        Some(p) if p > 0.0 => format!(r##"<span class="exo-pts-tag">{} pts</span>"##, p),
        _ => String::new(),
    };
    let est_html = match outline["estimatedMinutes"].as_u64() {
        Some(m) if m > 0 => format!(r##"<span class="exo-pts-tag">~{m} min</span>"##),
        _ => String::new(),
    };

    format!(
        r##"<main class="page-main page-main--exo" id="exo">
          <header class="exo-bar{single} no-print">
            <div class="exo-bar__in">
              <a class="exo-ib" href="#/eleve/{cid}/exercices/{chid}" aria-label="Retour à la série" title="Retour à la série">{ico_back}</a>
              <span class="exo-chrono exo-ico{done_cls}" id="ex-chrono" aria-live="off">{chrono_inner}</span>
              <button type="button" class="exo-ib exo-ib--print" data-action="exo-print" title="Imprimer / Exporter en PDF" aria-label="Imprimer ou exporter en PDF">{ico_print}</button>
              <button type="button" class="exo-ib" data-action="toggle-theme" data-theme-toggle="1" title="{th_lbl}" aria-label="{th_lbl}"><span data-theme-icon="1">{ico_theme}</span></button>
            </div>
            {tabs_html}
            <div id="exo-prog"></div>
          </header>

          <div class="exo-sheets">
            <section class="exo-sheet{sheet_done}" id="exo-sheet-0" data-i="0">
              <header class="exo-sheet-head">
                <h1 class="exo-title-badge" tabindex="-1">
                  <span class="exo-badge-label"><i class="exo-badge-dot" aria-hidden="true"></i>Exercice</span>
                  <span class="exo-badge-num">{ex_num:02}</span>
                </h1>
                <div class="exo-sheet-meta">
                  {pts_html}
                  {est_html}
                  <span class="exo-done-chip" id="ex-done-chip"{chip_hid}>✓ Validé</span>
                  {diff_html}
                </div>
              </header>
              {ctx_html}
              <ol class="exo-parts" id="ex-questions">{parts_html}</ol>
              <footer class="exo-foot no-print">
                {prev_btn}
                {next_btn}
                <button type="button" class="exo-val exo-ico" id="ex-validate" data-action="exo-open-eval" data-eval-idx="0" aria-pressed="{done}">{val_lbl}</button>
              </footer>
            </section>
          </div>
        </main>"##,
        single = if all_ex.len() <= 1 { " is-single" } else { "" },
        cid = esc_attr(class_id),
        chid = esc_attr(chapter_id),
        ico_back = icon("chevron-left", 16, ""),
        done_cls = if done { " is-done" } else { "" },
        ico_print = icon("print", 16, ""),
        th_lbl = if is_dark { "Mode clair (Maj+D)" } else { "Mode sombre (Maj+D)" },
        ico_theme = icon(if is_dark { "sun" } else { "moon" }, 16, ""),
        sheet_done = if done { " done" } else { "" },
        chip_hid = if done { "" } else { " hidden" },
        val_lbl = validate_label(ev_code),
    )
}

pub fn render_exam_detail(
    class_id: &str,
    path: &str,
    exam: &Value,
    st: &ExerciseState,
    store: &Store,
    is_dark: bool,
    root_prefix: &str,
) -> String {
    let exercises = exam["exercises"].as_array().cloned().unwrap_or_default();
    if exercises.is_empty() {
        return format!(
            r##"<main class="page-main"><div class="empty">{}<div>Sujet indisponible.</div><a class="btn sm" href="#/eleve/{}">Retour</a></div></main>"##,
            icon("file", 24, ""),
            esc_attr(class_id)
        );
    }

    let is_olympiad = path.contains("olympiad") || exam["id"].as_str().unwrap_or("").contains("olympiad");
    let exam_id = exam["id"].as_str().unwrap_or("exam");
    let exam_chapter = format!("exam-{exam_id}");
    let clean_title = math_engine::analyze::plain_title(
        exam["title"].as_str().unwrap_or(if is_olympiad { "Olympiades" } else { "Examen national" }),
    );
    let dur_h = exam["duration"]
        .as_u64()
        .filter(|&d| d > 0)
        .map(|d| format!(r##"<span class="exo-chrono__dur">{} h</span> "##, (d + 30) / 60))
        .unwrap_or_default();
    let base_dir = dir_of_path(path);

    let tabs_html = if exercises.len() > 1 {
        let items: String = exercises
            .iter()
            .enumerate()
            .map(|(k, item)| {
                let iid = item["id"].as_str().unwrap_or("");
                let is_done = store.get_exercise(class_id, &exam_chapter, iid).and_then(|s| s["evaluated"].as_str()).is_some();
                let is_on = k == st.active_exam_idx;
                let num = item["number"].as_u64().unwrap_or((k + 1) as u64);
                let pts = item["points"].as_f64().filter(|&p| p > 0.0).map(|p| format!(" ({p} pts)")).unwrap_or_default();
                format!(
                    r##"<button type="button" class="exo-tab{on}{dn}" data-action="exam-tab" data-ex-i="{k}"{aria}>Ex. {num}{pts}</button>"##,
                    on = if is_on { " on" } else { "" },
                    dn = if is_done { " done" } else { "" },
                    aria = if is_on { r##" aria-current="true""## } else { "" },
                )
            })
            .collect();
        format!(r##"<nav class="exo-tabs" id="exam-ex-tabs" aria-label="Exercices">{items}</nav>"##)
    } else {
        String::new()
    };

    let mut sheets_html = String::new();
    for (i, ex) in exercises.iter().enumerate() {
        let eid = ex["id"].as_str().unwrap_or("");
        let saved = store.get_exercise(class_id, &exam_chapter, eid);
        let ev_code = saved.and_then(|s| s["evaluated"].as_str());
        let done = ev_code.is_some();
        let ex_num = ex["number"].as_u64().unwrap_or((i + 1) as u64);
        let diff_html = render_difficulty_stars(ex["difficulty"].as_str(), None, None);
        let pts_html = ex["points"].as_f64().filter(|&p| p > 0.0).map(|p| format!(r##"<span class="exo-pts-tag">{p} pts</span>"##)).unwrap_or_default();

        let ctx_raw = ex["context"].as_str().unwrap_or("");
        let ctx_media = &ex["media"];
        let ctx_html = if !ctx_raw.is_empty() || !ctx_media.is_null() {
            let inner = if !ctx_raw.is_empty() { render_math(ctx_raw) } else { String::new() };
            format!(
                r##"<div class="exo-stmt">{}</div>"##,
                wrap_with_media(ctx_media, &inner, "default", "exercise", &base_dir, root_prefix)
            )
        } else {
            String::new()
        };

        let qs = ex["questions"].as_array().cloned().unwrap_or_default();
        let parts_html = render_exercise_parts(&qs, done, &format!("exam-{i}"), &base_dir, root_prefix, st);

        sheets_html.push_str(&format!(
            r##"<section class="exo-sheet{done_cls}" id="exo-sheet-{i}" data-i="{i}">
              <header class="exo-sheet-head">
                <h2 class="exo-title-badge"{ti}>
                  <span class="exo-badge-label"><i class="exo-badge-dot" aria-hidden="true"></i>Exercice</span>
                  <span class="exo-badge-num">{ex_num:02}</span>
                </h2>
                <div class="exo-sheet-meta">
                  {pts_html}
                  <span class="exo-done-chip"{chip_hid}>✓ Validé</span>
                  {diff_html}
                </div>
              </header>
              {ctx_html}
              <ol class="exo-parts">{parts_html}</ol>
              <footer class="exo-foot no-print">
                <button type="button" class="exo-lnk prev" data-action="exam-jump" data-ex-i="{prev_i}"{prev_dis}>Précédent</button>
                <button type="button" class="exo-lnk" data-action="exam-jump" data-ex-i="{next_i}"{next_dis}>Exercice suivant</button>
                <button type="button" class="exo-val exo-ico" data-action="exo-open-eval" data-eval-idx="{i}" aria-pressed="{done}">{val_lbl}</button>
              </footer>
            </section>"##,
            done_cls = if done { " done" } else { "" },
            ti = if i == 0 { r##" tabindex="-1""## } else { "" },
            chip_hid = if done { "" } else { " hidden" },
            prev_i = i.saturating_sub(1),
            prev_dis = if i == 0 { " disabled" } else { "" },
            next_i = (i + 1).min(exercises.len() - 1),
            next_dis = if i + 1 >= exercises.len() { " disabled" } else { "" },
            val_lbl = validate_label(ev_code),
        ));
    }

    let back_tab = if is_olympiad { "olympiades" } else { "examens" };
    format!(
        r##"<main class="page-main page-main--exo" id="exo">
          <h1 class="sr-only" data-plain-title="{t_attr}">{t_esc}</h1>
          <header class="exo-bar{single} no-print">
            <div class="exo-bar__in">
              <a class="exo-ib" href="#/eleve/{cid}?tab={back_tab}" aria-label="Retour" title="Retour">{ico_back}</a>
              <span class="exo-chrono exo-ico" aria-live="off">{dur_h}<span id="tm">{tm}</span></span>
              <button type="button" class="exo-ib exo-ib--print" data-action="exo-print" title="Imprimer / Exporter en PDF" aria-label="Imprimer">{ico_print}</button>
              <button type="button" class="exo-ib" data-action="toggle-theme" data-theme-toggle="1" title="{th_lbl}" aria-label="{th_lbl}"><span data-theme-icon="1">{ico_theme}</span></button>
            </div>
            {tabs_html}
            <div id="exo-prog"></div>
          </header>
          <div class="exo-sheets" id="exam-sheets">{sheets_html}</div>
        </main>"##,
        t_attr = esc_attr(&clean_title),
        t_esc = esc(&clean_title),
        single = if exercises.len() <= 1 { " is-single" } else { "" },
        cid = esc_attr(class_id),
        ico_back = icon("chevron-left", 16, ""),
        tm = fmt_time(st.elapsed_sec),
        ico_print = icon("print", 16, ""),
        th_lbl = if is_dark { "Mode clair (Maj+D)" } else { "Mode sombre (Maj+D)" },
        ico_theme = icon(if is_dark { "sun" } else { "moon" }, 16, ""),
    )
}
