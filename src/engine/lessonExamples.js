// Finds runnable examples in lesson markdown.
//   ```c example        -> runnable example (must compile)
//   ```c example error  -> example that demonstrates a compile/link error
//   ```c example stdin=3\n4   -> runnable with the given input (\n = newline)
//   ```c                -> plain code listing (not run)

export function lessonExamples(markdown) {
  const out = [];
  const re = /```c[ \t]+example([^\n]*)\n([\s\S]*?)```/g;
  let m;
  while ((m = re.exec(markdown))) {
    const info = m[1];
    const stdinMatch = /stdin=(\S+)/.exec(info);
    out.push({
      code: m[2],
      expectError: /\berror\b/.test(info),
      stdin: stdinMatch ? stdinMatch[1].replace(/\\n/g, '\n') : '',
    });
  }
  return out;
}
