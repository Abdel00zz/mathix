//! `math_engine::preprocess` — pré-traitement LaTeX, tableaux artistiques et découpe de listes :
//! - `sanitize_math_bold`       : convertit `\textbf{...}` mathématique en `\boldsymbol{...}`
//! - `normalize_bare_math_lines`: enveloppe les lignes d'équations autonomes en `$$...$$`
//! - `prepass_text_macros`      : déballe les macros texte enveloppantes avant segmentation
//! - `parse_art_table`          : parse les tableaux de référence `\begin{array|tabular}`
//! - `slice_for_figures`        : découpe une liste LaTeX autour des figures ancrées sur un item

use serde_json::{json, Value};

const MATH_BOLD_CMDS: &[&str] = &[
    "R", "N", "Z", "Q", "C", "K", "mathbb", "dfrac", "frac", "lim", "infty", "setminus",
    "alpha", "beta", "gamma", "delta", "Delta", "theta", "pi", "lambda", "sqrt", "cup",
    "cap", "in", "notin", "subset", "subseteq", "le", "leq", "ge", "geq", "ne", "neq",
    "pm", "mp", "times", "cdot", "to", "rightarrow", "iff", "Leftrightarrow", "Rightarrow",
    "approx", "sim", "vec", "overrightarrow", "overline", "displaystyle", "left", "right",
];

fn is_ascii_word(b: u8) -> bool {
    b.is_ascii_alphanumeric() || b == b'_'
}

fn contains_math_for_bold(inner: &str) -> bool {
    let without_cmds = strip_latex_cmds(inner);
    if has_french_accent(&without_cmds) || contains_prose_word(&without_cmds) {
        return false;
    }
    let prose_words = without_cmds
        .split(|c: char| !c.is_alphabetic())
        .filter(|w| w.chars().count() >= 3)
        .count();
    if prose_words >= 2 {
        return false;
    }
    if inner.bytes().any(|b| matches!(b, b'_' | b'^' | b'=' | b'<' | b'>')) {
        return true;
    }
    let bytes = inner.as_bytes();
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'\\' {
            let start = i + 1;
            let mut end = start;
            while end < bytes.len() && bytes[end].is_ascii_alphabetic() {
                end += 1;
            }
            if end > start {
                let cmd = &inner[start..end];
                if MATH_BOLD_CMDS.contains(&cmd)
                    || (cmd.starts_with("interval") && cmd.len() <= 10)
                {
                    return true;
                }
                i = end;
                continue;
            }
        }
        i += 1;
    }
    false
}

fn strip_displaystyle(inner: &str) -> (bool, String) {
    let mut found = false;
    let mut out = String::with_capacity(inner.len());
    let bytes = inner.as_bytes();
    let mut i = 0;
    while i < bytes.len() {
        if inner[i..].starts_with("\\displaystyle")
            && !bytes.get(i + 13).copied().map(is_ascii_word).unwrap_or(false)
        {
            found = true;
            i += 13;
            while i < bytes.len() && bytes[i].is_ascii_whitespace() {
                i += 1;
            }
            continue;
        }
        let ch = inner[i..].chars().next().unwrap();
        out.push(ch);
        i += ch.len_utf8();
    }
    (found, out.trim().to_string())
}

