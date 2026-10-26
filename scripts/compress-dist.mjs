#!/usr/bin/env node
// Precompresses large build outputs (the Clang toolchain shrinks from ~100 MB to ~30 MB).
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const dist = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist');
let saved = 0;
function walk(dir) {
  for (const f of fs.readdirSync(dir)) {
    const p = path.join(dir, f);
    const st = fs.statSync(p);
    if (st.isDirectory()) walk(p);
    else if (/\.(wasm|tar|js|css|json|html)$/.test(f) && st.size > 4096 && (!fs.existsSync(p + '.gz') || fs.statSync(p + '.gz').mtimeMs < st.mtimeMs)) {
      const gz = zlib.gzipSync(fs.readFileSync(p), { level: 9 });
      fs.writeFileSync(p + '.gz', gz);
      saved += st.size - gz.length;
    }
  }
}
walk(dist);
console.log(`precompressed dist/ (saves ${(saved / 1048576).toFixed(1)} MB per first visit)`);
