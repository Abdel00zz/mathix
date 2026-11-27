//! Lesson & Problem sheet viewer (#/eleve/:classId/revision/:chapterId/:path).
//! Uses native Mathix lesson.css classes (#les.page-main--lesson, .is-problem-sheet,
//! .rp, .top, .ls-zone, .ls-intro-zone, details.blk.is-socratic, .bx[data-label], .app-sol).

use serde_json::{json, Value};

use crate::html::{dir_of_path, esc, esc_attr, format_class_name, icon};
use crate::math_html::{
    media_by_anchor, render_content_with_item_figures, render_inline_title, render_math,
    render_math_inline, render_structured_solution, without_anchor, wrap_with_media,
};
use crate::store::Store;

#[derive(Clone, Debug)]
pub struct FocusBlockNav {
    pub blk_idx: usize,
    pub label: String,
    pub kind_code: String,
}

#[derive(Clone, Debug)]
pub struct RevisionState {
    pub class_id: String,
    pub chapter_id: String,
    pub path: String,
    pub seyes: bool,
    pub zoom: i32,
    pub all_open: bool,
    pub all_blanks: bool,
    pub toc_open: bool,
    pub menu_open: bool,
    pub focus_blk_idx: usize,
    pub focus_kind: String,
    pub focus_ctype: String,
    pub focus_badge: String,
    pub focus_title_html: String,
    pub focus_stmt_html: String,
    pub focus_steps: Vec<String>,
    pub focus_extra_html: String,
    pub focus_idx: usize,
    pub focus_step_mode: bool,
    pub focus_nav: Vec<FocusBlockNav>,
    pub focus_open: bool,
}

impl Default for RevisionState {
    fn default() -> Self {
        Self {
            class_id: String::new(),
            chapter_id: String::new(),
            path: String::new(),
            seyes: true,
            zoom: 100,
            all_open: false,
            all_blanks: false,
            toc_open: false,
            menu_open: false,
            focus_blk_idx: 0,
            focus_kind: String::from("d"),
            focus_ctype: String::new(),
            focus_badge: String::from("Mode Focus"),
            focus_title_html: String::new(),
            focus_stmt_html: String::new(),
            focus_steps: Vec::new(),
            focus_extra_html: String::new(),
            focus_idx: 0,
            focus_step_mode: true,
            focus_nav: Vec::new(),
            focus_open: false,
        }
    }
}

fn canonical_block_type(raw: &str) -> String {
    let k = raw.trim().to_lowercase();
    match k.as_str() {
        "définition" | "def" | "vocabulaire" | "notation" => "definition",
        "théorème" | "thm" => "theorem",
        "propriété" | "prop" => "property",
        "proposition" => "proposition",
        "lemme" => "lemma",
        "corollaire" => "corollary",
        "méthode" | "methode" | "technique" | "algorithme" => "method",
        "démonstration" | "preuve" => "proof",
        "exemple" | "exemples" => "example",
        "exercice" | "application" | "exercice_application" | "exercice-application" => "application",
        "remarque" | "remarques" | "observation" => "remark",
        "attention" | "piège" | "piege" | "erreur" | "mise_en_garde" => "warning",
        "astuce" | "conseil" | "intuition" => "tip",
        "rappel" | "prerequis" | "prérequis" => "recall",
        "résumé" | "resume" | "synthese" | "synthèse" | "bilan" => "summary",
        "formule" | "formulaire" => "formula",
        "histoire" | "historique" | "contexte" | "culture" => "history",
        "objectif" | "objectifs" => "objective",
        "cela_permet_de" => "cela_permet_de",
        "indice" | "indication" => "hint",
        "solution" | "corrige" | "corrigé" | "correction" => "solution",
        "probleme" | "problème" | "enonce" | "énoncé" => "problem",
        "intro" | "introduction" => "intro",
        "explanation" | "text" | "paragraph" => "text",
        _ => return k,
    }
    .to_string()
}

/// Returns (label, kind_code, is_revealable, is_numbered)
fn block_meta(btype: &str) -> (&'static str, &'static str, bool, bool) {
    match btype {
        "definition" => ("Définition", "d", true, true),
        "theorem" => ("Théorème", "d", true, true),
        "property" => ("Propriété", "d", true, true),
        "proposition" => ("Proposition", "d", true, true),
        "lemma" => ("Lemme", "d", true, true),
        "corollary" => ("Corollaire", "d", true, true),
        "method" => ("Méthode", "m", true, true),
        "formula" => ("Formule", "d", true, false),
        "proof" => ("Démonstration", "u", true, false),
        "example" => ("Exemple", "e", false, false),
        "application" => ("Application", "e", false, true),
        "remark" => ("Remarque", "r", false, false),
        "warning" => ("Attention", "a", false, false),
        "tip" => ("Astuce", "v", false, false),
        "recall" => ("Rappel", "r", true, false),
        "summary" => ("Synthèse", "g", true, false),
        "history" => ("Histoire", "v", false, false),
        "objective" => ("Objectif", "d", false, false),
        "cela_permet_de" => ("Cela permet de", "g", false, false),
        "hint" => ("Indice", "a", true, false),
        "solution" => ("Solution", "g", true, false),
        "problem" => ("Problème", "p", false, false),
        "intro" | "text" => ("", "p", false, false),
        _ => ("Note", "r", false, false),
    }
}

fn content_to_string(v: &Value) -> String {
    match v {
        Value::String(s) => s.clone(),
        Value::Array(arr) => {
            let parts: Vec<String> = arr
                .iter()
                .filter_map(|x| x.as_str().map(|s| s.to_string()))
                .collect();
            if parts.len() > 1 {
                let items: String = parts.iter().map(|p| format!("\\item {p}\n")).collect();
                format!("\\begin{{itemize}}\n{items}\\end{{itemize}}")
            } else {
                parts.into_iter().next().unwrap_or_default()
            }
        }
        _ => String::new(),
    }
}