/// Convertit `\textbf{...}` contenant des expressions mathématiques en `\boldsymbol{...}`.
pub fn sanitize_math_bold(tex: &str) -> String {
    if !tex.contains("\\textbf") {
        return tex.to_string();
    }
    let mut out = String::with_capacity(tex.len() + 16);
    let bytes = tex.as_bytes();
    let mut i = 0;
    while i < bytes.len() {
        if tex[i..].starts_with("\\textbf") {
            let mut j = i + 7;
            while j < bytes.len() && bytes[j].is_ascii_whitespace() {
                j += 1;
            }
            if bytes.get(j) == Some(&b'{') {
                let mut depth = 0i32;
                let mut k = j;
                while k < bytes.len() {
                    if bytes[k] == b'\\' {
                        k += 1;
                        if k < bytes.len() {
                            let ch = tex[k..].chars().next().unwrap();
                            k += ch.len_utf8();
                        }
                        continue;
                    }
                    if bytes[k] == b'{' {
                        depth += 1;
                    } else if bytes[k] == b'}' {
                        depth -= 1;
                        if depth == 0 {
                            break;
                        }
                    }
                    let ch = tex[k..].chars().next().unwrap();
                    k += ch.len_utf8();
                }
                if k < bytes.len() {
                    let inner = &tex[j + 1..k];
                    if contains_math_for_bold(inner) {
                        let (has_display, cleaned) = strip_displaystyle(inner);
                        if has_display {
                            out.push_str("\\displaystyle ");
                        }
                        out.push_str("\\boldsymbol{");
                        out.push_str(&cleaned);
                        out.push('}');
                        i = k + 1;
                        continue;
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

const SKIP_LINE_CMDS: &[&str] = &[
    "method", "conclusion", "rappel", "tip", "astuce", "objectif", "savant", "histoire",
    "step", "st", "item", "par", "textbf", "textit", "emph", "qst", "question",
];

const PAR_PREFIX_CMDS: &[&str] = &[
    "method", "conclusion", "rappel", "tip", "astuce", "objectif",
];

const FRENCH_PROSE_WORDS: &[&str] = &[
    "La", "Le", "Les", "Un", "Une", "Des", "Pour", "Donc", "On", "Or", "Soit", "Soient",
    "Sur", "En", "De", "Par", "Puisque", "Quand", "Tableau", "Calculons", "Factorisons",
    "Posons", "Étudions", "Etudions", "Ainsi", "Alors", "Avec", "Dans", "Comme", "Cette",
    "Ces", "Mais", "Car", "Si", "Est", "Sont", "Fonction", "Droite", "Point",
];

const BARE_MATH_CMDS: &[&str] = &[
    "iff", "implies", "Rightarrow", "Leftrightarrow", "dfrac", "frac", "lim", "displaystyle",
    "sqrt", "pm", "cdot", "times", "to", "rightarrow", "infty", "le", "leq", "ge", "geq",
    "ne", "neq", "approx", "sim", "quad", "qquad", "left", "right",
];

fn leading_cmd(s: &str) -> Option<&str> {
    if !s.starts_with('\\') {
        return None;
    }
    let bytes = s.as_bytes();
    let mut end = 1;
    while end < bytes.len() && bytes[end].is_ascii_alphabetic() {
        end += 1;
    }
    if end > 1 {
        Some(&s[1..end])
    } else {
        None
    }
}

fn strip_latex_cmds(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    let bytes = s.as_bytes();
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'\\' {
            let mut end = i + 1;
            while end < bytes.len() && bytes[end].is_ascii_alphabetic() {
                end += 1;
            }
            if end > i + 1 {
                out.push(' ');
                i = end;
                continue;
            }
        }
        let ch = s[i..].chars().next().unwrap();
        out.push(ch);
        i += ch.len_utf8();
    }
    out
}

fn has_french_accent(s: &str) -> bool {
    s.chars().any(|c| {
        matches!(
            c,
            'à' | 'â' | 'ä' | 'é' | 'è' | 'ê' | 'ë' | 'î' | 'ï' | 'ô' | 'ö' | 'ù' | 'û' | 'ü' | 'ç'
            | 'À' | 'Â' | 'Ä' | 'É' | 'È' | 'Ê' | 'Ë' | 'Î' | 'Ï' | 'Ô' | 'Ö' | 'Ù' | 'Û' | 'Ü' | 'Ç'
        )
    })
}

fn contains_prose_word(without_cmds: &str) -> bool {
    if without_cmds.contains("D'où") || without_cmds.contains("d'où") {
        return true;
    }
    for tok in without_cmds.split(|c: char| !c.is_alphabetic()) {
        if !tok.is_empty() && FRENCH_PROSE_WORDS.contains(&tok) {
            return true;
        }
    }
    false
}

fn contains_any_cmd(s: &str, cmds: &[&str]) -> bool {
    let bytes = s.as_bytes();
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'\\' {
            let mut end = i + 1;
            while end < bytes.len() && bytes[end].is_ascii_alphabetic() {
                end += 1;
            }
            if end > i + 1 {
                let cmd = &s[i + 1..end];
                if cmds.contains(&cmd) {
                    return true;
                }
                i = end;
                continue;
            }
        }
        i += 1;
    }
    false
}

fn is_bare_math_line(trimmed: &str) -> bool {
    if trimmed.is_empty() {
        return false;
    }
    if trimmed.contains('$') || trimmed.contains("\\(") || trimmed.contains("\\[") {
        return false;
    }
    if trimmed.starts_with("\\begin{") || trimmed.starts_with("\\end{") {
        return false;
    }
    if let Some(cmd) = leading_cmd(trimmed) {
        if SKIP_LINE_CMDS.contains(&cmd) {
            return false;
        }
    }
    if contains_any_cmd(trimmed, WRAP_COMMANDS) {
        return false;
    }
    let without_cmds = strip_latex_cmds(trimmed);
    if has_french_accent(&without_cmds) || contains_prose_word(&without_cmds) {
        return false;
    }
    if contains_any_cmd(trimmed, BARE_MATH_CMDS) {
        return true;
    }
    let allowed = trimmed.chars().all(|c| {
        c.is_ascii_alphanumeric()
            || matches!(
                c,
                '_' | '(' | ')' | '[' | ']' | ' ' | '\t' | '\'' | '+' | '-' | '*' | '/' | '^'
                | '.' | ',' | '=' | '<' | '>' | '|' | '{' | '}'
            )
    });
    if !allowed {
        return false;
    }
    let bytes = trimmed.as_bytes();
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i].is_ascii_alphanumeric() || matches!(bytes[i], b')' | b']' | b'}' | b'\'') {
            let mut j = i + 1;
            while j < bytes.len() && bytes[j].is_ascii_whitespace() {
                j += 1;
            }
            if j < bytes.len() && matches!(bytes[j], b'=' | b'<' | b'>') {
                return true;
            }
        }
        i += 1;
    }
    false
}

/// Enveloppe en `$$...$$` les lignes autonomes d'équations sans délimiteurs `$`.
pub fn normalize_bare_math_lines(raw: &str) -> String {
    if !raw.contains('\n') {
        return raw.to_string();
    }
    let mut env_depth: i32 = 0;
    let mut in_display = false;
    let mut out: Vec<String> = Vec::new();

    for (idx, line) in raw.split('\n').enumerate() {
        let trimmed = line.trim();
        if env_depth == 0 && !in_display {
            if idx > 0 && leading_cmd(trimmed).map(|c| PAR_PREFIX_CMDS.contains(&c)).unwrap_or(false) {
                out.push(format!("\\par {trimmed}"));
            } else if is_bare_math_line(trimmed) {
                out.push(format!("$${trimmed}$$"));
            } else {
                out.push(line.to_string());
            }
        } else {
            out.push(line.to_string());
        }

        let dd_count = line.matches("$$").count();
        if dd_count % 2 == 1 {
            in_display = !in_display;
        }
        let begins = line.matches("\\begin{").count() as i32;
        let ends = line.matches("\\end{").count() as i32;
        env_depth = (env_depth + begins - ends).max(0);
    }

    out.join("\n")
}

const WRAP_COMMANDS: &[&str] = &[
    "qst", "mathqst", "objectif", "savant", "histoire", "motivation", "defi", "question",
    "qpart", "itemsize", "method", "conclusion", "tip", "astuce", "rappel", "step", "st",
    "blank", "blanck", "balck", "reveal", "hide",
    "hl", "highlight", "hlyellow", "hlred", "hlblue", "hlgreen", "hlorange", "hlpurple",
    "hlpink", "hlcyan", "hlgray",
    "textbf", "strong", "textit", "emph", "texttt", "textrm", "textsf", "textsc", "text",
    "textsuperscript", "underline", "overline", "sout", "uwave",
    "red", "blue", "green", "orange", "purple", "cyan", "gray",
    "fbox", "boxed", "result", "encadre", "calcbtn",
    "term", "concept", "keyword", "semref", "ref", "eqref", "cite",
    "large", "huge", "small", "tiny",
];

fn bare_text_token(cmd: &str) -> Option<&'static str> {
    match cmd {
        "par" | "smallskip" | "medskip" | "bigskip" | "newpar" => Some("%%PAR%%"),
        "noindent" | "centering" => Some(""),
        "og" => Some("«"),
        "fg" => Some("»"),
        "method" => Some("%%BADGE:method%%"),
        "rappel" => Some("%%BADGE:rappel%%"),
        "tip" | "astuce" => Some("%%BADGE:tip%%"),
        "conclusion" => Some("%%BADGE:conclusion%%"),
        "objectif" => Some("%%BADGE:objectif%%"),
        "savant" => Some("%%BADGE:savant%%"),
        "histoire" => Some("%%BADGE:histoire%%"),
        _ => None,
    }
}

fn find_matching_env_end(s: &str, start_idx: usize, env_name: &str) -> Option<usize> {
    let open_tag = format!("\\begin{{{env_name}}}");
    let close_tag = format!("\\end{{{env_name}}}");
    let mut depth = 0i32;
    let mut k = start_idx;
    while k < s.len() {
        let rest = &s[k..];
        if rest.starts_with(&open_tag) {
            depth += 1;
            k += open_tag.len();
        } else if rest.starts_with(&close_tag) {
            depth -= 1;
            k += close_tag.len();
            if depth == 0 {
                return Some(k);
            }
        } else {
            let ch = rest.chars().next().unwrap();
            k += ch.len_utf8();
        }
    }
    None
}

fn match_glued_layout(cmd: &str) -> Option<(&'static str, usize)> {
    const PREFIXES: &[&str] = &[
        "smallskip", "medskip", "bigskip", "noindent", "centering", "newpar",
    ];
    for &p in PREFIXES {
        if let Some(rest) = cmd.strip_prefix(p) {
            if let Some(ch) = rest.chars().next() {
                if ch.is_uppercase() {
                    return Some((p, p.len()));
                }
            }
        }
    }
    None
}

fn find_unescaped_dollar(s: &str) -> Option<usize> {
    let bytes = s.as_bytes();
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'\\' {
            i += 2;
            continue;
        }
        if bytes[i] == b'$' {
            return Some(i);
        }
        i += 1;
    }
    None
}

