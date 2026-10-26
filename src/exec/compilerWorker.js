// Web Worker that runs the real Clang compiler (built for WebAssembly by the
// YoWASP project) entirely inside the browser. Untrusted source code is only
// ever compiled here, in a virtual file system that contains nothing but the
// program, the game header and the C library headers.

import { compileArgs, compileFiles, parseDiagnostics, OUTPUT_FILE, TOOLCHAIN_DIR, CLANG_PACKAGE_VERSION, MAX_SOURCE_BYTES } from './toolchain.js';

let runClangPromise = null;
let baseUrl = null;

// Cache the ~100 MB toolchain in the Cache API so later visits load offline.
// Must be installed before the toolchain bundle is imported, because the bundle
// captures globalThis.fetch when it loads.
function installCachingFetch() {
  const original = self.fetch.bind(self);
  self.fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input.url || String(input);
    if (url.includes('/toolchain/') && 'caches' in self) {
      try {
        const cache = await caches.open(`isle-of-c-clang-${CLANG_PACKAGE_VERSION}`);
        const hit = await cache.match(url);
        if (hit) return hit;
        const resp = await original(input, init);
        if (resp.ok) cache.put(url, resp.clone()).catch(() => {});
        return resp;
      } catch {
        /* fall through to the network */
      }
    }
    return original(input, init);
  };
}

function loadToolchain() {
  if (!runClangPromise) {
    installCachingFetch();
    const url = new URL(TOOLCHAIN_DIR + 'bundle.js', baseUrl).href;
    runClangPromise = import(/* @vite-ignore */ url).then((m) => m.runClang);
  }
  return runClangPromise;
}

let warmedUp = false;

self.onmessage = async (e) => {
  const msg = e.data;
  if (msg.type === 'init') {
    baseUrl = msg.baseUrl;
    return;
  }
  if (msg.type !== 'compile') return;
  const { id, source, harness } = msg;
  if (source.length > MAX_SOURCE_BYTES) {
    self.postMessage({ type: 'compiled', id, ok: false, stderr: '', diagnostics: [{ severity: 'error', message: `Source code is larger than ${MAX_SOURCE_BYTES / 1024} KB.`, line: null, column: null, context: [] }] });
    return;
  }
  let stderr = '';
  const dec = new TextDecoder();
  const collect = (bytes) => {
    if (bytes) stderr += dec.decode(bytes, { stream: true });
  };
  try {
    const runClang = await loadToolchain();
    const started = performance.now();
    let lastReport = 0;
    const out = await runClang(compileArgs({ harness: harness != null }), compileFiles(source, harness), {
      stdout: collect,
      stderr: collect,
      fetchProgress: ({ totalLength, doneLength }) => {
        const now = performance.now();
        if (now - lastReport > 100 || doneLength === totalLength) {
          lastReport = now;
          self.postMessage({ type: 'progress', phase: 'download', done: doneLength, total: totalLength });
        }
      },
    });
    if (!warmedUp) {
      warmedUp = true;
      self.postMessage({ type: 'progress', phase: 'ready' });
    }
    const wasm = out[OUTPUT_FILE];
    self.postMessage({ type: 'compiled', id, ok: true, wasm, stderr, diagnostics: parseDiagnostics(stderr), ms: Math.round(performance.now() - started) }, [wasm.buffer]);
  } catch (err) {
    if (err && typeof err.code === 'number') {
      // The compiler ran and reported errors (non-zero exit status).
      if (!warmedUp) {
        warmedUp = true;
        self.postMessage({ type: 'progress', phase: 'ready' });
      }
      self.postMessage({ type: 'compiled', id, ok: false, stderr, diagnostics: parseDiagnostics(stderr) });
    } else {
      self.postMessage({ type: 'compiled', id, ok: false, fatal: true, stderr, message: String((err && err.message) || err), diagnostics: [] });
    }
  }
};
