//! Complete LaTeX-to-HTML, tkz-tab SVG, art-table, structured-solution, and media compiler.
//! Calls `math_engine` directly in-process inside WebAssembly.

use std::sync::atomic::{AtomicU64, Ordering};
use serde_json::{json, Value};

use crate::html::{esc, esc_attr, icon};

static TKZ_SEQ: AtomicU64 = AtomicU64::new(1);

fn prepare_tex(tex: &str) -> String {
    let unwrapped = math_engine::structure::unwrap_boxed_blanks(tex);
    let (repaired, _) = math_engine::normalize::repair_line_break_brackets(&unwrapped);
    math_engine::preprocess::sanitize_math_bold(&repaired)
}

/// Emits a KaTeX placeholder hydrated synchronously by wasm-host.js with `window.katex.renderToString`.
pub fn tex_slot(tex: &str, display: bool) -> String {
    let safe = prepare_tex(tex);
    if display {
        format!(
            r#"<div class="math-tex" data-tex="{}" data-display="1"></div>"#,
            esc_attr(&safe)
        )
    } else {
        format!(
            r#"<span class="math-tex" data-tex="{}" data-display="0"></span>"#,
            esc_attr(&safe)
        )
    }
}

pub fn has_math_syntax(raw: &str) -> bool {
    if raw.contains('$') || raw.contains(r"\(") || raw.contains(r"\[") {
        return true;
    }
    let bytes = raw.as_bytes();
    for i in 0..bytes.len() {
        if bytes[i] == b'\\' && i + 2 < bytes.len()
            && bytes[i + 1].is_ascii_alphabetic()
            && bytes[i + 2].is_ascii_alphabetic()
        {
            return true;
        }
    }
    false
}

pub fn render_inline_title(raw: &str) -> String {
    if raw.is_empty() {
        return String::new();
    }
    if has_math_syntax(raw) {
        render_math_opts(raw, true, 0, 0)
    } else {
        esc(raw)
    }
}

pub fn render_math(content: &str) -> String {
    render_math_opts(content, false, 0, 0)
}

pub fn render_math_inline(content: &str) -> String {
    render_math_opts(content, true, 0, 0)
}

fn label_badge(text: &str, ink: &str) -> String {
    format!(
        r#"<span class="bt" style="--k:{ink}; display:inline-flex; margin:0 6px 0 0; vertical-align:1px">{text}</span>"#
    )
}

fn process_text_macros(escaped: &str) -> String {
    if !escaped.contains('\\') {
        return escaped.to_string();
    }
    let mut out = String::with_capacity(escaped.len() + 32);
    let bytes = escaped.as_bytes();
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'\\' {
            if i + 1 < bytes.len() && bytes[i + 1] == b'\\' {
                out.push_str("<br>");
                i += 2;
                continue;
            }
            let start = i + 1;
            let mut end = start;
            while end < bytes.len() && bytes[end].is_ascii_alphabetic() {
                end += 1;
            }
            let cmd = &escaped[start..end];
            let repl: Option<String> = match cmd {
                "objectif" => Some(label_badge("Objectif", "var(--accent)")),
                "method" => Some(label_badge("Méthode", "var(--am)")),
                "conclusion" => Some(label_badge("Conclusion", "var(--g)")),
                "tip" | "astuce" => Some(label_badge("Astuce", "var(--v)")),
                "savant" => Some(label_badge("Savant", "var(--g)")),
                "histoire" => Some(label_badge("Histoire", "var(--v)")),
                "rappel" => Some(label_badge("Rappel", "var(--am)")),
                "qquad" => Some("&emsp;&emsp;".into()),
                "quad" => Some("&emsp;".into()),
                "smallskip" | "medskip" | "mediumskip" | "bigskip" | "noindent" | "centering" | "newpar" | "par" => {
                    Some(r#"<span style="display:block; height:0.4rem"></span>"#.into())
                }
                "vskip" => {
                    let mut j = end;
                    while j < bytes.len() && bytes[j].is_ascii_whitespace() { j += 1; }
                    while j < bytes.len() && (bytes[j].is_ascii_digit() || bytes[j] == b'.') { j += 1; }
                    for unit in ["pt", "em", "mm"] {
                        if escaped[j..].starts_with(unit) { j += unit.len(); break; }
                    }
                    end = j;
                    Some(r#"<span style="display:block; height:0.4rem"></span>"#.into())
                }
                "og" => Some("«".into()),
                "fg" => Some("»".into()),
                _ => None,
            };
            if let Some(r) = repl {
                out.push_str(&r);
                i = end;
                continue;
            }
        }
        let ch = escaped[i..].chars().next().unwrap();
        out.push(ch);
        i += ch.len_utf8();
    }
    out
}

struct WrapSpec {
    tag: &'static str,
    cls: &'static str,
    prefix: Option<(&'static str, &'static str)>,
    style: Option<&'static str>,
}

fn wrap_spec(name: &str) -> Option<WrapSpec> {
    let s = match name {
        "qst" | "question" => WrapSpec { tag: "strong", cls: "math-qst", prefix: None, style: None },
        "mathqst" => WrapSpec { tag: "span", cls: "math-mathqst", prefix: None, style: None },
        "objectif" => WrapSpec { tag: "span", cls: "ru", prefix: None, style: None },
        "savant" => WrapSpec { tag: "span", cls: "math-savant", prefix: None, style: None },
        "histoire" => WrapSpec { tag: "span", cls: "math-history", prefix: None, style: None },
        "motivation" => WrapSpec { tag: "span", cls: "math-motivation", prefix: None, style: None },
        "defi" => WrapSpec { tag: "strong", cls: "math-defi", prefix: None, style: None },
        "qpart" => WrapSpec { tag: "span", cls: "ex-sub-num", prefix: None, style: None },
        "itemsize" => WrapSpec { tag: "span", cls: "math-itemsize", prefix: None, style: None },
        "method" => WrapSpec { tag: "span", cls: "", prefix: Some(("Méthode — ", "var(--am)")), style: None },
        "conclusion" => WrapSpec { tag: "span", cls: "", prefix: Some(("Conclusion — ", "var(--g)")), style: None },
        "tip" | "astuce" => WrapSpec { tag: "span", cls: "", prefix: Some(("Astuce — ", "var(--v)")), style: None },
        "rappel" => WrapSpec { tag: "span", cls: "", prefix: Some(("Rappel — ", "var(--am)")), style: None },
        "step" => WrapSpec { tag: "div", cls: "method-step", prefix: None, style: None },
        "st" => WrapSpec { tag: "span", cls: "math-st", prefix: None, style: None },
        "blank" | "blanck" | "balck" | "reveal" | "hide" => WrapSpec { tag: "span", cls: "math-blank", prefix: None, style: None },
        "hl" | "highlight" => WrapSpec { tag: "span", cls: "math-highlight", prefix: None, style: None },
        "hlyellow" => WrapSpec { tag: "span", cls: "math-highlight math-hl-yellow", prefix: None, style: None },
        "hlred" => WrapSpec { tag: "span", cls: "math-highlight math-hl-red", prefix: None, style: None },
        "hlblue" => WrapSpec { tag: "span", cls: "math-highlight math-hl-blue", prefix: None, style: None },
        "hlgreen" => WrapSpec { tag: "span", cls: "math-highlight math-hl-green", prefix: None, style: None },
        "hlorange" => WrapSpec { tag: "span", cls: "math-highlight math-hl-orange", prefix: None, style: None },
        "hlpurple" => WrapSpec { tag: "span", cls: "math-highlight math-hl-purple", prefix: None, style: None },
        "hlpink" => WrapSpec { tag: "span", cls: "math-highlight math-hl-pink", prefix: None, style: None },
        "hlcyan" => WrapSpec { tag: "span", cls: "math-highlight math-hl-cyan", prefix: None, style: None },
        "hlgray" => WrapSpec { tag: "span", cls: "math-highlight math-hl-gray", prefix: None, style: None },
        "textbf" | "strong" => WrapSpec { tag: "strong", cls: "", prefix: None, style: None },
        "textit" | "emph" => WrapSpec { tag: "em", cls: "", prefix: None, style: None },
        "texttt" => WrapSpec { tag: "code", cls: "", prefix: None, style: None },
        "textrm" => WrapSpec { tag: "span", cls: "", prefix: None, style: Some("font-family:var(--serif)") },
        "textsf" => WrapSpec { tag: "span", cls: "", prefix: None, style: Some("font-family:var(--sans)") },
        "textsc" => WrapSpec { tag: "span", cls: "", prefix: None, style: Some("font-variant-caps:small-caps") },
        "text" => WrapSpec { tag: "span", cls: "", prefix: None, style: None },
        "textsuperscript" => WrapSpec { tag: "sup", cls: "", prefix: None, style: None },
        "underline" => WrapSpec { tag: "u", cls: "", prefix: None, style: None },
        "overline" => WrapSpec { tag: "span", cls: "", prefix: None, style: Some("text-decoration:overline") },
        "sout" => WrapSpec { tag: "s", cls: "", prefix: None, style: None },
        "uwave" => WrapSpec { tag: "span", cls: "", prefix: None, style: Some("text-decoration:underline wavy") },
        "red" => WrapSpec { tag: "span", cls: "", prefix: None, style: Some("color:var(--r)") },
        "blue" => WrapSpec { tag: "span", cls: "", prefix: None, style: Some("color:var(--bl)") },
        "green" => WrapSpec { tag: "span", cls: "", prefix: None, style: Some("color:var(--g)") },
        "orange" => WrapSpec { tag: "span", cls: "", prefix: None, style: Some("color:var(--am)") },
        "purple" => WrapSpec { tag: "span", cls: "", prefix: None, style: Some("color:var(--v)") },
        "cyan" => WrapSpec { tag: "span", cls: "", prefix: None, style: Some("color:#0891b2") },
        "gray" => WrapSpec { tag: "span", cls: "", prefix: None, style: Some("color:var(--muted)") },
        "fbox" | "boxed" | "encadre" => WrapSpec { tag: "span", cls: "math-boxed", prefix: None, style: None },
        "result" => WrapSpec { tag: "div", cls: "math-result", prefix: None, style: None },
        "calcbtn" => WrapSpec { tag: "kbd", cls: "calc-btn", prefix: None, style: None },
        "term" | "concept" | "keyword" => WrapSpec { tag: "span", cls: "keyword", prefix: None, style: None },
        "semref" => WrapSpec { tag: "span", cls: "math-semref", prefix: None, style: None },
        "ref" | "eqref" | "cite" => WrapSpec { tag: "span", cls: "math-ref", prefix: None, style: None },
        "large" => WrapSpec { tag: "span", cls: "", prefix: None, style: Some("font-size:1.15em") },
        "huge" => WrapSpec { tag: "div", cls: "", prefix: None, style: Some("font-size:1.3em;font-weight:600") },
        "small" => WrapSpec { tag: "span", cls: "", prefix: None, style: Some("font-size:0.88em") },
        "tiny" => WrapSpec { tag: "span", cls: "", prefix: None, style: Some("font-size:0.78em") },
        _ => return None,
    };
    Some(s)
}

fn badge_html(name: &str) -> Option<String> {
    match name {
        "method" => Some(label_badge("Méthode", "var(--am)")),
        "rappel" => Some(label_badge("Rappel", "var(--am)")),
        "tip" => Some(label_badge("Astuce", "var(--v)")),
        "conclusion" => Some(label_badge("Conclusion", "var(--g)")),
        "objectif" => Some(label_badge("Objectif", "var(--v)")),
        "savant" => Some(label_badge("Savant", "var(--g)")),
        "histoire" => Some(label_badge("Histoire", "var(--v)")),
        _ => None,
    }
}

fn to_display_tex(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    let bytes = s.as_bytes();
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'\\' {
            let mut end = i + 1;
            while end < bytes.len() && bytes[end].is_ascii_alphabetic() {
                end += 1;
            }
            match &s[i + 1..end] {
                "plus" => { out.push('+'); i = end; continue; }
                "moins" => { out.push('-'); i = end; continue; }
                "zero" => { out.push('0'); i = end; continue; }
                _ => {}
            }
        }
        let ch = s[i..].chars().next().unwrap();
        out.push(ch);
        i += ch.len_utf8();
    }
    out.trim().to_string()
}

