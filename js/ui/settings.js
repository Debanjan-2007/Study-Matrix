// ui/settings.js — durations, goal, sound, theme, export/import, reset.

import { store, exportJSON, parseImport, blankState, demoState } from '../store.js';
import { fmtHM } from '../stats.js';
import { getSyncInfo, signIn, signOut } from '../sync.js';
import { openModal, toast, field, el } from './common.js';

export function initSettings() {
  document.getElementById('import-file').addEventListener('change', onImportFile);
}

export function renderSettings() {
  const root = document.getElementById('settings-root');
  const s = store.state.settings;
  root.innerHTML = '';
  const grid = el('div', 'settings-grid');

  // ---- Focus durations ----
  const durCard = el('div', 'card set-card');
  durCard.appendChild(el('h2', null, 'Focus cycle'));
  durCard.appendChild(Object.assign(el('p', 'set-sub'), { textContent: 'Defaults: 25 min focus, 5 min short rest, 15 min long rest after every fourth session.' }));
  durCard.appendChild(numberRow('Focus length', 'minutes per session', 'set-focus', s.focusMin, 1, 180));
  durCard.appendChild(numberRow('Short rest', 'minutes', 'set-short', s.shortRestMin, 1, 60));
  durCard.appendChild(numberRow('Long rest', 'minutes', 'set-long', s.longRestMin, 1, 90));
  durCard.appendChild(numberRow('Long rest every', 'focus sessions', 'set-cycles', s.cyclesBeforeLong, 2, 10));
  grid.appendChild(durCard);

  // ---- Daily goal & name ----
  const goalCard = el('div', 'card set-card');
  goalCard.appendChild(el('h2', null, 'Daily goal'));
  goalCard.appendChild(Object.assign(el('p', 'set-sub'), { textContent: 'Today’s bar on the Progress page fills toward this target.' }));
  const name = el('input', 'input');
  name.id = 'set-name';
  name.value = s.name || '';
  name.placeholder = 'Your name (optional)';
  name.maxLength = 30;
  name.addEventListener('change', () => store.update(x => { x.settings.name = name.value.trim(); }));
  goalCard.appendChild(field('Name', name));
  goalCard.appendChild(numberRow('Daily goal', 'minutes of focused study', 'set-goal', s.dailyGoalMin, 15, 1440));
  grid.appendChild(goalCard);

  // ---- Preferences ----
  const prefCard = el('div', 'card set-card');
  prefCard.appendChild(el('h2', null, 'Preferences'));
  prefCard.appendChild(Object.assign(el('p', 'set-sub'), { textContent: 'Sound plays a soft chime when a phase ends. Theme follows your system by default.' }));
  prefCard.appendChild(toggleRow('Sound', 'Chime at the end of each phase', 'set-sound', s.sound, v => store.update(x => { x.settings.sound = v; })));
  prefCard.appendChild(toggleRow('Browser notifications', 'Notify when a phase ends (permission required)', 'set-notif', s.notifications, v => {
    if (v && 'Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission().then(p => {
        store.update(x => { x.settings.notifications = p === 'granted'; });
        renderSettings();
        if (p !== 'granted') toast('Notifications were not allowed by the browser.', { timeoutMs: 4000 });
      });
      return;
    }
    store.update(x => { x.settings.notifications = v; });
  }));
  prefCard.appendChild(themeRow());
  grid.appendChild(prefCard);

  // ---- Data ----
  const dataCard = el('div', 'card set-card');
  dataCard.appendChild(el('h2', null, 'Your data'));
  const mins = store.state.sessions.reduce((a, x) => a + x.actualSec, 0) / 60;
  const sync0 = getSyncInfo();
  dataCard.appendChild(Object.assign(el('p', 'set-sub'), {
    textContent: sync0.user
      ? `${store.state.sessions.length} session${store.state.sessions.length === 1 ? '' : 's'} · ${fmtHM(mins)} focused · saved permanently in this browser AND synced to your private cloud space. The same data appears on any device where you sign in. Nothing is deleted when you close the tab.`
      : `${store.state.sessions.length} session${store.state.sessions.length === 1 ? '' : 's'} · ${fmtHM(mins)} focused · saved permanently in this browser on this device. Closing the tab never deletes it — it is only removed if you press "Erase everything" below or clear this site's browser data. Want it on your phone too? Sign in below to sync.`,
  }));
  const row1 = el('div', 'set-row');
  const exportInfo = el('div');
  exportInfo.appendChild(el('div', 'set-name', 'Backup'));
  exportInfo.appendChild(el('div', 'set-desc', 'Download everything as a JSON file.'));
  const exportBtn = el('button', 'btn btn-ghost', 'Export');
  exportBtn.addEventListener('click', doExport);
  row1.append(exportInfo, exportBtn);
  const row2 = el('div', 'set-row');
  const importInfo = el('div');
  importInfo.appendChild(el('div', 'set-name', 'Restore'));
  importInfo.appendChild(el('div', 'set-desc', 'Import a backup file. You confirm before anything is overwritten.'));
  const importBtn = el('button', 'btn btn-ghost', 'Import');
  importBtn.addEventListener('click', () => document.getElementById('import-file').click());
  row2.append(importInfo, importBtn);
  dataCard.append(row1, row2);
  grid.appendChild(dataCard);

  // ---- Sync across devices ----
  const syncCard = el('div', 'card set-card');
  syncCard.appendChild(el('h2', null, 'Sync across devices'));
  const info = getSyncInfo();
  if (info.user) {
    const when = info.lastSyncAt ? lastSyncLabel(info.lastSyncAt) : 'just now';
    const stateLabel = { syncing: 'Syncing…', synced: 'Up to date', offline: 'Offline — will sync when reconnected', error: 'Sync problem', signingIn: 'Syncing…', conflict: 'Sync paused — sign out below, then sign in again to choose which copy to keep' }[info.status] || 'Up to date';
    syncCard.appendChild(Object.assign(el('p', 'set-sub'), {
      textContent: `Signed in as ${info.user.email}. Your subjects, plans and sessions sync automatically to this account and appear on any device where you sign in. ${stateLabel} (last synced ${when}). Theme, sound and notification preferences stay on each device.`,
    }));
    const rowS = el('div', 'set-row');
    const soInfo = el('div');
    soInfo.appendChild(el('div', 'set-name', 'Sign out'));
    soInfo.appendChild(el('div', 'set-desc', 'Data already synced stays in your account; this browser keeps its local copy.'));
    const soBtn = el('button', 'btn btn-ghost', 'Sign out');
    soBtn.addEventListener('click', () => { signOut(); toast('Signed out. This browser keeps its local copy.', { timeoutMs: 4000 }); });
    rowS.append(soInfo, soBtn);
    syncCard.appendChild(rowS);
  } else {
    syncCard.appendChild(Object.assign(el('p', 'set-sub'), {
      textContent: info.configured
        ? 'Sign in with Google to keep the same subjects, plans and sessions on your laptop and phone. Only your study data syncs — theme, sound and notification preferences stay on this device.'
        : 'Sign in with Google to keep the same subjects, plans and sessions on your laptop and phone. Sync needs a one-time free setup — a Firebase web config in js/firebase-config.js.',
    }));
    const rowG = el('div', 'set-row');
    const gInfo = el('div');
    gInfo.appendChild(el('div', 'set-name', 'Google account'));
    gInfo.appendChild(el('div', 'set-desc', 'One tap sign-in. No password is shared with this app.'));
    const gBtn = el('button', 'btn btn-google');
    gBtn.innerHTML = '<svg viewBox="0 0 24 24" class="ic" aria-hidden="true"><path fill="#4285F4" d="M23.5 12.27c0-.85-.08-1.66-.22-2.45H12v4.64h6.45a5.52 5.52 0 0 1-2.39 3.62v3h3.87c2.26-2.09 3.57-5.16 3.57-8.81Z"/><path fill="#34A853" d="M12 24c3.24 0 5.96-1.07 7.93-2.91l-3.87-3c-1.07.72-2.44 1.15-4.06 1.15-3.12 0-5.77-2.11-6.71-4.95H1.29v3.1A12 12 0 0 0 12 24Z"/><path fill="#FBBC05" d="M5.29 14.29A7.2 7.2 0 0 1 4.93 12c0-.8.14-1.57.36-2.29v-3.1H1.29a12 12 0 0 0 0 10.78l4-3.1Z"/><path fill="#EA4335" d="M12 4.78c1.76 0 3.34.6 4.58 1.8l3.44-3.44A11.98 11.98 0 0 0 12 0 12 12 0 0 0 1.29 6.61l4 3.1c.94-2.84 3.6-4.93 6.71-4.93Z"/></svg><span>Sign in with Google</span>';
    gBtn.addEventListener('click', signIn);
    rowG.append(gInfo, gBtn);
    syncCard.appendChild(rowG);
  }
  grid.appendChild(syncCard);

  // ---- Danger zone ----
  const danger = el('div', 'card set-card danger-zone');
  danger.appendChild(el('h2', null, 'Danger zone'));
  danger.appendChild(Object.assign(el('p', 'set-sub'), { textContent: 'Wipe every subject, plan and session from this browser.' }));
  const row3 = el('div', 'set-row');
  const wipeInfo = el('div');
  wipeInfo.appendChild(el('div', 'set-name', 'Erase all data'));
  wipeInfo.appendChild(el('div', 'set-desc', 'There is no undo. Export a backup first if unsure.'));
  const wipeBtn = el('button', 'btn btn-danger', 'Erase everything');
  wipeBtn.addEventListener('click', confirmWipe);
  row3.append(wipeInfo, wipeBtn);
  danger.appendChild(row3);
  grid.appendChild(danger);

  root.appendChild(grid);
}

