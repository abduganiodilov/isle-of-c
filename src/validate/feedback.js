// Maps raw compiler diagnostics, runtime traps and test failures to keys of
// beginner-friendly explanations (texts live in src/i18n/*.js). The raw
// compiler message is always shown as well — the explanation never replaces it.

const DIAGNOSTIC_RULES = [
  { key: 'smartQuote', re: /U\+201[CDEF89]|U\+2018|U\+2019|non-ASCII characters|unexpected character <U\+/ },
  { key: 'missingSemicolon', re: /expected ';'/ },
  { key: 'undeclaredFunction', re: /call to undeclared (?:library )?function '([^']+)'/ },
  { key: 'undeclaredIdentifier', re: /use of undeclared identifier '([^']+)'/ },
  { key: 'linkerUndefined', re: /undefined symbol: (\S+)/ },
  { key: 'missingAmpersand', re: /format specifies type '(int|double|float|char|long|short|unsigned int) \*' but the argument has type '(int|double|float|char|long|short|unsigned int)'/ },
  { key: 'formatMismatch', re: /format specifies type '([^']+)' but the argument has type '([^']+)'/ },
  { key: 'formatArgs', re: /more '%' conversions than data arguments|data argument not used by format string/ },
  { key: 'assignInCondition', re: /using the result of an assignment as a condition/ },
  { key: 'unsequenced', re: /unsequenced modification/ },
  { key: 'uninitialized', re: /is uninitialized when used|may be uninitialized|uninitialized when used here|used uninitialized/ },
  { key: 'fallthrough', re: /unannotated fall-through/ },
  { key: 'emptyBody', re: /has empty body/ },
  { key: 'missingBrace', re: /expected '}'|extraneous closing brace|expected function body/ },
  { key: 'missingParen', re: /expected '\)'/ },
  { key: 'unterminatedString', re: /missing terminating '?"'? character|missing terminating/ },
  { key: 'noReturn', re: /non-void function does not return a value|control reaches end of non-void function|non-void function '.*' should return a value/ },
  { key: 'voidReturn', re: /void function '.*' should not return a value/ },
  { key: 'argCount', re: /too (few|many) arguments to function call/ },
  { key: 'resultUnused', re: /(equality|relational) comparison result unused|expression result unused/ },
  { key: 'unusedVariable', re: /unused variable|variable '.*' set but not used/ },
  { key: 'redefinition', re: /redefinition of|conflicting types for/ },
  { key: 'expectedExpression', re: /expected expression/ },
  { key: 'expectedIdentifier', re: /expected identifier|invalid suffix|invalid digit/ },
  { key: 'switchType', re: /statement requires expression of integer type/ },
  { key: 'breakOutside', re: /'(break|continue)' statement not in/ },
  { key: 'divisionByZero', re: /division by zero|remainder by zero/ },
  { key: 'literalConversion', re: /implicit conversion from '(double|float)' to '(int|char|short|long)' changes value/ },
  { key: 'misleadingIndentation', re: /misleading indentation|does not guard/ },
  { key: 'infiniteRecursion', re: /all paths through this function will call itself/ },
  { key: 'noMain', re: /undefined symbol: main|undefined symbol: __main_argc_argv|undefined symbol: __original_main/ },
  { key: 'includeNotFound', re: /file not found/ },
  { key: 'mainSignature', re: /'main' must return 'int'|second parameter of 'main'/ },
  { key: 'pointerInt', re: /incompatible (integer to pointer|pointer to integer) conversion/ },
];

/** @returns {{key:string, params:string[]}|null} */
export function classifyDiagnostic(d) {
  if (d.linker && /undefined symbol: (main|__main_argc_argv|__original_main)\b/.test(d.message)) return { key: 'noMain', params: [] };
  for (const rule of DIAGNOSTIC_RULES) {
    const m = rule.re.exec(d.message);
    if (m) return { key: rule.key, params: m.slice(1).filter(Boolean) };
  }
  return null;
}

/** Order diagnostics: errors first, the first error flagged as "start here". */
export function sortDiagnostics(diags) {
  const errors = diags.filter((d) => d.severity === 'error');
  const warnings = diags.filter((d) => d.severity === 'warning');
  const notes = diags.filter((d) => d.severity === 'note');
  return [...errors, ...warnings, ...notes];
}

export function hiddenRuntimeFile(d) {
  return d.file && /isle_runtime\.c|harness\.c/.test(d.file);
}
