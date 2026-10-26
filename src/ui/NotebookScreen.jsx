import { useMemo, useState } from 'react';
import Icon from './Icons.jsx';
import { t } from '../i18n/index.js';
import { tx, notebookUnlocked } from '../engine/curriculum.js';
import Markdown from './Markdown.jsx';

const CONTROL = ['NUL', 'SOH', 'STX', 'ETX', 'EOT', 'ENQ', 'ACK', 'BEL', 'BS', 'HT', 'LF', 'VT', 'FF', 'CR', 'SO', 'SI', 'DLE', 'DC1', 'DC2', 'DC3', 'DC4', 'NAK', 'SYN', 'ETB', 'CAN', 'EM', 'SUB', 'ESC', 'FS', 'GS', 'RS', 'US'];

function asciiChar(code) {
  if (code < 32) return CONTROL[code];
  if (code === 32) return 'SPACE';
  if (code === 127) return 'DEL';
  return String.fromCharCode(code);
}

export function AsciiTable({ lang, filter = '' }) {
  const f = filter.trim().toLowerCase();
  const rows = Array.from({ length: 128 }, (_, i) => i).filter((i) => {
    if (!f) return true;
    const ch = asciiChar(i).toLowerCase();
    return String(i) === f || i.toString(16) === f.replace(/^0x/, '') || ch === f || (f.length > 1 && ch.includes(f));
  });
  const h = t(lang, 'notebook.ascii');
  return (
    <div className="table-wrap ascii-wrap">
      <table className="ascii-table">
        <caption className="sr-only">ASCII 0–127</caption>
        <thead>
          <tr>
            <th scope="col">{h.dec}</th>
            <th scope="col">{h.hex}</th>
            <th scope="col">{h.char}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((i) => (
            <tr key={i} className={i < 32 || i === 127 ? 'ctrl' : ''}>
              <td className="mono">{i}</td>
              <td className="mono">{i.toString(16).toUpperCase().padStart(2, '0')}</td>
              <td className="mono">{asciiChar(i)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function NotebookScreen({ cur, save, lang, entryId, navigate }) {
  const [query, setQuery] = useState('');
  const entries = cur.notebook.map((e) => ({ e, unlocked: notebookUnlocked(cur, save, e) }));
  const unlocked = entries.filter((x) => x.unlocked).map((x) => x.e);
  const lockedCount = entries.length - unlocked.length;
  const q = query.trim().toLowerCase();
  const results = useMemo(() => {
    if (!q) return unlocked;
    return unlocked.filter((e) => {
      const hay = [tx(cur, lang, e, 'title'), tx(cur, lang, e, 'summary'), tx(cur, lang, e, 'body'), e.title, e.body, ...(e.tags || [])].join(' ').toLowerCase();
      return q.split(/\s+/).every((w) => hay.includes(w)) || (e.table === 'ascii' && q.length <= 3);
    });
  }, [q, unlocked, cur, lang]);
  const [openId, setOpenId] = useState(entryId || null);
  const current = results.find((e) => e.id === openId) || results[0];

  return (
    <main id="main" className="notebook-screen">
      <aside className="notebook-index">
        <h1>{t(lang, 'notebook.title')}</h1>
        <input type="search" className="search" placeholder={t(lang, 'notebook.search')} value={query} onChange={(e) => setQuery(e.target.value)} aria-label={t(lang, 'notebook.search')} />
        <ul className="nb-list">
          {results.map((e) => (
            <li key={e.id}>
              <button type="button" className={`nb-item ${current && current.id === e.id ? 'nb-active' : ''}`} onClick={() => setOpenId(e.id)}>
                <strong>{tx(cur, lang, e, 'title')}</strong>
                <span className="small muted">{tx(cur, lang, e, 'summary')}</span>
              </button>
            </li>
          ))}
        </ul>
        {!results.length && <p className="muted">{t(lang, 'notebook.noResults')}</p>}
        {lockedCount > 0 && <p className="small muted"><Icon name="lock" size={13} /> {t(lang, 'notebook.lockedEntries', { n: lockedCount })}</p>}
      </aside>
      <article className="notebook-entry">
        {current && (
          <>
            <h2>{tx(cur, lang, current, 'title')}</h2>
            <Markdown text={tx(cur, lang, current, 'body')} lang={lang} />
            {current.table === 'ascii' && <AsciiTable lang={lang} filter={q.length <= 3 ? q : ''} />}
            {[].concat(current.unlockedBy || []).length > 0 && (
              <p className="small muted">
                {t(lang, 'notebook.unlockedBy', { mission: '' })}
                {[].concat(current.unlockedBy).map((id) => (
                  <button key={id} type="button" className="link-btn" onClick={() => navigate({ screen: 'mission', id })}>
                    {tx(cur, lang, cur.missionById.get(id), 'title')}
                  </button>
                ))}
              </p>
            )}
          </>
        )}
      </article>
    </main>
  );
}
