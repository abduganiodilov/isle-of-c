import { useEffect } from 'react';
import Icon from './Icons.jsx';
import Robot from './Robot.jsx';
import { DigitalRain, Scramble } from './fx.jsx';
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
      <DigitalRain opacity={0.1} />
      <div className="ending-robot" aria-hidden="true">
        <Robot size={170} mood="happy" className="pip7-float" />
      </div>
      <h1 className="glitch" data-text={t(lang, 'ending.title')}>
        <Scramble text={t(lang, 'ending.title')} duration={900} />
      </h1>
      <p className="tbc">{t(lang, 'ending.toBeContinued')}</p>
      <p className="ending-text">{t(lang, 'ending.text')}</p>
      <p className="muted">{t(lang, 'ending.stats', { missions: completed, mastered, topics })}</p>
      <div className="ending-actions">
        <button type="button" className="btn btn-primary" onClick={() => navigate({ screen: 'map' })}>
          <Icon name="map" /> {t(lang, 'ending.replay')}
        </button>
        {improvable.length > 0 && (
          <button type="button" className="btn" onClick={() => navigate({ screen: 'mission', id: improvable[0] })}>
            <Icon name="star" /> {t(lang, 'ending.improve', { n: improvable.length })}
          </button>
        )}
        {extras && (
          <button type="button" className="btn" onClick={() => navigate({ screen: 'map', chapter: extras.id })}>
            <Icon name="spark" /> {t(lang, 'ending.extras')} ({tx(cur, lang, extras, 'title')})
          </button>
        )}
        <button type="button" className="btn" onClick={() => navigate({ screen: 'sandbox' })}>
          <Icon name="flask" /> {t(lang, 'ending.sandbox')}
        </button>
        <button type="button" className="btn" onClick={() => navigate({ screen: 'notebook' })}>
          <Icon name="book" /> {t(lang, 'ending.notebook')}
        </button>
      </div>
    </main>
  );
}
