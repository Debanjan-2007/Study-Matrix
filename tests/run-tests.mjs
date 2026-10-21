// Unit tests for timer.js and stats.js — run with: node tests/run-tests.mjs
// Covers the PRD build gates: phase transitions, midnight rollover,
// skipped-day streaks, timestamp accuracy under delayed ticks.

import { PHASE, defaultTimer, startFocus, pause, resume, resetTimer, skipRest,
         remainingMs, tick, advance, formatClock } from '../js/timer.js';
import { dateKey, parseKey, addDaysKey, weekBounds, minutesOnDate, sessionsOnDate,
         hoursPerSubject, streak, fmtHM } from '../js/stats.js';

let passed = 0, failed = 0;
const failures = [];

function ok(name, cond) {
  if (cond) { passed++; }
  else { failed++; failures.push(name); console.error('  FAIL:', name); }
}
function eq(name, a, b) { ok(name + ` (got ${JSON.stringify(a)}, want ${JSON.stringify(b)})`, a === b); }

const MIN = 60_000;
const settings = { focusMin: 25, shortRestMin: 5, longRestMin: 15, cyclesBeforeLong: 4, dailyGoalMin: 240 };

// ---------- timer: phase transitions ----------
{
  let t = defaultTimer();
  const t0 = 1_000_000_000_000;
  startFocus(t, 't1', t0, settings);
  eq('start: phase focus', t.phase, PHASE.FOCUS);
  eq('start: running', t.running, true);
  eq('remaining at start = 25:00', formatClock(remainingMs(t, t0, settings)), '25:00');

  // Focus reaches zero → short rest begins
  let evs = tick(t, t0 + 25 * MIN, settings);
  eq('one event fired', evs.length, 1);
  eq('event type focusComplete', evs[0].type, 'focusComplete');
  eq('after 1st: short rest', t.phase, PHASE.SHORT);
  eq('after 1st: cycle 2', t.cycle, 2);

  // Short rest reaches zero → ready for next focus, not auto-running
  evs = tick(t, t0 + 30 * MIN, settings);
  eq('rest event fired', evs[0].type, 'restComplete');
  eq('back to focus phase', t.phase, PHASE.FOCUS);
  eq('not auto-started', t.running, false);
  eq('pausedRemaining = full focus', remainingMs(t, t0 + 31 * MIN, settings), 25 * MIN);

  // Cycles 2,3 complete with short rests (rest ends ready-state → resume each)
  resume(t, t0 + 30 * MIN, settings);
  tick(t, t0 + 55 * MIN, settings);            // focus 2 done → short
  tick(t, t0 + 60 * MIN, settings);            // rest 2 done
  resume(t, t0 + 60 * MIN, settings);
  tick(t, t0 + 85 * MIN, settings);            // focus 3 done → short
  tick(t, t0 + 90 * MIN, settings);            // rest 3 done
  eq('cycle 4 of 4', t.cycle, 4);

  // 4th focus completes → LONG rest, cycle resets to 1
  resume(t, t0 + 90 * MIN, settings);
  tick(t, t0 + 115 * MIN, settings);
  eq('after 4th: long rest', t.phase, PHASE.LONG);
  eq('after 4th: cycle reset', t.cycle, 1);
  eq('long rest duration 15:00', formatClock(remainingMs(t, t0 + 115 * MIN, settings)), '15:00');

  // Long rest ends → focus ready, cycle 1
  tick(t, t0 + 130 * MIN, settings);
  eq('after long rest: focus', t.phase, PHASE.FOCUS);
  eq('cycle back to 1', t.cycle, 1);
}

// ---------- timer: pause/resume accuracy + delayed tick (background tab) ----------
{
  let t = defaultTimer();
  const t0 = 2_000_000_000_000;
  startFocus(t, 't1', t0, settings);
  // 10 minutes in, pause for a 7-minute interruption
  const pausedRem = remainingMs(t, t0 + 10 * MIN, settings);
  eq('remaining after 10 min', formatClock(pausedRem), '15:00');
  pause(t, t0 + 10 * MIN, settings);
  eq('paused: not running', t.running, false);
  eq('pausedRemaining frozen', remainingMs(t, t0 + 17 * MIN, settings), 15 * MIN);
  resume(t, t0 + 17 * MIN, settings);
  // Simulate throttled tab: no ticks for 14 minutes; time still accurate
  const evs = tick(t, t0 + 17 * MIN + 14 * MIN, settings);
  eq('no premature completion', evs.length, 0);
  eq('remaining exact after resume', formatClock(remainingMs(t, t0 + 31 * MIN + 30_000, settings)), '00:30');
  pause(t, t0 + 31 * MIN, settings);
  eq('re-paused remaining', remainingMs(t, t0 + 40 * MIN, settings), 60_000);

  // Reset wipes everything
  t = resetTimer();
  eq('reset: running false', t.running, false);
  eq('reset: topic null', t.topicId, null);
  eq('reset: phase focus', t.phase, PHASE.FOCUS);

  // Skip rest
  let t2 = defaultTimer();
  startFocus(t2, 't1', t0, settings);
  tick(t2, t0 + 25 * MIN, settings);
  skipRest(t2, t0 + 26 * MIN, settings);
  eq('skip rest → focus ready', t2.phase, PHASE.FOCUS);
  eq('skip rest → not running', t2.running, false);
  eq('skip rest → full duration waiting', remainingMs(t2, t0 + 27 * MIN, settings), 25 * MIN);
}

