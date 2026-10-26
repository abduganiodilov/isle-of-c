import { t } from '../i18n/index.js';
import Markdown from './Markdown.jsx';

/**
 * Five progressive hint levels. Level 5 reveals the reference solution and is
 * recorded (the mission then counts as assisted until a retry succeeds).
 */
export default function HintsPanel({ step, lang, txs, level, onReveal, onCopySolution, retry }) {
  if (!step || step.type !== 'code' || !step.hints) return <p className="muted">{t(lang, 'hints.noHints')}</p>;
  const names = t(lang, 'hints.levels');
  const maxLevel = retry ? 3 : 5;
  const reveal = (n) => {
    if (n === 5 && !window.confirm(t(lang, 'hints.solutionConfirm'))) return;
    onReveal(n);
  };
  return (
    <div className="hints">
      <p className="small muted">{t(lang, 'hints.intro')}</p>
      {retry && <p className="small warn-text">{t(lang, 'hints.retryNoSolution')}</p>}
      <ol className="hint-list">
        {step.hints.map((h, i) => {
          const n = i + 1;
          if (n > maxLevel) return null;
          const shown = level >= n;
          return (
            <li key={n} className={`hint ${shown ? 'hint-shown' : ''} ${n === 5 ? 'hint-solution' : ''}`}>
              <div className="hint-head">
                <span className="badge">{n}</span> {names[i]}
              </div>
              {shown ? (
                <>
                  <Markdown text={txs('hints', i)} lang={lang} />
                  {n === 5 && (
                    <div className="solution">
                      <div className="small muted">{t(lang, 'hints.solution')}</div>
                      <pre className="mono example-code">{step.solution}</pre>
                      <button type="button" className="btn btn-small" onClick={onCopySolution}>
                        {t(lang, 'hints.copyToEditor')}
                      </button>
                      <Markdown text={txs('explanation')} lang={lang} className="explanation" />
                    </div>
                  )}
                </>
              ) : (
                n === level + 1 && (
                  <button type="button" className={`btn btn-small ${n === 5 ? 'btn-danger' : ''}`} onClick={() => reveal(n)}>
                    {n === 5 ? t(lang, 'hints.revealSolution') : t(lang, 'hints.reveal', { n, name: names[i] })}
                  </button>
                )
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
