// Node-side twin of the browser execution engine, used by verification scripts.
// Compiles with the same @yowasp/clang build and flags, and runs programs with
// the same WASI host inside worker threads that are terminated on timeout.
import { Worker } from 'node:worker_threads';
import { runClang } from '@yowasp/clang';
import { compileArgs, compileFiles, parseDiagnostics, OUTPUT_FILE } from '../../src/exec/toolchain.js';

export async function compileC(source, harnessSource = null) {
  let stderr = '';
  const dec = new TextDecoder();
  const collect = (b) => { if (b) stderr += dec.decode(b, { stream: true }); };
  try {
    const out = await runClang(compileArgs({ harness: harnessSource != null }), compileFiles(source, harnessSource), {
      stdout: collect, stderr: collect,
    });
    const wasm = out[OUTPUT_FILE];
    return { ok: true, module: await WebAssembly.compile(wasm), stderr, diagnostics: parseDiagnostics(stderr) };
  } catch (e) {
    if (e && typeof e.code === 'number') return { ok: false, stderr, diagnostics: parseDiagnostics(stderr) };
    throw e;
  }
}

export function runModule(module, { stdin = '', world = null, timeoutMs = 3000, outputLimit } = {}) {
  return new Promise((resolve) => {
    const worker = new Worker(new URL('./runWorker.mjs', import.meta.url));
    const timer = setTimeout(() => {
      worker.terminate();
      resolve({ timedOut: true, exitCode: null, stdout: '', stderr: '', transcript: [], trap: null });
    }, timeoutMs);
    worker.once('message', (r) => { clearTimeout(timer); worker.terminate(); resolve(r); });
    worker.once('error', (e) => { clearTimeout(timer); worker.terminate(); resolve({ exitCode: null, trap: { kind: 'hostError', message: String(e) }, stdout: '', stderr: '', transcript: [] }); });
    worker.postMessage({ module, stdin, world, outputLimit });
  });
}
