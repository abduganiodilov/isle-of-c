// Tiny optional sound effects synthesised with WebAudio (no audio files).
let ctx = null;

function tone(freq, start, dur, type = 'sine', gain = 0.06) {
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.value = freq;
  g.gain.setValueAtTime(gain, ctx.currentTime + start);
  g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + start + dur);
  o.connect(g).connect(ctx.destination);
  o.start(ctx.currentTime + start);
  o.stop(ctx.currentTime + start + dur + 0.02);
}

export function playSound(name, enabled) {
  if (!enabled) return;
  try {
    ctx ||= new (window.AudioContext || window.webkitAudioContext)();
    if (name === 'success') {
      tone(523, 0, 0.12);
      tone(659, 0.1, 0.12);
      tone(784, 0.2, 0.25);
    } else if (name === 'fail') {
      tone(220, 0, 0.18, 'triangle');
      tone(185, 0.14, 0.22, 'triangle');
    } else if (name === 'run') {
      tone(880, 0, 0.05, 'square', 0.02);
    } else if (name === 'click') {
      tone(660, 0, 0.04, 'square', 0.015);
    }
  } catch {
    /* sound is optional */
  }
}
