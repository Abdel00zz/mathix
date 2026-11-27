//! Normalisation de réponses libres et comparaison mathématique pédagogique
//! (signes, décimales françaises, fractions, LaTeX, infinis, constantes et détection d'erreur de signe).

const PUNCTUATION: &str = ".,/#!$%^&*;:{}=-_`~()[]\"'?<>|+";

/// Résultat pédagogique d'une comparaison entre une réponse élève et une réponse attendue.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum AnswerMatch {
    /// Réponse exacte ou mathématiquement équivalente (ex. `0,5`, `1/2`, `\frac{1}{2}`).
    Exact,
    /// Valeur opposée (erreur de signe : ex. `-2` au lieu de `2`, ou `-\infty` au lieu de `+\infty`).
    SignError,
    /// Valeur numérique proche (arrondi ou approximation légère).
    NearNumeric,
    /// Réponse différente.
    Mismatch,
}

/// Normalise une chaîne textuelle pour recherche tolérante (accents, ligatures, ponctuation, espaces).
pub fn norm_answer(value: &str) -> String {
    let mut out = String::with_capacity(value.len());
    for c in value.to_lowercase().chars() {
        let mapped = match c {
            'à' | 'â' | 'ä' => 'a',
            'é' | 'è' | 'ê' | 'ë' => 'e',
            'î' | 'ï' => 'i',
            'ô' | 'ö' => 'o',
            'ù' | 'û' | 'ü' => 'u',
            'ç' => 'c',
            'ñ' => 'n',
            'œ' => 'o',
            'æ' => 'a',
            'ÿ' => 'y',
            _ => c,
        };
        if !PUNCTUATION.contains(mapped) {
            out.push(mapped);
        }
    }
    out.split_whitespace().collect::<Vec<&str>>().join(" ")
}

#[derive(Clone, Copy, Debug, PartialEq)]
enum MathValue {
    Finite(f64),
    PosInf,
    NegInf,
}

fn clean_math_expr(raw: &str) -> String {
    let mut s = raw
        .trim()
        .replace("$$", "")
        .replace('$', "")
        .replace('\u{2212}', "-")
        .replace('\u{2013}', "-")
        .replace('\u{2014}', "-")
        .replace('\u{00d7}', "*")
        .replace('\u{00b7}', "*")
        .replace('\u{221e}', "inf")
        .replace('\u{03c0}', "pi")
        .replace('\u{221a}', "sqrt")
        .replace("\\dfrac", "\\frac")
        .replace("\\tfrac", "\\frac")
        .replace("\\left", "")
        .replace("\\right", "")
        .replace("\\times", "*")
        .replace("\\cdot", "*")
        .replace("\\infty", "inf")
        .replace("\\pi", "pi")
        .replace("\\,", "")
        .replace("\\;", "")
        .replace("\\!", "")
        .replace("\\ ", "");

    // Convert \frac{a}{b} -> ((a)/(b))
    while let Some(pos) = s.find("\\frac{") {
        if let Some((num, after_num)) = take_braced(&s, pos + 5) {
            if let Some((den, after_den)) = take_braced(&s, after_num) {
                let mut rebuilt = String::with_capacity(s.len() + 8);
                rebuilt.push_str(&s[..pos]);
                rebuilt.push_str("((");
                rebuilt.push_str(&num);
                rebuilt.push_str(")/(");
                rebuilt.push_str(&den);
                rebuilt.push_str("))");
                rebuilt.push_str(&s[after_den..]);
                s = rebuilt;
                continue;
            }
        }
        break;
    }

    // Convert \sqrt{a} -> sqrt(a)
    while let Some(pos) = s.find("\\sqrt{") {
        if let Some((inner, after)) = take_braced(&s, pos + 5) {
            let mut rebuilt = String::with_capacity(s.len() + 4);
            rebuilt.push_str(&s[..pos]);
            rebuilt.push_str("sqrt(");
            rebuilt.push_str(&inner);
            rebuilt.push(')');
            rebuilt.push_str(&s[after..]);
            s = rebuilt;
            continue;
        }
        break;
    }

    // Remove remaining \text{...} / \mathrm{...} wrappers
    for cmd in ["\\text{", "\\mathrm{", "\\operatorname{"] {
        while let Some(pos) = s.find(cmd) {
            let brace_pos = pos + cmd.len() - 1;
            if let Some((inner, after)) = take_braced(&s, brace_pos) {
                let mut rebuilt = String::with_capacity(s.len());
                rebuilt.push_str(&s[..pos]);
                rebuilt.push_str(&inner);
                rebuilt.push_str(&s[after..]);
                s = rebuilt;
                continue;
            }
            break;
        }
    }

    // Replace French decimal comma between digits (e.g., 0,5 -> 0.5)
    let chars: Vec<char> = s.chars().collect();
    let mut out = String::with_capacity(s.len());
    for i in 0..chars.len() {
        let c = chars[i];
        if c == ','
            && i > 0
            && i + 1 < chars.len()
            && chars[i - 1].is_ascii_digit()
            && chars[i + 1].is_ascii_digit()
        {
            out.push('.');
        } else if !c.is_whitespace() {
            out.push(c.to_ascii_lowercase());
        }
    }
    out
}

