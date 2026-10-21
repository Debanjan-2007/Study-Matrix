// sync.js — optional Google-sign-in cloud sync (Firebase Auth + Firestore).
// The app is fully local until the user signs in; Firebase code is loaded from
// Google's CDN only at sign-in time, so nothing touches the network otherwise.

import { store, migrate } from './store.js';
import { firebaseConfig, syncConfigured } from './firebase-config.js';
import { openModal, toast, el } from './ui/common.js';

const CDN = 'https://www.gstatic.com/firebasejs/10.12.2';
const SYNC_FLAG = 'study-matrix:sync-on';
const PORTABLE_SETTINGS = ['focusMin', 'shortRestMin', 'longRestMin', 'cyclesBeforeLong', 'dailyGoalMin', 'name', 'setupDone'];

let fb = null;                  // loaded firebase modules + instances
let user = null;                // firebase user
let docRef = null;              // firestore users/{uid} doc
let unsubSnapshot = null;
let status = syncConfigured ? 'signedOut' : 'off';
let lastSyncAt = 0;             // last successful push/pull (Date.now())
let lastSeenRemoteAt = 0;       // version the cloud currently holds (best known)
let suppressPushUpTo = 0;       // ignore echoes of a remote copy we just applied
let pushTimer = null;
let pushing = false;
let initialSyncDone = false;
let pendingChoice = false;      // user is deciding which copy to keep
let pendingRemote = null;       // latest cloud copy seen while that dialog is open
let syncPaused = false;         // conflict left unresolved — never push over the cloud
let lastSyncedFingerprint = ''; // portable data as last pushed or pulled
let lastError = '';

export function initSync() {
  store.subscribe(() => schedulePush());
  window.addEventListener('online', () => { if (user) { setStatus('syncing'); pushNow(); } });
  window.addEventListener('offline', () => { if (user) setStatus('offline'); });
  // Returning after redirect sign-in, or revisiting signed in: restore the session.
  if (syncConfigured && localStorage.getItem(SYNC_FLAG) === '1') restoreSession();
}

let fbPromise = null;
let authWatched = false;

function watchAuth() {
  if (authWatched) return;
  authWatched = true;
  fb.onAuthStateChanged(fb.authInst, u => {
    if (u) attach(u);
    else if (status !== 'signingIn') detach();
  });
}

async function restoreSession() {
  try {
    fb = await loadFirebase();
    watchAuth();
  } catch {
    // CDN unreachable (offline) — stay local-only until next visit.
  }
}

export function getSyncInfo() {
  return {
    configured: syncConfigured,
    status,
    error: lastError,
    lastSyncAt,
    user: user ? { name: user.displayName, email: user.email, photo: user.photoURL } : null,
  };
}

export async function signIn() {
  if (!syncConfigured) {
    toast('Cloud sync is not set up yet — paste your Firebase config into js/firebase-config.js.', { timeoutMs: 7000 });
    return;
  }
  if (user || status === 'signingIn') return;
  setStatus('signingIn');
  try {
    fb = await loadFirebase();
    const provider = new fb.GoogleAuthProvider();
    localStorage.setItem(SYNC_FLAG, '1');
    watchAuth();
    await fb.signInWithPopup(fb.authInst, provider);
  } catch (err) {
    const code = String(err && err.code || '');
    if (code.includes('popup-blocked')) {
      // Brave/strict blockers kill popups — use same-tab redirect instead.
      toast('Popup blocked — opening Google sign-in in this tab instead…', { timeoutMs: 5000 });
      try {
        await fb.signInWithRedirect(fb.authInst, provider);
        return; // page navigates away to Google
      } catch (err2) {
        toast('Could not start sign-in: ' + friendly(err2), { timeoutMs: 6000 });
        localStorage.removeItem(SYNC_FLAG);
        setStatus('signedOut');
        return;
      }
    }
    if (code.includes('popup-closed')) {
      toast('Sign-in window was closed before finishing.', { timeoutMs: 4000 });
    } else if (code.includes('unauthorized-domain')) {
      toast('This web address is not authorized for sign-in — add it in Firebase → Authentication → Settings → Authorized domains.', { timeoutMs: 8000 });
    } else {
      toast('Sign-in failed: ' + friendly(err), { timeoutMs: 6000 });
    }
    localStorage.removeItem(SYNC_FLAG);
    setStatus('signedOut');
  }
}

