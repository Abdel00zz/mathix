//! Authentification serveur zéro dépendance (SHA-256, HMAC-SHA256, PBKDF2-HMAC-SHA256,
//! jetons Bearer signés, comparaison à temps constant et anti-force-brute).

use serde_json::{json, Value};
use std::collections::HashMap;
use std::env;
use std::fs::File;
use std::io::Read;
use std::sync::{Mutex, OnceLock};

use crate::http::HttpRequest;
use crate::store::{now_ms, Store};

const TOKEN_TTL_MS: u64 = 4 * 60 * 60 * 1000;
const RATE_WINDOW_MS: u64 = 5 * 60 * 1000;
const RATE_LOCKOUT_MS: u64 = 15 * 60 * 1000;
const RATE_MAX_ATTEMPTS: usize = 6;
const PBKDF2_ROUNDS_LEGACY: u32 = 25_000;
const PBKDF2_ROUNDS: u32 = 100_000;

static REVOKED_JTIS: OnceLock<Mutex<HashMap<String, u64>>> = OnceLock::new();

fn revoked_store() -> &'static Mutex<HashMap<String, u64>> {
    REVOKED_JTIS.get_or_init(|| Mutex::new(HashMap::new()))
}

struct RateEntry {
    failures: Vec<u64>,
    locked_until: u64,
}

pub struct RateLimiter {
    entries: Mutex<HashMap<String, RateEntry>>,
}

impl RateLimiter {
    pub fn new() -> Self {
        Self {
            entries: Mutex::new(HashMap::new()),
        }
    }

    pub fn check(&self, ip: &str) -> Result<usize, u64> {
        let now = now_ms();
        let mut guard = self.entries.lock().unwrap();
        let entry = guard.entry(ip.to_string()).or_insert_with(|| RateEntry {
            failures: Vec::new(),
            locked_until: 0,
        });
        if entry.locked_until > now {
            let rem_sec = (entry.locked_until - now + 999) / 1000;
            return Err(rem_sec.max(1));
        }
        entry.locked_until = 0;
        entry.failures.retain(|&t| now.saturating_sub(t) < RATE_WINDOW_MS);
        let used = entry.failures.len();
        if used >= RATE_MAX_ATTEMPTS {
            entry.locked_until = now.saturating_add(RATE_LOCKOUT_MS);
            return Err(RATE_LOCKOUT_MS / 1000);
        }
        Ok(RATE_MAX_ATTEMPTS - used)
    }

    pub fn record_failure(&self, ip: &str) -> (usize, Option<u64>) {
        let now = now_ms();
        let mut guard = self.entries.lock().unwrap();
        let entry = guard.entry(ip.to_string()).or_insert_with(|| RateEntry {
            failures: Vec::new(),
            locked_until: 0,
        });
        entry.failures.retain(|&t| now.saturating_sub(t) < RATE_WINDOW_MS);
        entry.failures.push(now);
        if entry.failures.len() >= RATE_MAX_ATTEMPTS {
            entry.locked_until = now.saturating_add(RATE_LOCKOUT_MS);
            (0, Some(RATE_LOCKOUT_MS / 1000))
        } else {
            (RATE_MAX_ATTEMPTS - entry.failures.len(), None)
        }
    }

    pub fn clear(&self, ip: &str) {
        let mut guard = self.entries.lock().unwrap();
        guard.remove(ip);
    }
}

/* ── SHA-256 & HMAC-SHA256 (FIPS 180-4 / RFC 2104, zéro crate externe) ──── */

const K256: [u32; 64] = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
];

