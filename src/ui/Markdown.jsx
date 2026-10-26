import { useMemo } from 'react';
import Icon from './Icons.jsx';
import { Marked } from 'marked';

// Content is authored by the project (trusted), but we still escape raw HTML
// so a typo in a lesson cannot inject markup.
const marked = new Marked({
  gfm: true,
  breaks: false,
  renderer: {
    html({ text }) {
      return text.replace(/&/g, '&amp;').replace(/</g, '&lt;');
    },
  },
});

const CALLOUTS = ['note', 'tip', 'warning', 'correction', 'outside', 'illustration'];

/** Split markdown into segments: plain markdown and runnable ```c example blocks. */
function segment(md) {
  const parts = [];
  const re = /```c[ \t]+example([^\n]*)\n([\s\S]*?)```/g;
  let last = 0;
  let m;
  while ((m = re.exec(md))) {
    if (m.index > last) parts.push({ type: 'md', text: md.slice(last, m.index) });
    const info = m[1];
    const stdin = /stdin=(\S+)/.exec(info);
    parts.push({ type: 'example', code: m[2], expectError: /\berror\b/.test(info), stdin: stdin ? stdin[1].replace(/\\n/g, '\n') : '' });
    last = m.index + m[0].length;
  }
  if (last < md.length) parts.push({ type: 'md', text: md.slice(last) });
  return parts;
}

function renderMd(text, labels) {
  let html = marked.parse(text);
  // > [!kind] callouts
  html = html.replace(/<blockquote>\s*<p>\[!(\w+)\]\s*/g, (all, kind) => {
    const k = CALLOUTS.includes(kind) ? kind : 'note';
    return `<blockquote class="callout callout-${k}"><p><strong class="callout-label">${labels[k] || k}</strong> `;
  });
  html = html.replace(/<table>/g, '<div class="table-wrap"><table>').replace(/<\/table>/g, '</table></div>');
  return html;
}

const LABELS = {
  en: { note: 'Note', tip: 'Tip', warning: 'Warning', correction: 'Correction', outside: 'Outside the game', illustration: 'Illustration' },
  ru: { note: 'Заметка', tip: 'Совет', warning: 'Внимание', correction: 'Исправление', outside: 'Вне игры', illustration: 'Иллюстрация' },
};

export default function Markdown({ text, lang = 'en', onRunExample, onLoadExample, className = '' }) {
  const parts = useMemo(() => segment(text || ''), [text]);
  const labels = LABELS[lang] || LABELS.en;
  return (
    <div className={`md ${className}`}>
      {parts.map((p, i) =>
        p.type === 'md' ? (
          <div key={i} dangerouslySetInnerHTML={{ __html: renderMd(p.text, labels) }} />
        ) : (
          <div key={i} className="example">
            <pre className="example-code">
              <code>{p.code}</code>
            </pre>
            {(onRunExample || onLoadExample) && (
              <div className="example-actions">
                {onRunExample && (
                  <button type="button" className="btn btn-small" onClick={() => onRunExample(p.code, p.stdin)}>
                    <Icon name="play" size={12} /> {lang === 'ru' ? 'Запустить пример' : 'Run example'}
                    {p.stdin ? (lang === 'ru' ? ` (ввод: ${p.stdin.replace(/\n/g, ' ')})` : ` (input: ${p.stdin.replace(/\n/g, ' ')})`) : ''}
                  </button>
                )}
                {p.expectError && <span className="muted small">{lang === 'ru' ? 'Этот пример специально показывает ошибку.' : 'This example deliberately shows an error.'}</span>}
              </div>
            )}
          </div>
        ),
      )}
    </div>
  );
}
