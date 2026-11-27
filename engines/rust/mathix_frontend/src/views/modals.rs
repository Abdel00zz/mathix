//! Student modals: Concise Official Curriculum Explorer, Help & Shortcuts, Media Lightbox.

use std::collections::BTreeMap;
use serde_json::Value;

use crate::html::{esc, esc_attr, format_class_name, icon};
use crate::math_html::render_math_inline;
use crate::orientation::{
    parse_curriculum, parse_method_tips, parse_orientation_paths,
};

#[derive(Clone, Debug)]
pub struct OrientationModalState {
    pub open: bool,
    pub class_id: String,
    pub active_tab: String, // "programme" | "conseils" | "filieres"
    pub detail_modes: BTreeMap<u32, String>, // chapter_id -> "contents" | "capacities" | "recommendations"
}

impl Default for OrientationModalState {
    fn default() -> Self {
        Self {
            open: false,
            class_id: "2eme-bac-sc-math".into(),
            active_tab: "programme".into(),
            detail_modes: BTreeMap::new(),
        }
    }
}

pub fn render_orientation_chapter_items(class_doc: Option<&Value>, ch_id: u32, mode: &str) -> String {
    let Some(doc) = class_doc else {
        return String::new();
    };
    let cur = parse_curriculum(doc);
    let Some(item) = cur.chapters.iter().find(|c| c.id == ch_id) else {
        return String::new();
    };
    let lines = match mode {
        "capacities" => &item.capacities,
        "recommendations" if !item.recommendations.is_empty() => &item.recommendations,
        _ => &item.contents,
    };
    lines
        .iter()
        .map(|l| format!("<li><span>{}</span></li>", render_math_inline(l)))
        .collect()
}

