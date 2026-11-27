//! Analyse structurelle des formules display, déballage sûr des boîtes LaTeX
//! et découpage pédagogique des solutions (`math_engine::structure`).

use serde_json::{json, Value};

const SIZE_PREFIXES: &[&str] = &[
    "\\large",
    "\\Large",
    "\\LARGE",
    "\\huge",
    "\\Huge",
];

const BOX_PREFIXES: &[&str] = &[
    "\\large",
    "\\Large",
    "\\LARGE",
    "\\huge",
    "\\Huge",
    "\\displaystyle",
    "\\dst",
];

const BOX_COMMANDS: &[&str] = &["\\boxed", "\\fbox", "\\result", "\\encadre"];
const BLANK_COMMANDS: &[&str] = &["\\blank", "\\blanck", "\\balck", "\\reveal", "\\hide"];

const CONCLUSION_STARTERS: &[&str] = &[
    "par conséquent",
    "par consequent",
    "ainsi",
    "donc",
    "d'où",
    "d’où",
    "d'ou",
    "d’ou",
    "on en déduit",
    "on en deduit",
    "finalement",
    "en conclusion",
    "la continuité",
    "la continuite",
    "le seul prolongement",
    "les deux limites latérales",
    "les deux limites laterales",
    "l'ensemble des solutions est",
    "l’ensemble des solutions est",
    "il existe donc",
    "on obtient",
    "on peut donc",
    "en faisant tendre",
];

/// Trouve l'accolade `}` fermante correspondant à `{` à l'index octet `open_idx`.
pub fn find_matching_brace(s: &str, open_idx: usize) -> Option<usize> {
    let bytes = s.as_bytes();
    if bytes.get(open_idx) != Some(&b'{') {
        return None;
    }
    let mut depth = 0usize;
    let mut i = open_idx;
    while i < bytes.len() {
        let b = bytes[i];
        if b == b'\\' && i + 1 < bytes.len() {
            i += 2;
            continue;
        }
        if b == b'{' {
            depth += 1;
        } else if b == b'}' {
            depth -= 1;
            if depth == 0 {
                return Some(i);
            }
        }
        i += 1;
    }
    None
}

/// Vérifie si `s[pos..]` commence par la commande `cmd` suivie d'un caractère non-alphabétique.
fn starts_with_cmd(s: &str, cmd: &str) -> bool {
    if !s.starts_with(cmd) {
        return false;
    }
    match s.as_bytes().get(cmd.len()) {
        Some(&b) => !b.is_ascii_alphabetic(),
        None => true,
    }
}

/// Supprime les préfixes de commande (`\large`, `\Large`, etc.) en tête de chaîne.
fn strip_leading_cmds<'a>(mut s: &'a str, cmds: &[&str]) -> &'a str {
    loop {
        s = s.trim_start();
        let mut matched = false;
        for &cmd in cmds {
            if starts_with_cmd(s, cmd) {
                s = &s[cmd.len()..];
                matched = true;
                break;
            }
        }
        if !matched {
            return s.trim_start();
        }
    }
}

/// Déballe récursivement `\boxed{\blank{…}}` et `\fbox{\blank{…}}` avec gestion
/// exacte des accolades imbriquées (même `\boxed{\blank{\dfrac{a}{b}}}`).
pub fn unwrap_boxed_blanks(tex: &str) -> String {
    if !tex.contains("\\boxed") && !tex.contains("\\fbox") {
        return tex.to_string();
    }
    let bytes = tex.as_bytes();
    let mut out = String::with_capacity(tex.len());
    let mut i = 0usize;
    while i < bytes.len() {
        if bytes[i] == b'\\' {
            let rest = &tex[i..];
            let cmd_len = if starts_with_cmd(rest, "\\boxed") {
                Some(6)
            } else if starts_with_cmd(rest, "\\fbox") {
                Some(5)
            } else {
                None
            };
            if let Some(clen) = cmd_len {
                let mut j = i + clen;
                while j < bytes.len() && bytes[j].is_ascii_whitespace() {
                    j += 1;
                }
                if bytes.get(j) == Some(&b'{') {
                    if let Some(close_idx) = find_matching_brace(tex, j) {
                        let inner = tex[j + 1..close_idx].trim();
                        if is_single_blank_call(inner) {
                            out.push_str(inner);
                            i = close_idx + 1;
                            continue;
                        }
                    }
                }
            }
        }
        let ch = tex[i..].chars().next().unwrap();
        out.push(ch);
        i += ch.len_utf8();
    }
    out
}

