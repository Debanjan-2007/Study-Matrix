// timer.js — phase state machine (focus / short rest / long rest).
// Pure logic: no DOM, no storage. The clock is injectable for tests.

export const PHASE = { FOCUS: 'focus', SHORT: 'shortRest', LONG: 'longRest' };

export function defaultTimer() {
  return { phase: PHASE.FOCUS, topicId: null, endsAt: null, pausedRemainingMs: null, cycle: 1, running: false };
}

export function phaseDurationMs(timer, settings) {
  const min = timer.phase === PHASE.FOCUS ? settings.focusMin
    : timer.phase === PHASE.SHORT ? settings.shortRestMin
    : settings.longRestMin;
  return min * 60_000;
}

// Remaining time derived from the end timestamp — immune to background throttling.
export function remainingMs(timer, now, settings) {
  if (timer.running && timer.endsAt != null) {
    return Math.max(0, timer.endsAt - now);
  }
  if (timer.pausedRemainingMs != null) return timer.pausedRemainingMs;
  return phaseDurationMs(timer, settings);
}

export function startFocus(timer, topicId, now, settings) {
  timer.phase = PHASE.FOCUS;
  timer.topicId = topicId;
  timer.running = true;
  timer.endsAt = now + phaseDurationMs(timer, settings);
  timer.pausedRemainingMs = null;
  return timer;
}

export function pause(timer, now, settings) {
  if (!timer.running) return timer;
  timer.pausedRemainingMs = remainingMs(timer, now, settings);
  timer.endsAt = null;
  timer.running = false;
  return timer;
}

export function resume(timer, now, settings) {
  if (timer.running) return timer;
  timer.endsAt = now + (timer.pausedRemainingMs ?? phaseDurationMs(timer, settings));
  timer.pausedRemainingMs = null;
  timer.running = true;
  return timer;
}

export function resetTimer() {
  return defaultTimer();
}

export function skipRest(timer, now, settings) {
  if (timer.phase === PHASE.FOCUS) return timer;
  timer.phase = PHASE.FOCUS;
  timer.running = false;
  timer.endsAt = null;
  timer.pausedRemainingMs = phaseDurationMs(timer, settings);
  return timer;
}

// Move to the next phase after one reaches zero. Returns an event describing
// what happened so callers can log sessions / play sounds.
export function advance(timer, now, settings) {
  if (timer.phase === PHASE.FOCUS) {
    const completedCycle = timer.cycle;
    const longDue = completedCycle >= Math.max(1, settings.cyclesBeforeLong);
    timer.phase = longDue ? PHASE.LONG : PHASE.SHORT;
    timer.cycle = longDue ? 1 : completedCycle + 1;
    timer.running = true;
    timer.endsAt = now + phaseDurationMs(timer, settings);
    timer.pausedRemainingMs = null;
    return { type: 'focusComplete', longDue, cycle: completedCycle };
  }
  // Rest finished → ready for the next focus (not auto-started).
  timer.phase = PHASE.FOCUS;
  timer.running = false;
  timer.endsAt = null;
  timer.pausedRemainingMs = phaseDurationMs(timer, settings);
  return { type: 'restComplete' };
}

// Called on every tick (interval + visibility change). If the phase reached
// zero, advance and keep advancing while phases sit at zero.
export function tick(timer, now, settings) {
  const events = [];
  let guard = 0;
  while (timer.running && timer.endsAt != null && now >= timer.endsAt && guard++ < 8) {
    events.push(advance(timer, now, settings));
  }
  return events;
}

export function isRest(phase) {
  return phase === PHASE.SHORT || phase === PHASE.LONG;
}

export function formatClock(ms) {
  const totalSec = Math.ceil(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
}
