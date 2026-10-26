// Minimal, synchronous WASI (preview1) host for running one compiled C program.
// Pure JavaScript with no file system, network, clock-based side channels or
// environment access: the program can only read the supplied stdin text, write
// stdout/stderr, and (optionally) call the island.h game API.
//
// Runs identically in a browser Web Worker and in a Node worker thread.
// Time limits are enforced by the caller terminating the worker.

import { createGridWorld } from '../world/gridModel.js';

export const DEFAULT_OUTPUT_LIMIT = 64 * 1024;

const ERRNO = { SUCCESS: 0, BADF: 8, INVAL: 28, NOSYS: 52, SPIPE: 70 };

class ProcExit extends Error {
  constructor(code) {
    super(`exit ${code}`);
    this.code = code;
  }
}
class OutputLimit extends Error {}

const enc = new TextEncoder();

/**
 * @param {WebAssembly.Module} module
 * @param {object} opts
 * @param {string} [opts.stdin]
 * @param {number} [opts.outputLimit]
 * @param {object|null} [opts.world]  grid config, enables island.h
 * @param {(seg:{kind:string,text:string})=>void} [opts.onSegment]  streaming callback
 */
export function runWasm(module, opts = {}) {
  const stdinBytes = enc.encode(opts.stdin ?? '');
  let stdinPos = 0;
  const outputLimit = opts.outputLimit ?? DEFAULT_OUTPUT_LIMIT;
  const decoders = { 1: new TextDecoder(), 2: new TextDecoder() };
  const inDecoder = new TextDecoder();
  let stdout = '';
  let stderr = '';
  let totalOut = 0;
  const transcript = [];
  const world = opts.world ? createGridWorld(opts.world) : null;

  function pushSeg(kind, text) {
    if (!text) return;
    const last = transcript[transcript.length - 1];
    if (last && last.kind === kind) last.text += text;
    else transcript.push({ kind, text });
    if (opts.onSegment) opts.onSegment({ kind, text });
  }

  let memory;
  const view = () => new DataView(memory.buffer);
  const bytes = () => new Uint8Array(memory.buffer);

  const wasi = {
    fd_write(fd, iovs, iovsLen, nwrittenPtr) {
      if (fd !== 1 && fd !== 2) return ERRNO.BADF;
      const dv = view();
      let written = 0;
      for (let i = 0; i < iovsLen; i++) {
        const ptr = dv.getUint32(iovs + i * 8, true);
        const len = dv.getUint32(iovs + i * 8 + 4, true);
        const remaining = outputLimit - totalOut;
        const take = Math.min(len, Math.max(0, remaining));
        const chunk = bytes().slice(ptr, ptr + take);
        const text = decoders[fd].decode(chunk, { stream: true });
        if (fd === 1) stdout += text;
        else stderr += text;
        pushSeg(fd === 1 ? 'out' : 'err', text);
        totalOut += take;
        written += len;
        if (take < len) throw new OutputLimit();
      }
      view().setUint32(nwrittenPtr, written, true);
      return ERRNO.SUCCESS;
    },
    fd_read(fd, iovs, iovsLen, nreadPtr) {
      if (fd !== 0) return ERRNO.BADF;
      const dv = view();
      let read = 0;
      // Deliver at most one line per call so the transcript can show input
      // where a terminal would echo it (after the prompt that asked for it).
      let lineEnd = stdinBytes.indexOf(10, stdinPos);
      const limit = lineEnd === -1 ? stdinBytes.length : lineEnd + 1;
      for (let i = 0; i < iovsLen && stdinPos < limit; i++) {
        const ptr = dv.getUint32(iovs + i * 8, true);
        const len = dv.getUint32(iovs + i * 8 + 4, true);
        const n = Math.min(len, limit - stdinPos);
        bytes().set(stdinBytes.subarray(stdinPos, stdinPos + n), ptr);
        pushSeg('in', inDecoder.decode(stdinBytes.subarray(stdinPos, stdinPos + n), { stream: true }));
        stdinPos += n;
        read += n;
      }
      view().setUint32(nreadPtr, read, true);
      return ERRNO.SUCCESS;
    },
    fd_fdstat_get(fd, statPtr) {
      if (fd > 2) return ERRNO.BADF;
      const dv = view();
      dv.setUint8(statPtr, 2); // CHARACTER_DEVICE: makes stdout line-buffered like a terminal
      dv.setUint16(statPtr + 2, 0, true);
      // rights: everything except seek/tell (bits 2 and 5) so libc treats it as a tty
      dv.setBigUint64(statPtr + 8, 0xffffffffn & ~((1n << 2n) | (1n << 5n)), true);
      dv.setBigUint64(statPtr + 16, 0n, true);
      return ERRNO.SUCCESS;
    },
    fd_seek() {
      return ERRNO.SPIPE;
    },
    fd_close() {
      return ERRNO.SUCCESS;
    },
    fd_prestat_get() {
      return ERRNO.BADF;
    },
    fd_prestat_dir_name() {
      return ERRNO.BADF;
    },
    proc_exit(code) {
      throw new ProcExit(code);
    },
    args_sizes_get(argcPtr, bufSizePtr) {
      view().setUint32(argcPtr, 1, true);
      view().setUint32(bufSizePtr, 8, true);
      return ERRNO.SUCCESS;
    },
    args_get(argvPtr, bufPtr) {
      view().setUint32(argvPtr, bufPtr, true);
      bytes().set(enc.encode('program\0'), bufPtr);
      return ERRNO.SUCCESS;
    },
    environ_sizes_get(countPtr, sizePtr) {
      view().setUint32(countPtr, 0, true);
      view().setUint32(sizePtr, 0, true);
      return ERRNO.SUCCESS;
    },
    environ_get() {
      return ERRNO.SUCCESS;
    },
    clock_time_get(id, precision, timePtr) {
      // Fixed epoch: programs are deterministic so tests are reproducible.
      view().setBigUint64(timePtr, 1700000000000000000n, true);
      return ERRNO.SUCCESS;
    },
    random_get(buf, len) {
      // Deterministic bytes, again for reproducible behaviour.
      const b = bytes();
      for (let i = 0; i < len; i++) b[buf + i] = (i * 73 + 41) & 0xff;
      return ERRNO.SUCCESS;
    },
    sched_yield() {
      return ERRNO.SUCCESS;
    },
  };

  const imports = {};
  for (const imp of WebAssembly.Module.imports(module)) {
    if (imp.kind !== 'function') continue;
    if (imp.module === 'wasi_snapshot_preview1') {
      imports[imp.module] ??= {};
      imports[imp.module][imp.name] = wasi[imp.name] || (() => ERRNO.NOSYS);
    } else if (imp.module === 'island') {
      imports.island ??= {};
      if (!world) {
        imports.island[imp.name] = () => {
          throw Object.assign(new Error('island API unavailable'), { islandUnavailable: true });
        };
      } else {
        imports.island[imp.name] = world.api[imp.name] || (() => 0);
      }
    } else {
      imports[imp.module] ??= {};
      imports[imp.module][imp.name] = () => {
        throw Object.assign(new Error(`unknown import ${imp.module}.${imp.name}`), { unknownImport: true });
      };
    }
  }

  const result = {
    exitCode: null,
    stdout: '',
    stderr: '',
    transcript,
    trap: null,
    outputLimitExceeded: false,
    stdinRemaining: 0,
    world: null,
  };

  const started = typeof performance !== 'undefined' ? performance.now() : Date.now();
  try {
    const instance = new WebAssembly.Instance(module, imports);
    memory = instance.exports.memory;
    instance.exports._start();
    result.exitCode = 0;
  } catch (e) {
    if (e instanceof ProcExit) {
      result.exitCode = e.code;
    } else if (e instanceof OutputLimit) {
      result.outputLimitExceeded = true;
    } else {
      result.trap = describeTrap(e);
    }
  }
  result.elapsedMs = Math.round((typeof performance !== 'undefined' ? performance.now() : Date.now()) - started);
  for (const fd of [1, 2]) {
    const tail = decoders[fd].decode();
    if (fd === 1) stdout += tail;
    else stderr += tail;
  }
  result.stdout = stdout;
  result.stderr = stderr;
  result.stdinRemaining = stdinBytes.length - stdinPos;
  if (world) result.world = { events: world.events, summary: world.summary() };
  return result;
}

