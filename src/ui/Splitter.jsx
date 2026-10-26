// Accessible panel splitter: drag with the pointer or focus and use arrow keys.
export default function Splitter({ orientation = 'vertical', onDelta, label }) {
  const onPointerDown = (e) => {
    e.preventDefault();
    const start = orientation === 'vertical' ? e.clientX : e.clientY;
    let last = start;
    const move = (ev) => {
      const pos = orientation === 'vertical' ? ev.clientX : ev.clientY;
      onDelta(pos - last, false);
      last = pos;
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      onDelta(0, true);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };
  const onKeyDown = (e) => {
    const step = e.shiftKey ? 60 : 20;
    const keys = orientation === 'vertical' ? { ArrowLeft: -step, ArrowRight: step } : { ArrowUp: -step, ArrowDown: step };
    if (keys[e.key] != null) {
      e.preventDefault();
      onDelta(keys[e.key], true);
    }
  };
  return (
    <div
      className={`splitter splitter-${orientation}`}
      role="separator"
      aria-orientation={orientation}
      aria-label={label}
      tabIndex={0}
      onPointerDown={onPointerDown}
      onKeyDown={onKeyDown}
    />
  );
}
