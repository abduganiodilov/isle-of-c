# Content schema

All curriculum content lives in `content/` as YAML. `npm run content` validates it and
bundles it into `src/generated/curriculum.json`; the engine never hard-codes chapters or
missions. Schema version: **1** (`manifest.yaml: schemaVersion`).

## `manifest.yaml`

| Field | Meaning |
|---|---|
| `title`, `cStandard` | display information (C17) |
| `curriculumVersion` | integer; **bump whenever content is added or changed**. Players see "new content" once. |
| `lectures` | lecture ids in order, each with a file `lectures/<id>.yaml` |
| `chapters` | chapter ids in campaign order (append only, never reorder) |
| `optionalChapters` | informational; the chapter's own `optional: true` makes it optional |
| `retiredMissions` | ids that were intentionally removed (rare; their saved progress is kept but ignored) |
| `ending.key` | identifies the current "To be continued" ending (`expedition-1`, `expedition-2`, …) |

## `lectures/<id>.yaml` — the coverage source of truth

```yaml
id: L10
title: "while and for loops; functions"
file: Lecture10.pdf
slideCount: 33          # printed slide numbers run 1..slideCount
pageOffset: -1          # PDF page = printed slide + pageOffset
topics:                 # one entry per instructional element of the slides
  - { id: L10.while, slides: [4], title: "while loop syntax; infinite loop" }
  - { id: L10.outline, slides: [2, 3, 15], title: "Outline", coverage: meta }   # not taught
corrections:            # shown in the Curriculum screen and docs/COVERAGE.md
  - { id: libm, slides: [20], missions: [core-systems/library-black-boxes], text: "…" }
```

Every topic without `coverage: meta` must be listed in some mission's `topics`, otherwise
the build fails.

## `chapters/<chapter-id>/chapter.yaml`

```yaml
id: core-systems         # = folder name, permanent
version: 1
letter: F                # shown on the map
title: Core Systems
region: Mountain — Core Systems Hall
lectures: [L10]
optional: false          # true = mastery/extra chapter, not needed for the ending
intro: …                 # story introduction
outro: …                 # shown when the chapter is complete
map: { x: 80, y: 26 }    # node position on the island map (percent)
missions: [library-black-boxes, times2, …]   # file names = play order
```

## `chapters/<chapter-id>/<slug>.yaml` — a mission

