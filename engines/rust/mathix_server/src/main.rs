//! `mathix-server` — serveur HTTP + API persistante + moteurs Rust intégrés
//! (zéro dépendance externe, multi-thread `std::net::TcpListener`).
//! Aligne 1:1 ses routes `/api/auth`, `/api/sync`, `/api/events`, `/api/store/*`, `/api/health`
//! avec les fonctions Serverless Vercel + Upstash Redis (`/api/*`).

mod auth;
mod http;
mod media;
mod store;

use serde_json::{json, Value};
use std::env;
use std::fs;
use std::net::{TcpListener, TcpStream};
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::thread;
use std::time::Instant;

use auth::{
    authenticate_passcode, change_admin_passcode, claim_first_run, get_auth_status,
    refresh_admin_token, verify_admin_request, RateLimiter,
};
use http::{
    mime_for_path, read_request, safe_resolve_under, write_json, write_response, HttpRequest,
    ReadError,
};
use store::{
    is_admin_only_read_ns, is_admin_write_ns, is_valid_key, is_valid_ns, is_valid_student_id,
    Store,
};

const SERVER_VERSION: &str = "2.2.0";

struct AppState {
    vroot: PathBuf,
    public_dir: PathBuf,
    store: Store,
    rate_limiter: RateLimiter,
    started_at: Instant,
}

fn resolve_port() -> u16 {
    let parse_port = |key: &str| -> Option<u16> {
        env::var(key)
            .ok()
            .and_then(|s| s.trim().parse::<u16>().ok())
            .filter(|&p| p > 0)
    };
    if let Some(p) = parse_port("MATHIX_PORT") {
        return p;
    }
    let env_port = env::var("PORT").ok();
    let nginx_port = env::var("NGINX_PORT").ok();
    if let Some(ep) = env_port {
        if nginx_port.as_deref() != Some(ep.as_str()) {
            if let Ok(p) = ep.trim().parse::<u16>() {
                if p > 0 {
                    return p;
                }
            }
        }
    }
    parse_port("DEFAULT_APP_PORT").unwrap_or(3000)
}

fn resolve_root() -> PathBuf {
    if let Ok(custom) = env::var("MATHIX_ROOT") {
        let p = PathBuf::from(custom);
        if let Ok(c) = fs::canonicalize(&p) {
            return c;
        }
    }
    if let Ok(cwd) = env::current_dir() {
        if cwd.join("index.html").is_file() {
            return fs::canonicalize(&cwd).unwrap_or(cwd);
        }
    }
    if let Ok(exe) = env::current_exe() {
        if let Some(parent) = exe.parent().and_then(Path::parent) {
            if parent.join("index.html").is_file() {
                return fs::canonicalize(parent).unwrap_or_else(|_| parent.to_path_buf());
            }
        }
    }
    env::current_dir().unwrap_or_else(|_| PathBuf::from("."))
}

fn parse_json_body(body: &[u8]) -> Result<Value, &'static str> {
    if body.is_empty() {
        return Ok(json!({}));
    }
    let text = std::str::from_utf8(body).map_err(|_| "corps UTF-8 invalide")?;
    if text.trim().is_empty() {
        return Ok(json!({}));
    }
    serde_json::from_str(text).map_err(|_| "corps JSON invalide")
}

fn client_ip(stream: &TcpStream, req: &HttpRequest) -> String {
    if let Some(fwd) = req.headers.get("x-forwarded-for") {
        if let Some(first) = fwd.split(',').next() {
            let trimmed = first.trim();
            if !trimmed.is_empty() {
                return trimmed.to_string();
            }
        }
    }
    stream
        .peer_addr()
        .map(|a| a.ip().to_string())
        .unwrap_or_else(|_| "local".to_string())
}

