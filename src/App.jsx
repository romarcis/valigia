import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { GearSixIcon, PlusIcon } from '@phosphor-icons/react'
import MapView from './MapView.jsx'
import Settings from './Settings.jsx'
import { cleanSettings } from './sync.js'
import { reschedule, insertStop, removeStop } from './util.js'
import { officialSite } from './wiki.js'
import NewTrip from './NewTrip.jsx'
import StopPanel from './StopPanel.jsx'
import { STRINGS, errorText } from './i18n.js'
import { planStop, findTransport, findTicket } from './planner.js'
import { userCurrency } from './currency.js'
import { keepTicket } from './util.js'
import { nextSlot } from './util.js'
import { moveItem, removeItem, insertBreak, renumber, routeUpTo, dayNumbers, dropUnlocated, dayTone, INKS } from './util.js'
import { log } from './net.js'
import PackingLoader from './PackingLoader.jsx'
import PlaceCard from './PlaceCard.jsx'
import { walkRoute, driveLegs } from './routing.js'
import { locatePlaces } from './geo.js'
import { ring } from './bell.js'
import { useCloud } from './useCloud.js'
import AuthScreen from './AuthScreen.jsx'


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
// The meal venue picked as `${day}:${item}`.
const venueAt = (stop, key) => { const [d, j] = key.split(':'); return stop?.days?.[+d]?.items[+j]?.venue }

