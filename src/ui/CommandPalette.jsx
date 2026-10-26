import { useEffect, useMemo, useRef, useState } from 'react';
import { t } from '../i18n/index.js';
import { tx, missionStatus, notebookUnlocked } from '../engine/curriculum.js';
import Icon, { STATUS_ICON } from './Icons.jsx';

function score(hay, q) {
  // Every query word must appear in the text; word starts and early hits rank higher.
  hay = hay.toLowerCase();
  let total = 0;
  for (const w of q.split(/\s+/).filter(Boolean)) {
    const at = hay.indexOf(w);
    if (at < 0) return -1;
    const wordStart = at === 0 || /[\s/·(-]/.test(hay[at - 1]);
    total += (wordStart ? 200 : 100) - Math.min(at, 90);
  }
  return total;
}

/** Ctrl/Cmd+K: jump to any screen, unlocked mission or notebook entry. */
export default function CommandPalette({ cur, save, lang, navigate, onClose, onAction }) {
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(0);
  const input = useRef(null);
  useEffect(() => input.current?.focus(), []);

  const items = useMemo(() => {
    const list = [
      { id: 'go:map', icon: 'map', label: t(lang, 'nav.map'), kind: 'screen', run: () => navigate({ screen: 'map' }) },
      { id: 'go:notebook', icon: 'book', label: t(lang, 'nav.notebook'), kind: 'screen', run: () => navigate({ screen: 'notebook' }) },
      { id: 'go:sandbox', icon: 'flask', label: t(lang, 'nav.sandbox'), kind: 'screen', run: () => navigate({ screen: 'sandbox' }) },
      { id: 'go:curriculum', icon: 'layers', label: t(lang, 'nav.curriculum'), kind: 'screen', run: () => navigate({ screen: 'curriculum' }) },
      { id: 'go:profile', icon: 'trophy', label: t(lang, 'nav.profile'), kind: 'screen', run: () => navigate({ screen: 'profile' }) },
      ...Object.entries(t(lang, 'settings.themes')).map(([k, v]) => ({ id: `act:theme:${k}`, icon: 'layers', label: `${t(lang, 'palette.theme')}: ${v}`, kind: 'action', run: () => onAction(`theme:${k}`) })),
      { id: 'act:settings', icon: 'gear', label: t(lang, 'nav.settings'), kind: 'action', run: () => onAction('settings') },
      { id: 'act:lang', icon: 'globe', label: lang === 'ru' ? 'Switch to English' : 'Переключить на русский', kind: 'action', run: () => onAction('lang') },
      { id: 'act:fx', icon: 'spark', label: t(lang, 'palette.toggleFx'), kind: 'action', run: () => onAction('fx') },
    ];
    for (const m of cur.missions) {
      const st = missionStatus(cur, save, m.id);
      if (st === 'locked') continue;
      const ch = cur.chapterById.get(m.chapter);
      list.push({ id: `m:${m.id}`, icon: STATUS_ICON[st], label: tx(cur, lang, m, 'title'), hint: `${ch.letter} · ${tx(cur, lang, ch, 'title')}`, kind: 'mission', run: () => navigate({ screen: 'mission', id: m.id }) });
    }
    for (const e of cur.notebook) {
      if (!notebookUnlocked(cur, save, e)) continue;
      list.push({ id: `n:${e.id}`, icon: 'book', label: tx(cur, lang, e, 'title'), hint: t(lang, 'nav.notebook'), kind: 'note', run: () => navigate({ screen: 'notebook', entry: e.id }) });
    }
    return list;
  }, [cur, save, lang, navigate, onAction]);

  const results = useMemo(() => {
    const query = q.trim().toLowerCase();
    if (!query) return items.slice(0, 40);
    return items
      .map((it) => ({ it, s: score(`${it.label} ${it.hint || ''}`, query) }))
      .filter((x) => x.s >= 0)
      .sort((a, b) => b.s - a.s)
      .slice(0, 40)
      .map((x) => x.it);
  }, [items, q]);

  const choose = (it) => {
    onClose();
    it.run();
  };
  const onKeyDown = (e) => {
    if (e.key === 'Escape') onClose();
    else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSel((s) => Math.min(results.length - 1, s + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSel((s) => Math.max(0, s - 1));
    } else if (e.key === 'Enter' && results[sel]) choose(results[sel]);
  };

  return (
    <div className="modal-backdrop palette-backdrop" role="presentation" onClick={onClose}>
      <div className="palette hud" role="dialog" aria-modal="true" aria-label={t(lang, 'palette.title')} onClick={(e) => e.stopPropagation()}>
        <div className="palette-input">
          <span className="prompt-glyph" aria-hidden="true">❯</span>
          <input
            ref={input}
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setSel(0);
            }}
            onKeyDown={onKeyDown}
            placeholder={t(lang, 'palette.placeholder')}
            aria-label={t(lang, 'palette.placeholder')}
            role="combobox"
            aria-expanded="true"
            aria-controls="palette-list"
            aria-activedescendant={results[sel] ? `pal-${sel}` : undefined}
            spellCheck={false}
          />
          <kbd>esc</kbd>
        </div>
        <ul className="palette-list" id="palette-list" role="listbox">
          {results.map((it, i) => (
            <li
              key={it.id}
              id={`pal-${i}`}
              role="option"
              aria-selected={i === sel}
              className={`palette-item ${i === sel ? 'palette-sel' : ''}`}
              onMouseEnter={() => setSel(i)}
              onClick={() => choose(it)}
            >
              <Icon name={it.icon} size={15} />
              <span className="palette-label">{it.label}</span>
              {it.hint && <span className="palette-hint">{it.hint}</span>}
              <span className="palette-kind">{t(lang, `palette.kinds.${it.kind}`)}</span>
            </li>
          ))}
          {!results.length && <li className="palette-empty">{t(lang, 'notebook.noResults')}</li>}
        </ul>
      </div>
    </div>
  );
}
