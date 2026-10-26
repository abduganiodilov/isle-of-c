import { useEffect, useRef, useState } from 'react';
import { t } from '../i18n/index.js';
import { tx, missionStatus, chapterProgress, campaignComplete, topicProgress, missingPrerequisites } from '../engine/curriculum.js';

import Icon, { STATUS_ICON } from './Icons.jsx';
import { Scramble } from './fx.jsx';
import Robot from './Robot.jsx';
import { playSound } from './sound.js';

const COAST = 'M8 78 C 4 60, 14 40, 30 30 C 44 20, 60 6, 78 14 C 92 20, 96 40, 90 56 C 84 74, 70 86, 50 88 C 30 90, 12 90, 8 78 Z';

export default function MapScreen({ cur, save, update, lang, settings, navigate, selectedChapter, reducedMotion }) {
  const firstOpen = cur.chapters.find((c) => !chapterProgress(cur, save, c.id).done && chapterProgress(cur, save, c.id).unlocked) || cur.chapters[0];
  const [sel, setSel] = useState(selectedChapter || firstOpen.id);
  const chapter = cur.chapterById.get(sel) || firstOpen;
  const done = cur.mandatory.filter((id) => save.missions[id]?.status === 'completed').length;
  const mastered = cur.order.filter((id) => save.missions[id]?.mastered).length;
  const topics = topicProgress(cur, save);
  const mainChapters = cur.chapters.filter((c) => !c.optional);
  const walk = usePipWalk({ cur, save, update, mainChapters, reducedMotion, sound: settings.sound, onArrive: setSel });
  const at = (c) => ({ left: `${c.map?.x ?? 50}%`, top: `${c.map?.y ?? 50}%` });

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
          <g className="map-grid">
            {Array.from({ length: 9 }, (_, i) => (i + 1) * 10).map((v) => (
              <g key={v}>
                <line x1={v} y1="0" x2={v} y2="100" />
                <line x1="0" y1={v} x2="100" y2={v} />
              </g>
            ))}
          </g>
          <path d={COAST} fill="var(--land)" stroke="var(--land-edge)" strokeWidth="0.45" className="map-coast" />
          {[0.86, 0.7, 0.54, 0.38].map((k, i) => (
            <path key={k} d={COAST} className="map-contour" strokeOpacity={0.18 + i * 0.08} transform={`translate(${52 * (1 - k)} ${50 * (1 - k)}) scale(${k})`} />
          ))}
          {[4, 2.6, 1.4].map((r, i) => (
            <circle key={r} cx="80" cy="15" r={r} className="map-contour" strokeOpacity={0.3 + i * 0.15} />
          ))}
          <circle cx="90" cy="70" r="5" fill="var(--land)" stroke="var(--land-edge)" strokeWidth="0.35" />
          <circle cx="90" cy="70" r="3" className="map-contour" strokeOpacity="0.3" />
          <circle cx="84" cy="80" r="3" fill="var(--land)" stroke="var(--land-edge)" strokeWidth="0.35" />
          <polyline points={mainChapters.map((c) => `${c.map?.x ?? 50},${c.map?.y ?? 50}`).join(' ')} fill="none" stroke="var(--path)" strokeWidth="0.5" strokeDasharray="1.2 1.2" className="map-route" />
        </svg>
        <div className="radar-sweep" aria-hidden="true" />
        <div className={`map-pip ${walk.walking ? 'pip-walking' : ''}`} ref={walk.ref} style={at(walk.from)} aria-hidden="true">
          <Robot size={40} mood={walk.walking ? 'alert' : 'happy'} />
        </div>
        <p className="sr-only" aria-live="polite">
          {walk.walking ? t(lang, 'map.walking', { region: tx(cur, lang, walk.to, 'title') }) : ''}
        </p>
        {walk.walking && (
          <div className="map-walking mono small" aria-hidden="true">
            {t(lang, 'map.walking', { region: tx(cur, lang, walk.to, 'title') })}
          </div>
        )}
        <div className="map-coords" aria-hidden="true">
          LAT 07°14′N · LON 151°52′E · {done}/{cur.mandatory.length} SYS
        </div>
        {cur.chapters.map((c) => {
          const p = chapterProgress(cur, save, c.id);
          return (
            <button
              key={c.id}
              type="button"
              className={`map-node ${p.done ? 'node-done' : p.unlocked ? 'node-open' : 'node-locked'} ${sel === c.id ? 'node-selected' : ''} ${walk.arrived === c.id ? 'node-arrived' : ''}`}
              style={{ left: `${c.map?.x ?? 50}%`, top: `${c.map?.y ?? 50}%` }}
              onClick={() => setSel(c.id)}
              aria-pressed={sel === c.id}
              aria-label={`${c.letter} ${tx(cur, lang, c, 'title')}: ${p.completed}/${p.total}${p.unlocked ? '' : ' — ' + t(lang, 'map.locked')}`}
            >
              <span className="node-letter">{p.unlocked ? c.letter : <Icon name="lock" size={13} />}</span>
              <span className="node-name">{tx(cur, lang, c, 'title')}</span>
              <span className="node-progress">{p.completed}/{p.total}</span>
              {walk.arrived === c.id && <span className="node-new mono">{t(lang, 'map.newRegion')}</span>}
            </button>
          );
        })}
      </section>
      <section className="chapter-panel" aria-live="polite">
        <p className="small muted">{t(lang, 'map.overall', { done, total: cur.mandatory.length, mastered, topics: topics.filter((x) => x.practised).length, topicsTotal: topics.length })}</p>
        {campaignComplete(cur, save) && (
          <button type="button" className="btn btn-accent" onClick={() => navigate({ screen: 'ending' })}>
            <Icon name="flag" /> {t(lang, 'map.endingReady')}
          </button>
        )}
        <h1>
          <span className="muted">{chapter.letter}</span> <Scramble text={tx(cur, lang, chapter, 'title')} />
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
                  <Icon name={STATUS_ICON[st]} size={18} />
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
                    {rec?.hintLevel ? (
                      <>
                        {' · '}
                        <Icon name="bulb" size={12} />
                        {rec.hintLevel}
                      </>
                    ) : null}
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
        {chapterProgress(cur, save, chapter.id).done && chapter.outro && <p className="outro">
            <Icon name="checkCircle" /> {tx(cur, lang, chapter, 'outro')}
          </p>}
      </section>
    </main>
  );
}

