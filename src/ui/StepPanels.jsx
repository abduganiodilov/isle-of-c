import { useMemo, useState } from 'react';
import { t } from '../i18n/index.js';
import Markdown from './Markdown.jsx';
import { normalizeOutput } from '../validate/checker.js';

function seededShuffle(arr, seedStr) {
  let seed = 0;
  for (const ch of seedStr) seed = (seed * 31 + ch.charCodeAt(0)) >>> 0;
  const a = arr.map((v, i) => ({ v, i }));
  for (let i = a.length - 1; i > 0; i--) {
    seed = (seed * 1103515245 + 12345) >>> 0;
    const j = seed % (i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  // Never start already solved.
  if (a.every((x, k) => x.i === k) && a.length > 1) [a[0], a[1]] = [a[1], a[0]];
  return a;
}

export function QuizStep({ step, lang, txs, record, onDone }) {
  const multiple = !!step.multiple;
  const correct = [].concat(step.correct);
  const [sel, setSel] = useState(record?.answer ?? []);
  const [state, setState] = useState(record?.done ? (record.correct ? 'correct' : 'shown') : 'idle');
  const toggle = (i) => {
    if (multiple) setSel((s) => (s.includes(i) ? s.filter((x) => x !== i) : [...s, i]));
    else setSel([i]);
    if (state === 'wrong') setState('idle');
  };
  const submit = () => {
    const ok = sel.length === correct.length && correct.every((c) => sel.includes(c));
    setState(ok ? 'correct' : 'wrong');
    if (ok) onDone({ answer: sel, correct: true });
  };
  return (
    <fieldset className="quiz">
      <legend>
        <Markdown text={txs('question')} lang={lang} />
      </legend>
      {multiple && <p className="small muted">{t(lang, 'step.selectAll')}</p>}
      {step.choices.map((c, i) => {
        const isCorrect = correct.includes(i);
        const reveal = state === 'correct' || state === 'shown';
        return (
          <label key={i} className={`choice ${sel.includes(i) ? 'choice-selected' : ''} ${reveal && isCorrect ? 'choice-correct' : ''}`}>
            <input type={multiple ? 'checkbox' : 'radio'} name={step._k} checked={sel.includes(i)} onChange={() => toggle(i)} disabled={state === 'correct' || state === 'shown'} />
            <Markdown text={txs('choices', i)} lang={lang} className="inline-md" />
          </label>
        );
      })}
      <div className="row">
        {state !== 'correct' && state !== 'shown' && (
          <button type="button" className="btn btn-primary" disabled={!sel.length} onClick={submit}>
            {t(lang, 'step.submit')}
          </button>
        )}
        {state === 'wrong' && (
          <button type="button" className="btn" onClick={() => { setState('shown'); onDone({ answer: sel, correct: false }); }}>
            {t(lang, 'step.showExplanation')}
          </button>
        )}
      </div>
      <div aria-live="polite">
        {state === 'correct' && <p className="ok-text">✔ {t(lang, 'step.correct')}</p>}
        {state === 'wrong' && <p className="err-text">{t(lang, 'step.incorrect')}</p>}
      </div>
      {(state === 'correct' || state === 'shown') && <Markdown text={txs('explanation')} lang={lang} className="explanation" />}
    </fieldset>
  );
}

export function OrderStep({ step, lang, txs, record, onDone }) {
  const initial = useMemo(() => seededShuffle(step.lines, step._k), [step]);
  const [items, setItems] = useState(record?.done ? step.lines.map((v, i) => ({ v, i })) : initial);
  const [state, setState] = useState(record?.done ? 'correct' : 'idle');
  const [wrong, setWrong] = useState(0);
  const [attempts, setAttempts] = useState(0);
  const move = (k, d) => {
    const j = k + d;
    if (j < 0 || j >= items.length) return;
    const next = items.slice();
    [next[k], next[j]] = [next[j], next[k]];
    setItems(next);
    setState('idle');
  };
  const check = () => {
    const bad = items.filter((x, k) => x.i !== k).length;
    setWrong(bad);
    setAttempts((a) => a + 1);
    if (bad === 0) {
      setState('correct');
      onDone({ correct: true, attempts: attempts + 1 });
    } else setState('wrong');
  };
  const label = (x) => (lang !== 'en' ? txs('lines', x.i) || x.v : x.v);
  return (
    <div className="order">
      <Markdown text={txs('prompt')} lang={lang} />
      <ol className="order-list">
        {items.map((x, k) => (
          <li key={x.i} className={`order-item ${state === 'correct' ? 'ok' : ''}`}>
            <span className="order-text">{label(x)}</span>
            <span className="order-buttons">
              <button type="button" className="btn btn-icon" aria-label={`${t(lang, 'step.moveUp')}: ${label(x)}`} disabled={k === 0 || state === 'correct'} onClick={() => move(k, -1)}>
                ▲
              </button>
              <button type="button" className="btn btn-icon" aria-label={`${t(lang, 'step.moveDown')}: ${label(x)}`} disabled={k === items.length - 1 || state === 'correct'} onClick={() => move(k, 1)}>
                ▼
              </button>
            </span>
          </li>
        ))}
      </ol>
      {state !== 'correct' && (
        <div className="row">
          <button type="button" className="btn btn-primary" onClick={check}>
            {t(lang, 'step.submit')}
          </button>
          {attempts >= 2 && (
            <button type="button" className="btn" onClick={() => { setItems(step.lines.map((v, i) => ({ v, i }))); setState('correct'); onDone({ correct: false, revealed: true }); }}>
              {t(lang, 'step.showExplanation')}
            </button>
          )}
        </div>
      )}
      <div aria-live="polite">
        {state === 'correct' && <p className="ok-text">✔ {t(lang, 'step.orderCorrect')}</p>}
        {state === 'wrong' && <p className="err-text">{t(lang, 'step.orderWrong', { n: wrong })}</p>}
      </div>
      {state === 'correct' && <Markdown text={txs('explanation')} lang={lang} className="explanation" />}
    </div>
  );
}

/**
 * Predict-the-output step. The answer is checked against what the program
 * REALLY prints when compiled and run, not against a stored string.
 */
export function PredictStep({ step, lang, txs, record, onRunPrediction, onDone, busy }) {
  const ans = step.answer;
  const [choice, setChoice] = useState(record?.choice ?? null);
  const [text, setText] = useState(record?.prediction ?? '');
  const [outcome, setOutcome] = useState(record?.done ? record.outcome : null);
  const lockIn = async () => {
    const res = await onRunPrediction();
    if (!res) return;
    let correct;
    if (ans.kind === 'choice') correct = choice === ans.correct;
    else correct = res.compile.ok && normalizeOutput(text) === normalizeOutput(res.run?.stdout || '');
    const out = { correct, actual: res.compile.ok ? res.run?.stdout ?? '' : null, compileFailed: !res.compile.ok, compileMessage: res.compile.ok ? '' : (res.compile.diagnostics.find((d) => d.severity === 'error') || {}).message };
    setOutcome(out);
    onDone({ choice, prediction: text, correct, outcome: out });
  };
  return (
    <div className="predict">
      <Markdown text={txs('prompt')} lang={lang} />
      <p className="small muted">{ans.kind === 'choice' ? t(lang, 'step.predictChoose') : t(lang, 'step.predictType')}</p>
      {ans.kind === 'choice' ? (
        <fieldset className="quiz" disabled={!!outcome}>
          <legend className="sr-only">{t(lang, 'step.yourPrediction')}</legend>
          {ans.choices.map((c, i) => (
            <label key={i} className={`choice ${choice === i ? 'choice-selected' : ''} ${outcome && i === ans.correct ? 'choice-correct' : ''}`}>
              <input type="radio" name={step._k} checked={choice === i} onChange={() => setChoice(i)} />
              <span className="mono">{txs('answer.choices', i) || c}</span>
            </label>
          ))}
        </fieldset>
      ) : (
        <label className="block">
          <span className="small muted">{t(lang, 'step.yourPrediction')}</span>
          <textarea className="mono stdin" rows={4} value={text} onChange={(e) => setText(e.target.value)} disabled={!!outcome} spellCheck={false} />
        </label>
      )}
      {!outcome && (
        <button type="button" className="btn btn-primary" disabled={busy || (ans.kind === 'choice' ? choice == null : !text.trim())} onClick={lockIn}>
          ▶ {t(lang, 'step.lockIn')}
        </button>
      )}
      {outcome && (
        <div className="predict-outcome" aria-live="polite">
          <p className={outcome.correct ? 'ok-text' : 'err-text'}>{outcome.correct ? '✔ ' + t(lang, 'step.predictedRight') : t(lang, 'step.predictedWrong')}</p>
          {outcome.compileFailed ? (
            <>
              <div className="small muted">{t(lang, 'step.compileErrorActual')}</div>
              <pre className="mono">{outcome.compileMessage}</pre>
            </>
          ) : (
            <>
              <div className="small muted">{t(lang, 'step.actual')}</div>
              <pre className="mono">{outcome.actual || ' '}</pre>
            </>
          )}
          <Markdown text={txs('explanation')} lang={lang} className="explanation" />
        </div>
      )}
    </div>
  );
}