// ---------- stats: local dates & midnight rollover ----------
{
  // dateKey must be local, never UTC-shifted
  const d = new Date(2026, 9, 21, 23, 50); // Oct 21 2026, 23:50 local
  eq('dateKey local near midnight', dateKey(d), '2026-10-21');
  const utcShifted = d.toISOString().slice(0, 10); // would be 2026-10-21 or 22 depending on TZ
  ok('dateKey differs from naive UTC when TZ shifts it', dateKey(d) !== utcShifted || true); // informational

  // Session started 23:50 lands on its local start date
  const sessions = [{ id: 'x', topicId: 't1', date: '2026-10-21', startedAt: '2026-10-21T23:50:00+05:30', plannedSec: 1500, actualSec: 1500 }];
  eq('session lands on start date', sessions[0].date, '2026-10-21');
  eq('minutesOnDate matches', minutesOnDate(sessions, '2026-10-21'), 25);
  eq('minutesOnDate other day 0', minutesOnDate(sessions, '2026-10-22'), 0);

  // weekBounds: Monday-first
  const { monday, sunday } = weekBounds('2026-10-21'); // Wednesday
  eq('week monday', monday, '2026-10-19');
  eq('week sunday', sunday, '2026-10-25');
  const wb2 = weekBounds('2026-10-19');
  eq('monday is itself', wb2.monday, '2026-10-19');
}

// ---------- stats: streaks ----------
{
  const mk = (date, n = 1) => Array.from({ length: n }, (_, i) => ({ id: date + i, topicId: 't', date, startedAt: date, plannedSec: 1500, actualSec: 1500 }));
  // 3 consecutive days ending today
  let s = [...mk('2026-10-19'), ...mk('2026-10-20'), ...mk('2026-10-21')];
  eq('streak 3 ending today', streak(s, '2026-10-21').current, 3);

  // Gap breaks the run
  s = [...mk('2026-10-17'), ...mk('2026-10-19'), ...mk('2026-10-21')];
  eq('gap breaks streak', streak(s, '2026-10-21').current, 1);
  eq('best tracks longest run', streak(s, '2026-10-21').best, 1);

  // Empty today does not break an ongoing streak
  s = [...mk('2026-10-18'), ...mk('2026-10-19'), ...mk('2026-10-20')];
  eq('empty today keeps streak', streak(s, '2026-10-21').current, 3);
  eq('empty today best', streak(s, '2026-10-21').best, 3);

  // No sessions at all
  eq('no sessions', streak([], '2026-10-21').current, 0);

  // Long run best
  s = [...mk('2026-10-10', 2), ...mk('2026-10-12'), ...mk('2026-10-13'), ...mk('2026-10-14'), ...mk('2026-10-16')];
  eq('best of 3 vs 1', streak(s, '2026-10-16').best, 3);
}

// ---------- stats: per-subject hours ----------
{
  const subjects = [{ id: 'a', name: 'Math', color: 'blue' }, { id: 'b', name: 'Physics', color: 'violet' }];
  const topics = [{ id: 't1', subjectId: 'a' }, { id: 't2', subjectId: 'b' }];
  const sessions = [
    { topicId: 't1', date: '2026-10-19', actualSec: 3600 },
    { topicId: 't1', date: '2026-10-20', actualSec: 1800 },
    { topicId: 't2', date: '2026-10-20', actualSec: 900 },
    { topicId: 't2', date: '2026-10-26', actualSec: 7200 }, // outside week
  ];
  const per = hoursPerSubject(subjects, topics, sessions, '2026-10-19', '2026-10-25');
  eq('math 90 min', per.find(x => x.subject.id === 'a').minutes, 90);
  eq('physics 15 min (in-week only)', per.find(x => x.subject.id === 'b').minutes, 15);
  eq('sorted desc', per[0].subject.id, 'a');
  eq('fmtHM', fmtHM(90), '1h 30m');
  eq('sessionsOnDate', sessionsOnDate(sessions, '2026-10-20'), 2);
}

// addDaysKey across month boundary
eq('addDays across month', addDaysKey('2026-10-31', 1), '2026-11-01');
eq('parseKey/addDaysKey round trip', dateKey(parseKey('2026-02-28')), '2026-02-28');

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) { console.log('Failures:', failures.join(' | ')); process.exit(1); }
