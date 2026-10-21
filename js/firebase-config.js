// firebase-config.js — your Firebase web app credentials.
// Get them free at https://console.firebase.google.com (see README "Sync setup").
// These keys identify your project to Firebase; they are NOT secrets — access is
// protected by Firestore security rules, which is why the rules step matters.

export const firebaseConfig = {
  apiKey: "PASTE_YOURS",
  authDomain: "PASTE_YOURS",
  projectId: "PASTE_YOURS",
  appId: "PASTE_YOURS",
};

export const syncConfigured =
  typeof firebaseConfig.apiKey === 'string' &&
  firebaseConfig.apiKey.length > 20 &&
  !firebaseConfig.apiKey.includes('PASTE');