fn serve_static(stream: &mut TcpStream, req: &HttpRequest, state: &AppState) {
    if req.pathname == "/admin" {
        write_response(
            stream,
            &req.method,
            301,
            None,
            &[],
            &[("Location", "/admin/")],
        );
        return;
    }

    let lookup_path = if req.pathname == "/admin/" {
        "/admin/index.html"
    } else {
        req.pathname.as_str()
    };

    if !is_allowed_static_path(lookup_path) {
        write_json(stream, &req.method, 403, &json!({ "error": "accès interdit" }).to_string());
        return;
    }

    let resolved = match safe_resolve_under(&state.vroot, lookup_path) {
        Ok(p) if p.is_file() => p,
        Err("traversée de chemin interdite" | "chemin hors racine interdit" | "octet nul interdit") => {
            write_json(stream, &req.method, 403, &json!({ "error": "interdit" }).to_string());
            return;
        }
        _ => match safe_resolve_under(&state.public_dir, lookup_path) {
            Ok(p) if p.is_file() => p,
            _ => {
            let accept = req.headers.get("accept").map(String::as_str).unwrap_or("");
            if accept.contains("text/html") {
                let nf = state.vroot.join("404.html");
                if let Ok(bytes) = fs::read(&nf) {
                    write_response(
                        stream,
                        &req.method,
                        404,
                        Some("text/html; charset=utf-8"),
                        &bytes,
                        &[("Cache-Control", "no-cache")],
                    );
                    return;
                }
            }
            write_json(
                stream,
                &req.method,
                404,
                &json!({ "error": format!("fichier introuvable : {}", req.pathname) }).to_string(),
            );
            return;
            }
        },
    };

    let Ok(bytes) = fs::read(&resolved) else {
        write_json(
            stream,
            &req.method,
            404,
            &json!({ "error": format!("fichier introuvable : {}", req.pathname) }).to_string(),
        );
        return;
    };

    let mime = mime_for_path(&resolved);
    let ext = resolved
        .extension()
        .and_then(|e| e.to_str())
        .map(|s| s.to_ascii_lowercase())
        .unwrap_or_default();
    let cache = if ext == "woff2" {
        "public, max-age=31536000, immutable"
    } else {
        "no-cache"
    };

    let mut extra = vec![("Cache-Control", cache)];
    if req.pathname.starts_with("/admin") {
        extra.push(("X-Robots-Tag", "noindex, nofollow"));
    }

    write_response(stream, &req.method, 200, Some(mime), &bytes, &extra);
}