export async function signOut() {
  if (fb && user) {
    try { await fb.signOut(fb.authInst); } catch { /* already out */ }
  }
  detach();
}

// ---------- internals ----------

function setStatus(next) {
  status = next;
  document.dispatchEvent(new CustomEvent('app:sync'));
}

function friendly(err) {
  return String((err && err.message) || err).replace(/^Firebase:\s*/i, '');
}

function loadFirebase() {
  if (!fbPromise) {
    fbPromise = Promise.all([
      import(`${CDN}/firebase-app.js`),
      import(`${CDN}/firebase-auth.js`),
      import(`${CDN}/firebase-firestore.js`),
    ]).then(([app, auth, firestore]) => {
      const application = app.initializeApp(firebaseConfig);
      return {
        doc: firestore.doc, getDoc: firestore.getDoc, setDoc: firestore.setDoc,
        onSnapshot: firestore.onSnapshot,
        GoogleAuthProvider: auth.GoogleAuthProvider,
        signInWithPopup: auth.signInWithPopup, signInWithRedirect: auth.signInWithRedirect,
        signOut: auth.signOut,
        onAuthStateChanged: auth.onAuthStateChanged,
        authInst: auth.getAuth(application),
        db: firestore.getFirestore(application),
      };
    });
  }
  return fbPromise;
}

function portableState(state) {
  return {
    version: state.version,
    updatedAt: state.updatedAt,
    settings: Object.fromEntries(PORTABLE_SETTINGS.map(k => [k, state.settings[k]])),
    subjects: state.subjects,
    topics: state.topics,
    plan: state.plan,
    sessions: state.sessions,
  };
}

function applyRemote(payload) {
  const clean = migrate(payload);
  store.update(local => {
    local.subjects = clean.subjects;
    local.topics = clean.topics;
    local.plan = clean.plan;
    local.sessions = clean.sessions;
    for (const k of PORTABLE_SETTINGS) local.settings[k] = clean.settings[k];
  });
  suppressPushUpTo = store.state.updatedAt;
  lastSyncedFingerprint = fingerprint(store.state);
  lastSeenRemoteAt = Math.max(lastSeenRemoteAt, clean.updatedAt || 0);
}

function attach(u) {
  user = u;
  localStorage.setItem(SYNC_FLAG, '1');
  lastError = '';
  suppressPushUpTo = 0;
  pendingChoice = false;
  pendingRemote = null;
  syncPaused = false;
  lastSyncedFingerprint = '';
  setStatus('syncing');
  docRef = fb.doc(fb.db, 'users', u.uid);
  unsubSnapshot = fb.onSnapshot(docRef,
    snap => onRemote(snap),
    err => { lastError = friendly(err); setStatus('error'); });
}

function detach() {
  if (unsubSnapshot) { unsubSnapshot(); unsubSnapshot = null; }
  user = null;
  docRef = null;
  initialSyncDone = false;
  lastSeenRemoteAt = 0;
  suppressPushUpTo = 0;
  pendingChoice = false;
  pendingRemote = null;
  syncPaused = false;
  lastSyncedFingerprint = '';
  localStorage.removeItem(SYNC_FLAG);
  setStatus(syncConfigured ? 'signedOut' : 'off');
}

