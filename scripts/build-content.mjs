#!/usr/bin/env node
// Validates the curriculum in content/ and bundles it into src/generated/curriculum.json.
// Also regenerates docs/COVERAGE.md (lecture topic -> missions map).
//
//   node scripts/build-content.mjs            validate + build
//   node scripts/build-content.mjs --check    validate only (no files written)
//   node scripts/build-content.mjs --strict   treat missing translations as errors
//   node scripts/build-content.mjs --content <dir> --out <file>   (used by tests)

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as yaml from 'js-yaml';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const opt = (n, d) => (args.includes(n) ? args[args.indexOf(n) + 1] : d);

const CONTENT = path.resolve(opt('--content', path.join(ROOT, 'content')));
const OUT = path.resolve(opt('--out', path.join(ROOT, 'src/generated/curriculum.json')));
const COVERAGE_OUT = opt('--coverage', path.join(ROOT, 'docs/COVERAGE.md'));
const CHECK_ONLY = flag('--check');
const STRICT = flag('--strict');
const UPDATE_LOCK = flag('--update-lock') || !flag('--no-lock-update');

export const SCHEMA_VERSION = 1;
const LOCALES = ['ru'];
const ID_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*\/[a-z0-9]+(?:-[a-z0-9]+)*$/;
const CHAPTER_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const KINDS = ['guided', 'lesson', 'predict', 'debug', 'challenge', 'chapter-challenge', 'mastery', 'capstone'];
const STEP_TYPES = ['code', 'predict', 'quiz', 'order', 'read'];
const SCENES = ['terminal', 'gauges', 'sorter', 'table', 'grid', 'frames', 'pipeline', 'core'];

const errors = [];
const warnings = [];
const err = (where, msg) => errors.push(`${where}: ${msg}`);
const warn = (where, msg) => warnings.push(`${where}: ${msg}`);

function load(file) {
  try {
    return yaml.load(fs.readFileSync(file, 'utf8'), { filename: file });
  } catch (e) {
    err(path.relative(CONTENT, file), `YAML error: ${e.message}`);
    return null;
  }
}

// ---------------------------------------------------------------- load
const manifest = load(path.join(CONTENT, 'manifest.yaml'));
if (!manifest) finish();

const lectures = {};
for (const lid of manifest.lectures || []) {
  const lec = load(path.join(CONTENT, 'lectures', `${lid}.yaml`));
  if (!lec) continue;
  if (lec.id !== lid) err(`lectures/${lid}.yaml`, `id "${lec.id}" does not match manifest entry "${lid}"`);
  lectures[lid] = lec;
  const seen = new Set();
  for (const t of lec.topics || []) {
    if (!t.id || !t.id.startsWith(lid + '.')) err(`lectures/${lid}`, `topic id "${t.id}" must start with "${lid}."`);
    if (seen.has(t.id)) err(`lectures/${lid}`, `duplicate topic ${t.id}`);
    seen.add(t.id);
    for (const s of t.slides || []) if (s < 1 || s > lec.slideCount) err(`lectures/${lid}`, `topic ${t.id} slide ${s} outside 1..${lec.slideCount}`);
  }
}

const topicIndex = new Map();
for (const lec of Object.values(lectures)) for (const t of lec.topics || []) topicIndex.set(t.id, { ...t, lecture: lec.id });

const chapters = [];
const missions = [];
const missionById = new Map();

for (const cid of manifest.chapters || []) {
  const dir = path.join(CONTENT, 'chapters', cid);
  const ch = load(path.join(dir, 'chapter.yaml'));
  if (!ch) continue;
  if (ch.id !== cid) err(`chapters/${cid}`, `chapter id "${ch.id}" must equal directory name`);
  if (!CHAPTER_RE.test(cid)) err(`chapters/${cid}`, 'invalid chapter id');
  ch._k = `c.${cid}`;
  ch.missionIds = [];
  for (const slug of ch.missions || []) {
    const file = path.join(dir, `${slug}.yaml`);
    if (!fs.existsSync(file)) {
      err(`chapters/${cid}`, `missing mission file ${slug}.yaml`);
      continue;
    }
    const m = load(file);
    if (!m) continue;
    m._file = path.relative(CONTENT, file);
    m.chapter ??= cid;
    if (m.chapter !== cid) err(m._file, `chapter "${m.chapter}" must be "${cid}"`);
    if (m.id !== `${cid}/${slug}`) err(m._file, `id must be "${cid}/${slug}" (got "${m.id}")`);
    m._k = `m.${m.id}`;
    ch.missionIds.push(m.id);
    missions.push(m);
    if (missionById.has(m.id)) err(m._file, `duplicate mission id ${m.id}`);
    missionById.set(m.id, m);
  }
  delete ch.missions;
  chapters.push(ch);
}

