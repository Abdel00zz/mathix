//! `serde_json` — implémentation RFC 8259 autonome, sans `build.rs` ni dépendance externe,
//! optimisée pour la compilation directe vers `wasm32-unknown-unknown` via `rust-lld`.

use std::collections::BTreeMap;
use std::fmt;
use std::ops::Index;

pub type Map<K, V> = BTreeMap<K, V>;

#[derive(Clone, Debug, PartialEq)]
pub enum Number {
    Int(i64),
    UInt(u64),
    Float(f64),
}

impl Number {
    pub fn as_u64(&self) -> Option<u64> {
        match *self {
            Number::UInt(u) => Some(u),
            Number::Int(i) if i >= 0 => Some(i as u64),
            Number::Float(f) if f >= 0.0 && f.fract() == 0.0 => Some(f as u64),
            _ => None,
        }
    }
    pub fn as_i64(&self) -> Option<i64> {
        match *self {
            Number::Int(i) => Some(i),
            Number::UInt(u) if u <= i64::MAX as u64 => Some(u as i64),
            Number::Float(f) if f.fract() == 0.0 => Some(f as i64),
            _ => None,
        }
    }
    pub fn as_f64(&self) -> Option<f64> {
        match *self {
            Number::Int(i) => Some(i as f64),
            Number::UInt(u) => Some(u as f64),
            Number::Float(f) => Some(f),
        }
    }
}

impl fmt::Display for Number {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match *self {
            Number::Int(i) => write!(f, "{i}"),
            Number::UInt(u) => write!(f, "{u}"),
            Number::Float(fl) => {
                if fl.is_finite() {
                    write!(f, "{fl}")
                } else {
                    write!(f, "null")
                }
            }
        }
    }
}

#[derive(Clone, Debug, PartialEq)]
pub enum Value {
    Null,
    Bool(bool),
    Number(Number),
    String(String),
    Array(Vec<Value>),
    Object(Map<String, Value>),
}

static NULL_VAL: Value = Value::Null;

impl Default for Value {
    fn default() -> Self {
        Value::Null
    }
}

impl Value {
    pub fn get(&self, key: &str) -> Option<&Value> {
        match self {
            Value::Object(m) => m.get(key),
            _ => None,
        }
    }
    pub fn get_mut(&mut self, key: &str) -> Option<&mut Value> {
        match self {
            Value::Object(m) => m.get_mut(key),
            _ => None,
        }
    }
    pub fn as_str(&self) -> Option<&str> {
        match self {
            Value::String(s) => Some(s.as_str()),
            _ => None,
        }
    }
    pub fn as_array(&self) -> Option<&Vec<Value>> {
        match self {
            Value::Array(a) => Some(a),
            _ => None,
        }
    }
    pub fn as_array_mut(&mut self) -> Option<&mut Vec<Value>> {
        match self {
            Value::Array(a) => Some(a),
            _ => None,
        }
    }
    pub fn as_object(&self) -> Option<&Map<String, Value>> {
        match self {
            Value::Object(m) => Some(m),
            _ => None,
        }
    }
    pub fn as_object_mut(&mut self) -> Option<&mut Map<String, Value>> {
        match self {
            Value::Object(m) => Some(m),
            _ => None,
        }
    }
    pub fn as_bool(&self) -> Option<bool> {
        match self {
            Value::Bool(b) => Some(*b),
            _ => None,
        }
    }
    pub fn as_u64(&self) -> Option<u64> {
        match self {
            Value::Number(n) => n.as_u64(),
            _ => None,
        }
    }
    pub fn as_i64(&self) -> Option<i64> {
        match self {
            Value::Number(n) => n.as_i64(),
            _ => None,
        }
    }
    pub fn as_f64(&self) -> Option<f64> {
        match self {
            Value::Number(n) => n.as_f64(),
            _ => None,
        }
    }
    pub fn is_null(&self) -> bool {
        matches!(self, Value::Null)
    }
    pub fn is_string(&self) -> bool {
        matches!(self, Value::String(_))
    }
    pub fn is_array(&self) -> bool {
        matches!(self, Value::Array(_))
    }
    pub fn is_object(&self) -> bool {
        matches!(self, Value::Object(_))
    }
    pub fn is_boolean(&self) -> bool {
        matches!(self, Value::Bool(_))
    }
    pub fn is_number(&self) -> bool {
        matches!(self, Value::Number(_))
    }
}

