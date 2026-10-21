// ui/focus.js — countdown ring, phase controls, auto-logging with undo.

import { store, uid, colorHex, getTopic, getSubject, planFor } from '../store.js';
import { PHASE, startFocus, pause, resume, resetTimer, skipRest, remainingMs, tick, isRest, formatClock, phaseDurationMs } from '../timer.js';
import { dateKey, weekBounds, minutesOnDate, fmtHM } from '../stats.js';
import { playPhaseEnd, playRestEnd, prime } from '../sounds.js';
import { toast, el } from './common.js';
import { animateLastDot } from './planner.js';

const RING_R = 140;
const RING_C = 2 * Math.PI * RING_R;

let intervalId = null;

const els = {};

export function initFocus() {
  els.ringValue = document.getElementById('ring-value');
  els.ringTime = document.getElementById('ring-time');
  els.ringStatus = document.getElementById('ring-status');
  els.phasePill = document.getElementById('phase-pill');
  els.phaseLabel = document.getElementById('phase-label');
  els.cycleDots = document.getElementById('cycle-dots');
  els.btnMain = document.getElementById('btn-main');
  els.btnMainText = document.getElementById('btn-main-text');
  els.btnReset = document.getElementById('btn-reset');
  els.btnSkip = document.getElementById('btn-skip-rest');
  els.topicSelect = document.getElementById('topic-select');
  els.topicMeta = document.getElementById('topic-meta');
  els.sideStats = document.getElementById('focus-side-stats');

  els.ringValue.style.strokeDasharray = String(RING_C);

  els.btnMain.addEventListener('click', onMain);
  els.btnReset.addEventListener('click', doReset);
  els.btnSkip.addEventListener('click', onSkipRest);
  els.topicSelect.addEventListener('change', () => {
    const topicId = els.topicSelect.value || null;
    store.update(s => { s.timer.topicId = topicId; });
  });

  document.addEventListener('keydown', e => {
    const typing = /^(INPUT|SELECT|TEXTAREA)$/.test(document.activeElement?.tagName || '');
    if (e.code === 'Space' && !typing && isFocusViewActive()) {
      e.preventDefault();
      onMain();
    }
  });

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) step();
  });

  intervalId = setInterval(step, 250);
  renderTopicSelect();
  step();
}

function isFocusViewActive() {
  return document.getElementById('view-focus').classList.contains('is-active');
}

// Called by main.js whenever state changes (topic list edits, etc.).
export function renderTopicSelect() {
  const state = store.state;
  const sel = els.topicSelect;
  sel.innerHTML = '';
  const placeholder = el('option', null, 'Choose a topic…');
  placeholder.value = '';
  sel.appendChild(placeholder);
  for (const subject of state.subjects) {
    const group = el('optgroup');
    group.label = subject.name;
    const topics = state.topics.filter(t => t.subjectId === subject.id && !t.archived && !t.done);
    if (topics.length === 0) continue;
    for (const t of topics) {
      const o = el('option', null, t.title);
      o.value = t.id;
      group.appendChild(o);
    }
    sel.appendChild(group);
  }
  sel.value = state.timer.topicId || '';
  renderSide();
}

function selectedTopic() {
  return getTopic(store.state, store.state.timer.topicId);
}

function onMain() {
  prime();
  const state = store.state;
  const t = state.timer;

  if (t.running) {
    store.update(s => { pause(s.timer, Date.now(), s.settings); });
    return;
  }
  if (t.pausedRemainingMs != null && t.endsAt == null) {
    store.update(s => { resume(s.timer, Date.now(), s.settings); });
    return;
  }
  // Fresh start (or ready-after-rest state).
  const topicId = t.topicId;
  if (!topicId || !getTopic(state, topicId) || (getTopic(state, topicId).done)) {
    toast('Pick a topic first — time must know what it served.', { actionLabel: 'OK', timeoutMs: 4000 });
    els.topicSelect.focus();
    return;
  }
  store.update(s => { startFocus(s.timer, topicId, Date.now(), s.settings); });
}

function doReset() {
  store.update(s => { s.timer = resetTimer(); });
}

function onSkipRest() {
  store.update(s => { skipRest(s.timer, Date.now(), s.settings); });
}

function step() {
  const now = Date.now();
  const state = store.state;
  const events = tick(state.timer, now, state.settings);

  for (const ev of events) {
    if (ev.type === 'focusComplete') onFocusComplete(now);
    else if (ev.type === 'restComplete') onRestComplete();
  }

  paint(now);

  document.dispatchEvent(new CustomEvent('app:tick', {
    detail: {
      running: state.timer.running,
      phase: state.timer.phase,
      remainingMs: remainingMs(state.timer, now, state.settings),
    },
  }));
}

