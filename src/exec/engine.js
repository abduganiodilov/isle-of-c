// Main-thread execution engine: owns the compiler worker and the runner worker.
// Provides compile() and run() in the shape assessStep() expects.

import { DEFAULT_OUTPUT_LIMIT } from './wasiRunner.js';

function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36) + ':' + str.length;
}

export class ExecEngine {
  constructor() {
    this.compileCache = new Map();
    this.moduleKeys = new WeakMap();
    this.pendingCompiles = new Map();
    this.nextId = 1;
    this.listeners = new Set();
    this.toolchain = { phase: 'idle', done: 0, total: 0 };
    this.compiler = null;
    this.runner = null;
    this.currentRun = null;
  }

  onStatus(fn) {
    this.listeners.add(fn);
    fn(this.toolchain);
    return () => this.listeners.delete(fn);
  }

  setToolchain(update) {
    this.toolchain = { ...this.toolchain, ...update };
    for (const fn of this.listeners) fn(this.toolchain);
  }

  ensureCompiler() {
    if (this.compiler) return;
    this.compiler = new Worker(new URL('./compilerWorker.js', import.meta.url), { type: 'module' });
    this.compiler.postMessage({ type: 'init', baseUrl: new URL(import.meta.env.BASE_URL, location.href).href });
    this.compiler.onmessage = (e) => {
      const msg = e.data;
      if (msg.type === 'progress') {
        if (msg.phase === 'download') this.setToolchain({ phase: 'download', done: msg.done, total: msg.total });
        else if (msg.phase === 'ready') this.setToolchain({ phase: 'ready' });
        return;
      }
      if (msg.type === 'compiled') {
        const p = this.pendingCompiles.get(msg.id);
        if (!p) return;
        this.pendingCompiles.delete(msg.id);
        if (msg.fatal) {
          this.setToolchain({ phase: 'error', error: msg.message });
          p.reject(Object.assign(new Error(msg.message), { toolchainError: true }));
        } else {
          p.resolve(msg);
        }
      }
    };
    this.compiler.onerror = (e) => {
      this.setToolchain({ phase: 'error', error: e.message || 'Compiler worker failed to start' });
      for (const p of this.pendingCompiles.values()) p.reject(Object.assign(new Error('Compiler worker failed'), { toolchainError: true }));
      this.pendingCompiles.clear();
      this.compiler = null;
    };
    if (this.toolchain.phase === 'idle') this.setToolchain({ phase: 'loading' });
  }

  /** Start loading the compiler in the background (first visit downloads ~100 MB). */
  warmUp() {
    return this.compile('int main(void) { return 0; }\n').catch(() => {});
  }

  /**
   * Compile C source (optionally linked with a test harness).
   * @returns {Promise<{ok:boolean, module?:Uint8Array, diagnostics:any[], stderr:string, ms?:number, cached?:boolean}>}
   */
  compile(source, harness = null) {
    const key = hash(source + '\u0000' + (harness ?? ''));
    if (this.compileCache.has(key)) return Promise.resolve({ ...this.compileCache.get(key), cached: true });
    this.ensureCompiler();
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pendingCompiles.set(id, { resolve, reject });
      this.compiler.postMessage({ type: 'compile', id, source, harness });
    }).then((msg) => {
      if (msg.wasm) this.moduleKeys.set(msg.wasm, key);
      const res = { ok: msg.ok, module: msg.wasm, moduleKey: key, diagnostics: msg.diagnostics || [], stderr: msg.stderr || '', ms: msg.ms };
      if (this.compileCache.size > 40) this.compileCache.delete(this.compileCache.keys().next().value);
      this.compileCache.set(key, res);
      return res;
    });
  }

  ensureRunner() {
    if (this.runner) return;
    this.runner = new Worker(new URL('./runnerWorker.js', import.meta.url), { type: 'module' });
    this.runner.onmessage = (e) => {
      const msg = e.data;
      const cur = this.currentRun;
      if (!cur || msg.runId !== cur.runId) return;
      if (msg.type === 'started') {
        cur.timer = setTimeout(() => this.finishRun({ timedOut: true }), cur.timeoutMs);
      } else if (msg.type === 'segments') {
        for (const s of msg.segments) {
          cur.transcript.push(s);
          cur.onSegment?.(s);
        }
      } else if (msg.type === 'done') {
        clearTimeout(cur.timer);
        this.currentRun = null;
        cur.resolve(msg.result);
      }
    };
  }

  finishRun(reason) {
    const cur = this.currentRun;
    if (!cur) return;
    clearTimeout(cur.timer);
    this.currentRun = null;
    // Terminating the worker is the only reliable way to stop a busy program.
    this.runner?.terminate();
    this.runner = null;
    const stdout = cur.transcript.filter((s) => s.kind === 'out').map((s) => s.text).join('');
    const stderr = cur.transcript.filter((s) => s.kind === 'err').map((s) => s.text).join('');
    cur.resolve({ exitCode: null, stdout, stderr, transcript: cur.transcript, trap: null, ...reason });
  }

  /**
   * Run a compiled program.
   * @param {Uint8Array} wasm
   * @param {{stdin?:string, world?:object|null, timeoutMs?:number, onSegment?:(s:{kind:string,text:string})=>void, moduleKey?:string}} opts
   */
  run(wasm, opts = {}) {
    if (this.currentRun) this.finishRun({ stopped: true });
    this.ensureRunner();
    const runId = this.nextId++;
    return new Promise((resolve) => {
      this.currentRun = { runId, resolve, transcript: [], onSegment: opts.onSegment, timeoutMs: opts.timeoutMs ?? 3000, timer: null };
      this.runner.postMessage({
        type: 'run',
        runId,
        wasm,
        moduleKey: opts.moduleKey || this.moduleKeys.get(wasm) || hash(String(wasm.length) + String(wasm[wasm.length - 1]) + runId),
        stdin: opts.stdin ?? '',
        world: opts.world ?? null,
        outputLimit: opts.outputLimit ?? DEFAULT_OUTPUT_LIMIT,
      });
    });
  }

  /** Stop the running program (if any). */
  stop() {
    this.finishRun({ stopped: true });
  }

  get running() {
    return !!this.currentRun;
  }
}

export const engine = typeof window !== 'undefined' ? new ExecEngine() : null;