fn sha256(data: &[u8]) -> [u8; 32] {
    let mut h: [u32; 8] = [
        0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
        0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
    ];
    let bit_len = (data.len() as u64).wrapping_mul(8);
    let mut msg = Vec::with_capacity(((data.len() + 9 + 63) / 64) * 64);
    msg.extend_from_slice(data);
    msg.push(0x80);
    while (msg.len() % 64) != 56 {
        msg.push(0);
    }
    msg.extend_from_slice(&bit_len.to_be_bytes());

    let mut w = [0u32; 64];
    for chunk in msg.chunks_exact(64) {
        for i in 0..16 {
            w[i] = u32::from_be_bytes([
                chunk[i * 4],
                chunk[i * 4 + 1],
                chunk[i * 4 + 2],
                chunk[i * 4 + 3],
            ]);
        }
        for i in 16..64 {
            let s0 = w[i - 15].rotate_right(7) ^ w[i - 15].rotate_right(18) ^ (w[i - 15] >> 3);
            let s1 = w[i - 2].rotate_right(17) ^ w[i - 2].rotate_right(19) ^ (w[i - 2] >> 10);
            w[i] = w[i - 16].wrapping_add(s0).wrapping_add(w[i - 7]).wrapping_add(s1);
        }
        let [mut a, mut b, mut c, mut d, mut e, mut f, mut g, mut hh] = h;
        for i in 0..64 {
            let s1 = e.rotate_right(6) ^ e.rotate_right(11) ^ e.rotate_right(25);
            let ch = (e & f) ^ ((!e) & g);
            let temp1 = hh
                .wrapping_add(s1)
                .wrapping_add(ch)
                .wrapping_add(K256[i])
                .wrapping_add(w[i]);
            let s0 = a.rotate_right(2) ^ a.rotate_right(13) ^ a.rotate_right(22);
            let maj = (a & b) ^ (a & c) ^ (b & c);
            let temp2 = s0.wrapping_add(maj);

            hh = g;
            g = f;
            f = e;
            e = d.wrapping_add(temp1);
            d = c;
            c = b;
            b = a;
            a = temp1.wrapping_add(temp2);
        }
        h[0] = h[0].wrapping_add(a);
        h[1] = h[1].wrapping_add(b);
        h[2] = h[2].wrapping_add(c);
        h[3] = h[3].wrapping_add(d);
        h[4] = h[4].wrapping_add(e);
        h[5] = h[5].wrapping_add(f);
        h[6] = h[6].wrapping_add(g);
        h[7] = h[7].wrapping_add(hh);
    }

    let mut out = [0u8; 32];
    for (i, word) in h.iter().enumerate() {
        out[i * 4..i * 4 + 4].copy_from_slice(&word.to_be_bytes());
    }
    out
}

fn hmac_sha256(key: &[u8], msg: &[u8]) -> [u8; 32] {
    let mut k_block = [0u8; 64];
    if key.len() > 64 {
        let hashed = sha256(key);
        k_block[..32].copy_from_slice(&hashed);
    } else {
        k_block[..key.len()].copy_from_slice(key);
    }
    let mut ipad = [0x36u8; 64];
    let mut opad = [0x5cu8; 64];
    for i in 0..64 {
        ipad[i] ^= k_block[i];
        opad[i] ^= k_block[i];
    }
    let mut inner = Vec::with_capacity(64 + msg.len());
    inner.extend_from_slice(&ipad);
    inner.extend_from_slice(msg);
    let inner_hash = sha256(&inner);

    let mut outer = Vec::with_capacity(64 + 32);
    outer.extend_from_slice(&opad);
    outer.extend_from_slice(&inner_hash);
    sha256(&outer)
}

fn pbkdf2_hmac_sha256(password: &[u8], salt: &[u8], rounds: u32) -> [u8; 32] {
    let mut salt_blk = Vec::with_capacity(salt.len() + 4);
    salt_blk.extend_from_slice(salt);
    salt_blk.extend_from_slice(&1u32.to_be_bytes());
    let mut u = hmac_sha256(password, &salt_blk);
    let mut acc = u;
    for _ in 1..rounds {
        u = hmac_sha256(password, &u);
        for i in 0..32 {
            acc[i] ^= u[i];
        }
    }
    acc
}

fn ct_eq(a: &[u8], b: &[u8]) -> bool {
    if a.len() != b.len() {
        return false;
    }
    let mut diff = 0u8;
    for i in 0..a.len() {
        diff |= a[i] ^ b[i];
    }
    diff == 0
}