fn prepass_inner(raw: &str, depth: usize) -> String {
    if depth > 24 {
        return raw.to_string();
    }
    let mut out = String::with_capacity(raw.len() + 32);
    let mut i = 0;
    let guard = raw.len() * 2 + 16;
    let mut steps = 0;

    while i < raw.len() && steps < guard {
        steps += 1;
        let rest = &raw[i..];

        // 1. spans mathématiques
        if rest.starts_with("$$") {
            let len = rest[2..].find("$$").map(|e| e + 4).unwrap_or(2);
            out.push_str(&rest[..len]);
            i += len;
            continue;
        }
        if rest.starts_with("\\[") {
            let len = rest[2..].find("\\]").map(|e| e + 4).unwrap_or(2);
            out.push_str(&rest[..len]);
            i += len;
            continue;
        }
        if rest.starts_with('$') {
            let len = find_unescaped_dollar(&rest[1..]).map(|e| e + 2).unwrap_or(1);
            out.push_str(&rest[..len]);
            i += len;
            continue;
        }
        if rest.starts_with("\\(") {
            let len = rest[2..].find("\\)").map(|e| e + 4).unwrap_or(2);
            out.push_str(&rest[..len]);
            i += len;
            continue;
        }

        // 2. environnements \begin{env}...\end{env}
        if let Some(after) = rest.strip_prefix("\\begin{") {
            if let Some(close) = after.find('}') {
                let env_name = &after[..close];
                if !env_name.is_empty()
                    && env_name.bytes().all(|b| b.is_ascii_alphabetic() || b == b'_' || b == b'*')
                {
                    if let Some(end_pos) = find_matching_env_end(raw, i, env_name) {
                        out.push_str(&raw[i..end_pos]);
                        i = end_pos;
                        continue;
                    }
                    let tag_len = 7 + close + 1;
                    out.push_str(&rest[..tag_len]);
                    i += tag_len;
                    continue;
                }
            }
        }

        // 3. commandes LaTeX
        if rest.starts_with("\\\\") {
            out.push_str("%%BR%%");
            i += 2;
            continue;
        }
        if rest.starts_with("\\%") {
            out.push('%');
            i += 2;
            continue;
        }
        if rest.starts_with('\\') {
            let bytes = rest.as_bytes();
            let mut end = 1;
            while end < bytes.len() && bytes[end].is_ascii_alphabetic() {
                end += 1;
            }
            if end > 1 {
                let cmd = &rest[1..end];
                if WRAP_COMMANDS.contains(&cmd) {
                    let mut j = i + end;
                    while j < raw.len() && raw.as_bytes()[j].is_ascii_whitespace() {
                        j += 1;
                    }
                    if raw.as_bytes().get(j) == Some(&b'{') {
                        let mut bdepth = 0i32;
                        let mut k = j;
                        while k < raw.len() {
                            let b = raw.as_bytes()[k];
                            if b == b'\\' {
                                k += 1;
                                if k < raw.len() {
                                    let ch = raw[k..].chars().next().unwrap();
                                    k += ch.len_utf8();
                                }
                                continue;
                            }
                            if b == b'{' {
                                bdepth += 1;
                            } else if b == b'}' {
                                bdepth -= 1;
                                if bdepth == 0 {
                                    break;
                                }
                            }
                            let ch = raw[k..].chars().next().unwrap();
                            k += ch.len_utf8();
                        }
                        if k < raw.len() {
                            let inner = &raw[j + 1..k];
                            out.push_str("%%OPEN:");
                            out.push_str(cmd);
                            out.push_str("%%");
                            out.push_str(&prepass_inner(&normalize_bare_math_lines(inner), depth + 1));
                            out.push_str("%%CLOSE:");
                            out.push_str(cmd);
                            out.push_str("%%");
                            i = k + 1;
                            continue;
                        }
                    }
                    if let Some(tok) = bare_text_token(cmd) {
                        out.push_str(tok);
                        i += end;
                        continue;
                    }
                    out.push_str(&rest[..end]);
                    i += end;
                    continue;
                }
                if let Some(tok) = bare_text_token(cmd) {
                    out.push_str(tok);
                    i += end;
                    continue;
                }
                if let Some((prefix, plen)) = match_glued_layout(cmd) {
                    if let Some(tok) = bare_text_token(prefix) {
                        out.push_str(tok);
                    }
                    i += 1 + plen;
                    continue;
                }
                out.push_str(&rest[..end]);
                i += end;
                continue;
            }
        }

        let ch = rest.chars().next().unwrap();
        out.push(ch);
        i += ch.len_utf8();
    }

    if steps >= guard && i < raw.len() {
        out.push_str(&raw[i..]);
    }
    out
}

