#!/usr/bin/env node
// Copies the @yowasp/clang build (Clang/LLD compiled to WebAssembly) into
// public/toolchain/clang-<version>/ so the browser can load it as static files.
// Runs automatically before `npm run dev` and `npm run build`.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CLANG_PACKAGE_VERSION, TOOLCHAIN_DIR } from '../src/exec/toolchain.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = path.join(ROOT, 'node_modules/@yowasp/clang/gen');
if (!fs.existsSync(path.join(src, '..', 'package.json'))) {
  console.error('\nThe C compiler package is not installed yet.\nRun `npm install` first, then `npm run build` again.\n');
  process.exit(1);
}
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'node_modules/@yowasp/clang/package.json'), 'utf8'));
if (pkg.version !== CLANG_PACKAGE_VERSION) {
  console.error(`@yowasp/clang ${pkg.version} installed, but src/exec/toolchain.js expects ${CLANG_PACKAGE_VERSION}.`);
  process.exit(1);
}
const dest = path.join(ROOT, 'public', TOOLCHAIN_DIR);
const marker = path.join(dest, '.complete');
if (fs.existsSync(marker)) {
  console.log(`toolchain already in public/${TOOLCHAIN_DIR}`);
  process.exit(0);
}
fs.rmSync(path.join(ROOT, 'public/toolchain'), { recursive: true, force: true });
fs.mkdirSync(dest, { recursive: true });
for (const f of fs.readdirSync(src)) fs.copyFileSync(path.join(src, f), path.join(dest, f));
fs.writeFileSync(marker, new Date().toISOString());
console.log(`copied Clang toolchain to public/${TOOLCHAIN_DIR}`);
