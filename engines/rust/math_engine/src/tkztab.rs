//! `math_engine::tkztab` — parseur complet de tableaux de signes et de variations
//! LaTeX (`\begin{array}...\end{array}`) pour le rendu SVG/DOM natif `tkz-tab`.

use serde_json::{json, Value};
use std::collections::BTreeSet;

fn is_ascii_alpha(b: u8) -> bool {
    b.is_ascii_alphabetic()
}

fn find_arrow_at(s: &str, pos: usize) -> Option<(&'static str, usize)> {
    let bytes = s.as_bytes();
    if pos >= bytes.len() || bytes[pos] != b'\\' {
        return None;
    }
    let start = pos + 1;
    let mut end = start;
    while end < bytes.len() && is_ascii_alpha(bytes[end]) {
        end += 1;
    }
    if end == start {
        return None;
    }
    let cmd = &s[start..end];
    let dir = match cmd {
        "nearrow" | "fleupB" | "fleup" | "croiss" => "up",
        "searrow" | "fledownB" | "fledown" | "decroiss" => "down",
        "rightarrow" | "longrightarrow" | "fleconst" => "flat",
        _ => return None,
    };
    Some((dir, end - pos))
}

fn arrow_of(s: &str) -> Option<&'static str> {
    let bytes = s.as_bytes();
    let mut i = 0;
    while i < bytes.len() {
        if let Some((dir, _)) = find_arrow_at(s, i) {
            return Some(dir);
        }
        i += 1;
    }
    None
}

fn find_all_arrows(s: &str) -> Vec<(&'static str, usize, usize)> {
    let mut out = Vec::new();
    let bytes = s.as_bytes();
    let mut i = 0;
    while i < bytes.len() {
        if let Some((dir, len)) = find_arrow_at(s, i) {
            out.push((dir, i, i + len));
            i += len;
        } else {
            i += 1;
        }
    }
    out
}

fn strip_arrows(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    let bytes = s.as_bytes();
    let mut i = 0;
    while i < bytes.len() {
        if let Some((_, len)) = find_arrow_at(s, i) {
            out.push(' ');
            i += len;
        } else {
            let ch = s[i..].chars().next().unwrap();
            out.push(ch);
            i += ch.len_utf8();
        }
    }
    out.trim().to_string()
}

fn find_dbar_at(s: &str, pos: usize) -> Option<usize> {
    let rest = &s[pos..];
    if rest.starts_with("||") || rest.starts_with("\\|") {
        return Some(2);
    }
    if rest.starts_with('\\') {
        let bytes = rest.as_bytes();
        let mut end = 1;
        while end < bytes.len() && is_ascii_alpha(bytes[end]) {
            end += 1;
        }
        if end > 1 {
            let cmd = &rest[1..end];
            if matches!(cmd, "parallel" | "dbar" | "interdit" | "Vert") {
                return Some(end);
            }
        }
    }
    None
}

fn find_first_dbar(s: &str) -> Option<(usize, usize)> {
    let mut i = 0;
    while i < s.len() {
        if let Some(len) = find_dbar_at(s, i) {
            return Some((i, len));
        }
        let ch = s[i..].chars().next().unwrap();
        i += ch.len_utf8();
    }
    None
}

fn has_dbar(s: &str) -> bool {
    find_first_dbar(s).is_some()
}

fn strip_dbars(s: &str, replacement: &str) -> String {
    let mut out = String::with_capacity(s.len());
    let mut i = 0;
    while i < s.len() {
        if let Some(len) = find_dbar_at(s, i) {
            out.push_str(replacement);
            i += len;
        } else {
            let ch = s[i..].chars().next().unwrap();
            out.push(ch);
            i += ch.len_utf8();
        }
    }
    out
}

fn is_dbar_only(s: &str) -> bool {
    !s.is_empty() && has_dbar(s) && strip_dbars(s, "").trim().is_empty()
}

