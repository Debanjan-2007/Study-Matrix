// main.js — boot, routing, theme, global chrome (streak/timer chips, tab title).

import { store } from './store.js';
import { dateKey, streak } from './stats.js';
import { formatClock, isRest } from './timer.js';
import { initPlanner, renderPlanner, animateLastDot } from './ui/planner.js';
import { initFocus, renderTopicSelect } from './ui/focus.js';
import { renderProgress } from './ui/progress.js';
import { initSettings, renderSettings, maybeShowSetup } from './ui/settings.js';
import { prime } from './sounds.js';
import { initSync, getSyncInfo, signIn } from './sync.js';
import { el } from './ui/common.js';

const BASE_TITLE = 'Study Matrix — Plan · Focus · Achieve';

let currentView = 'planner';

function show(view) {
  currentView = view;
  document.querySelectorAll('.view').forEach(v => v.classList.remove('is-active'));
  document.getElementById('view-' + view).classList.add('is-active');
  document.querySelectorAll('.nav-pill').forEach(p => {
    p.classList.toggle('is-active', p.dataset.goto === view);
  });
  if (view === 'planner') renderPlanner();
  if (view === 'progress') renderProgress();
  if (view === 'settings') renderSettings();
  if (view === 'focus') renderTopicSelect();
}

function applyTheme() {
  const pref = store.state.settings.theme || 'system';
  const dark = pref === 'dark' || (pref === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  const meta = document.querySelector('meta[name="color-scheme"]');
  if (meta) meta.content = dark ? 'dark light' : 'light dark';
}

function updateStreakChip() {
  const st = streak(store.state.sessions, dateKey());
  document.getElementById('nav-streak-num').textContent = String(st.current);
}

function paintSyncChip() {
  const chip = document.getElementById('sync-chip');
  const text = document.getElementById('sync-chip-text');
  const avatar = document.getElementById('sync-avatar');
  const info = getSyncInfo();
  avatar.hidden = true;
  chip.classList.toggle('is-on', !!info.user);
  if (!info.configured) {
    text.textContent = 'Sync';
    chip.title = 'Cloud sync is not set up yet (needs a free Firebase project)';
  } else if (!info.user) {
    text.textContent = info.status === 'signingIn' ? 'Signing in…' : 'Sync';
    chip.title = 'Sign in with Google to sync between devices';
  } else {
    text.textContent = info.user.name || 'Synced';
    if (info.user.photo) { avatar.src = info.user.photo; avatar.hidden = false; }
    chip.title = 'Signed in as ' + (info.user.email || '') + ' — click for sync settings';
  }
}

function paintStorageError() {
  let banner = document.getElementById('storage-banner');
  if (!store.state.storageError) {
    banner?.remove();
    return;
  }
  if (banner) return;
  banner = el('div', 'storage-banner');
  banner.id = 'storage-banner';
  banner.textContent = 'Could not write to browser storage (' + store.state.storageError + '). Your data may not be saved — export a backup now.';
  const btn = el('button', 'btn btn-danger btn-sm', 'Go to Settings');
  btn.addEventListener('click', () => show('settings'));
  banner.appendChild(btn);
  document.getElementById('main').prepend(banner);
}

function boot() {
  applyTheme();
  initPlanner();
  initSettings();
  initFocus();
  initSync();
  maybeShowSetup();

  // Nav
  document.querySelectorAll('[data-goto]').forEach(b => {
    b.addEventListener('click', () => show(b.dataset.goto));
  });
  document.addEventListener('app:navigate', e => show(e.detail));

  // Theme toggle: cycles system → dark → light
  document.getElementById('theme-toggle').addEventListener('click', () => {
    const order = ['system', 'dark', 'light'];
    const cur = store.state.settings.theme || 'system';
    const next = order[(order.indexOf(cur) + 1) % order.length];
    store.update(s => { s.settings.theme = next; });
    applyTheme();
  });
  document.addEventListener('app:theme', applyTheme);
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if ((store.state.settings.theme || 'system') === 'system') applyTheme();
  });

  // Prime audio on first interaction (autoplay policies)
  document.addEventListener('pointerdown', prime, { once: true });

  // Global reactions to state changes
  store.subscribe(() => {
    updateStreakChip();
    paintStorageError();
    if (currentView === 'planner') renderPlanner();
    else if (currentView === 'progress') renderProgress();
    else if (currentView === 'settings') renderSettings();
    else if (currentView === 'focus') renderTopicSelect();
  });
  updateStreakChip();
  paintStorageError();
  paintSyncChip();

  // Sync chip: sign in when signed out, open settings when signed in
  document.getElementById('sync-chip').addEventListener('click', () => {
    const info = getSyncInfo();
    if (info.user) show('settings');
    else signIn();
  });
  document.addEventListener('app:sync', () => {
    paintSyncChip();
    if (currentView === 'settings') renderSettings();
  });

  // Timer ticks drive the nav chip + tab title
  const chip = document.getElementById('timer-chip');
  const chipText = document.getElementById('timer-chip-text');
  document.addEventListener('app:tick', e => {
    const { running, phase, remainingMs } = e.detail;
    chip.hidden = !running;
    if (running) chipText.textContent = formatClock(remainingMs) + (isRest(phase) ? ' rest' : ' focus');
    const label = isRest(phase) ? 'Rest' : 'Focus';
    document.title = running
      ? `${formatClock(remainingMs)} · ${label} — Study Matrix`
      : BASE_TITLE;
  });

  // Celebrate filled dots when a session lands while the planner is visible
  document.addEventListener('app:session-logged', e => {
    if (currentView === 'planner') animateLastDot(e.detail.topicId, e.detail.date);
  });

  show('planner');
}

// Debug/testing handle (local-only app; also handy from the console).
window.__store = store;

boot();
