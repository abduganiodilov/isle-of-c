import { useEffect, useMemo, useState } from 'react';
import GridScene from './GridScene.jsx';
import { checkpointStatus } from '../engine/assess.js';

// The world view reacts ONLY to real results: the latest compilation, the
// latest run's output / API trace, and the latest test results. Illustrations
// (frames scene) are labelled as such.

const L = (lang, en, ru) => (lang === 'ru' ? ru : en);

function lastMatch(text, pattern) {
  try {
    const re = new RegExp(pattern, 'gm');
    let m;
    let last = null;
    while ((m = re.exec(text))) {
      last = m;
      if (m[0] === '') re.lastIndex++;
    }
    return last ? last[1] : null;
  } catch {
    return null;
  }
}

function statusOf(data) {
  if (data.phase === 'compiling') return 'busy';
  if (data.phase === 'running' || data.phase === 'testing') return 'busy';
  if (data.compile && !data.compile.ok) return 'error';
  if (data.tests) return data.tests.passed ? 'ok' : 'fail';
  if (data.run) return data.run.trap || data.run.timedOut || data.run.outputLimitExceeded ? 'error' : 'ran';
  return 'idle';
}

function Lamp({ status, lang }) {
  const text = {
    idle: L(lang, 'standby', 'ожидание'),
    busy: L(lang, 'working…', 'работает…'),
    error: L(lang, 'fault', 'сбой'),
    ok: L(lang, 'online', 'в сети'),
    fail: L(lang, 'tests failing', 'тесты не пройдены'),
    ran: L(lang, 'ran', 'выполнено'),
  }[status];
  return (
    <span className={`lamp lamp-${status}`}>
      <span className="lamp-dot" aria-hidden="true" />
      {text}
    </span>
  );
}

function Header({ label, data, lang, tag }) {
  return (
    <div className="scene-header">
      <span className="scene-label">{label}</span>
      {tag && <span className="scene-tag">{tag}</span>}
      <Lamp status={statusOf(data)} lang={lang} />
    </div>
  );
}

function outputOf(data) {
  if (data.phase === 'running' && data.liveOut != null) return data.liveOut;
  return data.run?.stdout ?? '';
}

function TerminalScene({ world, data, lang, variant }) {
  const out = outputOf(data);
  const status = statusOf(data);
  const lines = out.split('\n');
  const shown = lines.slice(-14).join('\n');
  return (
    <div className={`scene scene-terminal ${variant === 'table' ? 'scene-table' : ''}`}>
      <Header label={world.label || 'TERMINAL'} data={data} lang={lang} tag={L(lang, 'shows your program\'s real output', 'показывает реальный вывод программы')} />
      <div className={`crt crt-${status}`}>
        {data.compile && !data.compile.ok ? (
          <pre className="crt-text crt-error">{L(lang, 'BUILD FAILED — see Diagnostics', 'СБОРКА НЕ УДАЛАСЬ — см. «Диагностика»')}</pre>
        ) : out ? (
          <pre className="crt-text">{shown}</pre>
        ) : (
          <pre className="crt-text crt-dim">{L(lang, '_ waiting for a program…', '_ ожидание программы…')}</pre>
        )}
        {status === 'ok' && <div className="crt-banner">{L(lang, 'SYSTEM ONLINE', 'СИСТЕМА В СЕТИ')}</div>}
      </div>
      {world.goal && <p className="scene-goal small">🎯 {world.goal}</p>}
    </div>
  );
}

function GaugesScene({ world, data, lang }) {
  const out = outputOf(data);
  return (
    <div className="scene scene-gauges">
      <Header label={world.label || 'GAUGES'} data={data} lang={lang} tag={L(lang, 'gauges read numbers from your output', 'приборы читают числа из вашего вывода')} />
      <div className="gauges">
        {(world.gauges || []).map((g, i) => {
          const raw = lastMatch(out, g.pattern);
          const val = raw == null ? null : Number(raw) * (g.scale || 1);
          const pct = val == null || !Number.isFinite(val) ? 0 : Math.max(0, Math.min(1, Math.abs(val) / (g.max || 100)));
          return (
            <div key={i} className="gauge">
              <svg viewBox="0 0 120 70" className="gauge-svg" aria-hidden="true">
                <path d="M10 60 A50 50 0 0 1 110 60" className="gauge-track" />
                <path d="M10 60 A50 50 0 0 1 110 60" className="gauge-fill" style={{ strokeDasharray: `${pct * 157} 157` }} />
              </svg>
              <div className="gauge-value mono">{raw == null ? '—' : raw}</div>
              <div className="gauge-label small">{g.label}</div>
            </div>
          );
        })}
      </div>
      <TestStrip data={data} lang={lang} />
    </div>
  );
}

function matchBin(bins, out) {
  for (let i = 0; i < bins.length; i++) {
    try {
      if (new RegExp(bins[i].match, 'm').test(out)) return i;
    } catch {
      /* ignore bad pattern */
    }
  }
  return -1;
}

