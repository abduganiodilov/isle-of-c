// Visual effects for the terminal look. Every effect is purely decorative,
// hidden from assistive technology, and switched off when motion is reduced
// or the player disables effects in Settings.
import { createContext, useContext, useEffect, useRef, useState } from 'react';

export const FxContext = createContext(true);
export const useFx = () => useContext(FxContext);

const GLYPHS = '01{}();<>=+-*/%&|!#[]abcdefxyzintcharforwhileifreturn';
const TOKENS = ['int', 'char', 'for', 'while', 'if', 'else', 'return', 'void', 'main', '{', '}', ';', '0', '1', '0x1F', '&&', '||', '++', 'printf', 'scanf', '%d', '\\n', '#include', 'double', 'switch', 'break'];

/** Falling C tokens on a canvas, very low contrast so text stays readable. */
export function DigitalRain({ density = 1, opacity = 0.14 }) {
  const ref = useRef(null);
  const on = useFx();
  useEffect(() => {
    if (!on) return;
    const canvas = ref.current;
    const ctx = canvas.getContext('2d');
    let raf = 0;
    let cols = [];
    let w = 0;
    let h = 0;
    const size = 14;
    const color = getComputedStyle(document.documentElement).getPropertyValue('--rain').trim() || '#3dffa2';
    const resize = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      w = canvas.clientWidth;
      h = canvas.clientHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const n = Math.ceil((w / (size * 1.6)) * density);
      cols = Array.from({ length: n }, (_, i) => ({ x: (i / n) * w, y: Math.random() * -h, speed: 0.6 + Math.random() * 1.6, token: TOKENS[(Math.random() * TOKENS.length) | 0] }));
    };
    resize();
    window.addEventListener('resize', resize);
    let last = performance.now();
    const tick = (now) => {
      const dt = Math.min(50, now - last);
      last = now;
      ctx.clearRect(0, 0, w, h);
      ctx.font = `${size}px "JetBrains Mono", monospace`;
      for (const c of cols) {
        c.y += c.speed * dt * 0.06;
        const tokenChars = c.token.split('');
        for (let k = 0; k < 12; k++) {
          const y = c.y - k * size * 1.2;
          if (y < -size || y > h + size) continue;
          const ch = k === 0 ? tokenChars[0] : k < tokenChars.length ? tokenChars[k] : GLYPHS[((c.x + k * 7 + ((now / 400) | 0)) % GLYPHS.length) | 0];
          ctx.fillStyle = color;
          ctx.globalAlpha = (k === 0 ? 1 : Math.max(0, 0.75 - k * 0.07)) * opacity * 4;
          ctx.fillText(ch, c.x, y);
        }
        if (c.y - 12 * size > h) {
          c.y = Math.random() * -200;
          c.token = TOKENS[(Math.random() * TOKENS.length) | 0];
        }
      }
      ctx.globalAlpha = 1;
      raf = requestAnimationFrame(tick);
    };
    const onVis = () => {
      cancelAnimationFrame(raf);
      if (!document.hidden) {
        last = performance.now();
        raf = requestAnimationFrame(tick);
      }
    };
    raf = requestAnimationFrame(tick);
    document.addEventListener('visibilitychange', onVis);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [on, density, opacity]);
  if (!on) return null;
  return <canvas ref={ref} className="digital-rain" aria-hidden="true" />;
}

const SCRAMBLE = '!<>-_\\/[]{}=+*^?#01';

/** Text that "decrypts" from random glyphs when it changes. */
export function Scramble({ text, duration = 520, className }) {
  const on = useFx();
  const [shown, setShown] = useState(text);
  useEffect(() => {
    if (!on || !text) {
      setShown(text);
      return;
    }
    let raf;
    const start = performance.now();
    const step = (now) => {
      const p = Math.min(1, (now - start) / duration);
      const reveal = Math.floor(p * text.length);
      let s = text.slice(0, reveal);
      for (let i = reveal; i < text.length; i++) s += text[i] === ' ' ? ' ' : SCRAMBLE[(Math.random() * SCRAMBLE.length) | 0];
      setShown(s);
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [text, on, duration]);
  return (
    <span className={className}>
      <span aria-hidden="true">{shown}</span>
      <span className="sr-only">{text}</span>
    </span>
  );
}

/** Lines that type themselves out one after another (boot log). */
export function BootLog({ lines, speed = 14, onDone }) {
  const on = useFx();
  const [count, setCount] = useState(on ? 0 : lines.reduce((a, l) => a + l.text.length, 0));
  const total = lines.reduce((a, l) => a + l.text.length, 0);
  useEffect(() => {
    if (!on) {
      setCount(total);
      onDone?.();
      return;
    }
    let n = 0;
    const id = setInterval(() => {
      n += 3;
      setCount(n);
      if (n >= total) {
        clearInterval(id);
        onDone?.();
      }
    }, speed);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [on, total]);
  let left = count;
  return (
    <pre className="boot-log" aria-hidden="true">
      {lines.map((l, i) => {
        const part = l.text.slice(0, Math.max(0, left));
        left -= l.text.length;
        if (!part) return null;
        return (
          <div key={i} className={`boot-line boot-${l.tone || 'plain'}`}>
            {part}
            {left < 0 && left > -l.text.length && <span className="caret">▌</span>}
          </div>
        );
      })}
    </pre>
  );
}

/** A one-shot particle burst rendered with CSS (used on mission success). */
export function Burst({ count = 26 }) {
  const on = useFx();
  if (!on) return null;
  return (
    <div className="burst" aria-hidden="true">
      {Array.from({ length: count }, (_, i) => {
        const a = (i / count) * Math.PI * 2;
        const r = 90 + (i % 5) * 26;
        return <span key={i} style={{ '--dx': `${Math.cos(a) * r}px`, '--dy': `${Math.sin(a) * r}px`, '--d': `${(i % 7) * 30}ms` }}>{TOKENS[i % TOKENS.length].slice(0, 2)}</span>;
      })}
    </div>
  );
}