impl Index<&str> for Value {
    type Output = Value;
    fn index(&self, key: &str) -> &Value {
        self.get(key).unwrap_or(&NULL_VAL)
    }
}

impl Index<usize> for Value {
    type Output = Value;
    fn index(&self, idx: usize) -> &Value {
        match self {
            Value::Array(a) => a.get(idx).unwrap_or(&NULL_VAL),
            _ => &NULL_VAL,
        }
    }
}

impl PartialEq<bool> for Value {
    fn eq(&self, other: &bool) -> bool {
        self.as_bool() == Some(*other)
    }
}
impl PartialEq<&str> for Value {
    fn eq(&self, other: &&str) -> bool {
        self.as_str() == Some(*other)
    }
}
impl PartialEq<i32> for Value {
    fn eq(&self, other: &i32) -> bool {
        self.as_i64() == Some(*other as i64)
    }
}
impl PartialEq<u32> for Value {
    fn eq(&self, other: &u32) -> bool {
        self.as_u64() == Some(*other as u64)
    }
}
impl PartialEq<usize> for Value {
    fn eq(&self, other: &usize) -> bool {
        self.as_u64() == Some(*other as u64)
    }
}

impl From<bool> for Value {
    fn from(v: bool) -> Self { Value::Bool(v) }
}
impl From<&str> for Value {
    fn from(v: &str) -> Self { Value::String(v.to_string()) }
}
impl From<&&str> for Value {
    fn from(v: &&str) -> Self { Value::String((*v).to_string()) }
}
impl From<&&&str> for Value {
    fn from(v: &&&str) -> Self { Value::String((**v).to_string()) }
}
impl From<&u32> for Value {
    fn from(v: &u32) -> Self { Value::Number(Number::UInt(*v as u64)) }
}
impl From<&usize> for Value {
    fn from(v: &usize) -> Self { Value::Number(Number::UInt(*v as u64)) }
}
impl From<&bool> for Value {
    fn from(v: &bool) -> Self { Value::Bool(*v) }
}
impl From<String> for Value {
    fn from(v: String) -> Self { Value::String(v) }
}
impl From<&String> for Value {
    fn from(v: &String) -> Self { Value::String(v.clone()) }
}
impl From<i32> for Value {
    fn from(v: i32) -> Self { Value::Number(Number::Int(v as i64)) }
}
impl From<i64> for Value {
    fn from(v: i64) -> Self { Value::Number(Number::Int(v)) }
}
impl From<u32> for Value {
    fn from(v: u32) -> Self { Value::Number(Number::UInt(v as u64)) }
}
impl From<u64> for Value {
    fn from(v: u64) -> Self { Value::Number(Number::UInt(v)) }
}
impl From<usize> for Value {
    fn from(v: usize) -> Self { Value::Number(Number::UInt(v as u64)) }
}
impl From<f64> for Value {
    fn from(v: f64) -> Self { Value::Number(Number::Float(v)) }
}
impl<T: Into<Value> + Clone> From<&[T]> for Value {
    fn from(slice: &[T]) -> Self {
        Value::Array(slice.iter().cloned().map(Into::into).collect())
    }
}
impl<T: Into<Value> + Clone, const N: usize> From<&[T; N]> for Value {
    fn from(arr: &[T; N]) -> Self {
        Value::Array(arr.iter().cloned().map(Into::into).collect())
    }
}
impl<T: Into<Value>> From<Vec<T>> for Value {
    fn from(vec: Vec<T>) -> Self {
        Value::Array(vec.into_iter().map(Into::into).collect())
    }
}
impl From<Map<String, Value>> for Value {
    fn from(m: Map<String, Value>) -> Self { Value::Object(m) }
}
impl<V: Into<Value> + Clone> From<&Map<String, V>> for Value {
    fn from(m: &Map<String, V>) -> Self {
        Value::Object(m.iter().map(|(k, v)| (k.clone(), v.clone().into())).collect())
    }
}
impl<V: Into<Value>> From<std::collections::HashMap<String, V>> for Value {
    fn from(m: std::collections::HashMap<String, V>) -> Self {
        Value::Object(m.into_iter().map(|(k, v)| (k, v.into())).collect())
    }
}
impl<V: Into<Value> + Clone> From<&std::collections::HashMap<String, V>> for Value {
    fn from(m: &std::collections::HashMap<String, V>) -> Self {
        Value::Object(m.iter().map(|(k, v)| (k.clone(), v.clone().into())).collect())
    }
}
impl<T: Into<Value> + Clone> From<&Vec<T>> for Value {
    fn from(vec: &Vec<T>) -> Self {
        Value::Array(vec.iter().cloned().map(Into::into).collect())
    }
}
impl From<&Value> for Value {
    fn from(v: &Value) -> Self { v.clone() }
}
impl From<&&Value> for Value {
    fn from(v: &&Value) -> Self { (*v).clone() }
}
impl From<&i32> for Value {
    fn from(v: &i32) -> Self { Value::Number(Number::Int(*v as i64)) }
}
impl From<&i64> for Value {
    fn from(v: &i64) -> Self { Value::Number(Number::Int(*v)) }
}
impl From<&u64> for Value {
    fn from(v: &u64) -> Self { Value::Number(Number::UInt(*v)) }
}
impl From<&f64> for Value {
    fn from(v: &f64) -> Self { Value::Number(Number::Float(*v)) }
}
impl<T: Into<Value> + Clone> From<&Option<T>> for Value {
    fn from(opt: &Option<T>) -> Self {
        match opt {
            Some(v) => v.clone().into(),
            None => Value::Null,
        }
    }
}
impl<T: Into<Value>> From<Option<T>> for Value {
    fn from(opt: Option<T>) -> Self {
        match opt {
            Some(v) => v.into(),
            None => Value::Null,
        }
    }
}

