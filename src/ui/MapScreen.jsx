import { useState } from 'react';
import { t } from '../i18n/index.js';
import { tx, missionStatus, chapterProgress, campaignComplete, topicProgress, missingPrerequisites } from '../engine/curriculum.js';

const STATUS_ICON = { locked: '🔒', available: '○', 'in-progress': '◐', completed: '✔', mastered: '★' };

export default function MapScreen({ cur, save, lang, navigate, selectedChapter }) {
  const firstOpen = cur.chapters.find((c) => !chapterProgress(cur, save, c.id).done && chapterProgress(cur, save, c.id).unlocked) || cur.chapters[0];
  const [sel, setSel] = useState(selectedChapter || firstOpen.id);
  const chapter = cur.chapterById.get(sel) || firstOpen;
  const done = cur.mandatory.filter((id) => save.missions[id]?.status === 'completed').length;
  const mastered = cur.order.filter((id) => save.missions[id]?.mastered).length;
  const topics = topicProgress(cur, save);
  const mainChapters = cur.chapters.filter((c) => !c.optional);

  return (
    <main id="main" className="map-screen">
      <section className="island-map" aria-label={t(lang, 'map.heading')}>
        <svg viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet" className="map-svg" aria-hidden="true">
          <defs>
            <radialGradient id="mapsea" cx="50%" cy="50%" r="70%">
              <stop offset="0" stopColor="var(--sea1)" />
              <stop offset="1" stopColor="var(--sea2)" />
            </radialGradient>
          </defs>
          <rect width="100" height="100" fill="url(#mapsea)" />
          <path d="M8 78 C 4 60, 14 40, 30 30 C 44 20, 60 6, 78 14 C 92 20, 96 40, 90 56 C 84 74, 70 86, 50 88 C 30 90, 12 90, 8 78 Z" fill="var(--land)" stroke="var(--land-edge)" strokeWidth="0.6" />
          <path d="M72 18 L80 8 L88 20 Z" fill="var(--land-dark)" />
          <circle cx="90" cy="70" r="5" fill="var(--land)" stroke="var(--land-edge)" strokeWidth="0.5" />
          <circle cx="84" cy="80" r="3" fill="var(--land)" stroke="var(--land-edge)" strokeWidth="0.5" />
          <polyline points={mainChapters.map((c) => `${c.map?.x ?? 50},${c.map?.y ?? 50}`).join(' ')} fill="none" stroke="var(--path)" strokeWidth="0.7" strokeDasharray="1.5 1.2" />
        </svg>
        {cur.chapters.map((c) => {
          const p = chapterProgress(cur, save, c.id);
          return (
            <button
              key={c.id}
              type="button"
              className={`map-node ${p.done ? 'node-done' : p.unlocked ? 'node-open' : 'node-locked'} ${sel === c.id ? 'node-selected' : ''}`}
              style={{ left: `${c.map?.x ?? 50}%`, top: `${c.map?.y ?? 50}%` }}
              onClick={() => setSel(c.id)}
              aria-pressed={sel === c.id}
              aria-label={`${c.letter} ${tx(cur, lang, c, 'title')}: ${p.completed}/${p.total}${p.unlocked ? '' : ' — ' + t(lang, 'map.locked')}`}
            >
              <span className="node-letter">{p.unlocked ? c.letter : '🔒'}</span>
              <span className="node-name">{tx(cur, lang, c, 'title')}</span>
              <span className="node-progress">{p.completed}/{p.total}</span>
            </button>
          );
        })}
      </section>
      <section className="chapter-panel" aria-live="polite">
        <p className="small muted">{t(lang, 'map.overall', { done, total: cur.mandatory.length, mastered, topics: topics.filter((x) => x.practised).length, topicsTotal: topics.length })}</p>
        {campaignComplete(cur, save) && (
          <button type="button" className="btn btn-accent" onClick={() => navigate({ screen: 'ending' })}>
            🏁 {t(lang, 'map.endingReady')}
          </button>
        )}
        <h1>
          <span className="muted">{chapter.letter}</span> {tx(cur, lang, chapter, 'title')}
        </h1>
        <p className="muted">{tx(cur, lang, chapter, 'region')}</p>
        <p>{tx(cur, lang, chapter, 'intro')}</p>
        {(() => {
          const p = chapterProgress(cur, save, chapter.id);
          return (
            <div className="progress-line">
              <progress max={p.total} value={p.completed} aria-label={t(lang, 'map.chapterProgress', p)} />
              <span className="small">{t(lang, 'map.chapterProgress', p)}</span>
            </div>
          );
        })()}
        <ol className="mission-list">
          {chapter.missionIds.map((id) => {
            const m = cur.missionById.get(id);
            const st = missionStatus(cur, save, id);
            const missing = st === 'locked' ? missingPrerequisites(cur, save, id) : [];
            const rec = save.missions[id];
            return (
              <li key={id} className={`mission-item mi-${st}`}>
                <span className="mi-icon" aria-hidden="true">
                  {STATUS_ICON[st]}
                </span>
                <div className="mi-body">
                  <div className="mi-title">
                    {st === 'locked' ? (
                      <span>{tx(cur, lang, m, 'title')}</span>
                    ) : (
                      <button type="button" className="link-btn mi-link" onClick={() => navigate({ screen: 'mission', id })}>
                        {tx(cur, lang, m, 'title')}
                      </button>
                    )}
                  </div>
                  <div className="mi-meta small muted">
                    <span className="badge">{t(lang, `map.kinds.${m.kind}`)}</span> {t(lang, `map.status.${st}`)} · {t(lang, 'map.minutes', { n: m.estimatedMinutes || 10 })}
                    {cur.isOptional(m) ? ` · ${t(lang, 'map.optional')}` : ''}
                    {rec?.hintLevel ? ` · 💡${rec.hintLevel}` : ''}
                  </div>
                  {missing.length > 0 && (
                    <div className="small muted">
                      {t(lang, 'map.requires', { list: missing.map((p) => tx(cur, lang, cur.missionById.get(p), 'title')).join(', ') })}
                    </div>
                  )}
                </div>
                {st !== 'locked' && (
                  <button type="button" className="btn btn-small" onClick={() => navigate({ screen: 'mission', id })} aria-label={`${st === 'available' ? t(lang, 'map.start') : st === 'in-progress' ? t(lang, 'map.resume') : t(lang, 'map.replay')}: ${tx(cur, lang, m, 'title')}`}>
                    {st === 'available' ? t(lang, 'map.start') : st === 'in-progress' ? t(lang, 'map.resume') : t(lang, 'map.replay')}
                  </button>
                )}
              </li>
            );
          })}
        </ol>
        {chapterProgress(cur, save, chapter.id).done && chapter.outro && <p className="outro">✔ {tx(cur, lang, chapter, 'outro')}</p>}
      </section>
    </main>
  );
}