function SorterScene({ world, data, lang, reducedMotion }) {
  const bins = world.bins || [];
  // Crates: one per test when tests ran; otherwise one for the latest run.
  const crates = useMemo(() => {
    if (data.tests && data.tests.tests.length) {
      return data.tests.tests.map((t) => ({ id: t.id, label: (t.test.stdin || '').trim().replace(/\s+/g, ' ') || t.id, bin: matchBin(bins, t.run.stdout || ''), pass: t.pass }));
    }
    if (data.run) return [{ id: 'run', label: (data.runInput || '').trim().replace(/\s+/g, ' ') || 'run', bin: matchBin(bins, data.run.stdout || ''), pass: null }];
    return [];
  }, [data.tests, data.run, data.runInput, bins]);
  const [shown, setShown] = useState(crates.length);
  useEffect(() => {
    if (reducedMotion) {
      setShown(crates.length);
      return;
    }
    setShown(0);
    let i = 0;
    const id = setInterval(() => {
      i++;
      setShown(i);
      if (i >= crates.length) clearInterval(id);
    }, 260);
    return () => clearInterval(id);
  }, [crates, reducedMotion]);
  const rejected = crates.slice(0, shown).filter((c) => c.bin < 0);
  return (
    <div className="scene scene-sorter">
      <Header label={world.label || 'SORTER'} data={data} lang={lang} tag={L(lang, 'each crate = one input; your output picks the bin', 'каждый ящик — один ввод; ваш вывод выбирает лоток')} />
      <div className="belt" aria-hidden="true">
        <div className={`belt-stripes ${data.phase === 'testing' || data.phase === 'running' ? 'belt-moving' : ''}`} />
      </div>
      <div className="bins">
        {bins.map((b, i) => (
          <div key={i} className="bin">
            <div className="bin-crates">
              {crates.slice(0, shown).filter((c) => c.bin === i).map((c) => (
                <span key={c.id} className={`crate ${c.pass === true ? 'crate-ok' : c.pass === false ? 'crate-bad' : ''}`} title={c.label}>
                  {c.label.length > 8 ? c.label.slice(0, 7) + '…' : c.label}
                </span>
              ))}
            </div>
            <div className="bin-label mono">{b.label}</div>
          </div>
        ))}
      </div>
      {rejected.length > 0 && (
        <p className="small warn-text">
          {L(lang, 'Unrecognised output for: ', 'Нераспознанный вывод для: ')}
          {rejected.map((c) => c.label).join(', ')}
        </p>
      )}
      {!crates.length && <p className="muted small">{L(lang, 'Run or Check your program to send crates down the belt.', 'Запустите или проверьте программу, чтобы отправить ящики по ленте.')}</p>}
    </div>
  );
}

function FramesScene({ world, data, lang }) {
  const steps = world.illustration || [];
  const [i, setI] = useState(0);
  const s = steps[i] || { frames: [], caption: '' };
  return (
    <div className="scene scene-frames">
      <div className="scene-header">
        <span className="scene-label">{world.label || L(lang, 'CALL STACK', 'СТЕК ВЫЗОВОВ')}</span>
        <span className="scene-tag illus">{L(lang, 'Illustration — not a trace of your program', 'Иллюстрация — не трассировка вашей программы')}</span>
      </div>
      <div className="frames">
        {s.frames.map((f, k) => (
          <div key={k} className={`frame ${k === s.frames.length - 1 ? 'frame-top' : ''}`}>
            <div className="frame-name mono">{f.name}()</div>
            {f.vars.map((v) => (
              <div key={v.name} className={`var ${v.changed ? 'var-changed' : ''} ${v.copy ? 'var-copy' : ''}`}>
                <span className="mono">{v.name}</span>
                <span className="var-box mono">{v.value}</span>
                {v.copy && <span className="small muted">{L(lang, 'copy', 'копия')}</span>}
              </div>
            ))}
          </div>
        ))}
      </div>
      <p className="frame-caption">{s.caption}</p>
      <div className="grid-controls">
        <button type="button" className="btn btn-small" disabled={i === 0} onClick={() => setI(i - 1)}>◀ {L(lang, 'Back', 'Назад')}</button>
        <span className="small">{i + 1} / {steps.length}</span>
        <button type="button" className="btn btn-small" disabled={i >= steps.length - 1} onClick={() => setI(i + 1)}>{L(lang, 'Next', 'Далее')} ▶</button>
      </div>
      {data.run && (
        <div className="real-output">
          <div className="small muted">{L(lang, 'Your program really printed:', 'Ваша программа на самом деле вывела:')}</div>
          <pre className="mono small">{data.run.stdout || L(lang, '(nothing)', '(ничего)')}</pre>
        </div>
      )}
    </div>
  );
}