fn to_hex(bytes: &[u8]) -> String {
    const HEX: &[u8; 16] = b"0123456789abcdef";
    let mut out = String::with_capacity(bytes.len() * 2);
    for &b in bytes {
        out.push(HEX[(b >> 4) as usize] as char);
        out.push(HEX[(b & 0x0f) as usize] as char);
    }
    out
}

fn from_hex(s: &str) -> Option<Vec<u8>> {
    let bytes = s.as_bytes();
    if bytes.len() % 2 != 0 {
        return None;
    }
    let mut out = Vec::with_capacity(bytes.len() / 2);
    for pair in bytes.chunks_exact(2) {
        let hi = hex_nibble(pair[0])?;
        let lo = hex_nibble(pair[1])?;
        out.push((hi << 4) | lo);
    }
    Some(out)
}

fn hex_nibble(b: u8) -> Option<u8> {
    match b {
        b'0'..=b'9' => Some(b - b'0'),
        b'a'..=b'f' => Some(b - b'a' + 10),
        b'A'..=b'F' => Some(b - b'A' + 10),
        _ => None,
    }
}

fn random_hex(num_bytes: usize) -> String {
    let mut buf = vec![0u8; num_bytes];
    if let Ok(mut f) = File::open("/dev/urandom") {
        if f.read_exact(&mut buf).is_ok() {
            return to_hex(&buf);
        }
    }
    use std::collections::hash_map::RandomState;
    use std::hash::{BuildHasher, Hasher};
    let mut out = Vec::with_capacity(num_bytes);
    let mut counter = 0u64;
    while out.len() < num_bytes {
        let mut s1 = RandomState::new().build_hasher();
        s1.write_u64(now_ms());
        s1.write_u64(counter);
        let mut s2 = RandomState::new().build_hasher();
        s2.write_u32(std::process::id());
        let seed = format!("{:016x}:{:016x}:{}:mathix-os-rng", s1.finish(), s2.finish(), counter);
        let h = sha256(seed.as_bytes());
        out.extend_from_slice(&h);
        counter = counter.wrapping_add(1);
    }
    out.truncate(num_bytes);
    to_hex(&out)
}

fn resolve_signing_secret(store: &Store) -> String {
    if let Ok(sec) = env::var("AUTH_SECRET") {
        let s = sec.trim().to_string();
        if s.len() >= 16 {
            return s;
        }
    }
    if let Ok(pass) = env::var("ADMIN_PASSCODE") {
        let p = pass.trim();
        if !p.is_empty() {
            return to_hex(&hmac_sha256(b"mathix-signing-key-v2", p.as_bytes()));
        }
    }
    store.get_or_create_token_secret(|| random_hex(32))
}

fn is_jti_revoked(jti: &str, now: u64) -> bool {
    let mut guard = revoked_store().lock().unwrap();
    guard.retain(|_, exp| *exp > now);
    guard.contains_key(jti)
}

fn revoke_jti(jti: String, exp: u64) {
    let now = now_ms();
    let mut guard = revoked_store().lock().unwrap();
    guard.retain(|_, e| *e > now);
    if exp > now {
        guard.insert(jti, exp);
    }
}

pub fn issue_admin_token(store: &Store) -> (String, u64) {
    let secret = resolve_signing_secret(store);
    let iat = now_ms();
    let exp = iat.saturating_add(TOKEN_TTL_MS);
    let jti = random_hex(16);
    let payload_json = json!({ "role": "admin", "iat": iat, "exp": exp, "jti": jti }).to_string();
    let payload_hex = to_hex(payload_json.as_bytes());
    let sig_hex = to_hex(&hmac_sha256(secret.as_bytes(), payload_hex.as_bytes()));
    (format!("{payload_hex}.{sig_hex}"), exp)
}