fn write_escaped_str(out: &mut String, s: &str) {
    out.push('"');
    for ch in s.chars() {
        match ch {
            '"' => out.push_str("\\\""),
            '\\' => out.push_str("\\\\"),
            '\x08' => out.push_str("\\b"),
            '\x0C' => out.push_str("\\f"),
            '\n' => out.push_str("\\n"),
            '\r' => out.push_str("\\r"),
            '\t' => out.push_str("\\t"),
            c if (c as u32) < 0x20 => {
                out.push_str(&format!("\\u{:04x}", c as u32));
            }
            c => out.push(c),
        }
    }
    out.push('"');
}

fn write_compact(out: &mut String, v: &Value) {
    match v {
        Value::Null => out.push_str("null"),
        Value::Bool(b) => out.push_str(if *b { "true" } else { "false" }),
        Value::Number(n) => out.push_str(&n.to_string()),
        Value::String(s) => write_escaped_str(out, s),
        Value::Array(arr) => {
            out.push('[');
            for (i, item) in arr.iter().enumerate() {
                if i > 0 { out.push(','); }
                write_compact(out, item);
            }
            out.push(']');
        }
        Value::Object(map) => {
            out.push('{');
            for (i, (k, val)) in map.iter().enumerate() {
                if i > 0 { out.push(','); }
                write_escaped_str(out, k);
                out.push(':');
                write_compact(out, val);
            }
            out.push('}');
        }
    }
}

fn write_pretty(out: &mut String, v: &Value, depth: usize) {
    let indent = "  ".repeat(depth);
    let child_indent = "  ".repeat(depth + 1);
    match v {
        Value::Null | Value::Bool(_) | Value::Number(_) | Value::String(_) => {
            write_compact(out, v);
        }
        Value::Array(arr) => {
            if arr.is_empty() {
                out.push_str("[]");
                return;
            }
            out.push_str("[\n");
            for (i, item) in arr.iter().enumerate() {
                if i > 0 { out.push_str(",\n"); }
                out.push_str(&child_indent);
                write_pretty(out, item, depth + 1);
            }
            out.push('\n');
            out.push_str(&indent);
            out.push(']');
        }
        Value::Object(map) => {
            if map.is_empty() {
                out.push_str("{}");
                return;
            }
            out.push_str("{\n");
            for (i, (k, val)) in map.iter().enumerate() {
                if i > 0 { out.push_str(",\n"); }
                out.push_str(&child_indent);
                write_escaped_str(out, k);
                out.push_str(": ");
                write_pretty(out, val, depth + 1);
            }
            out.push('\n');
            out.push_str(&indent);
            out.push('}');
        }
    }
}

impl fmt::Display for Value {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        let mut s = String::new();
        write_compact(&mut s, self);
        f.write_str(&s)
    }
}

pub fn to_string(v: &Value) -> Result<String, String> {
    let mut s = String::new();
    write_compact(&mut s, v);
    Ok(s)
}

pub fn to_string_pretty(v: &Value) -> Result<String, String> {
    let mut s = String::new();
    write_pretty(&mut s, v, 0);
    Ok(s)
}

