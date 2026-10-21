// stats.js — pure functions over session records. No DOM.

function pad(n) { return String(n).padStart(2, '0'); }

// Local calendar date key — never use toISOString() (UTC shifts the day near midnight).
export function dateKey(d = new Date()) {
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
}

export function parseKey(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDaysKey(key, n) {
  const d = parseKey(key);
  d.setDate(d.getDate() + n);
  return dateKey(d);
}

// Monday-first week bounds for a date key.
export function weekBounds(key) {
  const d = parseKey(key);
  const dow = (d.getDay() + 6) % 7;
  const monday = addDaysKey(key, -dow);
  const sunday = addDaysKey(key, 6 - dow);
  return { monday, sunday };
}

export function minutesOnDate(sessions, key) {
  return sessions
    .filter(s => s.date === key)
    .reduce((sum, s) => sum + s.actualSec, 0) / 60;
}

export function sessionsOnDate(sessions, key) {
  return sessions.filter(s => s.date === key).length;
}

export function minutesBetween(sessions, fromKey, toKey) {
  return sessions
    .filter(s => s.date >= fromKey && s.date <= toKey)
    .reduce((sum, s) => sum + s.actualSec, 0) / 60;
}

// [{subjectId, minutes}] for the current week, sorted desc. Uses topics to map
// sessions → subjects, so deleted topics still count under their subject.
export function hoursPerSubject(subjects, topics, sessions, fromKey, toKey) {
  const topicMap = new Map(topics.map(t => [t.id, t.subjectId]));
  const per = new Map();
  for (const s of sessions) {
    if (s.date < fromKey || s.date > toKey) continue;
    const sid = topicMap.get(s.topicId);
    if (!sid) continue;
    per.set(sid, (per.get(sid) || 0) + s.actualSec / 60);
  }
  return subjects
    .map(sub => ({ subject: sub, minutes: Math.round((per.get(sub.id) || 0)) }))
    .sort((a, b) => b.minutes - a.minutes);
}

// Consecutive days (ending today or yesterday) with ≥1 completed session.
// "Today does not break the streak until the day ends."
export function streak(sessions, todayKey) {
  const days = new Set(sessions.map(s => s.date));
  let cursor = todayKey;
  if (!days.has(cursor)) cursor = addDaysKey(cursor, -1);
  let current = 0;
  while (days.has(cursor)) {
    current++;
    cursor = addDaysKey(cursor, -1);
  }
  let best = 0, run = 0, prev = null;
  const sorted = [...days].sort();
  for (const d of sorted) {
    run = prev && addDaysKey(prev, 1) === d ? run + 1 : 1;
    best = Math.max(best, run);
    prev = d;
  }
  return { current, best };
}

export function fmtHM(minutes) {
  const m = Math.round(minutes);
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (h && r) return h + 'h ' + r + 'm';
  if (h) return h + 'h';
  return r + 'm';
}

export function fmtClock(minutes) {
  const m = Math.round(minutes);
  return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
}

export function weekdayShort(key) {
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][parseKey(key).getDay()];
}

export function weekdayLong(key) {
  return ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][parseKey(key).getDay()];
}

export function dayNum(key) {
  return parseKey(key).getDate();
}

export function fmtDateNice(key) {
  return parseKey(key).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
