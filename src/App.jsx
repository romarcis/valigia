import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { GearSixIcon, PlusIcon, MapTrifoldIcon, ListBulletsIcon } from '@phosphor-icons/react'
import MapView from './MapView.jsx'
import Settings, { isConnected } from './Settings.jsx'
import NewTrip from './NewTrip.jsx'
import StopPanel from './StopPanel.jsx'
import { STRINGS, errorText } from './i18n.js'
import { planStop, findTransport } from './planner.js'
import { moveItem, removeItem, insertBreak, renumber, routeUpTo, dayNumbers, dropUnlocated, dayTone } from './util.js'
import { log } from './net.js'
import LogPanel, { useLog } from './LogPanel.jsx'
import PackingLoader from './PackingLoader.jsx'
import PlaceCard from './PlaceCard.jsx'
import { walkRoute, driveLegs } from './routing.js'
import { locatePlaces } from './geo.js'
import { ring } from './bell.js'

// Lithographic label inks, one per stop in travel order.
export const INKS = [
  { bg: '#c8402a', fg: '#ffffff' },
  { bg: '#e3a72b', fg: '#16213f' },
  { bg: '#2a47a0', fg: '#ffffff' },
  { bg: '#1f6b4c', fg: '#ffffff' },
  { bg: '#b8506f', fg: '#ffffff' },
  { bg: '#1d6f78', fg: '#ffffff' },
]

// The points a day's walk goes through: the hotel (when on the map), the located places and meal venues in order, the hotel again.
function dayPoints(stop, d) {
  const pts = d.items.map(it => stop.places[it.placeIdx ?? stop.places.findIndex(p => p.name === it.place)] || it.venue).filter(p => p?.lat != null)
  return stop.hotel?.lat != null && pts.length ? [stop.hotel, ...pts, stop.hotel] : pts
}

function usePersist(key, init) {
  const [v, setV] = useState(() => {
    try { return JSON.parse(localStorage.getItem(key)) ?? init } catch { return init }
  })
  useEffect(() => {
    try { localStorage.setItem(key, JSON.stringify(v)) } catch { /* storage full or blocked */ }
  }, [key, v])
  return [v, setV]
}

const newId = () => crypto.randomUUID()

