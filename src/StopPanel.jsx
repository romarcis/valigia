import { useEffect, useRef, useState } from 'react'
import {
  ArrowClockwiseIcon, ArrowSquareOutIcon, BedIcon, CheckIcon, MagnifyingGlassIcon, WarningIcon, TrashIcon,
  PersonSimpleWalkIcon, TrainSimpleIcon, TrainIcon, BusIcon, TramIcon, CarIcon, BoatIcon, AirplaneTiltIcon, TaxiIcon, PathIcon,
} from '@phosphor-icons/react'
import { rankHotels, stopOffsets, addDays, walkMinutes } from './util.js'
import { canSearch } from './ai.js'

const MODE_ICON = { walk: PersonSimpleWalkIcon, metro: TrainSimpleIcon, bus: BusIcon, tram: TramIcon, train: TrainIcon, car: CarIcon, ferry: BoatIcon, flight: AirplaneTiltIcon, taxi: TaxiIcon }
const ModeIcon = ({ mode, size = 20 }) => { const I = MODE_ICON[mode] || PathIcon; return <I size={size} aria-hidden /> }

const fmtDate = (lang, iso, opts = { weekday: 'short', day: 'numeric', month: 'short' }) =>
  new Intl.DateTimeFormat(lang, opts).format(new Date(iso + 'T12:00:00'))
const money = (lang, n) => new Intl.NumberFormat(lang, { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n)
const host = url => { try { return new URL(url).hostname.replace(/^www\./, '') } catch { return url } }

function Sources({ t, list }) {
  if (!list?.length) return null
  return (
    <details className="sources">
      <summary>{t.sources} · {list.length}</summary>
      <ul>{list.map(s => <li key={s.url}><a href={s.url} target="_blank" rel="noreferrer">{s.title} <span className="muted">{host(s.url)}</span></a></li>)}</ul>
    </details>
  )
}

function Skeleton({ rows = 4 }) {
  return <div className="skeleton" aria-hidden>{Array.from({ length: rows }, (_, i) => <span key={i} style={{ '--w': `${92 - ((i * 17) % 40)}%` }} />)}</div>
}

// How to get from the previous stop of the day: walking computed from coordinates, transit as the AI estimated it.
function Transfer({ t, walk, tr }) {
  const line = x => `${x.line ? `${x.line} · ` : ''}${t.min(x.min)}`
  const modes = [
    walk != null && ['walk', `≈ ${t.min(walk)}`],
    tr?.metro?.min && ['metro', line(tr.metro)],
    tr?.tram?.min && ['tram', line(tr.tram)],
    tr?.bus?.min && ['bus', line(tr.bus)],
    tr?.car_min && ['car', t.min(tr.car_min)],
  ].filter(Boolean)
  if (!modes.length) return null
  return (
    <li className="transfer" aria-label={t.transfer}>
      {modes.map(([m, txt]) => <span key={m} title={t.modes[m]}><ModeIcon mode={m} size={16} /> {txt}</span>)}
    </li>
  )
}

// Old plans have no placeIdx: fall back to matching by name.
function placeIndex(stop, it) {
  if (it.placeIdx != null) return it.placeIdx
  const i = (stop.places || []).findIndex(p => p.name === it.place)
  return i < 0 ? null : i
}

// Right-click (or the keyboard menu key) on an itinerary item: move it to another day, or up/down.
function ItemMenu({ t, lang, days, at, x, y, onMove, onClose }) {
  const ref = useRef(null)
  useEffect(() => {
    ref.current?.querySelector('button')?.focus()
    const close = e => { if (!ref.current?.contains(e.target)) onClose() }
    const esc = e => e.key === 'Escape' && onClose()
    document.addEventListener('pointerdown', close)
    document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('pointerdown', close); document.removeEventListener('keydown', esc) }
  }, [onClose])
  const go = to => { onMove(at, to); onClose() }
  const count = days[at.d].items.length
  return (
    <div ref={ref} className="ctx" role="menu" style={{ left: Math.min(x, window.innerWidth - 250), top: Math.min(y, window.innerHeight - 60 - days.length * 40) }}>
      {at.i > 0 && <button role="menuitem" onClick={() => go({ d: at.d, i: at.i - 1 })}>{t.moveUp}</button>}
      {at.i < count - 1 && <button role="menuitem" onClick={() => go({ d: at.d, i: at.i + 2 })}>{t.moveDown}</button>}
      {days.map((d, k) => k !== at.d && (
        <button key={k} role="menuitem" onClick={() => go({ d: k, i: days[k].items.length })}>
          {t.moveToDay(k + 1)} <span className="muted">{fmtDate(lang, d.date)}</span>
        </button>
      ))}
    </div>
  )
}

