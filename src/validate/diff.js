// Expected-vs-actual output diff for the test panel. Pure functions (shared by
// the browser and Node tests): a line alignment (LCS), then a character diff
// inside each pair of lines that differ.

function lcsTable(a, b, eq) {
  const n = a.length;
  const m = b.length;
  const t = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) t[i][j] = eq(a[i], b[j]) ? t[i + 1][j + 1] + 1 : Math.max(t[i + 1][j], t[i][j + 1]);
  }
  return t;
}

/** Edit script: [{ op: 'same'|'del'|'add', a?, b? }] turning `a` into `b`. */
function editScript(a, b, eq = (x, y) => x === y) {
  const t = lcsTable(a, b, eq);
  const out = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (eq(a[i], b[j])) out.push({ op: 'same', a: a[i++], b: b[j++] });
    else if (t[i + 1][j] >= t[i][j + 1]) out.push({ op: 'del', a: a[i++] });
    else out.push({ op: 'add', b: b[j++] });
  }
  while (i < a.length) out.push({ op: 'del', a: a[i++] });
  while (j < b.length) out.push({ op: 'add', b: b[j++] });
  return out;
}

/** Merge consecutive characters with the same flag into segments. */
function segments(chars) {
  const out = [];
  for (const { ch, diff } of chars) {
    const last = out[out.length - 1];
    if (last && last.diff === diff) last.text += ch;
    else out.push({ text: ch, diff });
  }
  return out;
}

/**
 * Character diff of two strings: { expected: [{text, diff}], actual: [{text, diff}] }.
 * Long lines fall back to a prefix/suffix comparison to keep the cost bounded.
 */
export function diffChars(exp, act) {
  if (exp.length * act.length > 40000) {
    let p = 0;
    while (p < exp.length && p < act.length && exp[p] === act[p]) p++;
    let s = 0;
    while (s < exp.length - p && s < act.length - p && exp[exp.length - 1 - s] === act[act.length - 1 - s]) s++;
    const part = (x) => [
      { text: x.slice(0, p), diff: false },
      { text: x.slice(p, x.length - s), diff: true },
      { text: x.slice(x.length - s), diff: false },
    ].filter((g) => g.text);
    return { expected: part(exp), actual: part(act) };
  }
  const ops = editScript([...exp], [...act]);
  const e = [];
  const a = [];
  for (const o of ops) {
    if (o.op === 'same') {
      e.push({ ch: o.a, diff: false });
      a.push({ ch: o.b, diff: false });
    } else if (o.op === 'del') e.push({ ch: o.a, diff: true });
    else a.push({ ch: o.b, diff: true });
  }
  return { expected: segments(e), actual: segments(a) };
}

/**
 * Side-by-side rows: [{ kind: 'same'|'changed'|'missing'|'extra', expected, actual }]
 * where expected/actual are segment arrays (or null when the line is absent).
 * The caller normalizes both texts first (see normalizeOutput).
 */
export function diffOutput(expectedText, actualText, { maxLines = 400 } = {}) {
  const el = expectedText.split('\n').slice(0, maxLines);
  const al = actualText.split('\n').slice(0, maxLines);
  const ops = editScript(el, al);
  const rows = [];
  for (let k = 0; k < ops.length; k++) {
    const o = ops[k];
    if (o.op === 'same') {
      rows.push({ kind: 'same', expected: [{ text: o.a, diff: false }], actual: [{ text: o.b, diff: false }] });
      continue;
    }
    // Pair a run of deletions with the following run of additions as "changed" lines.
    const dels = [];
    const adds = [];
    while (k < ops.length && ops[k].op === 'del') dels.push(ops[k++].a);
    while (k < ops.length && ops[k].op === 'add') adds.push(ops[k++].b);
    k--;
    const n = Math.max(dels.length, adds.length);
    for (let i = 0; i < n; i++) {
      if (i < dels.length && i < adds.length) {
        const d = diffChars(dels[i], adds[i]);
        rows.push({ kind: 'changed', expected: d.expected, actual: d.actual });
      } else if (i < dels.length) rows.push({ kind: 'missing', expected: [{ text: dels[i], diff: true }], actual: null });
      else rows.push({ kind: 'extra', expected: null, actual: [{ text: adds[i], diff: true }] });
    }
  }
  return rows;
}