fn trim_edge_spaces(s: &str) -> String {
    let mut slice = s.trim();
    loop {
        let before = slice;
        slice = slice.trim_start();
        if let Some(rest) = slice.strip_prefix("\\qquad") {
            if !rest.as_bytes().first().copied().map(is_ascii_alpha).unwrap_or(false) {
                slice = rest;
                continue;
            }
        }
        if let Some(rest) = slice.strip_prefix("\\quad") {
            if !rest.as_bytes().first().copied().map(is_ascii_alpha).unwrap_or(false) {
                slice = rest;
                continue;
            }
        }
        if slice.len() >= 2 && slice.starts_with('\\') {
            let b = slice.as_bytes()[1];
            if matches!(b, b';' | b',' | b':' | b'!' | b' ') {
                slice = &slice[2..];
                continue;
            }
        }
        if slice == before {
            break;
        }
    }
    loop {
        let before = slice;
        slice = slice.trim_end();
        if let Some(rest) = slice.strip_suffix("\\qquad") {
            slice = rest;
            continue;
        }
        if let Some(rest) = slice.strip_suffix("\\quad") {
            slice = rest;
            continue;
        }
        if slice.len() >= 2 {
            let bytes = slice.as_bytes();
            let last = bytes[bytes.len() - 1];
            let prev = bytes[bytes.len() - 2];
            if prev == b'\\' && matches!(last, b';' | b',' | b':' | b'!' | b' ') {
                slice = &slice[..slice.len() - 2];
                continue;
            }
        }
        if slice == before {
            break;
        }
    }
    slice.trim().to_string()
}

fn skip_brace_group(s: &str, pos: usize) -> Option<usize> {
    if s.as_bytes().get(pos) != Some(&b'{') {
        return None;
    }
    let mut i = pos + 1;
    while i < s.len() {
        if s.as_bytes()[i] == b'}' {
            return Some(i + 1);
        }
        let ch = s[i..].chars().next().unwrap();
        i += ch.len_utf8();
    }
    None
}

fn clean_cell(raw: &str) -> String {
    let mut out = String::with_capacity(raw.len());
    let bytes = raw.as_bytes();
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'\\' {
            let start = i + 1;
            let mut end = start;
            while end < bytes.len() && is_ascii_alpha(bytes[end]) {
                end += 1;
            }
            let cmd = &raw[start..end];
            if matches!(cmd, "tvstrut" | "tsstrut" | "strut" | "hline" | "hdashline") {
                out.push(' ');
                i = end;
                continue;
            }
            if cmd == "cline" {
                if let Some(after) = skip_brace_group(raw, end) {
                    out.push(' ');
                    i = after;
                    continue;
                }
            }
            if cmd == "rule" {
                let mut cur = end;
                if bytes.get(cur) == Some(&b'[') {
                    if let Some(rel) = raw[cur + 1..].find(']') {
                        cur = cur + 1 + rel + 1;
                    }
                }
                if let Some(a1) = skip_brace_group(raw, cur) {
                    if let Some(a2) = skip_brace_group(raw, a1) {
                        out.push(' ');
                        i = a2;
                        continue;
                    }
                }
            }
        }
        let ch = raw[i..].chars().next().unwrap();
        out.push(ch);
        i += ch.len_utf8();
    }
    out.trim().to_string()
}

fn unwrap_blank(s: &str) -> (&str, bool) {
    for prefix in ["\\blank{", "\\blanck{", "\\balck{"] {
        if let Some(rest) = s.strip_prefix(prefix) {
            if let Some(inner) = rest.strip_suffix('}') {
                return (inner.trim(), true);
            }
        }
    }
    (s, false)
}

fn sign_of(s: &str) -> Option<&'static str> {
    let (inner, _) = unwrap_blank(s);
    match inner {
        "+" | "\\plus" => Some("+"),
        "-" | "\\moins" | "−" => Some("-"),
        _ => None,
    }
}

fn is_zero(s: &str) -> bool {
    let (inner, _) = unwrap_blank(s);
    inner == "0" || inner == "\\zero"
}

fn is_bar(s: &str) -> bool {
    matches!(s, "|" | "\\vert" | "\\mid" | "t")
}

fn replace_zero_cmd(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    let bytes = s.as_bytes();
    let mut i = 0;
    while i < bytes.len() {
        if s[i..].starts_with("\\zero")
            && !bytes.get(i + 5).copied().map(is_ascii_alpha).unwrap_or(false)
        {
            out.push('0');
            i += 5;
        } else {
            let ch = s[i..].chars().next().unwrap();
            out.push(ch);
            i += ch.len_utf8();
        }
    }
    out
}