fn is_single_blank_call(s: &str) -> bool {
    let trimmed = s.trim();
    for &cmd in BLANK_COMMANDS {
        if starts_with_cmd(trimmed, cmd) {
            let mut j = cmd.len();
            let bytes = trimmed.as_bytes();
            while j < bytes.len() && bytes[j].is_ascii_whitespace() {
                j += 1;
            }
            if bytes.get(j) == Some(&b'{') {
                if let Some(close_idx) = find_matching_brace(trimmed, j) {
                    if close_idx == trimmed.len() - 1 {
                        return true;
                    }
                }
            }
        }
    }
    false
}

/// Détecte si une formule est entièrement enveloppée dans `\boxed`/`\fbox`/`\result`/`\encadre`.
pub fn unwrap_outer_boxed(raw_tex: &str) -> Option<(String, String)> {
    let mut s = raw_tex.trim();
    let mut trailing_punct = String::new();
    if let Some(last) = s.chars().last() {
        if matches!(last, '.' | ',' | ';' | ':') {
            trailing_punct.push(last);
            s = s[..s.len() - last.len_utf8()].trim_end();
        }
    }
    s = strip_leading_cmds(s, BOX_PREFIXES);
    for &cmd in BOX_COMMANDS {
        if starts_with_cmd(s, cmd) {
            let mut j = cmd.len();
            let bytes = s.as_bytes();
            while j < bytes.len() && bytes[j].is_ascii_whitespace() {
                j += 1;
            }
            if bytes.get(j) == Some(&b'{') {
                if let Some(close_idx) = find_matching_brace(s, j) {
                    if close_idx == s.len() - 1 {
                        let inner = s[j + 1..close_idx].trim();
                        return Some((inner.to_string(), trailing_punct));
                    }
                }
            }
        }
    }
    None
}

/// Inspecte une formule display ou inline : détecte les boîtes externes, neutralise
/// les macros de taille redondantes (`\large`…), déballe `\boxed{\blank{…}}` et
/// renvoie des métriques structurelles utiles à l'adaptation responsive.
pub fn inspect_display_formula(raw_tex: &str) -> Value {
    let trimmed = raw_tex.trim();
    let (is_boxed, normalized_inner, trailing_punct) = match unwrap_outer_boxed(trimmed) {
        Some((inner, punct)) => {
            let clean = unwrap_boxed_blanks(strip_leading_cmds(&inner, SIZE_PREFIXES));
            (true, clean, punct)
        }
        None => {
            let clean = unwrap_boxed_blanks(strip_leading_cmds(trimmed, SIZE_PREFIXES));
            (false, clean, String::new())
        }
    };

    let has_fraction = normalized_inner.contains("\\frac")
        || normalized_inner.contains("\\dfrac")
        || normalized_inner.contains("\\tfrac");
    let has_matrix = normalized_inner.contains("matrix}")
        || normalized_inner.contains("\\begin{array}")
        || normalized_inner.contains("\\begin{cases}");
    let has_align = normalized_inner.contains("\\begin{align");
    let has_integral_or_sum = normalized_inner.contains("\\int")
        || normalized_inner.contains("\\sum")
        || normalized_inner.contains("\\prod")
        || normalized_inner.contains("\\lim");

    let amp_count = normalized_inner.matches('&').count();
    let is_wide = normalized_inner.len() >= 96 || has_matrix || amp_count >= 4;

    json!({
        "ok": true,
        "engine": "math",
        "isBoxed": is_boxed,
        "inner": normalized_inner,
        "trailingPunct": trailing_punct,
        "metrics": {
            "hasFraction": has_fraction,
            "hasMatrix": has_matrix,
            "hasAlign": has_align,
            "hasIntegralOrSum": has_integral_or_sum,
            "isWide": is_wide,
            "length": normalized_inner.len(),
        }
    })
}