fn decode_verified_payload(req: &HttpRequest, store: &Store) -> Option<Value> {
    let header = req.headers.get("authorization")?;
    let token = header.strip_prefix("Bearer ").map(str::trim)?;
    let (payload_hex, sig_hex) = token.split_once('.')?;
    if payload_hex.is_empty() || sig_hex.len() != 64 {
        return None;
    }
    let secret = resolve_signing_secret(store);
    let expected = to_hex(&hmac_sha256(secret.as_bytes(), payload_hex.as_bytes()));
    if !ct_eq(sig_hex.as_bytes(), expected.as_bytes()) {
        return None;
    }
    let raw = from_hex(payload_hex)?;
    let raw_str = std::str::from_utf8(&raw).ok()?;
    let val: Value = serde_json::from_str(raw_str).ok()?;
    if val["role"].as_str() != Some("admin") {
        return None;
    }
    let exp = val["exp"].as_u64()?;
    let now = now_ms();
    if now > exp {
        return None;
    }
    if let Some(jti) = val["jti"].as_str() {
        if is_jti_revoked(jti, now) {
            return None;
        }
    }
    Some(val)
}

pub fn verify_admin_request(req: &HttpRequest, store: &Store) -> bool {
    decode_verified_payload(req, store).is_some()
}

pub fn revoke_admin_request(req: &HttpRequest, store: &Store) -> bool {
    let Some(val) = decode_verified_payload(req, store) else {
        return false;
    };
    if let (Some(jti), Some(exp)) = (val["jti"].as_str(), val["exp"].as_u64()) {
        revoke_jti(jti.to_string(), exp);
        return true;
    }
    false
}

pub fn validate_new_passcode(clean: &str) -> Result<(), &'static str> {
    let len = clean.chars().count();
    if len < 10 || len > 128 {
        return Err("Choisissez un code entre 10 et 128 caractères.");
    }
    let has_lower = clean.chars().any(|c| c.is_ascii_lowercase());
    let has_upper = clean.chars().any(|c| c.is_ascii_uppercase());
    let has_digit = clean.chars().any(|c| c.is_ascii_digit());
    let has_symbol = clean.chars().any(|c| !c.is_ascii_alphanumeric());
    let classes = [has_lower, has_upper, has_digit, has_symbol]
        .iter()
        .filter(|&&b| b)
        .count();
    if classes < 3 {
        return Err("Combinez au moins 3 types : minuscules, majuscules, chiffres ou symboles.");
    }
    let mut distinct = std::collections::HashSet::new();
    for ch in clean.chars() {
        distinct.insert(ch);
    }
    if distinct.len() < 5 {
        return Err("Code trop répétitif : utilisez davantage de caractères différents.");
    }
    Ok(())
}

pub fn get_auth_status(req: &HttpRequest, store: &Store) -> Value {
    let payload = decode_verified_payload(req, store);
    let authenticated = payload.is_some();
    let expires_at = payload.and_then(|v| v["exp"].as_u64());
    if let Ok(pass) = env::var("ADMIN_PASSCODE") {
        if !pass.trim().is_empty() {
            return json!({
                "ok": true,
                "backend": "rust",
                "persistence": "file",
                "mode": "env",
                "claimed": true,
                "authenticated": authenticated,
                "expiresAt": expires_at
            });
        }
    }
    let claimed = store.get_admin_auth().is_some();
    json!({
        "ok": true,
        "backend": "rust",
        "persistence": "file",
        "mode": if claimed { "claimed" } else { "setup" },
        "claimed": claimed,
        "authenticated": authenticated,
        "expiresAt": expires_at
    })
}

pub fn authenticate_passcode(passcode: &str, store: &Store) -> Result<(String, u64, &'static str), (u16, &'static str)> {
    let clean = passcode.trim();
    if clean.is_empty() {
        return Err((400, "Code d’accès requis."));
    }
    if let Ok(env_pass) = env::var("ADMIN_PASSCODE") {
        let expected = env_pass.trim();
        if !expected.is_empty() {
            let h1 = sha256(clean.as_bytes());
            let h2 = sha256(expected.as_bytes());
            if !ct_eq(&h1, &h2) {
                return Err((401, "Code d’accès incorrect."));
            }
            let (tok, exp) = issue_admin_token(store);
            return Ok((tok, exp, "env"));
        }
    }
    let Some(rec) = store.get_admin_auth() else {
        return Err((409, "Aucun code administrateur configuré : initialisez l’accès."));
    };
    let salt = rec["salt"].as_str().unwrap_or("");
    let hash_hex = rec["hash"].as_str().unwrap_or("");
    let rounds = rec["rounds"]
        .as_u64()
        .map(|r| r as u32)
        .filter(|&r| r >= PBKDF2_ROUNDS_LEGACY && r <= 500_000)
        .unwrap_or(PBKDF2_ROUNDS_LEGACY);
    if salt.is_empty() || hash_hex.len() != 64 {
        return Err((401, "Code d’accès incorrect."));
    }
    let derived = to_hex(&pbkdf2_hmac_sha256(clean.as_bytes(), salt.as_bytes(), rounds));
    if !ct_eq(derived.as_bytes(), hash_hex.as_bytes()) {
        return Err((401, "Code d’accès incorrect."));
    }
    let (tok, exp) = issue_admin_token(store);
    Ok((tok, exp, "claimed"))
}

