import { useCallback, useEffect, useRef, useState } from 'react'
import { cloudEnabled, onUser, pull, pushProfile, pushTrip, dropTrip, logout } from './cloud.js'
import { cleanSettings, mergeTrips } from './sync.js'
import { log } from './net.js'

const GUEST = 'valigia.guest'
const isGuest = () => { try { return localStorage.getItem(GUEST) === '1' } catch { return false } }

// Account state and two-way sync of trips and settings with Firestore.
export function useCloud({ settings, setSettings, trips, setTrips }) {
  const [user, setUser] = useState(cloudEnabled ? undefined : null) // undefined = still checking
  const [guest, setGuest] = useState(isGuest)
  const [ready, setReady] = useState(false) // first pull done: pushing is safe
  const pushed = useRef({ trips: new Map(), pub: null })
  const snap = useRef({ trips })
  snap.current = { trips }

  useEffect(() => onUser(u => setUser(u || null)), [])

  // Login: merge the cloud copy into this device.
  useEffect(() => {
    if (!user) { setReady(false); return }
    let off = false
    ;(async () => {
      try {
        const remote = await pull(user.uid)
        if (off) return
        setTrips(mergeTrips(snap.current.trips, remote.trips))
        // pub: null forces one push, which also clears the key fields older versions left in the profile
        pushed.current = { trips: new Map(remote.trips.map(t => [t.id, t.updatedAt || 0])), pub: null }
        if (remote.settings) setSettings(s => ({ ...s, ...cleanSettings(remote.settings) }))
        setReady(true)
      } catch (e) {
        log('error', `Cloud: impossibile scaricare i dati (${e.message})`)
      }
    })()
    return () => { off = true }
  }, [user, setSettings, setTrips])

  // Push what changed, 1.2 s after the last edit: trips whose updatedAt moved, deleted trips, settings.
  useEffect(() => {
    if (!user || !ready) return
    const timer = setTimeout(async () => {
      const p = pushed.current
      try {
        for (const tr of trips) {
          if (p.trips.get(tr.id) === (tr.updatedAt || 0)) continue
          await pushTrip(user.uid, tr)
          p.trips.set(tr.id, tr.updatedAt || 0)
        }
        for (const id of [...p.trips.keys()]) {
          if (trips.some(tr => tr.id === id)) continue
          await dropTrip(user.uid, id)
          p.trips.delete(id)
        }
        const pub = cleanSettings(settings), pubJson = JSON.stringify(pub)
        if (pubJson !== p.pub) {
          await pushProfile(user.uid, pub)
          p.pub = pubJson
        }
      } catch (e) {
        log('error', `Cloud: salvataggio non riuscito (${e.message})`)
      }
    }, 1200)
    return () => clearTimeout(timer)
  }, [user, ready, trips, settings])

  const enterAsGuest = useCallback(() => { try { localStorage.setItem(GUEST, '1') } catch { /* private mode */ } setGuest(true) }, [])
  const leaveGuest = useCallback(() => { try { localStorage.removeItem(GUEST) } catch { /* ignore */ } setGuest(false) }, [])

  // Leaving the account wipes this device: trips belong to the account, not to the computer.
  const signOutAndWipe = useCallback(async () => {
    await logout()
    pushed.current = { trips: new Map(), pub: null }
    setTrips([])
    try { localStorage.removeItem(GUEST) } catch { /* ignore */ }
    setGuest(false)
  }, [setTrips])

  return {
    enabled: cloudEnabled, user, guest, ready,
    needsAuth: cloudEnabled && user === null && !guest,
    enterAsGuest, leaveGuest, signOut: signOutAndWipe,
  }
}
