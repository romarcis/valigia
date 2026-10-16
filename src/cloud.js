import { initializeApp } from 'firebase/app'
import {
  initializeAuth, indexedDBLocalPersistence, browserLocalPersistence, onAuthStateChanged,
  createUserWithEmailAndPassword, signInWithEmailAndPassword, sendPasswordResetEmail, signOut,
  GoogleAuthProvider, signInWithCredential, signInWithPopup, browserPopupRedirectResolver, signInAnonymously,
} from 'firebase/auth'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { http, openExternal } from './net.js'
import { getFirestore, doc, getDoc, setDoc, getDocs, collection, deleteDoc, deleteField } from 'firebase/firestore'
import config, { googleDesktop } from './firebase-config.js'
import { log } from './net.js'

// Accounts and sync are off until the Firebase config is filled in.
export const cloudEnabled = !!config.apiKey

let auth = null, db = null
if (cloudEnabled) {
  const app = initializeApp(config)
  // No popup/redirect resolver: inside the app webview Google sign-in goes through the system browser.
  auth = initializeAuth(app, { persistence: [indexedDBLocalPersistence, browserLocalPersistence] })
  db = getFirestore(app)
}

export const onUser = cb => (auth ? onAuthStateChanged(auth, cb) : (cb(null), () => {}))
export const register = (email, pw) => createUserWithEmailAndPassword(auth, email, pw)
export const login = (email, pw) => signInWithEmailAndPassword(auth, email, pw)
export const resetPassword = email => sendPasswordResetEmail(auth, email)
export const logout = () => signOut(auth)

// Token for the AI proxy: the signed-in user's, or, for a guest, an anonymous Firebase user kept in a
// second Firebase app so the guest still looks signed out everywhere else (no sync, no account UI).
let anonAuth = null
export async function aiToken() {
  if (!cloudEnabled) throw new Error('no-key')
  await auth.authStateReady()
  if (auth.currentUser) return auth.currentUser.getIdToken()
  anonAuth ??= initializeAuth(initializeApp(config, 'ai'), { persistence: [indexedDBLocalPersistence, browserLocalPersistence] })
  await anonAuth.authStateReady()
  if (!anonAuth.currentUser) await signInAnonymously(anonAuth)
  return anonAuth.currentUser.getIdToken()
}

// ---- Google sign-in
// In the app: system browser + loopback redirect + PKCE (Google blocks sign-in inside embedded webviews),
// then the ID token signs in to Firebase. In a plain browser (npm run dev) the Firebase popup does it.
const inTauri = '__TAURI_INTERNALS__' in window
const isAndroid = /Android/i.test(navigator.userAgent)
export const googleAvailable = cloudEnabled && !isAndroid && (!inTauri || !!googleDesktop.clientId)

const b64url = bytes => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const fail = (code, msg = code) => Object.assign(new Error(msg), { code })

export async function signInGoogle() {
  if (!inTauri) return signInWithPopup(auth, new GoogleAuthProvider(), browserPopupRedirectResolver)

  const verifier = b64url(crypto.getRandomValues(new Uint8Array(48)))
  const challenge = b64url(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)))
  const state = b64url(crypto.getRandomValues(new Uint8Array(16)))
  const port = await invoke('oauth_listen')
  const redirect = `http://127.0.0.1:${port}`

  // Wait for the browser to come back (or give up after 5 minutes, like the listener).
  let unlisten
  const back = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(fail('auth/timeout')), 300000)
    listen('oauth-redirect', e => { clearTimeout(timer); resolve(e.payload) }).then(u => { unlisten = u })
  })
  await openExternal(`https://accounts.google.com/o/oauth2/v2/auth?${new URLSearchParams({
    client_id: googleDesktop.clientId, redirect_uri: redirect, response_type: 'code', scope: 'openid email profile',
    code_challenge: challenge, code_challenge_method: 'S256', state, prompt: 'select_account',
  })}`)
  const path = await back.finally(() => unlisten?.())

  const q = new URLSearchParams(path.split('?')[1] || '')
  if (q.get('error')) throw fail(q.get('error') === 'access_denied' ? 'auth/cancelled' : 'auth/google', q.get('error'))
  if (q.get('state') !== state || !q.get('code')) throw fail('auth/google', 'state mismatch')

  const res = await http('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code: q.get('code'), client_id: googleDesktop.clientId, client_secret: googleDesktop.clientSecret,
      redirect_uri: redirect, grant_type: 'authorization_code', code_verifier: verifier,
    }).toString(),
  })
  const tok = await res.json()
  if (!tok.id_token) { log('error', `Google: ${tok.error_description || tok.error || res.status}`); throw fail('auth/google', 'no id_token') }
  return signInWithCredential(auth, GoogleAuthProvider.credential(tok.id_token))
}

// ---- Firestore layout: users/{uid} = { settings }, users/{uid}/trips/{id} = { json, updatedAt }
// Trips are stored as a JSON string: Firestore rejects nested arrays, and map routes are made of them.

export async function pull(uid) {
  const [u, ts] = await Promise.all([getDoc(doc(db, 'users', uid)), getDocs(collection(db, 'users', uid, 'trips'))])
  const trips = ts.docs.map(d => { try { return JSON.parse(d.data().json) } catch { return null } }).filter(Boolean)
  log('ok', `Cloud: scaricati ${trips.length} viaggi`)
  return { exists: u.exists(), settings: u.data()?.settings || null, trips }
}

// Also deletes the API keys older versions synced: the app no longer keeps any per user.
export const pushProfile = (uid, settings) =>
  setDoc(doc(db, 'users', uid), { settings, keys: deleteField(), vault: deleteField(), updatedAt: Date.now() }, { merge: true })

export async function pushTrip(uid, trip) {
  const json = JSON.stringify(trip)
  if (json.length > 900_000) { log('error', `Cloud: «${trip.title}» è troppo grande per essere salvato (${Math.round(json.length / 1000)} KB)`); return }
  await setDoc(doc(db, 'users', uid, 'trips', trip.id), { json, updatedAt: trip.updatedAt || Date.now() })
}

export const dropTrip = (uid, id) => deleteDoc(doc(db, 'users', uid, 'trips', id))

// Firebase error codes -> i18n keys
export const authError = e => ({
  'auth/invalid-email': 'errEmail', 'auth/missing-email': 'errEmail',
  'auth/invalid-credential': 'errCredentials', 'auth/wrong-password': 'errCredentials', 'auth/user-not-found': 'errCredentials',
  'auth/email-already-in-use': 'errEmailUsed', 'auth/weak-password': 'errWeakPassword',
  'auth/too-many-requests': 'errTooMany', 'auth/network-request-failed': 'errNetwork',
  'auth/cancelled': 'errGoogleCancelled', 'auth/popup-closed-by-user': 'errGoogleCancelled', 'auth/timeout': 'errGoogleTimeout',
  'auth/google': 'errGoogle', 'auth/account-exists-with-different-credential': 'errOtherProvider',
}[e?.code] || 'errAuth')
