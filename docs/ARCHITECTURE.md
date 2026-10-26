# Architecture

Isle of C is a static web application (React + Vite) with **no server-side code**. The C
compiler, the program execution and the assessment all run in the player's browser.

```
                ┌──────────────────────────── browser tab ─────────────────────────────┐
 content/*.yaml │  React UI (src/ui, src/world)                                         │
   │ build      │     │ compile(source)                    │ run(wasm, stdin, world)    │
   ▼            │     ▼                                    ▼                            │
 curriculum.json│  Compiler Web Worker              Runner Web Worker                   │
 (bundled)      │  Clang 22 + wasm-ld (WASM)        WebAssembly.Instance + tiny WASI    │
                │  virtual FS: main.c, island.h,    host: stdin text, stdout/stderr,    │
                │  libc headers — nothing else      island.h imports — nothing else     │
                │     │ program.wasm ──────────────────────▶ │                          │
                │                                   terminated on timeout / Stop        │
                └───────────────────────────────────────────────────────────────────────┘
```

## Modules

| Area | Files | Responsibility |
|---|---|---|
| Curriculum | `content/`, `scripts/build-content.mjs`, `src/engine/curriculum.js` | Content data, validation, coverage, translation keys, unlock rules, campaign completion |
| Execution | `src/exec/toolchain.js`, `compilerWorker.js`, `runnerWorker.js`, `wasiRunner.js`, `engine.js` | Compiler flags, in-browser compilation, sandboxed execution, time/output limits |
| Validation | `src/engine/assess.js`, `src/validate/checker.js`, `sourceChecks.js`, `feedback.js` | Run tests on the real program, compare behaviour, optional construct requirements, beginner explanations of diagnostics |
| Persistence | `src/engine/progress.js`, `src/state/store.js` | Versioned save format, migrations, repair, export/import, localStorage |
| World | `src/world/` | Scenes that visualise real results (output, tests, API trace) |
| Interface | `src/ui/`, `src/i18n/` | Screens, editor (CodeMirror 6), console, hints, settings, EN/RU strings |

`assess.js`, `checker.js`, `sourceChecks.js`, `wasiRunner.js` and `toolchain.js` are plain
ES modules shared by the browser and the Node scripts, so `npm test` grades programs with
exactly the code the game uses.

## Compilation

* Toolchain: `@yowasp/clang` 22 (Clang + LLD compiled to WebAssembly, ships wasi-libc).
  `scripts/copy-toolchain.mjs` copies it to `public/toolchain/clang-<version>/`; the compiler
  worker imports it at run time. The ~100 MB download is cached by the browser
  (HTTP cache + Cache API); `npm start` serves precompressed files (~27 MB).
* Command: `clang --target=wasm32-wasip1 -std=c17 -Wall -Wextra -Wimplicit-fallthrough -O0
  -fno-color-diagnostics -fsanitize=undefined -fsanitize-trap=undefined -I /game/include
  -Wl,--max-memory=64MiB -Wl,-z,stack-size=1MiB main.c game/isle_runtime.c -o program.wasm -lm`
  (see `compileArgs()` in `src/exec/toolchain.js`).
* `game/isle_runtime.c` only makes stdout unbuffered so prompts appear before input is read,
  the way an interactive terminal behaves.
* Test harnesses (missions about functions) are compiled with `-Dmain=student_main` plus a
  `harness.c` that calls the player's functions directly. The harness is shown in the tests
  panel as "test harness".
* Compiler output is parsed into structured diagnostics (`parseDiagnostics`) and shown both
  raw and with a beginner explanation (`src/validate/feedback.js`).
* Source size is limited to 64 KB. Compiled results are cached per source text.

## Execution and isolation

The compiled program runs in a dedicated Web Worker (`runnerWorker.js`) through a minimal
WASI preview-1 host written for this game (`wasiRunner.js`):

* **stdin** is the Input box text, delivered one line per read call (so the transcript can
  show input where a terminal echoes it); end of input = end of file.
* **stdout/stderr** are captured and streamed to the page; output is capped at 64 KB.
* **No file system, network, environment, arguments or real clock**: preopened directories
  do not exist, `fopen` fails, the clock and random source are fixed so runs are
  reproducible, any other WASI call returns `ENOSYS`.
* **Time limit**: the main thread starts a timer when the program starts (3 s by default,
  4 s for the capstone) and terminates the worker when it expires; **Stop** does the same.
  A new worker is created for the next run, so infinite loops can never freeze the page.