pub fn to_display_tex(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    let bytes = s.as_bytes();
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'\\' {
            let start = i + 1;
            let mut end = start;
            while end < bytes.len() && is_ascii_alpha(bytes[end]) {
                end += 1;
            }
            match &s[start..end] {
                "plus" => {
                    out.push('+');
                    i = end;
                    continue;
                }
                "moins" => {
                    out.push('-');
                    i = end;
                    continue;
                }
                "zero" => {
                    out.push('0');
                    i = end;
                    continue;
                }
                _ => {}
            }
        }
        let ch = s[i..].chars().next().unwrap();
        out.push(ch);
        i += ch.len_utf8();
    }
    out.trim().to_string()
}

fn match_dimen_prefix(s: &str) -> usize {
    let trimmed_start = s.len() - s.trim_start().len();
    let rest = &s[trimmed_start..];
    if !rest.starts_with('[') {
        return 0;
    }
    let Some(close) = rest.find(']') else {
        return 0;
    };
    let inner = rest[1..close].trim();
    let inner = inner.strip_prefix('-').unwrap_or(inner);
    let mut num_end = 0;
    for (idx, b) in inner.bytes().enumerate() {
        if b.is_ascii_digit() || b == b'.' {
            num_end = idx + 1;
        } else {
            break;
        }
    }
    if num_end == 0 {
        return 0;
    }
    let unit = inner[num_end..].trim();
    if matches!(unit, "pt" | "em" | "ex" | "mm" | "cm" | "in" | "mu" | "px" | "bp") {
        trimmed_start + close + 1
    } else {
        0
    }
}

fn split_rows(body: &str) -> Vec<&str> {
    let mut rows = Vec::new();
    let bytes = body.as_bytes();
    let mut depth: i32 = 0;
    let mut start = 0;
    let mut i = 0;
    while i < bytes.len() {
        let c = bytes[i];
        if c == b'\\' {
            if i + 1 < bytes.len() && bytes[i + 1] == b'\\' && depth == 0 {
                rows.push(&body[start..i]);
                i += 2;
                i += match_dimen_prefix(&body[i..]);
                start = i;
                continue;
            }
            i += 1;
            if i < bytes.len() && is_ascii_alpha(bytes[i]) {
                while i < bytes.len() && is_ascii_alpha(bytes[i]) {
                    i += 1;
                }
            } else if i < bytes.len() {
                let ch = body[i..].chars().next().unwrap();
                i += ch.len_utf8();
            }
            continue;
        }
        if c == b'{' {
            depth += 1;
        } else if c == b'}' {
            depth -= 1;
        }
        let ch = body[i..].chars().next().unwrap();
        i += ch.len_utf8();
    }
    rows.push(&body[start..]);
    rows
}

fn split_cells(row: &str) -> Vec<&str> {
    let mut cells = Vec::new();
    let bytes = row.as_bytes();
    let mut depth: i32 = 0;
    let mut start = 0;
    let mut i = 0;
    while i < bytes.len() {
        let c = bytes[i];
        if c == b'\\' {
            i += 1;
            if i < bytes.len() && is_ascii_alpha(bytes[i]) {
                while i < bytes.len() && is_ascii_alpha(bytes[i]) {
                    i += 1;
                }
            } else if i < bytes.len() {
                let ch = row[i..].chars().next().unwrap();
                i += ch.len_utf8();
            }
            continue;
        }
        if c == b'{' {
            depth += 1;
        } else if c == b'}' {
            depth -= 1;
        } else if c == b'&' && depth == 0 {
            cells.push(&row[start..i]);
            start = i + 1;
        }
        let ch = row[i..].chars().next().unwrap();
        i += ch.len_utf8();
    }
    cells.push(&row[start..]);
    cells
}

struct RawRow {
    hline_before: bool,
    label: String,
    cells: Vec<String>,
}