fn tkz_arrow_y(levels: u64, pos: &str) -> u32 {
    match (levels, pos) {
        (3, "top") => 18,
        (3, "bot") => 82,
        (3, _) => 50,
        (_, "top") => 24,
        (_, "bot") => 76,
        _ => 50,
    }
}

fn render_tkz_arrow(from: &str, to: &str, levels: u64) -> String {
    let seq = TKZ_SEQ.fetch_add(1, Ordering::Relaxed);
    let id = format!("tkz-tip-{seq}");
    let y1 = tkz_arrow_y(levels, from);
    let y2 = tkz_arrow_y(levels, to);
    format!(
        r#"<svg class="tkz-arrow" aria-hidden="true" focusable="false"><defs><marker id="{id}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" markerUnits="userSpaceOnUse" orient="auto"><path d="M0,0.6 L10,5 L0,9.4 L2.6,5 Z" class="tkz-arrow-tip"/></marker></defs><line x1="9%" x2="91%" y1="{y1}%" y2="{y2}%" class="tkz-arrow-line" marker-end="url(#{id})"/></svg>"#
    )
}

fn render_tkz_stack(side: &Value, levels: u64, align: &str) -> String {
    let slots: &[&str] = if levels == 3 { &["top", "mid", "bot"] } else { &["top", "bot"] };
    let tex = side.get("tex").and_then(Value::as_str).unwrap_or("");
    let lv = side.get("level").and_then(Value::as_str).unwrap_or("");
    let mut out = format!(r#"<div class="tkz-stack tkz-stack--{align}">"#);
    for slot in slots {
        out.push_str(&format!(r#"<div class="tkz-slot tkz-slot--{slot}">"#));
        if !tex.is_empty() && lv == *slot {
            out.push_str(&tex_slot(&to_display_tex(tex), false));
        }
        out.push_str("</div>");
    }
    out.push_str("</div>");
    out
}

pub fn try_render_tkztab(tex: &str) -> Option<String> {
    let model = math_engine::tkztab::parse_tkztab(tex)?;
    let rows = model.get("rows")?.as_array()?;
    let has_var = rows.iter().any(|r| r.get("type").and_then(Value::as_str) == Some("var"));
    let aria = if has_var { "Tableau de variations" } else { "Tableau de signes" };

    let mut out = format!(
        r#"<div class="tkz-tab-scroll"><table class="tkz-tab" aria-label="{aria}"><tbody>"#
    );

    // X row
    out.push_str(r#"<tr class="tkz-row tkz-row--x"><th class="tkz-label" scope="row">"#);
    if let Some(xl) = model.get("xLabel").and_then(Value::as_str).filter(|s| !s.is_empty()) {
        out.push_str(&tex_slot(&to_display_tex(xl), false));
    }
    out.push_str("</th>");
    let x_vals = model.get("xValues").and_then(Value::as_array).cloned().unwrap_or_default();
    let xn = x_vals.len();
    for (i, v) in x_vals.iter().enumerate() {
        let mut cls = String::from("tkz-b");
        if i == 0 { cls.push_str(" tkz-b--first"); }
        if i + 1 == xn { cls.push_str(" tkz-b--last"); }
        out.push_str(&format!(r#"<td class="{cls}">"#));
        out.push_str(&tex_slot(&to_display_tex(v.as_str().unwrap_or("")), false));
        out.push_str("</td>");
        if i + 1 < xn {
            out.push_str(r#"<td class="tkz-i"></td>"#);
        }
    }
    out.push_str("</tr>");

    // Body rows
    for row in rows {
        let rtype = row.get("type").and_then(Value::as_str).unwrap_or("");
        let label = row.get("label").and_then(Value::as_str).unwrap_or("");
        if rtype == "var" {
            let levels = row.get("levels").and_then(Value::as_u64).unwrap_or(2);
            let nodes = row.get("nodes").and_then(Value::as_array).cloned().unwrap_or_default();
            let arrows = row.get("arrows").and_then(Value::as_array).cloned().unwrap_or_default();
            let n = nodes.len();
            out.push_str(&format!(r#"<tr class="tkz-row tkz-row--var tkz-row--lv{levels}"><th class="tkz-label" scope="row">"#));
            if !label.is_empty() {
                out.push_str(&tex_slot(&to_display_tex(label), false));
            }
            out.push_str("</th>");
            for (i, node) in nodes.iter().enumerate() {
                let mut cls = String::from("tkz-b");
                if i == 0 { cls.push_str(" tkz-b--first"); }
                if i + 1 == n { cls.push_str(" tkz-b--last"); }
                let forbidden = node.get("forbidden").and_then(Value::as_bool).unwrap_or(false);
                out.push_str(&format!(r#"<td class="{cls}"><div class="tkz-var-b{}">"#, if forbidden { " tkz-var-b--forbidden" } else { "" }));
                if forbidden {
                    if i > 0 {
                        out.push_str(&render_tkz_stack(&node["left"], levels, "right"));
                    }
                    out.push_str(r#"<div class="tkz-dbar"></div>"#);
                    if i + 1 < n {
                        out.push_str(&render_tkz_stack(&node["right"], levels, "left"));
                    }
                } else {
                    out.push_str(&render_tkz_stack(&node["left"], levels, "center"));
                }
                out.push_str("</div></td>");
                if i + 1 < n {
                    out.push_str(r#"<td class="tkz-i"><div class="tkz-var-i">"#);
                    let dir = arrows.get(i).and_then(Value::as_str).unwrap_or("");
                    if !dir.is_empty() {
                        let from = node["right"]["level"].as_str().unwrap_or("mid");
                        let to = nodes[i + 1]["left"]["level"].as_str().unwrap_or("mid");
                        out.push_str(&render_tkz_arrow(from, to, levels));
                    }
                    out.push_str("</div></td>");
                }
            }
            out.push_str("</tr>");
        } else {
            let marks = row.get("marks").and_then(Value::as_array).cloned().unwrap_or_default();
            let intervals = row.get("intervals").and_then(Value::as_array).cloned().unwrap_or_default();
            let interval_signs = row.get("intervalSigns").and_then(Value::as_array).cloned().unwrap_or_default();
            let n = marks.len();
            out.push_str(r#"<tr class="tkz-row tkz-row--sign"><th class="tkz-label" scope="row">"#);
            if !label.is_empty() {
                out.push_str(&tex_slot(&to_display_tex(label), false));
            }
            out.push_str("</th>");
            for (i, mark) in marks.iter().enumerate() {
                let kind = mark.get("kind").and_then(Value::as_str).unwrap_or("empty");
                let mut cls = format!("tkz-b tkz-mark--{kind}");
                if i == 0 { cls.push_str(" tkz-b--first"); }
                if i + 1 == n { cls.push_str(" tkz-b--last"); }
                out.push_str(&format!(r#"<td class="{cls}">"#));
                if kind == "zero" {
                    out.push_str(r#"<span class="tkz-zero">"#);
                    out.push_str(&tex_slot(&to_display_tex(mark.get("tex").and_then(Value::as_str).unwrap_or("0")), false));
                    out.push_str("</span>");
                } else if kind == "text" {
                    out.push_str(&tex_slot(&to_display_tex(mark.get("tex").and_then(Value::as_str).unwrap_or("")), false));
                }
                out.push_str("</td>");
                if i + 1 < n {
                    let content = intervals.get(i).and_then(Value::as_str).unwrap_or("");
                    let is_sign = interval_signs.get(i).and_then(Value::as_bool).unwrap_or(false);
                    out.push_str(&format!(r#"<td class="tkz-i{}">"#, if is_sign && !content.is_empty() { " tkz-i--sign" } else { "" }));
                    if !content.is_empty() {
                        out.push_str(&tex_slot(&to_display_tex(content), false));
                    }
                    out.push_str("</td>");
                }
            }
            out.push_str("</tr>");
        }
    }

    out.push_str("</tbody></table></div>");
    Some(out)
}

pub fn try_render_art_table(tex: &str) -> Option<String> {
    let parsed = math_engine::preprocess::parse_art_table(tex)?;
    let aligns: Vec<&str> = parsed
        .get("aligns")
        .and_then(Value::as_array)
        .map(|a| a.iter().map(|v| v.as_str().unwrap_or("c")).collect())
        .unwrap_or_default();
    let has_header = parsed.get("hasHeader").and_then(Value::as_bool).unwrap_or(false);
    let rows = parsed.get("rows")?.as_array()?;

    let mut out = String::from(r#"<div class="art-table-scroll"><div class="art-table-frame"><table class="art-table">"#);
    let render_cell = |tag: &str, cell: &str, col_idx: usize| -> String {
        let al = aligns.get(col_idx).copied().unwrap_or("c");
        let inner = if cell.is_empty() {
            String::new()
        } else {
            let needs_disp = tag == "td"
                && (cell.contains(r"\dfrac")
                    || cell.contains(r"\frac")
                    || cell.contains(r"\int")
                    || cell.contains(r"\sum")
                    || cell.contains(r"\lim")
                    || cell.contains(r"\prod"));
            if needs_disp {
                tex_slot(&format!(r"\displaystyle {cell}"), false)
            } else {
                tex_slot(cell, false)
            }
        };
        format!(r#"<{tag} class="align-{al}">{inner}</{tag}>"#)
    };

    if has_header && !rows.is_empty() {
        out.push_str("<thead><tr>");
        if let Some(cells) = rows[0].as_array() {
            for (ci, c) in cells.iter().enumerate() {
                out.push_str(&render_cell("th", c.as_str().unwrap_or(""), ci));
            }
        }
        out.push_str("</tr></thead>");
    }

    out.push_str("<tbody>");
    for row in rows.iter().skip(if has_header { 1 } else { 0 }) {
        out.push_str("<tr>");
        if let Some(cells) = row.as_array() {
            for (ci, c) in cells.iter().enumerate() {
                out.push_str(&render_cell("td", c.as_str().unwrap_or(""), ci));
            }
        }
        out.push_str("</tr>");
    }
    out.push_str("</tbody></table></div></div>");
    Some(out)
}

/// Depth-aware splitting of `\item` inside `enumerate` / `itemize`.
pub fn split_top_level_items(body: &str) -> Vec<String> {
    let mut items = Vec::new();
    let mut cur = String::new();
    let mut depth: usize = 0;
    let bytes = body.as_bytes();
    let mut i = 0;

    while i < bytes.len() {
        let rest = &body[i..];
        if rest.starts_with(r"\begin{enumerate}") {
            depth += 1;
            cur.push_str(r"\begin{enumerate}");
            i += r"\begin{enumerate}".len();
            continue;
        }
        if rest.starts_with(r"\begin{itemize}") {
            depth += 1;
            cur.push_str(r"\begin{itemize}");
            i += r"\begin{itemize}".len();
            continue;
        }
        if rest.starts_with(r"\end{enumerate}") {
            depth = depth.saturating_sub(1);
            cur.push_str(r"\end{enumerate}");
            i += r"\end{enumerate}".len();
            continue;
        }
        if rest.starts_with(r"\end{itemize}") {
            depth = depth.saturating_sub(1);
            cur.push_str(r"\end{itemize}");
            i += r"\end{itemize}".len();
            continue;
        }
        if depth == 0 && rest.starts_with(r"\item") {
            let next_ch = rest.as_bytes().get(5).copied();
            if !next_ch.map(|c| c.is_ascii_alphabetic()).unwrap_or(false) {
                if !cur.trim().is_empty() {
                    items.push(cur.trim().to_string());
                }
                cur.clear();
                i += 5;
                // Optional [label]
                let mut j = i;
                while j < bytes.len() && bytes[j].is_ascii_whitespace() {
                    j += 1;
                }
                if j < bytes.len() && bytes[j] == b'[' {
                    if let Some(rel) = body[j..].find(']') {
                        i = j + rel + 1;
                    }
                }
                continue;
            }
        }
        let ch = rest.chars().next().unwrap();
        cur.push(ch);
        i += ch.len_utf8();
    }
    if !cur.trim().is_empty() {
        items.push(cur.trim().to_string());
    }
    items
}

fn parse_leading_setcounter(s: &str) -> (Option<usize>, &str) {
    let trimmed = s.trim_start();
    if let Some(after) = trimmed.strip_prefix(r"\setcounter{enumi}{") {
        if let Some(close) = after.find('}') {
            if let Ok(n) = after[..close].trim().parse::<usize>() {
                return (Some(n), &after[close + 1..]);
            }
        }
    }
    (None, s)
}

fn strip_leading_opt_bracket(s: &str) -> &str {
    let trimmed = s.trim_start();
    if trimmed.starts_with('[') {
        if let Some(close) = trimmed.find(']') {
            return &trimmed[close + 1..];
        }
    }
    s
}

fn render_environment(seg: &Value, list_start: usize, list_depth: usize) -> String {
    let name = seg.get("env").and_then(Value::as_str).unwrap_or("").trim();
    let raw = seg.get("raw").and_then(Value::as_str).unwrap_or("");
    let inner = match (raw.find('}'), raw.rfind(r"\end")) {
        (Some(a), Some(b)) if b > a => &raw[a + 1..b],
        _ => "",
    };

    if name == "itemize" || name == "enumerate" {
        let is_ordered = name == "enumerate";
        let body_no_opt = strip_leading_opt_bracket(inner);
        let (sc_val, body) = parse_leading_setcounter(body_no_opt);
        let base_start = if is_ordered && list_start == 0 {
            sc_val.unwrap_or(0)
        } else {
            list_start
        };
        let mut ul_cls = format!(
            "math-list {}",
            if is_ordered { "math-list--ordered" } else { "math-list--unordered" }
        );
        if list_depth > 0 {
            ul_cls.push_str(" math-list--nested");
        }
        let mut out = format!(r#"<ul class="{ul_cls}">"#);
        let mut idx = base_start;
        let next_depth = list_depth + usize::from(is_ordered);
        for item in split_top_level_items(body) {
            if item.is_empty() {
                continue;
            }
            idx += 1;
            if idx - base_start > 40 {
                break;
            }
            let marker_cls = if is_ordered {
                "math-list-marker math-list-marker--num"
            } else {
                "math-list-marker math-list-marker--bullet"
            };
            let marker_txt = if is_ordered {
                if list_depth > 0 && (1..=26).contains(&idx) {
                    format!("{})", (b'a' + (idx as u8 - 1)) as char)
                } else {
                    idx.to_string()
                }
            } else {
                "•".into()
            };
            out.push_str(&format!(
                r#"<li class="math-list-item"><span class="{marker_cls}">{marker_txt}</span><span class="math-list-content">{}</span></li>"#,
                render_math_opts(&item, false, 0, next_depth)
            ));
        }
        out.push_str("</ul>");
        return out;
    }

    if name == "center" || name == "flushleft" || name == "flushright" {
        let align = match name {
            "flushleft" => "left",
            "flushright" => "right",
            _ => "center",
        };
        return format!(r#"<div style="text-align:{align}">{}</div>"#, render_math(inner));
    }
    if name == "quote" {
        return format!(r#"<blockquote class="math-quote">{}</blockquote>"#, render_math(inner));
    }
    if name == "verbatim" {
        return format!(r#"<pre class="math-verbatim">{}</pre>"#, esc(inner.trim()));
    }
    if name == "columns" || name == "colonnes" {
        let mut out = String::from(r#"<div class="math-columns">"#);
        for part in inner.split(r"\column").flat_map(|p| p.split(r"\col")) {
            let trimmed = part.trim();
            if !trimmed.is_empty() {
                out.push_str(&format!("<div>{}</div>", render_math(trimmed)));
            }
        }
        out.push_str("</div>");
        return out;
    }

    let semantic: Option<(&str, &str)> = match name {
        "definition" => Some(("Définition", "b")),
        "theorem" => Some(("Théorème", "b")),
        "proposition" => Some(("Proposition", "b")),
        "lemma" => Some(("Lemme", "b")),
        "corollary" => Some(("Corollaire", "b")),
        "property" => Some(("Propriété", "b")),
        "method" => Some(("Méthode", "b")),
        "proof" => Some(("Démonstration", "u")),
        "example" => Some(("Exemple", "e")),
        "remark" => Some(("Remarque", "r")),
        "warning" => Some(("Attention", "a")),
        "application" => Some(("Application", "e")),
        "note" => Some(("Note", "r")),
        _ => None,
    };
    if let Some((lbl, kind)) = semantic {
        return format!(
            r#"<div class="blk" data-k="{kind}" data-t="{name}"><div class="bh"><span class="bt">{lbl}</span></div><div class="bx">{}</div></div>"#,
            render_math(inner.trim())
        );
    }

    let mut latex = raw.to_string();
    if name == "align" || name == "align*" {
        latex = latex
            .replace(r"\begin{align*}", r"\begin{aligned}")
            .replace(r"\begin{align}", r"\begin{aligned}")
            .replace(r"\end{align*}", r"\end{aligned}")
            .replace(r"\end{align}", r"\end{aligned}");
    } else if name == "tabular" {
        latex = latex
            .replace(r"\begin{tabular}", r"\begin{array}")
            .replace(r"\end{tabular}", r"\end{array}");
    }

    if name == "array" || name == "tabular" {
        if let Some(tkz_html) = try_render_tkztab(raw) {
            return format!(
                r#"<div class="math-display-shell math-display-shell--tkz"><div class="math-display-node math-display-rendered">{tkz_html}</div></div>"#
            );
        }
        if let Some(art_html) = try_render_art_table(raw) {
            return format!(
                r#"<div class="math-display-shell math-display-shell--table"><div class="math-display-node math-display-rendered">{art_html}</div></div>"#
            );
        }
    }

    format!(
        r#"<div class="math-display-shell"><div class="math-display-node math-display-rendered">{}</div></div>"#,
        tex_slot(&format!(r"\def\arraystretch{{1.45}} {latex}"), true)
    )
}

/// Tokenizes `%%OPEN:x%%`, `%%CLOSE%%`, `%%CLOSE:x%%`, `%%PAR%%`, `%%BR%%`, `%%BADGE:x%%`.
fn split_wrap_tokens(s: &str) -> Vec<&str> {
    let mut out = Vec::new();
    let bytes = s.as_bytes();
    let mut i = 0;
    let mut last = 0;
    while i + 3 < bytes.len() {
        if bytes[i] == b'%' && bytes[i + 1] == b'%' {
            if let Some(rel) = s[i + 2..].find("%%") {
                let end = i + 2 + rel + 2;
                let inner = &s[i + 2..i + 2 + rel];
                let valid = inner == "PAR"
                    || inner == "BR"
                    || inner == "CLOSE"
                    || inner.starts_with("OPEN:")
                    || inner.starts_with("CLOSE:")
                    || inner.starts_with("BADGE:");
                if valid {
                    if i > last {
                        out.push(&s[last..i]);
                    }
                    out.push(&s[i..end]);
                    i = end;
                    last = end;
                    continue;
                }
            }
        }
        i += 1;
    }
    if last < s.len() {
        out.push(&s[last..]);
    }
    out
}

pub fn render_math_opts(content: &str, inline: bool, list_start: usize, list_depth: usize) -> String {
    let prepassed = math_engine::preprocess::prepass_text_macros(content);
    let (segments, _, _) = math_engine::analyze::analyze(&prepassed);

    let root_tag = if inline { "span" } else { "div" };
    let root_cls = if inline { "math-renderer math-inline" } else { "math-renderer" };
    let mut out = format!(r#"<{root_tag} class="{root_cls}">"#);

    let mut stack: Vec<(String, &'static str)> = Vec::new();
    let mut text_buf = String::new();
    let mut used_list_start = false;

    let flush_text = |text_buf: &mut String, out: &mut String, stack: &mut Vec<(String, &'static str)>| {
        if text_buf.is_empty() {
            return;
        }
        let buf = std::mem::take(text_buf);
        let tokens = split_wrap_tokens(&buf);
        let mut prev_was_par = false;
        for tok in tokens {
            if tok.is_empty() {
                continue;
            }
            if let Some(name) = tok.strip_prefix("%%OPEN:").and_then(|s| s.strip_suffix("%%")) {
                prev_was_par = false;
                if let Some(spec) = wrap_spec(name) {
                    if let Some((lbl, col)) = spec.prefix {
                        out.push_str(&format!(r#"<strong style="color:{col}">{lbl}</strong>"#));
                    }
                    out.push('<');
                    out.push_str(spec.tag);
                    if !spec.cls.is_empty() {
                        out.push_str(&format!(r#" class="{}""#, spec.cls));
                    }
                    if let Some(st) = spec.style {
                        out.push_str(&format!(r#" style="{st}""#));
                    }
                    if spec.cls == "math-blank" {
                        out.push_str(r#" role="button" tabindex="0" aria-pressed="false" aria-label="Réponse à révéler""#);
                    }
                    out.push('>');
                    stack.push((name.to_string(), spec.tag));
                }
            } else if tok == "%%CLOSE%%" {
                prev_was_par = false;
                if let Some((_, tag)) = stack.pop() {
                    out.push_str(&format!("</{tag}>"));
                }
            } else if let Some(target) = tok.strip_prefix("%%CLOSE:").and_then(|s| s.strip_suffix("%%")) {
                prev_was_par = false;
                if let Some(pos) = stack.iter().rposition(|(n, _)| n == target) {
                    while stack.len() > pos {
                        let (_, tag) = stack.pop().unwrap();
                        out.push_str(&format!("</{tag}>"));
                    }
                }
            } else if tok == "%%PAR%%" {
                if !prev_was_par {
                    out.push_str(r#"<span style="display:block; height:0.55rem"></span>"#);
                    prev_was_par = true;
                }
            } else if tok == "%%BR%%" {
                prev_was_par = false;
                out.push_str("<br>");
            } else if let Some(bname) = tok.strip_prefix("%%BADGE:").and_then(|s| s.strip_suffix("%%")) {
                prev_was_par = false;
                if let Some(bh) = badge_html(bname) {
                    out.push_str(&bh);
                }
            } else {
                prev_was_par = false;
                let escaped = esc(tok);
                out.push_str(&process_text_macros(&escaped));
            }
        }
    };

    for seg in &segments {
        let stype = seg.get("type").and_then(Value::as_str).unwrap_or("");
        match stype {
            "text" | "display-error" => {
                text_buf.push_str(seg.get("raw").and_then(Value::as_str).unwrap_or(""));
            }
            "inline" => {
                flush_text(&mut text_buf, &mut out, &mut stack);
                let raw_inline = seg
                    .get("inner")
                    .and_then(Value::as_str)
                    .unwrap_or_else(|| {
                        seg.get("raw")
                            .and_then(Value::as_str)
                            .unwrap_or("")
                            .trim_matches('$')
                    });
                let inspected = math_engine::structure::inspect_display_formula(raw_inline);
                let is_boxed = inspected.get("isBoxed").and_then(Value::as_bool).unwrap_or(false);
                if is_boxed {
                    let inner_b = inspected.get("inner").and_then(Value::as_str).unwrap_or(raw_inline);
                    out.push_str(r#"<span class="math-inline-node math-inline-rendered math-boxed-pill">"#);
                    out.push_str(&tex_slot(&format!(r"\displaystyle {inner_b}"), false));
                    out.push_str("</span>");
                } else {
                    out.push_str(r#"<span class="math-inline-node math-inline-rendered">"#);
                    out.push_str(&tex_slot(raw_inline, false));
                    out.push_str("</span>");
                }
            }
            "display" => {
                flush_text(&mut text_buf, &mut out, &mut stack);
                let inner_tex = seg.get("inner").and_then(Value::as_str).unwrap_or("").trim();
                if let Some(tkz_html) = try_render_tkztab(inner_tex) {
                    out.push_str(&format!(
                        r#"<div class="math-display-shell math-display-shell--tkz"><div class="math-display-node math-display-rendered">{tkz_html}</div></div>"#
                    ));
                } else if let Some(art_html) = try_render_art_table(inner_tex) {
                    out.push_str(&format!(
                        r#"<div class="math-display-shell math-display-shell--table"><div class="math-display-node math-display-rendered">{art_html}</div></div>"#
                    ));
                } else {
                    let inspected = math_engine::structure::inspect_display_formula(inner_tex);
                    let is_boxed = inspected.get("isBoxed").and_then(Value::as_bool).unwrap_or(false);
                    let is_wide = inspected["metrics"]["isWide"].as_bool().unwrap_or(false);
                    let inner_clean = inspected.get("inner").and_then(Value::as_str).unwrap_or(inner_tex);
                    let wide_attr = if is_wide { r#" data-wide="1""# } else { "" };
                    if is_boxed {
                        out.push_str(&format!(
                            r#"<div class="math-display-shell math-display-shell--boxed"><div class="math-display-node math-display-rendered result-box is-boxed-formula"{wide_attr}>{}</div></div>"#,
                            tex_slot(&format!(r"\def\arraystretch{{1.2}} \displaystyle {inner_clean}"), true)
                        ));
                    } else {
                        out.push_str(&format!(
                            r#"<div class="math-display-shell"><div class="math-display-node math-display-rendered"{wide_attr}>{}</div></div>"#,
                            tex_slot(&format!(r"\def\arraystretch{{1.2}} {inner_clean}"), true)
                        ));
                    }
                }
            }
            "environment" => {
                flush_text(&mut text_buf, &mut out, &mut stack);
                let env_name = seg.get("env").and_then(Value::as_str).unwrap_or("").trim();
                let start_offset = if !used_list_start { list_start } else { 0 };
                if env_name == "itemize" || env_name == "enumerate" {
                    used_list_start = true;
                }
                out.push_str(&render_environment(seg, start_offset, list_depth));
            }
            "image" => {
                flush_text(&mut text_buf, &mut out, &mut stack);
                let src = seg.get("src").and_then(Value::as_str).unwrap_or("");
                out.push_str(&format!(
                    r#"<figure class="math-figure"><img src="{}" alt="" loading="lazy" onerror="this.style.display='none'"></figure>"#,
                    esc_attr(src)
                ));
            }
            _ => {
                text_buf.push_str(seg.get("raw").and_then(Value::as_str).unwrap_or(""));
            }
        }
    }
    flush_text(&mut text_buf, &mut out, &mut stack);

    while let Some((_, tag)) = stack.pop() {
        out.push_str(&format!("</{tag}>"));
    }
    out.push_str(&format!("</{root_tag}>"));
    out
}

pub fn render_structured_solution(correction_latex: &str) -> String {
    let steps = math_engine::structure::split_solution_steps(correction_latex);
    let mut out = String::new();
    for step in steps {
        out.push_str(&format!(r#"<div class="step app-step">{}</div>"#, render_math(&step)));
    }
    out
}

/* ── Media Rendering (port of media.js) ──────────────────────────────────── */

pub fn resolve_media_src(src: &str, base_dir: &str, root_prefix: &str) -> String {
    let s = src.trim();
    if s.is_empty() {
        return String::new();
    }
    let lower = s.to_lowercase();
    if lower.starts_with("http://") || lower.starts_with("https://") || lower.starts_with("data:") || lower.starts_with("blob:") {
        return s.to_string();
    }
    let is_root_rel = s.starts_with('/');
    let clean = s.trim_start_matches('/');
    if clean.starts_with("public/") {
        return format!("{root_prefix}{clean}");
    }
    if !is_root_rel && !base_dir.is_empty() && !clean.starts_with("data/") && !clean.starts_with("images/") {
        let dir = base_dir.trim_matches('/').trim_start_matches("public/");
        return format!("{root_prefix}public/{dir}/{clean}");
    }
    format!("{root_prefix}public/{clean}")
}

fn has_media_src(v: &Value) -> bool {
    v.get("src")
        .and_then(Value::as_str)
        .map(|s| !s.trim().is_empty())
        .unwrap_or(false)
}

fn merge_media_defaults(parent: &serde_json::Map<String, Value>, child: &Value) -> Value {
    let Some(child_obj) = child.as_object() else {
        return child.clone();
    };
    let mut out = child_obj.clone();
    for key in ["position", "align", "anchor", "width", "maxWidth", "height", "maxHeight", "fit", "objectFit", "zoomable", "lazy", "border", "shadow", "rounded"] {
        if !out.contains_key(key) {
            if let Some(val) = parent.get(key) {
                out.insert(key.to_string(), val.clone());
            }
        }
    }
    for nested_key in ["style", "captionStyle"] {
        if let Some(p_map) = parent.get(nested_key).and_then(Value::as_object) {
            let mut merged = p_map.clone();
            if let Some(c_map) = out.get(nested_key).and_then(Value::as_object) {
                for (k, v) in c_map {
                    merged.insert(k.clone(), v.clone());
                }
            }
            out.insert(nested_key.to_string(), Value::Object(merged));
        }
    }
    Value::Object(out)
}

pub fn media_images(media: &Value) -> Vec<Value> {
    if let Some(arr) = media.as_array() {
        return arr.iter().filter(|it| has_media_src(it)).cloned().collect();
    }
    let Some(obj) = media.as_object() else { return Vec::new() };
    let mut list = Vec::new();
    if let Some(arr) = obj.get("images").and_then(Value::as_array) {
        for item in arr {
            if has_media_src(item) {
                list.push(merge_media_defaults(obj, item));
            }
        }
    }
    if has_media_src(media) {
        let mut first = obj.clone();
        first.remove("additionalImages");
        first.remove("images");
        list.push(Value::Object(first));
    }
    if let Some(arr) = obj.get("additionalImages").and_then(Value::as_array) {
        for item in arr {
            if has_media_src(item) {
                list.push(item.clone());
            }
        }
    }
    list
}

fn effective_anchor<'a>(img: &'a Value, kind: &str) -> &'a str {
    if let Some(a) = img.get("anchor").and_then(Value::as_str) {
        return a;
    }
    if kind == "application" {
        if img.get("position").and_then(Value::as_str).unwrap_or("top") == "bottom" {
            return "content";
        }
        return "lead";
    }
    "content"
}

pub fn media_from_images(images: &[Value]) -> Value {
    let clean: Vec<Value> = images
        .iter()
        .filter(|img| has_media_src(img))
        .cloned()
        .collect();
    if clean.is_empty() {
        return Value::Null;
    }
    let mut first = clean[0].clone();
    if clean.len() > 1 {
        if let Some(m) = first.as_object_mut() {
            m.insert("additionalImages".into(), Value::Array(clean[1..].to_vec()));
        }
    }
    first
}

pub fn media_by_anchor(media: &Value, anchor: &str, kind: &str) -> Value {
    let imgs: Vec<Value> = media_images(media)
        .into_iter()
        .filter(|img| effective_anchor(img, kind) == anchor)
        .collect();
    media_from_images(&imgs)
}

pub fn without_anchor(media: &Value, anchor: &str) -> Value {
    let imgs: Vec<Value> = media_images(media)
        .into_iter()
        .filter(|img| img.get("anchor").and_then(Value::as_str).unwrap_or("content") != anchor)
        .collect();
    media_from_images(&imgs)
}

fn css_len(val: &Value) -> Option<String> {
    match val {
        Value::Number(n) => Some(format!("{n}px")),
        Value::String(s) => {
            let trimmed = s.trim();
            if trimmed.is_empty() {
                None
            } else {
                Some(trimmed.to_string())
            }
        }
        _ => None,
    }
}

fn media_shadow_class(item: &Value) -> &'static str {
    let raw = item
        .get("style")
        .and_then(|s| s.get("shadow"))
        .or_else(|| item.get("shadow"));
    match raw {
        Some(Value::Bool(false)) => " no-shadow",
        Some(Value::Bool(true)) => " shadow-md",
        Some(Value::String(s)) => match s.trim().to_ascii_lowercase().as_str() {
            "none" | "false" | "0" => " no-shadow",
            "sm" | "small" => " shadow-sm",
            "md" | "medium" | "true" => " shadow-md",
            "lg" | "large" => " shadow-lg",
            _ => "",
        },
        _ => "",
    }
}

fn media_align_class(item: &Value) -> &'static str {
    let raw = item
        .get("align")
        .and_then(Value::as_str)
        .or_else(|| item.get("style").and_then(|s| s.get("align")).and_then(Value::as_str))
        .unwrap_or("");
    match raw.trim().to_ascii_lowercase().as_str() {
        "left" | "start" => " align-left",
        "right" | "end" => " align-right",
        "center" | "centre" => " align-center",
        _ => "",
    }
}

fn is_standalone_content(content_html: &str) -> bool {
    let trimmed = content_html.trim();
    trimmed.is_empty() || trimmed == "<span></span>"
}

fn render_figure_html(item: &Value, surface: &str, base_dir: &str, root_prefix: &str) -> String {
    let src_raw = item.get("src").and_then(Value::as_str).unwrap_or("");
    let src = resolve_media_src(src_raw, base_dir, root_prefix);
    let alt = item.get("alt").and_then(Value::as_str).unwrap_or("Illustration");
    let zoomable = item.get("zoomable").and_then(Value::as_bool).unwrap_or(true);
    let border_opt = item["style"]["border"].as_bool().or_else(|| item["border"].as_bool());
    let round_opt = item["style"]["rounded"].as_bool().or_else(|| item["rounded"].as_bool());
    let shadow_cls = media_shadow_class(item);
    let is_svg = src_raw
        .trim()
        .split(['?', '#'])
        .next()
        .unwrap_or("")
        .to_ascii_lowercase()
        .ends_with(".svg");

    let mut frame_cls = String::from("media-fig__frame");
    match border_opt {
        Some(false) => frame_cls.push_str(" no-border"),
        Some(true) => frame_cls.push_str(" has-border"),
        None => {}
    }
    match round_opt {
        Some(false) => frame_cls.push_str(" no-round"),
        Some(true) => frame_cls.push_str(" is-round"),
        None => {}
    }
    if !shadow_cls.is_empty() {
        frame_cls.push_str(shadow_cls);
    }
    if is_svg {
        frame_cls.push_str(" is-svg");
    }
    if zoomable {
        frame_cls.push_str(" is-zoomable");
    }

    let mut frame_style = String::new();
    if let (Some(nw), Some(nh)) = (item["naturalWidth"].as_u64(), item["naturalHeight"].as_u64()) {
        if nw > 0 && nh > 0 {
            frame_style = format!(r#" style="aspect-ratio:{nw} / {nh}""#);
        }
    }

    let mut img_styles: Vec<String> = Vec::new();
    if let Some(h) = css_len(&item["height"]) {
        img_styles.push(format!("height:{}", esc_attr(&h)));
    }
    if let Some(mh) = css_len(&item["maxHeight"]) {
        img_styles.push(format!("max-height:{}", esc_attr(&mh)));
    }
    if let Some(fit) = item
        .get("fit")
        .or_else(|| item.get("objectFit"))
        .or_else(|| item.get("style").and_then(|s| s.get("fit").or_else(|| s.get("objectFit"))))
        .and_then(Value::as_str)
    {
        match fit.trim().to_ascii_lowercase().as_str() {
            "contain" | "cover" | "fill" | "scale-down" | "none" => {
                img_styles.push(format!("object-fit:{}", fit.trim().to_ascii_lowercase()));
            }
            _ => {}
        }
    }
    let img_style = if img_styles.is_empty() {
        String::new()
    } else {
        format!(r#" style="{}""#, img_styles.join(";"))
    };
    let loading = if item["lazy"].as_bool() == Some(false) { "eager" } else { "lazy" };

    let zoom_attrs = if zoomable {
        let cap_raw = item.get("caption").and_then(Value::as_str).unwrap_or("");
        format!(
            r#" data-action="media-zoom" data-src="{}" data-alt="{}" data-cap="{}""#,
            esc_attr(&src),
            esc_attr(alt),
            esc_attr(cap_raw)
        )
    } else {
        String::new()
    };

    let zoom_badge = if zoomable {
        format!(r#"<span class="media-fig__zoom no-print">{}</span>"#, icon("expand", 12, ""))
    } else {
        String::new()
    };

    let cap_html = match item.get("caption").and_then(Value::as_str) {
        Some(c) if !c.trim().is_empty() => {
            let mut cap_cls = String::from("media-fig__cap");
            let align = item["captionStyle"]["align"]
                .as_str()
                .or_else(|| item["captionAlign"].as_str())
                .unwrap_or("");
            match align.trim().to_ascii_lowercase().as_str() {
                "left" | "start" => cap_cls.push_str(" align-left"),
                "center" | "centre" => cap_cls.push_str(" align-center"),
                "right" | "end" => cap_cls.push_str(" align-right"),
                _ => {}
            }
            if let Some(sz) = item["captionStyle"]["size"].as_str() {
                match sz.trim().to_ascii_lowercase().as_str() {
                    "xs" => cap_cls.push_str(" size-xs"),
                    "sm" => cap_cls.push_str(" size-sm"),
                    "md" => cap_cls.push_str(" size-md"),
                    "lg" => cap_cls.push_str(" size-lg"),
                    _ => {}
                }
            }
            if item["captionStyle"]["italic"].as_bool() == Some(true) {
                cap_cls.push_str(" is-italic");
            }
            format!(r#"<figcaption class="{cap_cls}">{}</figcaption>"#, render_math_inline(c))
        }
        _ => String::new(),
    };

    let fig_cls = match surface {
        "revision" => "media-fig media-fig--rev",
        "quiz" => "media-fig media-fig--quiz",
        "exercise" => "media-fig media-fig--exo",
        _ => "media-fig",
    };
    format!(
        r#"<figure class="{fig_cls}"><div class="{frame_cls}"{frame_style}{zoom_attrs}><img class="media-fig__img" src="{}" alt="{}" loading="{loading}" decoding="async" referrerpolicy="no-referrer"{img_style} onerror="this.closest('figure').hidden=true" />{zoom_badge}</div>{cap_html}</figure>"#,
        esc_attr(&src),
        esc_attr(alt)
    )
}

fn width_css(item: &Value) -> Option<String> {
    css_len(&item["width"])
}

fn stack_fig_style(item: &Value) -> String {
    let w = width_css(item);
    let mw = css_len(&item["maxWidth"]);
    match (w, mw) {
        (Some(w_val), Some(mw_val)) => {
            format!(r#" style="width:{};max-width:{}""#, esc_attr(&w_val), esc_attr(&mw_val))
        }
        (Some(w_val), None) => format!(r#" style="max-width:{}""#, esc_attr(&w_val)),
        (None, Some(mw_val)) => format!(r#" style="max-width:{}""#, esc_attr(&mw_val)),
        (None, None) => String::new(),
    }
}

pub fn wrap_with_media(
    media: &Value,
    content_html: &str,
    surface: &str,
    variant: &str,
    base_dir: &str,
    root_prefix: &str,
) -> String {
    let images = media_images(media);
    if images.is_empty() {
        return content_html.to_string();
    }
    let is_compact = variant != "default";
    let compact_cls = if is_compact { " is-compact" } else { "" };
    let standalone = is_standalone_content(content_html);

    if images.len() > 1 {
        if standalone {
            let align_cls = media_align_class(&images[0]);
            let inner: String = images
                .iter()
                .map(|it| {
                    let st = width_css(it).map(|w| format!(r#" style="width:{}""#, esc_attr(&w))).unwrap_or_default();
                    format!(r#"<div class="media-item"{st}>{}</div>"#, render_figure_html(it, surface, base_dir, root_prefix))
                })
                .collect();
            return format!(r#"<div class="media-gallery media-gallery--solo"><div class="media-row{align_cls}">{inner}</div></div>"#);
        }
        let mut top = Vec::new();
        let mut bottom = Vec::new();
        let mut left = Vec::new();
        let mut right = Vec::new();
        let mut f_left = Vec::new();
        let mut f_right = Vec::new();
        for img in &images {
            match img.get("position").and_then(Value::as_str).unwrap_or("top") {
                "bottom" | "center" => bottom.push(img),
                "left" | "inline" => left.push(img),
                "right" | "inline-right" => right.push(img),
                "float-left" => f_left.push(img),
                "float-right" => f_right.push(img),
                _ => top.push(img),
            }
        }
        let make_row = |items: &[&Value]| -> String {
            if items.is_empty() { return String::new(); }
            let row_align = media_align_class(items[0]);
            let inner: String = items.iter().map(|it| {
                let st = width_css(it).map(|w| format!(r#" style="width:{}""#, esc_attr(&w))).unwrap_or_default();
                format!(r#"<div class="media-item"{st}>{}</div>"#, render_figure_html(it, surface, base_dir, root_prefix))
            }).collect();
            format!(r#"<div class="media-row{row_align}">{inner}</div>"#)
        };
        let mut out = String::from(r#"<div class="media-gallery">"#);
        out.push_str(&make_row(&top));
        out.push_str(&format!(
            r#"<div class="media-grid{}{}{compact_cls}">"#,
            if left.is_empty() { "" } else { " has-left" },
            if right.is_empty() { "" } else { " has-right" }
        ));
        if !left.is_empty() {
            out.push_str(r#"<div class="media-col">"#);
            for it in &left { out.push_str(&render_figure_html(it, surface, base_dir, root_prefix)); }
            out.push_str("</div>");
        }
        out.push_str(r#"<div class="media-body">"#);
        for (side, items) in [("left", &f_left), ("right", &f_right)] {
            if !items.is_empty() {
                let st = width_css(items[0]).map(|w| format!(r#" style="width:{}""#, esc_attr(&w))).unwrap_or_default();
                out.push_str(&format!(r#"<div class="media-float media-float--{side}{compact_cls}"{st}>"#));
                for it in items { out.push_str(&render_figure_html(it, surface, base_dir, root_prefix)); }
                out.push_str("</div>");
            }
        }
        out.push_str(content_html);
        out.push_str("</div>");
        if !right.is_empty() {
            out.push_str(r#"<div class="media-col">"#);
            for it in &right { out.push_str(&render_figure_html(it, surface, base_dir, root_prefix)); }
            out.push_str("</div>");
        }
        out.push_str("</div>");
        out.push_str(&make_row(&bottom));
        out.push_str("</div>");
        return out;
    }

    let item = &images[0];
    let pos = item.get("position").and_then(Value::as_str).unwrap_or("top");
    let w_css = width_css(item);
    let fig = render_figure_html(item, surface, base_dir, root_prefix);
    let align_cls = media_align_class(item);

    if standalone {
        let st = stack_fig_style(item);
        return format!(
            r#"<div class="media-stack media-stack--solo"><div class="media-stack__fig{align_cls}{}"{st}>{fig}</div></div>"#,
            if is_compact { " is-compact" } else { "" }
        );
    }

    if pos == "left" || pos == "right" {
        let st = w_css.map(|w| format!(r#" style="--media-w:{}""#, esc_attr(&w))).unwrap_or_default();
        let fig_box = format!(r#"<div class="media-side__fig">{fig}</div>"#);
        let body_box = format!(r#"<div class="media-body">{content_html}</div>"#);
        return if pos == "left" {
            format!(r#"<div class="media-side media-side--left{compact_cls}"{st}>{fig_box}{body_box}</div>"#)
        } else {
            format!(r#"<div class="media-side media-side--right{compact_cls}"{st}>{body_box}{fig_box}</div>"#)
        };
    }
    if pos == "float-left" || pos == "float-right" {
        let side = if pos == "float-left" { "left" } else { "right" };
        let st = w_css.map(|w| format!(r#" style="width:{}""#, esc_attr(&w))).unwrap_or_default();
        return format!(r#"<div class="media-flow"><div class="media-float media-float--{side}{compact_cls}"{st}>{fig}</div>{content_html}</div>"#);
    }
    if pos == "inline" || pos == "inline-right" {
        let st = w_css.map(|w| format!(r#" style="width:{}""#, esc_attr(&w))).unwrap_or_default();
        let rev = if pos == "inline-right" { " is-rev" } else { "" };
        return format!(r#"<div class="media-inline{rev}"><div class="media-inline__fig"{st}>{fig}</div><div class="media-body">{content_html}</div></div>"#);
    }
    let st = stack_fig_style(item);
    let fig_wrap = format!(
        r#"<div class="media-stack__fig{align_cls}{}"{st}>{fig}</div>"#,
        if is_compact && pos == "top" { " is-compact" } else { "" }
    );
    if pos == "top" {
        format!(r#"<div class="media-stack">{fig_wrap}{content_html}</div>"#)
    } else {
        format!(r#"<div class="media-stack">{content_html}{fig_wrap}</div>"#)
    }
}

pub fn render_content_with_item_figures(
    content: &str,
    item_media: &Value,
    surface: &str,
    variant: &str,
    base_dir: &str,
    root_prefix: &str,
) -> String {
    let figures: Vec<Value> = media_images(item_media)
        .into_iter()
        .filter(|img| {
            img.get("anchor").and_then(Value::as_str) == Some("item")
                && img.get("targetItem").and_then(Value::as_u64).unwrap_or(0) > 0
        })
        .collect();
    if figures.is_empty() {
        return render_math(content);
    }
    let sliced = math_engine::preprocess::slice_for_figures(content, &figures);
    let mut out = String::new();
    if let Some(slices) = sliced.get("slices").and_then(Value::as_array) {
        for slice in slices {
            if let Some(sc) = slice.get("content").and_then(Value::as_str).filter(|s| !s.is_empty()) {
                let ls = slice.get("listStart").and_then(Value::as_u64).unwrap_or(0) as usize;
                out.push_str(&format!("<div>{}</div>", render_math_opts(sc, false, ls, 0)));
            }
            if let Some(figs) = slice.get("figuresAfter").and_then(Value::as_array) {
                if !figs.is_empty() {
                    let m = media_from_images(figs);
                    out.push_str(&wrap_with_media(&m, "<span></span>", surface, variant, base_dir, root_prefix));
                }
            }
        }
    }
    if let Some(unplaced) = sliced.get("unplaced").and_then(Value::as_array) {
        if !unplaced.is_empty() {
            let m = media_from_images(unplaced);
            out.push_str(&wrap_with_media(&m, "<span></span>", surface, variant, base_dir, root_prefix));
        }
    }
    out
}

#[cfg(test)]
mod media_tests {
    use super::*;

    #[test]
    fn normalizes_array_and_images_wrapper_with_defaults() {
        let arr = json!([
            { "src": "/data/a.svg", "position": "bottom" },
            { "src": "  " },
            { "src": "/data/b.png", "position": "bottom" }
        ]);
        assert_eq!(media_images(&arr).len(), 2);

        let wrapped = json!({
            "position": "bottom",
            "align": "center",
            "style": { "border": false, "shadow": false },
            "captionStyle": { "align": "center", "size": "md" },
            "images": [
                { "src": "/data/1.svg", "caption": "Fig 1" },
                { "src": "/data/2.svg", "style": { "border": true } }
            ]
        });
        let imgs = media_images(&wrapped);
        assert_eq!(imgs.len(), 2);
        assert_eq!(imgs[0]["position"], "bottom");
        assert_eq!(imgs[0]["style"]["border"], false);
        assert_eq!(imgs[0]["captionStyle"]["size"], "md");
        assert_eq!(imgs[1]["style"]["border"], true);
        assert_eq!(imgs[1]["style"]["shadow"], false);
    }

    #[test]
    fn wires_revision_svg_style_and_caption_size() {
        let m = json!({
            "src": "/data/2eme-bac-sc-math/limites-continuite/revisions/figures/continuite-trois-types.svg",
            "position": "bottom",
            "width": "100%",
            "lazy": false,
            "style": { "border": false, "shadow": false, "rounded": true },
            "caption": "Trois façons de perdre la continuité.",
            "captionStyle": { "align": "center", "size": "md" }
        });
        let html = wrap_with_media(&m, "<p>Intro</p>", "revision", "default", "", "");
        assert!(html.contains(r#"class="media-fig media-fig--rev""#));
        assert!(html.contains("no-border"));
        assert!(html.contains("no-shadow"));
        assert!(html.contains("is-round"));
        assert!(html.contains("is-svg"));
        assert!(html.contains(r#"loading="eager""#));
        assert!(html.contains(r#"style="max-width:100%""#));
        assert!(html.contains(r#"class="media-fig__cap align-center size-md""#));
    }

    #[test]
    fn wires_shadow_variants_top_level_fallbacks_and_align() {
        let m = json!({
            "src": "/data/2eme-bac-sc-ex/pictures/ex_4_courbe.png",
            "position": "float-right",
            "width": "43%",
            "style": { "shadow": "md", "rounded": true, "border": true }
        });
        let html = wrap_with_media(&m, "<p>Question</p>", "exercise", "default", "", "");
        assert!(html.contains("media-float--right"));
        assert!(html.contains("has-border"));
        assert!(html.contains("shadow-md"));
        assert!(html.contains("is-round"));
        assert!(!html.contains("is-svg"));

        let top_level = json!({
            "src": "/data/a.png",
            "position": "center",
            "align": "right",
            "width": "60%",
            "maxWidth": "520px",
            "shadow": true,
            "border": true,
            "rounded": false,
            "fit": "cover",
            "maxHeight": 320
        });
        let html2 = wrap_with_media(&top_level, "<p>Texte</p>", "default", "default", "", "");
        assert!(html2.contains("media-stack__fig align-right"));
        assert!(html2.contains(r#"style="width:60%;max-width:520px""#));
        assert!(html2.contains("has-border"));
        assert!(html2.contains("no-round"));
        assert!(html2.contains("shadow-md"));
        assert!(html2.contains("max-height:320px;object-fit:cover"));
    }

    #[test]
    fn collapses_standalone_empty_content_without_ghost_columns() {
        let m = json!({
            "src": "/data/diag.svg",
            "position": "float-right",
            "width": "40%"
        });
        let html = wrap_with_media(&m, "", "revision", "default", "", "");
        assert!(html.contains("media-stack--solo"));
        assert!(!html.contains("media-float"));
        assert!(!html.contains("media-side"));

        let html_span = wrap_with_media(&m, "<span></span>", "revision", "default", "", "");
        assert!(html_span.contains("media-stack--solo"));
    }
}

/// Expose all 209 KaTeX macros from `math_engine` for `wasm-host.js`.
pub fn katex_macros_json() -> Value {
    let mut map = serde_json::Map::new();
    for (k, v) in math_engine::macros::MACROS {
        map.insert((*k).to_string(), json!(*v));
    }
    Value::Object(map)
}