fn section_letter(idx: usize) -> String {
    let ch = (b'A' + (idx % 26) as u8) as char;
    format!("{ch}.")
}

fn format_hero_title(display_title: &str, is_problem: bool) -> String {
    if !is_problem {
        if let Some(rest) = display_title
            .strip_prefix("Fiche ")
            .or_else(|| display_title.strip_prefix("Fiche : "))
            .or_else(|| display_title.strip_prefix("Fiche — "))
        {
            return format!(
                r##"<span class="revision-hero-word">Fiche</span> <span class="revision-hero-rest">{}</span>"##,
                render_inline_title(rest.trim())
            );
        }
    }
    render_inline_title(display_title)
}

fn format_socratic_lead(prefix: &str) -> String {
    let trimmed = prefix.trim();
    if trimmed.is_empty() {
        return String::new();
    }
    let mut chars = trimmed.chars();
    let Some(first) = chars.next() else { return String::new() };
    let rest: String = chars.collect();
    if first.is_alphabetic() {
        format!(
            r##"<span class="soc-lead"><span class="soc-cap">{}</span>{}</span>"##,
            esc(&first.to_string()),
            render_inline_title(&rest)
        )
    } else {
        format!(r##"<span class="soc-lead">{}</span>"##, render_inline_title(trimmed))
    }
}

pub fn render_revision_view(
    doc: &Value,
    st: &RevisionState,
    store: &Store,
    is_dark: bool,
    root_prefix: &str,
) -> String {
    let is_problem = st.chapter_id == "problemes"
        || st.path.contains("/problemes/")
        || doc["header"]["category"].as_str() == Some("probleme");

    let raw_title = doc["header"]["title"]
        .as_str()
        .or_else(|| doc["title"].as_str())
        .unwrap_or("Fiche de cours");
    let display_title = if is_problem {
        let s = json_engine::domain::op_problem_strip_prefix(&json!({ "title": raw_title }));
        s["title"].as_str().unwrap_or(raw_title).to_string()
    } else {
        raw_title.to_string()
    };
    let plain_title = math_engine::analyze::plain_title(&display_title);

    let subtitle = doc["header"]["subtitle"].as_str().unwrap_or("");
    let sections = doc["sections"].as_array().cloned().unwrap_or_default();
    let base_dir = dir_of_path(&st.path);

    let corpus: String = sections
        .iter()
        .flat_map(|s| s["blocks"].as_array().cloned().unwrap_or_default())
        .map(|b| content_to_string(&b["content"]))
        .collect::<Vec<_>>()
        .join("\n");
    let rm = math_engine::socratic::compute_reading_metrics(&corpus);
    let minutes = rm["minutes"].as_u64().unwrap_or(5);

    let mut toc_items = String::new();
    let mut sections_html = String::new();
    let mut type_counters: std::collections::BTreeMap<&'static str, usize> = std::collections::BTreeMap::new();
    let mut global_blk_idx = 0usize;
    let mut letter_idx = 0usize;

    for (si, sec) in sections.iter().enumerate() {
        let sec_id = format!("sec-{si}");
        let sec_title = sec["title"].as_str().unwrap_or("");
        let sec_intro = sec["intro"].as_str().unwrap_or("");
        let blocks = sec["blocks"].as_array().cloned().unwrap_or_default();

        let is_intro_only = sec_title.is_empty()
            && !blocks.is_empty()
            && blocks.iter().all(|b| {
                let ct = canonical_block_type(b["type"].as_str().unwrap_or("text"));
                matches!(ct.as_str(), "intro" | "history")
            });

        let ltr = if !sec_title.is_empty() {
            let l = section_letter(letter_idx);
            letter_idx += 1;
            toc_items.push_str(&format!(
                r##"<button type="button" data-action="rev-jump" data-target="#{sec_id}"><b>{l}</b><span>{}</span></button>"##,
                render_inline_title(sec_title)
            ));
            Some(l)
        } else {
            None
        };

        let mut blocks_html = String::new();
        for blk in &blocks {
            global_blk_idx += 1;
            let raw_type = blk["type"].as_str().unwrap_or("text");
            let ctype = canonical_block_type(raw_type);
            let (base_label, kind_code, is_revealable, is_numbered) = block_meta(&ctype);
            let blk_title = blk["title"].as_str().unwrap_or("");
            let content_raw = content_to_string(&blk["content"]);
            let media = &blk["media"];

            let num_suffix = if is_numbered && !is_problem {
                let c = type_counters.entry(base_label).or_insert(0);
                *c += 1;
                format!(" {c}")
            } else {
                String::new()
            };

            let is_plain_problem_block = is_problem && matches!(ctype.as_str(), "problem" | "text" | "intro");

            let qst_split = if matches!(ctype.as_str(), "application" | "example") {
                math_engine::analyze::split_question_content(&content_raw)
            } else {
                None
            };

            if is_plain_problem_block {
                let body_html = render_content_with_item_figures(
                    &content_raw,
                    media,
                    "revision",
                    "default",
                    &base_dir,
                    root_prefix,
                );
                let lead_media = without_anchor(media, "item");
                let wrapped = wrap_with_media(&lead_media, &body_html, "revision", "default", &base_dir, root_prefix);
                let is_dup_title = !blk_title.is_empty()
                    && (blk_title.trim().eq_ignore_ascii_case(display_title.trim())
                        || blk_title.trim() == display_title.trim()
                        || blk_title.trim() == plain_title.trim());
                let title_h = if !blk_title.is_empty() && !is_dup_title {
                    format!(r##"<h3 class="blk-title">{}</h3>"##, render_inline_title(blk_title))
                } else {
                    String::new()
                };
                blocks_html.push_str(&format!(
                    r##"<div class="blk" data-t="problem" data-blk-idx="{global_blk_idx}">{title_h}<div class="bx">{wrapped}</div></div>"##
                ));
            } else if ctype == "cela_permet_de" {
                let items: String = match &blk["content"] {
                    Value::Array(arr) => arr
                        .iter()
                        .filter_map(Value::as_str)
                        .map(|s| format!(r##"<li class="revision-purpose-item"><span class="revision-purpose-bullet" aria-hidden="true"></span><span>{}</span></li>"##, render_math_inline(s)))
                        .collect(),
                    _ => format!(r##"<li class="revision-purpose-item"><span class="revision-purpose-bullet" aria-hidden="true"></span><span>{}</span></li>"##, render_math(&content_raw)),
                };
                blocks_html.push_str(&format!(
                    r##"<div class="revision-purpose-block" data-blk-idx="{global_blk_idx}">
                      <div class="revision-purpose-heading"><span class="revision-purpose-badge">Cela permet de</span></div>
                      <ul class="revision-purpose-list">{items}</ul>
                    </div>"##
                ));
            } else if let Some((stmt, corr)) = qst_split {
                let lead_m = media_by_anchor(media, "lead", "application");
                let content_m = media_by_anchor(media, "content", "application");
                let stmt_html = wrap_with_media(
                    &lead_m,
                    &render_math(&stmt),
                    "revision",
                    "default",
                    &base_dir,
                    root_prefix,
                );
                let corr_html = wrap_with_media(
                    &content_m,
                    &render_structured_solution(&corr),
                    "revision",
                    "default",
                    &base_dir,
                    root_prefix,
                );
                let open_attr = if st.all_open { " open" } else { "" };
                blocks_html.push_str(&format!(
                    r##"<div class="blk" data-k="{kind_code}" data-t="{ctype}" data-blk-idx="{global_blk_idx}">
                      <div class="bh">
                        <span class="bt">{base_label}{num_suffix}</span>
                        <div class="blk-tools">
                          <button type="button" class="ib blk-focus-btn no-print" data-action="rev-focus" data-blk-idx="{global_blk_idx}" title="Mode Focus étape par étape" aria-label="Mode Focus">{ico_exp}</button>
                        </div>
                      </div>
                      <div class="bx">
                        <div>{stmt_html}</div>
                        <details class="app-sol"{open_attr}>
                          <summary class="app-sol-summary"><span class="app-sol-pill">Résolvons l’exercice</span></summary>
                          <div class="app-correction-panel sol-bx">
                            <div class="app-steps-list">{corr_html}</div>
                          </div>
                        </details>
                      </div>
                    </div>"##,
                    ico_exp = icon("expand", 14, ""),
                ));
            } else if is_revealable {
                let (prefix, focus) = if !blk_title.is_empty() {
                    math_engine::socratic::split_socratic_focus(blk_title)
                } else {
                    (format!("{base_label}{num_suffix}"), String::new())
                };
                let q_text = if !focus.is_empty() {
                    format!(
                        r##"{} <span class="soc-focus">{}</span>"##,
                        format_socratic_lead(&prefix),
                        render_inline_title(&focus)
                    )
                } else {
                    format_socratic_lead(&prefix)
                };
                let inner_body = if ctype == "solution" {
                    render_structured_solution(&content_raw)
                } else {
                    render_content_with_item_figures(
                        &content_raw,
                        media,
                        "revision",
                        "default",
                        &base_dir,
                        root_prefix,
                    )
                };
                let rem_media = without_anchor(media, "item");
                let wrapped = wrap_with_media(&rem_media, &inner_body, "revision", "default", &base_dir, root_prefix);
                let open_attr = if st.all_open { " open" } else { "" };
                let bx_label = if base_label.is_empty() {
                    String::new()
                } else {
                    format!(r##" data-label="{}""##, esc_attr(&format!("{base_label}{num_suffix}")))
                };
                let show_qmark = !focus.is_empty() || blk_title.trim().ends_with('?');
                let qmark_html = if show_qmark {
                    r##"<span class="q-mark" aria-hidden="true">?</span>"##
                } else {
                    ""
                };
                blocks_html.push_str(&format!(
                    r##"<details class="blk is-socratic" data-k="{kind_code}" data-t="{ctype}" data-blk-idx="{global_blk_idx}"{open_attr}>
                      <summary>
                        <span class="blk-q">{q_text}{qmark_html}</span>
                      </summary>
                      <div class="bx"{bx_label}>
                        {wrapped}
                        <div class="blk-focus-row no-print">
                          <button type="button" class="blk-focus-chip" data-action="rev-focus" data-blk-idx="{global_blk_idx}" title="Ouvrir ce bloc en mode Focus">{ico_exp}<span>Mode Focus</span></button>
                        </div>
                      </div>
                    </details>"##,
                    ico_exp = icon("expand", 13, ""),
                ));
            } else if ctype == "warning" {
                blocks_html.push_str(&format!(
                    r##"<div class="blk is-warn-trigger no-print" data-k="a" data-t="warning" data-blk-idx="{global_blk_idx}"><button type="button" class="warn-btn" data-action="rev-focus" data-blk-idx="{global_blk_idx}" title="Ouvrir le point de vigilance en mode Focus" aria-label="Attention — Ouvrir en mode Focus">{ico_warn}<span class="bt">{base_label}</span></button></div>"##,
                    ico_warn = icon("warning", 15, "warn-ico"),
                ));
            } else {
                let inner_body = render_content_with_item_figures(
                    &content_raw,
                    media,
                    "revision",
                    "default",
                    &base_dir,
                    root_prefix,
                );
                let rem_media = without_anchor(media, "item");
                let wrapped = wrap_with_media(&rem_media, &inner_body, "revision", "default", &base_dir, root_prefix);
                let label_badge = if base_label.is_empty() {
                    String::new()
                } else {
                    format!(r##"<span class="bt">{base_label}{num_suffix}</span>"##)
                };
                let bh = if !label_badge.is_empty() {
                    format!(r##"<div class="bh">{label_badge}</div>"##)
                } else {
                    String::new()
                };
                let t_html = if !blk_title.is_empty() && ctype != "intro" && ctype != "text" {
                    format!(r##"<h3 class="blk-title">{}</h3>"##, render_inline_title(blk_title))
                } else {
                    String::new()
                };
                blocks_html.push_str(&format!(
                    r##"<div class="blk" data-k="{kind_code}" data-t="{ctype}" data-blk-idx="{global_blk_idx}">{bh}{t_html}<div class="bx">{wrapped}</div></div>"##
                ));
            }
        }

        if is_intro_only {
            sections_html.push_str(&format!(
                r##"<section class="ls-intro-zone" id="{sec_id}">{blocks_html}</section>"##
            ));
        } else {
            let sec_h = match ltr {
                Some(l) => format!(
                    r##"<header class="section-header"><h2 class="lh"><span class="ltr">{l}</span><span class="lh-t">{}</span></h2></header>"##,
                    render_inline_title(sec_title)
                ),
                None => String::new(),
            };
            let intro_h = if !sec_intro.is_empty() {
                format!(r##"<div class="blk" data-t="text"><div class="bx">{}</div></div>"##, render_math(sec_intro))
            } else {
                String::new()
            };
            sections_html.push_str(&format!(
                r##"<section class="ls-zone" id="{sec_id}">{sec_h}<div class="section-body">{intro_h}{blocks_html}</div></section>"##
            ));
        }
    }

    // Lexique (if present)
    let lexique_html = if let Some(lex) = doc.get("lexique").or_else(|| doc.get("glossary")).and_then(Value::as_array) {
        if !lex.is_empty() {
            let items: String = lex
                .iter()
                .map(|it| {
                    let term = it["term"].as_str().or_else(|| it["fr"].as_str()).unwrap_or("");
                    let ar = it["ar"].as_str().unwrap_or("");
                    let def = it["definition"].as_str().or_else(|| it["desc"].as_str()).unwrap_or("");
                    format!(
                        r##"<div class="lex-item"><div class="lex-hd"><strong>{}</strong>{}</div>{}</div>"##,
                        render_inline_title(term),
                        if ar.is_empty() { String::new() } else { format!(r##"<span class="lex-ar" dir="rtl">{}</span>"##, esc(ar)) },
                        if def.is_empty() { String::new() } else { format!(r##"<div class="lex-def">{}</div>"##, render_math_inline(def)) },
                    )
                })
                .collect();
            format!(
                r##"<section class="ls-zone"><header class="section-header"><h2 class="lh"><span class="lh-t">Lexique</span></h2></header><div class="section-body"><div class="lex-grid">{items}</div></div></section>"##
            )
        } else {
            String::new()
        }
    } else {
        String::new()
    };

    let th = store.theme();
    let seg_idx = match th { "light" => 0, "dark" => 1, _ => 2 };
    let th_state = match th {
        "auto" => format!("Auto · {}", if is_dark { "Sombre" } else { "Clair" }),
        "dark" => "Sombre".into(),
        _ => "Clair".into(),
    };
    let rev_pct = store.revision_pct(&st.class_id, &st.chapter_id, Some(&st.path));
    let back_href = if is_problem {
        format!("#/eleve/{}?tab=problemes", esc_attr(&st.class_id))
    } else {
        format!("#/eleve/{}", esc_attr(&st.class_id))
    };

    let mut page_cls = String::from("page-main page-main--lesson");
    if is_problem { page_cls.push_str(" is-problem-sheet"); }
    if st.all_blanks { page_cls.push_str(" reveal-all-blanks"); }
    let paper_attr = if st.seyes && !is_problem { "seyes" } else { "plain" };

    format!(
        r##"<div class="rp no-print"><i id="les-prog" style="width:{rev_pct}%"></i></div>
        <main class="{page_cls}" id="les" data-paper="{paper_attr}" style="font-size:{zoom}%">
          <header class="top no-print">
            <a class="ib" href="{back_href}" aria-label="Retour au programme" title="Retour">{ico_back}</a>
            <span class="top-meta">{title_inline}</span>
            <span class="cnt">
              <span id="rt">~{minutes} min</span>
              <span id="les-pct">{rev_pct}%</span>
              {toc_btn}
              <button type="button" class="ib" id="les-menu-btn" popovertarget="les-menu" aria-label="Options de lecture" title="Options">{ico_more}</button>
            </span>
          </header>

          <div id="toc" popover>
            <div style="display:flex;align-items:center;justify-content:space-between">
              <p class="ctx">Sommaire</p>
              <button type="button" class="ib" popovertarget="toc" popovertargetaction="hide" aria-label="Fermer">{ico_x}</button>
            </div>
            {toc_items}
          </div>

          <div id="les-menu" popover>
            <div class="les-menu__head">
              <p class="ctx">Apparence</p>
              <span class="les-menu__state" id="les-theme-state">{th_state}</span>
            </div>
            <div class="les-theme-seg" id="les-theme-seg" role="radiogroup" aria-label="Thème" style="--seg-idx:{seg_idx}">
              <button type="button" role="radio" class="les-theme-opt{cls_l}" data-action="rev-theme" data-les-theme="light" aria-checked="{th_l}">Clair</button>
              <button type="button" role="radio" class="les-theme-opt{cls_d}" data-action="rev-theme" data-les-theme="dark" aria-checked="{th_d}">Sombre</button>
              <button type="button" role="radio" class="les-theme-opt{cls_a}" data-action="rev-theme" data-les-theme="auto" aria-checked="{th_a}">Auto</button>
            </div>
            <div class="les-menu__row">
              <span class="les-menu__row-meta">{ico_grid}<span class="les-menu__row-txt"><span class="les-menu__lbl">Papier Seyès</span><span class="les-menu__hint">Quadrillage cahier</span></span></span>
              <button type="button" class="les-switch" role="switch" data-action="rev-seyes" aria-checked="{seyes}" aria-label="Papier Seyès"></button>
            </div>
            <div class="les-menu__zoom">
              <span class="les-menu__lbl">Taille du texte</span>
              <div class="les-menu__stepper">
                <button type="button" id="btn-zoom-out" data-action="rev-zoom" data-delta="-10" aria-label="Réduire">A-</button>
                <span id="les-zoom-val">{zoom}%</span>
                <button type="button" id="btn-zoom-in" data-action="rev-zoom" data-delta="10" aria-label="Agrandir">A+</button>
              </div>
            </div>
            <hr class="les-menu__sep" />
            <button type="button" class="les-menu__item" data-action="rev-toggle-all">{ico_eye}<span>{open_lbl}</span></button>
            <button type="button" class="les-menu__item" data-action="rev-toggle-blanks">{ico_sp}<span>{blank_lbl}</span></button>
            <button type="button" class="les-menu__item" data-action="rev-print">{ico_pr}<span>Imprimer / PDF</span></button>
          </div>

          <header class="revision-hero">
            <h1 class="revision-hero-title" tabindex="-1" data-plain-title="{plain_attr}">{hero_title}</h1>
            {sub_html}
          </header>

          {sections_html}
          {lexique_html}

          <footer class="les-footer no-print">
            <div class="row" style="margin-bottom:10px">
              <button type="button" class="btn primary" data-action="rev-mark-done">{ico_chk} Marquer la fiche comme lue (100%)</button>
              <a class="btn" href="{back_href}">Retour au programme</a>
            </div>
            <p class="les-footer__meta">{cls_name} · ~{minutes} min de lecture</p>
          </footer>
          <button type="button" class="les-top-fab no-print" id="les-top-fab" aria-label="Haut de page" title="Haut de page">{ico_up}</button>
        </main>"##,
        zoom = st.zoom,
        ico_back = icon("chevron-left", 18, ""),
        title_inline = render_inline_title(&display_title),
        hero_title = format_hero_title(&display_title, is_problem),
        toc_btn = if !toc_items.is_empty() {
            format!(r##"<button type="button" class="ib" id="les-toc-btn" popovertarget="toc" aria-label="Sommaire" title="Sommaire">{}</button>"##, icon("list", 17, ""))
        } else {
            String::new()
        },
        ico_more = icon("more-vertical", 17, ""),
        ico_x = icon("xmark", 16, ""),
        th_l = th == "light",
        th_d = th == "dark",
        th_a = th == "auto",
        cls_l = if th == "light" { " is-active" } else { "" },
        cls_d = if th == "dark" { " is-active" } else { "" },
        cls_a = if th == "auto" { " is-active" } else { "" },
        seyes = st.seyes,
        ico_grid = icon("grid", 15, ""),
        ico_eye = icon("eye", 15, ""),
        ico_sp = icon("sparkles", 15, ""),
        ico_pr = icon("print", 15, ""),
        ico_chk = icon("circle-check", 16, ""),
        ico_up = icon("arrow-up", 18, ""),
        open_lbl = if st.all_open { "Tout replier" } else { "Tout déplier" },
        blank_lbl = if st.all_blanks { "Masquer les blancs" } else { "Révéler les blancs" },
        cls_name = esc(&format_class_name(&st.class_id)),
        plain_attr = esc_attr(&plain_title),
        sub_html = if subtitle.is_empty() { String::new() } else { format!(r##"<p class="sub" style="margin-top:8px">{}</p>"##, render_inline_title(subtitle)) },
    )
}

fn split_top_level_focus_chunks(raw: &str) -> Vec<String> {
    let mut raw_chunks: Vec<String> = Vec::new();
    let mut cur = String::new();
    let bytes = raw.as_bytes();
    let mut i = 0usize;
    let mut brace_depth = 0usize;
    let mut env_depth = 0usize;
    let mut in_display = false;
    let mut in_inline = false;

    while i < bytes.len() {
        let rest = &raw[i..];
        if rest.starts_with("$$") {
            in_display = !in_display;
            cur.push_str("$$");
            i += 2;
            continue;
        }
        if !in_display && bytes[i] == b'$' {
            let escaped = i > 0 && bytes[i - 1] == b'\\';
            if !escaped {
                in_inline = !in_inline;
            }
            cur.push('$');
            i += 1;
            continue;
        }
        if !in_display && !in_inline {
            if rest.starts_with("\\begin{") {
                env_depth += 1;
                cur.push_str("\\begin{");
                i += 7;
                continue;
            }
            if rest.starts_with("\\end{") {
                env_depth = env_depth.saturating_sub(1);
                cur.push_str("\\end{");
                i += 5;
                continue;
            }
            if bytes[i] == b'\\' && i + 1 < bytes.len() {
                // Keep escaped chars together
                let ch = raw[i + 1..].chars().next().unwrap();
                if rest.starts_with("\\par")
                    && brace_depth == 0
                    && env_depth == 0
                    && rest.as_bytes().get(4).map(|b| !b.is_ascii_alphabetic()).unwrap_or(true)
                {
                    let trimmed = cur.trim();
                    if !trimmed.is_empty() {
                        raw_chunks.push(trimmed.to_string());
                    }
                    cur.clear();
                    i += 4;
                    // Skip trailing \smallskip / \medskip / \bigskip
                    loop {
                        let s = raw[i..].trim_start();
                        let skipped = raw[i..].len() - s.len();
                        i += skipped;
                        let mut matched_skip = false;
                        for sk in ["\\smallskip", "\\medskip", "\\bigskip", "\\par"] {
                            if raw[i..].starts_with(sk)
                                && raw[i + sk.len()..].chars().next().map(|c| !c.is_ascii_alphabetic()).unwrap_or(true)
                            {
                                i += sk.len();
                                matched_skip = true;
                                break;
                            }
                        }
                        if !matched_skip {
                            break;
                        }
                    }
                    continue;
                }
                cur.push('\\');
                cur.push(ch);
                i += 1 + ch.len_utf8();
                continue;
            }
            if bytes[i] == b'{' {
                brace_depth += 1;
            } else if bytes[i] == b'}' {
                brace_depth = brace_depth.saturating_sub(1);
            }
        }
        let ch = rest.chars().next().unwrap();
        cur.push(ch);
        i += ch.len_utf8();
    }
    let tail = cur.trim();
    if !tail.is_empty() {
        raw_chunks.push(tail.to_string());
    }

    // Merge dangling colons (e.g., "On obtient :" -> formula) and tiny non-structural fragments
    let mut merged: Vec<String> = Vec::new();
    let mut idx = 0usize;
    while idx < raw_chunks.len() {
        let mut piece = raw_chunks[idx].clone();
        while idx + 1 < raw_chunks.len() {
            let p_trim = piece.trim_end();
            let next_p = &raw_chunks[idx + 1];
            let next_starts_math_or_env = next_p.starts_with("$$")
                || next_p.starts_with("\\begin{")
                || next_p.starts_with("\\[");
            let dangling_intro = p_trim.ends_with(':') && (next_starts_math_or_env || p_trim.len() < 90);
            let tiny_fragment = piece.len() < 42
                && !piece.contains("$$")
                && !piece.contains("\\begin{")
                && !piece.contains("\\boxed");
            if dangling_intro || tiny_fragment {
                piece.push_str("\\par\\smallskip ");
                piece.push_str(next_p);
                idx += 1;
            } else {
                break;
            }
        }
        merged.push(piece);
        idx += 1;
    }
    merged
}

pub fn focus_split_steps(raw: &str) -> Vec<String> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return Vec::new();
    }
    let base = math_engine::structure::split_solution_steps(trimmed);
    if base.len() >= 2 {
        return base;
    }
    let para_steps = split_top_level_focus_chunks(trimmed);
    if para_steps.len() >= 2 {
        return para_steps;
    }
    if !base.is_empty() {
        base
    } else {
        vec![trimmed.to_string()]
    }
}

pub fn open_focus_for_block(
    doc: &Value,
    target_blk_idx: usize,
    st: &mut RevisionState,
    root_prefix: &str,
) -> bool {
    let Some(sections) = doc["sections"].as_array() else {
        return false;
    };
    let is_problem = st.chapter_id == "problemes"
        || st.path.contains("/problemes/")
        || doc["header"]["category"].as_str() == Some("probleme");
    let base_dir = dir_of_path(&st.path);

    let mut type_counters: std::collections::BTreeMap<&'static str, usize> = std::collections::BTreeMap::new();
    let mut global_blk_idx = 0usize;
    let mut nav: Vec<FocusBlockNav> = Vec::new();
    let mut found = false;

    for sec in sections {
        let blocks = sec["blocks"].as_array().cloned().unwrap_or_default();
        for blk in &blocks {
            global_blk_idx += 1;
            let raw_type = blk["type"].as_str().unwrap_or("text");
            let ctype = canonical_block_type(raw_type);
            let (base_label, kind_code, is_revealable, is_numbered) = block_meta(&ctype);
            let blk_title = blk["title"].as_str().unwrap_or("");
            let content_raw = content_to_string(&blk["content"]);
            let media = &blk["media"];

            let num_suffix = if is_numbered && !is_problem {
                let c = type_counters.entry(base_label).or_insert(0);
                *c += 1;
                format!(" {c}")
            } else {
                String::new()
            };

            let badge_label = if base_label.is_empty() {
                "Mode Focus".to_string()
            } else {
                format!("{base_label}{num_suffix}")
            };

            let is_plain_problem_block = is_problem && matches!(ctype.as_str(), "problem" | "text" | "intro");
            let qst_split = if matches!(ctype.as_str(), "application" | "example") {
                math_engine::analyze::split_question_content(&content_raw)
            } else {
                None
            };
            let is_focusable = !is_plain_problem_block
                && (qst_split.is_some()
                    || is_revealable
                    || matches!(ctype.as_str(), "warning" | "application" | "example"));

            if is_focusable {
                nav.push(FocusBlockNav {
                    blk_idx: global_blk_idx,
                    label: badge_label.clone(),
                    kind_code: kind_code.to_string(),
                });
            }

            if global_blk_idx == target_blk_idx {
                found = true;
                st.focus_blk_idx = target_blk_idx;
                st.focus_kind = kind_code.to_string();
                st.focus_ctype = ctype.clone();
                st.focus_badge = badge_label;

                st.focus_title_html = if !blk_title.is_empty() {
                    if is_revealable {
                        let (prefix, focus) = math_engine::socratic::split_socratic_focus(blk_title);
                        let q_text = if !focus.is_empty() {
                            format!(
                                r##"{} <span class="soc-focus">{}</span>"##,
                                format_socratic_lead(&prefix),
                                render_inline_title(&focus)
                            )
                        } else {
                            format_socratic_lead(&prefix)
                        };
                        let qmark = if !focus.is_empty() || blk_title.trim().ends_with('?') {
                            " ?"
                        } else {
                            ""
                        };
                        format!("{q_text}{qmark}")
                    } else {
                        render_inline_title(blk_title)
                    }
                } else {
                    String::new()
                };

                if let Some((stmt, corr)) = qst_split {
                    let lead_m = media_by_anchor(media, "lead", "application");
                    let content_m = media_by_anchor(media, "content", "application");
                    st.focus_stmt_html = wrap_with_media(
                        &lead_m,
                        &render_math(&stmt),
                        "revision",
                        "default",
                        &base_dir,
                        root_prefix,
                    );
                    let steps = focus_split_steps(&corr);
                    let steps = if steps.is_empty() { vec![corr] } else { steps };
                    st.focus_steps = steps.iter().map(|s| render_math(s)).collect();
                    st.focus_extra_html = wrap_with_media(&content_m, "", "revision", "default", &base_dir, root_prefix);
                } else {
                    st.focus_stmt_html.clear();
                    let steps = focus_split_steps(&content_raw);
                    let steps = if steps.is_empty() { vec![content_raw.clone()] } else { steps };
                    st.focus_steps = if ctype == "solution" {
                        steps.iter().map(|s| render_structured_solution(s)).collect()
                    } else {
                        steps.iter().map(|s| render_math(s)).collect()
                    };
                    let rem_media = without_anchor(media, "item");
                    st.focus_extra_html = wrap_with_media(&rem_media, "", "revision", "default", &base_dir, root_prefix);
                }

                st.focus_idx = 0;
                st.focus_step_mode = st.focus_steps.len() > 1 && ctype != "warning";
                st.focus_open = true;
            }
        }
    }

    if found {
        st.focus_nav = nav;
    }
    found
}

pub fn extract_focus_steps(doc: &Value, target_blk_idx: usize) -> Option<(String, Vec<String>)> {
    let mut tmp = RevisionState::default();
    if open_focus_for_block(doc, target_blk_idx, &mut tmp, "") {
        let title = if tmp.focus_title_html.is_empty() {
            tmp.focus_badge
        } else {
            tmp.focus_title_html
        };
        Some((title, tmp.focus_steps))
    } else {
        None
    }
}

fn focus_badge_icon(ctype: &str, kind: &str) -> &'static str {
    match (ctype, kind) {
        ("warning", _) | (_, "a") => "warning",
        ("theorem" | "lemma" | "corollary" | "formula", _) => "square-root",
        ("method", _) | (_, "m") => "sliders",
        ("application" | "example", _) | (_, "e") => "calculator",
        ("proof", _) | (_, "u") => "shield",
        ("summary", _) | (_, "g") => "sparkles",
        _ => "book-open",
    }
}

pub fn render_focus_dialog(st: &RevisionState) -> String {
    let total = st.focus_steps.len().max(1);
    let cur = st.focus_idx.min(total - 1);
    let is_step_mode = st.focus_step_mode && total > 1;
    let pct = if is_step_mode {
        ((cur + 1) * 100) / total
    } else {
        100
    };
    let kind = if st.focus_kind.is_empty() { "d" } else { st.focus_kind.as_str() };
    let badge_ico = icon(focus_badge_icon(&st.focus_ctype, kind), 13, "focus-badge-ico");

    let mode_tag = if st.focus_ctype == "warning" && !is_step_mode {
        "Point de vigilance".to_string()
    } else if total == 1 {
        "Vue ciblée".to_string()
    } else if is_step_mode {
        format!("Étape {} sur {total}", cur + 1)
    } else {
        format!("Vue complète · {total} étapes")
    };

    let mode_toggle_btn = if total > 1 {
        let (lbl, ico_name, active_cls) = if is_step_mode {
            ("Vue complète", "eye", "")
        } else {
            ("Étape par étape", "sliders", " is-active")
        };
        format!(
            r##"<button type="button" class="focus-pill-btn{active_cls}" data-action="focus-toggle-mode" title="Basculer entre l’affichage étape par étape et la vue complète (V)">{ico}<span>{lbl}</span></button>"##,
            ico = icon(ico_name, 13, ""),
        )
    } else {
        String::new()
    };

    let nav_pos = st.focus_nav.iter().position(|n| n.blk_idx == st.focus_blk_idx);
    let block_nav_btns = if st.focus_nav.len() > 1 {
        let prev_blk = nav_pos.and_then(|p| if p > 0 { st.focus_nav.get(p - 1) } else { None });
        let next_blk = nav_pos.and_then(|p| st.focus_nav.get(p + 1));
        let prev_btn = match prev_blk {
            Some(b) => format!(
                r##"<button type="button" class="ib focus-blk-nav" data-action="focus-nav-block" data-blk-idx="{}" title="Bloc précédent : {}" aria-label="Bloc précédent : {}">{}</button>"##,
                b.blk_idx,
                esc_attr(&b.label),
                esc_attr(&b.label),
                icon("chevron-left", 15, ""),
            ),
            None => format!(
                r##"<button type="button" class="ib focus-blk-nav" disabled aria-label="Aucun bloc précédent">{}</button>"##,
                icon("chevron-left", 15, ""),
            ),
        };
        let next_btn = match next_blk {
            Some(b) => format!(
                r##"<button type="button" class="ib focus-blk-nav" data-action="focus-nav-block" data-blk-idx="{}" title="Bloc suivant : {}" aria-label="Bloc suivant : {}">{}</button>"##,
                b.blk_idx,
                esc_attr(&b.label),
                esc_attr(&b.label),
                icon("chevron-right", 15, ""),
            ),
            None => format!(
                r##"<button type="button" class="ib focus-blk-nav" disabled aria-label="Aucun bloc suivant">{}</button>"##,
                icon("chevron-right", 15, ""),
            ),
        };
        format!(r##"<div class="focus-blk-nav-group" role="group" aria-label="Navigation entre blocs">{prev_btn}{next_btn}</div>"##)
    } else {
        String::new()
    };

    let title_html = if !st.focus_title_html.is_empty() {
        format!(r##"<h2 class="focus-dlg__title">{}</h2>"##, st.focus_title_html)
    } else {
        String::new()
    };

    let stmt_html = if !st.focus_stmt_html.is_empty() {
        format!(
            r##"<div class="focus-stmt"><span class="focus-section-eyebrow">Énoncé</span>{}</div>"##,
            st.focus_stmt_html
        )
    } else {
        String::new()
    };

    let mut steps_html = String::new();
    for (i, step_html) in st.focus_steps.iter().enumerate() {
        let step_cls = if !is_step_mode {
            if total > 1 { "focus-step-unit is-focus-done" } else { "focus-step-unit is-focus-single" }
        } else if i < cur {
            "focus-step-unit is-focus-done"
        } else if i == cur {
            "focus-step-unit is-focus-current"
        } else {
            "focus-step-unit focus-step-hidden"
        };
        let hidden_attrs = if is_step_mode && i > cur {
            r##" data-action="focus-next" role="button" tabindex="0" title="Cliquez pour révéler l’étape suivante" aria-label="Révéler l’étape suivante""##
        } else {
            ""
        };
        let step_num = if total > 1 {
            format!(r##"<span class="focus-step-idx" aria-hidden="true">{:02}</span>"##, i + 1)
        } else {
            String::new()
        };
        steps_html.push_str(&format!(
            r##"<div class="{step_cls}"{hidden_attrs}>{step_num}<div class="focus-step-body">{step_html}</div></div>"##
        ));
    }

    let sol_wrap = if !st.focus_stmt_html.is_empty() {
        format!(
            r##"<div class="focus-sol"><span class="focus-section-eyebrow">Résolution</span><div class="focus-steps-stack">{steps_html}</div></div>"##
        )
    } else {
        format!(r##"<div class="focus-steps-stack">{steps_html}</div>"##)
    };

    let tap_hint = if is_step_mode && cur + 1 < total {
        r##"<p class="focus-tap-hint">Cliquez sur la suite masquée ou appuyez sur <kbd>→</kbd> / <kbd>Espace</kbd> pour avancer</p>"##
    } else {
        ""
    };

    let dots: String = if is_step_mode && total <= 14 {
        (0..total)
            .map(|i| {
                let cls = if i == cur {
                    "focus-dot is-now"
                } else if i < cur {
                    "focus-dot is-done"
                } else {
                    "focus-dot"
                };
                format!(
                    r##"<button type="button" class="{cls}" data-action="focus-goto" data-idx="{i}" aria-label="Aller à l’étape {}"></button>"##,
                    i + 1
                )
            })
            .collect()
    } else {
        String::new()
    };

    let foot_meta = if is_step_mode {
        format!(
            r##"<div class="focus-foot-meta"><span class="focus-step-label">Étape {} / {total}</span><div class="focus-dots">{dots}</div></div>"##,
            cur + 1
        )
    } else if let Some(pos) = nav_pos {
        format!(
            r##"<div class="focus-foot-meta"><span class="focus-step-label">Bloc {} / {}</span></div>"##,
            pos + 1,
            st.focus_nav.len()
        )
    } else {
        r##"<div class="focus-foot-meta"><span class="focus-step-label">Lecture focalisée</span></div>"##.to_string()
    };

    let controls_html = if is_step_mode {
        let prev_btn = format!(
            r##"<button type="button" class="btn sm focus-nav-btn" data-action="focus-prev"{}>← Précédent</button>"##,
            if cur == 0 { " disabled" } else { "" }
        );
        if cur + 1 < total {
            format!(
                r##"{prev_btn}<button type="button" class="btn primary sm focus-next-btn" data-action="focus-next">Étape suivante →</button>"##
            )
        } else {
            let restart = r##"<button type="button" class="btn sm focus-ghost-btn" data-action="focus-goto" data-idx="0" title="Reprendre depuis l’étape 1">Recommencer</button>"##;
            let next_or_close = match nav_pos.and_then(|p| st.focus_nav.get(p + 1)) {
                Some(nb) => format!(
                    r##"<button type="button" class="btn primary sm focus-next-btn" data-action="focus-nav-block" data-blk-idx="{}" title="Passer à : {}">Bloc suivant →</button>"##,
                    nb.blk_idx,
                    esc_attr(&nb.label)
                ),
                None => r##"<button type="button" class="btn primary sm focus-next-btn" data-action="focus-close">Terminer</button>"##.to_string(),
            };
            format!("{prev_btn}{restart}{next_or_close}")
        }
    } else {
        let next_blk_btn = match nav_pos.and_then(|p| st.focus_nav.get(p + 1)) {
            Some(nb) => format!(
                r##"<button type="button" class="btn sm focus-nav-btn" data-action="focus-nav-block" data-blk-idx="{}">{} →</button>"##,
                nb.blk_idx,
                esc(&nb.label)
            ),
            None => String::new(),
        };
        format!(
            r##"{next_blk_btn}<button type="button" class="btn primary sm focus-next-btn" data-action="focus-close">Fermer</button>"##
        )
    };

    format!(
        r##"<div class="focus-dlg__prog"><i style="width:{pct}%"></i></div>
          <header class="focus-dlg__head" data-k="{kind_attr}" data-ctype="{ctype_attr}">
            <div class="focus-dlg__id">
              <span class="focus-dlg__badge">{badge_ico}<span>{badge}</span></span>
              <span class="focus-dlg__mode-tag">{mode_tag}</span>
            </div>
            <div class="focus-dlg__head-actions">
              {mode_toggle_btn}
              {block_nav_btns}
              <button type="button" class="ib focus-close-btn" data-action="focus-close" aria-label="Fermer le mode Focus" title="Fermer (Échap)">{ico_x}</button>
            </div>
          </header>
          <div class="focus-dlg__body{stepping_cls}">
            {title_html}
            <div class="focus-dlg__content">{stmt_html}{sol_wrap}{extra_html}</div>
            {tap_hint}
          </div>
          <footer class="focus-dlg__foot">
            {foot_meta}
            <div class="focus-foot-controls">{controls_html}</div>
          </footer>"##,
        kind_attr = esc_attr(kind),
        ctype_attr = esc_attr(&st.focus_ctype),
        badge = esc(&st.focus_badge),
        ico_x = icon("xmark", 18, ""),
        stepping_cls = if is_step_mode && cur + 1 < total { " is-stepping" } else { "" },
        extra_html = st.focus_extra_html,
    )
}