function numberRow(name, desc, id, value, min, max) {
  const row = el('div', 'set-row');
  const info = el('div');
  info.appendChild(el('div', 'set-name', name));
  info.appendChild(el('div', 'set-desc', desc));
  const input = el('input', 'input');
  input.id = id;
  input.type = 'number';
  input.min = min;
  input.max = max;
  input.value = value;
  input.addEventListener('change', () => {
    const v = Math.min(max, Math.max(min, parseInt(input.value, 10) || min));
    input.value = v;
    store.update(s => {
      if (id === 'set-focus') s.settings.focusMin = v;
      else if (id === 'set-short') s.settings.shortRestMin = v;
      else if (id === 'set-long') s.settings.longRestMin = v;
      else if (id === 'set-cycles') s.settings.cyclesBeforeLong = v;
      else if (id === 'set-goal') s.settings.dailyGoalMin = v;
    });
  });
  row.append(info, input);
  return row;
}

function toggleRow(name, desc, id, on, onChange) {
  const row = el('div', 'set-row');
  const info = el('div');
  info.appendChild(el('div', 'set-name', name));
  info.appendChild(el('div', 'set-desc', desc));
  const input = el('input');
  input.type = 'checkbox';
  input.className = 'switch';
  input.id = id;
  input.checked = on;
  const track = el('label', 'switch-track');
  track.htmlFor = id;
  input.addEventListener('change', () => onChange(input.checked));
  row.append(info, wrap(input, track));
  return row;
}

