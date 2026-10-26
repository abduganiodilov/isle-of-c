import { useEffect, useMemo, useState } from 'react';
import curriculumData from './generated/curriculum.json';
import { indexCurriculum, tx, campaignComplete } from './engine/curriculum.js';
import { useSaveStore } from './state/store.js';
import { t, LANGS } from './i18n/index.js';
import { engine } from './exec/engine.js';
import TitleScreen from './ui/TitleScreen.jsx';
import MapScreen from './ui/MapScreen.jsx';
import MissionScreen from './ui/MissionScreen.jsx';
import NotebookScreen from './ui/NotebookScreen.jsx';
import SandboxScreen from './ui/SandboxScreen.jsx';
import CurriculumScreen from './ui/CurriculumScreen.jsx';
import EndingScreen from './ui/EndingScreen.jsx';
import SettingsDialog from './ui/SettingsDialog.jsx';
import { CLANG_PACKAGE_VERSION } from './exec/toolchain.js';
import CommandPalette from './ui/CommandPalette.jsx';
import Icon from './ui/Icons.jsx';
import { FxContext } from './ui/fx.jsx';

const cur = indexCurriculum(curriculumData);

function parseHash() {
  const h = decodeURIComponent(location.hash.replace(/^#\/?/, ''));
  if (!h) return { screen: 'title' };
  const [screen, ...rest] = h.split('/');
  if (screen === 'mission') return { screen, id: rest.join('/') };
  if (screen === 'map') return { screen, chapter: rest[0] || null };
  if (['notebook', 'sandbox', 'curriculum', 'ending'].includes(screen)) return { screen, entry: rest.join('/') || null };
  return { screen: 'title' };
}

function routeToHash(r) {
  if (r.screen === 'title') return '';
  if (r.screen === 'mission') return `#/mission/${r.id}`;
  if (r.screen === 'map') return `#/map${r.chapter ? '/' + r.chapter : ''}`;
  if (r.screen === 'notebook' && r.entry) return `#/notebook/${r.entry}`;
  return `#/${r.screen}`;
}

function usePrefersReducedMotion() {
  const [v, setV] = useState(() => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false);
  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (!mq) return;
    const fn = (e) => setV(e.matches);
    mq.addEventListener('change', fn);
    return () => mq.removeEventListener('change', fn);
  }, []);
  return v;
}

function ToolchainStatus({ lang }) {
  const [st, setSt] = useState(engine.toolchain);
  useEffect(() => engine.onStatus(setSt), []);
  let text;
  if (st.phase === 'download' && st.total) {
    text = t(lang, 'toolchain.download', { percent: Math.floor((st.done / st.total) * 100), done: (st.done / 1048576).toFixed(0), total: (st.total / 1048576).toFixed(0) });
  } else text = t(lang, `toolchain.${st.phase === 'download' ? 'loading' : st.phase}`, { error: st.error });
  const pct = st.phase === 'download' && st.total ? st.done / st.total : st.phase === 'ready' ? 1 : 0;
  const cells = 10;
  const bar = st.phase === 'download' ? '█'.repeat(Math.round(pct * cells)).padEnd(cells, '░') : null;
  return (
    <span className={`toolchain toolchain-${st.phase}`} role="status" aria-live="polite" title={text}>
      <Icon name="cpu" size={15} />
      <span className="lamp-dot" aria-hidden="true" />
      <span className="toolchain-text">{text}</span>
      {bar && (
        <span className="ascii-bar" aria-hidden="true">
          [{bar}]
        </span>
      )}
    </span>
  );
}

