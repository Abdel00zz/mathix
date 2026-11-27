#!/usr/bin/env node
/**
 * scripts/build-rust.mjs — compile l'ensemble de l'espace de travail Rust de Mathix :
 *   1. engines/math_engine.wasm  (wasm32-unknown-unknown --release)
 *   2. engines/json_engine.wasm  (wasm32-unknown-unknown --release)
 *   3. engines/mathix-server     (binaire natif serveur HTTP + API Rust)
 *
 * Utilise CARGO_TARGET_DIR=/tmp/mathix-cargo-target par défaut pour ne pas
 * alourdir le dépôt avec le cache de compilation Rust.
 */

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import url from 'node:url';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const RUST_DIR = path.join(ROOT, 'engines', 'rust');
const ENGINES_DIR = path.join(ROOT, 'engines');
const TARGET_DIR = process.env.CARGO_TARGET_DIR || path.join(os.tmpdir(), 'mathix-cargo-target');

const cargoBin = (() => {
  const homeCargo = path.join(os.homedir(), '.cargo', 'bin', process.platform === 'win32' ? 'cargo.exe' : 'cargo');
  return fs.existsSync(homeCargo) ? homeCargo : 'cargo';
})();

const env = {
  ...process.env,
  CARGO_TARGET_DIR: TARGET_DIR,
  PATH: `${path.join(os.homedir(), '.cargo', 'bin')}${path.delimiter}${process.env.PATH || ''}`,
};

function runCargo(args) {
  console.log(`→ cargo ${args.join(' ')}`);
  execFileSync(cargoBin, args, { cwd: RUST_DIR, env, stdio: 'inherit' });
}

// 1. Moteurs WASM32 autonomes (utilisés par scripts/audit.mjs)
runCargo(['build', '--release', '--target', 'wasm32-unknown-unknown', '-p', 'math_engine', '-p', 'json_engine']);

const wasmOut = path.join(TARGET_DIR, 'wasm32-unknown-unknown', 'release');
for (const name of ['math_engine.wasm', 'json_engine.wasm']) {
  const src = path.join(wasmOut, name);
  const dst = path.join(ENGINES_DIR, name);
  fs.copyFileSync(src, dst);
  const kb = (fs.statSync(dst).size / 1024).toFixed(1);
  console.log(`✓ ${path.relative(ROOT, dst)} (${kb} Ko)`);
}

// 2. Frontend Student 100% Rust/WASM (zéro code Admin)
runCargo(['build', '--release', '--target', 'wasm32-unknown-unknown', '-p', 'mathix_frontend']);
{
  const src = path.join(wasmOut, 'mathix_frontend.wasm');
  const dst = path.join(ENGINES_DIR, 'mathix_app.wasm');
  fs.copyFileSync(src, dst);
  const kb = (fs.statSync(dst).size / 1024).toFixed(1);
  console.log(`✓ ${path.relative(ROOT, dst)} (${kb} Ko)`);
}

// 3. Frontend Admin + Studio éditorial (isolation stricte via --features admin)
runCargo(['build', '--release', '--target', 'wasm32-unknown-unknown', '-p', 'mathix_frontend', '--features', 'admin']);
{
  const src = path.join(wasmOut, 'mathix_frontend.wasm');
  const dst = path.join(ENGINES_DIR, 'mathix_admin.wasm');
  fs.copyFileSync(src, dst);
  const kb = (fs.statSync(dst).size / 1024).toFixed(1);
  console.log(`✓ ${path.relative(ROOT, dst)} (${kb} Ko)`);
}

// 3. Serveur natif Rust (mathix-server)
runCargo(['build', '--release', '-p', 'mathix_server']);

const exeExt = process.platform === 'win32' ? '.exe' : '';
const binSrc = path.join(TARGET_DIR, 'release', `mathix-server${exeExt}`);
const binDst = path.join(ENGINES_DIR, `mathix-server${exeExt}`);
const binTmp = `${binDst}.tmp`;
fs.copyFileSync(binSrc, binTmp);
if (process.platform !== 'win32') fs.chmodSync(binTmp, 0o755);
fs.renameSync(binTmp, binDst);
const mb = (fs.statSync(binDst).size / 1024).toFixed(1);
console.log(`✓ ${path.relative(ROOT, binDst)} (${mb} Ko)`);