/* ── Découpage pédagogique structuré des corrections LaTeX ───────────────── */

fn strip_leading_par_skips(mut s: &str) -> &str {
    loop {
        s = s.trim_start();
        let mut cut = false;
        for cmd in ["\\par", "\\smallskip", "\\medskip", "\\bigskip"] {
            if starts_with_cmd(s, cmd) {
                s = &s[cmd.len()..];
                cut = true;
                break;
            }
        }
        if !cut {
            return s.trim_start();
        }
    }
}

fn capitalize_first(s: &str) -> String {
    let mut chars = s.chars();
    match chars.next() {
        Some(first) => first.to_uppercase().to_string() + chars.as_str(),
        None => String::new(),
    }
}

/// Extrait le dernier segment `$...$` en fin de chaîne (avant un `.` optionnel),
/// en s'assurant qu'il s'agit bien d'un inline `$` et non d'un `$$`.
fn extract_trailing_inline_math(s: &str) -> Option<(&str, &str)> {
    let trimmed = s.trim_end();
    let without_dot = trimmed.strip_suffix('.').unwrap_or(trimmed).trim_end();
    if !without_dot.ends_with('$') || without_dot.ends_with("$$") {
        return None;
    }
    let before_close = &without_dot[..without_dot.len() - 1];
    // Trouver le `$` ouvrant correspondant (en reculant)
    let bytes = before_close.as_bytes();
    let mut i = bytes.len();
    while i > 0 {
        i -= 1;
        if bytes[i] == b'$' {
            let escaped = i > 0 && bytes[i - 1] == b'\\';
            let is_double = i > 0 && bytes[i - 1] == b'$';
            if !escaped && !is_double {
                let prefix = &without_dot[..i];
                let formula = &without_dot[i + 1..without_dot.len() - 1];
                return Some((prefix, formula));
            }
            if is_double {
                return None;
            }
        }
    }
    None
}

/// Promouvoit une conclusion mathématique inline finale en bloc display `$$\boxed{…}$$`.
pub fn promote_trailing_result_box(step_tex: &str) -> String {
    let s = step_tex.trim();
    let Some((prefix, formula)) = extract_trailing_inline_math(s) else {
        return s.to_string();
    };
    let formula_trim = formula.trim();
    let prefix_trim = prefix.trim_end();

    // Cas 1 & 2 : "(, | . )(donc|ainsi|d'où|alors) $...$"
    let lower_prefix = prefix_trim.to_lowercase();
    for conj in ["donc", "ainsi", "d'où", "d’où", "alors"] {
        if lower_prefix.ends_with(conj) {
            let cut_idx = prefix_trim.len() - conj.len();
            if !prefix_trim.is_char_boundary(cut_idx) {
                continue;
            }
            let before_conj = prefix_trim[..cut_idx].trim_end();
            let has_sep = before_conj.ends_with(',') || before_conj.ends_with('.');
            if !has_sep {
                continue;
            }
            let head = before_conj[..before_conj.len() - 1].trim_end();
            let orig_conj = &prefix_trim[cut_idx..];

            // Cas 1 : \displaystyle \lim...
            let f_norm = formula_trim.trim_start();
            if f_norm.starts_with("\\displaystyle") && f_norm["\\displaystyle".len()..].trim_start().starts_with("\\lim") {
                return format!(
                    "{head}. {} :\\par\\smallskip$$\\boxed{{{formula_trim}}}$$",
                    capitalize_first(orig_conj)
                );
            }
            // Cas 2 : \boxed{...} ou \fbox{...}
            if let Some((inner, _)) = unwrap_outer_boxed(formula_trim) {
                return format!(
                    "{head}. {} :\\par\\smallskip$$\\boxed{{{inner}}}$$",
                    capitalize_first(orig_conj)
                );
            }
        }
    }

    // Cas 3 : "Le seul prolongement obtenu est $\boxed{…}$."
    if let Some((inner, _)) = unwrap_outer_boxed(formula_trim) {
        for lead in [
            "le seul prolongement obtenu est",
            "la limite vaut donc",
            "l'ensemble des solutions est",
            "l’ensemble des solutions est",
            "on obtient",
        ] {
            if lower_prefix.ends_with(lead) {
                let cut_idx = prefix_trim.len() - lead.len();
                if prefix_trim.is_char_boundary(cut_idx) {
                    let orig = &prefix_trim[..prefix_trim.len()];
                    return format!("{orig} :\\par\\smallskip$$\\boxed{{{inner}}}$$");
                }
            }
        }
    }

    s.to_string()
}

