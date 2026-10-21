// sync.js — optional Google-sign-in cloud sync (Firebase Auth + Firestore).
// The app is fully local until the user signs in; Firebase code is loaded from
// Google's CDN only at sign-in time, so nothing touches the network otherwise.

import { store, migrate } from './store.js';
import { firebaseConfig, syncConfigured } from './firebase-config.js';
import { openModal, toast, el } from './ui/common.js';

const CDN = 'https://www.gstatic.com/firebasejs/10.12.2';
const PORTABLE_SETTINGS = ['focusMin', 'shortRestMin', 'longRestMin', 'cyclesBeforeLong', 'dailyGoalMin', 'name', 'setupDone'];

let fb = null;                  // loaded firebase modules + instances
let user = null;                // firebase user
let docRef = null;              // firestore users/{uid} doc
let unsubSnapshot = null;
let status = syncConfigured ? 'signedOut' : 'off';
let lastSyncAt = 0;             // last successful push/pull (Date.now())
let lastSeenRemoteAt = 0;       // version the cloud currently holds (best known)
let suppressNextPush = false;   // skip echo push right after applying remote
let pushTimer = null;
let pushing = false;
let initialSyncDone = false;
let lastError = '';

export function initSync() {
  store.subscribe(() => schedulePush());
  window.addEventListener('online', () => { if (user) { setStatus('syncing'); pushNow(); } });
  window.addEventListener('offline', () => { if (user) setStatus('offline'); });
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
    fb.onAuthStateChanged(fb.authInst, u => { u ? attach(u) : detach(); });
    const provider = new fb.GoogleAuthProvider();
    await fb.signInWithPopup(fb.authInst, provider);
  } catch (err) {
    if (String(err && err.code).includes('popup-closed')) {
      toast('Sign-in window was closed before finishing.', { timeoutMs: 4000 });
    } else if (String(err && err.code).includes('popup-blocked') || String(err && err.code).includes('unauthorized-domain')) {
      toast('The browser blocked the sign-in popup — allow popups for this site.', { timeoutMs: 6000 });
    } else {
      toast('Sign-in failed: ' + friendly(err), { timeoutMs: 6000 });
    }
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

let fbPromise = null;
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
        signInWithPopup: auth.signInWithPopup, signOut: auth.signOut,
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

function isFreshDevice(state) {
  return !state.settings.setupDone && state.subjects.length === 0 &&
    state.topics.length === 0 && state.sessions.length === 0;
}

function applyRemote(payload) {
  const clean = migrate(payload);
  suppressNextPush = true;
  store.update(local => {
    local.subjects = clean.subjects;
    local.topics = clean.topics;
    local.plan = clean.plan;
    local.sessions = clean.sessions;
    for (const k of PORTABLE_SETTINGS) local.settings[k] = clean.settings[k];
  });
}

function attach(u) {
  user = u;
  lastError = '';
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
  setStatus(syncConfigured ? 'signedOut' : 'off');
}

function onRemote(snap) {
  if (!user) return;
  if (!snap.exists()) {
    // First sign-in from this account: cloud is empty, upload what we have.
    lastSeenRemoteAt = 0;
    pushNow(true);
    initialSyncDone = true;
    return;
  }
  const remote = snap.data();
  if (!remote || !remote.payload) return;
  const remoteAt = typeof remote.updatedAt === 'number' ? remote.updatedAt : 0;

  if (!initialSyncDone) {
    initialSyncDone = true;
    lastSeenRemoteAt = remoteAt;
    lastSyncAt = Date.now();
    if (isFreshDevice(store.state)) {
      applyRemote(remote.payload); // new device: adopt the cloud copy wholesale
      setStatus('synced');
    } else if (store.state.updatedAt > remoteAt) {
      pushNow(true); // this device is ahead (e.g. used offline since cloud write)
      setStatus('synced');
    } else {
      setStatus('synced'); // identical or cloud is newer; snapshot flow will apply
    }
    return;
  }

  if (remoteAt > lastSeenRemoteAt) {
    lastSeenRemoteAt = remoteAt;
    lastSyncAt = Date.now();
    if (remoteAt > store.state.updatedAt) {
      applyRemote(remote.payload);
      toast('Synced from your other device.', { timeoutMs: 3000 });
    }
    setStatus(navigator.onLine ? 'synced' : 'offline');
  }
}

function schedulePush() {
  if (!user) return;
  clearTimeout(pushTimer);
  pushTimer = setTimeout(() => pushNow(), 1200);
}

async function pushNow(force) {
  if (!user || !docRef || pushing) return;
  if (suppressNextPush) { suppressNextPush = false; return; }
  const state = store.state;
  if (!force && state.updatedAt <= lastSeenRemoteAt) return;
  pushing = true;
  try {
    await fb.setDoc(docRef, { updatedAt: state.updatedAt, payload: portableState(state) });
    lastSeenRemoteAt = state.updatedAt;
    lastSyncAt = Date.now();
    lastError = '';
    setStatus(navigator.onLine ? 'synced' : 'offline');
  } catch (err) {
    lastError = friendly(err);
    setStatus(navigator.onLine ? 'error' : 'offline');
  } finally {
    pushing = false;
  }
}