const notebook = [];
const nbFile = path.join(CONTENT, 'notebook.yaml');
if (fs.existsSync(nbFile)) {
  const nb = load(nbFile) || {};
  for (const e of nb.entries || []) {
    e._k = `n.${e.id}`;
    notebook.push(e);
  }
}

// ---------------------------------------------------------------- validate missions
const order = new Map(missions.map((m, i) => [m.id, i]));
const requiredText = ['title', 'briefing', 'success'];

for (const m of missions) {
  const w = m._file;
  if (!ID_RE.test(m.id || '')) err(w, `invalid id "${m.id}"`);
  if (!Number.isInteger(m.version) || m.version < 1) err(w, 'version must be a positive integer');
  if (!KINDS.includes(m.kind)) err(w, `kind must be one of ${KINDS.join(', ')}`);
  for (const f of requiredText) if (!m[f]) err(w, `missing ${f}`);
  if (!Array.isArray(m.objectives) || !m.objectives.length) err(w, 'needs learning objectives');
  if (!Array.isArray(m.source) || !m.source.length) err(w, 'needs source references');
  for (const s of m.source || []) {
    const lec = lectures[s.lecture];
    if (!lec) err(w, `unknown lecture ${s.lecture}`);
    else for (const sl of s.slides || []) if (sl < 1 || sl > lec.slideCount) err(w, `slide ${sl} outside ${s.lecture}`);
  }
  for (const t of m.topics || []) if (!topicIndex.has(t)) err(w, `unknown topic ${t}`);
  for (const p of m.prerequisites || []) {
    if (!missionById.has(p)) err(w, `unknown prerequisite ${p}`);
    else if (order.get(p) >= order.get(m.id)) err(w, `prerequisite ${p} must come earlier in the campaign`);
  }
  if (m.world && !SCENES.includes(m.world.scene)) err(w, `unknown world scene ${m.world.scene}`);
  if (!Array.isArray(m.steps) || !m.steps.length) err(w, 'needs at least one step');
  const stepIds = new Set();
  let codeSteps = 0;
  for (const s of m.steps || []) {
    const sw = `${w} step ${s.id}`;
    if (!s.id || stepIds.has(s.id)) err(sw, 'step id missing or duplicate');
    stepIds.add(s.id);
    s._k = `${m._k}.s.${s.id}`;
    if (!STEP_TYPES.includes(s.type)) err(sw, `type must be one of ${STEP_TYPES.join(', ')}`);
    if (s.type === 'code') {
      codeSteps++;
      if (typeof s.solution !== 'string') err(sw, 'code step needs a reference solution');
      if (typeof s.starter !== 'string') err(sw, 'code step needs starter code (may be empty string)');
      if (!Array.isArray(s.tests) || s.tests.length < 1) err(sw, 'code step needs tests');
      if (!m.optional && s.tests && s.tests.length < 2 && !s.singleTestOk) warn(sw, 'only one test; add edge cases');
      if (!Array.isArray(s.hints) || s.hints.length !== 5) err(sw, 'code step needs exactly 5 hints (concept, strategy, syntax, partial, full)');
      if (!s.explanation) err(sw, 'code step needs an explanation of the solution');
      const tids = new Set();
      for (const t of s.tests || []) {
        if (!t.id || tids.has(t.id)) err(sw, `test id missing or duplicate (${t.id})`);
        tids.add(t.id);
        if (!t.expect) err(sw, `test ${t.id} has no expect block`);
        if (t.world && !m.world?.grid && m.world?.scene !== 'grid') warn(sw, `test ${t.id} has a world but mission scene is not grid`);
      }
    }
    if (s.type === 'predict') {
      if (typeof s.code !== 'string') err(sw, 'predict step needs code');
      if (!s.answer) err(sw, 'predict step needs answer');
      if (s.answer?.kind === 'choice' && !(s.answer.correct >= 0 && s.answer.correct < (s.answer.choices || []).length)) err(sw, 'answer.correct out of range');
    }
    if (s.type === 'quiz') {
      if (!Array.isArray(s.choices) || s.choices.length < 2) err(sw, 'quiz needs choices');
      const correct = [].concat(s.correct);
      if (!correct.every((c) => c >= 0 && c < (s.choices || []).length)) err(sw, 'quiz correct index out of range');
      if (!s.explanation) err(sw, 'quiz needs an explanation');
    }
    if (s.type === 'order') {
      if (!Array.isArray(s.lines) || s.lines.length < 3) err(sw, 'order needs ≥3 lines');
    }
  }
  if (!m.optional && codeSteps === 0 && m.kind !== 'lesson') warn(w, 'mission has no code step');
}