fn strip_leading_rule(s: &str) -> Option<&str> {
    let trimmed = s.trim_start();
    if let Some(rest) = trimmed.strip_prefix("\\hline") {
        if !rest.as_bytes().first().copied().map(is_ascii_alpha).unwrap_or(false) {
            return Some(rest);
        }
    }
    if let Some(rest) = trimmed.strip_prefix("\\hdashline") {
        if !rest.as_bytes().first().copied().map(is_ascii_alpha).unwrap_or(false) {
            return Some(rest);
        }
    }
    if let Some(rest) = trimmed.strip_prefix("\\cline{") {
        if let Some(close) = rest.find('}') {
            return Some(&rest[close + 1..]);
        }
    }
    None
}

fn read_rows(body: &str) -> Vec<RawRow> {
    let mut out = Vec::new();
    let mut pending_hline = false;
    for chunk in split_rows(body) {
        let mut rest = chunk;
        let mut hline = pending_hline;
        while let Some(next) = strip_leading_rule(rest) {
            hline = true;
            rest = next;
        }
        if rest.trim().is_empty() {
            pending_hline = hline;
            continue;
        }
        pending_hline = false;
        let cleaned: Vec<String> = split_cells(rest).into_iter().map(clean_cell).collect();
        let label = cleaned.first().cloned().unwrap_or_default();
        let cells = if cleaned.len() > 1 { cleaned[1..].to_vec() } else { Vec::new() };
        out.push(RawRow { hline_before: hline, label, cells });
    }
    out
}

fn extract_array_body(tex: &str) -> Option<&str> {
    let mut s = tex.trim();
    loop {
        s = s.trim_start();
        if let Some(rest) = s.strip_prefix("\\def\\arraystretch") {
            let rest = rest.trim_start();
            let after = skip_brace_group(rest, 0)?;
            s = &rest[after..];
            continue;
        }
        if let Some(rest) = s.strip_prefix("\\renewcommand") {
            let mut cur = rest.trim_start();
            if let Some(r) = cur.strip_prefix("{\\arraystretch}") {
                cur = r.trim_start();
            } else if let Some(r) = cur.strip_prefix("\\arraystretch") {
                cur = r.trim_start();
            } else {
                return None;
            }
            let after = skip_brace_group(cur, 0)?;
            s = &cur[after..];
            continue;
        }
        break;
    }
    let after_begin = s.strip_prefix("\\begin{array}")?;
    let spec_end = skip_brace_group(after_begin, 0)?;
    let rest = &after_begin[spec_end..];
    let body = rest.trim_end().strip_suffix("\\end{array}")?;
    Some(body)
}

fn join_str(a: &str, b: &str) -> String {
    if !a.is_empty() && !b.is_empty() {
        format!("{a} {b}")
    } else if !a.is_empty() {
        a.to_string()
    } else {
        b.to_string()
    }
}

struct ProjectedRow {
    label: String,
    bnd: Vec<String>,
    itv: Vec<String>,
}

fn project(row: &RawRow, value_cols: &[usize]) -> ProjectedRow {
    let n = value_cols.len();
    let mut bnd = vec![String::new(); n];
    let mut itv = vec![String::new(); n.saturating_sub(1)];
    for (c, cell) in row.cells.iter().enumerate() {
        if cell.is_empty() {
            continue;
        }
        if c <= value_cols[0] {
            bnd[0] = join_str(&bnd[0], cell);
            continue;
        }
        if c >= value_cols[n - 1] {
            bnd[n - 1] = join_str(&bnd[n - 1], cell);
            continue;
        }
        let mut placed = false;
        for i in 0..(n - 1) {
            if c == value_cols[i] {
                bnd[i] = join_str(&bnd[i], cell);
                placed = true;
                break;
            }
            if c > value_cols[i] && c < value_cols[i + 1] {
                itv[i] = join_str(&itv[i], cell);
                placed = true;
                break;
            }
        }
        if !placed {
            bnd[n - 1] = join_str(&bnd[n - 1], cell);
        }
    }
    ProjectedRow {
        label: row.label.clone(),
        bnd,
        itv,
    }
}

fn is_mark_like(s: &str) -> bool {
    s.is_empty() || is_dbar_only(s) || is_bar(s) || is_zero(s)
}

