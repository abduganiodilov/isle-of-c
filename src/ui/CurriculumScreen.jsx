import { t } from '../i18n/index.js';
import { tx, txKey, missionStatus } from '../engine/curriculum.js';

const ICON = { locked: '🔒', available: '○', 'in-progress': '◐', completed: '✔', mastered: '★' };

export default function CurriculumScreen({ cur, save, lang, navigate }) {
  return (
    <main id="main" className="curriculum-screen">
      <h1>{t(lang, 'curriculum.title')}</h1>
      <p>{t(lang, 'curriculum.intro')}</p>
      <p className="small muted">{t(lang, 'curriculum.standard')}</p>
      {cur.lectures.map((lec) => (
        <section key={lec.id} className="lecture">
          <h2>
            {lec.id} — {txKey(cur, lang, `l.${lec.id}.title`, lec.title)}
          </h2>
          <div className="table-wrap">
            <table className="coverage">
              <thead>
                <tr>
                  <th scope="col">{t(lang, 'curriculum.topic')}</th>
                  <th scope="col">{t(lang, 'curriculum.slides')}</th>
                  <th scope="col">{t(lang, 'curriculum.missions')}</th>
                </tr>
              </thead>
              <tbody>
                {lec.topics.map((topic) => (
                  <tr key={topic.id}>
                    <td>{txKey(cur, lang, `l.${topic.id}.title`, topic.title)}</td>
                    <td className="mono small">{topic.slides.join(', ')}</td>
                    <td>
                      {topic.coverage === 'meta' ? (
                        <span className="muted small">{t(lang, 'curriculum.meta')}</span>
                      ) : (
                        (cur.coverage[topic.id] || []).map((id) => {
                          const st = missionStatus(cur, save, id);
                          return (
                            <span key={id} className="cov-mission">
                              <span aria-hidden="true">{ICON[st]}</span>{' '}
                              {st === 'locked' ? (
                                <span className="muted">{tx(cur, lang, cur.missionById.get(id), 'title')}</span>
                              ) : (
                                <button type="button" className="link-btn" onClick={() => navigate({ screen: 'mission', id })}>
                                  {tx(cur, lang, cur.missionById.get(id), 'title')}
                                </button>
                              )}
                            </span>
                          );
                        })
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {lec.corrections?.length > 0 && (
            <>
              <h3>{t(lang, 'curriculum.corrections')}</h3>
              <ul className="corrections">
                {lec.corrections.map((c) => (
                  <li key={c.id}>
                    <span className="badge badge-warn">{lang === 'ru' ? 'Слайды' : 'Slides'} {c.slides.join(', ')}</span> {txKey(cur, lang, `l.${lec.id}.corr.${c.id}`, c.text)}
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      ))}
    </main>
  );
}