| Field | Required | Meaning |
|---|---|---|
| `id` | ✔ | `<chapter-id>/<slug>`; permanent, never renumbered |
| `version` | ✔ | integer ≥ 1, increase when the mission changes (may not decrease) |
| `kind` | ✔ | `guided` · `lesson` · `predict` · `debug` · `challenge` · `chapter-challenge` · `mastery` · `capstone` |
| `optional` | | `true` for missions not needed for the ending |
| `source` | ✔ | `[{ lecture, slides: [printed slide numbers] }]` |
| `topics` | ✔ | lecture topic ids covered (coverage map) |
| `prerequisites` | | mission ids that must be completed first (must come earlier) |
| `estimatedMinutes` | | shown on the map |
| `objectives` | ✔ | learning goals (strings) |
| `world` | | game-world configuration (below) |
| `title`, `briefing`, `success` | ✔ | Markdown; `success` is "what you learned" |
| `lesson` | | Markdown explanation; ```` ```c example ```` blocks are runnable (`stdin=3\n4`, `error` = demonstrates an error) |
| `steps` | ✔ | ordered activities (below) |
| `mastery.retry` | | optional custom retry `{ prompt, starter, tests, solution }`; default = near-empty file + same tests |

Callouts in Markdown: `> [!note]`, `> [!tip]`, `> [!warning]`, `> [!correction]` (slide
corrections), `> [!outside]` (how to do it outside the game), `> [!illustration]`.

### Steps

Common fields: `id` (unique in the mission), `type`, `title`.

* `type: code` — the central activity.
  * `prompt` (Markdown), `starter` (string, may be a comment only), `solution`, `explanation`
  * `stdin` — default Input box text
  * `hints` — **exactly five**: concept, strategy, syntax, partial solution, lead-in to the
    full solution (the solution itself is shown from `solution` + `explanation`)
  * `tests` — list of `{ id, stdin?, note?, harness?, world?, checkpoint?, timeoutMs?, expect }`
  * `expect` — any combination of:
    `output` (string), `contains` (ordered list), `notContains`, `lines` (+ `exactLineCount`),
    `numbers` (+ `numbersMode: suffix|exact|subsequence`), `regex: { pattern, flags?, values?, tolerance?, describe }`,
    `tolerance` (numeric tolerance for the above), `ignoreCase`, `collapseSpaces`,
    `exitCode` (default 0, or `any`), `world: { allRepaired, robotAt: [x,y], maxMoves, noBlocked, noWastedRepairs, minRepairs }`
  * `harness` — C source with its own `main` that calls the player's functions; tests with
    `harness: true` run it (the player's `main` is renamed `student_main`)
  * `world` — default grid for tests without their own `world`
  * `require` — only when the mission teaches a construct:
    `constructs`, `forbid`, `functions`, `calls`, `minCalls`, `includes`, `noWarnings` (e.g. `-Wunsequenced`),
    `style: { maxStatementsPerLine, requireIndent, requireComment, minNameLength }`
  * `wrong` — representative incorrect programs `{ code, why, expect? }` that must fail
    (`expect` = a failure code such as `outputMismatch`, `missingLine`, `trap`, `timeout`)
  * `checklist` — optional self-review list (not graded)
  * `starterPasses: true` — when the starter already behaves correctly (style missions)
  * `timeoutMs` — per-step time limit (default 3000)
* `type: predict` — `prompt`, `code`, `stdin?`, `explanation`, and
  `answer: { kind: choice, choices, correct, actualOutput }` or `answer: { kind: output, output }`.
  The game runs the code for real; `npm test` checks the recorded output matches.
  `expectCompileError: true` when the point is a compile error.
* `type: quiz` — `question`, `choices`, `correct` (index or list), `multiple?`, `explanation`.
* `type: order` — `prompt`, `lines` (in the correct order), `explanation`.
* `type: read` — `prompt` only.

### World

```yaml
world:
  scene: terminal | table | gauges | sorter | grid | frames | pipeline | core
  label: COMMS TERMINAL           # all scenes
  goal: …                         # terminal/table
  gauges: [{ label, pattern, max, scale? }]       # gauges: last regex match in stdout
  bins: [{ label, match }]        # sorter: first regex that matches the output
  grid: { width, height, start: [x, y], damage: [[x, y, level]], walls: [[x, y]] }   # grid
  illustration: [{ caption, frames: [{ name, vars: [{ name, value, copy?, changed? }] }] }]  # frames
  checkpoints: [names]            # core
```

## `notebook.yaml`

`entries: [{ id, title, summary, body (Markdown), tags, unlockedBy: [mission ids], table?: ascii }]`
— `unlockedBy: []` means always visible.

## Translations — `locales/<lang>/*.yaml`

Same structure as the content, text only; code is never translated. Any file name works;
the build merges all files of a language. Keys:

```yaml
chapters:  { <chapter-id>: { title, region, intro, outro } }
missions:
  <mission-id>:
    title, briefing, lesson, success, objectives: [...]
    world: { label, goal, checkpoints: [...], illustration: [captions] }
    steps:
      <step-id>: { title, prompt, question, explanation, hints: [5], choices: [...],
                   answer: { choices: [...] }, lines: [...], checklist: [...],
                   tests: { <test-id>: note } }
notebook:  { <entry-id>: { title, summary, body } }
lectures:  { <lecture-id>: { title, topics: { <topic-id>: title }, corrections: { <id>: text } } }
```

Internally each string gets a translation key such as
`m.core-systems/times2.s.main.hints.2`. Missing translations fall back to English;
`npm test` (`--strict`) fails if any are missing. Strings without words (numbers, `code`
spans) need no translation.

## Validation rules (enforced by `scripts/build-content.mjs`)

* ids: chapter ids = folder names, mission ids = `<chapter>/<file>`, unique, valid charset.
* No published mission id may disappear (`content/ids.lock.json`); versions never decrease.
* Prerequisites exist and come earlier in the campaign (no cycles possible).
* Topics exist; every non-meta lecture topic is covered; slide numbers are in range.
* Code steps: solution, starter, ≥1 test (warning if <2), exactly 5 hints, explanation.
* Predict/quiz/order steps have valid answers; all human-readable fields are strings.
* Translations complete (with `--strict`).