pub fn render_orientation_tab_content(
    st: &OrientationModalState,
    index_doc: Option<&Value>,
    class_doc: Option<&Value>,
) -> String {
    if st.active_tab == "programme" {
        if let Some(doc) = class_doc {
            let cur = parse_curriculum(doc);
            if cur.chapters.is_empty() {
                return r##"<div class="empty"><div>Programme en cours de mise à jour.</div></div>"##.into();
            }
            cur.chapters
                .iter()
                .enumerate()
                .map(|(idx, item)| {
                    let mode = st
                        .detail_modes
                        .get(&item.id)
                        .map(|s| s.as_str())
                        .unwrap_or("contents");
                    let lines = match mode {
                        "capacities" => &item.capacities,
                        "recommendations" if !item.recommendations.is_empty() => &item.recommendations,
                        _ => &item.contents,
                    };
                    let lis: String = lines
                        .iter()
                        .map(|l| format!("<li><span>{}</span></li>", render_math_inline(l)))
                        .collect();
                    let open_attr = if idx == 0 { " open" } else { "" };
                    let rec_btn = if item.recommendations.is_empty() {
                        String::new()
                    } else {
                        format!(
                            r##"<button type="button" data-action="orient-mode" data-ch="{}" data-mode="recommendations" aria-pressed="{}">Conseils</button>"##,
                            item.id,
                            mode == "recommendations",
                        )
                    };
                    format!(
                        r##"<details class="cr orient-ch" name="orient-ch"{open_attr}>
                          <summary>
                            <span class="cn">{:02}</span>
                            <b class="orient-title">{}</b>
                            {}
                          </summary>
                          <div class="bx">
                            <div class="orient-choices-wrap">
                              <div class="orient-choices" role="group" aria-label="Volet">
                                <button type="button" data-action="orient-mode" data-ch="{id}" data-mode="contents" aria-pressed="{m1}">Contenus</button>
                                <button type="button" data-action="orient-mode" data-ch="{id}" data-mode="capacities" aria-pressed="{m2}">Capacités</button>
                                {rec_btn}
                              </div>
                            </div>
                            <ul class="orient-list" id="orient-ch-list-{id}">{lis}</ul>
                          </div>
                        </details>"##,
                        idx + 1,
                        render_math_inline(&item.title),
                        icon("chevron-down", 15, "chev"),
                        id = item.id,
                        m1 = mode == "contents",
                        m2 = mode == "capacities",
                    )
                })
                .collect()
        } else {
            r##"<div class="empty"><div>Chargement…</div></div>"##.into()
        }
    } else if st.active_tab == "conseils" {
        if index_doc.is_none() {
            return r##"<div class="empty"><div>Chargement…</div></div>"##.into();
        }
        let tips = parse_method_tips(index_doc, &st.class_id);
        let cards: String = tips
            .iter()
            .enumerate()
            .map(|(idx, t)| {
                let lis: String = t.steps.iter().map(|s| format!("<li>{}</li>", render_math_inline(s))).collect();
                format!(
                    r##"<article class="orient-card">
                      <div class="orient-card__k">{:02}</div>
                      <h3 class="orient-card__t">{}</h3>
                      <p class="orient-card__p">{}</p>
                      <ul class="orient-req">{lis}</ul>
                    </article>"##,
                    idx + 1,
                    esc(&t.title),
                    esc(&t.summary),
                )
            })
            .collect();
        format!(r##"<div class="orient-cards">{cards}</div>"##)
    } else {
        if index_doc.is_none() {
            return r##"<div class="empty"><div>Chargement…</div></div>"##.into();
        }
        let paths = parse_orientation_paths(index_doc, &st.class_id);
        let cards: String = paths
            .iter()
            .map(|p| {
                format!(
                    r##"<article class="orient-card">
                      <div class="orient-card__k">{}</div>
                      <h3 class="orient-card__t">{}</h3>
                      <p class="orient-card__p">{}</p>
                      <p class="orient-req" style="padding-inline-start:0;margin-top:8px"><strong>Accès :</strong> {}</p>
                    </article>"##,
                    esc(&p.tag),
                    esc(&p.title),
                    esc(&p.description),
                    esc(&p.requirements),
                )
            })
            .collect();
        format!(r##"<div class="orient-cards">{cards}</div>"##)
    }
}

pub fn render_orientation_modal_body(
    st: &OrientationModalState,
    index_doc: Option<&Value>,
    class_doc: Option<&Value>,
    has_cadre: bool,
) -> (String, String) {
    let list_html = render_orientation_tab_content(st, index_doc, class_doc);
    let body = format!(
        r##"<div class="orient-tabs" id="orient-tabs" role="tablist" aria-label="Sections">
          <button type="button" role="tab" data-action="orient-tab" data-otab="programme" aria-selected="{t1}">Programme</button>
          <button type="button" role="tab" data-action="orient-tab" data-otab="conseils" aria-selected="{t2}">Méthode</button>
          <button type="button" role="tab" data-action="orient-tab" data-otab="filieres" aria-selected="{t3}">Filières</button>
        </div>
        <div id="orient-list">{list_html}</div>"##,
        t1 = st.active_tab == "programme",
        t2 = st.active_tab == "conseils",
        t3 = st.active_tab == "filieres",
    );

    let footer = if has_cadre {
        format!(
            r##"<a class="btn primary" href="#/eleve/{}/cadre" data-action="modal-close">Cadre référentiel</a>"##,
            esc_attr(&st.class_id)
        )
    } else {
        String::new()
    };
    (body, footer)
}

pub fn render_help_modal_body() -> String {
    let faq = [
        ("Rappel actif", "Notions repliées par défaut.", "Essayez de formuler chaque définition ou théorème avant de l’ouvrir. Double-cliquez sur un bloc pour passer en mode Focus."),
        ("Zones à révéler", "Étapes masquées.", "Cliquez sur les zones « ? » pour révéler une étape, ou ouvrez tout depuis le menu Options."),
        ("Progression", "Cours → Quiz → Exercices.", "Quiz débloqué à 10\u{00a0}% du cours, exercices à 15\u{00a0}% du quiz. Mode libre disponible dans Paramètres."),
        ("Raccourcis", "Clavier rapide.", "Quiz : <kbd>A</kbd>–<kbd>D</kbd> ou <kbd>1</kbd>–<kbd>4</kbd>, <kbd>Entrée</kbd> valide · <kbd>Ctrl</kbd>+<kbd>B</kbd> barre latérale · <kbd>Maj</kbd>+<kbd>D</kbd> thème."),
    ];
    let items: String = faq
        .iter()
        .enumerate()
        .map(|(i, (t, d, b))| {
            format!(
                r##"<details class="cr" name="help-faq"{}>
                  <summary><span class="cn">{:02}</span><span><b>{t}</b><small>{d}</small></span>{}</summary>
                  <div class="bx"><p style="margin:0; font-size:13.5px; line-height:1.58; color:var(--muted)">{b}</p></div>
                </details>"##,
                if i == 0 { " open" } else { "" },
                i + 1,
                icon("chevron-down", 15, "chev"),
            )
        })
        .collect();
    items
}

pub fn render_lightbox_html(src: &str, alt: &str, cap: &str) -> String {
    let cap_h = if cap.is_empty() {
        String::new()
    } else {
        format!(r##"<div class="media-lb__cap">{}</div>"##, render_math_inline(cap))
    };
    format!(
        r##"<div class="media-lb__wrap">
          <button class="ib media-lb__close" type="button" data-action="lightbox-close" aria-label="Fermer">{}</button>
          <img class="media-lb__img" src="{}" alt="{}" decoding="async" referrerpolicy="no-referrer" />
          {cap_h}
        </div>"##,
        icon("xmark", 20, ""),
        esc_attr(src),
        esc_attr(alt),
    )
}

pub fn orientation_subtitle(class_id: &str) -> String {
    format_class_name(class_id)
}
