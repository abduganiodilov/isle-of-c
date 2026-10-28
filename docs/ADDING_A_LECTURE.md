# Adding the next lecture

This is the workflow a development AI (or a person) follows when given a new lecture PDF.
New material is **appended**: no engine rewrite, no renumbering, no lost progress.

## 0. Ground rules

* Never rename, delete, renumber or reorder published chapters or missions. Their ids are
  recorded in `content/ids.lock.json` and the build fails if one disappears.
* Append new chapter ids at the **end** of `chapters` in `content/manifest.yaml`.
* If you change an existing mission (e.g. to add review), bump its `version`.
* Use only constructs taught in this or earlier lectures in solutions; if a solution needs
  something new, teach it first.
* Keep C17, straight quotes, `int main(void)`, no undefined behaviour in examples.
* Label slide errors with `> [!correction]` in the lesson and add them to the lecture
  file's `corrections`.

## 1. Read all instructional content

```bash
pdftotext -layout Lecture12.pdf - | less          # text with layout
pdftotext -f 7 -l 7 Lecture12.pdf -               # one page
pdfimages -list Lecture12.pdf                     # embedded images?
pdftoppm -r 110 -png Lecture12.pdf /tmp/l12       # render pages; look at every page image
```

Read code examples, tables and text inside images (render the pages and look at them).
Note the slide number printed on each slide and how it relates to the PDF page
(`pageOffset`).

## 2. Write the lecture file

Create `content/lectures/L12.yaml` (template: `content/templates/chapter-template/lecture-L12.yaml`):
one `topics` entry per instructional element (definitions, syntax, examples, practice
exercises, style advice), with printed slide numbers. Mark outline/divider slides
`coverage: meta`. Record inaccurate or outdated statements under `corrections`.
Add `L12` to `lectures` in the manifest.

## 3. Compare with the existing curriculum

* Read `docs/COVERAGE.md` and `content/notebook.yaml`.
* Classify every new topic: **new**, **extends an existing topic**, or **already taught**.
* List prerequisites for each new topic (existing mission ids).
* Plan short review (a predict step, a quiz, or a mission that revisits an old concept in a
  new context) where the new material depends on older ideas — do **not** duplicate whole
  chapters.

## 4. Add chapters and missions

Start from `content/templates/chapter-template/`:

1. `content/chapters/<new-chapter>/chapter.yaml` — next free `letter`, a `map` position
   (x/y in percent on the island map; the islets on the right and the cliffs top-left are
   free), `lectures: [L12]`.
2. One YAML file per mission. Follow the learning progression inside missions and across
   the chapter: explain one idea → working example (```` ```c example ````) → predict →
   modify a partial program → write independently → revisit later. Mix mission kinds:
   guided, predict, debug, challenge, optional mastery, and end the chapter with a
   `chapter-challenge`. The first new mission's prerequisite is usually the previous
   capstone (`island-core/restore-core`).
3. Every code step: a real objective in the world, starter code, a reference solution with
   explanation, **five** hints, several behavioural tests incl. edge cases (and tolerances for
   floating point), at least one representative `wrong` solution. Use `require` only when
   the mission teaches a specific construct.
4. If the new lectures end a block of material, add a new capstone and change
   `ending.key` in the manifest (e.g. `expedition-2`) so the "To be continued" screen is
   shown again at the new end.
5. Add notebook entries (`content/notebook.yaml`) with `unlockedBy` pointing to the
   missions that teach them.
6. If missions need new game-world capabilities, prefer existing scenes
   (`terminal`, `table`, `gauges`, `sorter`, `grid`, `frames`, `pipeline`, `core`). New
   island API functions go into `ISLAND_H` (`src/exec/toolchain.js`) and
   `src/world/gridModel.js`, documented in the notebook's *Island API* entry and clearly
   marked as non-standard.

## 5. Translate

Add `content/locales/ru/<letter>-<chapter>.yaml` with the same keys (template:
`locales-ru/chapter.ru.yaml`), plus the lecture title/topics/corrections and notebook
entries. Keep C syntax and standard terms (`printf`, `int`, `for`) as they are; translate
explanations, prompts, hints, choices and test notes. Runnable examples must stay
identical.

## 6. Bump versions and validate

```bash
# manifest.yaml: curriculumVersion: <n + 1>
npm run content -- --list-missing   # coverage, ids, translations (prints missing keys)
npm test                            # strict build + all solutions/tests/predictions/examples + save tests
npm run build && npm start &        # then in another terminal:
npm run e2e                         # full browser playthrough incl. the new chapter
```

`npm test` must report 0 failures. `docs/COVERAGE.md` is regenerated automatically —
check that every new topic lists its missions.

## 7. Progress preservation checklist

* Old mission ids unchanged (`ids.lock.json` diff only adds lines).
* `scripts/test-progress.mjs` passes (it also appends the template chapter to a copy of the
  real curriculum and checks that an existing completed save stays valid).
* If the save format itself must change, add a migration to `MIGRATIONS` in
  `src/engine/progress.js`, bump `SAVE_SCHEMA_VERSION`, and extend `test-progress.mjs`.