pub fn claim_first_run(passcode: &str, store: &Store) -> Result<(String, u64, &'static str), (u16, &'static str)> {
    if let Ok(env_pass) = env::var("ADMIN_PASSCODE") {
        if !env_pass.trim().is_empty() {
            return Err((409, "Code déjà configuré côté serveur."));
        }
    }
    let clean = passcode.trim();
    if let Err(msg) = validate_new_passcode(clean) {
        return Err((400, msg));
    }
    let salt = random_hex(16);
    let hash = to_hex(&pbkdf2_hmac_sha256(clean.as_bytes(), salt.as_bytes(), PBKDF2_ROUNDS));
    let record = json!({
        "salt": salt,
        "hash": hash,
        "rounds": PBKDF2_ROUNDS,
        "claimedAt": now_ms()
    });
    if !store.claim_admin_auth(record) {
        return Err((409, "L’accès administrateur a déjà été initialisé."));
    }
    let (tok, exp) = issue_admin_token(store);
    Ok((tok, exp, "claimed"))
}

pub fn refresh_admin_token(req: &HttpRequest, store: &Store) -> Result<(String, u64, &'static str), (u16, &'static str)> {
    let Some(val) = decode_verified_payload(req, store) else {
        return Err((401, "Session expirée. Reconnectez-vous."));
    };
    if let (Some(jti), Some(exp)) = (val["jti"].as_str(), val["exp"].as_u64()) {
        revoke_jti(jti.to_string(), exp);
    }
    let mode = if env::var("ADMIN_PASSCODE").map(|s| !s.trim().is_empty()).unwrap_or(false) {
        "env"
    } else {
        "claimed"
    };
    let (tok, exp) = issue_admin_token(store);
    Ok((tok, exp, mode))
}

