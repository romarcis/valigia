import { AirplaneTakeoffIcon, AirplaneLandingIcon, CarIcon, MotorcycleIcon, ArrowSquareOutIcon, ClockIcon } from '@phosphor-icons/react'
import { googleFlightsLink } from './flights.js'

const fmtDate = (lang, iso) => new Intl.DateTimeFormat(lang, { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(iso + 'T12:00:00'))
const money = (lang, n) => new Intl.NumberFormat(lang, { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n)

// Detail of the journey there ('out') or back ('in'): the chosen flight, or the drive.
export default function LegPanel({ t, trip, dir, focus, onChange }) {
  const tv = trip.travel
  const x = tv[dir]
  const lang = trip.lang
  const flight = tv.mode === 'flight'
  const Icon = flight ? (dir === 'out' ? AirplaneTakeoffIcon : AirplaneLandingIcon) : tv.mode === 'moto' ? MotorcycleIcon : CarIcon

  return (
    <div className="leg-panel">
      <header className="stop-head leg-head">
        <span className="stop-num" aria-hidden><Icon size={56} /></span>
        <div>
          <h1>{dir === 'out' ? t.outbound : t.inbound}</h1>
          <p>{flight && x ? fmtDate(lang, x.date) : dir === 'out' ? `${tv.from} → ${trip.stops[0].city}` : `${trip.stops.at(-1).city} → ${tv.from}`}</p>
        </div>
      </header>

      <div className="tabpanel">
        {flight && !x && (
          <div className="fetch">
            <p>{t.noFlightChosen}</p>
            <button className="btn btn-ink" onClick={onChange}>{t.findFlights}</button>
          </div>
        )}

        {flight && x && (
          <>
            <ol className="timeline leg-timeline">
              {x.legs.map((l, i) => (
                <li key={i} className="leg-seg">
                  <div className={'leg-stop' + (focus === 'dep' && i === 0 ? ' is-picked' : '')}>
                    <time>{l.from.time}</time>
                    <div><strong>{l.from.id}</strong> <span className="muted">{l.from.name}</span></div>
                  </div>
                  <p className="leg-flight"><img src={l.logo} alt="" /> {l.airline} · {l.number} · {t.min(l.min)}{l.plane ? ` · ${l.plane}` : ''}</p>
                  <div className={'leg-stop' + (focus === 'arr' && i === x.legs.length - 1 ? ' is-picked' : '')}>
                    <time>{l.to.time}</time>
                    <div><strong>{l.to.id}</strong> <span className="muted">{l.to.name}</span></div>
                  </div>
                  {x.layovers[i] && <p className="leg-layover"><ClockIcon size={16} aria-hidden /> {t.layover(x.layovers[i].id, t.min(x.layovers[i].min))}</p>}
                </li>
              ))}
            </ol>
            <p className="leg-total">
              {t.min(x.totalMin)}{x.price != null && <> · <b>{money(lang, x.price)}</b></>}
              {x.co2 != null && <span className="muted"> · {Math.round(x.co2 / 1000)} kg CO₂</span>}
            </p>
            <p className="hint">{t.priceNote}</p>
            <div className="row">
              <a className="btn btn-ink" href={x.url || googleFlightsLink(x.legs[0].from.id, x.legs.at(-1).to.id, x.date)} target="_blank" rel="noreferrer">
                {t.bookOnGoogle} <ArrowSquareOutIcon size={16} aria-hidden />
              </a>
              <button className="btn btn-quiet" onClick={onChange}>{t.changeFlight}</button>
            </div>
          </>
        )}

        {!flight && (x?.km != null ? (
          <>
            <p className="leg-total"><b>{x.km.toLocaleString(lang)} km</b> · {t.min(x.min)}</p>
            <p className="hint">{t.driveNote}</p>
            <a className="btn btn-ink" target="_blank" rel="noreferrer"
              href={`https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(x.from)}&destination=${encodeURIComponent(x.to)}&travelmode=driving`}>
              {t.openMaps} <ArrowSquareOutIcon size={16} aria-hidden />
            </a>
          </>
        ) : <p className="muted">{x?.failed ? t.driveFailed : t.driveLater}</p>)}
      </div>
    </div>
  )
}