* **Memory**: linear memory is capped at 64 MB, stack at 1 MB; stack exhaustion is reported
  as "stack overflow".
* **Undefined behaviour**: signed overflow, division by zero, invalid shifts etc. trap via
  `-fsanitize-trap=undefined` and are reported as runtime errors with the function name.
* The worker has no access to the page DOM, cookies or `localStorage` of the game.

Because untrusted code is compiled and executed only inside the player's own browser
sandbox, there are no server secrets, host files or server resources to protect.

## Assessment

`assessStep()` compiles the program, runs **every test case** on the compiled program (fresh
instance per test), and checks behaviour with `checkTest()`:

* `output` (exact after trailing-whitespace normalisation, optional numeric tolerance),
  `contains` (ordered fragments), `lines`, `numbers` (with tolerance), `regex` with captured
  values, `exitCode`, and `world` (island API outcomes: all repaired, robot position,
  no bumps, no wasted repairs, move budget).
* Timeouts, output limit and traps always fail a test with an explanation.
* `require` adds structural checks **only when a mission teaches a construct** (e.g. "use
  switch", "define `max`", "no `-Wunsequenced` warning", style rules). They never replace
  behavioural tests.
* Multiple correct approaches pass: tests look at behaviour, not at the source text.

Failed tests show input, expected behaviour, the actual transcript and the reason.

## The game world and the island API

Scenes only display real data:

| Scene | Driven by |
|---|---|
| `terminal`, `table` | the program's real stdout |
| `gauges` | numbers parsed (regex) from the real stdout |
| `sorter` | one crate per test input; the program's output selects the bin |
| `pipeline` | the real compile/link result (compile error vs. link error vs. success) |
| `grid` | **replay of the recorded `island.h` calls** made by the program |
| `core` | which checkpoint tests passed |
| `frames` | an explicitly labelled *illustration* (call by value); the real output is shown below it |

`island.h` (game API, not standard C) declares `robot_move`, `robot_scan`, `robot_repair`,
`robot_x`, `robot_y` as WebAssembly imports. During execution the runner calls the grid
model (`src/world/gridModel.js`) synchronously and records each call (max 5000). The grid
scene replays that log; tests check the final state. Using the API in a mission without a
grid stops the program with a clear error.

## Persistence

`localStorage["isle-of-c.save"]` holds `{ schemaVersion, settings, missions{id → record},
drafts{"missionId#stepId" → code/stdin}, sandbox, endingsSeen, lastMission, achievements{id →
time}, stats{compileErrors, runs, sandboxRuns, checks}, mapSeen[chapterIds], … }`.

* Achievements (`src/engine/achievements.js`) are pure rules over the save, re-evaluated on
  every change; earned badges are stored and never removed. Per-mission badges only count
  missions completed with a Check press (`attempts ≥ 1`) and a completion time, so legacy or
  imported completions cannot earn them by accident. Adding a badge = one rule + EN/RU
  strings under `ach.<id>`.
* `mapSeen` remembers which main-route chapters PIP-7 has already walked to on the map, so
  the walk animation plays once per unlock (`null` = initialise silently).

* Records are keyed by **stable mission ids**, so appending content never invalidates them.
* `MIGRATIONS` upgrade older formats step by step (0 → 1 → 2); `sanitize()` repairs malformed
  fields instead of discarding the save; unreadable JSON is backed up under
  `isle-of-c.save.corrupt.<timestamp>` and a fresh save starts with a notice.
* Saves from a newer game version keep unknown fields.
* Export/import uses a JSON envelope `{ format: "isle-of-c-progress", save }`.
* Mastery: completing without revealing the full solution = *mastered*; revealing it =
  *completed (assisted)*; passing a mastery retry upgrades to *mastered*.

## Testing

* `scripts/build-content.mjs --strict` — schema, ids, prerequisites, coverage, translations.
* `scripts/test-units.mjs` — checker, source checks, diagnostics, and sandbox behaviour
  (timeouts, output limit, traps, no host files, transcript, island API).
* `scripts/test-progress.mjs` — migrations, corrupt/malformed saves, export/import,
  **appending the template chapter to the real curriculum keeps all progress**, id lock.
* `scripts/verify-content.mjs` — compiles and runs every reference solution (must pass with
  no warnings), every starter (must not already pass), every listed wrong solution (must
  fail, optionally with a specific reason), every prediction (must match the real output)
  and every runnable lesson example in every language.
* `tests/e2e/campaign.mjs` — Chromium plays the whole campaign through the real UI, checks
  the ending and a reload.
