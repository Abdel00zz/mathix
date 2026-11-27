//! HTML escaping, URL encoding/decoding, SVG icons registry, and formatting helpers.

pub fn esc(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    for ch in s.chars() {
        match ch {
            '&' => out.push_str("&amp;"),
            '<' => out.push_str("&lt;"),
            '>' => out.push_str("&gt;"),
            '"' => out.push_str("&quot;"),
            '\'' => out.push_str("&#39;"),
            _ => out.push(ch),
        }
    }
    out
}

pub fn esc_attr(s: &str) -> String {
    esc(s)
}

pub fn url_encode(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    for b in s.as_bytes() {
        match *b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                out.push(*b as char);
            }
            _ => {
                out.push_str(&format!("%{:02X}", b));
            }
        }
    }
    out
}

pub fn url_decode(s: &str) -> String {
    let bytes = s.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            if let Ok(hex_str) = std::str::from_utf8(&bytes[i + 1..i + 3]) {
                if let Ok(val) = u8::from_str_radix(hex_str, 16) {
                    out.push(val);
                    i += 3;
                    continue;
                }
            }
        } else if bytes[i] == b'+' {
            out.push(b' ');
            i += 1;
            continue;
        }
        out.push(bytes[i]);
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

pub fn fmt_time(secs: u64) -> String {
    let m = secs / 60;
    let s = secs % 60;
    format!("{m}:{s:02}")
}

pub fn fmt_pct(n: f64) -> String {
    format!("{}\u{00a0}%", n.round() as i64)
}

pub fn format_class_name(id: &str) -> String {
    match id {
        "tronc-commun-sc" => "Tronc Commun Scientifique".into(),
        "1ere-annee-college" => "1re année collégiale".into(),
        "2eme-annee-college" => "2e année collégiale".into(),
        "3eme-annee-college" => "3e année collégiale".into(),
        "1ere-bac-sc-ex" => "1re Bac Sciences Expérimentales".into(),
        "1ere-bac-sc-math" => "1re Bac Sciences Mathématiques".into(),
        "2eme-bac-sc-ex" => "2e Bac Sciences Expérimentales".into(),
        "2eme-bac-sc-math" => "2e Bac Sciences Mathématiques".into(),
        other => other.replace('-', " "),
    }
}

pub fn format_class_short(id: &str) -> String {
    match id {
        "tronc-commun-sc" => "Tronc Commun Sc.".into(),
        "1ere-annee-college" => "1re AC".into(),
        "2eme-annee-college" => "2e AC".into(),
        "3eme-annee-college" => "3e AC".into(),
        "1ere-bac-sc-ex" => "1re Bac Sc. Ex.".into(),
        "1ere-bac-sc-math" => "1re Bac Sc. Math".into(),
        "2eme-bac-sc-ex" => "2e Bac Sc. Ex.".into(),
        "2eme-bac-sc-math" => "2e Bac Sc. Math".into(),
        other => format_class_name(other),
    }
}

