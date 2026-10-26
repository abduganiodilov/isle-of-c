// Behavioural test checking. Every check here looks at what the compiled
// program actually did (its stdout, exit status, traps, or island API calls).
// Results carry message codes + params; the UI translates them.

const NUM_RE = /(?<![\w.])[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?(?![\w])/g;

export function normalizeOutput(text) {
  return text
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((l) => l.replace(/[ \t]+$/, ''))
    .join('\n')
    .replace(/\n+$/, '');
}

export function collapseSpaces(text) {
  return text.replace(/\r\n?/g, '\n').replace(/[ \t]+/g, ' ').replace(/ ?\n ?/g, '\n').trim();
}

export function extractNumbers(text) {
  return [...text.matchAll(NUM_RE)].map((m) => Number(m[0].replace(/\.$/, '')));
}

export function numbersClose(actual, expected, tol) {
  if (Number.isNaN(actual)) return false;
  if (tol == null) return actual === expected;
  return Math.abs(actual - expected) <= tol + 1e-12 * Math.abs(expected);
}

/** Split text into alternating literal/number tokens for tolerant comparison. */
function tokenize(text) {
  const out = [];
  let last = 0;
  for (const m of text.matchAll(NUM_RE)) {
    if (m.index > last) out.push({ t: 's', v: text.slice(last, m.index) });
    out.push({ t: 'n', v: Number(m[0]), raw: m[0] });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ t: 's', v: text.slice(last) });
  return out;
}

function textEqualTolerant(actual, expected, tol, ignoreCase) {
  const norm = (s) => (ignoreCase ? s.toLowerCase() : s);
  if (tol == null) return norm(actual) === norm(expected);
  const a = tokenize(actual);
  const e = tokenize(expected);
  if (a.length !== e.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i].t !== e[i].t) return false;
    if (a[i].t === 's' && norm(a[i].v) !== norm(e[i].v)) return false;
    if (a[i].t === 'n' && !numbersClose(a[i].v, e[i].v, tol)) return false;
  }
  return true;
}

