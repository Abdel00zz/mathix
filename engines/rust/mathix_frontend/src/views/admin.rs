//! Admin Console views (strictly compiled only with `--features admin`).

use std::collections::BTreeMap;
use serde_json::{json, Value};

use crate::html::{esc, esc_attr, format_class_name, icon, search_matches, url_encode};
use crate::router::build_student_href_for_path;
use crate::store::Store;

#[derive(Clone, Debug, Default)]
pub struct AdminState {
    pub collapsed: bool,
    pub drawer_open: bool,
    pub tab: String,
    pub tree_search: String,
    pub open_classes: Vec<String>,
    pub selected_chapter: Option<(String, String)>,
    pub selected_manifest: Option<Value>,
    pub audit_running: bool,
    pub audit_pending: bool,
    pub audit_reports: Vec<Value>,
    pub journal_filter: String,
    pub ov_path_input: String,
    pub ov_title_input: String,
    pub login_error: Option<String>,
    pub auth_mode: String,
    pub auth_loading: bool,
    pub remaining_attempts: Option<u64>,
    pub retry_after_sec: Option<u64>,
    pub session_expires_at: Option<u64>,
    pub backend_kind: String,
    pub persistence_kind: String,
    pub server_health: Option<Value>,
    pub last_sync_at: Option<u64>,
    pub media_items: Vec<Value>,
    pub media_loading: bool,
}

fn fmt_session_remaining(expires_at: u64, now_ms: u64) -> String {
    if expires_at <= now_ms {
        return "Expirée".into();
    }
    let rem_min = (expires_at - now_ms) / 60_000;
    if rem_min >= 60 {
        format!("{}h{:02}", rem_min / 60, rem_min % 60)
    } else {
        format!("{} min", rem_min.max(1))
    }
}