fn mark_of(s: &str) -> Value {
    if s.is_empty() {
        return json!({ "kind": "none" });
    }
    if is_dbar_only(s) {
        return json!({ "kind": "dbar" });
    }
    if is_bar(s) {
        return json!({ "kind": "bar" });
    }
    if is_zero(s) {
        let (_, blank) = unwrap_blank(s);
        let tex = if blank { replace_zero_cmd(s) } else { "0".to_string() };
        return json!({ "kind": "zero", "tex": tex });
    }
    json!({ "kind": "text", "tex": s })
}

fn build_sign_row(p: &ProjectedRow) -> (Value, bool, Vec<usize>) {
    let mut bnd = p.bnd.clone();
    let mut itv = p.itv.clone();
    let n = bnd.len();

    let all_intervals_empty = itv.iter().all(|s| s.is_empty());
    if all_intervals_empty && bnd.iter().any(|s| !is_mark_like(s)) {
        for i in 0..n {
            if is_mark_like(&bnd[i]) {
                continue;
            }
            let target = if i + 1 < n { i } else { i.saturating_sub(1) };
            if target < itv.len() && itv[target].is_empty() {
                itv[target] = std::mem::take(&mut bnd[i]);
            }
        }
    }

    if n > 1 && !is_mark_like(&bnd[0]) && itv[0].is_empty() {
        itv[0] = std::mem::take(&mut bnd[0]);
    }
    if n > 1 && !is_mark_like(&bnd[n - 1]) && itv[n - 2].is_empty() {
        itv[n - 2] = std::mem::take(&mut bnd[n - 1]);
    }

    for i in 0..n {
        if sign_of(&bnd[i]).is_none() {
            continue;
        }
        if i + 1 < n && itv[i].is_empty() {
            itv[i] = std::mem::take(&mut bnd[i]);
        } else if i > 0 && itv[i - 1].is_empty() {
            itv[i - 1] = std::mem::take(&mut bnd[i]);
        } else if i > 0 && i + 1 < n && !itv[i - 1].is_empty() && !itv[i].is_empty() {
            bnd[i].clear();
        }
    }

    let mut forbidden = Vec::new();
    let marks: Vec<Value> = bnd
        .iter()
        .enumerate()
        .map(|(i, cell)| {
            let m = mark_of(cell);
            let kind = m.get("kind").and_then(Value::as_str).unwrap_or("none");
            if kind == "dbar" {
                forbidden.push(i);
            }
            if kind == "none" && i > 0 && i + 1 < n {
                json!({ "kind": "bar" })
            } else {
                m
            }
        })
        .collect();

    let interval_signs: Vec<bool> = itv.iter().map(|s| sign_of(s).is_some()).collect();
    let has_sign = interval_signs.iter().any(|&b| b);
    let row = json!({
        "type": "sign",
        "label": p.label,
        "marks": marks,
        "intervals": itv,
        "intervalSigns": interval_signs,
    });
    (row, has_sign, forbidden)
}

fn row_level_of(r: usize, k: usize) -> Option<&'static str> {
    if k <= 1 {
        None
    } else if r == 0 {
        Some("top")
    } else if r == k - 1 {
        Some("bot")
    } else {
        Some("mid")
    }
}

fn extract_row_arrows_in_order(bnd_row: &[String], itv_row: &[String]) -> Vec<&'static str> {
    let mut out = Vec::new();
    for i in 0..bnd_row.len() {
        for (dir, _, _) in find_all_arrows(&bnd_row[i]) {
            out.push(dir);
        }
        if i < itv_row.len() {
            for (dir, _, _) in find_all_arrows(&itv_row[i]) {
                out.push(dir);
            }
        }
    }
    out
}

struct NodeEntry {
    side: &'static str,
    tex: String,
    row_level: Option<&'static str>,
}

