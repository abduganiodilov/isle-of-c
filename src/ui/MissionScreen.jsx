import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { t } from '../i18n/index.js';
import { tx, missionStatus, missingPrerequisites, nextMission, campaignComplete } from '../engine/curriculum.js';
import { completeStep, completeMission, completeRetry, recordHint, touchMission } from '../engine/progress.js';
import { assessStep } from '../engine/assess.js';
import { engine } from '../exec/engine.js';
import CodeEditor from './CodeEditor.jsx';
import Console from './Console.jsx';
import Markdown from './Markdown.jsx';
import HintsPanel from './HintsPanel.jsx';
import Splitter from './Splitter.jsx';
import { QuizStep, OrderStep, PredictStep } from './StepPanels.jsx';
import WorldView from '../world/WorldView.jsx';
import { playSound } from './sound.js';
import Icon from './Icons.jsx';
import Robot from './Robot.jsx';
import { Scramble, Burst } from './fx.jsx';

const RETRY_SKELETON = (step) => {
  const includes = (step.starter.match(/^#include[^\n]*$/gm) || ['#include <stdio.h>']).join('\n');
  return `${includes}\n\n/* Mastery retry: write the whole solution yourself. */\n\nint main(void)\n{\n\n    return 0;\n}\n`;
};

export function translateWorld(cur, lang, mission) {
  const w = mission.world;
  if (!w) return null;
  const k = `${mission._k}.world`;
  const pick = (key, fallback) => (lang !== 'en' && cur.i18n?.[lang]?.[key]) || fallback;
  return {
    ...w,
    label: pick(`${k}.label`, w.label),
    goal: pick(`${k}.goal`, w.goal),
    checkpoints: (w.checkpoints || []).map((c, i) => pick(`${k}.checkpoints.${i}`, c)),
    illustration: (w.illustration || []).map((s, i) => ({ ...s, caption: pick(`${k}.illustration.${i}.caption`, s.caption) })),
  };
}

function useThrottledState(initial) {
  const [state, setState] = useState(initial);
  const ref = useRef(initial);
  const timer = useRef(null);
  const set = useCallback((v) => {
    ref.current = v;
    if (!timer.current) {
      timer.current = setTimeout(() => {
        timer.current = null;
        setState(ref.current);
      }, 60);
    }
  }, []);
  const setNow = useCallback((v) => {
    ref.current = v;
    clearTimeout(timer.current);
    timer.current = null;
    setState(v);
  }, []);
  return [state, set, setNow, ref];
}

export default function MissionScreen({ cur, mission, save, update, lang, settings, navigate, reducedMotion, focusMode, setFocusMode }) {
  const rec = save.missions[mission.id];
  const status = missionStatus(cur, save, mission.id);
  const steps = mission.steps;
  const codeStepIndex = steps.map((s) => s.type).lastIndexOf('code');
  const completed = rec?.status === 'completed';
  const stepDone = (i) => !!rec?.steps?.[steps[i].id]?.done;
  const canOpen = (i) => completed || i === 0 || steps.slice(0, i).every((_, j) => stepDone(j));
  const firstOpen = () => {
    if (completed) return codeStepIndex >= 0 ? codeStepIndex : 0;
    const i = steps.findIndex((_, j) => !stepDone(j));
    return i === -1 ? Math.max(0, codeStepIndex) : i;
  };

  const [stepIdx, setStepIdx] = useState(firstOpen);
  const [retry, setRetry] = useState(false);
  const [leftTab, setLeftTab] = useState('brief');
  const [consoleTab, setConsoleTab] = useState('output');
  const [phase, setPhase] = useState('idle');
  const [compile, setCompile] = useState(null);
  const [lastRun, setLastRun] = useState(null);
  const [runInput, setRunInput] = useState('');
  const [tests, setTests] = useState(null);
  const [testsProgress, setTestsProgress] = useState(null);
  const [live, setLive, setLiveNow, liveRef] = useThrottledState(null);
  const [result, setResult] = useState(null);
  const [jumpTo, setJumpTo] = useState(null);
  const [forceValue, setForceValue] = useState(0);
  const [retryHint, setRetryHint] = useState(0);
  const [gridView, setGridView] = useState(null); // { config, run }
  const [toolchainError, setToolchainError] = useState(null);
  const [feedback, setFeedback] = useState(null); // 'shake' | 'flash-ok' (decorative)
  const pulse = (kind) => {
    setFeedback(null);
    requestAnimationFrame(() => setFeedback(kind));
    setTimeout(() => setFeedback(null), 900);
  };

  const step = steps[stepIdx];
  const codeStep = step.type === 'code' ? step : steps[codeStepIndex];
  const draftKey = retry ? `${mission.id}#retry` : `${mission.id}#${(codeStep || step).id}`;
  const starter = retry ? mission.mastery?.retry?.starter ?? RETRY_SKELETON(codeStep) : codeStep?.starter ?? '';
  const draft = save.drafts[draftKey];
  const code = draft?.code ?? starter;
  const stdin = draft?.stdin ?? codeStep?.stdin ?? '';
  const editorValue = step.type === 'predict' ? step.code : code;
  const editorReadOnly = step.type !== 'code';

  const txs = useCallback((s) => (field, i) => tx(cur, lang, s, field, i), [cur, lang]);
  const txm = (field, i) => tx(cur, lang, mission, field, i);
  const world = useMemo(() => translateWorld(cur, lang, mission), [cur, lang, mission]);
  const gridDefault = mission.world?.grid || null;

  // Reset transient state when the mission changes.
  useEffect(() => {
    setStepIdx(firstOpen());
    setRetry(false);
    setCompile(null);
    setLastRun(null);
    setTests(null);
    setResult(null);
    setGridView(null);
    setLeftTab('brief');
    setConsoleTab(steps[firstOpen()].type === 'code' && (steps[firstOpen()].stdin || '').length ? 'input' : 'output');
    update((s) => {
      if (status !== 'locked') touchMission(s, mission.id);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mission.id]);

  const setDraft = useCallback(
    (patch) => {
      update((s) => {
        const prev = s.drafts[draftKey] || { code, stdin };
        s.drafts[draftKey] = { ...prev, ...patch, updatedAt: new Date().toISOString() };
      });
    },
    [update, draftKey, code, stdin],
  );

  const codeChangeTimer = useRef(null);
  const pendingCode = useRef(null);
  const onCodeChange = (value) => {
    if (step.type !== 'code') return;
    pendingCode.current = value;
    clearTimeout(codeChangeTimer.current);
    codeChangeTimer.current = setTimeout(() => setDraft({ code: pendingCode.current }), 400);
  };
  const currentCode = () => pendingCode.current ?? code;
  useEffect(() => {
    pendingCode.current = null;
  }, [draftKey]);

  const compileSafe = async (source, harness) => {
    try {
      const c = await engine.compile(source, harness);
      setToolchainError(null);
      return c;
    } catch (e) {
      setToolchainError(e.message || String(e));
      setPhase('idle');
      throw e;
    }
  };

  const runProgram = async ({ source, input, worldConfig }) => {
    setTests(null);
    setPhase('compiling');
    let c;
    try {
      c = await compileSafe(source, null);
    } catch {
      return null;
    }
    setCompile(c);
    if (!c.ok) {
      setPhase('idle');
      setConsoleTab('diagnostics');
      pulse('shake');
      playSound('fail', settings.sound);
      return { compile: c };
    }
    setPhase('running');
    setRunInput(input);
    setLiveNow([]);
    setConsoleTab('output');
    playSound('run', settings.sound);
    const r = await engine.run(c.module, {
      stdin: input,
      world: worldConfig,
      timeoutMs: codeStep?.timeoutMs || 3000,
      onSegment: (seg) => setLive([...(liveRef.current || []), seg]),
    });
    r.timeoutMs = codeStep?.timeoutMs || 3000;
    setLiveNow(null);
    setLastRun(r);
    if (worldConfig) setGridView({ config: worldConfig, run: r });
    setPhase('idle');
    if (c.diagnostics.some((d) => d.severity === 'warning')) setConsoleTab((tab) => tab);
    update((s) => {
      touchMission(s, mission.id).runs++;
    });
    return { compile: c, run: r };
  };

  const onRun = () => {
    if (phase !== 'idle') return;
    if (step.type === 'predict') return; // predictions are run from the step card
    if (step.type !== 'code') return;
    runProgram({ source: currentCode(), input: stdin, worldConfig: gridDefault });
  };

  const onStop = () => {
    if (engine.running) engine.stop();
  };

  const onCheck = async () => {
    if (phase !== 'idle' || step.type !== 'code') return;
    const source = currentCode();
    if (pendingCode.current != null) setDraft({ code: source });
    setPhase('testing');
    setTests(null);
    setConsoleTab('tests');
    const allTests = retry ? [...step.tests, ...(mission.mastery?.retry?.tests || [])] : step.tests;
    let res;
    try {
      res = await assessStep(step, source, {
        compile: (src, h) => compileSafe(src, h),
        run: (m, o) => engine.run(m, o),
        tests: allTests,
        onProgress: (ev) => {
          if (ev.type === 'test-start') {
            const n = allTests.findIndex((x) => x.id === ev.id) + 1;
            setTestsProgress(t(lang, 'console.runningTests', { n, total: allTests.length }));
          }
        },
      });
    } catch {
      setPhase('idle');
      setTestsProgress(null);
      return;
    }
    setTestsProgress(null);
    setCompile({ ...res.compile, ms: undefined, cached: true });
    setTests(res);
    setPhase('idle');
    if (!res.compile.ok) setConsoleTab('diagnostics');
    // Show a grid test in the world: the first failing one, else the first.
    const gridRec = res.tests.find((x) => !x.pass && x.run.world) || res.tests.find((x) => x.run.world);
    if (gridRec) setGridView({ config: gridRec.test.world || gridDefault, run: gridRec.run });
    if (res.tests.length) setLastRun(res.tests.find((x) => !x.pass)?.run || res.tests[res.tests.length - 1].run);

    let outcome = null;
    update((s) => {
      const m = touchMission(s, mission.id);
      if (!retry) m.attempts++;
      if (!res.passed) return;
      if (retry) {
        completeRetry(s, mission);
        outcome = { retry: true };
        return;
      }
      completeStep(s, mission.id, step.id, { passedAt: new Date().toISOString() });
      const allDone = steps.every((st) => st.id === step.id || s.missions[mission.id].steps[st.id]?.done);
      if (allDone) {
        const { first } = completeMission(s, mission);
        outcome = { first, mastered: s.missions[mission.id].mastered, assisted: s.missions[mission.id].solutionRevealed };
      } else outcome = { stepOnly: true };
    });
    if (res.passed) {
      pulse('flash-ok');
      playSound('success', settings.sound);
      setResult({ ...(outcome || {}), retry });
    } else {
      pulse('shake');
      playSound('fail', settings.sound);
    }
  };

  const onReset = () => {
    if (!window.confirm(t(lang, 'editor.resetConfirm'))) return;
    pendingCode.current = null;
    update((s) => {
      s.drafts[draftKey] = { code: starter, stdin: codeStep?.stdin ?? '', updatedAt: new Date().toISOString() };
    });
    setForceValue((v) => v + 1);
  };

  const hintLevel = retry ? retryHint : rec?.hintLevel || 0;
  const onRevealHint = (n) => {
    if (retry) {
      setRetryHint(Math.min(3, n));
      return;
    }
    update((s) => recordHint(s, mission.id, n));
  };
  const onCopySolution = () => {
    pendingCode.current = null;
    update((s) => {
      s.drafts[draftKey] = { code: codeStep.solution, stdin, updatedAt: new Date().toISOString() };
    });
    setForceValue((v) => v + 1);
  };

  const markStep = (data) => {
    update((s) => {
      completeStep(s, mission.id, step.id, data);
      const allDone = steps.every((st) => s.missions[mission.id].steps[st.id]?.done);
      if (allDone && s.missions[mission.id].status !== 'completed') completeMission(s, mission);
    });
  };

  const runPrediction = async () => {
    setPhase('compiling');
    let c;
    try {
      c = await compileSafe(step.code, null);
    } catch {
      return null;
    }
    setCompile(c);
    if (!c.ok) {
      setPhase('idle');
      setConsoleTab('diagnostics');
      return { compile: c };
    }
    setPhase('running');
    setRunInput(step.stdin || '');
    const r = await engine.run(c.module, { stdin: step.stdin || '', timeoutMs: 3000 });
    setLastRun(r);
    setPhase('idle');
    setConsoleTab('output');
    return { compile: c, run: r };
  };

  const runExample = (src, input) => runProgram({ source: src, input, worldConfig: null });

  const goNextStep = () => {
    if (stepIdx < steps.length - 1) {
      setStepIdx(stepIdx + 1);
      setLeftTab('brief');
      if (steps[stepIdx + 1].type === 'code' && (steps[stepIdx + 1].stdin || '').length) setConsoleTab('input');
    }
  };

  // Keyboard shortcuts outside the editor.
  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        if (e.shiftKey) onCheck();
        else onRun();
      } else if (e.key === 'Escape' && engine.running) onStop();
      else if (e.altKey && (e.key === 'z' || e.key === 'Z')) setFocusMode((f) => !f);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // ---- layout sizes (percent of the screen width / height)
  const containerRef = useRef(null);
  const [layout, setLayout] = useState(settings.layout);
  useEffect(() => setLayout(settings.layout), [settings.layout]);
  const adjust = (key, deltaPx, commit, axis = 'x', sign = 1) => {
    const el = containerRef.current;
    if (!el) return;
    const size = axis === 'x' ? el.clientWidth : el.clientHeight;
    setLayout((l) => {
      const next = { ...l, [key]: Math.max(15, Math.min(60, l[key] + (sign * deltaPx * 100) / size)) };
      if (commit) update((s) => (s.settings.layout = next));
      return next;
    });
  };

  if (status === 'locked') {
    const missing = missingPrerequisites(cur, save, mission.id);
    return (
      <main className="locked-mission" id="main">
        <h1>{txm('title')}</h1>
        <p>{t(lang, 'mission.locked')}</p>
        <ul>
          {missing.map((id) => (
            <li key={id}>
              <button type="button" className="link-btn" onClick={() => navigate({ screen: 'mission', id })}>
                {tx(cur, lang, cur.missionById.get(id), 'title')}
              </button>
            </li>
          ))}
        </ul>
        <button type="button" className="btn" onClick={() => navigate({ screen: 'map' })}>
          {t(lang, 'nav.map')}
        </button>
      </main>
    );
  }

  const chapter = cur.chapterById.get(mission.chapter);
  const noteFor = (test) => tx(cur, lang, { _k: `${codeStep?._k}.tests.${test.id}`, note: test.note }, 'note');
  const worldData = { phase, compile, run: lastRun, runInput, tests, liveOut: live ? live.filter((s) => s.kind === 'out').map((s) => s.text).join('') : null };
  const usesIsland = /#\s*include\s*<island\.h>/.test(editorValue || '');

  const leftPanel = (
    <aside className="left-panel" aria-label={t(lang, 'mission.tabs.brief')}>
      <div className="tabs" role="tablist">
        {['brief', 'learn', 'hints', ...(completed ? ['debrief'] : [])].map((id) => (
          <button key={id} type="button" role="tab" aria-selected={leftTab === id} className={`tab ${leftTab === id ? 'tab-active' : ''}`} onClick={() => setLeftTab(id)}>
            {t(lang, `mission.tabs.${id}`)}
            {id === 'hints' && hintLevel > 0 ? ` (${hintLevel})` : ''}
          </button>
        ))}
      </div>
      <div className="left-body">
        {leftTab === 'brief' && (
          <>
            <div className="mission-head">
              <span className="badge">{t(lang, `map.kinds.${mission.kind}`)}</span>
              {cur.isOptional(mission) && <span className="badge">{t(lang, 'map.optional')}</span>}
              {completed && <span className={`badge ${rec.mastered ? 'badge-ok' : 'badge-warn'}`}>{rec.mastered ? t(lang, 'mission.masteredBadge') : t(lang, 'mission.assistedBadge')}</span>}
              {retry && <span className="badge badge-warn">{t(lang, 'mission.retryMode')}</span>}
            </div>
            <Markdown text={txm('briefing')} lang={lang} />
            <details className="objectives" open={!completed}>
              <summary>{t(lang, 'mission.objectives')}</summary>
              <ul>
                {mission.objectives.map((o, i) => (
                  <li key={i}>{txm('objectives', i)}</li>
                ))}
              </ul>
              <div className="small muted">
                {t(lang, 'mission.prerequisites')}:{' '}
                {mission.prerequisites?.length
                  ? mission.prerequisites.map((p, i) => (
                      <span key={p}>
                        {i > 0 && ', '}
                        <button type="button" className="link-btn" onClick={() => navigate({ screen: 'mission', id: p })}>
                          {tx(cur, lang, cur.missionById.get(p), 'title')}
                        </button>
                      </span>
                    ))
                  : t(lang, 'mission.noPrereq')}
              </div>
              <div className="small muted">
                {t(lang, 'mission.sources')}: {mission.source.map((s) => t(lang, 'map.sources', { lecture: s.lecture, slides: s.slides.join(', ') })).join('; ')}
              </div>
            </details>
            <nav className="step-nav" aria-label={t(lang, 'mission.steps')}>
              {steps.map((s, i) => (
                <button key={s.id} type="button" className={`step-pill ${i === stepIdx ? 'step-current' : ''} ${stepDone(i) ? 'step-done' : ''}`} disabled={!canOpen(i)} aria-current={i === stepIdx ? 'step' : undefined} onClick={() => setStepIdx(i)}>
                  {stepDone(i) ? <Icon name="check" size={12} /> : `${i + 1}.`} {t(lang, `step.types.${s.type}`)}
                </button>
              ))}
            </nav>
            <section className="step-card" aria-live="polite">
              {step.title && <h3>{txs(step)('title')}</h3>}
              {step.type === 'code' && (
                <>
                  {retry && <p className="warn-text small">{t(lang, 'mission.retryIntro')}</p>}
                  <Markdown text={retry && mission.mastery?.retry?.prompt ? txm('mastery.retry.prompt') : txs(step)('prompt')} lang={lang} />
                  {step.checklist && (
                    <details className="checklist">
                      <summary>{t(lang, 'step.checklist')}</summary>
                      <ul>
                        {step.checklist.map((c, i) => (
                          <li key={i}>
                            <label>
                              <input type="checkbox" /> {txs(step)('checklist', i)}
                            </label>
                          </li>
                        ))}
                      </ul>
                    </details>
                  )}
                </>
              )}
              {step.type === 'quiz' && <QuizStep key={step._k} step={step} lang={lang} txs={txs(step)} record={rec?.steps?.[step.id]} onDone={markStep} />}
              {step.type === 'order' && <OrderStep key={step._k} step={step} lang={lang} txs={txs(step)} record={rec?.steps?.[step.id]} onDone={markStep} />}
              {step.type === 'predict' && <PredictStep key={step._k} step={step} lang={lang} txs={txs(step)} record={rec?.steps?.[step.id]} busy={phase !== 'idle'} onRunPrediction={runPrediction} onDone={markStep} />}
              {step.type === 'read' && (
                <>
                  <Markdown text={txs(step)('prompt')} lang={lang} />
                  {!stepDone(stepIdx) && (
                    <button type="button" className="btn btn-primary" onClick={() => markStep({})}>
                      {t(lang, 'mission.done')}
                    </button>
                  )}
                </>
              )}
              {step.type !== 'code' && stepDone(stepIdx) && stepIdx < steps.length - 1 && (
                <button type="button" className="btn btn-primary next-step" onClick={goNextStep}>
                  {t(lang, 'mission.nextStep')} →
                </button>
              )}
            </section>
            {completed && !retry && codeStep && (
              <div className="retry-box">
                <p className="small">{t(lang, 'mission.retryIntro')}</p>
                <button type="button" className="btn" onClick={() => { setRetry(true); setStepIdx(codeStepIndex); setTests(null); setRetryHint(0); }}>
                  {t(lang, 'mission.retryStart')}
                </button>
              </div>
            )}
            {retry && (
              <button type="button" className="btn" onClick={() => { setRetry(false); setTests(null); }}>
                {t(lang, 'mission.retryExit')}
              </button>
            )}
          </>
        )}
        {leftTab === 'learn' && <Markdown text={txm('lesson')} lang={lang} onRunExample={runExample} />}
        {leftTab === 'hints' && <HintsPanel step={codeStep} lang={lang} txs={txs(codeStep)} level={hintLevel} onReveal={onRevealHint} onCopySolution={onCopySolution} retry={retry} />}
        {leftTab === 'debrief' && (
          <>
            <h3>{t(lang, 'result.learned')}</h3>
            <Markdown text={txm('success')} lang={lang} />
            {codeStep && (
              <>
                <h3>{t(lang, 'result.why')}</h3>
                <Markdown text={txs(codeStep)('explanation')} lang={lang} />
              </>
            )}
          </>
        )}
      </div>
    </aside>
  );

  const editorPanel = (
    <section className={`editor-panel ${feedback || ''}`} aria-label={t(lang, 'editor.label')}>
      <div className="toolbar">
        <button type="button" className="btn btn-primary" onClick={onRun} disabled={phase !== 'idle' || step.type !== 'code'} title="Ctrl+Enter">
          <Icon name="play" /> {t(lang, 'editor.run')}
        </button>
        <button type="button" className="btn btn-accent" onClick={onCheck} disabled={phase !== 'idle' || step.type !== 'code'} title="Ctrl+Shift+Enter">
          <Icon name="check" /> {t(lang, 'editor.check')}
        </button>
        <button type="button" className="btn btn-danger" onClick={onStop} disabled={phase === 'idle'} title="Esc">
          <Icon name="stop" /> {t(lang, 'editor.stop')}
        </button>
        <button type="button" className="btn" onClick={onReset} disabled={step.type !== 'code' || phase !== 'idle'}>
          <Icon name="reset" /> {t(lang, 'editor.reset')}
        </button>
        <button type="button" className="btn" onClick={() => { setLeftTab('hints'); if (focusMode) setFocusMode(false); }} disabled={step.type !== 'code' && !codeStep}>
          <Icon name="bulb" /> {t(lang, 'editor.hint')}
        </button>
        <span className="toolbar-spacer" />
        <span className={`badge ${usesIsland ? 'badge-warn' : ''}`} title={usesIsland ? t(lang, 'editor.usesIsland') : t(lang, 'editor.standardC')}>
          {usesIsland ? 'C17 + island.h' : 'C17'}
        </span>
        <button type="button" className="btn btn-icon" onClick={() => setFocusMode(!focusMode)} aria-pressed={focusMode} title={`${focusMode ? t(lang, 'mission.exitFocus') : t(lang, 'mission.focusMode')} (Alt+Z)`}>
          <Icon name={focusMode ? 'collapse' : 'expand'} />
        </button>
      </div>
      {editorReadOnly && <div className="readonly-note small">{step.type === 'predict' ? t(lang, 'mission.readOnly') : t(lang, `step.types.${step.type}`)}</div>}
      {toolchainError && <div className="error-banner">{t(lang, 'toolchain.error', { error: toolchainError })}</div>}
      <CodeEditor
        value={editorValue}
        docKey={`${draftKey}|${step.id}|${retry}`}
        forceValue={forceValue}
        onChange={onCodeChange}
        readOnly={editorReadOnly}
        fontSize={settings.fontSize}
        diagnostics={compile?.diagnostics || []}
        ariaLabel={t(lang, 'editor.label')}
        onRun={onRun}
        onCheck={onCheck}
        onStop={onStop}
        jumpTo={jumpTo}
      />
      <div className="editor-foot small muted">{t(lang, 'editor.shortcuts')}</div>
    </section>
  );

  const worldPanel = (
    <section className="world-panel" aria-label={t(lang, 'mission.world')}>
      <WorldView world={world} data={worldData} lang={lang} reducedMotion={reducedMotion} gridConfig={gridView?.config || gridDefault} gridRun={gridView?.run || null} />
    </section>
  );

  const consolePanel = (
    <Console
      tab={consoleTab}
      setTab={setConsoleTab}
      stdin={stdin}
      setStdin={(v) => setDraft({ stdin: v })}
      run={lastRun}
      liveTranscript={live}
      phase={phase}
      compile={compile}
      tests={tests}
      testsProgress={testsProgress}
      lang={lang}
      onJump={setJumpTo}
      noteFor={noteFor}
      showInput={step.type === 'code'}
      onShowWorld={(r) => setGridView({ config: r.test.world || gridDefault, run: r.run })}
    />
  );

  const style = {
    '--left-w': `${layout.left}%`,
    '--right-w': `${layout.right}%`,
    '--bottom-h': `${layout.bottom}%`,
  };

  return (
    <main id="main" className={`mission-screen ${focusMode ? 'focus-mode' : ''}`} ref={containerRef} style={style}>
      <div className="mission-titlebar">
        <button type="button" className="btn btn-small" onClick={() => navigate({ screen: 'map', chapter: mission.chapter })}>
          <Icon name="left" /> {t(lang, 'nav.map')}
        </button>
        <h1 className="mission-title">
          <span className="muted">
            {chapter.letter} / {tx(cur, lang, chapter, 'title')} /
          </span>{' '}
          <Scramble className="mt-name" text={txm('title')} />
        </h1>
      </div>
      <div className="mission-grid">
        {!focusMode && leftPanel}
        {!focusMode && <Splitter orientation="vertical" label={t(lang, 'a11y.splitter')} onDelta={(d, c) => adjust('left', d, c)} />}
        <div className="work-area">
          <div className="work-top">
            {!focusMode && worldPanel}
            {!focusMode && <Splitter orientation="vertical" label={t(lang, 'a11y.splitter')} onDelta={(d, c) => adjust('right', d, c, 'x', -1)} />}
            {editorPanel}
          </div>
          <Splitter orientation="horizontal" label={t(lang, 'a11y.splitter')} onDelta={(d, c) => adjust('bottom', d, c, 'y', -1)} />
          {consolePanel}
        </div>
      </div>
      {result && (
        <ResultDialog
          cur={cur}
          mission={mission}
          codeStep={codeStep}
          lang={lang}
          result={result}
          save={save}
          onClose={() => setResult(null)}
          onNext={() => {
            setResult(null);
            const nxt = nextMission(cur, save, mission.id);
            navigate(nxt ? { screen: 'mission', id: nxt } : campaignComplete(cur, save) ? { screen: 'ending' } : { screen: 'map' });
          }}
          lastMission={!nextMission(cur, save, mission.id) && campaignComplete(cur, save)}
          onMap={() => navigate({ screen: 'map', chapter: mission.chapter })}
          onNextStep={() => {
            setResult(null);
            goNextStep();
          }}
        />
      )}
    </main>
  );
}

function ResultDialog({ cur, mission, codeStep, lang, result, onClose, onNext, onMap, lastMission }) {
  const ref = useRef(null);
  useEffect(() => {
    ref.current?.focus();
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  const txm = (f, i) => tx(cur, lang, mission, f, i);
  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div className="modal result-modal" role="dialog" aria-modal="true" aria-labelledby="result-title" onClick={(e) => e.stopPropagation()} tabIndex={-1} ref={ref}>
        <Burst />
        <div className="result-head">
          <div className="robot-wrap">
            <Robot size={86} mood="happy" />
          </div>
          <div>
            <p className="access-granted" aria-hidden="true">
              <Scramble text={t(lang, 'result.granted')} duration={700} />
            </p>
            <h2 id="result-title" className="result-sub">
              {t(lang, 'result.passTitle')} · {t(lang, 'result.pass')}
            </h2>
          </div>
        </div>
        {result.retry ? (
          <p className="ok-text">
            <Icon name="star" /> {t(lang, 'result.retryPassed')}
          </p>
        ) : result.stepOnly ? null : result.assisted ? (
          <p className="warn-text">{t(lang, 'result.assisted')}</p>
        ) : (
          <p className="ok-text">
            <Icon name="star" /> {t(lang, 'result.mastered')}
          </p>
        )}
        <h3>{t(lang, 'result.learned')}</h3>
        <Markdown text={txm('success')} lang={lang} />
        <h3>{t(lang, 'result.why')}</h3>
        <Markdown text={tx(cur, lang, codeStep, 'explanation')} lang={lang} />
        <div className="row">
          {lastMission && (
            <p className="accent-text">
              <Icon name="flag" /> {t(lang, 'result.lastMission')}
            </p>
          )}
          <button type="button" className="btn btn-primary" onClick={onNext}>
            {lastMission ? t(lang, 'result.toEnding') : t(lang, 'result.next')} <Icon name="right" />
          </button>
          <button type="button" className="btn" onClick={onMap}>
            {t(lang, 'result.map')}
          </button>
          <button type="button" className="btn" onClick={onClose}>
            {t(lang, 'result.stay')}
          </button>
        </div>
      </div>
    </div>
  );
}
