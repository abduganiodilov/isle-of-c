// Tiny optional sound effects synthesised with WebAudio (no audio files):
// terminal beeps for game events and soft mechanical key clicks while typing.
let ctx = null;
let noise = null;
let lastKey = 0;

function tone(freq, start, dur, type = 'sine', gain = 0.06, endFreq = null) {
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, ctx.currentTime + start);
  if (endFreq) o.frequency.exponentialRampToValueAtTime(endFreq, ctx.currentTime + start + dur);
  g.gain.setValueAtTime(gain, ctx.currentTime + start);
  g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + start + dur);
  o.connect(g).connect(ctx.destination);
  o.start(ctx.currentTime + start);
  o.stop(ctx.currentTime + start + dur + 0.02);
}

/** A short band-passed noise burst: the "tick" of a mechanical key. */
function click(freq, gain, dur = 0.03) {
  if (!noise) {
    noise = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.05), ctx.sampleRate);
    const d = noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length) ** 2;
  }
  const src = ctx.createBufferSource();
  src.buffer = noise;
  const f = ctx.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.value = freq;
  f.Q.value = 1.2;
  const g = ctx.createGain();
  g.gain.setValueAtTime(gain, ctx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
  src.connect(f).connect(g).connect(ctx.destination);
  src.start();
  src.stop(ctx.currentTime + dur + 0.01);
}

const SOUNDS = {
  success: () => {
    tone(523, 0, 0.12);
    tone(659, 0.1, 0.12);
    tone(784, 0.2, 0.25);
  },
  fail: () => {
    tone(220, 0, 0.18, 'triangle');
    tone(185, 0.14, 0.22, 'triangle');
  },
  // Two short low buzzes: the compiler said no.
  compileError: () => {
    tone(140, 0, 0.07, 'square', 0.035);
    tone(140, 0.1, 0.09, 'square', 0.035);
  },
  run: () => tone(880, 0, 0.05, 'square', 0.02),
  click: () => tone(660, 0, 0.04, 'square', 0.015),
  // Terminal beep for moving between screens.
  beep: () => tone(1320, 0, 0.035, 'square', 0.012),
  open: () => {
    tone(990, 0, 0.03, 'square', 0.014);
    tone(1480, 0.035, 0.04, 'square', 0.012);
  },
  key: () => click(2600 + Math.random() * 1400, 0.11),
  enter: () => {
    click(1500, 0.14, 0.045);
    tone(420, 0.01, 0.03, 'square', 0.008);
  },
  achievement: () => {
    [784, 988, 1175, 1568].forEach((f, i) => tone(f, i * 0.07, 0.14, 'square', 0.022));
    tone(2093, 0.3, 0.35, 'sine', 0.03);
  },
  // Rising sweep when PIP-7 sets off to a new region, then footstep blips.
  unlock: () => {
    tone(300, 0, 0.35, 'sawtooth', 0.018, 1200);
    for (let i = 0; i < 6; i++) tone(i % 2 ? 520 : 440, 0.4 + i * 0.28, 0.04, 'square', 0.012);
  },
};

export function playSound(name, enabled) {
  if (!enabled || !SOUNDS[name]) return;
  try {
    ctx ||= new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
    if (name === 'key' || name === 'enter') {
      // Fast typists: never stack more than one click per 25 ms.
      const now = performance.now();
      if (now - lastKey < 25) return;
      lastKey = now;
    }
    SOUNDS[name]();
  } catch {
    /* sound is optional */
  }
}

/** Sound for a key press in a text field or the editor, or null for none. */
export function keySound(e) {
  if (e.ctrlKey || e.metaKey || e.altKey || e.repeat) return null;
  if (e.key === 'Enter') return 'enter';
  if (e.key.length === 1 || e.key === 'Backspace' || e.key === 'Delete' || e.key === 'Tab') return 'key';
  return null;
}
