# Notes for development agents

Isle of C is a browser game that teaches C17 from lecture slides. The engine (`src/`) is
generic; the curriculum is data in `content/` (YAML).

* **Given a new lecture PDF:** follow `docs/ADDING_A_LECTURE.md` exactly. Append chapters,
  never rename/reorder/delete published ids (`content/ids.lock.json`), translate to Russian,
  bump `curriculumVersion`, then run `npm test` (must be 0 failures) and `npm run e2e`.
* Content format: `docs/CONTENT_SCHEMA.md`. Architecture and the execution sandbox:
  `docs/ARCHITECTURE.md`. Coverage map (generated): `docs/COVERAGE.md`.
* Grading is behavioural (real compilation with Clang → WebAssembly, real runs). Do not add
  regex-on-source checks except `require` rules for constructs a mission explicitly teaches.
* Shared modules used by both the browser and Node scripts: `src/exec/toolchain.js`,
  `src/exec/wasiRunner.js`, `src/engine/assess.js`, `src/validate/*`. Keep them free of
  browser-only or Node-only APIs.
* No university branding or lecturer names anywhere in the app or content.
