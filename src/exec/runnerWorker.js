// Web Worker that executes one compiled program at a time. The worker has no
// access to the page, cookies or storage of the game; the program itself can
// only use the minimal WASI host in wasiRunner.js. The main thread terminates
// this worker when a run exceeds its time limit or the player presses Stop.

import { runWasm } from './wasiRunner.js';

let cachedKey = null;
let cachedModule = null;

self.onmessage = (e) => {
  const { type, runId, wasm, moduleKey, stdin, world, outputLimit } = e.data;
  if (type !== 'run') return;
  try {
    if (moduleKey !== cachedKey) {
      cachedModule = new WebAssembly.Module(wasm);
      cachedKey = moduleKey;
    }
    self.postMessage({ type: 'started', runId });
    let pending = [];
    let pendingBytes = 0;
    let lastFlush = performance.now();
    const flush = () => {
      if (pending.length) self.postMessage({ type: 'segments', runId, segments: pending });
      pending = [];
      pendingBytes = 0;
      lastFlush = performance.now();
    };
    const result = runWasm(cachedModule, {
      stdin,
      world,
      outputLimit,
      onSegment: (seg) => {
        pending.push(seg);
        pendingBytes += seg.text.length;
        if (pendingBytes > 2048 || performance.now() - lastFlush > 50) flush();
      },
    });
    flush();
    self.postMessage({ type: 'done', runId, result });
  } catch (err) {
    self.postMessage({ type: 'done', runId, result: { exitCode: null, stdout: '', stderr: '', transcript: [], trap: { kind: 'hostError', message: String((err && err.message) || err) } } });
  }
};