/* ── Parseur RFC 8259 ──────────────────────────────────────────────────── */
struct Parser<'a> {
    bytes: &'a [u8],
    pos: usize,
}

impl<'a> Parser<'a> {
    fn new(input: &'a str) -> Self {
        Self { bytes: input.as_bytes(), pos: 0 }
    }

    fn skip_ws(&mut self) {
        while self.pos < self.bytes.len() {
            match self.bytes[self.pos] {
                b' ' | b'\t' | b'\n' | b'\r' => self.pos += 1,
                _ => break,
            }
        }
    }

    fn peek(&mut self) -> Option<u8> {
        self.skip_ws();
        self.bytes.get(self.pos).copied()
    }

    fn parse_value(&mut self) -> Result<Value, String> {
        match self.peek() {
            Some(b'n') => self.parse_null(),
            Some(b't') | Some(b'f') => self.parse_bool(),
            Some(b'"') => self.parse_string().map(Value::String),
            Some(b'[') => self.parse_array(),
            Some(b'{') => self.parse_object(),
            Some(b'-') | Some(b'0'..=b'9') => self.parse_number(),
            Some(c) => Err(format!("caractère inattendu '{}' à {}", c as char, self.pos)),
            None => Err("fin de chaîne JSON inattendue".into()),
        }
    }

    fn parse_null(&mut self) -> Result<Value, String> {
        if self.bytes[self.pos..].starts_with(b"null") {
            self.pos += 4;
            Ok(Value::Null)
        } else {
            Err(format!("attendu 'null' à {}", self.pos))
        }
    }

    fn parse_bool(&mut self) -> Result<Value, String> {
        if self.bytes[self.pos..].starts_with(b"true") {
            self.pos += 4;
            Ok(Value::Bool(true))
        } else if self.bytes[self.pos..].starts_with(b"false") {
            self.pos += 5;
            Ok(Value::Bool(false))
        } else {
            Err(format!("attendu booléen à {}", self.pos))
        }
    }

    fn parse_hex4(&mut self) -> Result<u16, String> {
        if self.pos + 4 > self.bytes.len() {
            return Err("séquence \\uXXXX incomplète".into());
        }
        let slice = std::str::from_utf8(&self.bytes[self.pos..self.pos + 4])
            .map_err(|_| "hex \\u invalide".to_string())?;
        self.pos += 4;
        u16::from_str_radix(slice, 16).map_err(|_| "hex \\u invalide".to_string())
    }

    fn parse_string(&mut self) -> Result<String, String> {
        self.skip_ws();
        if self.bytes.get(self.pos) != Some(&b'"') {
            return Err(format!("attendu '\"' à {}", self.pos));
        }
        self.pos += 1;
        let mut out = String::new();
        while self.pos < self.bytes.len() {
            let b = self.bytes[self.pos];
            if b == b'"' {
                self.pos += 1;
                return Ok(out);
            }
            if b == b'\\' {
                self.pos += 1;
                if self.pos >= self.bytes.len() {
                    return Err("échappement non terminé".into());
                }
                let esc = self.bytes[self.pos];
                self.pos += 1;
                match esc {
                    b'"' => out.push('"'),
                    b'\\' => out.push('\\'),
                    b'/' => out.push('/'),
                    b'b' => out.push('\x08'),
                    b'f' => out.push('\x0C'),
                    b'n' => out.push('\n'),
                    b'r' => out.push('\r'),
                    b't' => out.push('\t'),
                    b'u' => {
                        let code = self.parse_hex4()?;
                        if (0xD800..=0xDBFF).contains(&code) {
                            if self.bytes[self.pos..].starts_with(b"\\u") {
                                self.pos += 2;
                                let low = self.parse_hex4()?;
                                let combined = 0x10000 + (((code as u32 - 0xD800) << 10) | (low as u32 - 0xDC00));
                                if let Some(ch) = char::from_u32(combined) {
                                    out.push(ch);
                                }
                            }
                        } else if let Some(ch) = char::from_u32(code as u32) {
                            out.push(ch);
                        }
                    }
                    other => out.push(other as char),
                }
            } else {
                let rest = &self.bytes[self.pos..];
                let next_special = rest.iter().position(|&c| c == b'"' || c == b'\\').unwrap_or(rest.len());
                let chunk = std::str::from_utf8(&rest[..next_special])
                    .map_err(|_| "UTF-8 invalide dans chaîne JSON".to_string())?;
                out.push_str(chunk);
                self.pos += next_special;
            }
        }
        Err("chaîne JSON non fermée".into())
    }

