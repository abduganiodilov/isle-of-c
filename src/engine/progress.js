// Save data: versioned, migrated, validated. Pure functions + a small store
// wrapper so the same logic can be tested in Node (scripts/test-progress.mjs).
//
// Progress is keyed by stable mission ids, never by position, so appending new
// chapters or missions never disturbs existing progress.

export const SAVE_SCHEMA_VERSION = 2;
export const STORAGE_KEY = 'isle-of-c.save';

export function defaultSettings() {
  return {
    lang: 'en',
    fontSize: 15,
    theme: 'dark',
    reducedMotion: 'system', // 'system' | 'on' | 'off'
    sound: false,
    layout: { left: 27, right: 38, bottom: 34 }, // percentages
  };
}

export function emptySave() {
  const now = new Date().toISOString();
  return {
    schemaVersion: SAVE_SCHEMA_VERSION,
    createdAt: now,
    updatedAt: now,
    curriculumVersionSeen: 0,
    settings: defaultSettings(),
    lastMission: null,
    missions: {},
    drafts: {},
    sandbox: { code: null, stdin: '', grid: false },
    endingsSeen: {},
    notebookSeen: [],
  };
}

export function emptyMissionRecord() {
  return {
    status: 'started', // 'started' | 'completed'
    startedAt: new Date().toISOString(),
    completedAt: null,
    contentVersion: null,
    attempts: 0, // Check presses on the main code step
    runs: 0,
    hintLevel: 0, // highest hint level revealed (0-5)
    solutionRevealed: false,
    solutionRevealedAt: null,
    independent: false, // completed without revealing the full solution
    mastered: false,
    masteredAt: null,
    retryPassed: false,
    steps: {},
  };
}

/**
 * Migrations: each takes a save of version N and returns version N+1.
 * Version 0 = the pre-release format { completed: [ids], code: {id: string}, lang }.
 */
export const MIGRATIONS = {
  0: (old) => {
    const s = emptySave();
    s.schemaVersion = 1;
    for (const id of Array.isArray(old.completed) ? old.completed : []) {
      s.missions[id] = { ...emptyMissionRecord(), status: 'completed', completedAt: s.createdAt, independent: true, mastered: true };
    }
    for (const [id, code] of Object.entries(old.code || {})) {
      if (typeof code === 'string') s.drafts[`${id}#main`] = { code, updatedAt: s.createdAt };
    }
    if (old.lang === 'ru' || old.lang === 'en') s.settings.lang = old.lang;
    return s;
  },
  1: (v1) => {
    // v2 adds mastery fields and the sandbox grid flag.
    const s = { ...v1, schemaVersion: 2 };
    s.sandbox = { grid: false, ...(v1.sandbox || {}) };
    for (const [id, m] of Object.entries(s.missions || {})) {
      s.missions[id] = {
        ...emptyMissionRecord(),
        ...m,
        independent: m.independent ?? (m.status === 'completed' && !m.solutionRevealed),
        mastered: m.mastered ?? (m.status === 'completed' && !m.solutionRevealed),
      };
    }
    return s;
  },
};

/** Bring any parsed save up to the current schema; repair malformed parts. */
export function migrate(raw) {
  const notes = [];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { save: emptySave(), notes: ['unreadable'] };
  }
  let s = raw;
  let v = Number.isInteger(s.schemaVersion) ? s.schemaVersion : 0;
  if (v > SAVE_SCHEMA_VERSION) {
    notes.push('newer');
    // A save from a newer game version: keep what we understand.
    v = SAVE_SCHEMA_VERSION;
    s = { ...s, schemaVersion: SAVE_SCHEMA_VERSION };
  }
  while (v < SAVE_SCHEMA_VERSION) {
    s = MIGRATIONS[v](s);
    notes.push(`migrated-${v}-${v + 1}`);
    v++;
  }
  return { save: sanitize(s, notes), notes };
}