/// Pré-passe complète : normalisation des lignes d'équations + déballage des macros texte.
pub fn prepass_text_macros(input: &str) -> String {
    let raw = normalize_bare_math_lines(input);
    prepass_inner(&raw, 0)
}

/// Parse un tableau de référence `\begin{array|tabular}{|c|...}\hline...\end{array|tabular}`.
pub fn parse_art_table(tex: &str) -> Option<Value> {
    let mut s = tex.trim();
    if let Some(rest) = s.strip_prefix("\\def\\arraystretch{") {
        let close = rest.find('}')?;
        s = rest[close + 1..].trim_start();
    }
    let (env, after_begin) = if let Some(r) = s.strip_prefix("\\begin{array}{") {
        ("array", r)
    } else if let Some(r) = s.strip_prefix("\\begin{tabular}{") {
        ("tabular", r)
    } else {
        return None;
    };
    let spec_end = after_begin.find('}')?;
    let col_spec = &after_begin[..spec_end];
    let rest = &after_begin[spec_end + 1..];
    let end_tag = format!("\\end{{{env}}}");
    let body = rest.strip_suffix(&end_tag)?;

    if !body.contains("\\hline") {
        return None;
    }
    if body.contains("\\multicolumn")
        || body.contains("\\multirow")
        || body.contains("\\begin{array")
        || body.contains("\\begin{tabular")
        || body.contains("\\begin{cases")
        || body.contains("\\begin{pmatrix")
        || body.contains("\\begin{bmatrix")
    {
        return None;
    }

    let aligns: Vec<String> = col_spec
        .chars()
        .filter(|&c| matches!(c, 'l' | 'c' | 'r'))
        .map(|c| c.to_string())
        .collect();
    if aligns.len() < 2 {
        return None;
    }

    // Découpe sur `\\` hors accolades
    let mut raw_rows: Vec<String> = Vec::new();
    let mut cur = String::new();
    let mut depth = 0i32;
    let bytes = body.as_bytes();
    let mut i = 0;
    while i < bytes.len() {
        let b = bytes[i];
        if b == b'{' {
            depth += 1;
            cur.push('{');
            i += 1;
            continue;
        }
        if b == b'}' {
            depth = (depth - 1).max(0);
            cur.push('}');
            i += 1;
            continue;
        }
        if depth == 0 && b == b'\\' && bytes.get(i + 1) == Some(&b'\\') {
            raw_rows.push(std::mem::take(&mut cur));
            i += 2;
            let after = &body[i..];
            let ws = after.len() - after.trim_start().len();
            if after[ws..].starts_with('[') {
                if let Some(close) = after[ws..].find(']') {
                    i += ws + close + 1;
                }
            }
            continue;
        }
        let ch = body[i..].chars().next().unwrap();
        cur.push(ch);
        i += ch.len_utf8();
    }
    if !cur.trim().is_empty() {
        raw_rows.push(cur);
    }

    let mut has_double_rule_after_first = false;
    let mut rows: Vec<Vec<String>> = Vec::new();

    for (r, raw_line) in raw_rows.iter().enumerate() {
        let mut line = raw_line.trim();
        if r == 1 {
            if let Some(rest) = line.strip_prefix("\\hline") {
                if rest.trim_start().starts_with("\\hline") {
                    has_double_rule_after_first = true;
                }
            }
        }
        while let Some(rest) = line.strip_prefix("\\hline") {
            line = rest.trim_start();
        }
        while let Some(rest) = line.strip_suffix("\\hline") {
            line = rest.trim_end();
        }
        let line = line.trim();
        if line.is_empty() {
            continue;
        }

        // Découpe sur `&` hors accolades
        let mut cells: Vec<String> = Vec::new();
        let mut cell = String::new();
        let mut d = 0i32;
        let lb = line.as_bytes();
        let mut j = 0;
        while j < lb.len() {
            let b = lb[j];
            if b == b'\\' && j + 1 < lb.len() {
                cell.push('\\');
                let next_ch = line[j + 1..].chars().next().unwrap();
                cell.push(next_ch);
                j += 1 + next_ch.len_utf8();
                continue;
            }
            if b == b'{' {
                d += 1;
            } else if b == b'}' {
                d = (d - 1).max(0);
            } else if b == b'&' && d == 0 {
                cells.push(cell.trim().to_string());
                cell.clear();
                j += 1;
                continue;
            }
            let ch = line[j..].chars().next().unwrap();
            cell.push(ch);
            j += ch.len_utf8();
        }
        cells.push(cell.trim().to_string());
        rows.push(cells);
    }

    if rows.len() < 2 {
        return None;
    }

    let first_looks_header = has_double_rule_after_first
        || rows[0].iter().all(|c| {
            contains_any_cmd(c, &["textbf", "text", "mathrm"])
        })
        || matches!(
            rows[0].first().map(|s| s.trim()).unwrap_or(""),
            "x" | "t" | "n" | "\\theta" | "\\alpha"
        );

    Some(json!({
        "aligns": aligns,
        "hasHeader": first_looks_header,
        "rows": rows,
    }))
}

