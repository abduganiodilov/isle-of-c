import { useEffect, useRef } from 'react';
import { t, LANGS } from '../i18n/index.js';
import { parseSave } from '../engine/progress.js';

export default function SettingsDialog({ save, update, lang, store, onClose, clangVersion }) {
  const s = save.settings;
  const ref = useRef(null);
  useEffect(() => {
    ref.current?.querySelector('select, button, input')?.focus();
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  const set = (k, v) => update((x) => (x.settings[k] = v));
  const doExport = () => {
    const blob = new Blob([store.exportText()], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `isle-of-c-progress-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
  const doImport = async (e) => {
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
  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div className="modal settings" role="dialog" aria-modal="true" aria-labelledby="settings-title" onClick={(e) => e.stopPropagation()} ref={ref}>
        <h2 id="settings-title">{t(lang, 'settings.title')}</h2>
        <div className="form-grid">
          <label htmlFor="set-lang">{t(lang, 'settings.language')}</label>
          <select id="set-lang" value={s.lang} onChange={(e) => set('lang', e.target.value)}>
            {LANGS.map((l) => (
              <option key={l.id} value={l.id}>
                {l.label}
              </option>
            ))}
          </select>
          <label htmlFor="set-font">{t(lang, 'settings.fontSize')}</label>
          <div className="row">
            <button type="button" className="btn btn-small" aria-label={t(lang, 'editor.fontSmaller')} onClick={() => set('fontSize', Math.max(11, s.fontSize - 1))}>
              A−
            </button>
            <input id="set-font" type="range" min={11} max={28} value={s.fontSize} onChange={(e) => set('fontSize', Number(e.target.value))} />
            <button type="button" className="btn btn-small" aria-label={t(lang, 'editor.fontBigger')} onClick={() => set('fontSize', Math.min(28, s.fontSize + 1))}>
              A+
            </button>
            <span className="mono">{s.fontSize}px</span>
          </div>
          <label htmlFor="set-theme">{t(lang, 'settings.theme')}</label>
          <select id="set-theme" value={s.theme} onChange={(e) => set('theme', e.target.value)}>
            {Object.entries(t(lang, 'settings.themes')).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
          <label htmlFor="set-motion">{t(lang, 'settings.motion')}</label>
          <select id="set-motion" value={s.reducedMotion} onChange={(e) => set('reducedMotion', e.target.value)}>
            {Object.entries(t(lang, 'settings.motions')).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
          <label htmlFor="set-sound">{t(lang, 'settings.sound')}</label>
          <select id="set-sound" value={s.sound ? 'on' : 'off'} onChange={(e) => set('sound', e.target.value === 'on')}>
            <option value="off">{t(lang, 'settings.soundOff')}</option>
            <option value="on">{t(lang, 'settings.soundOn')}</option>
          </select>
        </div>
        <h3>{t(lang, 'settings.progress')}</h3>
        <div className="row wrap">
          <button type="button" className="btn" onClick={doExport}>
            ⤓ {t(lang, 'settings.export')}
          </button>
          <label className="btn file-btn">
            ⤒ {t(lang, 'settings.import')}
            <input type="file" accept="application/json,.json" className="sr-only" onChange={doImport} />
          </label>
          <button
            type="button"
            className="btn btn-danger"
            onClick={() => {
              if (window.confirm(t(lang, 'settings.resetConfirm'))) store.reset();
            }}
          >
            {t(lang, 'settings.reset')}
          </button>
        </div>
        <h3>{t(lang, 'settings.about')}</h3>
        <p className="small">{t(lang, 'settings.aboutText', { version: clangVersion })}</p>
        <div className="row">
          <button type="button" className="btn btn-primary" onClick={onClose}>
            {t(lang, 'settings.close')}
          </button>
        </div>
      </div>
    </div>
  );
}
