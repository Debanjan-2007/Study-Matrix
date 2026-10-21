// store.js — persistence, schema, migrations, export/import. No DOM.

const STORAGE_KEY = 'study-matrix:v1';
export const SCHEMA_VERSION = 1;

export const SUBJECT_COLORS = [
  { id: 'cyan',    hex: '#22d3ee' },
  { id: 'blue',    hex: '#38bdf8' },
  { id: 'violet',  hex: '#a78bfa' },
  { id: 'indigo',  hex: '#818cf8' },
  { id: 'green',   hex: '#34d399' },
  { id: 'lime',    hex: '#a3e635' },
  { id: 'amber',   hex: '#fbbf24' },
  { id: 'orange',  hex: '#fb923c' },
  { id: 'rose',    hex: '#fb7185' },
  { id: 'pink',    hex: '#f472b6' },
];

export function colorHex(id) {
  return (SUBJECT_COLORS.find(c => c.id === id) || SUBJECT_COLORS[3]).hex;
}

export function uid(prefix) {
  return prefix + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export function defaultSettings() {
  return {
    focusMin: 25,
    shortRestMin: 5,
    longRestMin: 15,
    cyclesBeforeLong: 4,
    dailyGoalMin: 240,
    sound: true,
    notifications: false,
    theme: 'system',
    name: '',
    setupDone: false,
  };
}

export function blankState() {
  return {
    version: SCHEMA_VERSION,
    updatedAt: 0,
    settings: defaultSettings(),
    subjects: [],
    topics: [],
    plan: [],
    sessions: [],
    timer: { phase: 'focus', topicId: null, endsAt: null, pausedRemainingMs: null, cycle: 1, running: false },
  };
}

export function migrate(raw) {
  const state = blankState();
  if (!raw || typeof raw !== 'object') return state;
  state.version = SCHEMA_VERSION;
  if (typeof raw.updatedAt === 'number') state.updatedAt = raw.updatedAt;
  state.settings = { ...defaultSettings(), ...(raw.settings || {}) };
  state.subjects = Array.isArray(raw.subjects) ? raw.subjects : [];
  state.topics = Array.isArray(raw.topics) ? raw.topics : [];
  state.plan = Array.isArray(raw.plan) ? raw.plan : [];
  state.sessions = Array.isArray(raw.sessions) ? raw.sessions : [];
  state.timer = { ...state.timer, ...(raw.timer || {}) };
  return state;
}

export function validateState(raw) {
  if (!raw || typeof raw !== 'object') return { ok: false, error: 'Not a JSON object.' };
  if (typeof raw.version !== 'number') return { ok: false, error: 'Missing schema version.' };
  for (const key of ['settings', 'subjects', 'topics', 'plan', 'sessions', 'timer']) {
    if (raw[key] === undefined) return { ok: false, error: `Missing section "${key}".` };
  }
  if (!Array.isArray(raw.subjects) || !Array.isArray(raw.topics) ||
      !Array.isArray(raw.plan) || !Array.isArray(raw.sessions)) {
    return { ok: false, error: 'Sections subjects, topics, plan and sessions must be arrays.' };
  }
  return { ok: true };
}

function createStore() {
  let state = load();
  const listeners = new Set();

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return blankState();
      return migrate(JSON.parse(raw));
    } catch (err) {
      const s = blankState();
      s.storageError = String((err && err.message) || err);
      return s;
    }
  }

  function save() {
    try {
      state.updatedAt = Date.now();
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      delete state.storageError;
      return true;
    } catch (err) {
      state.storageError = String((err && err.message) || err);
      emit();
      return false;
    }
  }

  function emit() {
    for (const fn of listeners) fn(state);
  }

  return {
    get state() { return state; },
    save() { const ok = save(); emit(); return ok; },
    update(mutator) {
      mutator(state);
      save();
      emit();
    },
    replace(next) {
      state = migrate(next);
      save();
      emit();
    },
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
}

export const store = createStore();

// ---------- domain helpers (used by UI + tests) ----------

export function getSubject(state, id) { return state.subjects.find(s => s.id === id) || null; }
export function getTopic(state, id) { return state.topics.find(t => t.id === id) || null; }

export function activeTopics(state) {
  return state.topics.filter(t => !t.archived && !t.done);
}