/** Classify a WebAssembly trap / JS exception into a stable kind. */
export function describeTrap(e) {
  const message = String((e && e.message) || e);
  const stack = String((e && e.stack) || '');
  let kind = 'unknown';
  if (e && e.islandUnavailable) kind = 'islandUnavailable';
  else if (e && e.unknownImport) kind = 'unknownImport';
  else if (/unreachable/i.test(message)) kind = 'runtimeCheck';
  else if (/divide by zero|division by zero/i.test(message)) kind = 'divideByZero';
  else if (/integer overflow|unrepresentable/i.test(message)) kind = 'integerOverflow';
  else if (/out of bounds|index out of/i.test(message)) kind = 'memoryOutOfBounds';
  else if (/call stack|too much recursion|stack overflow/i.test(message)) kind = 'stackOverflow';
  else if (/memory/i.test(message)) kind = 'outOfMemory';
  // Find the innermost function name that belongs to the player's code.
  let func = null;
  const names = [];
  for (const m of stack.matchAll(/(?:at\s+(?:[\w$.]*\.)?([A-Za-z_][\w$]*)\s*\(wasm|([A-Za-z_][\w$]*)@wasm)/g)) {
    let n = m[1] || m[2];
    if (n === '__original_main' || n === '__main_void' || n === '__main_argc_argv') n = 'main';
    names.push(n);
  }
  const skip = /^(abort|__|_start|exit|_exit|printf|scanf|vfprintf|fprintf|fwrite|fflush|__stdio|sqrt|memcpy|memset|strlen|wasm-function|undefined_weak)/;
  func = names.find((n) => !skip.test(n)) || null;
  return { kind, message, func };
}