fn take_braced(s: &str, open_brace_idx: usize) -> Option<(String, usize)> {
    let bytes = s.as_bytes();
    if bytes.get(open_brace_idx).copied() != Some(b'{') {
        return None;
    }
    let mut depth = 1usize;
    let mut i = open_brace_idx + 1;
    while i < bytes.len() && depth > 0 {
        if bytes[i] == b'\\' && i + 1 < bytes.len() {
            i += 2;
            continue;
        }
        if bytes[i] == b'{' {
            depth += 1;
        } else if bytes[i] == b'}' {
            depth -= 1;
            if depth == 0 {
                return Some((s[open_brace_idx + 1..i].to_string(), i + 1));
            }
        }
        i += 1;
    }
    None
}

fn parse_math_value(raw: &str) -> Option<MathValue> {
    let cleaned = clean_math_expr(raw);
    if cleaned.is_empty() {
        return None;
    }
    match cleaned.as_str() {
        "inf" | "+inf" | "oo" | "+oo" | "infty" | "+infty" | "plusinf" => {
            return Some(MathValue::PosInf);
        }
        "-inf" | "-oo" | "-infty" | "moinsinf" => {
            return Some(MathValue::NegInf);
        }
        _ => {}
    }

    let bytes = cleaned.as_bytes();
    let mut p = ExprParser { bytes, pos: 0 };
    let val = p.parse_expr()?;
    if p.pos != bytes.len() || !val.is_finite() {
        return None;
    }
    Some(MathValue::Finite(val))
}

struct ExprParser<'a> {
    bytes: &'a [u8],
    pos: usize,
}

impl<'a> ExprParser<'a> {
    fn peek(&self) -> Option<u8> {
        self.bytes.get(self.pos).copied()
    }

    fn starts_with(&self, lit: &str) -> bool {
        self.bytes[self.pos..].starts_with(lit.as_bytes())
    }

    fn parse_expr(&mut self) -> Option<f64> {
        let mut lhs = self.parse_term()?;
        while let Some(b) = self.peek() {
            match b {
                b'+' => {
                    self.pos += 1;
                    lhs += self.parse_term()?;
                }
                b'-' => {
                    self.pos += 1;
                    lhs -= self.parse_term()?;
                }
                _ => break,
            }
        }
        Some(lhs)
    }

    fn parse_term(&mut self) -> Option<f64> {
        let mut lhs = self.parse_power()?;
        loop {
            match self.peek() {
                Some(b'*') => {
                    self.pos += 1;
                    lhs *= self.parse_power()?;
                }
                Some(b'/') => {
                    self.pos += 1;
                    let rhs = self.parse_power()?;
                    if rhs.abs() < 1e-15 {
                        return None;
                    }
                    lhs /= rhs;
                }
                // Implicit multiplication: 2pi, 2sqrt(3), 2(x), (2)(3)
                Some(b'(') | Some(b'p') | Some(b'e') | Some(b's') => {
                    lhs *= self.parse_power()?;
                }
                _ => break,
            }
        }
        Some(lhs)
    }

    fn parse_power(&mut self) -> Option<f64> {
        let base = self.parse_unary()?;
        if self.peek() == Some(b'^') {
            self.pos += 1;
            let exp = self.parse_unary()?;
            return Some(base.powf(exp));
        }
        Some(base)
    }

    fn parse_unary(&mut self) -> Option<f64> {
        match self.peek() {
            Some(b'+') => {
                self.pos += 1;
                self.parse_unary()
            }
            Some(b'-') => {
                self.pos += 1;
                Some(-self.parse_unary()?)
            }
            _ => self.parse_primary(),
        }
    }

    fn parse_primary(&mut self) -> Option<f64> {
        if self.peek() == Some(b'(') {
            self.pos += 1;
            let v = self.parse_expr()?;
            if self.peek() != Some(b')') {
                return None;
            }
            self.pos += 1;
            return Some(v);
        }
        if self.peek() == Some(b'{') {
            self.pos += 1;
            let v = self.parse_expr()?;
            if self.peek() != Some(b'}') {
                return None;
            }
            self.pos += 1;
            return Some(v);
        }
        if self.starts_with("sqrt") {
            self.pos += 4;
            let arg = if self.peek() == Some(b'(') || self.peek() == Some(b'{') {
                self.parse_primary()?
            } else {
                self.parse_number()?
            };
            if arg < 0.0 {
                return None;
            }
            return Some(arg.sqrt());
        }
        if self.starts_with("ln") {
            self.pos += 2;
            let arg = self.parse_primary()?;
            if arg <= 0.0 {
                return None;
            }
            return Some(arg.ln());
        }
        if self.starts_with("pi") {
            self.pos += 2;
            return Some(std::f64::consts::PI);
        }
        if self.peek() == Some(b'e') {
            // Avoid matching identifiers like "exp" or words starting with 'e'
            let next = self.bytes.get(self.pos + 1).copied();
            if next.map(|c| c.is_ascii_alphabetic()).unwrap_or(false) {
                return None;
            }
            self.pos += 1;
            return Some(std::f64::consts::E);
        }
        self.parse_number()
    }