export default function App() {
  // ponytail: API keys live in the webview's localStorage (device-only); move to an OS keystore if the threat model needs it.
  const [settings, setSettings] = usePersist('valigia.settings', { provider: 'openrouter', lang: navigator.language?.startsWith('it') ? 'it' : 'en' })
  const [trips, setTrips] = usePersist('valigia.trips', [])
  const [currentId, setCurrentId] = usePersist('valigia.current', null)
  const [view, setView] = useState(() => (!isConnected(settings) ? 'settings' : 'trip'))
  const [active, setActive] = useState(0)
  const [tab, setTab] = useState('days')
  const [overview, setOverview] = useState(true)
  const [picked, setPicked] = useState(null) // index into the active stop's places, or a meal venue's `${day}:${item}`
  const [card, setCard] = useState(false) // the picked place's card, opened from the map
  const [busy, setBusy] = useState({}) // `${stopId}:${job}` -> true
  const [errors, setErrors] = useState({}) // `${stopId}:${job}` -> message
  const [showLog, setShowLog] = useState(false)
  const [packing, setPacking] = useState(null) // { city, step, total } while stops are being planned
  // The suitcase is packed: ring the desk bell when the loader closes.
  const wasPacking = useRef(false)
  useEffect(() => { if (wasPacking.current && !packing) ring(); wasPacking.current = !!packing }, [packing])
  const logEntries = useLog()
  const logErrors = logEntries.filter(e => e.level === 'error').length

  const t = STRINGS[settings.lang] || STRINGS.it
  const trip = trips.find(x => x.id === currentId) || trips[0] || null
  const stop = trip?.stops[active]

  useEffect(() => { document.documentElement.lang = settings.lang }, [settings.lang])
  useEffect(() => { if (trip && active >= trip.stops.length) setActive(0) }, [trip, active])

  const updateStop = useCallback((tripId, stopId, patch) => {
    setTrips(ts => ts.map(tr => (tr.id !== tripId ? tr : { ...tr, stops: tr.stops.map(s => (s.id === stopId ? { ...s, ...patch } : s)) })))
  }, [setTrips])

  // Runs one AI job for one stop, tracking busy/error state per stop+job.
  const run = useCallback(async (tr, idx, job) => {
    const s = tr.stops[idx]
    const k = `${s.id}:${job}`
    setBusy(b => ({ ...b, [k]: true }))
    setErrors(e => ({ ...e, [k]: null }))
    const t0 = Date.now()
    log('info', `${s.city}: inizio ${{ plan: 'pianificazione', moves: 'ricerca spostamenti' }[job]}`)
    try {
      if (job === 'plan') updateStop(tr.id, s.id, await planStop(settings, tr, idx))
      if (job === 'moves') updateStop(tr.id, s.id, { moves: await findTransport(settings, tr, idx) })
      log('ok', `${s.city}: completato in ${Math.round((Date.now() - t0) / 1000)}s`)
    } catch (e) {
      log('error', `${s.city}: ${e.message || e}`)
      setErrors(er => ({ ...er, [k]: errorText(t, e) }))
    } finally {
      setBusy(b => ({ ...b, [k]: false }))
    }
  }, [settings, t, updateStop])

  const createTrip = async draft => {
    const tr = { ...draft, id: newId(), lang: settings.lang, stops: draft.stops.map(s => ({ ...s, id: newId() })) }
    setTrips(ts => [tr, ...ts])
    setCurrentId(tr.id)
    setActive(0)
    setTab('days')
    setOverview(true)
    setView('trip')
    // Sequential: each stop's prompt mentions its neighbours, and it keeps rate limits calm.
    for (let i = 0; i < tr.stops.length; i++) {
      setPacking({ city: tr.stops[i].city, step: i + 1, total: tr.stops.length })
      await run(tr, i, 'plan')
    }
    setPacking(null)
  }

  const deleteTrip = id => {
    setTrips(ts => ts.filter(x => x.id !== id))
    setCurrentId(null)
    setActive(0)
  }

  // The traveller's own hotel, picked from the map search (or null): every day's walk starts and ends there.
  const saveHotel = hotel => {
    updateStop(trip.id, stop.id, { hotel, days: stop.days?.map(({ route, ...d }) => d) }) // routes are recomputed from the hotel
    if (hotel) log('ok', `${stop.city}: hotel «${hotel.name}»`)
  }

  const closeCard = useCallback(() => setCard(false), [])
  const selectStop = useCallback(i => { setActive(i); setOverview(false); setPicked(null) }, [])
  // From the map: highlight the place and show the tab that lists it (Places only lists what the itinerary skips).
  const pickFromMap = useCallback(i => {
    setPicked(i)
    setCard(true) // places only: a venue has no card
    const inDays = typeof i === 'string' || stop?.days?.some(d => d.items.some(it => (it.placeIdx ?? stop.places.findIndex(p => p.name === it.place)) === i))
    setTab(inDays ? 'days' : 'places')
  }, [stop])
  const pickFromList = useCallback(i => { setPicked(p => (p === i ? null : i)); setCard(false); setOverview(false) }, [])
  const places = useMemo(() => (overview || !stop?.places ? [] : stop.places), [overview, stop])
  // Day and number of each place: pins take that day's colour and its number within the day.
  const numbers = useMemo(() => (stop?.places ? dayNumbers(stop) : { places: [], venues: {} }), [stop])
  const tags = numbers.places
  const venues = useMemo(() => (overview || !stop?.days ? [] : stop.days.flatMap((d, day) => d.items.flatMap((it, j) => (it.venue?.lat != null ? [{ ...it.venue, day, key: `${day}:${j}`, n: numbers.venues[`${day}:${j}`]?.n }] : [])))), [overview, stop, numbers])

  // For the stop on screen: first locate places Wikipedia left without coordinates (once),
  // then compute each day's street walking route (once, stored with the day).
  useEffect(() => {
    if (!trip || !stop?.planned) return
    let cancelled = false
    if (!stop.located && stop.places.some(p => p.lat == null)) {
      ;(async () => {
        const located = await locatePlaces(stop.places, stop)
        if (cancelled) return
        // routes were drawn without the newly located places: recompute them. A place that is still
        // nowhere on the map is most likely invented: it leaves the plan.
        const r = dropUnlocated(located, stop.days.map(({ route, ...d }) => d))
        if (r.dropped.length) {
          log('info', `${stop.city}: tolti dal piano ${r.dropped.length} luoghi che non esistono sulla mappa (${r.dropped.join(', ')})`)
          setPicked(null)
        }
        updateStop(trip.id, stop.id, { places: r.places, days: r.days, located: true })
      })()
      return () => { cancelled = true }
    }
    // Routes from older versions lack cuts or the drives: recompute them.
    const fresh = d => d.route?.cuts && d.route.drives !== undefined
    if (stop.days.every(fresh)) return
    ;(async () => {
      const days = []
      for (const d of stop.days) {
        if (fresh(d)) { days.push(d); continue }
        const pts = dayPoints(stop, d)
        const route = await walkRoute(pts)
        // Every leg also by car, on the roads (null when the router fails, so it is not retried).
        route.drives = await driveLegs(pts).catch(() => null)
        days.push({ ...d, route })
        if (cancelled) return
      }
      updateStop(trip.id, stop.id, { days })
    })()
    return () => { cancelled = true }
  }, [trip, stop, updateStop])

  // The day that holds the picked place is drawn on top up to that place; the rest of it is dimmed like the other days.
  const dayRoutes = useMemo(() => (overview || !stop?.days ? [] : stop.days.flatMap((d, i) => {
    const target = typeof picked === 'string' ? stop.days[+picked.split(':')[0]]?.items[+picked.split(':')[1]]?.venue : stop.places[picked]
    const w = picked == null || !target ? -1 : dayPoints(stop, d).indexOf(target)
    const coords = d.route?.coords || []
    if (w < 0 || !d.route?.cuts) return [{ day: i, hot: w >= 0, coords }]
    const done = routeUpTo(d.route, w)
    return [{ day: i, hot: true, coords: done }, { day: i, hot: false, coords: coords.slice(Math.max(0, done.length - 1)) }]
  })), [overview, stop, picked])

  return (
    <div className={`app view-${view}`} style={stop && view === 'trip' ? { '--ink': INKS[active % INKS.length].bg, '--on-ink': INKS[active % INKS.length].fg } : undefined}>
      <header className="appbar">
        <span className="wordmark">Valigia</span>
        {trips.length > 0 && view === 'trip' && (
          <select className="trip-switch" aria-label={t.trips} value={trip?.id} onChange={e => { setCurrentId(e.target.value); setActive(0); setOverview(true) }}>
            {trips.map(x => <option key={x.id} value={x.id}>{x.title}</option>)}
          </select>
        )}
        <span className="appbar-gap" />
        <button className="btn btn-on-navy" aria-label={t.newTrip} onClick={() => setView('new')} disabled={view === 'new'}>
          <PlusIcon size={18} weight="bold" aria-hidden /> <span className="hide-sm">{t.newTrip}</span>
        </button>
        <button className="icon-btn log-btn" aria-label={t.log} aria-pressed={showLog} title={t.log} onClick={() => setShowLog(v => !v)}>
          <ListBulletsIcon size={22} aria-hidden />
          {logErrors > 0 && <span className="log-badge">{logErrors}</span>}
        </button>
        <button className="icon-btn" aria-label={t.settings} aria-pressed={view === 'settings'} onClick={() => setView(view === 'settings' ? 'trip' : 'settings')}>
          <GearSixIcon size={22} aria-hidden />
        </button>
      </header>

      {packing && <PackingLoader t={t} city={packing.city} step={packing.step} total={packing.total} />}
      <main className="workspace">
        <aside className="panel">
          {view === 'settings' && <Settings t={t} settings={settings} setSettings={setSettings} onDone={() => setView('new')} />}
          {view === 'new' && <NewTrip t={t} settings={settings} onCreate={createTrip} onCancel={trips.length ? () => setView('trip') : null} />}
          {view === 'trip' && !trip && (
            <section className="empty">
              <h1>{t.emptyTitle}</h1>
              <p>{t.emptyBody}</p>
              <button className="btn btn-primary" onClick={() => setView(isConnected(settings) ? 'new' : 'settings')}>{t.newTrip}</button>
            </section>
          )}
          {view === 'trip' && trip && (
            <StopPanel
              t={t} trip={trip} active={active} onSelect={selectStop} inks={INKS}
              tab={tab} setTab={setTab} picked={picked} onPick={pickFromList}
              onGo={(d, j, go) => updateStop(trip.id, stop.id, {
                // j is the item the transfer leads to, or 'back' for the walk back to the hotel
                days: stop.days.map((day, k) => (k !== d ? day : j === 'back' ? { ...day, backGo: go } : { ...day, items: day.items.map((it, n) => (n === j ? { ...it, go } : it)) })),
              })}
              onVenue={(d, j, venue) => updateStop(trip.id, stop.id, {
                // the walk changes around this item: its route and the AI transit estimates in and out of it are stale
                days: stop.days.map((day, k) => {
                  if (k !== d) return day
                  const { route, ...rest } = day
                  return { ...rest, items: day.items.map((it, n) => (n === j ? { ...it, venue, transfer: null } : n === j + 1 ? { ...it, transfer: null } : it)) }
                }),
              })}
              onMove={(from, to) => {
                const next = renumber(stop.places, moveItem(stop.days, from, to))
                // the highlight follows its place; a venue's key changes with its position, so it is dropped
                setPicked(p => (typeof p === 'number' ? next.places.indexOf(stop.places[p]) : null))
                updateStop(trip.id, stop.id, next)
              }}
              onInsert={(at, place) => {
                setPicked(p => (typeof p === 'number' ? p : null)) // venue keys after the insert shift by one
                updateStop(trip.id, stop.id, { days: insertBreak(stop.days, at, place) })
              }}
              onRemove={at => {
                // a removed place stays in the stop's places: it shows up again under Luoghi
                setPicked(null)
                updateStop(trip.id, stop.id, renumber(stop.places, removeItem(stop.days, at)))
              }} busy={busy} errors={errors} settings={settings}
              run={async job => {
                if (job !== 'plan') return run(trip, active, job)
                setPacking({ city: stop.city, step: 1, total: 1 })
                await run(trip, active, job)
                setPacking(null)
              }} onSaveHotel={saveHotel} onDelete={() => deleteTrip(trip.id)}
            />
          )}
        </aside>

        <section className="map-wrap">
          {card && !overview && stop?.places?.[picked] && (
            <PlaceCard t={t} place={stop.places[picked]} tag={tags[picked]} ink={dayTone(INKS[active % INKS.length], tags[picked]?.day ?? 0, stop.days.length)} onClose={closeCard} />
          )}
          {showLog && <LogPanel t={t} entries={logEntries} onClose={() => setShowLog(false)} />}
          <MapView stops={trip?.stops || []} active={active} places={places} tags={tags} venues={venues} hotel={overview ? null : stop?.hotel} routes={dayRoutes} dayCount={stop?.days?.length || 1} inks={INKS} onStop={selectStop} overview={overview} selected={overview ? null : picked} onPick={pickFromMap} />
          {trip && (
            <button className="map-overview" aria-pressed={overview} onClick={() => setOverview(o => !o)}>
              <MapTrifoldIcon size={18} aria-hidden /> {trip.title}
            </button>
          )}
        </section>
      </main>
    </div>
  )
}
