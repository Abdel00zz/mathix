import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import ts from 'typescript';

const appRoot = fileURLToPath(new URL('../', import.meta.url));
const require = createRequire(import.meta.url);
const compiled = ts.transpileModule(fs.readFileSync(path.join(appRoot, 'next.config.ts'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true },
}).outputText;

for (const mode of ['development', 'production']) {
  test(`CSP supports development refresh and stays strict in ${mode}`, async () => {
    const sandbox = { exports: {}, require, __dirname: appRoot, process: { env: { NODE_ENV: mode } } };
    vm.runInNewContext(compiled, sandbox);
    const rules = await sandbox.exports.default.headers();
    const csp = rules.find(rule => rule.source === '/(.*)').headers.find(header => header.key === 'Content-Security-Policy').value;
    assert.equal(csp.includes("'unsafe-eval'"), mode === 'development');
    assert.equal(csp.includes(' ws: wss:'), mode === 'development');
    assert.ok(csp.includes("object-src 'none'"));
    assert.ok(csp.includes("frame-ancestors 'self'"));
  });
}