pub fn icon_path(name: &str) -> &'static str {
    match name {
        "xmark" => r#"<path d="M6 6l12 12M18 6L6 18"/>"#,
        "chevron-down" => r#"<path d="M6 9l6 6 6-6"/>"#,
        "chevron-up" => r#"<path d="M6 15l6-6 6 6"/>"#,
        "chevron-left" => r#"<path d="M15 6l-6 6 6 6"/>"#,
        "chevron-right" => r#"<path d="M9 6l6 6-6 6"/>"#,
        "expand" => r#"<path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/>"#,
        "check" => r#"<path d="M5 12.5l4.5 4.5L19 7.5"/>"#,
        "circle-check" => r#"<circle cx="12" cy="12" r="9"/><path d="M8 12.5l2.7 2.7L16.5 9"/>"#,
        "circle-xmark" => r#"<circle cx="12" cy="12" r="9"/><path d="M9 9l6 6M15 9l-6 6"/>"#,
        "plus" => r#"<path d="M12 5v14M5 12h14"/>"#,
        "users" => r#"<circle cx="9" cy="8.5" r="3.5"/><path d="M2.5 19.5c1.2-3 3.7-4.5 6.5-4.5s5.3 1.5 6.5 4.5"/><circle cx="17.5" cy="9.5" r="2.8"/><path d="M16 15.2c2.6.3 4.6 1.7 5.5 4.3"/>"#,
        "book-open" => r#"<path d="M12 6.5C10.6 5 8.5 4.2 6 4.2c-1 0-2 .15-3 .45v13.6c1-.3 2-.45 3-.45 2.5 0 4.6.8 6 2.2 1.4-1.4 3.5-2.2 6-2.2 1 0 2 .15 3 .45V4.65c-1-.3-2-.45-3-.45-2.5 0-4.6.8-6 2.3z"/><path d="M12 6.5v13.5"/>"#,
        "shield" => r#"<path d="M12 2.6l7.6 2.85v6.15c0 4.95-3.25 8.55-7.6 9.8-4.35-1.25-7.6-4.85-7.6-9.8V5.45L12 2.6z"/><path d="M9.1 12.1l2.1 2.15 3.95-4.25"/>"#,
        "print" => r#"<path d="M7 8V3.5h10V8M7 17H4a1.5 1.5 0 0 1-1.5-1.5v-5A1.5 1.5 0 0 1 4 9h16a1.5 1.5 0 0 1 1.5 1.5v5A1.5 1.5 0 0 1 20 17h-3"/><rect x="7" y="14" width="10" height="6.5" rx="1"/>"#,
        "file" => r#"<path d="M6 2.8h7.5L19 8.3V21.2H6z"/><path d="M13.5 2.8v5.5H19M9 12.5h6M9 16h6"/>"#,
        "upload" => r#"<path d="M12 14.5v-11m0 0 4 4m-4-4-4 4"/><path d="M4 17.5v2A1.5 1.5 0 0 0 5.5 21h13a1.5 1.5 0 0 0 1.5-1.5v-2"/>"#,
        "trash" => r#"<path d="M4.5 6.5h15M9.5 6.5V4.8c0-.7.6-1.3 1.3-1.3h2.4c.7 0 1.3.6 1.3 1.3v1.7M6.5 6.5l1 14a1.5 1.5 0 0 0 1.5 1.4h7a1.5 1.5 0 0 0 1.5-1.4l1-14M10 10.5v7M14 10.5v7"/>"#,
        "square-root" => r#"<path d="M3 13h2.5l2 6.5L12 4h9"/>"#,
        "calculator" => r#"<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M8.5 7h7M8.5 11.5h.01M12 11.5h.01M15.5 11.5h.01M8.5 15h.01M12 15h.01M15.5 15h.01M8.5 18.5h.01M12 18.5h.01M15.5 18.5h.01"/>"#,
        "logout" => r#"<path d="M9 21H5.5A1.5 1.5 0 0 1 4 19.5v-15A1.5 1.5 0 0 1 5.5 3H9"/><path d="M15 16.5l4.5-4.5L15 7.5M19.5 12H9"/>"#,
        "eye" => r#"<path d="M2.25 12S5.9 5.75 12 5.75 21.75 12 21.75 12 18.1 18.25 12 18.25 2.25 12 2.25 12z"/><circle cx="12" cy="12" r="2.85"/>"#,
        "eye-off" => r#"<path d="M3.2 3.2l17.6 17.6"/><path d="M10.4 5.9A9.7 9.7 0 0 1 12 5.75C18.1 5.75 21.75 12 21.75 12a16.8 16.8 0 0 1-3.15 3.85"/><path d="M14.1 14.1A2.85 2.85 0 0 1 9.9 9.9"/><path d="M6.4 7.7A16.5 16.5 0 0 0 2.25 12S5.9 18.25 12 18.25c1.55 0 2.95-.32 4.2-.85"/>"#,
        "save" => r#"<path d="M5 3.5h11L20.5 8v12.5a1 1 0 0 1-1 1h-14a1 1 0 0 1-1-1v-16a1 1 0 0 1 1-1z"/><path d="M8 3.5V8h7V3.5M8 21.5v-7h8v7"/>"#,
        "history" => r#"<path d="M3.5 12a8.5 8.5 0 1 1 2.6 6.1M3.5 12H2m1.5 0V7.5M3 18.2l3.1-3.1"/><path d="M12 8v4.5l3 2"/>"#,
        "warning" => r#"<path d="M12 3.5L22 20H2z"/><path d="M12 10v4.5M12 17.2h.01"/>"#,
        "list" => r#"<path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01"/>"#,
        "chart" => r#"<path d="M4 20V4"/><path d="M4 20h16"/><path d="M8.5 16v-5M12.5 16V8M16.5 16v-3"/>"#,
        "folder" => r#"<path d="M3.5 6.5A1.5 1.5 0 0 1 5 5h4.5l2 2.5H19a1.5 1.5 0 0 1 1.5 1.5v9A1.5 1.5 0 0 1 19 19.5H5A1.5 1.5 0 0 1 3.5 18z"/>"#,
        "key" => r#"<circle cx="8" cy="15.5" r="4.5"/><path d="M11.2 12.3L20.5 3M17 6.5l3 3M14.5 9l2 2"/>"#,
        "database" => r#"<ellipse cx="12" cy="5.5" rx="8" ry="2.7"/><path d="M4 5.5v13c0 1.5 3.6 2.7 8 2.7s8-1.2 8-2.7v-13"/><path d="M4 12c0 1.5 3.6 2.7 8 2.7s8-1.2 8-2.7"/>"#,
        "refresh" => r#"<path d="M20 5.5v5h-5"/><path d="M19.4 10.5A7.8 7.8 0 1 0 20 13"/>"#,
        "info" => r#"<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>"#,
        "target" => r#"<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5.5"/><circle cx="12" cy="12" r="2"/>"#,
        "lock" => r#"<rect x="4.5" y="10.5" width="15" height="10" rx="3"/><path d="M8 10.5V7.2a4 4 0 0 1 8 0v3.3"/><circle cx="12" cy="15.5" r="1.25" fill="currentColor" stroke="none"/>"#,
        "lock-open" => r#"<rect x="4.5" y="10.5" width="15" height="10" rx="3"/><path d="M7.5 10.5V7.2a4.5 4.5 0 0 1 8.4-2.1"/><circle cx="12" cy="15.5" r="1.25" fill="currentColor" stroke="none"/>"#,
        "image" => r#"<rect x="3.5" y="4.5" width="17" height="15" rx="2"/><circle cx="9" cy="9.5" r="1.5"/><path d="M20.5 16l-5-5L6 19.5"/>"#,
        "copy" => r#"<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15H4a1.5 1.5 0 0 1-1.5-1.5v-9A1.5 1.5 0 0 1 4 3h9A1.5 1.5 0 0 1 14.5 4.5V5"/>"#,
        "sparkles" => r#"<path d="M12 3l1.6 4.8L18.5 9.5l-4.9 1.7L12 16l-1.6-4.8L5.5 9.5l4.9-1.7z"/><path d="M18.5 15.5l.7 2.1 2.1.7-2.1.7-.7 2.1-.7-2.1-2.1-.7 2.1-.7z"/>"#,
        "download" => r#"<path d="M12 3.5v11m0 0-4-4m4 4 4-4"/><path d="M4 17.5v2A1.5 1.5 0 0 0 5.5 21h13a1.5 1.5 0 0 0 1.5-1.5v-2"/>"#,
        "edit" => r#"<path d="M14.5 4.5l5 5L8 21H3v-5z"/><path d="M12 7l5 5"/>"#,
        "compass" => r#"<circle cx="12" cy="12" r="9.25"/><path d="M12 2.75v1.5M12 19.75v1.5M2.75 12h1.5M19.75 12h1.5" opacity=".55"/><polygon points="16.1 7.9 13.85 13.85 7.9 16.1 10.15 10.15 16.1 7.9"/><circle cx="12" cy="12" r="1.05" fill="currentColor" stroke="none"/>"#,
        "sliders" => r#"<path d="M4 6h16M4 12h16M4 18h16"/><circle cx="9" cy="6" r="2"/><circle cx="15" cy="12" r="2"/><circle cx="10" cy="18" r="2"/>"#,
        "settings" => r#"<circle cx="12" cy="12" r="3.1"/><path d="M19.4 14.95a1.65 1.65 0 0 0 .33 1.82l.06.06a1.95 1.95 0 1 1-2.76 2.76l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a1.95 1.95 0 1 1-3.9 0v-.09a1.65 1.65 0 0 0-1.05-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a1.95 1.95 0 1 1-2.76-2.76l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a1.95 1.95 0 1 1 0-3.9h.09a1.65 1.65 0 0 0 1.51-1.05 1.65 1.65 0 0 0-.33-1.82l-.06-.06a1.95 1.95 0 1 1 2.76-2.76l.06.06a1.65 1.65 0 0 0 1.82.33h.08a1.65 1.65 0 0 0 .97-1.51V3a1.95 1.95 0 1 1 3.9 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a1.95 1.95 0 1 1 2.76 2.76l-.06.06a1.65 1.65 0 0 0-.33 1.82v.08a1.65 1.65 0 0 0 1.51.97H21a1.95 1.95 0 1 1 0 3.9h-.09a1.65 1.65 0 0 0-1.51 1.05Z"/>"#,
        "more-vertical" => r#"<circle cx="12" cy="5.5" r="1.45" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.45" fill="currentColor" stroke="none"/><circle cx="12" cy="18.5" r="1.45" fill="currentColor" stroke="none"/>"#,
        "sun" => r#"<circle cx="12" cy="12" r="4.1"/><path d="M12 2.4v2.1M12 19.5v2.1M4.85 4.85l1.5 1.5M17.65 17.65l1.5 1.5M2.4 12h2.1M19.5 12h2.1M4.85 19.15l1.5-1.5M17.65 6.35l1.5-1.5"/>"#,
        "moon" => r#"<path d="M20.4 14.35A8.35 8.35 0 0 1 9.65 3.6a8.65 8.65 0 1 0 10.75 10.75z"/><path d="M18.2 4.6v2.2M17.1 5.7h2.2" opacity=".7"/>"#,
        "monitor" => r#"<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/>"#,
        "grid" => r#"<rect x="3.5" y="3.5" width="17" height="17" rx="2"/><path d="M9.2 3.5v17M14.8 3.5v17M3.5 9.2h17M3.5 14.8h17"/>"#,
        "arrow-up" => r#"<path d="M12 19V5M5.5 11.5L12 5l6.5 6.5"/>"#,
        "external" => r#"<path d="M14 4h6v6M10 14L20 4M19 13v6a1.5 1.5 0 0 1-1.5 1.5h-12A1.5 1.5 0 0 1 4 19v-12A1.5 1.5 0 0 1 5.5 5.5H11"/>"#,
        "search" => r#"<circle cx="11" cy="11" r="7"/><path d="M20 20l-4.2-4.2"/>"#,
        "menu" => r#"<path d="M4 7h16M4 12h16M4 17h16"/>"#,
        "panel-left-close" => r#"<rect x="2.75" y="3.75" width="18.5" height="16.5" rx="3"/><path d="M9 3.75v16.5"/><path d="M16.25 9.25L13.5 12l2.75 2.75"/>"#,
        "panel-left-open" => r#"<rect x="2.75" y="3.75" width="18.5" height="16.5" rx="3"/><path d="M9 3.75v16.5"/><path d="M13.5 9.25L16.25 12l-2.75 2.75"/>"#,
        "graduation" => r#"<path d="M2.5 9.5L12 5l9.5 4.5L12 14 2.5 9.5z"/><path d="M6 11.3v4.7c0 1.4 2.7 2.8 6 2.8s6-1.4 6-2.8v-4.7"/><path d="M21 10v5"/>"#,
        "code" => r#"<path d="M9 8l-4 4 4 4M15 8l4 4-4 4M13.5 5l-3 14"/>"#,
        _ => r#"<circle cx="12" cy="12" r="9.25"/><path d="M9.4 9.35a2.65 2.65 0 0 1 5.15.8c0 1.55-2.05 2.1-2.55 3.25"/><circle cx="12" cy="16.85" r=".95" fill="currentColor" stroke="none"/>"#,
    }
}