pub fn render_admin_login(st: &AdminState, is_dark: bool) -> String {
    let locked = st.retry_after_sec.filter(|&s| s > 0);
    let err_html = match st.login_error.as_deref() {
        Some(msg) => {
            let extra = if let Some(sec) = locked {
                let mins = (sec + 59) / 60;
                format!(r##"<span class="adm-alert__meta">Verrouillage actif · {mins} min</span>"##)
            } else if let Some(rem) = st.remaining_attempts.filter(|&r| r > 0 && r <= 3) {
                let plur = if rem > 1 { "tentatives restantes" } else { "tentative restante" };
                format!(r##"<span class="adm-alert__meta">{rem} {plur}</span>"##)
            } else {
                String::new()
            };
            format!(
                r##"<div class="adm-alert" role="alert">
                  <span class="adm-alert__ico">{ico_warn}</span>
                  <div class="adm-alert__body">
                    <span class="adm-alert__msg">{msg_esc}</span>
                    {extra}
                  </div>
                </div>"##,
                ico_warn = icon("warning", 16, ""),
                msg_esc = esc(msg),
            )
        }
        None => String::new(),
    };

    let is_setup = st.auth_mode == "setup";
    let is_disabled = st.auth_loading || locked.is_some();
    let disabled = if is_disabled { " disabled" } else { "" };
    let ico_eye = icon("eye", 17, "");
    let ico_eye_off = icon("eye-off", 17, "");
    let ico_shield = icon("shield", 16, "");
    let ico_lock = icon("lock", 16, "");
    let theme_lbl = if is_dark { "Mode clair" } else { "Mode sombre" };
    let theme_ico = icon(if is_dark { "sun" } else { "moon" }, 18, "");

    let form_html = if st.auth_mode == "checking" {
        r##"<div class="adm-login-loading" aria-busy="true">
          <div class="skeleton" style="height:44px;border-radius:10px"></div>
          <div class="skeleton" style="height:42px;border-radius:10px;margin-top:12px"></div>
        </div>"##
            .to_string()
    } else if is_setup {
        format!(
            r##"<p class="adm-login-sub">Première configuration : définissez un code robuste (10 caractères minimum). Il est haché côté serveur.</p>
            <form id="adm-claim-form" class="adm-login-form" data-action="admin-claim" novalidate>
              <div class="adm-fld-grp">
                <label class="adm-fld-lbl" for="adm-pass">Nouveau code d’accès</label>
                <div class="adm-pass-wrap">
                  <input id="adm-pass" class="adm-pass-inp" name="pass" type="password" minlength="10" maxlength="128" autocomplete="new-password" placeholder="Minimum 10 caractères…" required autofocus{disabled} />
                  <button type="button" class="adm-pass-eye" data-toggle-pass="adm-pass" aria-label="Afficher le code" aria-pressed="false" title="Afficher / Masquer">
                    <span class="adm-eye-show">{ico_eye}</span>
                    <span class="adm-eye-hide" hidden>{ico_eye_off}</span>
                  </button>
                </div>
                <div class="adm-strength" id="adm-strength" data-score="0" aria-live="polite">
                  <div class="adm-strength__bars" aria-hidden="true"><i></i><i></i><i></i><i></i></div>
                  <span class="adm-strength__txt" id="adm-strength-txt">Saisissez au moins 10 caractères</span>
                </div>
                <ul class="adm-rules" id="adm-rules" aria-label="Exigences de sécurité">
                  <li data-rule="len">10+ car.</li>
                  <li data-rule="case">Maj. &amp; min.</li>
                  <li data-rule="num">Chiffre / symbole</li>
                </ul>
              </div>
              <div class="adm-fld-grp">
                <label class="adm-fld-lbl" for="adm-pass-confirm">Confirmer le code</label>
                <div class="adm-pass-wrap">
                  <input id="adm-pass-confirm" class="adm-pass-inp" name="confirm" type="password" minlength="10" maxlength="128" autocomplete="new-password" placeholder="Répétez le code…" required{disabled} />
                  <button type="button" class="adm-pass-eye" data-toggle-pass="adm-pass-confirm" aria-label="Afficher la confirmation" aria-pressed="false" title="Afficher / Masquer">
                    <span class="adm-eye-show">{ico_eye}</span>
                    <span class="adm-eye-hide" hidden>{ico_eye_off}</span>
                  </button>
                </div>
              </div>
              <p class="adm-caps" id="adm-caps-warn" hidden role="status">Verr. Maj activé</p>
              {err_html}
              <button class="adm-submit" type="submit"{disabled}>{ico_shield}<span>{btn_lbl}</span></button>
            </form>"##,
            btn_lbl = if st.auth_loading {
                "Initialisation…"
            } else {
                "Initialiser la console"
            },
        )
    } else {
        format!(
            r##"<p class="adm-login-sub">Accès réservé à l’équipe éditoriale Mathix.</p>
            <form id="adm-login-form" class="adm-login-form" data-action="admin-login" novalidate>
              <div class="adm-fld-grp">
                <label class="adm-fld-lbl" for="adm-pass">Code d’accès</label>
                <div class="adm-pass-wrap">
                  <input id="adm-pass" class="adm-pass-inp" name="pass" type="password" maxlength="128" autocomplete="current-password" placeholder="Saisissez votre code…" required autofocus{disabled} />
                  <button type="button" class="adm-pass-eye" data-toggle-pass="adm-pass" aria-label="Afficher le code" aria-pressed="false" title="Afficher / Masquer">
                    <span class="adm-eye-show">{ico_eye}</span>
                    <span class="adm-eye-hide" hidden>{ico_eye_off}</span>
                  </button>
                </div>
              </div>
              <p class="adm-caps" id="adm-caps-warn" hidden role="status">Verr. Maj activé</p>
              {err_html}
              <button class="adm-submit" type="submit"{disabled}>{ico_lock}<span>{btn_lbl}</span></button>
            </form>"##,
            btn_lbl = if st.auth_loading {
                "Vérification…"
            } else if locked.is_some() {
                "Accès temporairement verrouillé"
            } else {
                "Se connecter"
            },
        )
    };

    format!(
        r##"<main class="page-main adm-login-stage">
          <section class="admin-login" aria-labelledby="adm-login-title">
            <header class="adm-login-head">
              <div class="adm-login-brand">
                <span class="adm-sb__mark" aria-hidden="true">M</span>
                <div class="adm-login-brand-txt">
                  <strong>Mathix</strong>
                  <span class="adm-login-tag">Administration</span>
                </div>
              </div>
              <button type="button" class="hero-theme-btn" id="hero-theme-btn" data-action="sb-theme" data-theme-toggle="1" aria-label="{theme_lbl}" title="{theme_lbl}">
                <span class="hero-theme-ico" data-theme-icon="1">{theme_ico}</span>
              </button>
            </header>

            <h1 id="adm-login-title" class="adm-login-title">{title}</h1>
            {form_html}

            <footer class="adm-login-foot">
              <div class="adm-sec-strip">
                <span class="adm-sec-item"><span class="adm-sec-ico">{ico_shield}</span><span>Accès chiffré</span></span>
                <span class="adm-sec-sep" aria-hidden="true">·</span>
                <span class="adm-sec-item">Session mémoire</span>
                <span class="adm-sec-sep" aria-hidden="true">·</span>
                <span class="adm-sec-item">Anti&#8209;force&#8209;brute</span>
              </div>
              <a class="adm-back-link" href="../">← Retour à l’espace élève</a>
            </footer>
          </section>
        </main>"##,
        title = if is_setup {
            "Initialiser l’accès"
        } else {
            "Connexion sécurisée"
        },
    )
}

pub fn render_admin_shell(
    st: &AdminState,
    store: &Store,
    panel_html: &str,
    is_dark: bool,
    now_ms: u64,
) -> String {
    let cid = store.class_id().unwrap_or("2eme-bac-sc-math");
    let student_href = format!("../#/eleve/{}", url_encode(cid));
    let pending_users = store
        .users
        .as_array()
        .map(|a| a.iter().filter(|u| u["status"].as_str() == Some("pending")).count())
        .unwrap_or(0);
    let ov_count = store.overrides.as_object().map(|m| m.len()).unwrap_or(0);

    let render_item = |id: &str, label: &str, ico: &str, badge: usize| -> String {
        let active = st.tab == id;
        let badge_h = if badge > 0 {
            format!(r##"<span class="adm-sb__cnt">{badge}</span>"##)
        } else {
            String::new()
        };
        format!(
            r##"<button type="button" class="adm-sb__item{act}" data-action="admin-tab" data-tab="{id}" data-tip="{label}" aria-current="{cur}">
              <span class="adm-sb__ico">{i}</span>
              <span class="adm-sb__lbl">{label}</span>
              {badge_h}
            </button>"##,
            act = if active { " is-active" } else { "" },
            cur = if active { "page" } else { "false" },
            i = icon(ico, 17, ""),
        )
    };

    let grp_pilotage = [
        render_item("dashboard", "Tableau de bord", "chart", 0),
        render_item("stats", "Suivi élèves", "target", 0),
        render_item("journal", "Journal", "history", 0),
    ]
    .join("");
    let grp_edition = [
        render_item("studio", "Studio éditorial", "edit", 0),
        render_item("pilotage", "Catalogue & Audit", "database", 0),
        render_item("contenu", "Publications", "upload", ov_count),
    ]
    .join("");
    let grp_acces = render_item("users", "Utilisateurs", "users", pending_users);

    let page_title = match st.tab.as_str() {
        "studio" => "Studio éditorial",
        "pilotage" => "Catalogue & Audit",
        "contenu" => "Publications actives",
        "stats" => "Suivi élèves",
        "users" => "Utilisateurs",
        "journal" => "Journal d’activité",
        _ => "Tableau de bord",
    };

    let is_studio = st.tab == "studio";

    let change_pass_btn = if st.auth_mode == "claimed" {
        format!(
            r##"<button type="button" class="adm-sb__item" data-action="admin-passcode-modal" data-tip="Changer le code">
                <span class="adm-sb__ico">{ico_sh}</span>
                <span class="adm-sb__lbl">Changer le code</span>
              </button>"##,
            ico_sh = icon("shield", 16, ""),
        )
    } else {
        String::new()
    };

    let session_btn = match st.session_expires_at {
        Some(exp) if exp > 0 => {
            let rem = if now_ms > 0 { fmt_session_remaining(exp, now_ms) } else { "4h00".into() };
            format!(
                r##"<button type="button" class="btn sm" id="adm-session-btn" data-action="admin-refresh-session" title="Cliquer pour prolonger la session de 4 heures">{ico_sh} Session · {rem}</button>"##,
                ico_sh = icon("shield", 14, ""),
            )
        }
        _ => String::new(),
    };

    format!(
        r##"<div class="adm-shell{col_cls}" id="adm-shell">
          <div class="adm-backdrop" id="adm-backdrop" data-action="admin-close-drawer"{bd_hid}></div>
          <aside class="adm-sb{drw_cls}" id="adm-sb" aria-label="Navigation administration">
            <div class="adm-sb__head">
              <div class="adm-sb__brand">
                <span class="adm-sb__mark">M</span>
                <div class="adm-sb__title">
                  <strong>Mathix Admin</strong>
                  <small>Rust · WASM</small>
                </div>
              </div>
              <button type="button" class="ib adm-sb__toggle" id="adm-sb-toggle" data-action="admin-toggle-sb" aria-expanded="{exp}" aria-label="Replier la barre latérale">{ico_sb}</button>
            </div>

            <nav class="adm-sb__nav">
              <div class="adm-sb__group">
                <div class="adm-sb__glabel">Pilotage</div>
                {grp_pilotage}
              </div>
              <div class="adm-sb__group">
                <div class="adm-sb__glabel">Édition</div>
                {grp_edition}
              </div>
              <div class="adm-sb__group">
                <div class="adm-sb__glabel">Accès</div>
                {grp_acces}
              </div>
            </nav>

            <div class="adm-sb__foot">
              <a class="adm-sb__item" id="adm-student-link" href="{student_href}" data-tip="Vue élève">
                <span class="adm-sb__ico">{ico_ext}</span>
                <span class="adm-sb__lbl">Vue élève</span>
              </a>
              {change_pass_btn}
              <button type="button" class="adm-sb__item" data-action="admin-theme" data-tip="{th_lbl}">
                <span class="adm-sb__ico">{ico_th}</span>
                <span class="adm-sb__lbl">{th_lbl}</span>
              </button>
              <button type="button" class="adm-sb__item adm-sb__item--danger" id="admin-logout" data-action="admin-logout" data-tip="Déconnexion">
                <span class="adm-sb__ico">{ico_out}</span>
                <span class="adm-sb__lbl">Déconnexion</span>
              </button>
            </div>
          </aside>

          <div class="adm-main">
            <header class="adm-topbar">
              <div class="adm-topbar__left">
                <button type="button" class="ib adm-mobile-btn" data-action="admin-toggle-drawer" aria-label="Menu">{ico_menu}</button>
                <div class="adm-crumb">
                  <span class="adm-crumb__root">Mathix</span>
                  <span class="adm-crumb__sep">/</span>
                  <h1 class="adm-crumb__cur">{page_title}</h1>
                </div>
              </div>
              <div class="adm-topbar__right">
                {session_btn}
                <button type="button" class="btn sm" id="adm-cloud-sync" data-action="cloud-sync" title="Synchroniser avec Redis / Cloud">{ico_sync} Synchroniser</button>
                <a class="btn sm" id="adm-top-student" href="{student_href}">{ico_ext} Espace élève</a>
              </div>
            </header>
            <div class="adm-content{st_c}">
              <div class="admin-panel{st_p}" id="admin-panel">{panel_html}</div>
            </div>
          </div>
        </div>"##,
        col_cls = if st.collapsed { " is-collapsed" } else { "" },
        bd_hid = if st.drawer_open { "" } else { " hidden" },
        drw_cls = if st.drawer_open { " is-open" } else { "" },
        exp = !st.collapsed,
        ico_sb = icon(if st.collapsed { "panel-left-open" } else { "panel-left-close" }, 17, ""),
        ico_ext = icon("external", 15, ""),
        ico_th = icon(if is_dark { "sun" } else { "moon" }, 17, ""),
        th_lbl = if is_dark { "Thème clair" } else { "Thème sombre" },
        ico_out = icon("logout", 16, ""),
        ico_menu = icon("menu", 18, ""),
        ico_sync = icon("refresh", 14, ""),
        st_c = if is_studio { " is-studio" } else { "" },
        st_p = if is_studio { " admin-panel--studio" } else { "" },
    )
}

pub fn render_admin_dashboard(
    classes: &[Value],
    class_cache: &BTreeMap<String, Value>,
    store: &Store,
    st: &AdminState,
    now_ms: u64,
) -> String {
    let mut tot_ch = 0usize;
    let mut tot_rev = 0usize;
    let mut tot_qz = 0usize;
    let mut rows = String::new();

    for c in classes {
        let cid = c["id"].as_str().unwrap_or("");
        let title = c["title"].as_str().unwrap_or(cid);
        let (ch_n, rev_n, qz_n) = if let Some(doc) = class_cache.get(cid) {
            let chs = doc["chapters"].as_array().cloned().unwrap_or_default();
            let rn: usize = chs.iter().map(|ch| ch["revisions"].as_array().map(|a| a.len()).unwrap_or(0)).sum();
            let qn: usize = chs.iter().map(|ch| ch["quizzes"].as_array().map(|a| a.len()).unwrap_or(0)).sum();
            (chs.len(), rn, qn)
        } else {
            (0, 0, 0)
        };
        tot_ch += ch_n;
        tot_rev += rev_n;
        tot_qz += qz_n;

        rows.push_str(&format!(
            r##"<tr>
              <td><strong>{title_esc}</strong><div class="t-mono body-muted" style="font-size:11.5px">{cid_esc}</div></td>
              <td>{ch_n}</td>
              <td>{rev_n}</td>
              <td>{qz_n}</td>
              <td>
                <div class="user-row-actions">
                  <a class="btn sm" href="../#/eleve/{cid_enc}">{ico_ext} Élève</a>
                  <button type="button" class="btn sm" data-action="admin-open-class" data-class="{cid_attr}">{ico_db} Catalogue</button>
                </div>
              </td>
            </tr>"##,
            title_esc = esc(title),
            cid_esc = esc(cid),
            cid_enc = url_encode(cid),
            cid_attr = esc_attr(cid),
            ico_ext = icon("external", 13, ""),
            ico_db = icon("database", 13, ""),
        ));
    }

    let ov_count = store.overrides.as_object().map(|m| m.len()).unwrap_or(0);
    let pending = store
        .users
        .as_array()
        .map(|a| a.iter().filter(|u| u["status"].as_str() == Some("pending")).count())
        .unwrap_or(0);

    let health_strip = if let Some(ref h) = st.server_health {
        let backend = h["backend"].as_str().unwrap_or(if st.backend_kind.is_empty() { "serveur" } else { &st.backend_kind });
        let persistence = h["persistence"].as_str().unwrap_or(if st.persistence_kind.is_empty() { "local" } else { &st.persistence_kind });
        let rev = h["rev"].as_u64().unwrap_or(0);
        let pub_rev = h["pubRev"].as_u64().unwrap_or(0);
        let math_v = h["engines"]["math"]
            .as_str()
            .unwrap_or("math")
            .split('(')
            .next()
            .unwrap_or("math")
            .trim();
        let json_v = h["engines"]["json"]
            .as_str()
            .unwrap_or("json")
            .split('(')
            .next()
            .unwrap_or("json")
            .trim();
        let sync_lbl = match st.last_sync_at {
            Some(ts) if now_ms >= ts => {
                let sec = (now_ms - ts) / 1000;
                if sec < 60 { format!("Synchro il y a {sec}s") } else { format!("Synchro il y a {} min", sec / 60) }
            }
            _ => "Synchro active".into(),
        };
        format!(
            r##"<div class="adm-health-strip" style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin:0 0 18px;padding:10px 14px;border:1px solid var(--line);border-radius:10px;background:var(--surf-2,var(--surf))">
              <span class="badge badge--ok">Backend · {b_e}</span>
              <span class="badge">Stockage · {p_e}</span>
              <span class="badge">{m_e} · {j_e}</span>
              <span class="badge">Rév. #{rev} · Pub #{pub_rev}</span>
              <span class="body-muted" style="margin-inline-start:auto;font-size:12px">{sync_lbl}</span>
            </div>"##,
            b_e = esc(backend),
            p_e = esc(persistence),
            m_e = esc(math_v),
            j_e = esc(json_v),
        )
    } else {
        String::new()
    };

    format!(
        r##"<div class="kpi-grid">
          <div class="kpi"><div class="kpi__value">{cls_n}</div><div class="kpi__label">Classes publiées</div></div>
          <div class="kpi"><div class="kpi__value">{tot_ch}</div><div class="kpi__label">Chapitres</div></div>
          <div class="kpi"><div class="kpi__value">{tot_rev}</div><div class="kpi__label">Fiches de cours</div></div>
          <div class="kpi"><div class="kpi__value">{tot_qz}</div><div class="kpi__label">Quiz</div></div>
          <div class="kpi"><div class="kpi__value">{ov_count}</div><div class="kpi__label">Publications actives</div></div>
          <div class="kpi"><div class="kpi__value" style="color:{pcol}">{pending}</div><div class="kpi__label">Comptes en attente</div></div>
        </div>
        {health_strip}
        <div class="table-wrap"><table class="data">
          <thead><tr><th>Classe</th><th>Chapitres</th><th>Fiches</th><th>Quiz</th><th>Accès rapide</th></tr></thead>
          <tbody>{rows}</tbody>
        </table></div>"##,
        cls_n = classes.len(),
        pcol = if pending > 0 { "var(--am)" } else { "var(--ink)" },
    )
}

pub fn render_admin_users(store: &Store) -> String {
    let users = store.users.as_array().cloned().unwrap_or_default();
    let rows: String = users
        .iter()
        .map(|u| {
            let id = u["id"].as_str().unwrap_or("");
            let name = u["name"].as_str().unwrap_or("");
            let phone = u["phone"].as_str().unwrap_or("—");
            let cid = u["classId"].as_str().unwrap_or("");
            let role = u["role"].as_str().unwrap_or("student");
            let status = u["status"].as_str().unwrap_or("approved");
            let acts = if status == "pending" {
                format!(
                    r##"<button class="btn sm" type="button" data-action="admin-user-status" data-id="{id_a}" data-status="approved" title="Valider">{c}</button>
                       <button class="btn danger sm" type="button" data-action="admin-user-status" data-id="{id_a}" data-status="rejected" title="Rejeter">{x}</button>"##,
                    id_a = esc_attr(id),
                    c = icon("check", 14, ""),
                    x = icon("xmark", 14, ""),
                )
            } else {
                format!(
                    r##"<button class="btn danger sm" type="button" data-action="admin-user-del" data-id="{id_a}" title="Supprimer">{t}</button>"##,
                    id_a = esc_attr(id),
                    t = icon("trash", 14, ""),
                )
            };
            format!(
                r##"<tr>
                  <td><strong>{name_e}</strong><div class="t-mono body-muted" style="font-size:12px">{phone_e}</div></td>
                  <td>{cls_e}</td>
                  <td><span class="badge {r_cls}">{r_lbl}</span></td>
                  <td><span class="badge {s_cls}">{s_lbl}</span></td>
                  <td><div class="user-row-actions">{acts}</div></td>
                </tr>"##,
                name_e = esc(name),
                phone_e = esc(phone),
                cls_e = esc(&format_class_name(cid)),
                r_cls = if role == "prof" { "badge--accent" } else { "badge--ok" },
                r_lbl = if role == "prof" { "Professeur" } else { "Élève" },
                s_cls = match status { "approved" => "badge--ok", "pending" => "badge--am", _ => "badge--err" },
                s_lbl = match status { "approved" => "Validé", "pending" => "En attente", _ => "Rejeté" },
            )
        })
        .collect();

    format!(
        r##"<div style="display:flex;gap:10px;align-items:center;margin-bottom:16px;flex-wrap:wrap">
          <button class="btn primary sm" type="button" data-action="admin-add-user-modal" style="height:36px">{ico_p} Ajouter un compte</button>
          <span class="badge" style="margin-inline-start:auto">{n} compte(s)</span>
        </div>
        <div class="table-wrap"><table class="data">
          <thead><tr><th>Compte</th><th>Classe</th><th>Rôle</th><th>Statut</th><th>Actions</th></tr></thead>
          <tbody>{rows}</tbody>
        </table></div>"##,
        ico_p = icon("plus", 15, ""),
        n = users.len(),
    )
}

pub fn render_admin_pilotage(
    classes: &[Value],
    class_cache: &BTreeMap<String, Value>,
    st: &AdminState,
) -> String {
    let q = st.tree_search.trim();
    let mut tree_html = String::new();
    for c in classes {
        let cid = c["id"].as_str().unwrap_or("");
        let ctitle = c["title"].as_str().unwrap_or(cid);
        let chs = class_cache
            .get(cid)
            .and_then(|d| d["chapters"].as_array())
            .cloned()
            .unwrap_or_default();
        let matched = q.is_empty()
            || search_matches(ctitle, q)
            || search_matches(cid, q)
            || chs.iter().any(|ch| search_matches(ch["title"].as_str().unwrap_or(""), q));
        if !matched {
            continue;
        }
        let is_open = st.open_classes.iter().any(|x| x == cid);
        tree_html.push_str(&format!(
            r##"<button class="tree-row" type="button" data-action="admin-tree-class" data-class="{cid_a}">{ico}<span>{title_e}</span></button>"##,
            cid_a = esc_attr(cid),
            ico = icon("folder", 15, ""),
            title_e = esc(ctitle),
        ));
        if is_open {
            let mut ch_rows = String::new();
            for ch in &chs {
                let chid = ch["id"].as_str().unwrap_or("");
                let cht = ch["title"].as_str().unwrap_or(chid);
                if !q.is_empty() && !search_matches(cht, q) && !search_matches(ctitle, q) {
                    continue;
                }
                let r_n = ch["revisions"].as_array().map(|a| a.len()).unwrap_or(0);
                let q_n = ch["quizzes"].as_array().map(|a| a.len()).unwrap_or(0);
                ch_rows.push_str(&format!(
                    r##"<button class="tree-row tree-row--depth1" type="button" data-action="admin-tree-ch" data-class="{cid_a}" data-ch="{chid_a}">
                      {ico}<span>{cht_e}</span><span class="tree-count">{r_n}f · {q_n}q</span>
                    </button>"##,
                    cid_a = esc_attr(cid),
                    chid_a = esc_attr(chid),
                    ico = icon("book-open", 14, ""),
                    cht_e = esc(cht),
                ));
            }
            tree_html.push_str(&format!(r##"<div>{ch_rows}</div>"##));
        }
    }

    let detail_html = if let Some((ref cid, ref chid)) = st.selected_chapter {
        if let Some(man) = &st.selected_manifest {
            let revs = man["revisions"].as_array().cloned().unwrap_or_default();
            let qzs = man["quizzes"].as_array().cloned().unwrap_or_default();
            let exs = man["exercises"].as_array().cloned().unwrap_or_default();
            let render_row = |r: &Value, ico: &str| -> String {
                let p = r["path"].as_str().unwrap_or("");
                let st_href = build_student_href_for_path(p, "../");
                let st_btn = st_href
                    .map(|h| format!(r##"<a class="btn sm" href="{h}">{} Élève</a>"##, icon("external", 13, "")))
                    .unwrap_or_default();
                format!(
                    r##"<div class="valid-row is-ok">
                      {ic}
                      <span class="file-path">{p_e}</span>
                      <div class="user-row-actions" style="margin-inline-start:auto;flex:none">
                        <a class="btn sm" href="#/studio?path={p_enc}">{ed} Studio</a>
                        {st_btn}
                      </div>
                    </div>"##,
                    ic = icon(ico, 15, ""),
                    p_e = esc(p),
                    p_enc = url_encode(p),
                    ed = icon("edit", 13, ""),
                )
            };
            let mut rows = String::new();
            for r in &revs { rows.push_str(&render_row(r, "file")); }
            for r in &qzs { rows.push_str(&render_row(r, "square-root")); }
            for r in &exs { rows.push_str(&render_row(r, "calculator")); }
            format!(
                r##"<div class="sec"><h2>{} / {}</h2><span>{} fichier(s)</span></div><div class="valid-report">{rows}</div>"##,
                esc(cid),
                esc(chid),
                revs.len() + qzs.len() + exs.len(),
            )
        } else {
            r##"<div class="skeleton" style="height:80px"></div>"##.into()
        }
    } else {
        format!(r##"<div class="empty">{}<div>Sélectionnez une classe puis un chapitre pour inspecter ses ressources et les ouvrir dans le Studio ou côté élève.</div></div>"##, icon("folder", 24, ""))
    };

    let audit_rows: String = st
        .audit_reports
        .iter()
        .map(|r| {
            let ok = r["valid"].as_bool().unwrap_or(false);
            let path = r["path"].as_str().unwrap_or("");
            let kind = r["kind"].as_str().unwrap_or("class");
            let ch = r["chapters"].as_u64().unwrap_or(0);
            let errs = r["errors"].as_u64().unwrap_or(0);
            let meta = if kind == "override" {
                format!("Publication · {errs} err.")
            } else {
                format!("{ch} ch. · {errs} err.")
            };
            let details: String = r["messages"]
                .as_array()
                .map(|arr| {
                    arr.iter()
                        .take(3)
                        .filter_map(Value::as_str)
                        .map(|m| format!(r##"<div class="body-muted" style="font-size:12px;margin-top:3px">• {}</div>"##, esc(m)))
                        .collect()
                })
                .unwrap_or_default();
            format!(
                r##"<div class="valid-row {cls}" style="flex-wrap:wrap">
                  {ico}
                  <span class="file-path">{path_e}</span>
                  <span class="valid-meta">{meta}</span>
                  {det_wrap}
                </div>"##,
                cls = if ok { "is-ok" } else { "is-ko" },
                ico = icon(if ok { "circle-check" } else { "warning" }, 15, ""),
                path_e = esc(path),
                det_wrap = if details.is_empty() {
                    String::new()
                } else {
                    format!(r##"<div style="flex-basis:100%;padding-left:22px">{details}</div>"##)
                },
            )
        })
        .collect();

    let status_txt = if st.audit_running || st.audit_pending {
        "Audit Rust/WASM en cours (chargement du catalogue)…".into()
    } else if !st.audit_reports.is_empty() {
        let ko = st.audit_reports.iter().filter(|r| !r["valid"].as_bool().unwrap_or(false)).count();
        format!("{} élément(s) audité(s) · {ko} anomalie(s)", st.audit_reports.len())
    } else {
        "Schémas + Fiches + LaTeX + Publications actives".into()
    };

    format!(
        r##"<div style="display:flex;gap:10px;margin-bottom:16px;flex-wrap:wrap;align-items:center">
          <button class="btn primary sm" id="btn-audit" type="button" data-action="admin-run-audit" style="height:36px">{ico_sh} Audit complet (Rust/WASM)</button>
          <span class="badge badge--bl" id="audit-status">{status_txt}</span>
          <div class="orient-search" style="margin-inline-start:auto;max-width:260px">
            {ico_s}
            <input type="search" id="tree-search" data-action="admin-tree-search" value="{q_val}" placeholder="Filtrer le catalogue…" autocomplete="off" />
          </div>
        </div>
        <div class="valid-report" id="audit-report" style="margin-bottom:16px">{audit_rows}</div>
        <div class="pilotage-grid">
          <div class="content-tree" id="content-tree">{tree_html}</div>
          <div id="tree-detail" style="min-height:200px">{detail_html}</div>
        </div>"##,
        ico_sh = icon("shield", 15, ""),
        ico_s = icon("search", 14, ""),
        q_val = esc_attr(&st.tree_search),
    )
}

pub fn render_admin_content(store: &Store, _st: &AdminState) -> String {
    let ovs = store.overrides.as_object();
    let count = ovs.map(|m| m.len()).unwrap_or(0);
    let rows: String = ovs
        .map(|m| {
            m.iter()
                .map(|(p, v)| {
                    let st_href = build_student_href_for_path(p, "../");
                    let st_btn = st_href
                        .map(|h| format!(r##"<a class="btn sm" href="{h}">{} Élève</a>"##, icon("external", 13, "")))
                        .unwrap_or_default();
                    let t = v["title"].as_str().unwrap_or("");
                    format!(
                        r##"<div class="pub-row">
                          {ico_f}
                          <div style="flex:1;min-width:0">
                            <div class="pub-row__title">{p_e}</div>
                            <div class="pub-row__body">{t_e}</div>
                          </div>
                          <div class="user-row-actions">
                            <a class="btn sm" href="#/studio?path={p_enc}">{ico_ed} Studio</a>
                            {st_btn}
                            <button class="ib" type="button" data-action="admin-ov-del" data-path="{p_attr}" title="Supprimer">{ico_tr}</button>
                          </div>
                        </div>"##,
                        ico_f = icon("file", 16, ""),
                        p_e = esc(p),
                        t_e = esc(if t.is_empty() { "Publication active (validée Rust)" } else { t }),
                        p_enc = url_encode(p),
                        ico_ed = icon("edit", 13, ""),
                        p_attr = esc_attr(p),
                        ico_tr = icon("trash", 15, ""),
                    )
                })
                .collect()
        })
        .unwrap_or_default();

    let list_html = if count > 0 {
        rows
    } else {
        format!(r##"<div class="empty">{}<div>Aucune publication active.</div></div>"##, icon("folder", 24, ""))
    };

    format!(
        r##"<div style="max-width:760px">
          <p class="body-muted" style="margin:0 0 18px">Publiez un remplacement de fichier : la session élève charge immédiatement la version validée par Rust/WASM.</p>
          <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:24px">
            <a class="btn primary" href="#/studio">{ico_ed} Ouvrir le Studio éditorial</a>
            {clear_btn}
          </div>
          <div class="sec"><h2>Publications actives</h2><span>{count}</span></div>
          <div>{list_html}</div>
        </div>"##,
        ico_ed = icon("edit", 15, ""),
        clear_btn = if count > 0 {
            format!(r##"<button class="btn danger" type="button" data-action="admin-ov-clear" style="height:44px">{} Tout annuler ({count})</button>"##, icon("trash", 15, ""))
        } else {
            String::new()
        },
    )
}

pub fn render_admin_stats(store: &Store) -> String {
    let cid = store.class_id().unwrap_or("2eme-bac-sc-math");
    let first = store.first_name();
    let last = store.profile["lastName"].as_str().unwrap_or("");
    let full = format!("{first} {last}").trim().to_string();
    let live_name = if full.is_empty() { "Élève local (session active)".into() } else { full };

    let mut ch_keys: std::collections::BTreeSet<String> = std::collections::BTreeSet::new();
    for map in [&store.revision, &store.quiz, &store.exercises] {
        if let Some(m) = map.as_object() {
            for k in m.keys() { ch_keys.insert(k.clone()); }
        }
    }

    let mut rows = String::new();
    let mut tot_blanks = 0usize;
    let mut tot_quiz = 0usize;
    let mut tot_ex = 0usize;

    for k in &ch_keys {
        let Some((c_id, ch_id)) = k.split_once("::") else { continue };
        let rev_pct = store.revision_pct(c_id, ch_id, None);
        let blanks = store.revision[k.as_str()]["blanks"].as_object().map(|m| m.len()).unwrap_or(0);
        let q_best = store.quiz_best_pct(c_id, ch_id);
        let q_att = store.quiz[k.as_str()]["history"].as_array().map(|a| a.len()).unwrap_or(0);
        let ex_done = store.count_exercises_done(c_id, ch_id);
        tot_blanks += blanks;
        tot_quiz += q_att;
        tot_ex += ex_done;

        let q_cell = match q_best {
            Some(b) => format!(r##"<span class="badge {}">{b}% ({q_att})</span>"##, if b >= 60 { "badge--ok" } else { "badge--am" }),
            None => format!("{}%", store.quiz_answered_pct(c_id, ch_id)),
        };
        let mastery = json_engine::exercise::op_chapter_mastery(&json!({
            "hasRevision": true,
            "hasQuiz": true,
            "exerciseTotal": (ex_done as u64).max(4),
            "revPct": rev_pct,
            "quizBestPct": q_best.unwrap_or(0),
            "quizAnsweredPct": store.quiz_answered_pct(c_id, ch_id),
            "quizSubmitted": q_best.is_some(),
            "exercises": store.chapter_exercises_map(c_id, ch_id),
        }));
        let m_score = mastery["masteryScore"].as_u64().unwrap_or(0);
        let m_lvl = mastery["level"].as_str().unwrap_or("debutant");
        let m_rec = mastery["recommendation"].as_str().unwrap_or("");
        let (m_cls, m_lbl) = match m_lvl {
            "maitrise" => ("badge--ok", "Maîtrisé"),
            "solide" => ("badge--accent", "Solide"),
            "en_cours" => ("badge--am", "En cours"),
            _ => ("", "Débutant"),
        };
        let unlocked_cfg = store.is_config_chapter_unlocked(c_id, ch_id);
        let sticky_ex = unlocked_cfg || store.is_sticky(c_id, ch_id, "exercises");
        let sticky_qz = unlocked_cfg || store.is_sticky(c_id, ch_id, "quiz");
        rows.push_str(&format!(
            r##"<tr>
              <td>{cls_e}</td>
              <td><strong>{ch_e}</strong></td>
              <td>{rev_pct}%</td>
              <td>{blanks}</td>
              <td>{q_cell}</td>
              <td>{ex_done}</td>
              <td><span class="badge {m_cls}" title="{m_rec_a}">{m_lbl} · {m_score}%</span></td>
              <td><span class="badge {s_cls}">{s_lbl}</span></td>
              <td><div class="user-row-actions">
                <button class="btn sm" type="button" data-action="admin-unlock-ch" data-class="{c_a}" data-ch="{ch_a}">{ico_chk} Débloquer</button>
              </div></td>
            </tr>"##,
            cls_e = esc(&format_class_name(c_id)),
            ch_e = esc(ch_id),
            m_rec_a = esc_attr(m_rec),
            s_cls = if sticky_ex { "badge--ok" } else if sticky_qz { "badge--accent" } else { "" },
            s_lbl = if sticky_ex { "Complet" } else if sticky_qz { "Quiz ouvert" } else { "Progressif" },
            c_a = esc_attr(c_id),
            ch_a = esc_attr(ch_id),
            ico_chk = icon("check", 13, ""),
        ));
    }

    if rows.is_empty() {
        rows = r##"<tr><td colspan="9" class="body-muted">Aucune progression enregistrée sur la session active.</td></tr>"##.into();
    }

    let cadre_n = store
        .core
        .get("masteredSkills")
        .and_then(Value::as_object)
        .map(|m| m.values().filter_map(|v| v.as_array().map(|a| a.len())).sum::<usize>())
        .unwrap_or(0);

    let cloud_students = store.students_summary.as_array().cloned().unwrap_or_default();
    let cloud_section = if !cloud_students.is_empty() {
        let s_rows: String = cloud_students
            .iter()
            .take(50)
            .map(|st| {
                let s_name = st["name"].as_str().unwrap_or("Élève");
                let s_email = st["email"].as_str().unwrap_or("").trim();
                let is_google = st["authProvider"].as_str() == Some("google") || !s_email.is_empty();
                let s_cid = st["classId"].as_str().unwrap_or("");
                let s_ch = st["chaptersCount"].as_u64().unwrap_or(0);
                let s_bl = st["blanksCount"].as_u64().unwrap_or(0);
                let s_qz = st["quizAttempts"].as_u64().unwrap_or(0);
                let s_ex = st["exercisesDone"].as_u64().unwrap_or(0);
                let s_ca = st["cadreMastered"].as_u64().unwrap_or(0);
                let cls_lbl = if s_cid.is_empty() { "—".to_string() } else { format_class_name(s_cid) };
                let email_sub = if s_email.is_empty() {
                    String::new()
                } else {
                    format!(r##"<div class="t-mono body-muted" style="font-size:11.5px">{}</div>"##, esc(s_email))
                };
                let auth_badge = if is_google {
                    r##"<span class="badge badge--ok">Google</span>"##
                } else {
                    r##"<span class="badge">Local</span>"##
                };
                format!(
                    r##"<tr>
                      <td><strong>{name_e}</strong>{email_sub}</td>
                      <td>{auth_badge}</td>
                      <td>{cls_e}</td>
                      <td>{s_ch}</td>
                      <td>{s_bl}</td>
                      <td>{s_qz}</td>
                      <td>{s_ex}</td>
                      <td>{s_ca}</td>
                    </tr>"##,
                    name_e = esc(s_name),
                    cls_e = esc(&cls_lbl),
                )
            })
            .collect();
        format!(
            r##"<div class="sec" style="margin-top:24px"><h2>Élèves synchronisés (Cloud Firestore &amp; Redis)</h2><span>{cnt}</span></div>
            <div class="table-wrap"><table class="data">
              <thead><tr><th>Élève</th><th>Compte</th><th>Classe</th><th>Chapitres</th><th>Blancs</th><th>Essais quiz</th><th>Exercices</th><th>Cadre</th></tr></thead>
              <tbody>{s_rows}</tbody>
            </table></div>"##,
            cnt = cloud_students.len(),
        )
    } else {
        String::new()
    };

    format!(
        r##"<div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:16px">
          <p class="body-muted" style="margin:0">Synchronisation bidirectionnelle Élève ↔ Admin active (Redis / Cloud + BroadcastChannel).</p>
          <label class="badge {fm_cls}" style="cursor:pointer;display:inline-flex;align-items:center;gap:8px;padding:6px 12px">
            <input type="checkbox" data-action="admin-free-mode"{fm_chk} />
            <span>Mode libre global élèves</span>
          </label>
        </div>
        <div class="sec"><h2>Session locale active — {name_e}</h2><span>{cls_e}</span></div>
        <div class="kpi-grid" style="margin-bottom:20px">
          <div class="kpi"><div class="kpi__value">{ch_n}</div><div class="kpi__label">Chapitres suivis</div></div>
          <div class="kpi"><div class="kpi__value">{tot_blanks}</div><div class="kpi__label">Blancs révélés</div></div>
          <div class="kpi"><div class="kpi__value">{tot_quiz}</div><div class="kpi__label">Essais quiz</div></div>
          <div class="kpi"><div class="kpi__value">{tot_ex}</div><div class="kpi__label">Exercices évalués</div></div>
          <div class="kpi"><div class="kpi__value">{cadre_n}</div><div class="kpi__label">Compétences cadre</div></div>
        </div>
        <div class="table-wrap"><table class="data">
          <thead><tr><th>Classe</th><th>Chapitre</th><th>Leçon</th><th>Blancs</th><th>Quiz</th><th>Exercices</th><th>Maîtrise</th><th>Statut</th><th>Actions</th></tr></thead>
          <tbody>{rows}</tbody>
        </table></div>
        {cloud_section}"##,
        fm_cls = if store.free_mode() { "badge--ok" } else { "" },
        fm_chk = if store.free_mode() { " checked" } else { "" },
        name_e = esc(&live_name),
        cls_e = esc(&format_class_name(cid)),
        ch_n = ch_keys.len(),
    )
}

pub fn render_admin_journal(store: &Store, filter: &str) -> String {
    let f = if filter.is_empty() { "all" } else { filter };
    let events = store.activity.as_array().cloned().unwrap_or_default();
    let filtered: Vec<&Value> = events
        .iter()
        .filter(|e| f == "all" || e["actor"].as_str().unwrap_or("local") == f)
        .collect();

    let rows: String = filtered
        .iter()
        .take(50)
        .map(|e| {
            let kind = e["type"].as_str().unwrap_or("event");
            let msg = e["message"].as_str().unwrap_or("");
            let actor = e["actor"].as_str().unwrap_or("local");
            format!(
                r##"<div class="valid-row is-ok">
                  {ico}
                  <span class="file-path"><strong>{kind_e}</strong> · {msg_e}</span>
                  <span class="badge {b_cls}" style="margin-inline-start:auto">{act_e}</span>
                </div>"##,
                ico = icon("history", 14, ""),
                kind_e = esc(kind),
                msg_e = esc(msg),
                b_cls = if actor == "eleve" { "badge--ok" } else { "badge--accent" },
                act_e = esc(actor),
            )
        })
        .collect();

    let body = if filtered.is_empty() {
        format!(r##"<div class="empty">{}<div>Aucune activité enregistrée pour ce filtre.</div></div>"##, icon("history", 22, ""))
    } else {
        rows
    };

    format!(
        r##"<div style="display:flex;gap:10px;align-items:center;margin-bottom:16px;flex-wrap:wrap">
          <span class="engine-badge"><span class="dot"></span>sync temps réel active</span>
          <div class="exam-filters" role="group" aria-label="Filtrer par acteur" style="margin-inline-start:auto">
            <button class="ef-btn" type="button" data-action="admin-journal-filter" data-af="all" aria-pressed="{p1}">Tous</button>
            <button class="ef-btn" type="button" data-action="admin-journal-filter" data-af="eleve" aria-pressed="{p2}">Élève</button>
            <button class="ef-btn" type="button" data-action="admin-journal-filter" data-af="admin" aria-pressed="{p3}">Admin</button>
          </div>
        </div>
        <div class="sec"><h2>Flux bidirectionnel Élève ↔ Admin</h2><span>{cnt}</span></div>
        <div class="valid-report">{body}</div>"##,
        p1 = f == "all",
        p2 = f == "eleve",
        p3 = f == "admin",
        cnt = filtered.len(),
    )
}

pub fn audit_classes_local(
    classes: &[Value],
    class_cache: &BTreeMap<String, Value>,
    overrides: &Value,
) -> Vec<Value> {
    let mut reports = Vec::new();
    for c in classes {
        let cid = c["id"].as_str().unwrap_or("");
        let path = c["path"]
            .as_str()
            .filter(|s| !s.is_empty())
            .map(|s| s.to_string())
            .unwrap_or_else(|| format!("data/classes/{cid}.json"));
        if let Some(doc) = class_cache.get(cid) {
            let v = json_engine::schemas::v_class(doc, &path);
            let valid = v["valid"].as_bool().unwrap_or(false);
            let msgs: Vec<String> = v["errors"]
                .as_array()
                .map(|a| {
                    a.iter()
                        .map(|e| e.as_str().map(|s| s.to_string()).unwrap_or_else(|| e.to_string()))
                        .collect()
                })
                .unwrap_or_default();
            let ch_n = doc["chapters"].as_array().map(|a| a.len()).unwrap_or(0);
            reports.push(json!({
                "kind": "class",
                "path": path,
                "valid": valid,
                "chapters": ch_n,
                "errors": msgs.len(),
                "messages": msgs
            }));
        } else {
            reports.push(json!({
                "kind": "class",
                "path": path,
                "valid": false,
                "chapters": 0,
                "errors": 1,
                "messages": ["Manifeste de classe non chargé"]
            }));
        }
    }

    if let Some(ov_map) = overrides.as_object() {
        for (ov_path, ov_rec) in ov_map {
            let raw = ov_rec["json"].as_str().unwrap_or("");
            match serde_json::from_str(raw) {
                Ok(doc) => {
                    let aud = json_engine::studio::op_studio_audit(&doc, ov_path);
                    let mut msgs: Vec<String> = Vec::new();
                    if let Some(arr) = aud["schemaErrors"].as_array() {
                        for e in arr {
                            msgs.push(e.as_str().map(|s| s.to_string()).unwrap_or_else(|| e.to_string()));
                        }
                    }
                    if let Some(arr) = aud["latexIssues"].as_array() {
                        for e in arr {
                            let m = e["message"].as_str().or_else(|| e.as_str()).unwrap_or("Anomalie LaTeX");
                            msgs.push(format!("LaTeX : {m}"));
                        }
                    }
                    reports.push(json!({
                        "kind": "override",
                        "path": ov_path.as_str(),
                        "valid": msgs.is_empty(),
                        "chapters": 0,
                        "errors": msgs.len(),
                        "messages": msgs
                    }));
                }
                Err(e) => {
                    reports.push(json!({
                        "kind": "override",
                        "path": ov_path.as_str(),
                        "valid": false,
                        "chapters": 0,
                        "errors": 1,
                        "messages": [format!("JSON invalide : {e}")]
                    }));
                }
            }
        }
    }
    reports
}

pub fn render_passcode_modal() -> String {
    r##"<form id="adm-passcode-form" data-action="admin-passcode-submit">
      <p class="body-muted" style="margin:0 0 14px;font-size:13px">Le nouveau code doit comporter 10 à 128 caractères et combiner au moins 3 types (minuscules, majuscules, chiffres, symboles).</p>
      <label class="fld">Code actuel<input name="current" type="password" autocomplete="current-password" required maxlength="128" /></label>
      <label class="fld">Nouveau code<input name="next" type="password" autocomplete="new-password" required minlength="10" maxlength="128" /></label>
      <label class="fld">Confirmer le nouveau code<input name="confirm" type="password" autocomplete="new-password" required minlength="10" maxlength="128" /></label>
      <div class="row" style="margin-top:16px">
        <button type="button" class="btn" data-action="modal-close">Annuler</button>
        <button type="submit" class="btn primary">Mettre à jour</button>
      </div>
    </form>"##
        .into()
}

pub fn render_media_modal(items: &[Value], loading: bool, root_prefix: &str) -> String {
    let list_html = if loading {
        r##"<div class="skeleton" style="height:88px;border-radius:10px"></div>"##.into()
    } else if items.is_empty() {
        r##"<div class="empty"><div>Aucune image disponible. Importez une figure ci-dessus.</div></div>"##.into()
    } else {
        let rows: String = items
            .iter()
            .take(60)
            .map(|it| {
                let url = it["url"].as_str().unwrap_or("");
                let name = it["name"].as_str().unwrap_or(url);
                let size_kb = (it["size"].as_u64().unwrap_or(0) + 512) / 1024;
                let preview_src = if url.starts_with('/') {
                    format!("{root_prefix}{}", url.trim_start_matches('/'))
                } else {
                    format!("{root_prefix}{url}")
                };
                format!(
                    r##"<div class="pub-row" style="align-items:center">
                      <img src="{src_a}" alt="" style="width:44px;height:44px;object-fit:contain;border-radius:6px;border:1px solid var(--line);background:var(--bg);flex:none" loading="lazy" />
                      <div style="flex:1;min-width:0">
                        <div class="pub-row__title" style="font-size:13px">{name_e}</div>
                        <div class="pub-row__body t-mono" style="font-size:11.5px">{url_e} · {size_kb} Ko</div>
                      </div>
                      <button type="button" class="btn sm" data-action="studio-copy-media" data-url="{url_a}">Copier JSON</button>
                    </div>"##,
                    src_a = esc_attr(&preview_src),
                    name_e = esc(name),
                    url_e = esc(url),
                    url_a = esc_attr(url),
                )
            })
            .collect();
        format!(r##"<div style="max-height:340px;overflow:auto;display:flex;flex-direction:column;gap:8px">{rows}</div>"##)
    };

    format!(
        r##"<div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:14px;padding-bottom:14px;border-bottom:1px solid var(--line)">
          <input type="file" id="st-media-file" accept="image/png,image/jpeg,image/webp,image/gif" style="flex:1;min-width:180px;font-size:13px" />
          <button type="button" class="btn primary sm" data-action="studio-media-upload">Importer (max 750 Ko)</button>
        </div>
        {list_html}"##
    )
}