fn strip_redundant_summary_tail(s: &str) -> String {
    let lower = s.to_lowercase();
    let has_per_step = lower.contains("donc $\\displaystyle \\lim")
        || lower.contains("donc $ \\displaystyle \\lim")
        || lower.contains("la première limite vaut $")
        || lower.contains("la seconde limite vaut $");
    if !has_per_step {
        return s.to_string();
    }
    if let Some(pos) = lower.rfind("les résultats sont") {
        let tail = &s[pos..];
        if tail.matches("\\boxed{").count() == 2 && tail.contains(" et ") {
            return s[..pos].trim_end().to_string();
        }
    }
    s.to_string()
}

/// Découpe sur `\item` uniquement au niveau racine (`depth == 0` d'environnements imbriqués).
fn split_top_level_items(body: &str) -> Vec<String> {
    let mut items = Vec::new();
    let mut current = String::new();
    let mut depth = 0usize;
    let bytes = body.as_bytes();
    let mut i = 0usize;
    while i < bytes.len() {
        let rest = &body[i..];
        if rest.starts_with("\\begin{enumerate}") || rest.starts_with("\\begin{itemize}") {
            depth += 1;
            let tag = if rest.starts_with("\\begin{enumerate}") {
                "\\begin{enumerate}"
            } else {
                "\\begin{itemize}"
            };
            current.push_str(tag);
            i += tag.len();
            continue;
        }
        if rest.starts_with("\\end{enumerate}") || rest.starts_with("\\end{itemize}") {
            depth = depth.saturating_sub(1);
            let tag = if rest.starts_with("\\end{enumerate}") {
                "\\end{enumerate}"
            } else {
                "\\end{itemize}"
            };
            current.push_str(tag);
            i += tag.len();
            continue;
        }
        if depth == 0 && starts_with_cmd(rest, "\\item") {
            let trimmed = current.trim();
            if !trimmed.is_empty() {
                items.push(trimmed.to_string());
            }
            current.clear();
            i += 5;
            // Option éventuelle [a)] après \item
            let after = body[i..].trim_start();
            if after.starts_with('[') {
                if let Some(close_br) = after.find(']') {
                    let ws_skipped = body[i..].len() - after.len();
                    i += ws_skipped + close_br + 1;
                }
            }
            continue;
        }
        let ch = rest.chars().next().unwrap();
        current.push(ch);
        i += ch.len_utf8();
    }
    let tail = current.trim();
    if !tail.is_empty() {
        items.push(tail.to_string());
    }
    items
}

fn find_conclusion_split(promoted: &str) -> Option<(String, String)> {
    // Doit contenir une boîte display `$$(\large )?\boxed{` dans la seconde partie
    let boxed_pos = promoted
        .rfind("$$\\boxed{")
        .or_else(|| promoted.rfind("$$\\large \\boxed{"))
        .or_else(|| promoted.rfind("$$\\large\\boxed{"))?;

    let anchors = [
        "\\end{align*}",
        "\\end{align}",
        "\\end{aligned}",
        "$$",
        "\\]",
        ".",
    ];

    let mut best_split: Option<(usize, usize)> = None;
    let search_slice = &promoted[..boxed_pos];
    let mut scan = 0usize;
    while scan < search_slice.len() {
        let rest = &search_slice[scan..];
        let mut anchor_len = 0usize;
        for &anc in &anchors {
            if rest.starts_with(anc) {
                anchor_len = anc.len();
                break;
            }
        }
        if anchor_len > 0 {
            let end_first = scan + anchor_len;
            let after = strip_leading_par_skips(&promoted[end_first..]);
            let lower_after = after.to_lowercase();
            let starts_conclusion = CONCLUSION_STARTERS
                .iter()
                .any(|st| lower_after.starts_with(st));
            if starts_conclusion {
                let second_start = promoted.len() - after.len();
                if second_start <= boxed_pos && end_first > 0 {
                    best_split = Some((end_first, second_start));
                }
            }
            scan += anchor_len;
        } else {
            let ch = rest.chars().next().unwrap();
            scan += ch.len_utf8();
        }
    }

    let (end_first, second_start) = best_split?;
    let first = promoted[..end_first].trim();
    let second = promoted[second_start..].trim();
    if first.is_empty() || second.is_empty() {
        return None;
    }
    Some((first.to_string(), second.to_string()))
}

