#!/usr/bin/env node
// Unit tests for the checker, source checks and diagnostics classification, plus
// sandbox tests that run real compiled C through the same WASI host as the game.
import { checkTest, extractNumbers, normalizeOutput } from '../src/validate/checker.js';
import { checkRequirements, stripCode, definedFunctions } from '../src/validate/sourceChecks.js';
import { classifyDiagnostic } from '../src/validate/feedback.js';
import { parseDiagnostics } from '../src/exec/toolchain.js';
import { compileC, runModule } from './lib/nodeExec.mjs';

let passes = 0;
let failures = 0;
const check = (cond, msg) => {
  if (cond) passes++;
  else {
    failures++;
    console.error('FAIL', msg);
  }
};
const ok = (stdout, extra = {}) => ({ exitCode: 0, stdout, transcript: [], ...extra });

// ---------------------------------------------------------------- checker
check(normalizeOutput('a  \r\nb\n\n\n') === 'a\nb', 'normalizeOutput trims trailing spaces and blank lines');
check(JSON.stringify(extractNumbers('1st number? The sum is -7.5. x2 3e2')) === '[-7.5,300]', 'extractNumbers ignores numbers glued to words');
check(checkTest({ expect: { output: 'The sum is 3.25.' , tolerance: 0.001 } }, ok('The sum is 3.250000.\n')).pass, 'output compare with numeric tolerance');
check(!checkTest({ expect: { output: 'The sum is 3.25.' } }, ok('The sum is 3.250000.\n')).pass, 'output compare is exact without tolerance');
check(checkTest({ expect: { contains: ['sum is 7.'] } }, ok('1st? 2nd? The sum is 7.\n')).pass, 'contains finds text after prompts');
check(!checkTest({ expect: { contains: ['b', 'a'] } }, ok('a b')).pass, 'contains respects order');
check(checkTest({ expect: { lines: ['GO'], exactLineCount: true } }, ok('GO\n')).pass, 'exact single line');
check(!checkTest({ expect: { lines: ['GO'], exactLineCount: true } }, ok('STOP\nGO\n')).pass, 'extra lines rejected');
check(checkTest({ expect: { numbers: [12, 5] } }, ok('Enter: 3 4\nresult 12 and 5\n')).pass, 'numbers suffix');
check(checkTest({ expect: { regex: { pattern: 'Delay:\\s*(\\S+)', values: [3.335668e-6], tolerance: 1e-11 } } }, ok('Delay: 3.335668e-06 s')).pass, 'regex with numeric value');
check(checkTest({ expect: { exitCode: 3, output: '' } }, { exitCode: 3, stdout: '' }).pass, 'custom exit code');
check(!checkTest({ expect: { output: 'x' } }, { exitCode: null, stdout: 'x', timedOut: true, timeoutMs: 3000 }).pass, 'timeout fails even with right output');
check(checkTest({ expect: { world: { allRepaired: true, robotAt: [2, 0] } } }, ok('', { world: { summary: { x: 2, y: 0, remainingDamage: [], moves: 2, blocked: 0, wastedRepairs: 0, repairs: 1 } } })).pass, 'world expectations');
check(checkTest({ expect: { world: { allRepaired: true } } }, ok('', { world: { summary: { x: 0, y: 0, remainingDamage: [[1, 0, 1]], moves: 0, blocked: 0, wastedRepairs: 0, repairs: 0 } } })).failures[0].code === 'worldDamageLeft', 'damage left reported');

// ---------------------------------------------------------------- source checks
check(!stripCode('/* switch */ int x = 1; // switch\nchar *s = "switch";').includes('switch'), 'stripCode removes comments and strings');
check(checkRequirements('int main(void){ /* switch */ return 0; }', { constructs: ['switch'] }).length === 1, 'construct in a comment does not count');
check(checkRequirements('int main(void){ int a,b; a = b = 1; return a; }', { constructs: ['chained='] }).length === 0, 'chained assignment detected');
check(JSON.stringify(definedFunctions('int max(int a, int b);\nint max(int a, int b)\n{ if (a > b) { return a; } return b; }\nint main(void) { return 0; }')) === '["max","main"]', 'definedFunctions ignores prototypes and blocks');
check(checkRequirements('int main(void){return 0;}', { noWarnings: ['-Wunsequenced'] }, [{ flag: '-Wunsequenced', line: 1, message: 'x' }]).length === 1, 'forbidden warning reported');

