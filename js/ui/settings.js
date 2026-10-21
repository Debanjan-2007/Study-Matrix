// ui/settings.js — durations, goal, sound, theme, export/import, reset.

import { store, exportJSON, parseImport, blankState, demoState } from '../store.js';
import { fmtHM } from '../stats.js';
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
  dataCard.appendChild(Object.assign(el('p', 'set-sub'), {
    textContent: `${store.state.sessions.length} session${store.state.sessions.length === 1 ? '' : 's'} · ${fmtHM(mins)} focused · stored only in this browser's localStorage.`,
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
    const stats = `${result.state.sessions.length} sessions, ${result.state.subjects.length} subjects, ${result.state.topics.length} topics`;
    const p = el('p', 'modal-sub');
    p.textContent = `Replace everything in this browser with the backup (${stats})? Current data will be lost unless you export it first.`;
    openModal({
      title: 'Import backup?',
      body: p,
      actions: [
        { label: 'Cancel', kind: 'primary' },
        { label: 'Import & replace', kind: 'danger', onClick: () => {
          store.replace(result.state);
          toast('Backup imported.', { timeoutMs: 3000 });
        } },
      ],
    });
  };
  reader.readAsText(file);
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
  note.innerHTML = `<svg viewBox="0 0 24 24" class="ic"><path d="M12 3 5 6v5c0 4.5 3 8.2 7 10 4-1.8 7-5.5 7-10V6l-7-3Z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M9.5 12l2 2 3.5-4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg><span><strong>Private by design.</strong> Everything stays in this browser's localStorage — no account, no cloud, no tracking, no network calls after this page loads.</span>`;
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
