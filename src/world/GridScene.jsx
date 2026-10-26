import { useEffect, useMemo, useState } from 'react';

// Replays the island API calls recorded while the program ran. Every frame is
// derived from a real event in the log — nothing is scripted.

function buildFrames(config, events) {
  const damage = new Map((config.damage || []).map(([x, y, d]) => [`${x},${y}`, d ?? 1]));
  let x = config.start ? config.start[0] : 0;
  let y = config.start ? config.start[1] : 0;
  const frames = [{ x, y, damage: new Map(damage), event: null, path: [[x, y]] }];
  const path = [[x, y]];
  for (const ev of events || []) {
    if (ev.op === 'move' && ev.ok) {
      x = ev.x;
      y = ev.y;
      path.push([x, y]);
    }
    if (ev.op === 'repair') damage.delete(`${ev.x},${ev.y}`);
    if (ev.op === 'x' || ev.op === 'y') continue; // queries do not change the world
    frames.push({ x, y, damage: new Map(damage), event: ev, path: path.slice() });
  }
  return frames;
}

export default function GridScene({ config, run, lang, reducedMotion, label }) {
  const events = run?.world?.events || [];
  const frames = useMemo(() => buildFrames(config, events), [config, events]);
  const [idx, setIdx] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);

  useEffect(() => {
    // New run: replay from the start (or jump to the end with reduced motion).
    if (reducedMotion) {
      setIdx(frames.length - 1);
      setPlaying(false);
    } else {
      setIdx(0);
      setPlaying(frames.length > 1);
    }
  }, [frames, reducedMotion]);

  useEffect(() => {
    if (!playing) return;
    if (idx >= frames.length - 1) {
      setPlaying(false);
      return;
    }
    const id = setTimeout(() => setIdx((i) => Math.min(i + 1, frames.length - 1)), Math.max(30, 260 / speed));
    return () => clearTimeout(id);
  }, [playing, idx, frames.length, speed]);

  const f = frames[Math.min(idx, frames.length - 1)];
  const W = config.width;
  const H = config.height;
  const cell = Math.max(18, Math.min(56, Math.floor(420 / Math.max(W, H))));
  const pad = 10;
  const ev = f.event;
  const ru = lang === 'ru';
  const evText = !ev
    ? ru ? 'Старт' : 'Start'
    : ev.op === 'move'
      ? `robot_move('${ev.dir}') → ${ev.ok ? 1 : 0}${ev.ok ? '' : ru ? ' (заблокировано)' : ' (blocked)'}`
      : ev.op === 'scan'
        ? `robot_scan() → ${ev.value}`
        : ev.op === 'repair'
          ? `robot_repair()${ev.was ? '' : ru ? ' — клетка не была повреждена' : ' — tile was not damaged'}`
          : ev.op;

  return (
    <div className="scene scene-grid">
      <div className="scene-header">
        <span className="scene-label">{label || (ru ? 'СОЛНЕЧНОЕ ПОЛЕ' : 'SOLAR FIELD')}</span>
        <span className="scene-tag">{ru ? 'Повтор реальных вызовов island.h' : 'Replay of real island.h calls'}</span>
      </div>
      <svg viewBox={`0 0 ${W * cell + pad * 2} ${H * cell + pad * 2}`} className="grid-svg" role="img" aria-label={ru ? `Поле ${W}×${H}, робот в (${f.x}, ${f.y}), повреждено: ${f.damage.size}` : `Field ${W}×${H}, robot at (${f.x}, ${f.y}), damaged tiles: ${f.damage.size}`}>
        {Array.from({ length: H }).map((_, yy) =>
          Array.from({ length: W }).map((__, xx) => {
            const d = f.damage.get(`${xx},${yy}`);
            const wasDamaged = (config.damage || []).some(([a, b]) => a === xx && b === yy);
            return (
              <g key={`${xx},${yy}`}>
                <rect x={pad + xx * cell + 2} y={pad + yy * cell + 2} width={cell - 4} height={cell - 4} rx={4} className={d ? `tile tile-damaged tile-d${Math.min(d, 3)}` : wasDamaged ? 'tile tile-fixed' : 'tile'} />
                {d ? (
                  <text x={pad + xx * cell + cell / 2} y={pad + yy * cell + cell / 2 + 4} textAnchor="middle" className="tile-text">
                    ⚡{d}
                  </text>
                ) : null}
              </g>
            );
          }),
        )}
        <polyline points={f.path.map(([px, py]) => `${pad + px * cell + cell / 2},${pad + py * cell + cell / 2}`).join(' ')} className="robot-path" />
        <g className={`robot ${ev && ev.op === 'move' && !ev.ok ? 'robot-bump' : ''} ${ev && ev.op === 'repair' ? 'robot-repair' : ''}`} transform={`translate(${pad + f.x * cell + cell / 2}, ${pad + f.y * cell + cell / 2})`}>
          <circle r={cell * 0.3} className="robot-body" />
          <circle r={cell * 0.09} cx={-cell * 0.1} cy={-cell * 0.05} className="robot-eye" />
          <circle r={cell * 0.09} cx={cell * 0.1} cy={-cell * 0.05} className="robot-eye" />
        </g>
      </svg>
      <div className="grid-controls">
        <button type="button" className="btn btn-small" onClick={() => setIdx(0)} aria-label={ru ? 'В начало' : 'Rewind'}>⏮</button>
        <button type="button" className="btn btn-small" onClick={() => setIdx((i) => Math.max(0, i - 1))} aria-label={ru ? 'Шаг назад' : 'Step back'}>◀</button>
        <button type="button" className="btn btn-small" onClick={() => setPlaying((p) => !p)} disabled={frames.length < 2}>
          {playing ? (ru ? '⏸ Пауза' : '⏸ Pause') : ru ? '▶ Воспроизвести' : '▶ Play'}
        </button>
        <button type="button" className="btn btn-small" onClick={() => setIdx((i) => Math.min(frames.length - 1, i + 1))} aria-label={ru ? 'Шаг вперёд' : 'Step forward'}>▶</button>
        <label className="small">
          {ru ? 'Скорость' : 'Speed'}{' '}
          <select value={speed} onChange={(e) => setSpeed(Number(e.target.value))}>
            <option value={0.5}>½×</option>
            <option value={1}>1×</option>
            <option value={3}>3×</option>
            <option value={10}>10×</option>
          </select>
        </label>
        <input type="range" min={0} max={frames.length - 1} value={Math.min(idx, frames.length - 1)} onChange={(e) => { setPlaying(false); setIdx(Number(e.target.value)); }} aria-label={ru ? 'Положение в записи' : 'Position in recording'} />
        <span className="small mono">
          {Math.min(idx, frames.length - 1)}/{frames.length - 1}
        </span>
      </div>
      <div className="grid-event mono small" aria-live="polite">
        {evText}
        {run?.world?.summary?.eventsTruncated ? (ru ? ' · запись обрезана после 5000 вызовов' : ' · log truncated after 5000 calls') : ''}
      </div>
      {!run && <p className="muted small">{ru ? 'Запустите программу — робот выполнит её вызовы.' : 'Run your program — the robot will perform its calls.'}</p>}
    </div>
  );
}
