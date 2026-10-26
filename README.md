# Isle of C

A playable programming adventure that teaches **real C (C17)** from the very first line.
A small maintenance robot, PIP-7, wakes up on an abandoned research island; every machine
on the island runs on C. You write genuine C programs, a genuine compiler builds them, and
the island reacts to what your program actually did.

The campaign currently covers two lecture decks (Lecture 9: start with C, data types,
expressions, if/switch, simple for loop; Lecture 10: while/for/do-while loops, functions).
It ends with *"Current expedition complete. To be continued…"* and grows when new lecture
material is added (see [Adding a lecture](docs/ADDING_A_LECTURE.md)).

* 8 chapters, **68 missions** (62 mandatory + 6 optional mastery challenges)
* every instructional topic of both lectures mapped to missions — [coverage map](docs/COVERAGE.md)
* real compilation (Clang 22 → WebAssembly) **inside the browser**, sandboxed execution
* English and Russian (complete translation, separate from game logic)
* progress, drafts and settings saved automatically; export/import as JSON

## Quick start

Requirements: Node.js 18+ (20+ recommended) and a current Chromium, Firefox or Safari.

```bash
npm install          # also copies the in-browser C compiler into public/toolchain/
npm run build        # validates the curriculum, builds the app into dist/
npm start            # serves dist/ at http://127.0.0.1:8080/
```

For development with hot reload: `npm run dev` (http://localhost:5173/).

**Play on other devices on the same Wi-Fi:** run `npm run share` instead of `npm start`. It
prints an address such as `http://192.168.1.23:8080/`; open it in a browser on any laptop
on the same network (nothing to install there). Each player's progress is saved in their own
browser. If it does not load, allow Node.js through the computer's firewall (macOS asks on
first run). Stop sharing with Ctrl+C.

The first visit downloads the C compiler once (~100 MB, ~27 MB compressed when served by
`npm start`); the browser caches it, so later visits start in about a second. Everything
else is static: `dist/` can be served by any static web server (GitHub Pages, nginx, …) —
there is **no backend**.

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | dev server (rebuilds the curriculum first) |
| `npm run build` | production build into `dist/` (+ precompressed `.gz` files) |
| `npm start` | static server for `dist/` with correct MIME types, gzip and caching |
| `npm run content` | validate `content/` and regenerate `src/generated/curriculum.json` and `docs/COVERAGE.md` |
| `npm test` | strict content validation + unit/sandbox tests + save/expansion tests + **compiles and runs every reference solution, wrong solution, prediction and lesson example** (~2 min) |
| `npm run e2e` | real-browser playthrough of the whole campaign (needs `npm run build && npm start` running; ~2 min) |

## How the game works

* **Mission screen** — left: objective, learning goals, steps, lesson (*Learn*), progressive
  hints; centre: the game world; right: the C editor; bottom: Input, Output, Diagnostics,
  Tests. Panels are resizable (drag or keyboard), *focus mode* (Alt+Z) hides everything but
  the editor and console.
* **Run** (Ctrl+Enter) compiles and runs with the text in the Input box; **Check**
  (Ctrl+Shift+Enter) runs all tests; **Stop** (Esc) kills a running program; **Reset**
  restores the starter code; **Hint** opens five progressive hints (concept → strategy →
  syntax → partial → full solution).
* Missions mix *guided*, *predict*, *debug*, *challenge*, *chapter challenge*, optional
  *mastery* missions and a *capstone* with checkpoints. Steps inside a mission follow the
  progression explain → example → predict → modify → write.
* Revealing the full solution records the mission as *completed with help*; a **mastery
  retry** (nearly empty file, hints 1–3 only) turns it into *mastered*.
* **Notebook** — searchable reference that grows with completed missions (includes an ASCII
  table and the island API). **Curriculum** — lecture-topic coverage with your progress and
  all corrections to the slides. **Sandbox** — free practice, optionally with the robot grid.
* Settings: language (EN/RU), editor font size, dark/light theme, reduced motion, sound,
  export/import/erase progress.

## Project structure

```
content/                 curriculum data (YAML) — the only thing a new lecture changes
  manifest.yaml          chapter order, lectures, versions
  lectures/L09.yaml …    lecture topics with slide numbers + corrections (coverage source)
  chapters/<id>/         chapter.yaml + one YAML file per mission
  notebook.yaml          reference notebook entries
  locales/ru/*.yaml      Russian translations (same keys, text only)
  templates/             chapter template for new lectures
  ids.lock.json          every published id (build fails if one disappears)
src/
  exec/                  toolchain config, compiler worker, sandboxed runner, WASI host
  validate/              behavioural checker, structural checks, diagnostic explanations
  engine/                curriculum rules, assessment, save data + migrations
  world/                 game-world scenes (terminal, gauges, sorter, grid replay, …)
  ui/                    React screens and components
  i18n/                  interface strings (en, ru)
scripts/                 content build/validation, verification, tests, server helpers
tests/e2e/               browser playthrough (Playwright)
docs/                    architecture, schema, coverage map, how to add a lecture
```

More detail: [Architecture & execution](docs/ARCHITECTURE.md) ·
[Content schema](docs/CONTENT_SCHEMA.md) · [Adding a lecture](docs/ADDING_A_LECTURE.md) ·
[Coverage map](docs/COVERAGE.md).

## C standard and compiler

All code is C17. The game compiles with **Clang 22** (LLVM, built for WebAssembly by the
YoWASP project) using `-std=c17 -Wall -Wextra -Wimplicit-fallthrough -O0` plus trapping
undefined-behaviour checks. The lectures use GCC; code written in the game is standard C and
compiles with `gcc -std=c17 -Wall -Wextra file.c -o file` (add `-lm` for `<math.h>` on Linux).
Differences worth knowing are taught in the game: in WebAssembly `long` is 32 bits (as on
Windows; 64 bits on Linux/macOS x86-64), input comes from the Input box instead of a live
keyboard, and runtime checks stop programs that divide by zero or overflow signed integers.

## Known limitations

* Programs read their whole input from the Input box; there is no interactive keyboard input
  while a program runs (the output shows the input where a terminal would echo it).
* The first load needs the compiler download; offline use works only after it is cached.
* Only the island API functions in `island.h` are non-standard; everything else is ISO C17.
  Files, processes, networking and time are not available to programs (by design).