export function planFor(state, topicId, date) {
  const e = state.plan.find(p => p.topicId === topicId && p.date === date);
  return e ? e.blocks : 0;
}

export function setPlan(state, topicId, date, blocks) {
  const i = state.plan.findIndex(p => p.topicId === topicId && p.date === date);
  if (blocks <= 0) {
    if (i >= 0) state.plan.splice(i, 1);
  } else if (i >= 0) {
    state.plan[i].blocks = blocks;
  } else {
    state.plan.push({ topicId, date, blocks });
  }
}

export function sessionsFor(state, topicId, date) {
  return state.sessions.filter(s => s.topicId === topicId && s.date === date);
}

export function exportJSON(state) {
  return JSON.stringify(state, null, 2);
}

export function parseImport(text) {
  let raw;
  try { raw = JSON.parse(text); }
  catch { return { ok: false, error: 'File is not valid JSON.' }; }
  const check = validateState(raw);
  if (!check.ok) return check;
  return { ok: true, state: migrate(raw) };
}

// Demo data so first-time users (and reviewers) can see the app alive.
export function demoState() {
  const s = blankState();
  s.settings.setupDone = true;
  s.settings.name = 'Alex';
  const subj = [
    { id: 's_math', name: 'Mathematics', color: 'blue' },
    { id: 's_phys', name: 'Physics', color: 'violet' },
    { id: 's_cs', name: 'Computer Science', color: 'green' },
  ];
  s.subjects = subj;
  s.topics = [
    { id: 't_calc', subjectId: 's_math', title: 'Calculus — Integrals', estBlocks: 8, dueDate: offsetDate(6), done: false, archived: false },
    { id: 't_la', subjectId: 's_math', title: 'Linear Algebra', estBlocks: 6, dueDate: null, done: false, archived: false },
    { id: 't_em', subjectId: 's_phys', title: 'Electromagnetism', estBlocks: 10, dueDate: offsetDate(-1), done: false, archived: false },
    { id: 't_td', subjectId: 's_phys', title: 'Thermodynamics', estBlocks: 5, dueDate: null, done: false, archived: false },
    { id: 't_os', subjectId: 's_cs', title: 'Operating Systems', estBlocks: 12, dueDate: offsetDate(9), done: false, archived: false },
    { id: 't_db', subjectId: 's_cs', title: 'Databases', estBlocks: 4, dueDate: null, done: true, archived: false },
  ];
  const today = new Date();
  const plan = [
    ['t_calc', 0, 2], ['t_calc', 2, 1], ['t_calc', 4, 2],
    ['t_la', 1, 1], ['t_la', 3, 2],
    ['t_em', 0, 1], ['t_em', 2, 2], ['t_em', 3, 1],
    ['t_os', 1, 2], ['t_os', 4, 3], ['t_os', 6, 2],
  ];
  s.plan = plan.map(([topicId, dayIdx, blocks]) => ({ topicId, date: weekDayKey(today, dayIdx), blocks }));
  const mins = [[0, 't_calc', 25], [0, 't_em', 25], [1, 't_os', 25], [1, 't_la', 25], [2, 't_calc', 50], [3, 't_os', 25], [3, 't_em', 25], [4, 't_calc', 25], [5, 't_os', 25]];
  s.sessions = mins.map(([dayIdx, topicId, min], i) => ({
    id: 'x_demo_' + i,
    topicId,
    date: weekDayKey(today, dayIdx),
    startedAt: new Date(weekDayKey(today, dayIdx) + 'T09:30:00').toISOString(),
    plannedSec: 1500,
    actualSec: min * 60,
  }));
  return s;
}

function pad(n) { return String(n).padStart(2, '0'); }
export function dateKeyLocal(d) {
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
}
function addDays(d, n) {
  const c = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  c.setDate(c.getDate() + n);
  return c;
}
function weekDayKey(anchor, dayIdx) {
  // dayIdx 0 = Monday of anchor's week
  const dow = (anchor.getDay() + 6) % 7; // Monday = 0
  return dateKeyLocal(addDays(anchor, -dow + dayIdx));
}
function offsetDate(n) {
  return dateKeyLocal(addDays(new Date(), n));
}