pub fn icon(name: &str, size: u32, cls: &str) -> String {
    let p = icon_path(name);
    let cls_attr = if cls.is_empty() {
        String::new()
    } else {
        format!(r#" class="{}""#, esc_attr(cls))
    };
    format!(
        r#"<svg{cls_attr} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" shape-rendering="geometricPrecision" width="{size}" height="{size}" aria-hidden="true" style="width:{size}px;height:{size}px">{p}</svg>"#
    )
}

pub fn render_difficulty_stars(difficulty: Option<&str>, stars_opt: Option<u64>, label_opt: Option<&str>) -> String {
    let (stars, label) = if let Some(n) = stars_opt.filter(|&v| v > 0) {
        (n.min(3), label_opt.unwrap_or("Moyen"))
    } else {
        let d = difficulty.unwrap_or("").to_lowercase();
        if d.contains("difficile") || d.contains("hard") || d.contains("avanc") || d.contains("olymp") || d.contains("3") {
            (3, "Difficile")
        } else if d.contains("moyen") || d.contains("medium") || d.contains("interm") || d.contains("2") {
            (2, "Moyen")
        } else if d.contains("facile") || d.contains("easy") || d.contains("base") || d.contains("1") {
            (1, "Facile")
        } else {
            return String::new();
        }
    };
    let mut dots = String::new();
    for i in 1..=3 {
        dots.push_str(if i <= stars {
            r#"<i class="on" aria-hidden="true">★</i>"#
        } else {
            r#"<i aria-hidden="true">☆</i>"#
        });
    }
    format!(
        r#"<span class="exo-stars" title="Difficulté : {}" aria-label="Difficulté : {}">{}</span>"#,
        esc_attr(label),
        esc_attr(label),
        dots
    )
}

pub fn dir_of_path(path: &str) -> String {
    let clean = path.trim_start_matches('/');
    match clean.rfind('/') {
        Some(idx) => clean[..idx].to_string(),
        None => String::new(),
    }
}

pub fn search_matches(text: &str, query: &str) -> bool {
    let q_norm = math_engine::answer::norm_answer(query);
    if q_norm.is_empty() {
        return true;
    }
    let hay = math_engine::answer::norm_answer(&math_engine::analyze::plain_title(text));
    q_norm.split_whitespace().all(|tok| hay.contains(tok))
}