// prerequisite cycles are impossible because prerequisites must come earlier.

for (const e of notebook) {
  if (!e.id || !e.title) err(`notebook ${e.id}`, 'entry needs id and title');
  for (const u of [].concat(e.unlockedBy || [])) if (!missionById.has(u)) err(`notebook ${e.id}`, `unknown unlocking mission ${u}`);
}

// ---------------------------------------------------------------- coverage
const coverage = {};
for (const t of topicIndex.keys()) coverage[t] = [];
for (const m of missions) for (const t of m.topics || []) coverage[t]?.push(m.id);
for (const [t, ms] of Object.entries(coverage)) {
  const topic = topicIndex.get(t);
  if (!ms.length && topic.coverage !== 'meta') (flag('--allow-uncovered') ? warn : err)(`coverage`, `lecture topic ${t} ("${topic.title}") is not covered by any mission`);
}

// ---------------------------------------------------------------- ID lock (stable identifiers)
const lockFile = path.join(CONTENT, 'ids.lock.json');
let lock = { missions: {}, chapters: {}, notebook: {} };
if (fs.existsSync(lockFile)) lock = JSON.parse(fs.readFileSync(lockFile, 'utf8'));
for (const id of Object.keys(lock.missions || {})) {
  if (!missionById.has(id) && !(manifest.retiredMissions || []).includes(id)) {
    err('ids.lock.json', `published mission id "${id}" disappeared. Never rename or delete mission ids; list it under retiredMissions in manifest.yaml if it is intentionally retired.`);
  }
}
for (const m of missions) {
  const prev = lock.missions?.[m.id];
  if (prev && m.version < prev.version) err(m._file, `version went backwards (${prev.version} -> ${m.version})`);
}