function onRemote(snap) {
  if (!user) return;
  if (!snap.exists()) {
    // First sign-in for this account: nothing in the cloud yet.
    initialSyncDone = true;
    lastSeenRemoteAt = 0;
    lastSyncAt = Date.now();
    if (hasData(store.state)) pushNow(true);
    else {
      lastSyncedFingerprint = fingerprint(store.state);
      setStatus('synced');
    }
    return;
  }
  const remote = snap.data();
  if (!remote || !remote.payload) return;
  const remoteAt = typeof remote.updatedAt === 'number' ? remote.updatedAt : 0;

  if (!initialSyncDone) {
    initialSyncDone = true;
    lastSeenRemoteAt = remoteAt;
    lastSyncAt = Date.now();
    const localHas = hasData(store.state);
    const cloudHas = hasData(remote.payload);
    if (!localHas) {
      // This device has nothing worth keeping — always adopt the cloud copy.
      if (cloudHas) {
        applyRemote(remote.payload);
        toast('Loaded your saved data from the cloud.', { timeoutMs: 4000 });
      } else {
        lastSyncedFingerprint = fingerprint(store.state);
      }
      setStatus('synced');
    } else if (!cloudHas) {
      // Cloud copy is empty — upload this device's data.
      pushNow(true);
    } else if (store.state.updatedAt === remoteAt || sameContent(store.state, remote.payload)) {
      lastSyncedFingerprint = fingerprint(store.state);
      setStatus('synced'); // same data, only timestamps differ
    } else {
      askWhichToKeep(remote, remoteAt); // both have data — never overwrite silently
    }
    return;
  }

  if (syncPaused) return;
  if (pendingChoice) {
    // Keep the dialog honest if another device writes while it is open.
    if (remoteAt > lastSeenRemoteAt) {
      lastSeenRemoteAt = remoteAt;
      pendingRemote = { payload: remote.payload, at: remoteAt };
    }
    return;
  }
  if (remoteAt > lastSeenRemoteAt) {
    lastSeenRemoteAt = remoteAt;
    lastSyncAt = Date.now();
    if (fingerprint(store.state) === lastSyncedFingerprint) {
      applyRemote(remote.payload);
      toast('Synced from your other device.', { timeoutMs: 3000 });
      setStatus('synced');
    } else {
      askWhichToKeep(remote, remoteAt);
    }
  }
}

function hasData(state) {
  return (state.subjects?.length || 0) + (state.topics?.length || 0) + (state.sessions?.length || 0) > 0;
}

function fingerprint(state) {
  return JSON.stringify(canonical({
    settings: PORTABLE_SETTINGS.map(k => state.settings?.[k] ?? null),
    subjects: state.subjects, topics: state.topics, plan: state.plan, sessions: state.sessions,
  }));
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map(k => [k, canonical(value[k])]));
  }
  return value;
}

function sameContent(a, b) {
  return fingerprint(a) === fingerprint(b);
}

function countLabel(state) {
  const s = state.subjects?.length || 0;
  const t = state.topics?.length || 0;
  const b = state.plan?.length || 0;
  const x = state.sessions?.length || 0;
  return `${s} subject${s === 1 ? '' : 's'}, ${t} topic${t === 1 ? '' : 's'}, ` +
    `${b} planned block${b === 1 ? '' : 's'}, ${x} session${x === 1 ? '' : 's'}`;
}

function mergeCopies(local, incoming) {
  const remoteNewer = (incoming.updatedAt || 0) > (local.updatedAt || 0);
  const newer = remoteNewer ? incoming : local;
  const older = remoteNewer ? local : incoming;
  const mergeById = (a, b) => {
    const map = new Map();
    for (const item of b || []) map.set(item.id, item);
    for (const item of a || []) map.set(item.id, item);
    return [...map.values()];
  };
  const plan = new Map();
  for (const p of older.plan || []) plan.set(p.topicId + '|' + p.date, p.blocks);
  for (const p of newer.plan || []) plan.set(p.topicId + '|' + p.date, p.blocks);
  return {
    subjects: mergeById(newer.subjects, older.subjects),
    topics: mergeById(newer.topics, older.topics),
    sessions: mergeById(newer.sessions, older.sessions),
    plan: [...plan.entries()].map(([key, blocks]) => {
      const i = key.indexOf('|');
      return { topicId: key.slice(0, i), date: key.slice(i + 1), blocks };
    }),
    settings: newer.settings,
  };
}

