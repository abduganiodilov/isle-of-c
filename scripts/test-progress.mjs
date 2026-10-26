#!/usr/bin/env node
// Save-data and expansion tests (Node, no browser):
//  1. migrations from older save formats, corrupt and malformed saves
//  2. appending a sample chapter (content/templates/chapter-template) to the REAL
//     curriculum keeps every existing id, keeps existing progress valid, re-opens
//     the campaign (new mandatory missions) and unlocks the new chapter
//  3. the id lock refuses a build in which a published mission disappeared
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseSave, migrate, exportSave, emptySave, completeMission, recordHint, completeRetry, recordCompileError, touchMission, SAVE_SCHEMA_VERSION } from '../src/engine/progress.js';
import { newAchievements, awardAchievements, rankFor, ACHIEVEMENTS } from '../src/engine/achievements.js';
import { indexCurriculum, campaignComplete, missionStatus, nextMission } from '../src/engine/curriculum.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let failures = 0;
let passes = 0;
function check(cond, msg) {
  if (cond) passes++;
  else {
    failures++;
    console.error('FAIL', msg);
  }
}

// ---------------------------------------------------------------- 1. migrations
{
  const legacy = { completed: ['first-contact/wake-up', 'first-contact/build-pipeline'], code: { 'first-contact/anatomy': 'int main(void){return 0;}' }, lang: 'ru' };
  const { save, notes } = parseSave(JSON.stringify(legacy));
  check(save.schemaVersion === SAVE_SCHEMA_VERSION, 'legacy save migrated to current schema');
  check(notes.includes('migrated-0-1') && notes.includes('migrated-1-2'), 'migration chain 0→1→2 ran');
  check(save.missions['first-contact/wake-up']?.status === 'completed', 'legacy completion kept');
  check(save.missions['first-contact/wake-up']?.mastered === true, 'legacy completion counts as mastered');
  check(save.drafts['first-contact/anatomy#main']?.code.includes('main'), 'legacy code draft kept');
  check(save.settings.lang === 'ru', 'legacy language kept');
}
{
  const r = parseSave('{"schemaVersion": 2, "missions": {');
  check(r.corrupt && Object.keys(r.save.missions).length === 0, 'corrupt JSON gives a fresh save flagged corrupt');
}
{
  const bad = { schemaVersion: 2, settings: 'oops', missions: { 'a/b': 5, 'first-contact/wake-up': { status: 'weird', steps: [] } }, drafts: { x: 3, 'y#main': { code: 'int main(void){}' } }, lastMission: 42, sandbox: null };
  const { save } = migrate(bad);
  check(save.settings.fontSize === 15 && save.settings.lang === 'en', 'malformed settings replaced by defaults');
  check(!('a/b' in save.missions), 'malformed mission record dropped');
  check(save.missions['first-contact/wake-up'].status === 'started', 'unknown status repaired');
  check(!('x' in save.drafts) && 'y#main' in save.drafts, 'malformed drafts dropped, valid kept');
  check(save.lastMission === null && save.sandbox && typeof save.sandbox === 'object', 'lastMission and sandbox repaired');
}
{
  const future = { ...emptySave(), schemaVersion: 99, futureField: { a: 1 } };
  const { save, notes } = migrate(future);
  check(notes.includes('newer') && save.futureField?.a === 1, 'newer save keeps unknown fields');
}
{
  const s = emptySave();
  const fake = { id: 'first-contact/wake-up', version: 1 };
  recordHint(s, fake.id, 5);
  completeMission(s, fake);
  check(s.missions[fake.id].status === 'completed' && !s.missions[fake.id].mastered && s.missions[fake.id].solutionRevealed, 'revealed solution → assisted completion, not mastered');
  completeRetry(s, fake);
  check(s.missions[fake.id].mastered, 'retry turns assisted completion into mastery');
  const round = parseSave(exportSave(s));
  check(JSON.stringify(round.save.missions) === JSON.stringify(s.missions), 'export/import round trip');
}

{
  // New optional fields: absent in older saves, repaired when malformed.
  const { save } = migrate({ schemaVersion: 2, missions: {}, achievements: { boot: 7, speedrun: '2026-01-01T00:00:00Z' }, stats: { runs: -3, checks: 4 }, mapSeen: 'x', settings: { theme: 'neon' } });
  check(!('boot' in save.achievements) && save.achievements.speedrun, 'malformed achievement dropped, valid kept');
  check(save.stats.runs === 0 && save.stats.checks === 4 && save.stats.compileErrors === 0, 'stats repaired and defaulted');
  check(save.mapSeen === null, 'malformed mapSeen reset');
  check(save.settings.theme === 'dark', 'unknown theme falls back to the default');
  check(migrate({ schemaVersion: 2, settings: { theme: 'amber' } }).save.settings.theme === 'amber', 'theme variant kept');
}

