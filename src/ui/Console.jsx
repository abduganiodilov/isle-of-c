import { useState } from 'react';
import { t, fill } from '../i18n/index.js';
import { classifyDiagnostic, sortDiagnostics, hiddenRuntimeFile } from '../validate/feedback.js';
import { describeExpectation } from '../validate/checker.js';

function Transcript({ transcript, lang }) {
  if (!transcript || !transcript.length) return <span className="muted">{t(lang, 'console.emptyOutput')}</span>;
  return transcript.map((s, i) => (
    <span key={i} className={`seg seg-${s.kind}`}>
      {s.text}
    </span>
  ));
}

export function RunStatus({ run, lang }) {
  if (!run) return null;
  if (run.stopped) return <div className="run-status warn-text">{t(lang, 'console.stopped')}</div>;
  if (run.timedOut) return <div className="run-status err-text">⏱ {t(lang, 'console.timeout', { seconds: (run.timeoutMs || 3000) / 1000 })}</div>;
  if (run.outputLimitExceeded) return <div className="run-status err-text">{t(lang, 'console.outputLimit')}</div>;
  if (run.trap) {
    const kind = t(lang, `trap.${run.trap.kind}`);
    return (
      <div className="run-status err-text">
        💥 {t(lang, 'failure.trap', { kind })}
        {run.trap.func ? t(lang, 'trap.inFunction', { func: run.trap.func }) : ''}
        <div className="small muted">{t(lang, 'trap.nativeNote')}</div>
      </div>
    );
  }
  return (
    <div className={`run-status ${run.exitCode === 0 ? 'ok-text' : 'warn-text'}`}>
      {run.exitCode === 0 ? t(lang, 'console.exit', { code: 0 }) : t(lang, 'console.exitNonZero', { code: run.exitCode })}
      {run.stdinRemaining > 0 && <span className="muted"> {t(lang, 'console.stdinLeft', { n: run.stdinRemaining })}</span>}
    </div>
  );
}

export function DiagnosticsList({ compile, lang, onJump }) {
  if (!compile) return <p className="muted">{t(lang, 'console.noOutput')}</p>;
  const diags = sortDiagnostics(compile.diagnostics || []).filter((d) => d.severity !== 'note');
  return (
    <div className="diagnostics">
      <p className={compile.ok ? 'ok-text' : 'err-text'}>
        {compile.ok ? (compile.cached ? t(lang, 'console.compiledCached') : t(lang, 'console.compiledOk', { ms: compile.ms ?? '?' })) : t(lang, 'console.compileFailed')}
        {compile.ok && !diags.length ? ' ' + t(lang, 'console.noDiagnostics') : ''}
      </p>
      {diags.map((d, i) => {
        const cls = classifyDiagnostic(d);
        const [title, meaning, next] = t(lang, `diag.${cls ? cls.key : 'generic'}`);
        const args = cls ? cls.params : [];
        const inHarness = hiddenRuntimeFile(d);
        return (
          <div key={i} className={`diag diag-${d.severity} ${i === 0 && d.severity === 'error' ? 'diag-first' : ''}`}>
            <div className="diag-head">
              <span className={`badge badge-${d.severity}`}>{d.severity}</span>
              {i === 0 && d.severity === 'error' && <span className="badge badge-start">{t(lang, 'console.startHere')}</span>}
              <strong>{fill(title, args)}</strong>
              {d.line && !inHarness && (
                <button type="button" className="link-btn" onClick={() => onJump?.({ line: d.line, column: d.column, t: Date.now() })}>
                  {t(lang, 'console.jump', { line: d.line })}
                </button>
              )}
              {inHarness && <span className="muted small">({t(lang, 'console.hiddenFile')})</span>}
            </div>
            <pre className="diag-raw mono">
              {d.file ? `${d.file}:${d.line}:${d.column}: ` : ''}
              {d.severity}: {d.message}
              {d.flag ? ` [${d.flag}]` : ''}
              {d.context && d.context.length ? '\n' + d.context.join('\n') : ''}
            </pre>
            <div className="diag-help">
              <div>
                <span className="muted small">{t(lang, 'console.whatItMeans')}: </span>
                {fill(meaning, args)}
              </div>
              <div>
                <span className="muted small">{t(lang, 'console.tryNext')}: </span>
                {fill(next, args)}
              </div>
            </div>
          </div>
        );
      })}
      {compile.stderr && (
        <details className="raw-stderr">
          <summary>{t(lang, 'console.raw')}</summary>
          <pre className="mono small">{compile.stderr}</pre>
        </details>
      )}
    </div>
  );
}

