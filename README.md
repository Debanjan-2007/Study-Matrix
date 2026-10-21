# Study Matrix

A beautiful, no-frills Pomodoro study planner. Plan your week as a matrix of subjects and topics, then work through it one focused session at a time — all inside your browser, with your data staying on your device.

Built with pure HTML, CSS, and vanilla JavaScript (ES modules). No frameworks, no build step, no backend.

## How the Pomodoro Technique works

The Pomodoro Technique is a time-management method developed by Francesco Cirillo. It works like this:

1. **Pick a task** and work on it with full focus for a fixed block of time — traditionally **25 minutes** (one "Pomodoro").
2. **Take a short break** — about **5 minutes** — when the timer rings. Stand up, stretch, look away from the screen.
3. **Repeat.** After every **4 focus sessions**, take a longer break — about **15–30 minutes** — to recharge properly.

Why it works:

- **Focus by deadline.** A visible countdown turns "study for hours" into "study for 25 minutes," which is much easier to start.
- **Breaks prevent burnout.** Regular rest keeps your concentration high across long study days.
- **Sessions become measurable.** Each finished block is a unit of real work, so you can estimate tasks ("this chapter ≈ 2 blocks") and track real progress.

Study Matrix follows this cycle automatically: focus → short rest → focus → … → long rest after the fourth session.

## Features

### Planner (weekly matrix)
- Organize study material as **subjects → topics**, each with an estimated number of blocks.
- Plan your week on a **Monday–Sunday matrix**: click any cell to set how many blocks to do that day.
- At a glance you can see what was **planned** (outlined dots), what is **done** (filled dots), and where you went **over plan** (rotated-square dots).
- **Per-topic progress bars**: a solid segment shows blocks completed (all time) against your estimate, and a translucent segment layers this week's plan on top — so you can see where you'll end up by Sunday. An amber `+` warns when you're over-committed.
- Overdue topics are flagged automatically.

### Focus timer
- Classic Pomodoro cycle with **25 min focus / 5 min short rest / 15 min long rest after 4 sessions** (all durations adjustable in Settings).
- **Auto-logging:** finishing a focus block logs a study session to the right topic and day automatically, with a 10-second **undo** window.
- Pause, resume, reset, or skip a rest at any time. A progress ring, phase indicator, and cycle dots keep you oriented.
- Sound chime and desktop **notification** when a phase ends (both optional).
- Keyboard shortcut: **Space** to start/pause.

### Progress
- Daily goal ring, **streak counter** (consecutive days with at least one session), and total focused time.
- Per-subject breakdown bars, a 7-day activity chart, and a recent-sessions history.

### Your data
- Everything is stored **locally in your browser** (localStorage). Closing the tab or restarting your computer never deletes it — data is only removed if you erase it from Settings or clear the site's browser data.
- **Export / Import** a JSON backup to move your data between browsers or devices.
- **Sync across devices (optional):** sign in with Google and your subjects, plans and sessions sync automatically between your laptop and phone (see "Sync setup" below). Only your study data syncs — theme, sound and notification preferences stay on each device.

### Design
- Dark glassmorphism UI with light mode and system theme detection.
- Fully responsive — works on desktop and mobile phones.

## Sync setup (one-time, ~10 minutes)

The sync feature uses Google's free [Firebase](https://firebase.google.com) (authentication + database). The app works fully without it — this is only needed if you want phone ↔ laptop sync.

1. Go to [console.firebase.google.com](https://console.firebase.google.com) and sign in with the Google account you'll use in the app.
2. Click **Add project** → give it a name (e.g. `study-matrix`) → continue (you can disable Analytics).
3. In the project, open **Build → Authentication → Sign-in method**, enable **Google**, and pick a support email.
4. Open **Build → Firestore Database → Create database** → choose **Production mode** and a location near you.
5. In **Firestore → Rules**, publish these rules (each user can only read/write their own data), then **Publish**:
   ```
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       match /users/{uid} {
         allow read, write: if request.auth != null && request.auth.uid == uid;
       }
     }
   }
   ```
6. Go to **Project settings → Your apps → Web app** (`</>` icon), register the app (nickname e.g. `study-matrix-web`), and copy the config values it shows.
7. Paste the four values into `js/firebase-config.js` (`apiKey`, `authDomain`, `projectId`, `appId`).
8. **If you host on GitHub Pages:** in **Authentication → Settings → Authorized domains**, add your Pages domain (e.g. `debanjan-2007.github.io`).

The Firebase keys in `js/firebase-config.js` identify your project but are **not secrets** — access to data is protected by the Firestore rules above.

## Run it locally

Because the app uses ES modules, it needs to be served over HTTP (opening `index.html` directly with `file://` won't work):

```bash
python -m http.server 8137
# then open http://127.0.0.1:8137/
```

Any static file server works the same way.

## Tests

Timer logic, date handling, week bounds, streaks, and stats are covered by a dependency-free node test suite:

```bash
node tests/run-tests.mjs
```

## Tech

- Vanilla HTML / CSS / JavaScript (ES modules) — zero runtime dependencies
- localStorage for persistence, JSON for backups
- WebAudio for chimes, Notification API for alerts
- Optional sync: Firebase Auth (Google sign-in) + Firestore, loaded from Google's CDN only when you sign in — the app makes no network calls otherwise
