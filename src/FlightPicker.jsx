import { useEffect, useState } from 'react'
import { AirplaneTakeoffIcon, AirplaneLandingIcon, CheckIcon, ArrowSquareOutIcon } from '@phosphor-icons/react'
import { searchFlights, rankFlights, googleFlightsLink } from './flights.js'
import { loadAirports, nearestAirports, searchAirports } from './airports.js'
import { cityPoint } from './places.js'
import { errorText } from './i18n.js'
import { addDays } from './util.js'

const fmtDate = (lang, iso) => new Intl.DateTimeFormat(lang, { weekday: 'short', day: 'numeric', month: 'short' }).format(new Date(iso + 'T12:00:00'))
const money = (lang, n) => new Intl.NumberFormat(lang, { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n)

export function FlightRow({ t, lang, f, chosen, onChoose }) {
  const first = f.legs[0], last = f.legs.at(-1)
  const dayShift = last && first && last.to.date !== first.from.date
  const stops = f.layovers.length
  const content = (
    <>
      <img className="fl-logo" src={f.logo} alt="" loading="lazy" />
      <div className="fl-main">
        <p className="fl-times">{first.from.time}<span aria-hidden> → </span>{last.to.time}{dayShift && <sup>+1</sup>}</p>
        <p className="fl-sub">
          {first.from.id}–{last.to.id} · {t.min(f.totalMin)} · {stops ? t.stopsN(stops, f.layovers.map(l => l.id).join(', ')) : t.direct}
        </p>
        <p className="fl-airline muted">{[...new Set(f.legs.map(l => l.airline))].join(' + ')} · {f.legs.map(l => l.number).join(', ')}</p>
      </div>
      <p className="fl-price">{f.price != null ? money(lang, f.price) : '—'}</p>
      {chosen && <CheckIcon className="fl-check" size={20} weight="bold" aria-hidden />}
    </>
  )
  return onChoose
    ? <button className={'fl-row' + (chosen ? ' is-chosen' : '')} aria-pressed={chosen} onClick={onChoose}>{content}</button>
    : <div className="fl-row">{content}</div>
}

// One direction. The home airport is fixed; at the trip end the nearest airports to the city are
// offered in a select (closest first), then flights are searched between the two IATA codes.
function Leg({ t, lang, settings, dir, home, stop, date, adults, chosen, onChoose }) {
  const [near, setNear] = useState({ status: 'loading', list: [] })
  const [sel, setSel] = useState(null)
  const [state, setState] = useState({ status: 'idle' })
  const [by, setBy] = useState('best')

  useEffect(() => {
    let off = false
    ;(async () => {
      try {
        const pt = await cityPoint(stop)
        if (!pt) throw new Error(t.cityNotFound(stop.city))
        const list = nearestAirports(await loadAirports(), pt)
        if (!list.length) throw new Error(t.noNearAirport(stop.city))
        if (!off) { setNear({ status: 'ok', list }); setSel(list[0].iata) }
      } catch (e) {
        if (!off) setNear({ status: 'error', msg: e.message, list: [] })
      }
    })()
    return () => { off = true }
  }, [stop, t])

  const [from, to] = dir === 'out' ? [home?.iata, sel] : [sel, home?.iata]
  useEffect(() => {
    if (!from || !to) return
    let off = false
    setState({ status: 'loading' })
    searchFlights(settings.serpapiKey, { from, to, date, adults, hl: lang })
      .then(list => { if (!off) setState({ status: 'ok', list }) })
      .catch(e => { if (!off) setState({ status: 'error', msg: e.message === 'no-flight-key' ? t.needFlightKey : errorText(t, e) }) })
    return () => { off = true }
  }, [settings.serpapiKey, from, to, date, adults, lang, t])

  const Icon = dir === 'out' ? AirplaneTakeoffIcon : AirplaneLandingIcon
  const homeTag = home && <b className="fl-code">{home.iata}</b>
  const picker = near.status === 'ok' ? (
    <label className="fl-pick">
      <span className="sr-only">{dir === 'out' ? t.arriveAt : t.leaveFrom}</span>
      <select value={sel || ''} onChange={e => { setSel(e.target.value); onChoose(null) }}>
        {near.list.map(a => <option key={a.iata} value={a.iata}>{a.iata} · {a.name} ({t.kmFrom(a.km, stop.city)})</option>)}
      </select>
    </label>
  ) : <span>{stop.city}</span>

  return (
    <section className="fl-leg">
      <header className="fl-head">
        <Icon size={26} aria-hidden />
        <div>
          <h2>{dir === 'out' ? t.outbound : t.inbound} <span className="muted fl-date">{fmtDate(lang, date)}</span></h2>
          <p className="fl-route">{dir === 'out' ? <>{homeTag} → {picker}</> : <>{picker} → {homeTag}</>}</p>
        </div>
      </header>

      {near.status === 'error' && <p className="error" role="alert">{near.msg}</p>}
      {(near.status === 'loading' || state.status === 'loading') && <div className="skeleton" aria-label={t.searchingFlights}>{[90, 80, 86, 70].map(w => <span key={w} style={{ '--w': `${w}%`, height: 54 }} />)}</div>}
      {state.status === 'error' && (
        <div className="stack">
          <p className="error" role="alert">{state.msg}</p>
          <a className="link" href={googleFlightsLink(from, to, date)} target="_blank" rel="noreferrer">{t.searchOnGoogle} <ArrowSquareOutIcon size={14} aria-hidden /></a>
        </div>
      )}
      {state.status === 'ok' && !state.list.length && <p className="note">{t.noFlights}</p>}
      {state.status === 'ok' && state.list.length > 0 && (
        <>
          <div className="toolbar">
            <span className="muted" id={`sort-${dir}`}>{t.sortBy}</span>
            <div className="seg" role="radiogroup" aria-labelledby={`sort-${dir}`}>
              {[['best', t.byBest], ['price', t.byPrice], ['duration', t.byDuration]].map(([v, l]) => (
                <button key={v} role="radio" aria-checked={by === v} onClick={() => setBy(v)}>{l}</button>
              ))}
            </div>
          </div>
          <ol className="fl-list">
            {rankFlights(state.list, by).map((f, i) => (
              <li key={i}><FlightRow t={t} lang={lang} f={f} chosen={chosen?.id === f.id} onChoose={() => onChoose(chosen?.id === f.id ? null : { ...f, date })} /></li>
            ))}
          </ol>
          {state.list[0]?.url && (
            <a className="link" href={state.list[0].url} target="_blank" rel="noreferrer">{t.openGoogleFlights} <ArrowSquareOutIcon size={14} aria-hidden /></a>
          )}
        </>
      )}
    </section>
  )
}

// Flight choice for a trip draft (or one direction of an existing trip with `only`).
export default function FlightPicker({ t, settings, draft, only, onDone, onSkip }) {
  const lang = settings.lang
  const nights = draft.stops.reduce((n, s) => n + s.nights, 0)
  const back = addDays(draft.startDate, nights)
  const [out, setOut] = useState(null)
  const [inb, setInb] = useState(null)
  const [home, setHome] = useState(draft.travel.airport || null)
  // trips made before airports were picked from the list only stored a city name
  useEffect(() => { if (!home) loadAirports().then(l => setHome(searchAirports(l, draft.travel.from)[0] || null)) }, [home, draft.travel.from])
  const first = draft.stops[0], last = draft.stops.at(-1)
  const ready = (only !== 'in' ? out : true) && (only !== 'out' ? inb : true)

  return (
    <div className="pane">
      <div className="pane-head"><h1>{t.flightsTitle}</h1></div>
      {!settings.serpapiKey ? <p className="note">{t.needFlightKey}</p> : (
        <>
          {only !== 'in' && <Leg t={t} lang={lang} settings={settings} dir="out" home={home} stop={first} date={draft.startDate} adults={draft.travelers} chosen={out} onChoose={setOut} />}
          {only !== 'out' && <Leg t={t} lang={lang} settings={settings} dir="in" home={home} stop={last} date={back} adults={draft.travelers} chosen={inb} onChoose={setInb} />}
        </>
      )}
      <div className="fl-actions">
        <button className="btn btn-primary btn-wide" disabled={!ready} onClick={() => onDone({ out, in: inb })}>{only ? t.saveFlight : t.confirmFlights}</button>
        <button className="btn btn-quiet" onClick={onSkip}>{only ? t.cancel : t.skipFlights}</button>
      </div>
    </div>
  )
}
