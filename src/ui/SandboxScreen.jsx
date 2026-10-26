import { useRef, useState } from 'react';
import Icon from './Icons.jsx';
import { t } from '../i18n/index.js';
import { engine } from '../exec/engine.js';
import CodeEditor from './CodeEditor.jsx';
import Console from './Console.jsx';
import GridScene from '../world/GridScene.jsx';

const SANDBOX_GRID = { width: 7, height: 5, start: [0, 0], damage: [[2, 0, 1], [5, 1, 2], [1, 3, 1], [6, 4, 3], [3, 2, 1]] };

export default function SandboxScreen({ save, update, lang, settings, reducedMotion }) {
  const code = save.sandbox.code ?? t(lang, 'sandbox.starter');
  const stdin = save.sandbox.stdin ?? '';
  const grid = !!save.sandbox.grid;
  const [tab, setTab] = useState('output');
  const [phase, setPhase] = useState('idle');
  const [compile, setCompile] = useState(null);
  const [run, setRun] = useState(null);
  const [live, setLive] = useState(null);
  const [jumpTo, setJumpTo] = useState(null);
  const pending = useRef(null);
  const timer = useRef(null);

  const onChange = (v) => {
    pending.current = v;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => update((s) => (s.sandbox.code = pending.current)), 400);
  };

  const onRun = async () => {
    if (phase !== 'idle') return;
    const source = pending.current ?? code;
    setPhase('compiling');
    let c;
    try {
      c = await engine.compile(source);
    } catch (e) {
      setPhase('idle');
      setCompile({ ok: false, diagnostics: [{ severity: 'error', message: e.message, line: null }], stderr: '' });
      return;
    }
    setCompile(c);
    if (!c.ok) {
      setPhase('idle');
      setTab('diagnostics');
      return;
    }
    setPhase('running');
    setTab('output');
    const segs = [];
    setLive([]);
    const r = await engine.run(c.module, {
      stdin,
      world: grid ? SANDBOX_GRID : null,
      timeoutMs: 5000,
      onSegment: (s) => {
        segs.push(s);
        setLive(segs.slice());
      },
    });
    r.timeoutMs = 5000;
    setLive(null);
    setRun(r);
    setPhase('idle');
  };

  return (
    <main id="main" className="sandbox-screen">
      <div className="sandbox-head">
        <h1>{t(lang, 'sandbox.title')}</h1>
        <p className="muted small">{t(lang, 'sandbox.intro')}</p>
        <label className="small">
          <input type="checkbox" checked={grid} onChange={(e) => update((s) => (s.sandbox.grid = e.target.checked))} /> {t(lang, 'sandbox.grid')}
        </label>
      </div>
      <div className={`sandbox-grid ${grid ? 'with-world' : ''}`}>
        <section className="editor-panel">
          <div className="toolbar">
            <button type="button" className="btn btn-primary" onClick={onRun} disabled={phase !== 'idle'}>
              <Icon name="play" /> {t(lang, 'editor.run')}
            </button>
            <button type="button" className="btn btn-danger" onClick={() => engine.stop()} disabled={phase === 'idle'}>
              <Icon name="stop" /> {t(lang, 'editor.stop')}
            </button>
            <button type="button" className="btn" onClick={() => { if (window.confirm(t(lang, 'editor.resetConfirm'))) { pending.current = null; update((s) => (s.sandbox.code = null)); setJumpTo({ reset: Date.now() }); } }}>
              <Icon name="reset" /> {t(lang, 'editor.reset')}
            </button>
          </div>
          <CodeEditor value={code} docKey="sandbox" forceValue={jumpTo?.reset || 0} onChange={onChange} fontSize={settings.fontSize} diagnostics={compile?.diagnostics || []} ariaLabel={t(lang, 'editor.label')} onRun={onRun} onStop={() => engine.stop()} jumpTo={jumpTo?.line ? jumpTo : null} />
        </section>
        {grid && (
          <section className="world-panel">
            <GridScene config={SANDBOX_GRID} run={run} lang={lang} reducedMotion={reducedMotion} />
          </section>
        )}
        <Console tab={tab} setTab={setTab} stdin={stdin} setStdin={(v) => update((s) => (s.sandbox.stdin = v))} run={run} liveTranscript={live} phase={phase} compile={compile} tests={null} lang={lang} onJump={setJumpTo} noteFor={() => ''} />
      </div>
    </main>
  );
}
