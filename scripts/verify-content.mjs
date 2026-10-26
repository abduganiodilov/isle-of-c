#!/usr/bin/env node
// Compiles and runs EVERY reference solution against its tests with the same
// compiler and checker the game uses. Also verifies that:
//   - representative wrong solutions (step.wrong) fail,
//   - starter code does not already pass (unless starterPasses: true),
//   - predict-step answers match what the program really prints,
//   - runnable lesson examples compile,
//   - mastery retry tests pass with the reference solution.
//
//   node scripts/verify-content.mjs [--only <mission-id-prefix>] [--curriculum <file>]

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { compileC, runModule } from './lib/nodeExec.mjs';
import { assessStep } from '../src/engine/assess.js';
import { normalizeOutput } from '../src/validate/checker.js';
import { lessonExamples } from '../src/engine/lessonExamples.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = (n, d) => (args.includes(n) ? args[args.indexOf(n) + 1] : d);
const only = opt('--only', '');
const file = opt('--curriculum', path.join(ROOT, 'src/generated/curriculum.json'));
const cur = JSON.parse(fs.readFileSync(file, 'utf8'));

const env = { compile: compileC, run: runModule };
let failures = 0;
let checks = 0;
const fail = (where, msg) => {
  failures++;
  console.error(`FAIL  ${where}: ${msg}`);
};

function summarize(res) {
  if (!res.compile.ok) return 'compile error: ' + res.compile.diagnostics.filter((d) => d.severity === 'error').map((d) => `${d.line}: ${d.message}`).join('; ');
  const bad = res.tests.filter((t) => !t.pass).map((t) => `${t.id} [${t.failures.map((f) => f.code + (f.params ? JSON.stringify(f.params) : '')).join(', ')}] stdout=${JSON.stringify((t.run.stdout || '').slice(0, 200))}`);
  const req = res.requirementFailures.map((f) => f.code + JSON.stringify(f.params || {}));
  return [...bad, ...req].join(' | ');
}

for (const m of cur.missions) {
  if (only && !m.id.startsWith(only)) continue;
  const where = m.id;
  const t0 = Date.now();
  // Runnable examples in every language version of the lesson must compile.
  const lessons = [m.lesson || '', ...Object.values(cur.i18n || {}).map((d) => d[`${m._k}.lesson`] || '')];
  for (const ex of lessons.flatMap((l) => lessonExamples(l))) {
    checks++;
    const c = await compileC(ex.code);
    if (!c.ok && !ex.expectError) fail(`${where} lesson example`, 'does not compile: ' + c.diagnostics.map((d) => d.message).join('; '));
    if (c.ok && ex.expectError) fail(`${where} lesson example`, 'was expected to show a compile/link error but compiled');
  }
  for (const s of m.steps) {
    const sw = `${where} [${s.id}]`;
    if (s.type === 'code') {
      checks++;
      const res = await assessStep(s, s.solution, env);
      if (!res.passed) fail(sw, 'reference solution fails: ' + summarize(res));
      const warns = (res.compile.diagnostics || []).filter((d) => d.severity === 'warning');
      if (warns.length) fail(sw, 'reference solution has warnings: ' + warns.map((d) => `${d.line}: ${d.message}`).join('; '));
      if (!s.starterPasses) {
        checks++;
        const sr = await assessStep(s, s.starter, env);
        if (sr.passed) fail(sw, 'starter code already passes all tests');
      }
      for (const [i, w] of (s.wrong || []).entries()) {
        checks++;
        const wr = await assessStep(s, w.code, env);
        if (wr.passed) fail(sw, `wrong solution #${i + 1} (${w.why || ''}) unexpectedly passes`);
        if (w.expect) {
          const codes = new Set([
            ...wr.tests.flatMap((t) => t.failures.map((f) => f.code)),
            ...wr.requirementFailures.map((f) => f.code),
            ...(wr.compile.ok ? [] : ['compileError']),
          ]);
          if (!codes.has(w.expect)) fail(sw, `wrong solution #${i + 1} should fail with ${w.expect}, got ${[...codes].join(',')}`);
        }
      }
      if (m.mastery?.retry?.tests) {
        checks++;
        const rr = await assessStep(s, m.mastery.retry.solution || s.solution, { ...env, tests: m.mastery.retry.tests });
        if (!rr.passed) fail(sw, 'retry tests fail with reference solution: ' + summarize(rr));
      }
    }
    if (s.type === 'predict') {
      checks++;
      const c = await compileC(s.code);
      if (!c.ok) {
        if (!s.expectCompileError) fail(sw, 'predict code does not compile: ' + c.diagnostics.map((d) => d.message).join('; '));
        continue;
      }
      if (s.expectCompileError) fail(sw, 'predict step expected a compile error');
      const r = await runModule(c.module, { stdin: s.stdin || '', timeoutMs: 3000 });
      const actual = normalizeOutput(r.stdout || '');
      const expected = s.answer.kind === 'output' ? s.answer.output : s.answer.actualOutput;
      if (expected != null && actual !== normalizeOutput(expected)) fail(sw, `predicted/expected output ${JSON.stringify(expected)} but program prints ${JSON.stringify(actual)}`);
      if (expected == null) fail(sw, 'predict step must record answer.output or answer.actualOutput');
    }
  }
  console.log(`ok    ${where} (${Date.now() - t0} ms)`);
}

console.log(`\n${checks} checks, ${failures} failure(s).`);
process.exit(failures ? 1 : 0);
