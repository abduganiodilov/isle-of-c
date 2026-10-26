import { useEffect, useRef } from 'react';
import { EditorState, Compartment } from '@codemirror/state';
import { EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter, drawSelection } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { cpp } from '@codemirror/lang-cpp';
import { syntaxHighlighting, HighlightStyle, indentOnInput, bracketMatching, indentUnit } from '@codemirror/language';
import { closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete';
import { searchKeymap, highlightSelectionMatches } from '@codemirror/search';
import { setDiagnostics, lintGutter } from '@codemirror/lint';
import { tags } from '@lezer/highlight';

const highlight = HighlightStyle.define([
  { tag: [tags.keyword, tags.controlKeyword, tags.definitionKeyword, tags.modifier], color: 'var(--syn-keyword)', fontWeight: '600' },
  { tag: [tags.typeName, tags.standard(tags.typeName)], color: 'var(--syn-type)' },
  { tag: [tags.string, tags.special(tags.string), tags.character], color: 'var(--syn-string)' },
  { tag: [tags.number, tags.bool], color: 'var(--syn-number)' },
  { tag: [tags.comment, tags.lineComment, tags.blockComment], color: 'var(--syn-comment)', fontStyle: 'italic' },
  { tag: [tags.processingInstruction, tags.meta], color: 'var(--syn-preproc)' },
  { tag: [tags.function(tags.variableName), tags.function(tags.propertyName)], color: 'var(--syn-function)' },
  { tag: [tags.operator, tags.punctuation], color: 'var(--syn-punct)' },
  { tag: tags.escape, color: 'var(--syn-escape)' },
]);

const theme = EditorView.theme({
  '&': { height: '100%', backgroundColor: 'var(--code-bg)', color: 'var(--code-fg)' },
  '.cm-scroller': { fontFamily: 'var(--font-mono)', lineHeight: '1.55' },
  '.cm-gutters': { backgroundColor: 'var(--code-gutter)', color: 'var(--muted)', border: 'none' },
  '.cm-activeLine': { backgroundColor: 'var(--code-active)' },
  '.cm-activeLineGutter': { backgroundColor: 'var(--code-active)' },
  '.cm-cursor': { borderLeftColor: 'var(--accent)', borderLeftWidth: '2px' },
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection': { backgroundColor: 'var(--code-selection) !important' },
  '&.cm-focused': { outline: '2px solid var(--focus)', outlineOffset: '-2px' },
  '.cm-lintRange-error': { backgroundImage: 'none', textDecoration: 'underline wavy var(--err)' },
  '.cm-lintRange-warning': { backgroundImage: 'none', textDecoration: 'underline wavy var(--warn)' },
  '.cm-tooltip': { backgroundColor: 'var(--panel2)', color: 'var(--text)', border: '1px solid var(--border)' },
});

/**
 * Controlled-ish CodeMirror wrapper. `value` is applied when `docKey` changes
 * (switching step/mission) or when `forceValue` increments (reset/copy).
 */
export default function CodeEditor({ value, docKey, forceValue = 0, onChange, readOnly = false, fontSize = 15, diagnostics = [], ariaLabel, onRun, onCheck, onStop, jumpTo }) {
  const host = useRef(null);
  const view = useRef(null);
  const ro = useRef(new Compartment());
  const fs = useRef(new Compartment());
  const handlers = useRef({});
  handlers.current = { onChange, onRun, onCheck, onStop };

  useEffect(() => {
    const keys = keymap.of([
      { key: 'Mod-Enter', run: () => (handlers.current.onRun?.(), true) },
      { key: 'Mod-Shift-Enter', run: () => (handlers.current.onCheck?.(), true) },
      { key: 'Escape', run: () => (handlers.current.onStop?.(), false) },
      ...closeBracketsKeymap,
      ...defaultKeymap,
      ...historyKeymap,
      ...searchKeymap,
      indentWithTab,
    ]);
    view.current = new EditorView({
      parent: host.current,
      state: EditorState.create({
        doc: value ?? '',
        extensions: [
          lineNumbers(),
          highlightActiveLineGutter(),
          history(),
          drawSelection(),
          indentOnInput(),
          bracketMatching(),
          closeBrackets(),
          highlightActiveLine(),
          highlightSelectionMatches(),
          lintGutter(),
          indentUnit.of('    '),
          cpp(),
          syntaxHighlighting(highlight),
          theme,
          keys,
          EditorView.lineWrapping,
          ro.current.of([EditorState.readOnly.of(readOnly), EditorView.editable.of(!readOnly)]),
          fs.current.of(EditorView.theme({ '&': { fontSize: `${fontSize}px` } })),
          EditorView.contentAttributes.of({ 'aria-label': ariaLabel || 'Code editor', spellcheck: 'false', autocapitalize: 'off', autocorrect: 'off' }),
          EditorView.updateListener.of((u) => {
            if (u.docChanged) handlers.current.onChange?.(u.state.doc.toString());
          }),
        ],
      }),
    });
    // Exposed for automated end-to-end tests (tests/e2e) to set editor content.
    host.current.cmView = view.current;
    return () => view.current.destroy();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Replace the document when switching to a different draft, or on reset.
  useEffect(() => {
    const v = view.current;
    if (!v) return;
    const cur = v.state.doc.toString();
    if (cur !== (value ?? '')) v.dispatch({ changes: { from: 0, to: cur.length, insert: value ?? '' } });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docKey, forceValue]);

  useEffect(() => {
    view.current?.dispatch({ effects: ro.current.reconfigure([EditorState.readOnly.of(readOnly), EditorView.editable.of(!readOnly)]) });
  }, [readOnly]);

  useEffect(() => {
    view.current?.dispatch({ effects: fs.current.reconfigure(EditorView.theme({ '&': { fontSize: `${fontSize}px` } })) });
  }, [fontSize]);

  // Compiler diagnostics as underlines + gutter markers.
  useEffect(() => {
    const v = view.current;
    if (!v) return;
    const doc = v.state.doc;
    const list = [];
    for (const d of diagnostics) {
      if (!d.line || d.file !== 'main.c' || d.line > doc.lines) continue;
      const line = doc.line(d.line);
      const from = Math.min(line.from + Math.max(0, (d.column || 1) - 1), line.to);
      const to = Math.max(from + 1, Math.min(line.to, from + 1));
      list.push({ from, to: Math.min(to, doc.length), severity: d.severity === 'error' ? 'error' : d.severity === 'warning' ? 'warning' : 'info', message: d.message });
    }
    v.dispatch(setDiagnostics(v.state, list));
  }, [diagnostics]);

  useEffect(() => {
    const v = view.current;
    if (!v || !jumpTo || !jumpTo.line) return;
    const doc = v.state.doc;
    if (jumpTo.line > doc.lines) return;
    const line = doc.line(jumpTo.line);
    const pos = Math.min(line.from + Math.max(0, (jumpTo.column || 1) - 1), line.to);
    v.dispatch({ selection: { anchor: pos }, scrollIntoView: true });
    v.focus();
  }, [jumpTo]);

  return <div className="code-editor" ref={host} id="code-editor" />;
}
