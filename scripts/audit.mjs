#!/usr/bin/env node
/**
 * scripts/audit.mjs — Audit intégral des 891 fichiers JSON de public/data/
 * propulsé par les moteurs Rust compilés en WebAssembly (engines/math_engine.wasm
 * et engines/json_engine.wasm) + compilation KaTeX stricte.
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const enc = new TextEncoder();
const dec = new TextDecoder();

async function loadWasmEngine(wasmPath) {
  const buf = fs.readFileSync(wasmPath);
  const { instance } = await WebAssembly.instantiate(buf, {});
  const e = instance.exports;
  return (payload) => {
    const bytes = enc.encode(JSON.stringify(payload));
    const ptr = e.alloc(bytes.length);
    new Uint8Array(e.memory.buffer, ptr, bytes.length).set(bytes);
    e.process(ptr, bytes.length);
    e.dealloc(ptr, bytes.length);
    const out = dec.decode(new Uint8Array(e.memory.buffer, e.out_ptr(), e.out_len()));
    e.out_free();
    return JSON.parse(out);
  };
}

const mathWasm = await loadWasmEngine('engines/math_engine.wasm');
const jsonWasm = await loadWasmEngine('engines/json_engine.wasm');

const mathInfo = mathWasm({ op: 'info' });
const jsonInfo = jsonWasm({ op: 'info' });
const MACROS = mathWasm({ op: 'macros' }).macros ?? {};

const kMod = { exports: {} };
vm.runInNewContext(fs.readFileSync('vendor/katex/katex.min.js', 'utf8'), { module: kMod, exports: kMod.exports, console });
const katex = kMod.exports;

const repair = (tex) => {
  if (!tex.includes('\\\\') || !tex.includes('[')) return tex;
  const r = mathWasm({ op: 'analyze', text: tex });
  return r?.ok && typeof r.normalized === 'string' ? r.normalized : tex;
};

const files = [];
const walk = (d) => {
  for (const f of fs.readdirSync(d)) {
    const p = path.join(d, f);
    if (fs.statSync(p).isDirectory()) walk(p);
    else if (p.endsWith('.json')) files.push(p);
  }
};
walk('public/data');

let jsonErrs = 0, missingImgs = 0, unclosedQ = 0, katexErrs = 0;

for (const f of files) {
  let doc;
  try { doc = JSON.parse(fs.readFileSync(f, 'utf8')); }
  catch (e) { jsonErrs++; console.error('JSON:', f, e.message); continue; }

  const scan = (v, p) => {
    if (typeof v === 'string') {
      if (/^\s*\\(?:question|qst)\{/.test(v)) {
        const sp = mathWasm({ op: 'split-question', content: v });
        if (!sp?.hasQuestion) { unclosedQ++; console.error('UNCLOSED Q:', f, p); }
      }
      for (const m of v.matchAll(/\$\$([\s\S]*?)\$\$/g)) {
        try { katex.renderToString(repair(m[1].trim()), { displayMode: true, throwOnError: true, strict: false, trust: true, macros: { ...MACROS } }); }
        catch (e) { katexErrs++; console.error('KATEX $$:', f, p, e.message); }
      }
      for (const m of v.matchAll(/\\begin\{(align\*?|aligned)\}([\s\S]*?)\\end\{\1\}/g)) {
        try { katex.renderToString(repair(`\\begin{aligned}${m[2]}\\end{aligned}`), { displayMode: true, throwOnError: true, strict: false, trust: true, macros: { ...MACROS } }); }
        catch (e) { katexErrs++; console.error('KATEX align:', f, p, e.message); }
      }
    } else if (Array.isArray(v)) {
      v.forEach((x, i) => scan(x, `${p}[${i}]`));
    } else if (v && typeof v === 'object') {
      if (typeof v.src === 'string' && v.src.startsWith('/images/')) {
        if (!fs.existsSync(path.join('public', v.src.slice(1)))) { missingImgs++; console.error('IMG:', f, v.src); }
      }
      for (const [k, val] of Object.entries(v)) scan(val, p ? `${p}.${k}` : k);
    }
  };
  scan(doc, '');
}

console.log(`Audit complet (${files.length} fichiers JSON · ${mathInfo.version} · ${jsonInfo.version}) :`);
console.log(`  JSON invalides : ${jsonErrs}`);
console.log(`  Images /images/* manquantes : ${missingImgs}`);
console.log(`  \\question{} / \\qst{} non fermés : ${unclosedQ}`);
console.log(`  Erreurs KaTeX strictes ($$ / align) : ${katexErrs}`);
if (jsonErrs || missingImgs || unclosedQ || katexErrs) process.exit(1);
console.log('  ✓ 100 % VALIDE');
