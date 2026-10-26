import { useEffect } from 'react';
import { t } from '../i18n/index.js';
import { topicProgress, tx } from '../engine/curriculum.js';

export default function EndingScreen({ cur, save, update, lang, navigate, reducedMotion }) {
  const key = cur.ending?.key || 'expedition';
  useEffect(() => {
    if (!save.endingsSeen[key]) update((s) => (s.endingsSeen[key] = new Date().toISOString()));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const completed = cur.order.filter((id) => save.missions[id]?.status === 'completed').length;
  const mastered = cur.order.filter((id) => save.missions[id]?.mastered).length;
  const improvable = cur.order.filter((id) => save.missions[id]?.status === 'completed' && !save.missions[id]?.mastered);
  const topics = topicProgress(cur, save).filter((x) => x.practised).length;
  const extras = cur.chapters.find((c) => c.optional);
  return (
    <main id="main" className={`ending-screen ${reducedMotion ? '' : 'ending-animate'}`}>
      <div className="ending-sky" aria-hidden="true">
        <svg viewBox="0 0 400 160" className="ending-svg">
          <rect width="400" height="160" fill="var(--sea2)" />
          <circle cx="200" cy="150" r="70" fill="var(--accent)" opacity="0.5" className="sunrise" />
          <path d="M0 130 Q100 110 200 125 T400 120 L400 160 L0 160 Z" fill="var(--sea1)" />
          <path d="M120 128 Q200 70 280 128 Z" fill="var(--land)" />
          <circle cx="200" cy="96" r="5" fill="var(--ok)" className="blink" />
        </svg>
      </div>
      <h1>{t(lang, 'ending.title')}</h1>
      <p className="tbc">{t(lang, 'ending.toBeContinued')}</p>
      <p className="ending-text">{t(lang, 'ending.text')}</p>
      <p className="muted">{t(lang, 'ending.stats', { missions: completed, mastered, topics })}</p>
      <div className="ending-actions">
        <button type="button" className="btn btn-primary" onClick={() => navigate({ screen: 'map' })}>
          🗺 {t(lang, 'ending.replay')}
        </button>
        {improvable.length > 0 && (
          <button type="button" className="btn" onClick={() => navigate({ screen: 'mission', id: improvable[0] })}>
            ★ {t(lang, 'ending.improve', { n: improvable.length })}
          </button>
        )}
        {extras && (
          <button type="button" className="btn" onClick={() => navigate({ screen: 'map', chapter: extras.id })}>
            + {t(lang, 'ending.extras')} ({tx(cur, lang, extras, 'title')})
          </button>
        )}
        <button type="button" className="btn" onClick={() => navigate({ screen: 'sandbox' })}>
          🧪 {t(lang, 'ending.sandbox')}
        </button>
        <button type="button" className="btn" onClick={() => navigate({ screen: 'notebook' })}>
          📓 {t(lang, 'ending.notebook')}
        </button>
      </div>
    </main>
  );
}
