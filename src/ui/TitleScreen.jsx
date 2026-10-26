import { t } from '../i18n/index.js';
import { tx, nextMission, campaignComplete } from '../engine/curriculum.js';
import { parseSave } from '../engine/progress.js';

export default function TitleScreen({ cur, save, lang, navigate, store }) {
  const last = save.lastMission && cur.missionById.get(save.lastMission);
  const next = nextMission(cur, save, null);
  const started = Object.keys(save.missions).length > 0;
  const importFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const parsed = parseSave(text);
    if (parsed.corrupt || parsed.notes.includes('unreadable')) {
      alert(t(lang, 'settings.importBad'));
      return;
    }
    store.replace(parsed.save);
    alert(t(lang, 'settings.importOk'));
  };
  return (
    <main id="main" className="title-screen">
      <div className="title-art" aria-hidden="true">
        <svg viewBox="0 0 400 200" className="title-svg">
          <defs>
            <linearGradient id="sea" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0" stopColor="var(--sea1)" />
              <stop offset="1" stopColor="var(--sea2)" />
            </linearGradient>
          </defs>
          <rect width="400" height="200" fill="url(#sea)" />
          <path d="M60 150 Q120 70 200 90 T340 150 Z" fill="var(--land)" />
          <path d="M150 118 L170 70 L190 118 Z" fill="var(--land-dark)" />
          <circle cx="318" cy="46" r="18" fill="var(--accent)" opacity="0.85" />
          <g transform="translate(205 108)">
            <rect x="-9" y="-9" width="18" height="16" rx="5" fill="var(--robot)" />
            <circle cx="-3.5" cy="-3" r="2" fill="var(--bg)" />
            <circle cx="3.5" cy="-3" r="2" fill="var(--bg)" />
            <line x1="0" y1="-9" x2="0" y2="-15" stroke="var(--robot)" strokeWidth="2" />
            <circle cx="0" cy="-16" r="2" fill="var(--accent)" className="blink" />
          </g>
        </svg>
      </div>
      <h1 className="title">Isle of C</h1>
      <p className="subtitle">{t(lang, 'app.subtitle')}</p>
      <p className="intro">{t(lang, 'title.intro')}</p>
      <div className="title-actions">
        {started && last ? (
          <button type="button" className="btn btn-primary btn-big" onClick={() => navigate({ screen: 'mission', id: last.id })}>
            ▶ {t(lang, 'title.continue', { mission: tx(cur, lang, last, 'title') })}
          </button>
        ) : (
          <button type="button" className="btn btn-primary btn-big" onClick={() => navigate({ screen: 'mission', id: next || cur.order[0] })}>
            ▶ {t(lang, 'title.start')}
          </button>
        )}
        <button type="button" className="btn btn-big" onClick={() => navigate({ screen: campaignComplete(cur, save) ? 'ending' : 'map' })}>
          🗺 {t(lang, 'title.map')}
        </button>
        <label className="btn btn-big file-btn">
          ⤒ {t(lang, 'title.importSave')}
          <input type="file" accept="application/json,.json" onChange={importFile} className="sr-only" />
        </label>
      </div>
      <p className="small muted">{t(lang, 'title.toolchainNote')}</p>
    </main>
  );
}