// ---------------------------------------------------------------- translations
const i18n = {};
const allKeys = new Set();
function translatableEntries() {
  const entries = [];
  // Strings without any word (e.g. "67 E", "0.30000000000000004") need no translation.
  const add = (k, v) => {
    if (typeof v !== 'string') return;
    allKeys.add(k);
    // Pure code spans (`x`) are language neutral too.
    if (/[A-Za-z]{3,}/.test(v) && !/^`[^`]*`$/.test(v.trim())) entries.push([k, v]);
  };
  for (const ch of chapters) for (const f of ['title', 'region', 'intro', 'outro']) add(`${ch._k}.${f}`, ch[f]);
  for (const m of missions) {
    for (const f of ['title', 'briefing', 'lesson', 'success', 'outside']) add(`${m._k}.${f}`, m[f]);
    (m.objectives || []).forEach((o, i) => add(`${m._k}.objectives.${i}`, o));
    if (m.world) {
      add(`${m._k}.world.label`, m.world.label);
      add(`${m._k}.world.goal`, m.world.goal);
      (m.world.checkpoints || []).forEach((c, i) => add(`${m._k}.world.checkpoints.${i}`, c));
      (m.world.illustration || []).forEach((st, i) => add(`${m._k}.world.illustration.${i}.caption`, st.caption));
    }
    if (m.mastery?.retry) for (const f of ['prompt']) add(`${m._k}.mastery.retry.${f}`, m.mastery.retry[f]);
    for (const s of m.steps || []) {
      for (const f of ['title', 'prompt', 'question', 'explanation']) add(`${s._k}.${f}`, s[f]);
      (s.hints || []).forEach((h, i) => add(`${s._k}.hints.${i}`, h));
      (s.choices || []).forEach((c, i) => add(`${s._k}.choices.${i}`, c));
      (s.answer?.choices || []).forEach((c, i) => add(`${s._k}.answer.choices.${i}`, c));
      (s.tests || []).forEach((t) => add(`${s._k}.tests.${t.id}.note`, t.note));
      (s.checklist || []).forEach((c, i) => add(`${s._k}.checklist.${i}`, c));
      (s.lines || []).forEach((c, i) => add(`${s._k}.lines.${i}`, c));
    }
  }
  for (const e of notebook) for (const f of ['title', 'body', 'summary']) add(`${e._k}.${f}`, e[f]);
  for (const lec of Object.values(lectures)) {
    add(`l.${lec.id}.title`, lec.title);
    for (const t of lec.topics || []) add(`l.${t.id}.title`, t.title);
    for (const c of lec.corrections || []) add(`l.${lec.id}.corr.${c.id}`, c.text);
  }
  return entries;
}

const entries = translatableEntries();

// Every human-readable field must be a plain string (a YAML slip such as an
// unquoted "a ? b : c" silently turns text into an object).
for (const m of missions) {
  const w = m._file;
  const str = (v, what) => v == null || typeof v === 'string' || err(w, `${what} must be a string (quote it in YAML)`);
  for (const f of ['title', 'briefing', 'lesson', 'success']) str(m[f], f);
  (m.objectives || []).forEach((o, i) => str(o, `objectives[${i}]`));
  for (const s of m.steps || []) {
    for (const f of ['title', 'prompt', 'question', 'explanation', 'starter', 'solution', 'code', 'harness', 'stdin']) str(s[f], `step ${s.id}.${f}`);
    for (const k of ['hints', 'choices', 'lines', 'checklist']) (s[k] || []).forEach((v, i) => str(v, `step ${s.id}.${k}[${i}]`));
    (s.answer?.choices || []).forEach((v, i) => str(v, `step ${s.id}.answer.choices[${i}]`));
    for (const t of s.tests || []) {
      str(t.stdin, `test ${t.id}.stdin`);
      str(t.note, `test ${t.id}.note`);
      for (const k of ['contains', 'lines', 'notContains']) (t.expect?.[k] || []).forEach((v, i) => str(v, `test ${t.id}.expect.${k}[${i}]`));
    }
  }
}
for (const e of notebook) for (const f of ['title', 'summary', 'body']) if (e[f] != null && typeof e[f] !== 'string') err(`notebook ${e.id}`, `${f} must be a string`);
if (errors.length) finish();
for (const loc of LOCALES) {
  const dir = path.join(CONTENT, 'locales', loc);
  const flat = {};
  if (fs.existsSync(dir)) {
    for (const f of fs.readdirSync(dir).filter((f) => f.endsWith('.yaml')).sort()) {
      const doc = load(path.join(dir, f)) || {};
      flattenLocale(doc, flat, `locales/${loc}/${f}`);
    }
  }
  const known = allKeys;
  let missing = 0;
  for (const [k] of entries) if (!(k in flat)) missing++;
  for (const k of Object.keys(flat)) if (!known.has(k)) warn(`locales/${loc}`, `translation for unknown key ${k}`);
  if (flag('--list-missing')) for (const [k] of entries) if (!(k in flat)) console.log(`missing ${loc}: ${k}`);
  if (missing) (STRICT ? err : warn)(`locales/${loc}`, `${missing} of ${entries.length} strings untranslated (English shown as fallback)`);
  i18n[loc] = flat;
}

/** Locale files mirror the content structure; flatten them to translation keys. */
function flattenLocale(doc, flat, where) {
  for (const [cid, c] of Object.entries(doc.chapters || {})) for (const [f, v] of Object.entries(c)) flat[`c.${cid}.${f}`] = v;
  for (const [lid, l] of Object.entries(doc.lectures || {})) {
    if (l.title) flat[`l.${lid}.title`] = l.title;
    for (const [tid, tt] of Object.entries(l.topics || {})) flat[`l.${tid}.title`] = tt;
    for (const [cid, tt] of Object.entries(l.corrections || {})) flat[`l.${lid}.corr.${cid}`] = tt;
  }
  for (const [eid, e] of Object.entries(doc.notebook || {})) for (const [f, v] of Object.entries(e)) flat[`n.${eid}.${f}`] = v;
  for (const [mid, mt] of Object.entries(doc.missions || {})) {
    const base = `m.${mid}`;
    if (!missionById.has(mid)) warn(where, `translation for unknown mission ${mid}`);
    for (const [f, v] of Object.entries(mt)) {
      if (f === 'steps') {
        for (const [sid, st] of Object.entries(v || {})) {
          for (const [sf, sv] of Object.entries(st || {})) {
            if (Array.isArray(sv)) sv.forEach((x, i) => (flat[`${base}.s.${sid}.${sf}.${i}`] = x));
            else if (sf === 'tests') for (const [tid, tv] of Object.entries(sv)) flat[`${base}.s.${sid}.tests.${tid}.note`] = tv;
            else if (sf === 'answer') (sv.choices || []).forEach((x, i) => (flat[`${base}.s.${sid}.answer.choices.${i}`] = x));
            else flat[`${base}.s.${sid}.${sf}`] = sv;
          }
        }
      } else if (f === 'objectives') v.forEach((x, i) => (flat[`${base}.objectives.${i}`] = x));
      else if (f === 'world') {
        if (v.label) flat[`${base}.world.label`] = v.label;
        if (v.goal) flat[`${base}.world.goal`] = v.goal;
        (v.checkpoints || []).forEach((x, i) => (flat[`${base}.world.checkpoints.${i}`] = x));
        (v.illustration || []).forEach((x, i) => (flat[`${base}.world.illustration.${i}.caption`] = x));
      }
      else if (f === 'mastery') flat[`${base}.mastery.retry.prompt`] = v?.retry?.prompt;
      else flat[`${base}.${f}`] = v;
    }
  }
}

// ---------------------------------------------------------------- output
function finish() {
  for (const w of warnings) console.warn(`warning  ${w}`);
  for (const e of errors) console.error(`ERROR    ${e}`);
  if (errors.length) {
    console.error(`\n${errors.length} error(s). Curriculum NOT built.`);
    process.exit(1);
  }
}
finish();

const bundle = {
  schemaVersion: SCHEMA_VERSION,
  curriculumVersion: manifest.curriculumVersion,
  title: manifest.title,
  cStandard: manifest.cStandard,
  ending: manifest.ending || null,
  lectures: Object.values(lectures),
  chapters,
  missions: missions.map(({ _file, ...m }) => m),
  notebook,
  coverage,
  i18n,
};

if (!CHECK_ONLY) {
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(bundle));
  if (COVERAGE_OUT !== 'none') fs.writeFileSync(COVERAGE_OUT, coverageMarkdown());
  if (UPDATE_LOCK && opt('--content', null) == null) {
    const next = { _comment: 'Generated. Every published id is recorded here; the build fails if one disappears.', missions: {}, chapters: {}, notebook: {} };
    for (const [k, v] of Object.entries(lock.missions || {})) next.missions[k] = v;
    for (const m of missions) next.missions[m.id] = { version: m.version, chapter: m.chapter };
    for (const c of chapters) next.chapters[c.id] = { version: c.version || 1 };
    for (const e of notebook) next.notebook[e.id] = true;
    fs.writeFileSync(lockFile, JSON.stringify(next, null, 2) + '\n');
  }
}
console.log(
  `Curriculum OK: ${chapters.length} chapters, ${missions.length} missions (${missions.filter((m) => !m.optional).length} mandatory), ` +
    `all ${topicIndex.size} lecture topics covered, ${notebook.length} notebook entries, ${warnings.length} warning(s).` +
    (CHECK_ONLY ? ' (check only)' : ` -> ${path.relative(ROOT, OUT)}`),
);

function coverageMarkdown() {
  const esc = (t) => String(t).replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\|/g, '\\|');
  const lines = ['# Curriculum coverage map', '', '_Generated by `npm run content` from `content/lectures/*.yaml` and mission `topics`. Do not edit by hand._', ''];
  lines.push('Slide numbers are the numbers printed on the slides (PDF page = slide − 1 for the supplied lectures).', '');
  for (const lec of Object.values(lectures)) {
    lines.push(`## ${lec.id} — ${lec.title}`, '', '| Topic | Slides | Missions |', '|---|---|---|');
    for (const t of lec.topics) {
      const ms = coverage[t.id].map((id) => {
        const m = missionById.get(id);
        return `\`${id}\`${m.optional ? ' (optional)' : ''}`;
      });
      lines.push(`| ${esc(t.title)} (\`${t.id}\`) | ${(t.slides || []).join(', ')} | ${ms.join('<br>') || (t.coverage === 'meta' ? '_(lecture outline / section divider)_' : '**NOT COVERED**')} |`);
    }
    if (lec.corrections?.length) {
      lines.push('', `### Corrections and modern-C notes for ${lec.id}`, '');
      for (const c of lec.corrections) lines.push(`- **Slide ${(c.slides || []).join(', ')}** — ${esc(c.text.replace(/\n/g, ' '))}${c.missions ? ` _(taught in ${c.missions.map((x) => '`' + x + '`').join(', ')})_` : ''}`);
    }
    lines.push('');
  }
  lines.push('## Campaign order', '');
  for (const ch of chapters) {
    lines.push(`### ${ch.title} (\`${ch.id}\`)`, '');
    for (const id of ch.missionIds) {
      const m = missionById.get(id);
      lines.push(`- \`${id}\` — ${m.title} _(${m.kind}${m.optional ? ', optional' : ''})_ — ${m.source.map((s) => `${s.lecture} slides ${(s.slides || []).join(', ')}`).join('; ')}`);
    }
    lines.push('');
  }
  return lines.join('\n');
}
