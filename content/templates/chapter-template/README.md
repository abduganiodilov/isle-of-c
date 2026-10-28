# Chapter template

Copy this folder's files when a new lecture adds a chapter (see `docs/ADDING_A_LECTURE.md`).

* `chapter.yaml` → `content/chapters/<chapter-id>/chapter.yaml`
* `example-mission.yaml` → `content/chapters/<chapter-id>/<mission-slug>.yaml`
* `locales-ru/chapter.ru.yaml` → `content/locales/ru/<X>-<chapter-id>.yaml`
* add a lecture file `content/lectures/L12.yaml` (copy the structure of `L11.yaml`)
* append the chapter id to the END of `chapters` in `content/manifest.yaml` (never insert
  it between published chapters, never reorder them)

`scripts/test-progress.mjs` builds the real curriculum with this template appended to prove
that appending content never disturbs existing progress, so keep the template valid.
