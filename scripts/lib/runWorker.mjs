// Node worker thread: runs one compiled program (same host code as the browser).
import { parentPort } from 'node:worker_threads';
import { runWasm } from '../../src/exec/wasiRunner.js';

parentPort.on('message', ({ module, stdin, world, outputLimit }) => {
  const result = runWasm(module, { stdin, world, outputLimit });
  parentPort.postMessage(result);
});
