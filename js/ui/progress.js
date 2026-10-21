// ui/progress.js — today's goal, streak, per-subject hours, 7-day chart, recent activity.

import { store, colorHex, getTopic } from '../store.js';
import { dateKey, weekBounds, addDaysKey, minutesOnDate, sessionsOnDate, hoursPerSubject, streak, fmtHM, weekdayShort, fmtDateNice } from '../stats.js';
import { el } from './common.js';

const GOAL_R = 64;
const GOAL_C = 2 * Math.PI * GOAL_R;

export function renderProgress() {
  const root = document.getElementById('progress-root');
  const state = store.state;
  root.innerHTML = '';

  if (state.sessions.length === 0) {
    const empty = el('div', 'empty');
    const art = el('div', 'empty-art');
    art.innerHTML = '<svg viewBox="0 0 24 24" class="ic"><path d="M4 20V10M10 20V4M16 20v-7" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>';
    const h = el('h3', null, 'No sessions yet — and that is fine');
    const p = el('p', null, 'Run your first focus session and this page comes alive: today’s hours against your goal, a streak, and per-subject bars. Progress here is measured from completed sessions only, never from the plan.');
    const btn = el('button', 'btn btn-primary', 'Go to Focus');
    btn.addEventListener('click', () => document.dispatchEvent(new CustomEvent('app:navigate', { detail: 'focus' })));
    const row = el('div', 'row');
    row.appendChild(btn);
    empty.append(art, h, p, row);
    root.appendChild(empty);
    return;
  }

  const today = dateKey();
  const { monday, sunday } = weekBounds(today);
  const todayMin = minutesOnDate(state.sessions, today);
  const goalMin = state.settings.dailyGoalMin;
  const pct = Math.min(100, Math.round((todayMin / goalMin) * 100));
  const st = streak(state.sessions, today);
  const weekMin = state.sessions
    .filter(s => s.date >= monday && s.date <= sunday)
    .reduce((a, s) => a + s.actualSec, 0) / 60;
  const perSubj = hoursPerSubject(state.subjects, state.topics, state.sessions, monday, sunday);

  const grid = el('div', 'progress-grid');

  // --- Today vs goal ---
  const todayCard = el('div', 'card pg-today');
  const ringWrap = el('div', 'goal-ring-wrap');
  ringWrap.innerHTML = `
    <svg width="148" height="148" viewBox="0 0 148 148">
      <circle class="goal-ring-track" cx="74" cy="74" r="${GOAL_R}"/>
      <circle class="goal-ring-val" cx="74" cy="74" r="${GOAL_R}" stroke-dasharray="${GOAL_C}" stroke-dashoffset="${GOAL_C * (1 - pct / 100)}"/>
    </svg>
    <div class="goal-ring-center"><div><b>${pct}%</b><span>of goal</span></div></div>`;
  const todayText = el('div');
  todayText.appendChild(el('div', 'pg-label', 'Today'));
  const big = el('div', 'pg-big');
  big.innerHTML = `${fmtHM(todayMin)} <span style="font-size:16px;color:var(--text-faint);font-weight:700">/ ${fmtHM(goalMin)}</span>`;
  todayText.appendChild(big);
  todayText.appendChild(el('div', 'pg-note', todayMin >= goalMin
    ? 'Goal reached. Anything more is a bonus — rest is part of studying.'
    : `${fmtHM(goalMin - todayMin)} left to reach today’s goal. One block at a time.`));
  todayCard.append(ringWrap, todayText);
  grid.appendChild(todayCard);

  // --- Streak ---
  const streakCard = el('div', 'card pg-streak');
  streakCard.innerHTML = `<svg viewBox="0 0 24 24" class="pg-flame"><path d="M12 22c4.4 0 7-2.8 7-6.5 0-2.4-1.2-4.2-2.4-5.7-.5 1-1.1 1.7-2 2.2.3-2.6-.9-6.1-4.1-8 .2 2.3-.6 3.9-1.9 5.4C7.3 10.9 5 13 5 16 5 19.9 7.6 22 12 22Z" fill="currentColor"/></svg>`;
  streakCard.appendChild(el('div', 'pg-big', String(st.current)));
  streakCard.appendChild(el('div', 'pg-label', st.current === 1 ? 'day streak' : 'day streak'));
  streakCard.appendChild(el('div', 'pg-note', st.current === 0
    ? 'No completed days yet — today can be day one.'
    : `Best so far: ${st.best} day${st.best > 1 ? 's' : ''}. ${st.current >= st.best ? 'This is it — keep going.' : ''}`));
  grid.appendChild(streakCard);

  // --- This week ---
  const weekCard = el('div', 'card pg-week');
  weekCard.appendChild(head('This week', `${fmtDateNice(monday)} – ${fmtDateNice(sunday)}`));
  const wk = el('div');
  const wkBig = el('div', 'pg-big', fmtHM(weekMin));
  wk.appendChild(wkBig);
  const sessCount = state.sessions.filter(s => s.date >= monday && s.date <= sunday).length;
  wk.appendChild(el('div', 'pg-note', `${sessCount} session${sessCount === 1 ? '' : 's'} completed · avg ${sessCount ? fmtHM(weekMin / sessCount) : '0m'} per session`));
  weekCard.appendChild(wk);
  grid.appendChild(weekCard);

  // --- Subject bars ---
  const subjCard = el('div', 'card pg-subjects');
  subjCard.appendChild(head('Hours per subject', 'This week'));
  if (perSubj.length === 0 || perSubj.every(x => x.minutes === 0)) {
    subjCard.appendChild(el('div', 'pg-note', 'Nothing studied this week yet — your bars will grow here.'));
  } else {
    const max = Math.max(...perSubj.map(x => x.minutes), 1);
    const list = el('div');
    for (const { subject, minutes } of perSubj) {
      if (minutes === 0) continue;
      const row = el('div', 'subj-bar-row');
      row.style.setProperty('--c', colorHex(subject.color));
      const name = el('div', 'subj-bar-name');
      name.innerHTML = `<span class="swatch"></span>`;
      name.appendChild(document.createTextNode(subject.name));
      const track = el('div', 'subj-bar-track');
      const val = el('div', 'subj-bar-val');
      val.style.width = Math.max(4, (minutes / max) * 100) + '%';
      track.appendChild(val);
      row.append(name, track, el('div', 'subj-bar-hours', fmtHM(minutes)));
      list.appendChild(row);
    }
    subjCard.appendChild(list);
    subjCard.appendChild(el('div', 'pg-note', 'Each bar sums the actual focus minutes logged against topics in that subject.'));
  }
  grid.appendChild(subjCard);

  // --- 7-day chart ---
  const chartCard = el('div', 'card pg-chart');
  chartCard.appendChild(head('Last 7 days', 'Minutes per day'));
  const chart = el('div', 'week-chart');
  let maxDay = 1;
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const key = addDaysKey(today, -i);
    const m = minutesOnDate(state.sessions, key);
    maxDay = Math.max(maxDay, m);
    days.push({ key, m });
  }
  for (const { key, m } of days) {
    const col = el('div', 'wc-col');
    const wrap = el('div', 'wc-bar-wrap');
    const bar = el('div', 'wc-bar' + (key === today ? ' is-today' : ''));
    bar.style.height = Math.max(2, (m / maxDay) * 100) + '%';
    wrap.appendChild(bar);
    col.appendChild(wrap);
    col.appendChild(el('div', 'wc-val', m ? String(Math.round(m)) : ''));
    const day = el('div', 'wc-day' + (key === today ? ' is-today' : ''), weekdayShort(key));
    col.appendChild(day);
    chart.appendChild(col);
  }
  chartCard.appendChild(chart);
  chartCard.appendChild(el('div', 'pg-note', 'A day counts when at least one focus session is completed on it.'));
  grid.appendChild(chartCard);

  // --- Recent activity ---
  const recentCard = el('div', 'card pg-recent');
  recentCard.appendChild(head('Recent sessions', 'Newest first'));
  const list = el('div', 'recent-list');
  const recent = [...state.sessions].sort((a, b) => b.startedAt.localeCompare(a.startedAt)).slice(0, 6);
  for (const s of recent) {
    const topic = getTopic(state, s.topicId);
    const subject = topic ? state.subjects.find(x => x.id === topic.subjectId) : null;
    const item = el('div', 'recent-item');
    item.style.setProperty('--c', colorHex(subject?.color || 'indigo'));
    item.innerHTML = '<span class="swatch"></span>';
    const title = el('span', 'r-title', topic ? topic.title : 'Deleted topic');
    const sub = el('span', 'r-sub', `${fmtDateNice(s.date)} · ${weekdayShort(s.date)} · ${fmtHM(s.actualSec / 60)}`);
    item.append(title, sub);
    list.appendChild(item);
  }
  recentCard.appendChild(list);
  grid.appendChild(recentCard);

  root.appendChild(grid);
}

function head(title, right) {
  const h = el('div', 'pg-head');
  h.appendChild(el('h2', null, title));
  h.appendChild(el('span', null, right));
  return h;
}