/* ── Découpe de liste LaTeX autour de figures ancrées sur une question ────── */

struct ListItemSpan {
    start: usize,
    end: usize,
}

struct ListSpan {
    open: String,
    close_start: usize,
    close_end: usize,
    items: Vec<ListItemSpan>,
}

fn find_top_level_lists(content: &str) -> Vec<ListSpan> {
    let mut lists: Vec<ListSpan> = Vec::new();
    let mut stack: Vec<ListSpan> = Vec::new();
    let mut i = 0;

    while i < content.len() {
        let rest = &content[i..];
        let open_len = if rest.starts_with("\\begin{enumerate}") {
            Some(17)
        } else if rest.starts_with("\\begin{itemize}") {
            Some(15)
        } else {
            None
        };
        if let Some(base_len) = open_len {
            let mut end = i + base_len;
            if content.as_bytes().get(end) == Some(&b'[') {
                if let Some(rel) = content[end + 1..].find(']') {
                    end = end + 1 + rel + 1;
                }
            }
            stack.push(ListSpan {
                open: content[i..end].to_string(),
                close_start: content.len(),
                close_end: content.len(),
                items: Vec::new(),
            });
            i = end;
            continue;
        }

        let close_len = if rest.starts_with("\\end{enumerate}") {
            Some(15)
        } else if rest.starts_with("\\end{itemize}") {
            Some(13)
        } else {
            None
        };
        if let Some(clen) = close_len {
            if let Some(mut span) = stack.pop() {
                span.close_start = i;
                span.close_end = i + clen;
                if stack.is_empty() {
                    lists.push(span);
                }
            }
            i += clen;
            continue;
        }

        if rest.starts_with("\\item")
            && !rest.as_bytes().get(5).copied().map(|b| b.is_ascii_alphabetic()).unwrap_or(false)
        {
            if stack.len() == 1 {
                if let Some(owner) = stack.last_mut() {
                    if let Some(prev) = owner.items.last_mut() {
                        prev.end = i;
                    }
                    owner.items.push(ListItemSpan {
                        start: i,
                        end: content.len(),
                    });
                }
            }
            i += 5;
            continue;
        }

        let ch = rest.chars().next().unwrap();
        i += ch.len_utf8();
    }

    // Si une liste top-level n'était pas fermée, la conserver
    for span in stack.into_iter().take(1) {
        lists.push(span);
    }

    for list in &mut lists {
        for item in &mut list.items {
            if item.end == content.len() && list.close_start < content.len() {
                item.end = list.close_start;
            }
        }
    }
    lists
}