fn build_var_row(group: &[ProjectedRow], forbidden_cols: &BTreeSet<usize>) -> Value {
    let n = group[0].bnd.len();
    let k = group.len();
    let mut arrows: Vec<Option<&'static str>> = vec![None; n.saturating_sub(1)];
    let mut bnds: Vec<Vec<String>> = group.iter().map(|p| p.bnd.clone()).collect();

    // 1. flèches dans les intervalles
    for p in group {
        for (i, s) in p.itv.iter().enumerate() {
            if arrows[i].is_none() {
                if let Some(a) = arrow_of(s) {
                    arrows[i] = Some(a);
                }
            }
        }
    }

    // 2. doubles barres accolées à une flèche aux bords extérieurs
    if n > 2 {
        for row in &mut bnds {
            for edge in [0usize, n - 1] {
                let s = row[edge].clone();
                if !s.is_empty() && has_dbar(&s) && arrow_of(&s).is_some() {
                    row[edge] = trim_edge_spaces(&strip_dbars(&s, " "));
                    let nb = if edge == 0 { 1 } else { n - 2 };
                    if !has_dbar(&row[nb]) {
                        row[nb] = join_str(&row[nb], "||");
                    }
                }
            }
        }
    }

    // 3. ligne portant n-1 flèches décalées
    if n > 1 {
        for (r, row) in bnds.iter_mut().enumerate() {
            if !row.iter().any(|c| arrow_of(c).is_some()) {
                continue;
            }
            let seq = extract_row_arrows_in_order(row, &group[r].itv);
            if seq.len() == n - 1 {
                for (idx, a) in seq.into_iter().enumerate() {
                    if arrows[idx].is_none() {
                        arrows[idx] = Some(a);
                    }
                }
                for cell in row.iter_mut() {
                    *cell = strip_arrows(cell);
                }
            }
        }
    }

    // 4. valeurs non-flèches et doubles barres posées dans les intervalles -> borne voisine
    for (r, p) in group.iter().enumerate() {
        for (col, s) in p.itv.iter().enumerate() {
            let rem = strip_arrows(s);
            if rem.is_empty() {
                continue;
            }
            let has_group_val = |c: usize| bnds.iter().any(|row| !strip_arrows(&row[c]).is_empty());
            if is_dbar_only(&rem) {
                let target = if col > 0 { col } else { col + 1 };
                bnds[r][target] = join_str(&bnds[r][target], &rem);
            } else if has_dbar(&bnds[r][col]) {
                bnds[r][col] = join_str(&bnds[r][col], &rem);
            } else if col + 1 < n
                && bnds[r][col + 1].is_empty()
                && !(has_group_val(col + 1) && !has_group_val(col))
            {
                bnds[r][col + 1] = rem;
            } else {
                bnds[r][col] = join_str(&bnds[r][col], &rem);
            }
        }
    }

    // 5. flèches égarées sur une valeur de x -> intervalle voisin
    for row in &mut bnds {
        for i in 0..n {
            let s = row[i].clone();
            if arrow_of(&s).is_none() {
                continue;
            }
            for (a, start, end) in find_all_arrows(&s) {
                let has_before = !strip_arrows(&s[..start]).is_empty();
                let has_after = !strip_arrows(&s[end..]).is_empty();
                let mut target: isize = if has_before && !has_after {
                    i as isize
                } else if !has_before && has_after {
                    (i as isize) - 1
                } else if i + 1 < n && arrows[i].is_none() {
                    i as isize
                } else {
                    (i as isize) - 1
                };
                if target < 0 {
                    target = 0;
                }
                if target > (n as isize) - 2 {
                    target = (n as isize) - 2;
                }
                if target >= 0 && (target as usize) < arrows.len() && arrows[target as usize].is_none() {
                    arrows[target as usize] = Some(a);
                }
            }
            row[i] = strip_arrows(&s);
        }
    }

    // 6. nœuds
    let mut uses_mid = false;
    let mut nodes: Vec<Value> = Vec::with_capacity(n);
    for i in 0..n {
        let mut entries: Vec<NodeEntry> = Vec::new();
        let mut forbidden = false;
        for (r, row) in bnds.iter().enumerate() {
            let s = &row[i];
            if s.is_empty() {
                continue;
            }
            let row_level = row_level_of(r, k);
            if let Some((idx, len)) = find_first_dbar(s) {
                forbidden = true;
                let left = trim_edge_spaces(&strip_dbars(&s[..idx], ""));
                let right = trim_edge_spaces(&strip_dbars(&s[idx + len..], ""));
                if !left.is_empty() {
                    entries.push(NodeEntry { side: "left", tex: left, row_level });
                }
                if !right.is_empty() {
                    entries.push(NodeEntry { side: "right", tex: right, row_level });
                }
            } else {
                entries.push(NodeEntry { side: "any", tex: s.clone(), row_level });
            }
        }

        if !forbidden && entries.is_empty() && i > 0 && i + 1 < n && forbidden_cols.contains(&i) {
            forbidden = true;
        }

        let la = if i > 0 { arrows[i - 1] } else { None };
        let ra = if i + 1 < n { arrows[i] } else { None };
        let from_left = match la {
            Some("up") => Some("top"),
            Some("down") => Some("bot"),
            Some("flat") => Some("mid"),
            _ => None,
        };
        let from_right = match ra {
            Some("up") => Some("bot"),
            Some("down") => Some("top"),
            Some("flat") => Some("mid"),
            _ => None,
        };
        let first_row_level = entries.iter().find_map(|e| e.row_level);

        if forbidden {
            let left_level = from_left
                .or_else(|| entries.iter().find(|e| e.side != "right").and_then(|e| e.row_level))
                .unwrap_or("mid");
            let right_level = from_right
                .or_else(|| entries.iter().find(|e| e.side != "left").and_then(|e| e.row_level))
                .unwrap_or("mid");
            let mut left_tex = String::new();
            let mut right_tex = String::new();
            for e in &entries {
                if e.side == "left" {
                    left_tex = join_str(&left_tex, &e.tex);
                } else if e.side == "right" {
                    right_tex = join_str(&right_tex, &e.tex);
                } else {
                    let to_left = i > 0 && (e.row_level.is_none() || e.row_level == Some(left_level));
                    let to_right = i + 1 < n && (e.row_level.is_none() || e.row_level == Some(right_level));
                    if to_left && left_tex.is_empty() {
                        left_tex = e.tex.clone();
                    }
                    if to_right && right_tex.is_empty() {
                        right_tex = e.tex.clone();
                    }
                    if !to_left && !to_right {
                        if left_tex.is_empty() && i > 0 {
                            left_tex = e.tex.clone();
                        } else {
                            right_tex = join_str(&right_tex, &e.tex);
                        }
                    }
                }
            }
            if i == 0 && right_tex.is_empty() && !left_tex.is_empty() {
                right_tex = std::mem::take(&mut left_tex);
            } else if i + 1 == n && left_tex.is_empty() && !right_tex.is_empty() {
                left_tex = std::mem::take(&mut right_tex);
            }
            if left_level == "mid" || right_level == "mid" {
                uses_mid = true;
            }
            nodes.push(json!({
                "forbidden": true,
                "left": { "tex": left_tex, "level": left_level },
                "right": { "tex": right_tex, "level": right_level },
            }));
            continue;
        }

        let level = match (from_left, from_right) {
            (Some(fl), Some(fr)) => {
                if fl == fr {
                    fl
                } else {
                    first_row_level.unwrap_or("mid")
                }
            }
            (Some(fl), None) => fl,
            (None, Some(fr)) => fr,
            (None, None) => first_row_level.unwrap_or("mid"),
        };
        if level == "mid" {
            uses_mid = true;
        }
        let tex: String = entries
            .iter()
            .map(|e| e.tex.as_str())
            .filter(|s| !s.is_empty())
            .collect::<Vec<_>>()
            .join(" ");
        let side = json!({ "tex": tex, "level": level });
        nodes.push(json!({
            "forbidden": false,
            "left": side,
            "right": side,
        }));
    }

    let label = group
        .iter()
        .find(|p| !p.label.is_empty())
        .map(|p| p.label.clone())
        .unwrap_or_default();
    let arrows_json: Vec<Value> = arrows
        .into_iter()
        .map(|a| match a {
            Some(s) => Value::String(s.to_string()),
            None => Value::Null,
        })
        .collect();

    json!({
        "type": "var",
        "label": label,
        "nodes": nodes,
        "arrows": arrows_json,
        "levels": if uses_mid { 3 } else { 2 },
    })
}

