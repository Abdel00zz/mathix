//! Validation syntaxique LaTeX : délimiteurs math ($ / $$ / \( \) / \[ \]),
//! équilibre des accolades `{}` et pile des environnements `\begin{…}…\end{…}`.

use crate::analyze::next_char_len;

/// Valide un texte LaTeX mixte et retourne la liste des anomalies détectées.
pub fn validate(text: &str) -> Vec<String> {
    let mut errors = Vec::new();
    let mut dollar_parity = Vec::new();
    let mut braces = 0i64;
    let mut env_stack: Vec<String> = Vec::new();
    let bytes = text.as_bytes();
    let mut i = 0usize;

    while i < text.len() {
        let rest = &text[i..];
        match bytes[i] {
            b'$' => {
                if rest.starts_with("$$") {
                    if let Some(rel) = rest[2..].find("$$") {
                        i = i + 2 + rel + 2;
                    } else {
                        errors.push(format!("Délimiteur $$ non fermé à l'offset {i}"));
                        i += 2;
                    }
                } else {
                    if dollar_parity.pop().is_none() {
                        dollar_parity.push(i);
                    }
                    i += 1;
                }
            }
            b'{' => {
                braces += 1;
                i += 1;
            }
            b'}' => {
                braces -= 1;
                if braces < 0 {
                    errors.push("Accolade } fermante sans ouvrante".into());
                    braces = 0;
                }
                i += 1;
            }
            b'\\' => {
                if rest.starts_with("\\[") {
                    if !rest[2..].contains("\\]") {
                        errors.push("Délimiteur \\[ non fermé par \\]".into());
                    }
                    i += 2;
                } else if rest.starts_with("\\]") {
                    errors.push("Délimiteur \\] sans \\[ ouvrant".into());
                    i += 2;
                } else if rest.starts_with("\\(") {
                    if !rest[2..].contains("\\)") {
                        errors.push("Délimiteur \\( non fermé par \\)".into());
                    }
                    i += 2;
                } else if rest.starts_with("\\)") {
                    errors.push("Délimiteur \\) sans \\( ouvrant".into());
                    i += 2;
                } else if rest.starts_with("\\begin{") {
                    match text[i + 7..].find('}').map(|p| i + 7 + p) {
                        Some(ne) => {
                            env_stack.push(text[i + 7..ne].to_string());
                            i = ne + 1;
                        }
                        None => {
                            errors.push("\\begin{ sans nom".into());
                            i += 7;
                        }
                    }
                } else if rest.starts_with("\\end{") {
                    match text[i + 5..].find('}').map(|p| i + 5 + p) {
                        Some(ne) => {
                            let name = text[i + 5..ne].to_string();
                            match env_stack.pop() {
                                Some(open) if open == name => {}
                                Some(open) => errors.push(format!(
                                    "Environnement '{name}' fermé mais '{open}' attendu"
                                )),
                                None => errors.push(format!(
                                    "\\end{{{name}}} sans \\begin correspondant"
                                )),
                            }
                            i = ne + 1;
                        }
                        None => {
                            errors.push("\\end{ sans nom".into());
                            i += 5;
                        }
                    }
                } else {
                    i += 1;
                    if i < text.len() {
                        if bytes[i].is_ascii_alphabetic() {
                            while i < text.len() && bytes[i].is_ascii_alphabetic() {
                                i += 1;
                            }
                        } else {
                            i += next_char_len(text, i);
                        }
                    }
                }
            }
            _ => {
                i += next_char_len(text, i);
            }
        }
    }

    if !dollar_parity.is_empty() {
        errors.push(format!(
            "Nombre impair de délimiteurs $ inline ({} restant(s))",
            dollar_parity.len()
        ));
    }
    if braces != 0 {
        errors.push(format!("Accolades {{}} déséquilibrées ({braces} non fermée(s))"));
    }
    for open in &env_stack {
        errors.push(format!("Environnement '{open}' non correctement fermé"));
    }
    errors
}