fn split_at_question(content: &str, question_index: usize, relation: &str) -> Option<(String, String, usize)> {
    let lists = find_top_level_lists(content);
    let mut remaining = question_index;
    for list in lists {
        if remaining > list.items.len() {
            remaining -= list.items.len();
            continue;
        }
        if remaining == 0 {
            return None;
        }
        let item = list.items.get(remaining - 1)?;
        let close_tag = &content[list.close_start..list.close_end];
        if close_tag.is_empty() {
            return None;
        }
        if relation == "before" {
            let before = format!("{}{}", &content[..item.start], close_tag);
            let after = format!("{}{}", list.open, &content[item.start..]);
            return Some((before, after, remaining - 1));
        }
        let closes_here = item.end >= list.close_start;
        let tail = &content[if closes_here { list.close_end } else { item.end }..];
        let before = format!("{}{}", &content[..item.end], close_tag);
        let after = if closes_here {
            tail.to_string()
        } else {
            format!("{}{}", list.open, tail)
        };
        return Some((before, after, if closes_here { 0 } else { remaining }));
    }
    None
}

fn drop_empty_lists(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    let mut i = 0;
    while i < s.len() {
        let rest = &s[i..];
        let env = if rest.starts_with("\\begin{enumerate}") {
            Some(("enumerate", 17))
        } else if rest.starts_with("\\begin{itemize}") {
            Some(("itemize", 15))
        } else {
            None
        };
        if let Some((name, base_len)) = env {
            let mut cur = i + base_len;
            while cur < s.len() && matches!(s.as_bytes()[cur], b' ' | b'\t' | b'\r') {
                cur += 1;
            }
            if s.as_bytes().get(cur) == Some(&b'[') {
                if let Some(rel) = s[cur + 1..].find(']') {
                    cur = cur + 1 + rel + 1;
                }
            }
            while cur < s.len() && matches!(s.as_bytes()[cur], b' ' | b'\t' | b'\r') {
                cur += 1;
            }
            let close_tag = format!("\\end{{{name}}}");
            if s[cur..].starts_with(&close_tag) {
                i = cur + close_tag.len();
                continue;
            }
        }
        let ch = rest.chars().next().unwrap();
        out.push(ch);
        i += ch.len_utf8();
    }
    out.trim().to_string()
}