// ---------------------------------------------------------------- 1b. achievements
{
  const cur = indexCurriculum(JSON.parse(fs.readFileSync(path.join(ROOT, 'src/generated/curriculum.json'), 'utf8')));
  const code = cur.missions.find((m) => m.steps.some((st) => st.type === 'code'));
  const code2 = cur.missions.filter((m) => m.steps.some((st) => st.type === 'code'))[1];
  check(newAchievements(cur, emptySave()).length === 0, 'a new save has no badges');

  // Seeded/legacy completions (no Check presses, no completion time) earn only progress badges.
  const legacy = parseSave(JSON.stringify({ completed: [code.id] })).save;
  const legacyIds = newAchievements(cur, legacy);
  check(legacyIds.includes('boot') && !legacyIds.includes('zero-hints') && !legacyIds.includes('first-try'), 'legacy completions do not earn per-mission badges');

  // A clean, quick, first-try solve.
  const s = emptySave();
  const m = touchMission(s, code.id);
  m.attempts = 1;
  completeMission(s, code);
  const ids = awardAchievements(cur, s);
  for (const id of ['boot', 'zero-hints', 'clean-compile', 'first-try', 'speedrun', 'flawless']) check(ids.includes(id), `clean solve earns ${id}`);
  check(newAchievements(cur, s).length === 0, 'earned badges are not awarded twice');

  // A slow, messy solve with hints earns none of the per-mission badges.
  const t2 = emptySave();
  const m2 = touchMission(t2, code2.id);
  m2.startedAt = new Date(Date.now() - 3600e3).toISOString();
  m2.attempts = 3;
  recordHint(t2, code2.id, 2);
  recordCompileError(t2, code2.id);
  completeMission(t2, code2);
  const ids2 = newAchievements(cur, t2);
  check(t2.stats.compileErrors === 1 && t2.missions[code2.id].compileErrors === 1, 'compile errors counted globally and per mission');
  check(ids2.includes('boot') && !ids2.some((x) => ['zero-hints', 'clean-compile', 'first-try', 'speedrun', 'flawless'].includes(x)), 'messy solve earns only the progress badge');
  t2.settings.theme = 'cyber';
  check(newAchievements(cur, t2).includes('reskin'), 'switching theme earns New skin');
  check(rankFor(0).id === 'newbie' && rankFor(ACHIEVEMENTS.length).id === 'root', 'ranks span from newbie to root');
}

// ---------------------------------------------------------------- 2. append a sample chapter
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'isle-append-'));
try {
  const content = path.join(tmp, 'content');
  fs.cpSync(path.join(ROOT, 'content'), content, { recursive: true });
  const tpl = path.join(content, 'templates/chapter-template');
  const chDir = path.join(content, 'chapters/template-arrays');
  fs.mkdirSync(chDir, { recursive: true });
  fs.copyFileSync(path.join(tpl, 'chapter.yaml'), path.join(chDir, 'chapter.yaml'));
  fs.copyFileSync(path.join(tpl, 'example-mission.yaml'), path.join(chDir, 'example-mission.yaml'));
  fs.copyFileSync(path.join(tpl, 'lecture-L11.yaml'), path.join(content, 'lectures/L11.yaml'));
  fs.copyFileSync(path.join(tpl, 'locales-ru/chapter.ru.yaml'), path.join(content, 'locales/ru/Z-template.yaml'));
  let manifest = fs.readFileSync(path.join(content, 'manifest.yaml'), 'utf8');
  manifest = manifest.replace('lectures: [L09, L10]', 'lectures: [L09, L10, L11]').replace(/(chapters:\n(?:  - .*\n)+)/, '$1  - template-arrays\n').replace('curriculumVersion: 1', 'curriculumVersion: 2');
  fs.writeFileSync(path.join(content, 'manifest.yaml'), manifest);

  const before = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/generated/curriculum.json'), 'utf8'));
  const outFile = path.join(tmp, 'cur.json');
  execFileSync(process.execPath, [path.join(ROOT, 'scripts/build-content.mjs'), '--content', content, '--out', outFile, '--coverage', 'none', '--strict'], { stdio: 'pipe' });
  const after = JSON.parse(fs.readFileSync(outFile, 'utf8'));
  const A = indexCurriculum(before);
  const B = indexCurriculum(after);

  check(before.missions.every((m) => B.missionById.has(m.id)), 'every existing mission id still exists after appending');
  check(before.missions.every((m, i) => after.missions[i].id === m.id), 'existing missions keep their order (new content is appended)');

  // A player who finished the whole current expedition…
  const s = emptySave();
  for (const m of before.missions) completeMission(s, m);
  s.endingsSeen[before.ending.key] = '2026-01-01T00:00:00Z';
  check(campaignComplete(A, s), 'save completes the current campaign');
  const reloaded = parseSave(JSON.stringify(s)).save;
  check(JSON.stringify(reloaded.missions) === JSON.stringify(s.missions), 'progress unchanged by reload with new content');
  check(before.missions.every((m) => missionStatus(B, reloaded, m.id) === 'mastered'), 'all previous missions still mastered in the extended campaign');
  check(!campaignComplete(B, reloaded), 'campaign re-opens when a new mandatory chapter is appended');
  check(missionStatus(B, reloaded, 'template-arrays/example-mission') === 'available', 'new chapter is unlocked for a player who finished the old campaign');
  check(nextMission(B, reloaded, null) === 'template-arrays/example-mission', 'next mission points into the new chapter');

  // The template's own solution must compile and pass (same checks as npm run verify).
  const verify = execFileSync(process.execPath, [path.join(ROOT, 'scripts/verify-content.mjs'), '--curriculum', outFile, '--only', 'template-arrays'], { stdio: 'pipe' }).toString();
  check(/0 failure/.test(verify), 'template mission verifies (solution passes, wrong solution fails, prediction matches)');

  // ---------------------------------------------------------------- 3. id lock
  fs.rmSync(path.join(content, 'chapters/first-contact/newlines.yaml'));
  fs.writeFileSync(
    path.join(content, 'chapters/first-contact/chapter.yaml'),
    fs.readFileSync(path.join(content, 'chapters/first-contact/chapter.yaml'), 'utf8').replace('  - newlines\n', ''),
  );
  let refused = false;
  try {
    execFileSync(process.execPath, [path.join(ROOT, 'scripts/build-content.mjs'), '--content', content, '--out', outFile, '--coverage', 'none'], { stdio: 'pipe' });
  } catch (e) {
    refused = /disappeared/.test(String(e.stderr));
  }
  check(refused, 'build refuses to drop a published mission id (ids.lock.json)');
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}

console.log(`${passes} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);
