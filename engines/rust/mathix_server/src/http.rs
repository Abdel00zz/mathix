//! Couche HTTP/1.1 légère, zéro dépendance externe, avec confinement strict des chemins.

use std::collections::BTreeMap;
use std::io::{Read, Write};
use std::net::TcpStream;
use std::path::{Component, Path, PathBuf};
use std::time::Duration;

pub const MAX_HEADER_BYTES: usize = 64 * 1024;
pub const MAX_BODY_BYTES: usize = 4 * 1024 * 1024;

pub struct HttpRequest {
    pub method: String,
    pub pathname: String,
    pub query: BTreeMap<String, String>,
    pub headers: BTreeMap<String, String>,
    pub body: Vec<u8>,
}

pub enum ReadError {
    Empty,
    BadRequest(&'static str),
    PayloadTooLarge,
}

fn hex_val(b: u8) -> Option<u8> {
    match b {
        b'0'..=b'9' => Some(b - b'0'),
        b'a'..=b'f' => Some(b - b'a' + 10),
        b'A'..=b'F' => Some(b - b'A' + 10),
        _ => None,
    }
}

pub fn percent_decode(raw: &str) -> String {
    let bytes = raw.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            if let (Some(h), Some(l)) = (hex_val(bytes[i + 1]), hex_val(bytes[i + 2])) {
                out.push((h << 4) | l);
                i += 3;
                continue;
            }
        }
        out.push(bytes[i]);
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

fn parse_query(raw: &str) -> BTreeMap<String, String> {
    let mut map = BTreeMap::new();
    for pair in raw.split('&') {
        if pair.is_empty() {
            continue;
        }
        let (k, v) = pair.split_once('=').unwrap_or((pair, ""));
        let key = percent_decode(&k.replace('+', " "));
        let val = percent_decode(&v.replace('+', " "));
        if !key.is_empty() {
            map.insert(key, val);
        }
    }
    map
}

pub fn read_request(stream: &mut TcpStream) -> Result<HttpRequest, ReadError> {
    let _ = stream.set_read_timeout(Some(Duration::from_secs(15)));
    let _ = stream.set_write_timeout(Some(Duration::from_secs(15)));

    let mut buf = Vec::with_capacity(4096);
    let mut chunk = [0u8; 4096];
    let header_end;

    loop {
        if let Some(pos) = buf.windows(4).position(|w| w == b"\r\n\r\n") {
            header_end = pos + 4;
            break;
        }
        if buf.len() > MAX_HEADER_BYTES {
            return Err(ReadError::BadRequest("en-têtes trop volumineux"));
        }
        match stream.read(&mut chunk) {
            Ok(0) => {
                if buf.is_empty() {
                    return Err(ReadError::Empty);
                }
                return Err(ReadError::BadRequest("requête incomplète"));
            }
            Ok(n) => buf.extend_from_slice(&chunk[..n]),
            Err(_) => return Err(ReadError::Empty),
        }
    }

    let head_str = std::str::from_utf8(&buf[..header_end - 4])
        .map_err(|_| ReadError::BadRequest("en-têtes UTF-8 invalides"))?;
    let mut lines = head_str.split("\r\n");
    let request_line = lines.next().ok_or(ReadError::BadRequest("ligne de requête manquante"))?;
    let mut parts = request_line.split_whitespace();
    let method = parts.next().ok_or(ReadError::BadRequest("méthode manquante"))?.to_uppercase();
    let target = parts.next().ok_or(ReadError::BadRequest("cible manquante"))?;
    let (raw_path, raw_query) = target.split_once('?').unwrap_or((target, ""));
    let pathname = percent_decode(raw_path);
    let query = parse_query(raw_query);

    let mut headers = BTreeMap::new();
    for line in lines {
        if let Some((k, v)) = line.split_once(':') {
            headers.insert(k.trim().to_ascii_lowercase(), v.trim().to_string());
        }
    }

    let content_len = headers
        .get("content-length")
        .and_then(|s| s.parse::<usize>().ok())
        .unwrap_or(0);
    if content_len > MAX_BODY_BYTES {
        return Err(ReadError::PayloadTooLarge);
    }

    let mut body = buf[header_end..].to_vec();
    while body.len() < content_len {
        let need = (content_len - body.len()).min(chunk.len());
        match stream.read(&mut chunk[..need]) {
            Ok(0) => break,
            Ok(n) => body.extend_from_slice(&chunk[..n]),
            Err(_) => break,
        }
    }
    body.truncate(content_len);

    Ok(HttpRequest {
        method,
        pathname,
        query,
        headers,
        body,
    })
}

fn status_reason(status: u16) -> &'static str {
    match status {
        200 => "OK",
        301 => "Moved Permanently",
        400 => "Bad Request",
        401 => "Unauthorized",
        403 => "Forbidden",
        404 => "Not Found",
        405 => "Method Not Allowed",
        409 => "Conflict",
        413 => "Payload Too Large",
        429 => "Too Many Requests",
        500 => "Internal Server Error",
        503 => "Service Unavailable",
        _ => "OK",
    }
}