pub fn slice_for_figures(content: &str, figures: &[Value]) -> Value {
    let mut ordered: Vec<Value> = figures
        .iter()
        .filter(|f| {
            f.get("src")
                .and_then(Value::as_str)
                .map(|s| !s.trim().is_empty())
                .unwrap_or(false)
        })
        .cloned()
        .collect();
    ordered.sort_by_key(|f| f.get("targetItem").and_then(Value::as_i64).unwrap_or(1));

    let mut slices: Vec<(String, usize, Vec<Value>)> = Vec::new();
    let mut unplaced: Vec<Value> = Vec::new();
    let mut remaining = content.to_string();
    let mut emitted: usize = 0;

    for fig in ordered {
        let target = fig.get("targetItem").and_then(Value::as_i64).unwrap_or(1).max(1) as usize;
        let local = target as isize - emitted as isize;
        let pos = fig.get("position").and_then(Value::as_str).unwrap_or("top");
        let relation = if pos == "bottom" { "after" } else { "before" };

        if local <= 0 {
            if let Some(last) = slices.last_mut() {
                last.2.push(fig);
            } else {
                unplaced.push(fig);
            }
            continue;
        }
        match split_at_question(&remaining, local as usize, relation) {
            Some((before, after, list_start)) => {
                slices.push((drop_empty_lists(&before), emitted, vec![fig]));
                remaining = after;
                emitted += list_start;
            }
            None => unplaced.push(fig),
        }
    }
    slices.push((drop_empty_lists(&remaining), emitted, Vec::new()));

    let slices_json: Vec<Value> = slices
        .into_iter()
        .map(|(c, ls, figs)| {
            json!({
                "content": c,
                "listStart": ls,
                "figuresAfter": figs,
            })
        })
        .collect();

    json!({
        "ok": true,
        "engine": "math",
        "slices": slices_json,
        "unplaced": unplaced,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn converts_math_textbf_to_boldsymbol() {
        let out = sanitize_math_bold(r"Soit \textbf{\displaystyle f(x) = x^2} et \textbf{Bonjour}.");
        assert_eq!(out, r"Soit \displaystyle \boldsymbol{f(x) = x^2} et \textbf{Bonjour}.");
    }

    #[test]
    fn normalizes_bare_math_lines_and_keeps_prose() {
        let src = "Calculons la dérivée :\nf'(x) = 2x + 1\n\\conclusion On conclut.";
        let out = normalize_bare_math_lines(src);
        assert!(out.contains("$$f'(x) = 2x + 1$$"));
        assert!(out.contains("\\par \\conclusion On conclut."));
        assert!(out.starts_with("Calculons la dérivée :"));
    }

    #[test]
    fn prepasses_text_macros_without_touching_math() {
        let out = prepass_text_macros(r"\textbf{Soit} $x \in \R$ \medskipAvec \\ suite");
        assert_eq!(out, "%%OPEN:textbf%%Soit%%CLOSE:textbf%% $x \\in \\R$ %%PAR%%Avec %%BR%% suite");

        let mixed = prepass_text_macros("Cas 1 :\nPar \\textbf{$9$ et $11$ :} ok");
        assert!(!mixed.contains("$$"), "prose line with \\textbf must not be wrapped in $$");
        assert!(mixed.contains("%%OPEN:textbf%%$9$ et $11$ :%%CLOSE:textbf%%"));
    }

    #[test]
    fn parses_reference_art_table() {
        let tex = r"\begin{array}{|c|c|}\hline x & f(x) \\ \hline\hline 0 & 1 \\ \hline \end{array}";
        let tbl = parse_art_table(tex).expect("should parse table");
        assert_eq!(tbl["hasHeader"], true);
        assert_eq!(tbl["rows"].as_array().unwrap().len(), 2);
    }

    #[test]
    fn slices_enumerate_for_item_figures() {
        let src = r"\begin{enumerate}\item Q1\item Q2\item Q3\end{enumerate}";
        let figs = vec![json!({ "src": "/images/a.png", "targetItem": 2, "position": "bottom" })];
        let res = slice_for_figures(src, &figs);
        assert_eq!(res["slices"].as_array().unwrap().len(), 2);
        assert_eq!(res["slices"][1]["listStart"], 2);
        assert_eq!(res["unplaced"].as_array().unwrap().len(), 0);
    }
}
