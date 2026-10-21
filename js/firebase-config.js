// firebase-config.js — your Firebase web app credentials.
// Get them free at https://console.firebase.google.com (see README "Sync setup").
// These keys identify your project to Firebase; they are NOT secrets — access is
// protected by Firestore security rules, which is why the rules step matters.

export const firebaseConfig = {
  apiKey: "AIzaSyDqVSq-JNhysAYc9asIP1uR1UzW_oHCIAE",
  authDomain: "study-matrix-97d04.firebaseapp.com",
  projectId: "study-matrix-97d04",
  storageBucket: "study-matrix-97d04.firebasestorage.app",
  messagingSenderId: "6248398774",
  appId: "1:6248398774:web:76936ceee0db57b3900b17",
};

export const syncConfigured =
  typeof firebaseConfig.apiKey === 'string' &&
  firebaseConfig.apiKey.length > 20 &&
  !firebaseConfig.apiKey.includes('PASTE');