/**
 * PIP-7 stands on the furthest unlocked region of the main route. When regions
 * were unlocked since the map was last shown, it walks there along the route
 * (once: save.mapSeen remembers which unlocks were already shown).
 */
function usePipWalk({ cur, save, update, mainChapters, reducedMotion, sound, onArrive }) {
  const unlocked = mainChapters.filter((c) => chapterProgress(cur, save, c.id).unlocked);
  const frontier = unlocked[unlocked.length - 1] || mainChapters[0];
  const seen = save.mapSeen;
  const fresh = seen ? unlocked.filter((c) => !seen.includes(c.id)) : [];
  // Start from the furthest region PIP-7 had already reached.
  const seenOnRoute = seen ? mainChapters.filter((c) => seen.includes(c.id)) : [];
  const start = fresh.length ? seenOnRoute[seenOnRoute.length - 1] || mainChapters[0] : frontier;
  const ref = useRef(null);
  const [walking, setWalking] = useState(false);
  const [arrived, setArrived] = useState(null);
  const [pos, setPos] = useState(start);

  useEffect(() => {
    const ids = unlocked.map((c) => c.id);
    const markSeen = () =>
      update((s) => {
        s.mapSeen = [...new Set([...(s.mapSeen || []), ...ids])];
      });
    if (!seen) {
      // First visit with this game version: nothing to replay.
      markSeen();
      return;
    }
    if (!fresh.length) return;
    const dest = fresh[fresh.length - 1];
    const path = mainChapters.slice(mainChapters.indexOf(start), mainChapters.indexOf(dest) + 1);
    const finish = () => {
      setWalking(false);
      setPos(dest);
      setArrived(dest.id);
      onArrive(dest.id);
      markSeen();
    };
    const el = ref.current;
    if (reducedMotion || !el?.animate || path.length < 2) {
      finish();
      return;
    }
    setWalking(true);
    playSound('unlock', sound);
    // A short pause on the start node, then ~2 s per route segment.
    const duration = 600 + 2000 * (path.length - 1);
    const pause = 600 / duration;
    const frames = path.map((c, i) => ({ left: `${c.map?.x ?? 50}%`, top: `${c.map?.y ?? 50}%`, offset: pause + ((1 - pause) * i) / (path.length - 1) }));
    const anim = el.animate([{ ...frames[0], offset: 0 }, ...frames], { duration, easing: 'ease-in-out', fill: 'forwards' });
    anim.onfinish = finish;
    return () => anim.cancel();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { ref, walking, arrived, from: walking ? start : pos, to: fresh[fresh.length - 1] || frontier };
}
