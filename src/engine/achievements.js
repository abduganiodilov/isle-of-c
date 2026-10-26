// Hacker achievements: badges derived from the save. Pure functions, so the
// same rules run in the browser and in Node tests (scripts/test-progress.mjs).
//
// Every rule only reads the save, so badges can be re-evaluated at any time;
// once earned, a badge is stored in save.achievements and never taken away.

const SPEEDRUN_SECONDS = 180;

function hasCode(mission) {
  return mission.steps.some((s) => s.type === 'code');
}

/**
 * Missions finished in this game version with real play data: completed, a
 * code step, at least one Check press. (Legacy and seeded saves lack the data
 * the per-mission badges need, so they never qualify by accident.)
 */
function playedCodeMissions(cur, save) {
  const out = [];
  for (const [id, r] of Object.entries(save.missions)) {
    const m = cur.missionById.get(id);
    if (!m || r.status !== 'completed' || !r.completedAt || !(r.attempts >= 1) || !hasCode(m)) continue;
    out.push(r);
  }
  return out;
}

const zeroHints = (r) => !r.hintLevel && !r.solutionRevealed;
const cleanCompile = (r) => !r.compileErrors;
const firstTry = (r) => r.attempts === 1;
const seconds = (r) => (Date.parse(r.completedAt) - Date.parse(r.startedAt)) / 1000;

/** id, icon (Icons.jsx), secret (name hidden until earned) and the rule. */
export const ACHIEVEMENTS = [
  { id: 'boot', icon: 'terminal', test: ({ completed }) => completed >= 1 },
  { id: 'zero-hints', icon: 'bulb', test: ({ played }) => played.some(zeroHints) },
  { id: 'clean-compile', icon: 'cpu', test: ({ played }) => played.some(cleanCompile) },
  { id: 'first-try', icon: 'target', test: ({ played }) => played.some(firstTry) },
  { id: 'speedrun', icon: 'bolt', test: ({ played }) => played.some((r) => seconds(r) >= 0 && seconds(r) <= SPEEDRUN_SECONDS) },
  { id: 'flawless', icon: 'star', test: ({ played }) => played.some((r) => zeroHints(r) && cleanCompile(r) && firstTry(r)) },
  { id: 'ghost', icon: 'spark', test: ({ played }) => played.filter(zeroHints).length >= 10 },
  { id: 'prove-it', icon: 'reset', test: ({ save }) => Object.values(save.missions).some((r) => r.retryPassed) },
  { id: 'region', icon: 'flag', test: ({ cur, save }) => cur.chapters.some((c) => c.missionIds.length && c.missionIds.every((id) => save.missions[id]?.status === 'completed')) },
  { id: 'halfway', icon: 'map', test: ({ cur, mandatoryDone }) => mandatoryDone * 2 >= cur.mandatory.length && cur.mandatory.length > 0 },
  { id: 'expedition', icon: 'globe', test: ({ cur, mandatoryDone }) => mandatoryDone === cur.mandatory.length && cur.mandatory.length > 0 },
  { id: 'grit', icon: 'alert', test: ({ save, completed }) => save.stats.compileErrors >= 25 && completed >= 1 },
  { id: 'tinkerer', icon: 'flask', test: ({ save }) => save.stats.sandboxRuns >= 10 },
  { id: 'scholar', icon: 'book', test: ({ save }) => save.notebookSeen.length >= 10 },
  { id: 'reskin', icon: 'layers', test: ({ save }) => save.settings.theme !== 'dark' },
  { id: 'night-owl', icon: 'clock', secret: true, test: ({ played }) => played.some((r) => { const h = new Date(r.completedAt).getHours(); return h >= 0 && h < 5; }) },
];

export const ACHIEVEMENT_BY_ID = new Map(ACHIEVEMENTS.map((a) => [a.id, a]));

/** Ids of badges whose rule now holds but that are not stored yet. */
export function newAchievements(cur, save) {
  const ctx = {
    cur,
    save,
    played: playedCodeMissions(cur, save),
    completed: Object.values(save.missions).filter((r) => r.status === 'completed').length,
    mandatoryDone: cur.mandatory.filter((id) => save.missions[id]?.status === 'completed').length,
  };
  return ACHIEVEMENTS.filter((a) => !save.achievements[a.id] && a.test(ctx)).map((a) => a.id);
}

/** Store newly earned badges; returns their ids. */
export function awardAchievements(cur, save, now = new Date().toISOString()) {
  const ids = newAchievements(cur, save);
  for (const id of ids) save.achievements[id] = now;
  return ids;
}

/** Hacker rank from the number of badges. */
export const RANKS = [
  { id: 'newbie', min: 0 },
  { id: 'script', min: 2 },
  { id: 'operator', min: 5 },
  { id: 'sysadmin', min: 8 },
  { id: 'hacker', min: 11 },
  { id: 'root', min: 14 },
];

export function rankFor(count) {
  let r = RANKS[0];
  for (const x of RANKS) if (count >= x.min) r = x;
  return r;
}