function applyMerged(remotePayload, remoteAt) {
  const merged = mergeCopies(store.state, migrate(remotePayload));
  store.update(local => {
    local.subjects = merged.subjects;
    local.topics = merged.topics;
    local.plan = merged.plan;
    local.sessions = merged.sessions;
    for (const k of PORTABLE_SETTINGS) local.settings[k] = merged.settings[k];
  });
  suppressPushUpTo = 0;
  lastSyncedFingerprint = '';
  lastSeenRemoteAt = Math.max(lastSeenRemoteAt, remoteAt || 0);
  pushNow(true);
}

function timeLabel(ts) {
  if (!ts) return 'never';
  return new Date(ts).toLocaleString();
}

function askWhichToKeep(remote, remoteAt) {
  const local = store.state;
  pendingChoice = true;
  pendingRemote = { payload: remote.payload, at: remoteAt };
  const body = el('div');
  body.appendChild(el('p', 'modal-sub', `Cloud copy: ${countLabel(remote.payload)} — last updated ${timeLabel(remoteAt)}.`));
  body.appendChild(el('p', 'modal-sub', `This device: ${countLabel(local)} — last updated ${timeLabel(local.updatedAt)}.`));
  body.appendChild(el('p', 'modal-sub', 'The totals can match while details differ (planned blocks, daily goal, name). This dialog appears on every visit until the two copies are resolved. Keep both to combine them safely, or pick one to replace the other.'));
  openModal({
    title: 'Which data should this device use?',
    body,
    onClose: () => {
      if (!pendingChoice) return;
      pendingChoice = false;
      pendingRemote = null;
      syncPaused = true;
      setStatus('conflict');
      toast('Sync is paused. Sign out and sign in again to choose which copy to keep.', { timeoutMs: 8000 });
    },
    actions: [
      { label: 'Keep both (recommended)', kind: 'primary', onClick: () => {
        const chosen = pendingRemote || { payload: remote.payload, at: remoteAt };
        pendingChoice = false;
        pendingRemote = null;
        syncPaused = false;
        applyMerged(chosen.payload, chosen.at);
        setStatus('synced');
        toast('Combined both copies — nothing was deleted.', { timeoutMs: 5000 });
      } },
      { label: 'Use cloud copy', onClick: () => {
        const chosen = pendingRemote || { payload: remote.payload, at: remoteAt };
        pendingChoice = false;
        pendingRemote = null;
        syncPaused = false;
        applyRemote(chosen.payload);
        lastSeenRemoteAt = chosen.at;
        setStatus('synced');
        toast('This device now uses your cloud data.', { timeoutMs: 4000 });
      } },
      { label: 'Upload this device’s data', onClick: () => {
        pendingChoice = false;
        pendingRemote = null;
        syncPaused = false;
        store.update(() => {}); // fresh updatedAt so the chosen copy wins elsewhere
        pushNow(true);
        setStatus('synced');
        toast('This device’s data replaced the cloud copy.', { timeoutMs: 4000 });
      } },
    ],
  });
}

function schedulePush() {
  if (!user || pendingChoice || syncPaused) return;
  clearTimeout(pushTimer);
  pushTimer = setTimeout(() => pushNow(), 1200);
}

async function pushNow(force) {
  if (!user || !docRef || pushing || pendingChoice || syncPaused) return;
  if (!force && !initialSyncDone) return;
  const state = store.state;
  if (suppressPushUpTo && state.updatedAt <= suppressPushUpTo) {
    suppressPushUpTo = 0;
    return;
  }
  const sent = fingerprint(state);
  if (!force && (sent === lastSyncedFingerprint || state.updatedAt <= lastSeenRemoteAt)) return;
  const sentAt = state.updatedAt;
  pushing = true;
  try {
    await fb.setDoc(docRef, { updatedAt: sentAt, payload: portableState(state) });
    lastSeenRemoteAt = sentAt;
    lastSyncedFingerprint = sent;
    lastSyncAt = Date.now();
    lastError = '';
    setStatus(navigator.onLine ? 'synced' : 'offline');
  } catch (err) {
    const message = friendly(err);
    if (message !== lastError) toast('Cloud sync problem: ' + message, { timeoutMs: 7000 });
    lastError = message;
    setStatus(navigator.onLine ? 'error' : 'offline');
  } finally {
    pushing = false;
  }
}
