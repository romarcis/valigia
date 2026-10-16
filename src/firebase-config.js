// Firebase web config (Project settings > Your apps > Web app). These values are public by design:
// access is enforced by Firestore security rules, not by keeping them secret.
// Leave apiKey empty to run without accounts (guest only).
export default {
  apiKey: 'AIzaSyDF-qMTQIvXMAKvXCIF-YbEED4qJPD_bO8',
  authDomain: 'valigia-e78f7.firebaseapp.com',
  projectId: 'valigia-e78f7',
  storageBucket: 'valigia-e78f7.firebasestorage.app',
  messagingSenderId: '352031568640',
  appId: '1:352031568640:web:e1be073d56616bb98179e5',
}

// Google sign-in on Windows: OAuth client of type "Desktop app" in the same Google Cloud project.
// Google documents that an installed app's client secret is not confidential (PKCE protects the flow).
// Read from .env.local (not committed): VITE_GOOGLE_DESKTOP_ID / VITE_GOOGLE_DESKTOP_SECRET.
export const googleDesktop = {
  clientId: import.meta.env.VITE_GOOGLE_DESKTOP_ID || '',
  clientSecret: import.meta.env.VITE_GOOGLE_DESKTOP_SECRET || '',
}