/** Does `haystack` contain `needle` (tolerant of numbers formatting when tol given)? */
function containsTolerant(haystack, needle, tol, ignoreCase) {
  const h = ignoreCase ? haystack.toLowerCase() : haystack;
  const n = ignoreCase ? needle.toLowerCase() : needle;
  if (h.includes(n)) return h.indexOf(n) + n.length;
  if (tol == null) return -1;
  // Build a regex where each number in the needle matches any number, then verify values.
  const parts = tokenize(n);
  const src = parts
    .map((p) => (p.t === 's' ? p.v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') : '([-+]?(?:\\d+\\.?\\d*|\\.\\d+)(?:[eE][-+]?\\d+)?)'))
    .join('');
  const re = new RegExp(src, 'g');
  const expectedNums = parts.filter((p) => p.t === 'n').map((p) => p.v);
  for (const m of h.matchAll(re)) {
    const vals = m.slice(1).map(Number);
    if (vals.every((v, i) => numbersClose(v, expectedNums[i], tol))) return m.index + m[0].length;
  }
  return -1;
}

/**
 * Check one test against one run result.
 * @returns {{pass:boolean, failures:Array<{code:string, params?:object}>}}
 */
export function checkTest(test, run) {
  const expect = test.expect || {};
  const failures = [];
  const tol = expect.tolerance;
  const ic = !!expect.ignoreCase;

  if (run.compileFailed) return { pass: false, failures: [{ code: 'compileFailed' }] };
  if (run.timedOut) failures.push({ code: 'timeout', params: { seconds: (run.timeoutMs || 0) / 1000 } });
  if (run.outputLimitExceeded) failures.push({ code: 'outputLimit' });
  if (run.trap) failures.push({ code: 'trap', params: { kind: run.trap.kind, func: run.trap.func } });
  const wantExit = expect.exitCode ?? 0;
  if (!run.timedOut && !run.trap && !run.outputLimitExceeded && expect.exitCode !== 'any' && run.exitCode !== wantExit) {
    failures.push({ code: 'exitCode', params: { expected: wantExit, actual: run.exitCode } });
  }

  const stdout = run.stdout || '';
  const out = normalizeOutput(stdout);

  if (expect.output != null) {
    const exp = normalizeOutput(expect.output);
    const ok = expect.collapseSpaces
      ? textEqualTolerant(collapseSpaces(out), collapseSpaces(exp), tol, ic)
      : textEqualTolerant(out, exp, tol, ic);
    if (!ok) failures.push({ code: 'outputMismatch', params: { diffLine: firstDiffLine(out, exp) } });
  }

  if (expect.contains) {
    let hay = collapseSpaces(out);
    for (const frag of expect.contains) {
      const f = collapseSpaces(frag);
      const pos = containsTolerant(hay, f, tol, ic);
      if (pos < 0) {
        failures.push({ code: 'missingText', params: { text: frag } });
        break;
      }
      if (expect.inOrder !== false) hay = hay.slice(pos);
    }
  }

  if (expect.notContains) {
    const hay = collapseSpaces(out);
    for (const frag of expect.notContains) {
      if ((ic ? hay.toLowerCase() : hay).includes(ic ? collapseSpaces(frag).toLowerCase() : collapseSpaces(frag))) {
        failures.push({ code: 'unexpectedText', params: { text: frag } });
      }
    }
  }

  if (expect.lines) {
    const actualLines = out.split('\n').map((l) => collapseSpaces(l));
    let i = 0;
    for (const line of expect.lines) {
      const want = collapseSpaces(line);
      while (i < actualLines.length && !textEqualTolerant(actualLines[i], want, tol, ic)) i++;
      if (i >= actualLines.length) {
        failures.push({ code: 'missingLine', params: { text: line } });
        break;
      }
      i++;
    }
    if (expect.exactLineCount && out.split('\n').filter((l) => l.trim()).length !== expect.lines.length) {
      failures.push({ code: 'lineCount', params: { expected: expect.lines.length, actual: out.split('\n').filter((l) => l.trim()).length } });
    }
  }

  if (expect.numbers) {
    const nums = extractNumbers(out);
    const want = expect.numbers;
    const mode = expect.numbersMode || 'suffix';
    let ok;
    if (mode === 'exact') ok = nums.length === want.length && want.every((v, i) => numbersClose(nums[i], v, tol));
    else if (mode === 'suffix') {
      const tail = nums.slice(nums.length - want.length);
      ok = nums.length >= want.length && want.every((v, i) => numbersClose(tail[i], v, tol));
    } else {
      // subsequence
      let j = 0;
      for (const n of nums) if (j < want.length && numbersClose(n, want[j], tol)) j++;
      ok = j === want.length;
    }
    if (!ok) failures.push({ code: 'numbersMismatch', params: { expected: want.join(' '), actual: (mode === 'suffix' ? nums.slice(-want.length - 2) : nums).join(' ') } });
  }

  if (expect.regex) {
    const specs = Array.isArray(expect.regex) ? expect.regex : [expect.regex];
    for (const spec of specs) {
      const re = new RegExp(spec.pattern, spec.flags || '');
      const m = re.exec(out);
      if (!m) {
        failures.push({ code: 'patternMissing', params: { describe: spec.describe || spec.pattern } });
        continue;
      }
      if (spec.values) {
        spec.values.forEach((v, i) => {
          const got = m[i + 1];
          const ok = typeof v === 'number' ? numbersClose(Number(got), v, spec.tolerance ?? tol) : got === v;
          if (!ok) failures.push({ code: 'valueMismatch', params: { describe: spec.describe || spec.pattern, expected: v, actual: got } });
        });
      }
    }
  }

  if (expect.world) {
    const w = expect.world;
    const s = run.world && run.world.summary;
    if (!s) failures.push({ code: 'noWorld' });
    else {
      if (w.allRepaired && s.remainingDamage.length) failures.push({ code: 'worldDamageLeft', params: { count: s.remainingDamage.length } });
      if (w.robotAt && (s.x !== w.robotAt[0] || s.y !== w.robotAt[1])) failures.push({ code: 'worldRobotAt', params: { expected: w.robotAt.join(','), actual: `${s.x},${s.y}` } });
      if (w.maxMoves != null && s.moves > w.maxMoves) failures.push({ code: 'worldTooManyMoves', params: { max: w.maxMoves, actual: s.moves } });
      if (w.noBlocked && s.blocked > 0) failures.push({ code: 'worldBlocked', params: { count: s.blocked } });
      if (w.noWastedRepairs && s.wastedRepairs > 0) failures.push({ code: 'worldWasted', params: { count: s.wastedRepairs } });
      if (w.minRepairs != null && s.repairs < w.minRepairs) failures.push({ code: 'worldDamageLeft', params: { count: w.minRepairs - s.repairs } });
    }
  }

  return { pass: failures.length === 0, failures };
}

function firstDiffLine(actual, expected) {
  const a = actual.split('\n');
  const e = expected.split('\n');
  for (let i = 0; i < Math.max(a.length, e.length); i++) if (a[i] !== e[i]) return i + 1;
  return 0;
}

/** Human-readable "expected" summary for a test, shown in the test panel. */
export function describeExpectation(test) {
  const e = test.expect || {};
  if (e.output != null) return e.output;
  const parts = [];
  if (e.lines) parts.push(...e.lines);
  if (e.contains) parts.push(...e.contains.map((c) => `… ${c} …`));
  if (e.numbers) parts.push(`numbers: ${e.numbers.join(' ')}`);
  if (e.regex) for (const r of [].concat(e.regex)) parts.push(r.describe || `/${r.pattern}/`);
  if (e.world) {
    if (e.world.allRepaired) parts.push('all damaged tiles repaired');
    if (e.world.robotAt) parts.push(`robot ends at (${e.world.robotAt.join(', ')})`);
  }
  return parts.join('\n');
}