function PipelineScene({ world, data, lang }) {
  const c = data.compile;
  const linkError = c && !c.ok && c.diagnostics.some((d) => d.linker);
  const compileError = c && !c.ok && !linkError;
  const run = data.run;
  const stages = [
    { id: 'src', label: L(lang, 'Source .c', 'Исходник .c'), state: c ? 'ok' : 'idle' },
    { id: 'cc', label: L(lang, 'Compile', 'Компиляция'), state: !c ? 'idle' : compileError ? 'error' : 'ok' },
    { id: 'obj', label: L(lang, 'Object file', 'Объектный файл'), state: !c || compileError ? 'idle' : 'ok' },
    { id: 'ld', label: L(lang, 'Link + libraries', 'Компоновка + библиотеки'), state: !c || compileError ? 'idle' : linkError ? 'error' : 'ok' },
    { id: 'exe', label: L(lang, 'Executable', 'Исполняемый файл'), state: c && c.ok ? 'ok' : 'idle' },
    { id: 'run', label: L(lang, 'Run', 'Запуск'), state: data.phase === 'running' ? 'busy' : run ? (run.trap || run.timedOut ? 'error' : 'ok') : 'idle' },
  ];
  return (
    <div className="scene scene-pipeline">
      <Header label={world.label || 'BUILD'} data={data} lang={lang} tag={L(lang, 'stages reflect the real compiler result', 'этапы отражают реальный результат компилятора')} />
      <ol className="pipeline">
        {stages.map((s) => (
          <li key={s.id} className={`stage stage-${s.state}`}>
            <span className="stage-dot" aria-hidden="true" />
            <span>{s.label}</span>
            <span className="sr-only">{s.state}</span>
          </li>
        ))}
      </ol>
      {compileError && <p className="small err-text">{L(lang, 'The compiler stopped: see the Diagnostics tab.', 'Компилятор остановился: см. вкладку «Диагностика».')}</p>}
      {linkError && <p className="small err-text">{L(lang, 'Every file compiled, but the linker could not find something.', 'Всё скомпилировалось, но компоновщик что-то не нашёл.')}</p>}
      {run && <pre className="crt-text small">{run.stdout}</pre>}
    </div>
  );
}

function CoreScene({ world, data, lang }) {
  const cps = data.tests ? checkpointStatus(data.tests.tests) : [];
  const names = world.checkpoints || [];
  return (
    <div className="scene scene-core">
      <Header label={L(lang, 'ISLAND CORE', 'ЯДРО ОСТРОВА')} data={data} lang={lang} tag={L(lang, 'rings light up as checkpoint tests pass', 'кольца загораются, когда проходят тесты контрольных точек')} />
      <svg viewBox="0 0 200 200" className="core-svg" role="img" aria-label={cps.map((c) => `${c.checkpoint}: ${c.pass ? 'pass' : 'fail'}`).join(', ') || 'core'}>
        {names.map((_, i) => {
          const st = cps.find((c) => c.checkpoint === i + 1);
          return <circle key={i} cx="100" cy="100" r={88 - i * 18} className={`core-ring ${st ? (st.pass ? 'ring-ok' : 'ring-bad') : ''}`} />;
        })}
        <circle cx="100" cy="100" r="16" className={`core-heart ${data.tests?.passed ? 'heart-on' : ''}`} />
      </svg>
      <ol className="checkpoint-list small">
        {names.map((n, i) => {
          const st = cps.find((c) => c.checkpoint === i + 1);
          return (
            <li key={i} className={st ? (st.pass ? 'ok-text' : 'err-text') : 'muted'}>
              {st ? (st.pass ? '✔ ' : '✘ ') : '○ '}
              {n}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function TestStrip({ data, lang }) {
  if (!data.tests) return null;
  return (
    <div className="test-strip" aria-label={L(lang, 'Test results', 'Результаты тестов')}>
      {data.tests.tests.map((t) => (
        <span key={t.id} className={`chip ${t.pass ? 'chip-ok' : 'chip-bad'}`}>
          {t.pass ? '✔' : '✘'} {t.id}
        </span>
      ))}
    </div>
  );
}

export default function WorldView({ world, data, lang, reducedMotion, gridConfig, gridRun }) {
  if (!world) return null;
  const scene = world.scene;
  if (scene === 'grid') return <GridScene config={gridConfig || world.grid} run={gridRun} lang={lang} reducedMotion={reducedMotion} label={world.label} />;
  if (scene === 'gauges') return <GaugesScene world={world} data={data} lang={lang} />;
  if (scene === 'sorter') return <SorterScene world={world} data={data} lang={lang} reducedMotion={reducedMotion} />;
  if (scene === 'frames') return <FramesScene world={world} data={data} lang={lang} />;
  if (scene === 'pipeline') return <PipelineScene world={world} data={data} lang={lang} />;
  if (scene === 'core') return <CoreScene world={world} data={data} lang={lang} />;
  return <TerminalScene world={world} data={data} lang={lang} variant={scene} />;
}