function wrap(a, b) {
  const d = el('div');
  d.append(a, b);
  return d;
}

function lastSyncLabel(ts) {
  const s = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (s < 10) return 'just now';
  if (s < 60) return s + 's ago';
  const m = Math.round(s / 60);
  if (m < 60) return m + ' min ago';
  const h = Math.round(m / 60);
  if (h < 24) return h + 'h ago';
  return Math.round(h / 24) + 'd ago';
}

function themeRow() {
  const row = el('div', 'set-row');
  const info = el('div');
  info.appendChild(el('div', 'set-name', 'Theme'));
  info.appendChild(el('div', 'set-desc', 'Dark, light, or follow the system.'));
  const seg = el('div', 'seg');
  const cur = store.state.settings.theme;
  for (const [val, label] of [['system', 'System'], ['dark', 'Dark'], ['light', 'Light']]) {
    const b = el('button', val === cur ? 'is-on' : '', label);
    b.type = 'button';
    b.addEventListener('click', () => {
      store.update(s => { s.settings.theme = val; });
      document.dispatchEvent(new CustomEvent('app:theme'));
      seg.querySelectorAll('button').forEach(x => x.classList.remove('is-on'));
      b.classList.add('is-on');
    });
    seg.appendChild(b);
  }
  row.append(info, seg);
  return row;
}