export function failureText(f, lang) {
  if (f.code === 'trap') {
    const kind = t(lang, `trap.${f.params.kind}`);
    return t(lang, 'failure.trap', { kind }) + (f.params.func ? t(lang, 'trap.inFunction', { func: f.params.func }) : '');
  }
  return t(lang, `failure.${f.code}`, f.params);
}

export function requirementText(f, lang) {
  return t(lang, `requirement.${f.code}`, f.params);
}

function TestRecord({ rec, lang, open, onToggle, noteText, onShowWorld }) {
  const test = rec.test;
  return (
    <div className={`test ${rec.pass ? 'test-pass' : 'test-fail'}`}>
      <button type="button" className="test-head" aria-expanded={open} onClick={onToggle}>
        <span aria-hidden="true">{rec.pass ? '✔' : '✘'}</span>
        <span className="mono">{test.id}</span>
        {rec.checkpoint != null && <span className="badge">{t(lang, 'result.checkpoint', { n: rec.checkpoint })}</span>}
        {test.harness && <span className="badge">{t(lang, 'console.hiddenFile')}</span>}
        <span className="test-note">{noteText}</span>
        <span className="sr-only">{rec.pass ? 'passed' : 'failed'}</span>
      </button>
      {open && (
        <div className="test-body">
          {!rec.pass && (
            <ul className="failures">
              {rec.failures.map((f, i) => (
                <li key={i}>{failureText(f, lang)}</li>
              ))}
            </ul>
          )}
          <div className="test-cols">
            <div>
              <div className="muted small">{t(lang, 'console.testInput')}</div>
              <pre className="mono">{test.stdin ? test.stdin : t(lang, 'console.noInput')}</pre>
            </div>
            <div>
              <div className="muted small">{t(lang, 'console.testExpected')}</div>
              <pre className="mono">{describeExpectation(test)}</pre>
            </div>
            <div>
              <div className="muted small">{t(lang, 'console.testActual')}</div>
              <pre className="mono">
                <Transcript transcript={rec.run.transcript} lang={lang} />
              </pre>
            </div>
          </div>
          <RunStatus run={rec.run} lang={lang} />
          {rec.run.world && onShowWorld && (
            <button type="button" className="btn btn-small" onClick={() => onShowWorld(rec)}>
              🤖 {lang === 'ru' ? 'Показать этот тест в мире' : 'Replay this test in the world'}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export function TestsPanel({ result, lang, progress, noteFor, onShowWorld }) {
  const [open, setOpen] = useState({});
  if (progress) return <p className="muted">{progress}</p>;
  if (!result) return <p className="muted">{t(lang, 'console.testsNotRun')}</p>;
  if (!result.compile.ok) return <p className="err-text">{t(lang, 'failure.compileFailed')} {t(lang, 'console.compileFailed')}</p>;
  const passed = result.tests.filter((x) => x.pass).length;
  const firstFail = result.tests.find((x) => !x.pass);
  return (
    <div className="tests">
      <p className={result.passed ? 'ok-text' : 'err-text'}>
        {t(lang, 'console.testsSummary', { passed, total: result.tests.length })}
      </p>
      {result.requirementFailures.length > 0 && (
        <div className="requirements">
          <div className="muted small">{t(lang, 'console.requirements')}</div>
          <ul>
            {result.requirementFailures.map((f, i) => (
              <li key={i} className="err-text">
                {requirementText(f, lang)}
              </li>
            ))}
          </ul>
        </div>
      )}
      {result.tests.map((rec) => (
        <TestRecord
          key={rec.id}
          rec={rec}
          lang={lang}
          noteText={noteFor(rec.test)}
          open={open[rec.id] ?? (firstFail && firstFail.id === rec.id)}
          onToggle={() => setOpen((o) => ({ ...o, [rec.id]: !(o[rec.id] ?? (firstFail && firstFail.id === rec.id)) }))}
          onShowWorld={onShowWorld}
        />
      ))}
    </div>
  );
}

export default function Console({ tab, setTab, stdin, setStdin, run, liveTranscript, phase, compile, tests, testsProgress, lang, onJump, noteFor, showInput = true, onShowWorld }) {
  const tabs = [
    ...(showInput ? [['input', t(lang, 'console.input')]] : []),
    ['output', t(lang, 'console.output')],
    ['diagnostics', t(lang, 'console.diagnostics') + (compile && compile.diagnostics?.filter((d) => d.severity !== 'note').length ? ` (${compile.diagnostics.filter((d) => d.severity !== 'note').length})` : '')],
    ['tests', t(lang, 'console.tests') + (tests ? ` (${tests.tests.filter((x) => x.pass).length}/${tests.tests.length})` : '')],
  ];
  const onKeyDown = (e) => {
    const idx = tabs.findIndex(([id]) => id === tab);
    if (e.key === 'ArrowRight') setTab(tabs[(idx + 1) % tabs.length][0]);
    if (e.key === 'ArrowLeft') setTab(tabs[(idx - 1 + tabs.length) % tabs.length][0]);
  };
  return (
    <section className="console" aria-label="Console">
      <div className="tabs" role="tablist" onKeyDown={onKeyDown}>
        {tabs.map(([id, label]) => (
          <button key={id} type="button" role="tab" id={`ctab-${id}`} aria-selected={tab === id} aria-controls={`cpanel-${id}`} tabIndex={tab === id ? 0 : -1} className={`tab ${tab === id ? 'tab-active' : ''}`} onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
        <span className="console-phase small muted" aria-live="polite">
          {phase === 'compiling' ? t(lang, 'console.compiling') : phase === 'running' ? t(lang, 'console.running') : ''}
        </span>
      </div>
      <div className="console-body" role="tabpanel" id={`cpanel-${tab}`} aria-labelledby={`ctab-${tab}`}>
        {tab === 'input' && (
          <div className="input-pane">
            <label htmlFor="stdin" className="small muted">
              {t(lang, 'console.inputHelp')}
            </label>
            <textarea id="stdin" className="stdin mono" value={stdin} onChange={(e) => setStdin(e.target.value)} placeholder={t(lang, 'console.inputPlaceholder')} spellCheck={false} rows={4} />
          </div>
        )}
        {tab === 'output' && (
          <div className="output-pane">
            {phase === 'running' && liveTranscript ? (
              <pre className="output mono" aria-live="polite">
                <Transcript transcript={liveTranscript} lang={lang} />
              </pre>
            ) : run ? (
              <>
                <pre className="output mono">
                  <Transcript transcript={run.transcript} lang={lang} />
                </pre>
                <RunStatus run={run} lang={lang} />
                {run.transcript?.some((s) => s.kind === 'in') && <p className="small muted">{t(lang, 'console.echoNote')}</p>}
              </>
            ) : (
              <p className="muted">{t(lang, 'console.noOutput')}</p>
            )}
          </div>
        )}
        {tab === 'diagnostics' && <DiagnosticsList compile={compile} lang={lang} onJump={onJump} />}
        {tab === 'tests' && <TestsPanel result={tests} lang={lang} progress={testsProgress} noteFor={noteFor} onShowWorld={onShowWorld} />}
      </div>
    </section>
  );
}
