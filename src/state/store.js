// Browser persistence for the save (localStorage), with debounced writes,
// corrupt-save backup and safe fallbacks when storage is unavailable.

import { useCallback, useEffect, useRef, useState } from 'react';
import { STORAGE_KEY, parseSave, emptySave, exportSave } from '../engine/progress.js';

function readStorage() {
  try {
    return { text: localStorage.getItem(STORAGE_KEY), ok: true };
  } catch {
    return { text: null, ok: false };
  }
}

export function loadInitialSave() {
  const { text, ok } = readStorage();
  const parsed = parseSave(text);
  const notices = [];
  if (!ok) notices.push({ key: 'save.storageFailed' });
  if (parsed.corrupt) {
    const backupKey = `${STORAGE_KEY}.corrupt.${Date.now()}`;
    try {
      localStorage.setItem(backupKey, text);
    } catch {
      /* ignore */
    }
    notices.push({ key: 'save.corrupt', params: { key: backupKey } });
  } else if (parsed.notes.some((n) => n.startsWith('migrated'))) notices.push({ key: 'save.migrated' });
  if (parsed.notes.includes('newer')) notices.push({ key: 'save.newer' });
  return { save: parsed.save, notices };
}

/** React hook holding the save; update(fn) mutates a draft copy and persists. */
export function useSaveStore() {
  const initial = useRef(null);
  if (!initial.current) initial.current = loadInitialSave();
  const [save, setSave] = useState(initial.current.save);
  const [notices, setNotices] = useState(initial.current.notices);
  const timer = useRef(null);
  const latest = useRef(save);

  const persist = useCallback((s) => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
      } catch {
        setNotices((n) => (n.some((x) => x.key === 'save.storageFailed') ? n : [...n, { key: 'save.storageFailed' }]));
      }
    }, 300);
  }, []);

  const update = useCallback(
    (fn) => {
      const draft = structuredClone(latest.current);
      fn(draft);
      draft.updatedAt = new Date().toISOString();
      latest.current = draft;
      setSave(draft);
      persist(draft);
    },
    [persist],
  );

  const replace = useCallback(
    (s) => {
      latest.current = s;
      setSave(s);
      persist(s);
    },
    [persist],
  );

  // Flush on page hide so the last keystrokes are not lost.
  useEffect(() => {
    const flush = () => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(latest.current));
      } catch {
        /* ignore */
      }
    };
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', flush);
    return () => {
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', flush);
    };
  }, []);

  const dismissNotice = (i) => setNotices((n) => n.filter((_, j) => j !== i));
  const pushNotice = (notice) => setNotices((n) => [...n, notice]);

  return { save, update, replace, notices, dismissNotice, pushNotice, reset: () => replace(emptySave()), exportText: () => exportSave(latest.current) };
}