// ---------------------------------------------------------------- diagnostics
const diags = parseDiagnostics(`main.c:5:12: error: unexpected character <U+201C>
    5 |     printf(“BEACON\\n”);
      |            ^
main.c:6:5: error: call to undeclared library function 'printf' with type 'int (const char *, ...)'; ISO C99 and later do not support implicit function declarations [-Wimplicit-function-declaration]
main.c:7:9: warning: using the result of an assignment as a condition without parentheses [-Wparentheses]
wasm-ld: error: /tmp/main-1.o: undefined symbol: helper
2 errors generated.`);
check(diags.length === 4 && diags[0].line === 5 && diags[0].context.length === 2, 'parseDiagnostics: lines, columns, context');
check(diags[1].flag === '-Wimplicit-function-declaration', 'parseDiagnostics: flag extracted');
check(classifyDiagnostic(diags[0]).key === 'smartQuote', 'classify smart quotes');
check(classifyDiagnostic(diags[1]).key === 'undeclaredFunction' && classifyDiagnostic(diags[1]).params[0] === 'printf', 'classify undeclared function');
check(classifyDiagnostic(diags[2]).key === 'assignInCondition', 'classify = in condition');
check(diags[3].linker && classifyDiagnostic(diags[3]).key === 'linkerUndefined', 'classify linker error');

// ---------------------------------------------------------------- sandbox (real compiler + WASI host)
async function runC(src, opts = {}) {
  const c = await compileC(src);
  if (!c.ok) return { compile: c };
  return { compile: c, run: await runModule(c.module, { timeoutMs: 2000, ...opts }) };
}

{
  const r = await runC('int main(void) { while (1) {} }');
  check(r.run.timedOut, 'infinite loop is stopped by the time limit');
}
{
  const r = await runC('#include <stdio.h>\nint main(void) { for (;;) printf("spam spam spam\\n"); }');
  check(r.run.outputLimitExceeded && r.run.stdout.length <= 64 * 1024, 'endless output is cut at 64 KB');
}
{
  const r = await runC('#include <stdio.h>\nint main(void) { int a, b; scanf("%d %d", &a, &b); printf("%d\\n", a / b); return 0; }', { stdin: '7 0' });
  check(r.run.trap && r.run.trap.kind === 'runtimeCheck' && r.run.trap.func === 'main', 'integer division by zero traps in main');
}
{
  const r = await runC('#include <limits.h>\n#include <stdio.h>\nint main(void) { int x; scanf("%d", &x); printf("%d\\n", x + INT_MAX); return 0; }', { stdin: '1' });
  check(r.run.trap, 'signed overflow is caught at run time');
}
{
  const r = await runC('int f(int n) { return f(n + 1) + 1; }\nint main(void) { return f(0); }');
  check(r.run.trap && r.run.trap.kind === 'stackOverflow', 'runaway recursion reported as stack overflow');
}
{
  const r = await runC('#include "/etc/passwd"\nint main(void) { return 0; }');
  check(!r.compile.ok && /not found/.test(r.compile.stderr), 'compiler cannot read host files');
}
{
  const r = await runC('#include <stdio.h>\nint main(void) { FILE *f = fopen("/etc/passwd", "r"); printf(f ? "OPEN\\n" : "NO FILE\\n"); return 0; }');
  check(r.run && r.run.stdout === 'NO FILE\n', 'program cannot open host files');
}
{
  const r = await runC('#include <stdio.h>\nint main(void) { int n, s = 0; while (scanf("%d", &n) == 1) s += n; printf("%d\\n", s); return 0; }', { stdin: '1 2 3' });
  check(r.run.stdout === '6\n' && r.run.exitCode === 0, 'reading until end of input works');
}
{
  const r = await runC('#include <stdio.h>\nint main(void) { printf("a"); fprintf(stderr, "e"); printf("b\\n"); return 2; }');
  check(r.run.exitCode === 2 && r.run.stdout === 'ab\n' && r.run.stderr === 'e', 'exit code, stdout and stderr captured');
}
{
  const r = await runC('#include <stdio.h>\nint main(void) { int x; printf("? "); scanf("%d", &x); printf("got %d\\n", x); return 0; }', { stdin: '5\n' });
  const kinds = r.run.transcript.map((s) => s.kind).join(',');
  check(kinds === 'out,in,out', 'transcript interleaves prompt, echoed input and output');
}
{
  const r = await runC('#include <island.h>\nint main(void) { robot_move(\'E\'); return 0; }');
  check(r.run.trap && r.run.trap.kind === 'islandUnavailable', 'island API unavailable outside grid missions');
}
{
  const r = await runC('#include <island.h>\n#include <stdio.h>\nint main(void) { int moved = robot_move(\'W\'); robot_repair(); printf("%d %d %d\\n", moved, robot_x(), robot_scan()); return 0; }', { world: { width: 3, height: 1, damage: [[0, 0, 2]] } });
  check(r.run.stdout === '0 0 0\n' && r.run.world.summary.blocked === 1 && r.run.world.summary.repairs === 1, 'island API: blocked move, repair, scan');
}

console.log(`${passes} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);