    fn parse_number(&mut self) -> Result<Value, String> {
        self.skip_ws();
        let start = self.pos;
        let mut is_float = false;
        if self.bytes.get(self.pos) == Some(&b'-') {
            self.pos += 1;
        }
        while self.pos < self.bytes.len() && self.bytes[self.pos].is_ascii_digit() {
            self.pos += 1;
        }
        if self.bytes.get(self.pos) == Some(&b'.') {
            is_float = true;
            self.pos += 1;
            while self.pos < self.bytes.len() && self.bytes[self.pos].is_ascii_digit() {
                self.pos += 1;
            }
        }
        if matches!(self.bytes.get(self.pos), Some(b'e' | b'E')) {
            is_float = true;
            self.pos += 1;
            if matches!(self.bytes.get(self.pos), Some(b'+' | b'-')) {
                self.pos += 1;
            }
            while self.pos < self.bytes.len() && self.bytes[self.pos].is_ascii_digit() {
                self.pos += 1;
            }
        }
        let raw = std::str::from_utf8(&self.bytes[start..self.pos])
            .map_err(|_| "nombre invalide".to_string())?;
        if !is_float {
            if raw.starts_with('-') {
                if let Ok(i) = raw.parse::<i64>() {
                    return Ok(Value::Number(Number::Int(i)));
                }
            } else if let Ok(u) = raw.parse::<u64>() {
                return Ok(Value::Number(Number::UInt(u)));
            }
        }
        let f = raw.parse::<f64>().map_err(|_| format!("nombre invalide '{raw}'"))?;
        Ok(Value::Number(Number::Float(f)))
    }

    fn parse_array(&mut self) -> Result<Value, String> {
        self.skip_ws();
        self.pos += 1; // '['
        let mut arr = Vec::new();
        if self.peek() == Some(b']') {
            self.pos += 1;
            return Ok(Value::Array(arr));
        }
        loop {
            arr.push(self.parse_value()?);
            match self.peek() {
                Some(b',') => self.pos += 1,
                Some(b']') => {
                    self.pos += 1;
                    return Ok(Value::Array(arr));
                }
                _ => return Err(format!("attendu ',' ou ']' à {}", self.pos)),
            }
        }
    }

    fn parse_object(&mut self) -> Result<Value, String> {
        self.skip_ws();
        self.pos += 1; // '{'
        let mut map = Map::new();
        if self.peek() == Some(b'}') {
            self.pos += 1;
            return Ok(Value::Object(map));
        }
        loop {
            let key = self.parse_string()?;
            if self.peek() != Some(b':') {
                return Err(format!("attendu ':' à {}", self.pos));
            }
            self.pos += 1;
            let val = self.parse_value()?;
            map.insert(key, val);
            match self.peek() {
                Some(b',') => self.pos += 1,
                Some(b'}') => {
                    self.pos += 1;
                    return Ok(Value::Object(map));
                }
                _ => return Err(format!("attendu ',' ou '}}' à {}", self.pos)),
            }
        }
    }
}

pub fn from_str(input: &str) -> Result<Value, String> {
    let input = input.strip_prefix('\u{feff}').unwrap_or(input);
    let mut parser = Parser::new(input);
    let val = parser.parse_value()?;
    parser.skip_ws();
    if parser.pos < parser.bytes.len() {
        return Err(format!("octets supplémentaires en fin de JSON à {}", parser.pos));
    }
    Ok(val)
}

#[macro_export]
macro_rules! json {
    // Hide distracting implementation details from the generated rustdoc.
    ($($json:tt)+) => {
        $crate::json_internal!($($json)+)
    };
}