export default function App() {
  const [settings, setSettings] = usePersist('valigia.settings', { lang: navigator.language?.startsWith('it') ? 'it' : 'en' })
  useEffect(() => setSettings(cleanSettings), [setSettings]) // forget the AI setup older versions stored
  const [trips, setTripsRaw] = usePersist('valigia.trips', [])
  // Every edit stamps the trips it touched: sync pushes those, and the newest copy wins across devices.
  const setTrips = useCallback(fn => setTripsRaw(prev => {
    const next = typeof fn === 'function' ? fn(prev) : fn
    const old = new Map(prev.map(tr => [tr.id, tr]))
    return next.map(tr => (old.get(tr.id) === tr ? tr : { ...tr, updatedAt: Date.now() }))
  }), [setTripsRaw])
  const [currentId, setCurrentId] = usePersist('valigia.current', null)
  const [view, setView] = useState('trip')
  const [active, setActive] = useState(0)
  const [tab, setTab] = useState('days')
  const [day, setDay] = useState(0) // day of the active stop shown in the itinerary (and drawn on top on the map)
  const [dayZoom, setDayZoom] = useState(0) // bumped by a click on a day tab: the map re-frames that day even if it was already open
  // A day tab: show that day and frame its walk on the map (dropping any picked place and the overview).
  const openDay = useCallback(d => { setDay(d); setPicked(null); setOverview(false); setDayZoom(z => z + 1) }, [])
  const [overview, setOverview] = useState(false) // whole-trip map; its toggle on the map was removed, kept for picks that reset it
  const [picked, setPicked] = useState(null) // index into the active stop's places, or a meal venue's `${day}:${item}`
  const [card, setCard] = useState(false) // the picked place's card, opened from the map
  const [busy, setBusy] = useState({}) // `${stopId}:${job}` -> true
  const [errors, setErrors] = useState({}) // `${stopId}:${job}` -> message
  const [packing, setPacking] = useState(null) // { city, step, total } while stops are being planned
  // The suitcase is packed: ring the desk bell when the loader closes.
  const wasPacking = useRef(false)
  useEffect(() => { if (wasPacking.current && !packing) ring(); wasPacking.current = !!packing }, [packing])
  const cloud = useCloud({ settings, setSettings, trips, setTrips: setTripsRaw })

  const t = STRINGS[settings.lang] || STRINGS.it
  const trip = trips.find(x => x.id === currentId) || trips[0] || null
  const stop = trip?.stops[active]

  useEffect(() => { document.documentElement.lang = settings.lang }, [settings.lang])
  useEffect(() => { if (trip && active >= trip.stops.length) setActive(0) }, [trip, active])

  // patch: fields to set on the stop; or, with editPlaces, a function applied to its current places (no stale copy)
  const updateStop = useCallback((tripId, stopId, patch, editPlaces) => {
    setTrips(ts => ts.map(tr => (tr.id !== tripId ? tr : { ...tr, stops: tr.stops.map(s => (s.id !== stopId ? s : editPlaces ? { ...s, places: editPlaces(s.places) } : { ...s, ...patch })) })))
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
    setOverview(false)
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

  // Puts place idx (of `places`, which may include a just-found place) at the end of day d, or only in Luoghi when d is null.
  const schedule = (places, idx, d) => {
    const place = places[idx]
    // added to a day: last item of that day, whose walk is recomputed
    const days = d == null ? stop.days : stop.days.map((dd, k) => {
      if (k !== d) return dd
      const { route, ...rest } = dd
      return { ...rest, items: [...dd.items, { time: nextSlot(dd.items), place: place.name, placeIdx: idx, note: '', transfer: null }] }
    })
    const next = renumber(places, days)
    updateStop(trip.id, stop.id, next)
    log('ok', `${stop.city}: aggiunto «${place.name}»${d == null ? '' : ` al giorno ${d + 1}`}`)
    setPicked(next.places.indexOf(place))
    if (d != null) { setDay(d); setTab('days') }
  }

  const closeCard = useCallback(() => setCard(false), [])
  useEffect(() => { if (view !== 'trip') setCard(false) }, [view]) // New trip / Settings close the place card

  // Entrance ticket of the place whose card is open: searched once, then kept with the place (and synced).
  const [ticketJob, setTicketJob] = useState({}) // place name -> 'busy' | error message
  const cardPlace = card && !overview && typeof picked === 'number' ? stop?.places?.[picked] : null
  const loadTicket = useCallback(async (tr, s, idx, place) => {
    setTicketJob(j => ({ ...j, [place.name]: 'busy' }))
    try {
      const ticket = await findTicket(settings, tr, idx, place)
      // Web searches vary: a refresh that finds no prices must not wipe the ones already found.
      if (keepTicket(place.ticket, ticket)) {
        log('info', `${place.name}: la nuova ricerca non ha trovato prezzi, tengo quelli salvati`)
        setTicketJob(j => ({ ...j, [place.name]: { kept: true } }))
        return
      }
      setTrips(ts => ts.map(x => (x.id !== tr.id ? x : { ...x, stops: x.stops.map(st => (st.id !== s.id ? st : { ...st, places: st.places.map(pl => (pl.name === place.name ? { ...pl, ticket } : pl)) })) })))
      setTicketJob(({ [place.name]: _, ...rest }) => rest)
      log('ok', `${place.name}: biglietto ${ticket.needed === false ? 'non necessario' : ticket.prices.length ? `trovato (${ticket.prices.length} prezzi)` : 'senza prezzi'}`)
    } catch (e) {
      log('error', `${place.name}: biglietto non trovato (${e.message || e})`)
      setTicketJob(j => ({ ...j, [place.name]: errorText(t, e) }))
    }
  }, [settings, t, setTrips])
  useEffect(() => {
    if (cardPlace && !cardPlace.ticket && !ticketJob[cardPlace.name]) loadTicket(trip, stop, active, cardPlace)
  }, [cardPlace, ticketJob, loadTicket, trip, stop, active])
  // Its official website (Wikidata), looked up once and kept with the place ('' = it has none).
  useEffect(() => {
    if (!cardPlace?.url || cardPlace.site !== undefined) return
    const { name } = cardPlace, tripId = trip.id, stopId = stop.id
    officialSite(cardPlace.url).then(site => updateStop(tripId, stopId, null, ps => ps.map(p => (p.name === name ? { ...p, site } : p))), e => log('error', `${name}: sito ufficiale non disponibile (${e.message})`))
  }, [cardPlace, trip?.id, stop?.id, updateStop])
  const selectStop = useCallback(i => { setActive(i); setOverview(false); setPicked(null); setDay(0) }, [])
  // From the map: highlight the place and show the tab that lists it (Places only lists what the itinerary skips).
  const pickFromMap = useCallback(i => {
    setPicked(i)
    setCard(true)
    const inDays = typeof i === 'string' || stop?.days?.some(d => d.items.some(it => (it.placeIdx ?? stop.places.findIndex(p => p.name === it.place)) === i))
    setTab(inDays ? 'days' : 'places')
    // show the day the place belongs to
    const d = typeof i === 'string' ? +i.split(':')[0] : stop?.days?.findIndex(dd => dd.items.some(it => (it.placeIdx ?? stop.places.findIndex(p => p.name === it.place)) === i))
    if (d >= 0) setDay(d)
  }, [stop])
  // From the itinerary or Luoghi: highlight the place and open its card (photo and description); a second click closes both.
  const pickFromList = useCallback(i => {
    const off = picked === i && card // a second click on an open card closes it; on a closed one it reopens
    setPicked(off ? null : i)
    setCard(!off)
    setOverview(false)
  }, [picked, card])
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
    // nothing picked: the day open in the itinerary is the one on top
    if (w < 0 || !d.route?.cuts) return [{ day: i, hot: w >= 0 || (picked == null && i === day), coords }]
    const done = routeUpTo(d.route, w)
    return [{ day: i, hot: true, coords: done }, { day: i, hot: false, coords: coords.slice(Math.max(0, done.length - 1)) }]
  })), [overview, stop, picked, day])

  return (
    <div className={`app view-${cloud.needsAuth || cloud.user === undefined ? 'auth' : view}`} style={stop && view === 'trip' ? { '--ink': INKS[active % INKS.length].bg, '--on-ink': INKS[active % INKS.length].fg } : undefined}>
      <header className="appbar">
        <span className="wordmark">Valigia</span>
        {trips.length > 0 && view === 'trip' && (
          <select className="trip-switch" aria-label={t.trips} value={trip?.id} onChange={e => { setCurrentId(e.target.value); setActive(0); setOverview(false) }}>
            {trips.map(x => <option key={x.id} value={x.id}>{x.title}</option>)}
          </select>
        )}
        <span className="appbar-gap" />
        <button className="btn btn-on-navy" aria-label={t.newTrip} onClick={() => setView('new')} disabled={view === 'new'}>
          <PlusIcon size={18} weight="bold" aria-hidden /> <span className="hide-sm">{t.newTrip}</span>
        </button>
        <button className="icon-btn" aria-label={t.settings} aria-pressed={view === 'settings'} onClick={() => setView(view === 'settings' ? 'trip' : 'settings')}>
          <GearSixIcon size={22} aria-hidden />
        </button>
      </header>

      {packing && <PackingLoader t={t} city={packing.city} step={packing.step} total={packing.total} />}
      <main className="workspace">
        <aside className="panel">
          {cloud.user === undefined && <p className="pane muted">…</p>}
          {cloud.needsAuth && <AuthScreen t={t} onGuest={cloud.enterAsGuest} />}
          {cloud.user !== undefined && !cloud.needsAuth && <>
          {view === 'settings' && <Settings t={t} settings={settings} setSettings={setSettings} cloud={cloud} onClose={() => setView('trip')} />}
          {view === 'new' && <NewTrip t={t} settings={settings} onCreate={createTrip} onCancel={trips.length ? () => setView('trip') : null} />}
          {view === 'trip' && !trip && (
            <section className="empty">
              <h1>{t.emptyTitle}</h1>
              <p>{t.emptyBody}</p>
              <button className="btn btn-primary" onClick={() => setView('new')}>{t.newTrip}</button>
            </section>
          )}
          {view === 'trip' && trip && (
            <StopPanel
              t={t} trip={trip} active={active} onSelect={selectStop} inks={INKS}
              tab={tab} setTab={setTab} day={day} setDay={openDay} picked={picked}
              onAddPlace={(place, d) => schedule([...stop.places, place], stop.places.length, d)}
              onSchedule={(i, d) => schedule(stop.places, i, d)}
              onDropPlace={i => {
                // only places outside the itinerary are listed in Luoghi: later indexes shift down by one
                const name = stop.places[i].name
                const shift = it => (it.placeIdx != null && it.placeIdx > i ? { ...it, placeIdx: it.placeIdx - 1 } : it)
                updateStop(trip.id, stop.id, { places: stop.places.filter((_, k) => k !== i), days: stop.days.map(d => ({ ...d, items: d.items.map(shift) })) })
                setPicked(null)
                log('ok', `${stop.city}: tolto «${name}» dai luoghi`)
              }}
onPick={pickFromList}
              onStay={(d, j, min) => {
                // a place's visit length belongs to the place (same everywhere); a break keeps its own
                const it = stop.days[d].items[j]
                const idx = it.placeIdx ?? stop.places.findIndex(p => p.name === it.place)
                updateStop(trip.id, stop.id, idx >= 0
                  ? { places: stop.places.map((p, k) => (k === idx ? { ...p, minutes: min } : p)) }
                  : { days: stop.days.map((day, k) => (k !== d ? day : { ...day, items: day.items.map((x, n) => (n === j ? { ...x, minutes: min } : x)) })) })
              }}
              onTime={(d, j, at) => updateStop(trip.id, stop.id, { days: stop.days.map((day, k) => (k !== d ? day : { ...day, items: day.items.map((x, n) => (n !== j ? x : at ? { ...x, at } : (({ at: _, ...rest }) => rest)(x))) })) })}
              onAddStop={async ({ before, ...s }) => {
                const ns = { ...s, id: newId() }
                const tr = insertStop(trip, active, ns, before)
                const at = tr.stops.indexOf(ns)
                setTrips(ts => ts.map(x => (x.id === trip.id ? tr : x)))
                setActive(at)
                setDay(0)
                log('ok', `${trip.title}: aggiunta la tappa ${s.city}`)
                setPacking({ city: s.city, step: 1, total: 1 })
                await run(tr, at, 'plan')
                setPacking(null)
              }}
              onRemoveStop={() => {
                log('ok', `${trip.title}: tolta la tappa ${stop.city}`)
                setTrips(ts => ts.map(x => (x.id === trip.id ? removeStop(x, active) : x)))
                setActive(a => Math.max(0, a - 1))
                setDay(0)
                setPicked(null)
              }}
              onDates={patch => setTrips(ts => ts.map(x => (x.id === trip.id ? reschedule(x, active, patch) : x)))}
              onStart={(d, time) => updateStop(trip.id, stop.id, { days: stop.days.map((day, k) => (k === d ? { ...day, start: time } : day)) })}
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
          </>}
        </aside>

        <section className="map-wrap">
          {card && view === 'trip' && !overview && stop?.places?.[picked] && (
            <PlaceCard t={t} lang={trip.lang || settings.lang} place={stop.places[picked]}
              ticketLoading={ticketJob[stop.places[picked].name] === 'busy'}
              ticketError={typeof ticketJob[stop.places[picked].name] === 'string' && ticketJob[stop.places[picked].name] !== 'busy' ? ticketJob[stop.places[picked].name] : null}
              ticketKept={!!ticketJob[stop.places[picked].name]?.kept}
              onTicketRetry={() => loadTicket(trip, stop, active, stop.places[picked])}
              currency={userCurrency(settings)} tag={tags[picked]} ink={dayTone(INKS[0], tags[picked]?.day ?? 0, stop.days.length)} onClose={closeCard} />
          )}
          {card && view === 'trip' && !overview && typeof picked === 'string' && venueAt(stop, picked) && (
            <PlaceCard t={t} lang={trip.lang || settings.lang} place={venueAt(stop, picked)} venue
              tag={numbers.venues[picked] && { n: numbers.venues[picked].n, day: +picked.split(':')[0] }}
              ink={dayTone(INKS[0], +picked.split(':')[0], stop.days.length)} onClose={closeCard} />
          )}
          <MapView stops={trip?.stops || []} active={active} places={places} tags={tags} venues={venues} hotel={overview ? null : stop?.hotel} routes={dayRoutes} focusDay={overview || picked != null ? null : day} dayZoom={dayZoom} dayFrame={!overview && picked == null && stop?.days?.[day] ? dayPoints(stop, stop.days[day]) : null} dayCount={stop?.days?.length || 1} inks={INKS} onStop={selectStop} overview={overview} selected={overview ? null : picked} onPick={pickFromMap} />
        </section>
      </main>
    </div>
  )
}