export default function App() {
  const store = useSaveStore();
  const { save, update } = store;
  const [route, setRoute] = useState(parseHash);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [focusMode, setFocusMode] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const systemReduced = usePrefersReducedMotion();
  const settings = save.settings;
  const lang = settings.lang;
  const reducedMotion = settings.reducedMotion === 'on' || (settings.reducedMotion === 'system' && systemReduced);
  const fx = settings.effects !== false && !reducedMotion;

  // Ctrl/Cmd+K opens the command palette from anywhere.
  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    const onHash = () => setRoute(parseHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const navigate = (r) => {
    const h = routeToHash(r);
    if (h !== location.hash) {
      if (h === '') history.pushState(null, '', location.pathname + location.search);
      else location.hash = h;
    }
    setRoute(r);
    window.scrollTo(0, 0);
  };

  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dataset.theme = settings.theme;
    document.documentElement.classList.toggle('reduced-motion', reducedMotion);
    document.documentElement.classList.toggle('fx-on', fx);
    document.title = route.screen === 'mission' && cur.missionById.get(route.id) ? `${tx(cur, lang, cur.missionById.get(route.id), 'title')} — Isle of C` : 'Isle of C';
  }, [lang, settings.theme, reducedMotion, fx, route]);

  // Start downloading/initialising the compiler early (it is cached afterwards).
  useEffect(() => {
    const id = setTimeout(() => engine.warmUp(), 400);
    return () => clearTimeout(id);
  }, []);

  // New curriculum content since the last visit?
  useEffect(() => {
    if (save.curriculumVersionSeen !== cur.curriculumVersion) {
      if (save.curriculumVersionSeen && save.curriculumVersionSeen < cur.curriculumVersion) store.pushNotice({ key: 'save.contentUpdated' });
      update((s) => {
        s.curriculumVersionSeen = cur.curriculumVersion;
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Show the "to be continued" ending once, when the campaign is first completed.
  const complete = campaignComplete(cur, save);
  const endingKey = cur.ending?.key || 'expedition';
  // (Not while a mission is open: the player first sees the mission's result.)
  useEffect(() => {
    if (complete && !save.endingsSeen[endingKey] && route.screen !== 'ending' && route.screen !== 'mission') {
      update((s) => {
        s.endingsSeen[endingKey] = new Date().toISOString();
      });
      navigate({ screen: 'ending' });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [complete, route.screen]);

  const setLang = (l) => update((s) => (s.settings.lang = l));
  const mission = route.screen === 'mission' ? cur.missionById.get(route.id) : null;

  const topbar = (
    <header className="topbar">
      <a href="#code-editor" className="skip-link">
        {t(lang, 'a11y.skip')}
      </a>
      <button type="button" className="brand" onClick={() => navigate({ screen: 'title' })} aria-label="Isle of C">
        <span className="brand-prompt" aria-hidden="true">~/</span>
        <span className="brand-name">isle_of_c</span>
        <span className="brand-caret" aria-hidden="true" />
      </button>
      <nav className="topnav" aria-label="Main">
        <button type="button" className={`nav-btn ${route.screen === 'map' ? 'nav-active' : ''}`} onClick={() => navigate({ screen: 'map' })}>
          <Icon name="map" /> <span>{t(lang, 'nav.map')}</span>
        </button>
        <button type="button" className={`nav-btn ${route.screen === 'notebook' ? 'nav-active' : ''}`} onClick={() => navigate({ screen: 'notebook' })}>
          <Icon name="book" /> <span>{t(lang, 'nav.notebook')}</span>
        </button>
        <button type="button" className={`nav-btn ${route.screen === 'sandbox' ? 'nav-active' : ''}`} onClick={() => navigate({ screen: 'sandbox' })}>
          <Icon name="flask" /> <span>{t(lang, 'nav.sandbox')}</span>
        </button>
        <button type="button" className={`nav-btn ${route.screen === 'curriculum' ? 'nav-active' : ''}`} onClick={() => navigate({ screen: 'curriculum' })}>
          <Icon name="layers" /> <span>{t(lang, 'nav.curriculum')}</span>
        </button>
        {complete && (
          <button type="button" className={`nav-btn ${route.screen === 'ending' ? 'nav-active' : ''}`} onClick={() => navigate({ screen: 'ending' })}>
            <Icon name="flag" /> <span>{t(lang, 'nav.ending')}</span>
          </button>
        )}
      </nav>
      <button type="button" className="palette-trigger" onClick={() => setPaletteOpen(true)} aria-label={t(lang, 'palette.title')}>
        <Icon name="search" size={14} />
        <span className="palette-trigger-text">{t(lang, 'palette.placeholder')}</span>
        <kbd>Ctrl K</kbd>
      </button>
      <span className="topbar-spacer" />
      <ToolchainStatus lang={lang} />
      <div className="lang-switch" role="group" aria-label={t(lang, 'a11y.language')}>
        {LANGS.map((l) => (
          <button key={l.id} type="button" className={`btn btn-small ${lang === l.id ? 'btn-on' : ''}`} aria-pressed={lang === l.id} onClick={() => setLang(l.id)} title={l.label}>
            {l.short}
          </button>
        ))}
      </div>
      <button type="button" className="btn btn-icon" aria-label={settings.sound ? t(lang, 'a11y.mute') : t(lang, 'a11y.unmute')} aria-pressed={settings.sound} onClick={() => update((s) => (s.settings.sound = !s.settings.sound))}>
        <Icon name={settings.sound ? 'volume' : 'mute'} />
      </button>
      <button type="button" className="btn btn-icon" aria-label={t(lang, 'nav.settings')} onClick={() => setSettingsOpen(true)}>
        <Icon name="gear" />
      </button>
    </header>
  );

  const common = { cur, save, update, lang, settings, navigate, reducedMotion };

  let screen;
  if (route.screen === 'mission' && mission) {
    screen = <MissionScreen key={mission.id} {...common} mission={mission} focusMode={focusMode} setFocusMode={setFocusMode} />;
  } else if (route.screen === 'map' || (route.screen === 'mission' && !mission)) {
    screen = <MapScreen {...common} selectedChapter={route.chapter} />;
  } else if (route.screen === 'notebook') screen = <NotebookScreen {...common} entryId={route.entry} />;
  else if (route.screen === 'sandbox') screen = <SandboxScreen {...common} />;
  else if (route.screen === 'curriculum') screen = <CurriculumScreen {...common} />;
  else if (route.screen === 'ending') screen = <EndingScreen {...common} />;
  else screen = <TitleScreen {...common} store={store} />;

  return (
    <FxContext.Provider value={fx}>
    <div className={`app screen-${route.screen}`}>
      {topbar}
      {store.notices.length > 0 && (
        <div className="notices" role="status">
          {store.notices.map((n, i) => (
            <div key={i} className="notice">
              <span>{t(lang, n.key, n.params)}</span>
              <button type="button" className="btn btn-small" onClick={() => store.dismissNotice(i)}>
                {t(lang, 'common.close')}
              </button>
            </div>
          ))}
        </div>
      )}
      <div className="screen-fade" key={route.screen === 'mission' ? 'mission' : route.screen}>
        {screen}
      </div>
      {paletteOpen && (
        <CommandPalette
          cur={cur}
          save={save}
          lang={lang}
          navigate={navigate}
          onClose={() => setPaletteOpen(false)}
          onAction={(a) => {
            if (a === 'settings') setSettingsOpen(true);
            if (a === 'lang') setLang(lang === 'ru' ? 'en' : 'ru');
            if (a === 'fx') update((s) => (s.settings.effects = s.settings.effects === false));
          }}
        />
      )}
      {settingsOpen && <SettingsDialog {...common} store={store} onClose={() => setSettingsOpen(false)} clangVersion={CLANG_PACKAGE_VERSION} />}
    </div>
    </FxContext.Provider>
  );
}
