import { useState } from 'react';
import { t } from '../i18n/index.js';
import { tx, nextMission, campaignComplete } from '../engine/curriculum.js';
import { parseSave } from '../engine/progress.js';
import { DigitalRain, BootLog } from './fx.jsx';
import Robot from './Robot.jsx';
import Icon from './Icons.jsx';

export default function TitleScreen({ cur, save, lang, navigate, store }) {
  const last = save.lastMission && cur.missionById.get(save.lastMission);
  const next = nextMission(cur, save, null);
  const started = Object.keys(save.missions).length > 0;
  const done = cur.mandatory.filter((id) => save.missions[id]?.status === 'completed').length;
  const [booted, setBooted] = useState(false);

  const importFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const parsed = parseSave(await file.text());
    if (parsed.corrupt || parsed.notes.includes('unreadable')) {
      alert(t(lang, 'settings.importBad'));
      return;
    }
    store.replace(parsed.save);
    alert(t(lang, 'settings.importOk'));
  };

  // Decorative boot log (hidden from screen readers); reflects real progress.
  const lines = [
    { text: 'PIP-7 maintenance unit · firmware C17\n', tone: 'info' },
    { text: '[ OK ] power cells ............ 98%\n', tone: 'ok' },
    { text: `[ OK ] island sectors ......... ${cur.chapters.length} mapped\n`, tone: 'ok' },
    { text: '[ OK ] compiler ............... clang/wasm32\n', tone: 'ok' },
    { text: `[INFO] missions ............... ${done}/${cur.mandatory.length} restored\n`, tone: 'info' },
    { text: started ? '[WARN] systems offline · resume repairs\n' : '[WARN] all systems offline · awaiting operator\n', tone: 'warn' },
    { text: '> _\n', tone: 'ok' },
  ];

  return (
    <main id="main" className="title-screen">
      <DigitalRain />
      <div className="title-left">
        <div className="title-eyebrow">// research island · sector 0</div>
        <h1 className="title glitch" data-text="Isle of C">
          Isle of <span className="title-c">C</span>
        </h1>
        <p className="subtitle">{t(lang, 'app.subtitle')}</p>
        <p className="intro">{t(lang, 'title.intro')}</p>
        <div className="title-actions">
          {started && last ? (
            <button type="button" className="cmd-btn cmd-primary" onClick={() => navigate({ screen: 'mission', id: last.id })}>
              <span className="cmd-prompt" aria-hidden="true">$</span>
              <Icon name="play" />
              <span>{t(lang, 'title.continue', { mission: tx(cur, lang, last, 'title') })}</span>
            </button>
          ) : (
            <button type="button" className="cmd-btn cmd-primary" onClick={() => navigate({ screen: 'mission', id: next || cur.order[0] })}>
              <span className="cmd-prompt" aria-hidden="true">$</span>
              <Icon name="play" />
              <span>{t(lang, 'title.start')}</span>
            </button>
          )}
          <button type="button" className="cmd-btn" onClick={() => navigate({ screen: campaignComplete(cur, save) ? 'ending' : 'map' })}>
            <span className="cmd-prompt" aria-hidden="true">$</span>
            <Icon name="map" />
            <span>{t(lang, 'title.map')}</span>
            <span className="cmd-sub">
              {done}/{cur.mandatory.length}
            </span>
          </button>
          <label className="cmd-btn file-btn">
            <span className="cmd-prompt" aria-hidden="true">$</span>
            <Icon name="upload" />
            <span>{t(lang, 'title.importSave')}</span>
            <input type="file" accept="application/json,.json" onChange={importFile} className="sr-only" />
          </label>
        </div>
        <p className="small muted">
          <Icon name="cpu" size={13} /> {t(lang, 'title.toolchainNote')}
        </p>
      </div>
      <div className="title-right">
        <Robot size={190} mood={booted ? 'happy' : 'idle'} className="pip7-float" />
        <div className="terminal-window">
          <div className="terminal-bar" aria-hidden="true">
            <i />
            <i />
            <i />
            <span>pip7@isle:~ — boot</span>
          </div>
          <BootLog lines={lines} onDone={() => setBooted(true)} />
        </div>
      </div>
    </main>
  );
}