function onFocusComplete(now) {
  const state = store.state;
  const t = state.timer;
  if (!t.topicId) return;
  const plannedSec = state.settings.focusMin * 60;
  const startedAtMs = now - plannedSec * 1000;
  const startedAt = new Date(startedAtMs);
  const key = dateKey(startedAt);
  const session = {
    id: uid('x'),
    topicId: t.topicId,
    date: key,
    startedAt: startedAt.toISOString(),
    plannedSec,
    actualSec: plannedSec,
  };
  store.update(s => { s.sessions.push(session); });

  if (state.settings.sound) playPhaseEnd(false);
  maybeNotify('Focus session complete', `${getTopic(state, t.topicId)?.title || 'Topic'} · ${fmtHM(plannedSec / 60)} logged.`);

  const finishToast = toast(`Logged ${fmtHM(plannedSec / 60)} — ${getTopic(store.state, t.topicId)?.title || 'topic'}.`, {
    actionLabel: 'Undo',
    timeoutMs: 10000,
    onAction: () => {
      store.update(s => {
        const i = s.sessions.findIndex(x => x.id === session.id);
        if (i >= 0) s.sessions.splice(i, 1);
      });
    },
  });
  void finishToast;
  document.dispatchEvent(new CustomEvent('app:session-logged', { detail: { topicId: t.topicId, date: key } }));
}

function onRestComplete() {
  if (store.state.settings.sound) playRestEnd();
  maybeNotify('Break over', 'Ready for the next focus session?');
}

function maybeNotify(title, body) {
  const s = store.state.settings;
  if (!s.notifications || !('Notification' in window)) return;
  if (Notification.permission === 'granted') {
    try { new Notification(title, { body }); } catch { /* some platforms need ServiceWorker */ }
  }
}

function paint(now) {
  const state = store.state;
  const t = state.timer;
  const rem = remainingMs(t, now, state.settings);
  const total = phaseDurationMs(t, state.settings);
  const frac = total > 0 ? rem / total : 0;

  els.ringValue.style.strokeDashoffset = String(RING_C * (1 - frac));
  els.ringValue.classList.toggle('is-rest', isRest(t.phase));
  els.ringTime.textContent = formatClock(rem);

  const rest = isRest(t.phase);
  els.phasePill.classList.toggle('is-rest', rest);
  els.phaseLabel.textContent = t.phase === PHASE.FOCUS ? 'Focus'
    : t.phase === PHASE.SHORT ? 'Short rest' : 'Long rest';

  // Cycle dots
  const n = Math.max(1, state.settings.cyclesBeforeLong);
  if (els.cycleDots.childElementCount !== n) {
    els.cycleDots.innerHTML = '';
    for (let i = 0; i < n; i++) els.cycleDots.appendChild(el('span', 'cycle-dot'));
  }
  // Completed focuses in the current set: during a long rest, cycle resets to 1
  // (meaning the full set of n is done); otherwise it's cycle-1.
  const done = t.phase === PHASE.FOCUS ? t.cycle - 1 : (t.cycle === 1 ? n : t.cycle - 1);
  [...els.cycleDots.children].forEach((d, i) => d.classList.toggle('is-on', i < done));

  // Status line + main button
  const topic = selectedTopic();
  if (t.running) {
    els.ringStatus.textContent = rest ? 'Breathe — you earned it' : (topic ? 'Focusing · ' + topic.title : 'Focusing');
    els.btnMainText.textContent = 'Pause';
  } else if (t.pausedRemainingMs != null && t.endsAt == null) {
    els.ringStatus.textContent = 'Paused — ' + (topic ? topic.title : '');
    els.btnMainText.textContent = 'Resume';
  } else {
    els.ringStatus.textContent = rest ? 'Rest skipped? Ready for focus' : (topic ? 'Ready · ' + topic.title : 'Pick a topic to begin');
    els.btnMainText.textContent = 'Start';
  }
  els.btnMain.classList.toggle('is-running', t.running);
  els.btnSkip.hidden = !(rest && (t.running || t.pausedRemainingMs != null));
  els.btnReset.disabled = !t.running && t.pausedRemainingMs == null && !rest;

  // Topic meta + side stats
  const sub = topic ? getSubject(state, topic.subjectId) : null;
  els.topicMeta.innerHTML = topic
    ? `Under <strong>${escapeHtml(sub?.name || '')}</strong> · ${planThisWeek(state, topic.id)} planned this week`
    : 'Pick a topic to tie this session to it.';
  renderSide();
}

function planThisWeek(state, topicId) {
  const { monday, sunday } = weekBounds(dateKey());
  let sum = 0;
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday + 'T12:00:00');
    d.setDate(d.getDate() + i);
    const key = dateKey(d);
    if (key > sunday) break;
    sum += planFor(state, topicId, key);
  }
  return sum;
}

function renderSide() {
  const state = store.state;
  const topic = selectedTopic();
  const today = dateKey();
  const todayMin = minutesOnDate(state.sessions, today);
  const topicSessions = topic ? state.sessions.filter(s => s.topicId === topic.id) : [];
  const topicMin = topicSessions.reduce((a, s) => a + s.actualSec, 0) / 60;
  els.sideStats.innerHTML = '';
  const stats = [
    [fmtHM(todayMin), 'Today total'],
    [String(state.sessions.filter(s => s.date === today).length), 'Sessions today'],
    topic ? [fmtHM(topicMin), 'On this topic'] : ['—', 'On this topic'],
    topic ? [String(topicSessions.length), 'Topic sessions'] : ['—', 'Topic sessions'],
  ];
  for (const [v, label] of stats) {
    const d = el('div', 'side-stat');
    d.appendChild(el('b', null, v));
    d.appendChild(el('span', null, label));
    els.sideStats.appendChild(d);
  }
}

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
