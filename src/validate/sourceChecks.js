// Structural checks on source code, used ONLY when a mission explicitly teaches a
// construct (e.g. "solve this with switch"). They never decide whether a program
// works — the compiled program's behaviour does that.

/** Remove comments, string literals and character literals, keeping line structure. */
export function stripCode(src) {
  let out = '';
  let i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i];
    const d = src[i + 1];
    if (c === '/' && d === '/') {
      while (i < n && src[i] !== '\n') i++;
    } else if (c === '/' && d === '*') {
      i += 2;
      while (i < n && !(src[i] === '*' && src[i + 1] === '/')) {
        if (src[i] === '\n') out += '\n';
        i++;
      }
      i += 2;
      out += ' ';
    } else if (c === '"' || c === "'") {
      const q = c;
      out += q === '"' ? '""' : "' '";
      i++;
      while (i < n && src[i] !== q && src[i] !== '\n') {
        if (src[i] === '\\') i++;
        i++;
      }
      i++;
    } else {
      out += c;
      i++;
    }
  }
  return out;
}

export function tokens(src) {
  return stripCode(src).match(/[A-Za-z_]\w*|\d[\w.]*|\+\+|--|[-+*/%]=|==|!=|<=|>=|&&|\|\||->|<<|>>|\S/g) || [];
}

/** Names of functions defined at file scope (heuristic: name(...) { at depth 0). */
export function definedFunctions(src) {
  const code = stripCode(src);
  const names = [];
  let depth = 0;
  const re = /([A-Za-z_]\w*)\s*\(([^()]*)\)\s*\{|[{}]/g;
  let m;
  while ((m = re.exec(code))) {
    if (m[0] === '{') depth++;
    else if (m[0] === '}') depth--;
    else {
      if (depth === 0 && !['if', 'while', 'for', 'switch'].includes(m[1])) names.push(m[1]);
      depth++;
    }
  }
  return names;
}

const CONSTRUCTS = {
  if: (t) => t.includes('if'),
  else: (t) => t.includes('else'),
  'else if': (t) => t.some((x, i) => x === 'else' && t[i + 1] === 'if'),
  switch: (t) => t.includes('switch'),
  case: (t) => t.includes('case'),
  break: (t) => t.includes('break'),
  continue: (t) => t.includes('continue'),
  default: (t) => t.includes('default'),
  while: (t) => t.includes('while'),
  for: (t) => t.includes('for'),
  do: (t) => t.includes('do'),
  '?:': (t) => t.includes('?'),
  '&&': (t) => t.includes('&&'),
  '||': (t) => t.includes('||'),
  '!': (t) => t.includes('!'),
  '%': (t) => t.includes('%') || t.includes('%='),
  '++': (t) => t.includes('++'),
  '--': (t) => t.includes('--'),
  '+=': (t) => t.includes('+='),
  '*=': (t) => t.includes('*='),
  '-=': (t) => t.includes('-='),
  '/=': (t) => t.includes('/='),
  cast: (t) => t.some((x, i) => x === '(' && ['double', 'int', 'float', 'long', 'char'].includes(t[i + 1]) && t[i + 2] === ')'),
  return: (t) => t.includes('return'),
  scanf: (t) => t.includes('scanf'),
  printf: (t) => t.includes('printf'),
  void: (t) => t.includes('void'),
  ',': (t) => t.includes(','),
  // a = b = ... (chained assignment)
  'chained=': (t) => t.some((x, i) => /^[A-Za-z_]\w*$/.test(x) && t[i + 1] === '=' && /^[A-Za-z_]\w*$/.test(t[i + 2] || '') && t[i + 3] === '='),
  sizeof: (t) => t.includes('sizeof'),
};

/** Lightweight, explainable style checks (used by the style-review mission). */
export function styleIssues(src, style) {
  const issues = [];
  const code = stripCode(src);
  const lines = code.split('\n');
  if (style.requireComment && !/\/\/|\/\*/.test(src)) issues.push({ code: 'styleComment' });
  if (style.maxStatementsPerLine) {
    lines.forEach((line, i) => {
      const noFor = line.replace(/\bfor\s*\([^)]*\)/g, 'for()');
      const count = (noFor.match(/;/g) || []).length;
      if (count > style.maxStatementsPerLine) issues.push({ code: 'styleStatements', params: { line: i + 1 } });
    });
  }
  if (style.requireIndent) {
    let depth = 0;
    lines.forEach((line, i) => {
      const trimmed = line.trim();
      if (!trimmed) return;
      const closesFirst = trimmed.startsWith('}');
      const expected = depth - (closesFirst ? 1 : 0);
      if (expected > 0 && !/^\s+/.test(line) && !trimmed.startsWith('#')) issues.push({ code: 'styleIndent', params: { line: i + 1 } });
      for (const ch of trimmed) {
        if (ch === '{') depth++;
        else if (ch === '}') depth--;
      }
    });
  }
  if (style.minNameLength) {
    const decl = /\b(?:int|double|float|char|long|short)\s+([A-Za-z_]\w*)/g;
    const allowed = new Set(style.allowShortNames || ['i', 'j', 'k', 'n', 'x', 'y']);
    for (const m of code.matchAll(decl)) {
      if (m[1].length < style.minNameLength && !allowed.has(m[1]) && m[1] !== 'main') issues.push({ code: 'styleName', params: { name: m[1] } });
    }
  }
  // De-duplicate repeated line complaints to keep feedback readable.
  const seen = new Set();
  return issues.filter((x) => {
    const k = x.code + (x.params?.name || '');
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/**
 * @param {string} src
 * @param {{constructs?:string[], forbid?:string[], functions?:string[], calls?:string[], includes?:string[], minCalls?:Record<string,number>}} req
 * @returns {Array<{code:string, params:object}>}
 */
export function checkRequirements(src, req, diagnostics = []) {
  if (!req) return [];
  const failures = [];
  for (const flag of req.noWarnings || []) {
    const d = diagnostics.find((x) => x.flag === flag);
    if (d) failures.push({ code: 'forbiddenWarning', params: { flag, line: d.line, message: d.message } });
  }
  if (req.style) failures.push(...styleIssues(src, req.style));
  const t = tokens(src);
  for (const c of req.constructs || []) {
    const f = CONSTRUCTS[c];
    if (f ? !f(t) : !t.includes(c)) failures.push({ code: 'requireConstruct', params: { construct: c } });
  }
  for (const c of req.forbid || []) {
    const f = CONSTRUCTS[c];
    if (f ? f(t) : t.includes(c)) failures.push({ code: 'forbidConstruct', params: { construct: c } });
  }
  const defs = definedFunctions(src);
  for (const fn of req.functions || []) {
    if (!defs.includes(fn)) failures.push({ code: 'requireFunction', params: { name: fn } });
  }
  for (const fn of req.calls || []) {
    const count = t.filter((x, i) => x === fn && t[i + 1] === '(').length;
    const isDefined = defs.includes(fn);
    if (count - (isDefined ? 1 : 0) < 1) failures.push({ code: 'requireCall', params: { name: fn } });
  }
  for (const [fn, min] of Object.entries(req.minCalls || {})) {
    const count = t.filter((x, i) => x === fn && t[i + 1] === '(').length - (defs.includes(fn) ? 1 : 0);
    if (count < min) failures.push({ code: 'requireCalls', params: { name: fn, min } });
  }
  for (const h of req.includes || []) {
    const re = new RegExp(`#\\s*include\\s*<${h.replace('.', '\\.')}>`);
    if (!re.test(stripCode(src))) failures.push({ code: 'requireInclude', params: { header: h } });
  }
  return failures;
}
