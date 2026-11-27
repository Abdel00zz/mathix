//! Class picker view (#/eleve) with concise editorial copy and smart Lycée / Collège switcher.

use serde_json::Value;
use crate::html::{esc, esc_attr, icon};
use crate::store::Store;

pub fn render_role_results(classes: &[Value], filter: &str, store: &Store) -> String {
    let cur_class = store.class_id().unwrap_or("");
    let filtered: Vec<&Value> = classes
        .iter()
        .filter(|c| {
            let id = c.get("id").and_then(Value::as_str).unwrap_or("");
            match filter {
                "lycee" => !id.contains("college"),
                "college" => id.contains("college"),
                _ => true,
            }
        })
        .collect();

    if filtered.is_empty() {
        return format!(
            r##"<div class="empty">{}<div>Aucune classe trouvée.</div></div>"##,
            icon("graduation", 22, "")
        );
    }

    let items: String = filtered
        .iter()
        .enumerate()
        .map(|(i, c)| {
            let id = c.get("id").and_then(Value::as_str).unwrap_or("");
            let title = c.get("title").and_then(Value::as_str).unwrap_or(id);
            let sub = c.get("subtitle").and_then(Value::as_str).unwrap_or("");
            let level = if id.contains("college") { "Collège" } else { "Lycée" };
            let is_cur = id == cur_class;
            let meta_lbl = if is_cur {
                "Actuelle".to_string()
            } else {
                format!("{:02} · {level}", i + 1)
            };
            let sub_txt = if !sub.is_empty() {
                sub.to_string()
            } else if id == "2eme-bac-sc-math" || id == "2eme-bac-sc-ex" {
                "Cours · Examens · Problèmes · Concours".into()
            } else if id == "1ere-bac-sc-math" || id == "tronc-commun-sc" {
                "Cours · Problèmes · Olympiades".into()
            } else {
                "Cours · Quiz · Exercices".into()
            };
            format!(
                r##"<li>
                  <a class="it{cur_cls}" href="#/eleve/{id_attr}" data-action="pick-class" data-class="{id_attr}">
                    <div>
                      <span class="rt2">{title_esc}</span>
                      <span class="sub2">{sub_esc}</span>
                    </div>
                    <span class="mt">{meta_esc}</span>
                    {chev}
                  </a>
                </li>"##,
                cur_cls = if is_cur { " is-cur" } else { "" },
                id_attr = esc_attr(id),
                title_esc = esc(title),
                sub_esc = esc(&sub_txt),
                meta_esc = esc(&meta_lbl),
                chev = icon("chevron-down", 15, "chev"),
            )
        })
        .collect();

    format!(r##"<ul class="lst" aria-label="Liste des classes">{items}</ul>"##)
}

const GOOGLE_G_SVG: &str = r##"<svg class="google-g-ico" width="15" height="15" viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M23.49 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.47c-.29 1.48-1.14 2.73-2.4 3.58v3h3.86c2.26-2.09 3.56-5.17 3.56-8.82z"/><path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.86-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96H1.29v3.09C3.26 21.3 7.31 24 12 24z"/><path fill="#FBBC05" d="M5.27 14.29c-.25-.72-.38-1.49-.38-2.29s.14-1.57.38-2.29V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.98-3.09z"/><path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.98 3.09c.95-2.85 3.6-4.96 6.73-4.96z"/></svg>"##;

fn render_role_google_auth(store: &Store) -> String {
    if let Some(ref u) = store.google_user {
        let dn = u.get("displayName").and_then(Value::as_str).unwrap_or("").trim();
        let email = u.get("email").and_then(Value::as_str).unwrap_or("").trim();
        let short = if !dn.is_empty() {
            dn.split_whitespace().next().unwrap_or(dn)
        } else if !email.is_empty() {
            email.split('@').next().unwrap_or(email)
        } else {
            "Connecté"
        };
        let tip = if email.is_empty() {
            "Synchronisé sur Cloud Firestore".to_string()
        } else {
            format!("Synchronisé ({email}) · Paramètres")
        };
        format!(
            r##"<div class="google-user-pill">
              <button type="button" class="google-user-chip" data-action="open-settings" title="{tip_a}">
                <span class="google-user-dot" aria-hidden="true"></span>
                <span class="google-user-name">{short_e}</span>
              </button>
              <button type="button" class="google-logout-btn" data-action="student-google-logout" title="Se déconnecter du compte Google">Déconnexion</button>
            </div>"##,
            tip_a = esc_attr(&tip),
            short_e = esc(short),
        )
    } else {
        format!(
            r##"<button type="button" class="google-auth-btn" data-action="student-google-login" title="Sauvegarder ma progression gratuitement avec mon compte Google">{GOOGLE_G_SVG}<span>Connexion Google</span></button>"##
        )
    }
}

pub fn render_role_picker(classes: &[Value], filter: &str, store: &Store, is_dark: bool) -> String {
    let total = classes.len();
    let lycee_n = classes
        .iter()
        .filter(|c| !c.get("id").and_then(Value::as_str).unwrap_or("").contains("college"))
        .count();
    let college_n = total.saturating_sub(lycee_n);
    let results_html = render_role_results(classes, filter, store);
    let theme_lbl = if is_dark { "Mode clair" } else { "Mode sombre" };
    let theme_ico = icon(if is_dark { "sun" } else { "moon" }, 18, "");
    let google_html = render_role_google_auth(store);

    format!(
        r##"<main class="page-main" id="classes-page">
          <header class="hero-header hero-header--compact">
            <div class="hero-top">
              <span class="hero-kicker">Classes</span>
              <div class="hero-actions">
                {google_html}
                <button type="button" class="hero-theme-btn" id="hero-theme-btn" data-action="sb-theme" data-theme-toggle="1" aria-label="{theme_lbl}" title="{theme_lbl}">
                  <span class="hero-theme-ico" data-theme-icon="1">{theme_ico}</span>
                </button>
              </div>
            </div>
            <h1 tabindex="-1">Votre classe</h1>
          </header>
          <div class="flt-dock">
            <div class="flt-row">
              <div class="exam-filters" role="group" aria-label="Cycle">
                <span class="ef-morph-pill" aria-hidden="true"></span>
                <button type="button" class="ef-btn" data-action="role-filter" data-filter="all" aria-pressed="{p_all}">Tous <em class="flt-cnt">{total}</em></button>
                <button type="button" class="ef-btn" data-action="role-filter" data-filter="lycee" aria-pressed="{p_lyc}">Lycée <em class="flt-cnt">{lycee_n}</em></button>
                <button type="button" class="ef-btn" data-action="role-filter" data-filter="college" aria-pressed="{p_col}">Collège <em class="flt-cnt">{college_n}</em></button>
              </div>
            </div>
          </div>
          <div id="role-results">{results_html}</div>
        </main>"##,
        p_all = filter == "all",
        p_lyc = filter == "lycee",
        p_col = filter == "college",
    )
}
