// sounds.js — WebAudio chime, no audio files needed.

let ctx = null;

export function prime() {
  try {
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
  } catch { /* audio unavailable — stay silent */ }
}

function tone(freq, start, dur, type = 'sine', gain = 0.16) {
  if (!ctx) return;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  g.gain.setValueAtTime(0.0001, start);
  g.gain.exponentialRampToValueAtTime(gain, start + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  osc.connect(g).connect(ctx.destination);
  osc.start(start);
  osc.stop(start + dur + 0.05);
}

// Two-note chime for phase end.
export function playPhaseEnd(isLong = false) {
  prime();
  if (!ctx) return;
  const t = ctx.currentTime;
  tone(880, t, 0.35);
  tone(1318.5, t + 0.14, 0.5);
  if (isLong) tone(1760, t + 0.3, 0.6, 'sine', 0.12);
}

// Softer single tone when a rest ends.
export function playRestEnd() {
  prime();
  if (!ctx) return;
  const t = ctx.currentTime;
  tone(659.3, t, 0.3, 'triangle');
  tone(880, t + 0.12, 0.4, 'triangle');
}
