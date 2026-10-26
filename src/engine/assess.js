// Shared mission assessment: compile the player's program, run every test case
// on the real compiled program, check behaviour, then check any construct
// requirements the mission explicitly teaches. Used by the browser game and by
// scripts/verify-content.mjs, so "passes in CI" means "passes in the game".

import { checkTest } from '../validate/checker.js';
import { checkRequirements } from '../validate/sourceChecks.js';

export const DEFAULT_TIMEOUT_MS = 3000;

/**
 * @param {object} step     code step from the curriculum (tests, harness, require)
 * @param {string} source   player's C source
 * @param {object} env
 * @param {(src:string, harness?:string|null)=>Promise<{ok:boolean, module?:any, diagnostics:any[], stderr:string}>} env.compile
 * @param {(module:any, opts:{stdin:string, world:any, timeoutMs:number})=>Promise<object>} env.run
 * @param {(event:object)=>void} [env.onProgress]
 * @param {object[]} [env.tests]  override the step's tests (mastery retry)
 */
export async function assessStep(step, source, env) {
  const tests = env.tests || step.tests || [];
  const timeoutMs = step.timeoutMs || DEFAULT_TIMEOUT_MS;
  const result = { compile: null, harnessCompile: null, tests: [], requirementFailures: [], passed: false };

  const compiled = await env.compile(source, null);
  result.compile = { ok: compiled.ok, diagnostics: compiled.diagnostics, stderr: compiled.stderr };
  if (!compiled.ok) return result;

  let harnessModule = null;
  if (tests.some((t) => t.harness)) {
    const hc = await env.compile(source, step.harness);
    result.harnessCompile = { ok: hc.ok, diagnostics: hc.diagnostics, stderr: hc.stderr };
    if (hc.ok) harnessModule = hc.module;
  }

  for (const test of tests) {
    env.onProgress?.({ type: 'test-start', id: test.id });
    let run;
    if (test.harness && !harnessModule) {
      run = { compileFailed: true, stdout: '', transcript: [] };
    } else {
      const world = test.world || step.world || null;
      run = await env.run(test.harness ? harnessModule : compiled.module, {
        stdin: test.stdin ?? '',
        world,
        timeoutMs: test.timeoutMs || timeoutMs,
      });
      run.timeoutMs = test.timeoutMs || timeoutMs;
    }
    const verdict = checkTest(test, run);
    const record = { id: test.id, checkpoint: test.checkpoint ?? null, pass: verdict.pass, failures: verdict.failures, run, test };
    result.tests.push(record);
    env.onProgress?.({ type: 'test-done', record });
  }

  result.requirementFailures = checkRequirements(source, step.require, compiled.diagnostics);
  result.passed = result.tests.length > 0 && result.tests.every((t) => t.pass) && result.requirementFailures.length === 0;
  return result;
}

/** Group test records by checkpoint (capstone missions). */
export function checkpointStatus(records) {
  const map = new Map();
  for (const r of records) {
    if (r.checkpoint == null) continue;
    const cur = map.get(r.checkpoint) ?? true;
    map.set(r.checkpoint, cur && r.pass);
  }
  return [...map.entries()].sort((a, b) => a[0] - b[0]).map(([checkpoint, pass]) => ({ checkpoint, pass }));
}
