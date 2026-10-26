// Read-only access to the bundled curriculum plus progression rules.
// The engine never hard-codes chapters or missions: everything comes from
// src/generated/curriculum.json, built from content/ by scripts/build-content.mjs.

import { isCompleted } from './progress.js';

export function indexCurriculum(cur) {
  const missionById = new Map(cur.missions.map((m) => [m.id, m]));
  const chapterById = new Map(cur.chapters.map((c) => [c.id, c]));
  const order = cur.missions.map((m) => m.id);
  const optionalChapters = new Set(cur.chapters.filter((c) => c.optional).map((c) => c.id));
  const isOptional = (m) => !!m.optional || optionalChapters.has(m.chapter);
  const mandatory = cur.missions.filter((m) => !isOptional(m)).map((m) => m.id);
  const topicById = new Map();
  for (const l of cur.lectures) for (const t of l.topics) topicById.set(t.id, { ...t, lecture: l.id });
  return { ...cur, missionById, chapterById, order, mandatory, isOptional, topicById };
}

/** Translate a content field: uses the active locale's string if present. */
export function tx(cur, lang, obj, field, index) {
  if (!obj) return '';
  const key = index == null ? `${obj._k}.${field}` : `${obj._k}.${field}.${index}`;
  if (lang !== 'en') {
    const v = cur.i18n?.[lang]?.[key];
    if (v != null && v !== '') return v;
  }
  const base = obj[field];
  return index == null ? base ?? '' : (base && base[index]) ?? '';
}

export function txKey(cur, lang, key, fallback) {
  if (lang !== 'en') {
    const v = cur.i18n?.[lang]?.[key];
    if (v) return v;
  }
  return fallback;
}

export function missionStatus(cur, save, id) {
  const m = cur.missionById.get(id);
  if (!m) return 'unknown';
  const rec = save.missions[id];
  if (rec?.status === 'completed') return rec.mastered ? 'mastered' : 'completed';
  if ((m.prerequisites || []).every((p) => isCompleted(save, p) || !cur.missionById.has(p))) return rec ? 'in-progress' : 'available';
  return 'locked';
}

export function isUnlocked(cur, save, id) {
  return missionStatus(cur, save, id) !== 'locked';
}

export function missingPrerequisites(cur, save, id) {
  const m = cur.missionById.get(id);
  return (m?.prerequisites || []).filter((p) => !isCompleted(save, p));
}

export function chapterProgress(cur, save, chapterId) {
  const ch = cur.chapterById.get(chapterId);
  const ids = ch.missionIds;
  let completed = 0;
  let mastered = 0;
  for (const id of ids) {
    const r = save.missions[id];
    if (r?.status === 'completed') completed++;
    if (r?.mastered) mastered++;
  }
  const unlocked = ids.some((id) => isUnlocked(cur, save, id));
  return { total: ids.length, completed, mastered, unlocked, done: completed === ids.length };
}

export function nextMission(cur, save, afterId) {
  const start = afterId ? cur.order.indexOf(afterId) + 1 : 0;
  for (let i = start; i < cur.order.length; i++) {
    const id = cur.order[i];
    const m = cur.missionById.get(id);
    if (cur.isOptional(m)) continue;
    if (!isCompleted(save, id) && isUnlocked(cur, save, id)) return id;
  }
  for (const id of cur.mandatory) if (!isCompleted(save, id) && isUnlocked(cur, save, id)) return id;
  return null;
}

/** All mandatory missions of the current campaign are complete. */
export function campaignComplete(cur, save) {
  return cur.mandatory.length > 0 && cur.mandatory.every((id) => isCompleted(save, id));
}

/** Learning-goal progress per lecture topic (practised = every mission using it completed). */
export function topicProgress(cur, save) {
  const out = [];
  for (const [topicId, missions] of Object.entries(cur.coverage)) {
    const t = cur.topicById.get(topicId);
    if (t.coverage === 'meta') continue;
    const done = missions.filter((id) => isCompleted(save, id)).length;
    const mastered = missions.filter((id) => save.missions[id]?.mastered).length;
    out.push({ topic: t, missions, done, mastered, practised: done > 0, complete: done === missions.length });
  }
  return out;
}

export function notebookUnlocked(cur, save, entry) {
  const req = [].concat(entry.unlockedBy || []);
  return req.length === 0 || req.some((id) => isCompleted(save, id));
}
