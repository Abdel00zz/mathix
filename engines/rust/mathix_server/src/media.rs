//! Gestionnaire de médias natif Rust : inventaire `public/` + import défensif
//! (décodage base64 pur Rust, validation par octets magiques, confinement d'écriture).

use serde_json::{json, Value};
use std::fs;
use std::path::{Path, PathBuf};

use crate::store::now_ms;

const MAX_UPLOAD_BYTES: usize = 750 * 1024;
const IMG_EXTS: &[&str] = &["png", "jpg", "jpeg", "webp", "svg", "gif"];

pub fn list_media(public_dir: &Path) -> Value {
    let mut files: Vec<(String, String, String, u64)> = Vec::new();
    walk_media(public_dir, public_dir, &mut files);
    files.sort_by(|a, b| a.2.cmp(&b.2).then_with(|| a.1.cmp(&b.1)));

    let list: Vec<Value> = files
        .into_iter()
        .map(|(url, name, folder, size)| {
            json!({
                "url": url,
                "name": name,
                "folder": folder,
                "size": size,
            })
        })
        .collect();
    json!({ "ok": true, "files": list })
}

fn walk_media(public_root: &Path, dir: &Path, out: &mut Vec<(String, String, String, u64)>) {
    let Ok(entries) = fs::read_dir(dir) else {
        return;
    };
    for ent in entries.flatten() {
        let path = ent.path();
        if path.is_dir() {
            if path.file_name().and_then(|n| n.to_str()) == Some("aistudio") {
                continue;
            }
            walk_media(public_root, &path, out);
            continue;
        }
        let Some(name) = path.file_name().and_then(|n| n.to_str()) else {
            continue;
        };
        let lower_name = name.to_ascii_lowercase();
        if lower_name.starts_with("favicon")
            || lower_name.starts_with("icon-")
            || lower_name.starts_with("logo")
        {
            continue;
        }
        let ext = path
            .extension()
            .and_then(|e| e.to_str())
            .map(|s| s.to_ascii_lowercase())
            .unwrap_or_default();
        if !IMG_EXTS.contains(&ext.as_str()) {
            continue;
        }
        let Ok(rel_path) = path.strip_prefix(public_root) else {
            continue;
        };
        let rel = rel_path.to_string_lossy().replace('\\', "/");
        let folder = rel_path
            .parent()
            .map(|p| {
                let s = p.to_string_lossy().replace('\\', "/");
                if s.is_empty() { ".".to_string() } else { s }
            })
            .unwrap_or_else(|| ".".to_string());
        let size = fs::metadata(&path).map(|m| m.len()).unwrap_or(0);
        out.push((format!("/{rel}"), name.to_string(), folder, size));
    }
}

pub fn decode_base64(input: &str) -> Result<Vec<u8>, &'static str> {
    let mut out = Vec::with_capacity(input.len() * 3 / 4);
    let mut quad = [0u8; 4];
    let mut qlen = 0usize;
    let mut pad = 0usize;

    for b in input.bytes() {
        if b.is_ascii_whitespace() {
            continue;
        }
        if b == b'=' {
            pad += 1;
            quad[qlen] = 0;
            qlen += 1;
        } else {
            if pad > 0 {
                return Err("padding base64 invalide");
            }
            let val = match b {
                b'A'..=b'Z' => b - b'A',
                b'a'..=b'z' => b - b'a' + 26,
                b'0'..=b'9' => b - b'0' + 52,
                b'+' => 62,
                b'/' => 63,
                _ => return Err("caractère base64 invalide"),
            };
            quad[qlen] = val;
            qlen += 1;
        }
        if qlen == 4 {
            out.push((quad[0] << 2) | (quad[1] >> 4));
            if pad < 2 {
                out.push((quad[1] << 4) | (quad[2] >> 2));
            }
            if pad < 1 {
                out.push((quad[2] << 6) | quad[3]);
            }
            qlen = 0;
            pad = 0;
        }
    }
    if qlen != 0 {
        return Err("longueur base64 invalide");
    }
    Ok(out)
}