fn group_has_arrow(rows: &[&RawRow]) -> bool {
    rows.iter().any(|r| r.cells.iter().any(|c| arrow_of(c).is_some()))
}

/// Reconnaît un tableau de signes/variations ; renvoie `None` sinon (→ KaTeX).
pub fn parse_tkztab(tex: &str) -> Option<Value> {
    let body = extract_array_body(tex)?;
    if body.contains("\\begin{array}") {
        return None;
    }

    let rows = read_rows(body);
    if rows.len() < 2 {
        return None;
    }

    let x_row = &rows[0];
    let value_cols: Vec<usize> = x_row
        .cells
        .iter()
        .enumerate()
        .filter_map(|(idx, c)| if !c.is_empty() { Some(idx) } else { None })
        .collect();
    if value_cols.len() < 2 {
        return None;
    }

    let has_interval_columns = value_cols
        .windows(2)
        .any(|w| w[1].saturating_sub(w[0]) > 1);
    let body_refs: Vec<&RawRow> = rows[1..].iter().collect();
    let body_has_arrow = group_has_arrow(&body_refs);
    if !has_interval_columns && !body_has_arrow {
        return None;
    }
    if x_row.cells.iter().any(|c| arrow_of(c).is_some() || sign_of(c).is_some()) {
        return None;
    }

    // Regroupement des lignes de variations sans \hline
    let mut groups: Vec<Vec<&RawRow>> = Vec::new();
    for row in &rows[1..] {
        let mut pushed_to_current = false;
        if let Some(current) = groups.last_mut() {
            if !row.hline_before {
                let labelled = current.iter().filter(|r| !r.label.is_empty()).count()
                    + usize::from(!row.label.is_empty());
                let current_is_sign = current.len() == 1
                    && !current[0].label.is_empty()
                    && !group_has_arrow(current)
                    && current[0].cells.iter().any(|c| sign_of(c).is_some());
                let row_is_sign = !row.label.is_empty()
                    && row.cells.iter().any(|c| sign_of(c).is_some())
                    && !group_has_arrow(&[row]);
                if labelled <= 1 && !current_is_sign && !row_is_sign {
                    current.push(row);
                    pushed_to_current = true;
                }
            }
        }
        if !pushed_to_current {
            groups.push(vec![row]);
        }
    }

    let mut final_groups: Vec<Vec<&RawRow>> = Vec::new();
    for g in groups {
        if g.len() > 1 && !group_has_arrow(&g) {
            for r in g {
                final_groups.push(vec![r]);
            }
        } else {
            final_groups.push(g);
        }
    }

    let x_values: Vec<String> = value_cols.iter().map(|&c| x_row.cells[c].clone()).collect();
    let mut model_rows: Vec<Value> = Vec::new();
    let mut saw_signal = false;
    let mut forbidden_cols: BTreeSet<usize> = BTreeSet::new();

    for g in final_groups {
        let projected: Vec<ProjectedRow> = g.iter().map(|r| project(r, &value_cols)).collect();
        if group_has_arrow(&g) {
            saw_signal = true;
            model_rows.push(build_var_row(&projected, &forbidden_cols));
        } else {
            let (row_val, has_sign, forb) = build_sign_row(&projected[0]);
            if has_sign {
                saw_signal = true;
            }
            for idx in forb {
                forbidden_cols.insert(idx);
            }
            model_rows.push(row_val);
        }
    }

    if !saw_signal {
        return None;
    }

    Some(json!({
        "xLabel": x_row.label,
        "xValues": x_values,
        "rows": model_rows,
    }))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_sign_and_variation_table() {
        let tex = r"\begin{array}{c|ccccc}
x & -\infty & & 0 & & +\infty \\ \hline
f'(x) & & + & 0 & - & \\ \hline
f(x) & -\infty & \nearrow & 1 & \searrow & -\infty
\end{array}";
        let model = parse_tkztab(tex).expect("should parse tkz-tab");
        assert_eq!(model["xLabel"], "x");
        assert_eq!(model["xValues"].as_array().unwrap().len(), 3);
        assert_eq!(model["rows"][0]["type"], "sign");
        assert_eq!(model["rows"][0]["marks"][1]["kind"], "zero");
        assert_eq!(model["rows"][0]["intervals"][0], "+");
        assert_eq!(model["rows"][1]["type"], "var");
        assert_eq!(model["rows"][1]["arrows"][0], "up");
        assert_eq!(model["rows"][1]["arrows"][1], "down");
    }

    #[test]
    fn rejects_plain_matrix_array() {
        let tex = r"\begin{array}{cc} 1 & 2 \\ 3 & 4 \end{array}";
        assert!(parse_tkztab(tex).is_none());
    }
}