    fn parse_number(&mut self) -> Option<f64> {
        let start = self.pos;
        let mut saw_dot = false;
        while let Some(b) = self.peek() {
            if b.is_ascii_digit() {
                self.pos += 1;
            } else if b == b'.' && !saw_dot {
                saw_dot = true;
                self.pos += 1;
            } else {
                break;
            }
        }
        if self.pos == start {
            return None;
        }
        std::str::from_utf8(&self.bytes[start..self.pos])
            .ok()?
            .parse::<f64>()
            .ok()
    }
}

/// Compare une réponse élève à une réponse attendue avec intelligence mathématique :
/// - équivalence numérique / fractionnaire / décimale FR / LaTeX / infinis ;
/// - détection pédagogique des erreurs de signe et des approximations proches ;
/// - repli textuel tolérant (accents, casse, espaces) pour les réponses conceptuelles.
pub fn check_math_answer(user: &str, expected: &str) -> AnswerMatch {
    let u_trim = user.trim();
    let e_trim = expected.trim();
    if u_trim.is_empty() || e_trim.is_empty() {
        return AnswerMatch::Mismatch;
    }

    if let (Some(uv), Some(ev)) = (parse_math_value(u_trim), parse_math_value(e_trim)) {
        return match (uv, ev) {
            (MathValue::PosInf, MathValue::PosInf) | (MathValue::NegInf, MathValue::NegInf) => {
                AnswerMatch::Exact
            }
            (MathValue::PosInf, MathValue::NegInf) | (MathValue::NegInf, MathValue::PosInf) => {
                AnswerMatch::SignError
            }
            (MathValue::Finite(a), MathValue::Finite(b)) => {
                let diff = (a - b).abs();
                let tol = 1e-6_f64.max(b.abs() * 1e-6);
                if diff <= tol {
                    AnswerMatch::Exact
                } else if b.abs() > 1e-6 && (a + b).abs() <= tol {
                    AnswerMatch::SignError
                } else if diff <= 0.025_f64.max(b.abs() * 0.025) {
                    AnswerMatch::NearNumeric
                } else {
                    AnswerMatch::Mismatch
                }
            }
            _ => AnswerMatch::Mismatch,
        };
    }

    // Normalisation symbolique légère (conserve signes & slash pour expressions algébriques type "2x-1")
    let u_sym = clean_math_expr(u_trim);
    let e_sym = clean_math_expr(e_trim);
    if !u_sym.is_empty() && u_sym == e_sym {
        return AnswerMatch::Exact;
    }

    // Repli textuel uniquement si l'attendu ne contient pas de signe explicite (+/-) ou de chiffre ambigu
    let has_math_sign = e_trim.contains('-') || e_trim.contains('+') || e_trim.contains('/') || e_trim.contains("\\frac");
    if !has_math_sign {
        let u_norm = norm_answer(u_trim);
        let e_norm = norm_answer(e_trim);
        if !u_norm.is_empty() && u_norm == e_norm {
            return AnswerMatch::Exact;
        }
    }

    AnswerMatch::Mismatch
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn matches_equivalent_math_representations() {
        assert_eq!(check_math_answer("0,5", "1/2"), AnswerMatch::Exact);
        assert_eq!(check_math_answer("0.5", "$\\frac{1}{2}$"), AnswerMatch::Exact);
        assert_eq!(check_math_answer("2/4", "\\dfrac{1}{2}"), AnswerMatch::Exact);
        assert_eq!(check_math_answer("-1,5", "-\\frac{3}{2}"), AnswerMatch::Exact);
        assert_eq!(check_math_answer("+oo", "$+\\infty$"), AnswerMatch::Exact);
        assert_eq!(check_math_answer("∞", "+inf"), AnswerMatch::Exact);
        assert_eq!(check_math_answer("sqrt(2)/2", "$\\frac{\\sqrt{2}}{2}$"), AnswerMatch::Exact);
        assert_eq!(check_math_answer("2x - 1", "$2x-1$"), AnswerMatch::Exact);
        assert_eq!(check_math_answer("Strictement croissante", "strictement croissante"), AnswerMatch::Exact);
    }

    #[test]
    fn detects_sign_errors_and_near_approximations() {
        assert_eq!(check_math_answer("2", "-2"), AnswerMatch::SignError);
        assert_eq!(check_math_answer("-1/2", "0.5"), AnswerMatch::SignError);
        assert_eq!(check_math_answer("-oo", "+\\infty"), AnswerMatch::SignError);
        assert_eq!(check_math_answer("1.41", "\\sqrt{2}"), AnswerMatch::NearNumeric);
        assert_eq!(check_math_answer("3", "-2"), AnswerMatch::Mismatch);
        assert_eq!(check_math_answer("12", "1/2"), AnswerMatch::Mismatch);
    }
}