pub fn write_response(
    stream: &mut TcpStream,
    method: &str,
    status: u16,
    content_type: Option<&str>,
    body: &[u8],
    extra_headers: &[(&str, &str)],
) {
    let mut head = format!(
        "HTTP/1.1 {} {}\r\n\
         X-Content-Type-Options: nosniff\r\n\
         Referrer-Policy: strict-origin-when-cross-origin\r\n\
         Permissions-Policy: camera=(), microphone=(), geolocation=()\r\n\
         Content-Length: {}\r\n\
         Connection: close\r\n",
        status,
        status_reason(status),
        body.len()
    );
    if let Some(ct) = content_type {
        head.push_str(&format!("Content-Type: {ct}\r\n"));
    }
    for (k, v) in extra_headers {
        head.push_str(&format!("{k}: {v}\r\n"));
    }
    head.push_str("\r\n");

    let _ = stream.write_all(head.as_bytes());
    if method != "HEAD" && !body.is_empty() {
        let _ = stream.write_all(body);
    }
    let _ = stream.flush();
}

pub fn write_json(stream: &mut TcpStream, method: &str, status: u16, body: &str) {
    write_response(
        stream,
        method,
        status,
        Some("application/json; charset=utf-8"),
        body.as_bytes(),
        &[("Cache-Control", "no-store")],
    );
}

pub fn mime_for_path(path: &Path) -> &'static str {
    let ext = path
        .extension()
        .and_then(|e| e.to_str())
        .map(|s| s.to_ascii_lowercase())
        .unwrap_or_default();
    match ext.as_str() {
        "html" => "text/html; charset=utf-8",
        "js" | "mjs" => "text/javascript; charset=utf-8",
        "css" => "text/css; charset=utf-8",
        "json" => "application/json; charset=utf-8",
        "wasm" => "application/wasm",
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "webp" => "image/webp",
        "gif" => "image/gif",
        "svg" => "image/svg+xml",
        "woff" => "font/woff",
        "woff2" => "font/woff2",
        "ttf" => "font/ttf",
        "ico" => "image/x-icon",
        "txt" => "text/plain; charset=utf-8",
        "webmanifest" => "application/manifest+json; charset=utf-8",
        "md" => "text/markdown; charset=utf-8",
        _ => "application/octet-stream",
    }
}

/// Résout un chemin relatif de façon strictement confinée dans `root_canon`.
/// Rejette tout segment `..`, octet nul, chemin absolu ou lien symbolique sortant.
pub fn safe_resolve_under(root_canon: &Path, pathname: &str) -> Result<PathBuf, &'static str> {
    if pathname.bytes().any(|b| b == 0) {
        return Err("octet nul interdit");
    }
    let trimmed = pathname.trim_start_matches('/');
    let rel = if trimmed.is_empty() { "index.html" } else { trimmed };

    let mut clean = PathBuf::new();
    for comp in Path::new(rel).components() {
        match comp {
            Component::Normal(part) => clean.push(part),
            Component::CurDir => {}
            Component::ParentDir | Component::RootDir | Component::Prefix(_) => {
                return Err("traversée de chemin interdite");
            }
        }
    }

    let candidate = root_canon.join(clean);
    let canon = std::fs::canonicalize(&candidate).map_err(|_| "introuvable")?;
    if !canon.starts_with(root_canon) {
        return Err("chemin hors racine interdit");
    }
    Ok(canon)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn decodes_percent_encoding_and_blocks_traversal() {
        assert_eq!(percent_decode("/data/a%20b%2Fc.json"), "/data/a b/c.json");
        let root = std::env::temp_dir().canonicalize().unwrap();
        assert!(safe_resolve_under(&root, "/../etc/passwd").is_err());
        assert!(safe_resolve_under(&root, "/foo\0bar").is_err());
    }
}