#[macro_export]
#[doc(hidden)]
macro_rules! json_internal {
    //////////////////////////////////////////////////////////////////////////
    // TT muncher for parsing the inside of an array [...].
    //////////////////////////////////////////////////////////////////////////
    (@array [$($elems:expr,)*]) => {
        ::std::vec![$($elems,)*]
    };
    (@array [$($elems:expr),*]) => {
        ::std::vec![$($elems),*]
    };
    (@array [$($elems:expr,)*] null $($rest:tt)*) => {
        $crate::json_internal!(@array [$($elems,)* $crate::json_internal!(null)] $($rest)*)
    };
    (@array [$($elems:expr,)*] true $($rest:tt)*) => {
        $crate::json_internal!(@array [$($elems,)* $crate::json_internal!(true)] $($rest)*)
    };
    (@array [$($elems:expr,)*] false $($rest:tt)*) => {
        $crate::json_internal!(@array [$($elems,)* $crate::json_internal!(false)] $($rest)*)
    };
    (@array [$($elems:expr,)*] [$($array:tt)*] $($rest:tt)*) => {
        $crate::json_internal!(@array [$($elems,)* $crate::json_internal!([$($array)*])] $($rest)*)
    };
    (@array [$($elems:expr,)*] {$($map:tt)*} $($rest:tt)*) => {
        $crate::json_internal!(@array [$($elems,)* $crate::json_internal!({$($map)*})] $($rest)*)
    };
    (@array [$($elems:expr,)*] $next:expr, $($rest:tt)*) => {
        $crate::json_internal!(@array [$($elems,)* $crate::json_internal!($next),] $($rest)*)
    };
    (@array [$($elems:expr,)*] $last:expr) => {
        $crate::json_internal!(@array [$($elems,)* $crate::json_internal!($last)])
    };
    (@array [$($elems:expr),*] , $($rest:tt)*) => {
        $crate::json_internal!(@array [$($elems,)*] $($rest)*)
    };

    //////////////////////////////////////////////////////////////////////////
    // TT muncher for parsing the inside of an object {...}.
    //////////////////////////////////////////////////////////////////////////
    (@object $object:ident () () ()) => {};
    (@object $object:ident [$($key:tt)+] ($value:expr) , $($rest:tt)*) => {
        let _ = $object.insert(($($key)+).into(), $value);
        $crate::json_internal!(@object $object () ($($rest)*) ($($rest)*));
    };
    (@object $object:ident [$($key:tt)+] ($value:expr)) => {
        let _ = $object.insert(($($key)+).into(), $value);
    };
    (@object $object:ident ($($key:tt)+) (: null $($rest:tt)*) $copy:tt) => {
        $crate::json_internal!(@object $object [$($key)+] ($crate::json_internal!(null)) $($rest)*);
    };
    (@object $object:ident ($($key:tt)+) (: true $($rest:tt)*) $copy:tt) => {
        $crate::json_internal!(@object $object [$($key)+] ($crate::json_internal!(true)) $($rest)*);
    };
    (@object $object:ident ($($key:tt)+) (: false $($rest:tt)*) $copy:tt) => {
        $crate::json_internal!(@object $object [$($key)+] ($crate::json_internal!(false)) $($rest)*);
    };
    (@object $object:ident ($($key:tt)+) (: [$($array:tt)*] $($rest:tt)*) $copy:tt) => {
        $crate::json_internal!(@object $object [$($key)+] ($crate::json_internal!([$($array)*])) $($rest)*);
    };
    (@object $object:ident ($($key:tt)+) (: {$($map:tt)*} $($rest:tt)*) $copy:tt) => {
        $crate::json_internal!(@object $object [$($key)+] ($crate::json_internal!({$($map)*})) $($rest)*);
    };
    (@object $object:ident ($($key:tt)+) (: $value:expr , $($rest:tt)*) $copy:tt) => {
        $crate::json_internal!(@object $object [$($key)+] ($crate::json_internal!($value)) , $($rest)*);
    };
    (@object $object:ident ($($key:tt)+) (: $value:expr) $copy:tt) => {
        $crate::json_internal!(@object $object [$($key)+] ($crate::json_internal!($value)));
    };
    (@object $object:ident ($($key:tt)*) ($tt:tt $($rest:tt)*) $copy:tt) => {
        $crate::json_internal!(@object $object ($($key)* $tt) ($($rest)*) ($($rest)*));
    };

    //////////////////////////////////////////////////////////////////////////
    // The main implementation.
    //////////////////////////////////////////////////////////////////////////
    (null) => {
        $crate::Value::Null
    };
    (true) => {
        $crate::Value::Bool(true)
    };
    (false) => {
        $crate::Value::Bool(false)
    };
    ([]) => {
        $crate::Value::Array(::std::vec::Vec::new())
    };
    ([ $($tt:tt)+ ]) => {
        $crate::Value::Array($crate::json_internal!(@array [] $($tt)+))
    };
    ({}) => {
        $crate::Value::Object($crate::Map::new())
    };
    ({ $($tt:tt)+ }) => {
        $crate::Value::Object({
            let mut object = $crate::Map::new();
            $crate::json_internal!(@object object () ($($tt)+) ($($tt)+));
            object
        })
    };
    ($other:expr) => {
        $crate::Value::from(&($other))
    };
}