fn handle_api(stream: &mut TcpStream, req: &HttpRequest, state: &AppState) {
    let method = req.method.as_str();
    let pathname = req.pathname.as_str();

    // 1. Santé du serveur Rust + versions des moteurs intégrés + révisions
    if pathname == "/api/health" && (method == "GET" || method == "HEAD") {
        let math_info: Value = serde_json::from_str(&math_engine::dispatch(r#"{"op":"info"}"#))
            .unwrap_or_else(|_| json!({}));
        let json_info: Value = serde_json::from_str(&json_engine::dispatch(r#"{"op":"info"}"#))
            .unwrap_or_else(|_| json!({}));
        let (rev, pub_rev) = state.store.revisions();
        let payload = json!({
            "ok": true,
            "backend": "rust",
            "version": SERVER_VERSION,
            "persistence": "file",
            "rev": rev,
            "pubRev": pub_rev,
            "latencyMs": 0,
            "uptimeSec": state.started_at.elapsed().as_secs(),
            "engines": {
                "math": math_info.get("version").and_then(Value::as_str).unwrap_or("math_engine"),
                "json": json_info.get("version").and_then(Value::as_str).unwrap_or("json_engine"),
            }
        });
        write_json(stream, method, 200, &payload.to_string());
        return;
    }

    // 2. Authentification administrateur serveur (/api/auth)
    if pathname == "/api/auth" {
        if method == "GET" {
            let status = get_auth_status(req, &state.store);
            write_json(stream, method, 200, &status.to_string());
            return;
        }
        if method == "POST" {
            let ip = client_ip(stream, req);
            if let Err(retry_sec) = state.rate_limiter.check(&ip) {
                let mins = (retry_sec + 59) / 60;
                write_json(
                    stream,
                    method,
                    429,
                    &json!({
                        "ok": false,
                        "error": format!("Accès temporairement bloqué. Réessayez dans {mins} min."),
                        "retryAfterSec": retry_sec
                    })
                    .to_string(),
                );
                return;
            }
            let body = match parse_json_body(&req.body) {
                Ok(v) => v,
                Err(msg) => {
                    write_json(stream, method, 400, &json!({ "ok": false, "error": msg }).to_string());
                    return;
                }
            };
            let action = body.get("action").and_then(Value::as_str).unwrap_or("login");
            if action == "refresh" {
                match refresh_admin_token(req, &state.store) {
                    Ok((token, expires_at, mode)) => {
                        write_json(
                            stream,
                            method,
                            200,
                            &json!({
                                "ok": true,
                                "backend": "rust",
                                "persistence": "file",
                                "mode": mode,
                                "token": token,
                                "expiresAt": expires_at
                            })
                            .to_string(),
                        );
                    }
                    Err((status, msg)) => {
                        write_json(stream, method, status, &json!({ "ok": false, "error": msg }).to_string());
                    }
                }
                return;
            }
            if action == "change-passcode" {
                let current_pass = body
                    .get("currentPasscode")
                    .or_else(|| body.get("current"))
                    .and_then(Value::as_str)
                    .unwrap_or("");
                let new_pass = body
                    .get("newPasscode")
                    .or_else(|| body.get("passcode"))
                    .and_then(Value::as_str)
                    .unwrap_or("");
                match change_admin_passcode(req, current_pass, new_pass, &state.store) {
                    Ok((token, expires_at, mode)) => {
                        state.rate_limiter.clear(&ip);
                        state.store.log_event(
                            "admin-passcode-change",
                            "Code administrateur mis à jour",
                            "admin",
                        );
                        write_json(
                            stream,
                            method,
                            200,
                            &json!({
                                "ok": true,
                                "backend": "rust",
                                "persistence": "file",
                                "mode": mode,
                                "token": token,
                                "expiresAt": expires_at
                            })
                            .to_string(),
                        );
                    }
                    Err((status, msg)) => {
                        let (rem, lock_sec) = if status == 401 {
                            state.rate_limiter.record_failure(&ip)
                        } else {
                            (6, None)
                        };
                        let mut payload = json!({ "ok": false, "error": msg });
                        if status == 401 {
                            if let Some(m) = payload.as_object_mut() {
                                m.insert("remainingAttempts".into(), json!(rem));
                                if let Some(sec) = lock_sec {
                                    m.insert("retryAfterSec".into(), json!(sec));
                                }
                            }
                        }
                        write_json(stream, method, status, &payload.to_string());
                    }
                }
                return;
            }
            let pass = body
                .get("passcode")
                .or_else(|| body.get("pass"))
                .and_then(Value::as_str)
                .unwrap_or("");
            let res = if action == "claim" {
                claim_first_run(pass, &state.store)
            } else {
                authenticate_passcode(pass, &state.store)
            };
            match res {
                Ok((token, expires_at, mode)) => {
                    state.rate_limiter.clear(&ip);
                    state.store.log_event(
                        if action == "claim" { "admin-setup" } else { "admin-login" },
                        if action == "claim" {
                            "Accès administrateur initialisé"
                        } else {
                            "Connexion console administration"
                        },
                        "admin",
                    );
                    write_json(
                        stream,
                        method,
                        200,
                        &json!({
                            "ok": true,
                            "backend": "rust",
                            "persistence": "file",
                            "mode": mode,
                            "token": token,
                            "expiresAt": expires_at
                        })
                        .to_string(),
                    );
                }
                Err((status, msg)) => {
                    let (rem, lock_sec) = state.rate_limiter.record_failure(&ip);
                    let payload = if let Some(sec) = lock_sec {
                        json!({
                            "ok": false,
                            "error": msg,
                            "remainingAttempts": rem,
                            "retryAfterSec": sec
                        })
                    } else {
                        json!({
                            "ok": false,
                            "error": msg,
                            "remainingAttempts": rem
                        })
                    };
                    write_json(stream, method, status, &payload.to_string());
                }
            }
            return;
        }
        if method == "DELETE" {
            let revoked = auth::revoke_admin_request(req, &state.store);
            if revoked {
                state.store.log_event("admin-logout", "Déconnexion console administration", "admin");
            }
            write_json(stream, method, 200, &json!({ "ok": true, "revoked": revoked }).to_string());
            return;
        }
        write_json(stream, method, 405, &json!({ "error": "méthode non autorisée" }).to_string());
        return;
    }

    // 3. Synchronisation bidirectionnelle (CRDT + révisions + séparation rôles)
    if pathname == "/api/sync" {
        if method == "GET" {
            let scope = req.query.get("scope").map(String::as_str).unwrap_or("student");
            let since = req
                .query
                .get("since")
                .and_then(|s| s.parse::<u64>().ok())
                .unwrap_or(0);
            let st_since = req
                .query
                .get("stSince")
                .and_then(|s| s.parse::<u64>().ok())
                .unwrap_or(0);
            let student_id = req.query.get("studentId").map(String::as_str).unwrap_or("");

            if scope == "admin" {
                if !verify_admin_request(req, &state.store) {
                    write_json(
                        stream,
                        method,
                        401,
                        &json!({ "ok": false, "error": "Authentification administrateur requise" }).to_string(),
                    );
                    return;
                }
                let snap = state.store.get_admin_sync(since);
                write_json(stream, method, 200, &snap.to_string());
                return;
            }

            let snap = state.store.get_student_sync(student_id, since, st_since);
            write_json(stream, method, 200, &snap.to_string());
            return;
        }
        if method == "POST" {
            let body = match parse_json_body(&req.body) {
                Ok(v) => v,
                Err(msg) => {
                    write_json(stream, method, 400, &json!({ "ok": false, "error": msg }).to_string());
                    return;
                }
            };
            let req_scope = body.get("scope").and_then(Value::as_str).unwrap_or("student");
            let touches_admin = body
                .get("namespaces")
                .and_then(Value::as_object)
                .map(|m| m.keys().any(|k| is_admin_write_ns(k)))
                .unwrap_or(false);

            if req_scope == "admin" || touches_admin {
                if !verify_admin_request(req, &state.store) {
                    write_json(
                        stream,
                        method,
                        403,
                        &json!({ "ok": false, "error": "Droits administrateur requis" }).to_string(),
                    );
                    return;
                }
                let snap = state.store.merge_admin_sync(&body);
                write_json(stream, method, 200, &snap.to_string());
                return;
            }

            let student_id = body
                .get("studentId")
                .and_then(Value::as_str)
                .unwrap_or("")
                .trim();
            if !is_valid_student_id(student_id) {
                write_json(
                    stream,
                    method,
                    400,
                    &json!({ "ok": false, "error": "Identifiant élève invalide" }).to_string(),
                );
                return;
            }
            let snap = state.store.merge_student_sync(student_id, &body);
            write_json(stream, method, 200, &snap.to_string());
            return;
        }
        write_json(stream, method, 405, &json!({ "error": "méthode non autorisée" }).to_string());
        return;
    }

    // 4. Journal d'événements
    if pathname == "/api/events" {
        if method == "GET" {
            if !verify_admin_request(req, &state.store) {
                write_json(
                    stream,
                    method,
                    401,
                    &json!({ "ok": false, "error": "Authentification administrateur requise" }).to_string(),
                );
                return;
            }
            write_json(stream, method, 200, &state.store.list_events().to_string());
            return;
        }
        if method == "POST" {
            let body = match parse_json_body(&req.body) {
                Ok(v) => v,
                Err(msg) => {
                    write_json(stream, method, 400, &json!({ "ok": false, "error": msg }).to_string());
                    return;
                }
            };
            let is_admin = verify_admin_request(req, &state.store);
            let ev_type = body.get("type").and_then(Value::as_str).unwrap_or("info");
            let message = body.get("message").and_then(Value::as_str).unwrap_or("");
            let actor = if is_admin {
                body.get("actor").and_then(Value::as_str).unwrap_or("admin")
            } else {
                "eleve"
            };
            state.store.log_event(ev_type, message, actor);
            write_json(stream, method, 200, &json!({ "ok": true, "persistence": "file" }).to_string());
            return;
        }
        write_json(stream, method, 405, &json!({ "error": "méthode non autorisée" }).to_string());
        return;
    }

    // 5. Médiathèque & import défensif natif Rust (écriture réservée Admin)
    if pathname == "/api/media" {
        if method == "GET" {
            if !verify_admin_request(req, &state.store) {
                write_json(
                    stream,
                    method,
                    401,
                    &json!({ "ok": false, "error": "Authentification administrateur requise" }).to_string(),
                );
                return;
            }
            let list = media::list_media(&state.public_dir);
            write_json(stream, method, 200, &list.to_string());
            return;
        }
        if method == "POST" {
            if !verify_admin_request(req, &state.store) {
                write_json(
                    stream,
                    method,
                    403,
                    &json!({ "ok": false, "error": "Droits administrateur requis" }).to_string(),
                );
                return;
            }
            if req.body.len() > 2 * 1024 * 1024 {
                write_json(stream, method, 413, &json!({ "error": "payload trop volumineux" }).to_string());
                return;
            }
            let body = match parse_json_body(&req.body) {
                Ok(v) => v,
                Err(msg) => {
                    write_json(stream, method, 400, &json!({ "ok": false, "error": msg }).to_string());
                    return;
                }
            };
            match media::upload_media(&state.public_dir, &body) {
                Ok((payload, url_path, bytes)) => {
                    let kb = (bytes + 512) / 1024;
                    state.store.log_event(
                        "media-upload",
                        &format!("Image importée : {url_path} ({kb} Ko)"),
                        "admin",
                    );
                    write_json(stream, method, 200, &payload.to_string());
                }
                Err((status, msg)) => {
                    write_json(stream, method, status, &json!({ "error": msg }).to_string());
                }
            }
            return;
        }
        write_json(stream, method, 405, &json!({ "error": "méthode non autorisée" }).to_string());
        return;
    }

    // 6. Audit Rust natif serveur (json_engine + math_engine in-process, réservé Admin)
    if pathname == "/api/rust/audit" && method == "POST" {
        if !verify_admin_request(req, &state.store) {
            write_json(
                stream,
                method,
                401,
                &json!({ "ok": false, "error": "Authentification administrateur requise" }).to_string(),
            );
            return;
        }
        let body = match parse_json_body(&req.body) {
            Ok(v) => v,
            Err(msg) => {
                write_json(stream, method, 400, &json!({ "ok": false, "error": msg }).to_string());
                return;
            }
        };
        let name = body.get("name").and_then(Value::as_str).unwrap_or("document.json");
        let doc = body.get("doc").or_else(|| body.get("json")).cloned().unwrap_or(Value::Null);
        let audit = json_engine::studio::op_studio_audit(&doc, name);
        write_json(stream, method, 200, &audit.to_string());
        return;
    }

    // 7. Store clé-valeur /api/store/:ns(/:key)
    if let Some(rest) = pathname.strip_prefix("/api/store/") {
        let mut parts = rest.splitn(2, '/');
        let ns = parts.next().unwrap_or("");
        let key_opt = parts.next().filter(|k| !k.is_empty());

        if !is_valid_ns(ns) {
            write_json(
                stream,
                method,
                404,
                &json!({ "error": format!("namespace inconnu : {ns}") }).to_string(),
            );
            return;
        }
        if let Some(k) = key_opt {
            if !is_valid_key(k) {
                write_json(stream, method, 400, &json!({ "error": "clé invalide" }).to_string());
                return;
            }
        }

        match method {
            "GET" => {
                if is_admin_only_read_ns(ns) && !verify_admin_request(req, &state.store) {
                    write_json(
                        stream,
                        method,
                        401,
                        &json!({ "ok": false, "error": "Authentification administrateur requise" }).to_string(),
                    );
                    return;
                }
                let res = state.store.get_store(ns, key_opt);
                write_json(stream, method, 200, &res.to_string());
                return;
            }
            "POST" => {
                if is_admin_write_ns(ns) && !verify_admin_request(req, &state.store) {
                    write_json(
                        stream,
                        method,
                        403,
                        &json!({ "ok": false, "error": "Droits administrateur requis" }).to_string(),
                    );
                    return;
                }
                let body = match parse_json_body(&req.body) {
                    Ok(v) => v,
                    Err(msg) => {
                        write_json(stream, method, 400, &json!({ "ok": false, "error": msg }).to_string());
                        return;
                    }
                };
                let key = body.get("key").and_then(Value::as_str).unwrap_or("");
                if !is_valid_key(key) {
                    write_json(stream, method, 400, &json!({ "error": "champ « key » requis ou invalide" }).to_string());
                    return;
                }
                let val = body.get("value").cloned().unwrap_or(Value::Null);
                let res = state.store.set_store(ns, key, val);
                write_json(stream, method, 200, &res.to_string());
                return;
            }
            "DELETE" => {
                if is_admin_write_ns(ns) && !verify_admin_request(req, &state.store) {
                    write_json(
                        stream,
                        method,
                        403,
                        &json!({ "ok": false, "error": "Droits administrateur requis" }).to_string(),
                    );
                    return;
                }
                let Some(k) = key_opt else {
                    write_json(stream, method, 400, &json!({ "error": "clé requise" }).to_string());
                    return;
                };
                let res = state.store.delete_store(ns, k);
                write_json(stream, method, 200, &res.to_string());
                return;
            }
            _ => {
                write_json(stream, method, 405, &json!({ "error": "méthode non autorisée" }).to_string());
                return;
            }
        }
    }

    write_json(
        stream,
        method,
        404,
        &json!({ "error": format!("route API inconnue : {pathname}") }).to_string(),
    );
}

fn handle_client(mut stream: TcpStream, state: Arc<AppState>) {
    let req = match read_request(&mut stream) {
        Ok(r) => r,
        Err(ReadError::Empty) => return,
        Err(ReadError::BadRequest(msg)) => {
            write_json(&mut stream, "GET", 400, &json!({ "error": msg }).to_string());
            return;
        }
        Err(ReadError::PayloadTooLarge) => {
            write_json(&mut stream, "GET", 413, &json!({ "error": "payload trop volumineux" }).to_string());
            return;
        }
    };

    if req.pathname.starts_with("/api/") {
        handle_api(&mut stream, &req, &state);
        return;
    }

    if req.method != "GET" && req.method != "HEAD" {
        write_json(&mut stream, &req.method, 405, &json!({ "error": "méthode non autorisée" }).to_string());
        return;
    }

    serve_static(&mut stream, &req, &state);
}

fn main() {
    let vroot = resolve_root();
    let public_dir = vroot.join("public");
    let data_dir = env::var("MATHIX_DATA_DIR")
        .ok()
        .filter(|s| !s.trim().is_empty())
        .map(PathBuf::from)
        .unwrap_or_else(|| vroot.join("server").join("data"));
    let host = env::var("MATHIX_HOST")
        .or_else(|_| env::var("HOST"))
        .unwrap_or_else(|_| "0.0.0.0".to_string());
    let port = resolve_port();

    let store = Store::open(data_dir);
    let db_display = store.db_path_display();
    let state = Arc::new(AppState {
        vroot,
        public_dir,
        store,
        rate_limiter: RateLimiter::new(),
        started_at: Instant::now(),
    });

    let addr = format!("{host}:{port}");
    let listener = match TcpListener::bind(&addr) {
        Ok(l) => l,
        Err(err) => {
            eprintln!("[mathix-server] échec d'écoute sur http://{addr} : {err}");
            std::process::exit(1);
        }
    };

    println!("mathPlus backend Rust ({SERVER_VERSION}) + static → http://{addr}");
    println!("persistance : {db_display}");

    for incoming in listener.incoming() {
        let Ok(stream) = incoming else { continue };
        let st = Arc::clone(&state);
        thread::spawn(move || handle_client(stream, st));
    }
}

/// Liste blanche stricte des ressources statiques publiques (bloque /server/*, .env, sources Rust, scripts).
fn is_allowed_static_path(pathname: &str) -> bool {
    if pathname.contains("/.") || pathname.starts_with("/.") {
        return false;
    }
    if matches!(
        pathname,
        "/" | "/index.html"
            | "/404.html"
            | "/sw.js"
            | "/manifest.webmanifest"
            | "/robots.txt"
            | "/favicon.svg"
            | "/icon-maskable.svg"
            | "/logo.png"
            | "/admin/index.html"
            | "/engines/mathix_app.wasm"
            | "/engines/mathix_admin.wasm"
            | "/engines/math_engine.wasm"
            | "/engines/json_engine.wasm"
    ) {
        return true;
    }
    pathname.starts_with("/assets/")
        || pathname.starts_with("/public/")
        || pathname.starts_with("/vendor/")
        || pathname.starts_with("/data/")
        || pathname.starts_with("/images/")
}

#[cfg(test)]
mod static_guard_tests {
    use super::is_allowed_static_path;

    #[test]
    fn blocks_sensitive_server_and_dotfile_paths() {
        assert!(!is_allowed_static_path("/server/data/db.json"));
        assert!(!is_allowed_static_path("/.env"));
        assert!(!is_allowed_static_path("/package.json"));
        assert!(!is_allowed_static_path("/engines/rust/mathix_server/src/auth.rs"));
        assert!(!is_allowed_static_path("/api/_auth.js"));
        assert!(is_allowed_static_path("/"));
        assert!(is_allowed_static_path("/admin/index.html"));
        assert!(is_allowed_static_path("/assets/min/app.min.css"));
        assert!(is_allowed_static_path("/engines/mathix_app.wasm"));
        assert!(is_allowed_static_path("/public/data/manifest.json"));
    }
}