/// Découpe intelligemment une correction LaTeX en étapes pédagogiques `.step`.
pub fn split_solution_steps(raw_latex: &str) -> Vec<String> {
    let cleaned = strip_leading_par_skips(raw_latex).trim();
    if cleaned.is_empty() {
        return Vec::new();
    }

    // 1. Plusieurs blocs \begin{enumerate}...\end{enumerate}
    let enum_count = cleaned.matches("\\begin{enumerate}").count();
    if enum_count >= 2 {
        let s = strip_redundant_summary_tail(cleaned);
        let mut steps: Vec<String> = Vec::new();
        let mut num = 0usize;
        let mut pos = 0usize;
        let tag_open = "\\begin{enumerate}";
        let tag_close = "\\end{enumerate}";

        while pos < s.len() {
            let rest = &s[pos..];
            if let Some(rel_open) = rest.find(tag_open) {
                let before = strip_leading_par_skips(&rest[..rel_open]).trim();
                let before = before
                    .trim_end_matches("\\bigskip")
                    .trim_end_matches("\\medskip")
                    .trim_end_matches("\\smallskip")
                    .trim_end_matches("\\par")
                    .trim();
                if !before.is_empty() {
                    if let Some(last) = steps.last_mut() {
                        *last = promote_trailing_result_box(&format!("{last} {before}"));
                    } else {
                        steps.push(promote_trailing_result_box(before));
                    }
                }
                let start_enum = pos + rel_open;
                let after_open = &s[start_enum + tag_open.len()..];
                if let Some(rel_close) = after_open.find(tag_close) {
                    num += 1;
                    let inside = after_open[..rel_close].trim();
                    let head = if starts_with_cmd(inside, "\\item") {
                        inside[5..].trim()
                    } else {
                        inside
                    };
                    let after_enum_pos = start_enum + tag_open.len() + rel_close + tag_close.len();
                    let next_open = s[after_enum_pos..].find(tag_open);
                    let tail_end = match next_open {
                        Some(off) => after_enum_pos + off,
                        None => s.len(),
                    };
                    let raw_tail = &s[after_enum_pos..tail_end];
                    let tail = raw_tail
                        .trim_end()
                        .trim_end_matches("\\bigskip")
                        .trim_end_matches("\\medskip")
                        .trim_end_matches("\\smallskip")
                        .trim_end_matches("\\par")
                        .trim();
                    let combined = if tail.is_empty() {
                        format!("\\textbf{{{num}.}} {head}")
                    } else {
                        format!("\\textbf{{{num}.}} {head} {tail}")
                    };
                    steps.push(promote_trailing_result_box(&combined));
                    pos = tail_end;
                    continue;
                }
            }
            let rem = strip_leading_par_skips(rest).trim();
            if !rem.is_empty() {
                if let Some(last) = steps.last_mut() {
                    *last = promote_trailing_result_box(&format!("{last} {rem}"));
                } else {
                    steps.push(promote_trailing_result_box(rem));
                }
            }
            break;
        }
        return steps.into_iter().filter(|x| !x.is_empty()).collect();
    }

    // 2. Unique \begin{enumerate} englobant plusieurs \item au niveau racine
    if cleaned.starts_with("\\begin{enumerate}") && cleaned.ends_with("\\end{enumerate}") {
        let mut inner = &cleaned["\\begin{enumerate}".len()..cleaned.len() - "\\end{enumerate}".len()];
        let trimmed_in = inner.trim_start();
        if trimmed_in.starts_with('[') {
            if let Some(close_br) = trimmed_in.find(']') {
                inner = &trimmed_in[close_br + 1..];
            }
        }
        let items = split_top_level_items(inner);
        if items.len() >= 2 {
            return items
                .into_iter()
                .enumerate()
                .map(|(idx, it)| promote_trailing_result_box(&format!("\\textbf{{{}.}} {it}", idx + 1)))
                .collect();
        }
    }

    // 3. Mono-question : développement + conclusion encadrée
    let promoted = promote_trailing_result_box(cleaned);
    if let Some((dev, concl)) = find_conclusion_split(&promoted) {
        return vec![dev, concl];
    }

    vec![promoted]
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn unwraps_outer_boxed_and_nested_boxed_blanks() {
        let info = inspect_display_formula("\\large \\boxed{\\displaystyle \\lim_{x \\to 1} f(x) = \\blank{\\dfrac{1}{2}}}.");
        assert_eq!(info["isBoxed"], true);
        assert_eq!(info["trailingPunct"], ".");
        assert!(info["inner"].as_str().unwrap().contains("\\blank{\\dfrac{1}{2}}"));
        assert_eq!(info["metrics"]["hasFraction"], true);

        let nested = unwrap_boxed_blanks("On a \\boxed{\\blank{\\dfrac{x^2+1}{2}}} et \\fbox{\\blank{3}}.");
        assert_eq!(nested, "On a \\blank{\\dfrac{x^2+1}{2}} et \\blank{3}.");

        let unboxed = inspect_display_formula("\\Large \\lim_{x \\to 0} \\dfrac{\\sin x}{x} = 1");
        assert_eq!(unboxed["isBoxed"], false);
        assert_eq!(unboxed["inner"], "\\lim_{x \\to 0} \\dfrac{\\sin x}{x} = 1");
    }

    #[test]
    fn splits_single_and_multi_enumerate_solutions_deterministically() {
        let ex3 = "Le numérateur s'annule en $1$, donc on le factorise :\\par\\smallskip\\begin{align*}\\dfrac{x^2-6x+5}{x-1}&=\\dfrac{\\blank{(x-1)(x-5)}}{x-1}\\\\&=x\\blank{-5},\\qquad x\\ne1.\\end{align*} Par conséquent :\\par\\smallskip$$\\boxed{\\displaystyle \\lim_{x \\to 1}\\dfrac{x^2-6x+5}{x-1}=\\blank{-4}}$$";
        let steps3 = split_solution_steps(ex3);
        assert_eq!(steps3.len(), 2);
        assert!(steps3[0].contains("factorise"));
        assert!(steps3[1].starts_with("Par conséquent"));

        let ex5 = "\\par\\smallskip\\begin{enumerate}\\item Comme $|\\sin(1/x)|\\le1$, on a\\end{enumerate}$$|f(x)-2|=x^2\\left|\\sin\\left(\\dfrac1x\\right)\\right|\\le\\blank{x^2}.$$ Le majorant tend vers $0$, donc $\\displaystyle \\lim_{x \\to0}f(x)=\\blank{2}$.\\par\\smallskip\\begin{enumerate}\\item La propriété de la partie entière donne\\end{enumerate}\\begin{align*}\\left|g(x)-\\dfrac32\\right|&=\\dfrac{|x|}{2}\\left|\\blank{E\\left(\\dfrac3x\\right)-\\dfrac3x}\\right|\\\\&\\le\\dfrac{|x|}{2}.\\end{align*} Ce majorant tend vers $0$, donc $\\displaystyle \\lim_{x \\to0}g(x)=\\blank{\\dfrac32}$. Les résultats sont : $\\boxed{2}$ et $\\boxed{\\dfrac32}$.";
        let steps5 = split_solution_steps(ex5);
        assert_eq!(steps5.len(), 2);
        assert!(steps5[0].starts_with("\\textbf{1.}"));
        assert!(steps5[1].starts_with("\\textbf{2.}"));
        assert!(steps5[0].contains("$$\\boxed{"));
        assert!(steps5[1].contains("$$\\boxed{"));
    }
}