/** Repair any field with the wrong shape instead of discarding the whole save. */
export function sanitize(s, notes = []) {
  const base = emptySave();
  const out = { ...base, ...s };
  const isObj = (x) => x && typeof x === 'object' && !Array.isArray(x);
  if (!isObj(out.settings)) {
    out.settings = base.settings;
    notes.push('settings-reset');
  } else {
    out.settings = { ...base.settings, ...out.settings, layout: { ...base.settings.layout, ...(isObj(out.settings.layout) ? out.settings.layout : {}) } };
    if (!['en', 'ru'].includes(out.settings.lang)) out.settings.lang = 'en';
    const fs = Number(out.settings.fontSize);
    out.settings.fontSize = Number.isFinite(fs) ? Math.min(28, Math.max(11, fs)) : base.settings.fontSize;
  }
  if (!isObj(out.missions)) {
    out.missions = {};
    notes.push('missions-reset');
  }
  for (const [id, m] of Object.entries(out.missions)) {
    if (!isObj(m)) {
      delete out.missions[id];
      notes.push(`mission-dropped:${id}`);
      continue;
    }
    out.missions[id] = { ...emptyMissionRecord(), ...m, steps: isObj(m.steps) ? m.steps : {} };
    if (!['started', 'completed'].includes(out.missions[id].status)) out.missions[id].status = 'started';
  }
  if (!isObj(out.drafts)) out.drafts = {};
  for (const [k, d] of Object.entries(out.drafts)) if (!isObj(d) || typeof d.code !== 'string') delete out.drafts[k];
  if (!isObj(out.sandbox)) out.sandbox = base.sandbox;
  if (!isObj(out.endingsSeen)) out.endingsSeen = {};
  if (!Array.isArray(out.notebookSeen)) out.notebookSeen = [];
  if (out.lastMission != null && typeof out.lastMission !== 'string') out.lastMission = null;
  out.schemaVersion = SAVE_SCHEMA_VERSION;
  return out;
}

/** Parse JSON text from storage or an imported file. */
export function parseSave(text) {
  if (text == null || text === '') return { save: emptySave(), notes: ['new'] };
  let raw;
  try {
    raw = JSON.parse(text);
  } catch {
    return { save: emptySave(), notes: ['corrupt'], corrupt: true };
  }
  // Exported files wrap the save in an envelope.
  if (raw && raw.format === 'isle-of-c-progress' && raw.save) raw = raw.save;
  return migrate(raw);
}

export function exportSave(save) {
  return JSON.stringify({ format: 'isle-of-c-progress', exportedAt: new Date().toISOString(), save }, null, 2);
}

// ---------------------------------------------------------------- mission records

export function missionRecord(save, id) {
  return save.missions[id] || null;
}

export function touchMission(save, id) {
  if (!save.missions[id]) save.missions[id] = emptyMissionRecord();
  save.lastMission = id;
  return save.missions[id];
}

export function recordHint(save, id, level) {
  const m = touchMission(save, id);
  m.hintLevel = Math.max(m.hintLevel, level);
  if (level >= 5 && !m.solutionRevealed) {
    m.solutionRevealed = true;
    m.solutionRevealedAt = new Date().toISOString();
  }
}

export function completeStep(save, id, stepId, data = {}) {
  const m = touchMission(save, id);
  m.steps[stepId] = { ...(m.steps[stepId] || {}), ...data, done: true, at: new Date().toISOString() };
}

/** Mark a mission completed. Independent = no full-solution reveal. */
export function completeMission(save, mission) {
  const m = touchMission(save, mission.id);
  const first = m.status !== 'completed';
  m.status = 'completed';
  m.contentVersion = mission.version;
  if (first) m.completedAt = new Date().toISOString();
  if (!m.solutionRevealed) {
    m.independent = true;
    if (!m.mastered) {
      m.mastered = true;
      m.masteredAt = new Date().toISOString();
    }
  }
  return { first };
}

/** A successful retry challenge turns an assisted completion into mastery. */
export function completeRetry(save, mission) {
  const m = touchMission(save, mission.id);
  m.retryPassed = true;
  if (!m.mastered) {
    m.mastered = true;
    m.masteredAt = new Date().toISOString();
  }
}

export function isCompleted(save, id) {
  return save.missions[id]?.status === 'completed';
}