function doExport() {
  const blob = new Blob([exportJSON(store.state)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = el('a');
  a.href = url;
  a.download = 'study-matrix-backup-' + new Date().toISOString().slice(0, 10) + '.json';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  toast('Backup downloaded.', { timeoutMs: 3000 });
}

function onImportFile(e) {
  const file = e.target.files?.[0];
  e.target.value = '';
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    const result = parseImport(String(reader.result));
    if (!result.ok) {
      toast('Import rejected: ' + result.error, { timeoutMs: 6000 });
      return;
    }
    const inc = result.state;
    const inCounts = `${inc.subjects.length} subject${inc.subjects.length === 1 ? '' : 's'}, ${inc.topics.length} topic${inc.topics.length === 1 ? '' : 's'}, ${inc.sessions.length} session${inc.sessions.length === 1 ? '' : 's'}`;
    const cur = store.state;
    const curCounts = `${cur.subjects.length} subject${cur.subjects.length === 1 ? '' : 's'}, ${cur.topics.length} topic${cur.topics.length === 1 ? '' : 's'}, ${cur.sessions.length} session${cur.sessions.length === 1 ? '' : 's'}`;
    const empty = inc.subjects.length === 0 && inc.topics.length === 0 && inc.sessions.length === 0;

    const body = el('div');
    const p1 = el('p', 'modal-sub', `This backup file (${file.name}) contains ${inCounts}.`);
    const p2 = el('p', 'modal-sub', `Currently in this browser: ${curCounts}.`);
    body.append(p1, p2);
    if (empty) {
      const warn = el('p', 'modal-sub');
      warn.style.color = 'var(--amber)';
      warn.textContent = 'Warning: this backup contains no study data. "Replace everything" will erase all current records and leave you with an empty app.';
      body.appendChild(warn);
    }

    openModal({
      title: 'Import backup?',
      body,
      actions: [
        { label: 'Cancel', kind: 'primary' },
        { label: 'Merge into current data', onClick: () => {
          const merged = mergeInto(store.state, inc);
          store.replace(merged);
          toast(`Merged backup: now ${store.state.subjects.length} subjects, ${store.state.topics.length} topics, ${store.state.sessions.length} sessions.`, { timeoutMs: 5000 });
        } },
        { label: empty ? 'Replace with empty backup' : 'Replace everything', kind: 'danger', onClick: () => {
          store.replace(inc);
          toast(`Backup imported: ${store.state.subjects.length} subjects, ${store.state.topics.length} topics, ${store.state.sessions.length} sessions.`, { timeoutMs: 5000 });
        } },
      ],
    });
  };
  reader.readAsText(file);
}

function mergeInto(local, incoming) {
  const next = JSON.parse(JSON.stringify(local));
  const mergeById = (a, b) => {
    const m = new Map(a.map(x => [x.id, x]));
    for (const x of b) m.set(x.id, x);
    return [...m.values()];
  };
  next.subjects = mergeById(local.subjects, incoming.subjects);
  next.topics = mergeById(local.topics, incoming.topics);
  next.sessions = mergeById(local.sessions, incoming.sessions);
  const key = p => p.topicId + '|' + p.date;
  const planMap = new Map(local.plan.map(p => [key(p), p]));
  for (const p of incoming.plan) planMap.set(key(p), p);
  next.plan = [...planMap.values()];
  return next;
}

function confirmWipe() {
  const p = el('p', 'modal-sub');
  p.textContent = 'This erases all subjects, topics, plans and sessions stored in this browser. Consider exporting a backup first.';
  openModal({
    title: 'Erase everything?',
    body: p,
    actions: [
      { label: 'Cancel', kind: 'primary' },
      { label: 'Erase all data', kind: 'danger', onClick: () => {
        store.replace(blankState());
        toast('All data erased. Fresh start.', { timeoutMs: 3000 });
      } },
    ],
  });
}

// ---- First-run setup ----
export function maybeShowSetup() {
  if (store.state.settings.setupDone) return;
  const body = el('div');

  const hero = el('div', 'welcome-hero');
  hero.innerHTML = `<div class="brand-mark"><svg viewBox="0 0 32 32"><circle cx="11" cy="11" r="4" fill="#22d3ee"/><circle cx="21" cy="11" r="4" fill="none" stroke="#818cf8" stroke-width="2"/><circle cx="11" cy="21" r="4" fill="none" stroke="#c084fc" stroke-width="2"/><rect x="18.6" y="18.6" width="4.8" height="4.8" rx="1.4" fill="#34d399" transform="rotate(45 21 21)"/></svg></div>`;
  body.appendChild(hero);

  const name = el('input', 'input');
  name.id = 'setup-name';
  name.placeholder = 'What should we call you? (optional)';
  name.maxLength = 30;
  body.appendChild(field('Name', name));

  const row = el('div', 'field-row');
  const focusWrap = el('div', 'field');
  const focusLabel = el('label', 'field-label', 'Focus length');
  focusLabel.htmlFor = 'setup-focus';
  const focus = el('input', 'input');
  focus.id = 'setup-focus';
  focus.type = 'number';
  focus.min = 1; focus.max = 180;
  focus.value = store.state.settings.focusMin;
  focusWrap.append(focusLabel, focus);
  const goalWrap = el('div', 'field');
  const goalLabel = el('label', 'field-label', 'Daily goal (min)');
  goalLabel.htmlFor = 'setup-goal';
  const goal = el('input', 'input');
  goal.id = 'setup-goal';
  goal.type = 'number';
  goal.min = 15; goal.max = 1440;
  goal.value = store.state.settings.dailyGoalMin;
  goalWrap.append(goalLabel, goal);
  row.append(focusWrap, goalWrap);
  body.appendChild(row);

  const note = el('div', 'privacy-note');
  note.innerHTML = `<svg viewBox="0 0 24 24" class="ic"><path d="M12 3 5 6v5c0 4.5 3 8.2 7 10 4-1.8 7-5.5 7-10V6l-7-3Z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M9.5 12l2 2 3.5-4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg><span><strong>Private by design.</strong> Your data lives permanently in this browser and is never deleted on its own — nothing leaves your device unless you turn on Google sync in Settings to use it on your phone too.</span>`;
  body.appendChild(note);

  openModal({
    title: 'Welcome to Study Matrix',
    sub: 'Plan blocks on the week, run focus sessions, and watch the matrix fill itself in.',
    body,
    actions: [
      { label: 'Explore demo data', left: true, onClick: () => {
        store.update(s => { Object.assign(s, demoState()); });
      } },
      { label: 'Start fresh', kind: 'primary', onClick: () => {
        store.update(s => {
          s.settings.setupDone = true;
          s.settings.name = name.value.trim();
          s.settings.focusMin = Math.min(180, Math.max(1, parseInt(focus.value, 10) || 25));
          s.settings.dailyGoalMin = Math.min(1440, Math.max(15, parseInt(goal.value, 10) || 240));
        });
      } },
    ],
    onClose: () => {
      if (!store.state.settings.setupDone) store.update(s => { s.settings.setupDone = true; });
    },
  });
}