function Days({ t, stop, lang, picked, onPick, onMove }) {
  const drag = useRef(null) // {d, i} of the item being dragged
  const [drop, setDrop] = useState(null) // {d, i} insert position under the pointer
  const [menu, setMenu] = useState(null) // {at: {d, i}, x, y}

  const overRow = (e, d, i) => {
    if (!drag.current) return
    e.preventDefault()
    const r = e.currentTarget.getBoundingClientRect()
    const at = { d, i: e.clientY > r.top + r.height / 2 ? i + 1 : i }
    if (drop?.d !== at.d || drop?.i !== at.i) setDrop(at)
  }
  const end = () => { drag.current = null; setDrop(null) }
  const finish = e => {
    e.preventDefault()
    if (drag.current && drop) onMove(drag.current, drop)
    end()
  }

  return (
    <>
      <p className="hint">{t.transferNote}</p>
      <ol className="days">
        {stop.days.map((d, i) => {
          let last = null // last item of the day whose place has coordinates
          let leg = -1 // index into d.route.legs: one leg between each pair of located places
          return (
            <li key={i} className="day">
              <h3><span className="day-n">{t.day} {i + 1}</span> <span className="muted">{fmtDate(lang, d.date)}</span></h3>
              <p className="day-title">{d.title}</p>
              <ol
                className={'timeline' + (drop?.d === i && drop.i === d.items.length ? ' drop-end' : '')}
                onDragOver={e => { if (drag.current && e.target === e.currentTarget) { e.preventDefault(); setDrop({ d: i, i: d.items.length }) } }}
                onDrop={finish}
              >
                {d.items.flatMap((it, j) => {
                  const idx = placeIndex(stop, it)
                  const p = idx != null ? stop.places[idx] : null
                  const located = p?.lat != null
                  if (located && last) leg++
                  const walk = j > 0 && located && last ? (d.route?.legs?.[leg] ?? walkMinutes(last, p)) : null
                  if (located) last = p
                  const cls = [
                    idx != null && idx === picked && 'is-picked',
                    drop?.d === i && drop.i === j && 'drop-before',
                    drag.current?.d === i && drag.current.i === j && 'is-dragging',
                  ].filter(Boolean).join(' ')
                  const row = (
                    <li
                      key={j} data-place={idx ?? undefined} className={cls || undefined}
                      draggable onDragStart={e => { drag.current = { d: i, i: j }; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', it.place) }}
                      onDragOver={e => overRow(e, i, j)} onDragEnd={end}
                      onContextMenu={e => { e.preventDefault(); setMenu({ at: { d: i, i: j }, x: e.clientX || 24, y: e.clientY || e.currentTarget.getBoundingClientRect().bottom }) }}
                      title={t.dragHint}
                    >
                      <time>{it.time}</time>
                      <div>
                        {idx != null ? (
                          <button className="tl-place" aria-pressed={idx === picked} onClick={() => onPick(idx)}>
                            <span className="pin pin-inline" aria-hidden>{idx + 1}</span>
                            <strong>{it.place}</strong>
                          </button>
                        ) : <strong tabIndex={0}>{it.place}</strong>}
                        {it.note && <p>{it.note}</p>}
                      </div>
                      {p?.img && <img src={p.img} alt="" loading="lazy" draggable={false} />}
                    </li>
                  )
                  return j > 0 ? [<Transfer key={`t${j}`} t={t} walk={walk} tr={it.transfer} />, row] : [row]
                })}
              </ol>
            </li>
          )
        })}
      </ol>
      {menu && <ItemMenu t={t} lang={lang} days={stop.days} {...menu} onMove={onMove} onClose={() => setMenu(null)} />}
    </>
  )
}

function Places({ t, stop, picked, onPick }) {
  return (
    <ol className="places">
      {stop.places.map((p, i) => (
        <li key={p.name} data-place={i} className={'place' + (i === picked ? ' is-picked' : '')}>
          <div className="place-img">
            {p.img ? <img src={p.img} alt={p.name} loading="lazy" /> : <span className="place-noimg" aria-hidden>{String(i + 1).padStart(2, '0')}</span>}
            {p.img && <span className="pin pin-static" aria-hidden>{i + 1}</span>}
          </div>
          <div className="place-body">
            <h3><button className="tl-place" aria-pressed={i === picked} onClick={() => onPick(i)}>{p.name}</button></h3>
            <p className="place-why">{p.why}</p>
            {p.extract && <p className="place-extract">{p.extract}</p>}
            <p className="meta">
              {p.minutes ? <span>{t.min(p.minutes)}</span> : null}
              {p.url && <a href={p.url} target="_blank" rel="noreferrer">{t.readMore} <ArrowSquareOutIcon size={13} aria-hidden /></a>}
            </p>
          </div>
        </li>
      ))}
    </ol>
  )
}

function Hotels({ t, stop, lang, onChoose }) {
  const [by, setBy] = useState('value')
  const list = rankHotels(stop.hotels.items, by)
  return (
    <>
      <div className="toolbar">
        <span id="sort" className="muted">{t.sortBy}</span>
        <div className="seg" role="radiogroup" aria-labelledby="sort">
          {[['value', t.byValue], ['price', t.byPrice], ['rating', t.byRating]].map(([v, l]) => (
            <button key={v} role="radio" aria-checked={by === v} onClick={() => setBy(v)}>{l}</button>
          ))}
        </div>
      </div>
      <ol className="hotels">
        {list.map(h => {
          const chosen = stop.chosenHotel === h.name
          const verified = !!h.url && (h.rating != null || h.price_per_night_eur != null)
          return (
            <li key={h.name} className={'hotel' + (chosen ? ' is-chosen' : '')}>
              <div className="hotel-main">
                <h3>{h.name}</h3>
                <p className="muted">{h.area}</p>
                <p className="hotel-why">{h.why}</p>
              </div>
              <div className="hotel-figures">
                <p className="price">{h.price_per_night_eur != null ? money(lang, h.price_per_night_eur) : '—'}<small>{h.price_note || t.perNight}</small></p>
                {h.score10 != null && (
                  <p className="score"><b>{h.rating}</b>/{h.rating_scale}<small>{[h.reviews ? t.reviews(h.reviews) : null, h.rating_source].filter(Boolean).join(' · ')}</small></p>
                )}
              </div>
              <div className="hotel-actions">
                {verified
                  ? <a className="link" href={h.url} target="_blank" rel="noreferrer">{t.source}: {host(h.url)} <ArrowSquareOutIcon size={13} aria-hidden /></a>
                  : <span className="tag tag-warn"><WarningIcon size={14} aria-hidden /> {t.unverified}</span>}
                <button className={'btn ' + (chosen ? 'btn-ink' : 'btn-quiet')} aria-pressed={chosen} onClick={() => onChoose(h.name)}>
                  {chosen ? <><CheckIcon size={16} weight="bold" aria-hidden /> {t.chosen}</> : t.choose}
                </button>
              </div>
            </li>
          )
        })}
      </ol>
    </>
  )
}

function Moves({ t, stop, next }) {
  const { local, toNext } = stop.moves
  const Block = ({ title, data, wide }) => data && (
    <section className="moves">
      <h3>{title}</h3>
      <div className="best">
        <span className="best-icon"><ModeIcon mode={data.best} size={26} /></span>
        <div><span className="tag tag-ink">{t.best}</span> <strong>{t.modes[data.best] || data.best}</strong><p>{data.why}</p></div>
      </div>
      <ul className="options">
        {data.options.map((o, i) => (
          <li key={i}>
            <ModeIcon mode={o.mode} />
            <div>
              <strong>{t.modes[o.mode] || o.mode}</strong>
              {wide && (o.duration_min || o.cost_eur != null) && (
                <span className="muted"> · {[o.duration_min && t.min(o.duration_min), o.cost_eur != null && `€ ${o.cost_eur}`].filter(Boolean).join(' · ')}</span>
              )}
              {!wide && o.cost && <span className="muted"> · {o.cost}</span>}
              <p>{o.how}</p>
              {o.tip && <p className="muted">{o.tip}</p>}
              {o.url && <a className="link" href={o.url} target="_blank" rel="noreferrer">{host(o.url)} <ArrowSquareOutIcon size={13} aria-hidden /></a>}
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
  return (
    <>
      <Block title={t.inCity(stop.city)} data={local} />
      {next && <Block title={t.toNext(next.city)} data={toNext} wide />}
    </>
  )
}

function Fetch({ t, label, hint, Icon, onRun, busy, err, warn }) {
  return (
    <div className="fetch">
      <p>{hint}</p>
      {warn && <p className="note">{warn}</p>}
      <button className="btn btn-ink" onClick={onRun} disabled={busy} aria-busy={busy}><Icon size={18} aria-hidden /> {busy ? `${t.planning}…` : label}</button>
      {err && <p className="error" role="alert">{err}</p>}
      {busy && <Skeleton rows={6} />}
    </div>
  )
}

export default function StopPanel({ t, trip, active, onSelect, inks, tab, setTab, picked, onPick, onMove, busy, errors, settings, run, onChooseHotel, onDelete }) {
  const stop = trip.stops[active]
  const lang = trip.lang
  const from = addDays(trip.startDate, stopOffsets(trip)[active])
  const to = addDays(from, stop.nights)
  const k = job => `${stop.id}:${job}`
  const tabs = [['days', t.tabDays], ['places', t.tabPlaces], ['hotels', t.tabHotels], ['moves', t.tabMoves]]
  const noSearch = !canSearch(settings) ? t.noSearch : null
  const [armed, setArmed] = useState(false) // delete needs a second, deliberate press

  // A place picked on the map scrolls into view in whichever list is showing.
  useEffect(() => {
    if (picked == null) return
    document.querySelector(`.tabpanel [data-place="${picked}"]`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [picked, tab])

  return (
    <div className="stop-panel">
      <nav className="rail" aria-label={t.formWhere}>
        <ol>
          {trip.stops.map((s, i) => (
            <li key={s.id}>
              <button
                className={'chip' + (i === active ? ' is-active' : '') + (busy[`${s.id}:plan`] ? ' is-busy' : '')}
                style={{ '--ink': inks[i % inks.length].bg, '--on-ink': inks[i % inks.length].fg }}
                aria-current={i === active ? 'step' : undefined}
                onClick={() => onSelect(i)}
              >
                <span className="chip-num">{String(i + 1).padStart(2, '0')}</span>
                <span className="chip-city">{s.city}</span>
              </button>
            </li>
          ))}
        </ol>
      </nav>

      <header className="stop-head">
        <span className="stop-num" aria-hidden>{String(active + 1).padStart(2, '0')}</span>
        <div>
          <h1>{stop.city}</h1>
          <p>{fmtDate(lang, from, { day: 'numeric', month: 'short' })} – {fmtDate(lang, to, { day: 'numeric', month: 'short' })} · {t.nights(stop.nights)}</p>
          {stop.chosenHotel && <p className="stop-hotel"><BedIcon size={16} aria-hidden /> {stop.chosenHotel}</p>}
        </div>
        <button className="icon-btn icon-btn-ink" aria-label={t.replan} title={t.replan} onClick={() => run('plan')} disabled={busy[k('plan')]}>
          <ArrowClockwiseIcon size={20} aria-hidden />
        </button>
      </header>
      {stop.summary && <p className="stop-summary">{stop.summary}</p>}

      <div className="tabs" role="tablist">
        {tabs.map(([id, label]) => (
          <button key={id} role="tab" id={`tab-${id}`} aria-selected={tab === id} aria-controls="tabpanel" onClick={() => setTab(id)}>{label}</button>
        ))}
      </div>

      <div className="tabpanel" role="tabpanel" id="tabpanel" aria-labelledby={`tab-${tab}`}>
        {(tab === 'days' || tab === 'places') && (
          busy[k('plan')] ? <><p className="muted">{t.planningStop(stop.city)}</p><Skeleton rows={8} /></>
          : errors[k('plan')] ? <div className="fetch"><p className="error" role="alert">{errors[k('plan')]}</p><button className="btn btn-ink" onClick={() => run('plan')}>{t.retry}</button></div>
          : !stop.planned ? <div className="fetch"><button className="btn btn-ink" onClick={() => run('plan')}>{t.replan}</button></div>
          : tab === 'days' ? <Days t={t} stop={stop} lang={lang} picked={picked} onPick={onPick} onMove={onMove} /> : <Places t={t} stop={stop} picked={picked} onPick={onPick} />
        )}

        {tab === 'hotels' && (stop.hotels && !busy[k('hotels')] ? (
          <>
            {(noSearch || stop.hotels.unverified) && <p className="note">{noSearch || t.searchUnavailable}</p>}
            <Hotels t={t} stop={stop} lang={lang} onChoose={onChooseHotel} />
            <footer className="fetched">
              <span className="muted">{t.checked(fmtDate(lang, stop.hotels.at.slice(0, 10), { day: 'numeric', month: 'short' }))}</span>
              <button className="btn btn-quiet" onClick={() => run('hotels')}><ArrowClockwiseIcon size={16} aria-hidden /> {t.refresh}</button>
            </footer>
            <Sources t={t} list={stop.hotels.sources} />
          </>
        ) : <Fetch t={t} label={t.findHotels} hint={t.hotelsHint} Icon={MagnifyingGlassIcon} onRun={() => run('hotels')} busy={busy[k('hotels')]} err={errors[k('hotels')]} warn={noSearch} />)}

        {tab === 'moves' && (stop.moves && !busy[k('moves')] ? (
          <>
            {(noSearch || stop.moves.unverified) && <p className="note">{noSearch || t.searchUnavailable}</p>}
            <Moves t={t} stop={stop} next={trip.stops[active + 1]} />
            <footer className="fetched">
              <span className="muted">{t.checked(fmtDate(lang, stop.moves.at.slice(0, 10), { day: 'numeric', month: 'short' }))}</span>
              <button className="btn btn-quiet" onClick={() => run('moves')}><ArrowClockwiseIcon size={16} aria-hidden /> {t.refresh}</button>
            </footer>
            <Sources t={t} list={stop.moves.sources} />
          </>
        ) : <Fetch t={t} label={t.findMoves} hint={t.movesHint} Icon={PathIcon} onRun={() => run('moves')} busy={busy[k('moves')]} err={errors[k('moves')]} warn={noSearch} />)}
      </div>

      <footer className="panel-foot">
        <button className={'btn ' + (armed ? 'btn-danger' : 'btn-danger-quiet')} onClick={() => (armed ? onDelete() : setArmed(true))} onBlur={() => setArmed(false)}>
          <TrashIcon size={16} aria-hidden /> {armed ? t.confirmDelete : t.deleteTrip}
        </button>
      </footer>
    </div>
  )
}