pub fn change_admin_passcode(
    req: &HttpRequest,
    current_passcode: &str,
    new_passcode: &str,
    store: &Store,
) -> Result<(String, u64, &'static str), (u16, &'static str)> {
    let Some(val) = decode_verified_payload(req, store) else {
        return Err((401, "Authentification administrateur requise."));
    };
    if env::var("ADMIN_PASSCODE").map(|s| !s.trim().is_empty()).unwrap_or(false) {
        return Err((409, "Le code est géré par la variable serveur ADMIN_PASSCODE."));
    }
    let cur_clean = current_passcode.trim();
    let new_clean = new_passcode.trim();
    if cur_clean.is_empty() {
        return Err((400, "Saisissez le code actuel."));
    }
    if let Err(msg) = validate_new_passcode(new_clean) {
        return Err((400, msg));
    }
    if cur_clean == new_clean {
        return Err((400, "Le nouveau code doit être différent de l’actuel."));
    }
    let Some(rec) = store.get_admin_auth() else {
        return Err((409, "Aucun code administrateur configuré."));
    };
    let salt = rec["salt"].as_str().unwrap_or("");
    let hash_hex = rec["hash"].as_str().unwrap_or("");
    let rounds = rec["rounds"]
        .as_u64()
        .map(|r| r as u32)
        .filter(|&r| r >= PBKDF2_ROUNDS_LEGACY && r <= 500_000)
        .unwrap_or(PBKDF2_ROUNDS_LEGACY);
    if salt.is_empty() || hash_hex.len() != 64 {
        return Err((401, "Code actuel incorrect."));
    }
    let derived = to_hex(&pbkdf2_hmac_sha256(cur_clean.as_bytes(), salt.as_bytes(), rounds));
    if !ct_eq(derived.as_bytes(), hash_hex.as_bytes()) {
        return Err((401, "Code actuel incorrect."));
    }
    let next_salt = random_hex(16);
    let next_hash = to_hex(&pbkdf2_hmac_sha256(new_clean.as_bytes(), next_salt.as_bytes(), PBKDF2_ROUNDS));
    let next_rec = json!({
        "salt": next_salt,
        "hash": next_hash,
        "rounds": PBKDF2_ROUNDS,
        "claimedAt": rec["claimedAt"].as_u64().unwrap_or_else(now_ms),
        "updatedAt": now_ms()
    });
    store.update_admin_auth(next_rec);
    if let (Some(jti), Some(exp)) = (val["jti"].as_str(), val["exp"].as_u64()) {
        revoke_jti(jti.to_string(), exp);
    }
    let (tok, exp) = issue_admin_token(store);
    Ok((tok, exp, "claimed"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sha256_matches_standard_vector() {
        assert_eq!(
            to_hex(&sha256(b"abc")),
            "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
        );
    }

    #[test]
    fn passcode_policy_enforces_length_and_variety() {
        assert!(validate_new_passcode("short1A!").is_err());
        assert!(validate_new_passcode("aaaaaaaaaaaa").is_err());
        assert!(validate_new_passcode("onlylowercaseletters").is_err());
        assert!(validate_new_passcode("Mathix2026!").is_ok());
    }

    #[test]
    fn rate_limiter_locks_after_six_failures() {
        let rl = RateLimiter::new();
        for i in 0..5 {
            let (rem, lock) = rl.record_failure("127.0.0.1");
            assert_eq!(rem, 5 - i);
            assert!(lock.is_none());
        }
        let (rem, lock) = rl.record_failure("127.0.0.1");
        assert_eq!(rem, 0);
        assert!(lock.is_some());
        assert!(rl.check("127.0.0.1").is_err());
        rl.clear("127.0.0.1");
        assert!(rl.check("127.0.0.1").is_ok());
    }

    #[test]
    fn token_refresh_revokes_previous_and_passcode_rotation_works() {
        use std::collections::BTreeMap;
        let dir = std::env::temp_dir().join(format!("mathix-auth-test-{}", now_ms()));
        let store = Store::open(dir.clone());
        let (tok1, exp1, mode1) = claim_first_run("Mathix2026!Secure", &store).expect("claim");
        assert_eq!(mode1, "claimed");
        assert!(exp1 > now_ms());

        let mk_req = |tok: &str| HttpRequest {
            method: "POST".into(),
            pathname: "/api/auth".into(),
            query: BTreeMap::new(),
            headers: BTreeMap::from([("authorization".into(), format!("Bearer {tok}"))]),
            body: Vec::new(),
        };
        assert!(verify_admin_request(&mk_req(&tok1), &store));

        // Refresh rotates token and invalidates old token
        let (tok2, _, _) = refresh_admin_token(&mk_req(&tok1), &store).expect("refresh");
        assert!(!verify_admin_request(&mk_req(&tok1), &store));
        assert!(verify_admin_request(&mk_req(&tok2), &store));

        // Passcode rotation checks old passcode, updates hash, rotates token
        assert!(change_admin_passcode(&mk_req(&tok2), "WrongPass123!", "Mathix2027#Better", &store).is_err());
        let (tok3, _, _) = change_admin_passcode(&mk_req(&tok2), "Mathix2026!Secure", "Mathix2027#Better", &store).expect("rotate");
        assert!(!verify_admin_request(&mk_req(&tok2), &store));
        assert!(verify_admin_request(&mk_req(&tok3), &store));
        assert!(authenticate_passcode("Mathix2026!Secure", &store).is_err());
        assert!(authenticate_passcode("Mathix2027#Better", &store).is_ok());

        let _ = std::fs::remove_dir_all(&dir);
    }
}