fn to_base36(mut n: u64) -> String {
    const DIGITS: &[u8] = b"0123456789abcdefghijklmnopqrstuvwxyz";
    if n == 0 {
        return "0".to_string();
    }
    let mut buf = Vec::new();
    while n > 0 {
        buf.push(DIGITS[(n % 36) as usize] as char);
        n /= 36;
    }
    buf.into_iter().rev().collect()
}

pub fn upload_media(public_dir: &Path, body: &Value) -> Result<(Value, String, usize), (u16, &'static str)> {
    let data_url = body.get("dataUrl").and_then(Value::as_str).unwrap_or("");
    let rest = data_url
        .strip_prefix("data:")
        .ok_or((400, "dataUrl image invalide (WebP, PNG, JPEG ou GIF attendu)"))?;
    let (meta, b64) = rest
        .split_once(";base64,")
        .ok_or((400, "dataUrl image invalide (WebP, PNG, JPEG ou GIF attendu)"))?;

    let (expected_fmt, ext) = match meta {
        "image/webp" => ("webp", "webp"),
        "image/png" => ("png", "png"),
        "image/jpeg" => ("jpeg", "jpg"),
        "image/gif" => ("gif", "gif"),
        _ => return Err((400, "dataUrl image invalide (WebP, PNG, JPEG ou GIF attendu)")),
    };

    let raw_bytes = decode_base64(b64).map_err(|_| (400, "encodage base64 invalide"))?;
    if raw_bytes.is_empty() || raw_bytes.len() > MAX_UPLOAD_BYTES {
        return Err((413, "Image trop volumineuse (max 750 Ko après compression)"));
    }

    // Vérification défensive par octets magiques réels (via json_engine::domain)
    let detected = json_engine::domain::sniff_format_bytes(&raw_bytes);
    if detected != Some(expected_fmt) {
        return Err((400, "Signature binaire incohérente avec le format image déclaré"));
    }

    let raw_name = body.get("filename").and_then(Value::as_str).unwrap_or("figure");
    let stem = raw_name.rsplit_once('.').map(|(s, _)| s).unwrap_or(raw_name);
    let slug_res = json_engine::studio::op_studio_slugify(&json!({ "text": stem }));
    let mut slug = slug_res
        .get("slug")
        .and_then(Value::as_str)
        .unwrap_or("figure")
        .to_string();
    if slug.len() > 48 {
        slug.truncate(48);
    }
    if slug.is_empty() || slug == "nouveau" {
        slug = "figure".to_string();
    }

    let upload_dir: PathBuf = public_dir.join("images").join("uploads");
    fs::create_dir_all(&upload_dir).map_err(|_| (500, "création du dossier uploads impossible"))?;
    let upload_canon = fs::canonicalize(&upload_dir).map_err(|_| (500, "dossier uploads inaccessible"))?;

    let file_name = format!("{}-{}.{}", to_base36(now_ms()), slug, ext);
    let target_file = upload_canon.join(&file_name);
    if target_file.parent() != Some(upload_canon.as_path()) {
        return Err((403, "chemin interdit"));
    }

    fs::write(&target_file, &raw_bytes).map_err(|_| (500, "écriture image impossible"))?;
    let url_path = format!("/images/uploads/{file_name}");

    let mut payload = serde_json::Map::new();
    payload.insert("ok".to_string(), Value::Bool(true));
    payload.insert("url".to_string(), Value::String(url_path.clone()));
    payload.insert("bytes".to_string(), json!(raw_bytes.len()));
    if let Some(w) = body.get("width").and_then(Value::as_u64) {
        if w > 0 {
            payload.insert("width".to_string(), json!(w));
        }
    }
    if let Some(h) = body.get("height").and_then(Value::as_u64) {
        if h > 0 {
            payload.insert("height".to_string(), json!(h));
        }
    }

    Ok((Value::Object(payload), url_path, raw_bytes.len()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn decodes_base64_and_rejects_fake_png_magic() {
        let b = decode_base64("SGVsbG8=").unwrap();
        assert_eq!(b, b"Hello");
        let dir = std::env::temp_dir();
        let bad = upload_media(&dir, &json!({
            "dataUrl": "data:image/png;base64,SGVsbG8=",
            "filename": "fake.png"
        }));
        assert!(matches!(bad, Err((400, _))));
    }
}
