import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import {
  ArrowClockwiseIcon, ArrowSquareOutIcon, BedIcon, TrashIcon, HourglassIcon, ForkKnifeIcon, DotsThreeVerticalIcon,
  CaretDownIcon, ArrowCounterClockwiseIcon, PersonSimpleWalkIcon, TrainSimpleIcon, TrainIcon, BusIcon, TramIcon, CarIcon, BoatIcon, AirplaneTiltIcon, TaxiIcon, PathIcon,
  PlusIcon,
  XIcon,
} from '@phosphor-icons/react'
import { stopOffsets, addDays, walkMinutes, dayNumbers, dayTone, dayTimes, dayStart, stayMinutes } from './util.js'
import { canSearch } from './ai.js'

import Combobox from './Combobox.jsx'
import { searchFood, searchHotels, searchSights, resolvePlace } from './search.js'
import { wikiFor } from './wiki.js'

const MODE_ICON = { walk: PersonSimpleWalkIcon, metro: TrainSimpleIcon, bus: BusIcon, tram: TramIcon, train: TrainIcon, car: CarIcon, ferry: BoatIcon, flight: AirplaneTiltIcon, taxi: TaxiIcon }
const ModeIcon = ({ mode, size = 20 }) => { const I = MODE_ICON[mode] || PathIcon; return <I size={size} aria-hidden /> }

const fmtDate = (lang, iso, opts = { weekday: 'short', day: 'numeric', month: 'short' }) =>
  new Intl.DateTimeFormat(lang, opts).format(new Date(iso + 'T12:00:00'))
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
// `go` is the traveller's pick among the modes shown (saved on the item); the first mode until they pick.
function Transfer({ t, walk, tr, drive, go, onGo }) {
  const line = x => `${x.line ? `${x.line} · ` : ''}${t.min(x.min)}`
  const modes = [
    walk != null && ['walk', `≈ ${t.min(walk)}`],
    drive && ['car', `${drive.km.toLocaleString(t.locale)} km · ${t.min(drive.min)}`], // computed on the roads
    tr?.metro?.min && ['metro', line(tr.metro)],
    tr?.tram?.min && ['tram', line(tr.tram)],
    tr?.bus?.min && ['bus', line(tr.bus)],
    !drive && tr?.car_min && ['car', t.min(tr.car_min)],
  ].filter(Boolean)
  if (!modes.length) return null
  const chosen = modes.some(([m]) => m === go) ? go : modes[0][0]
  return (
    <li className="transfer" aria-label={t.transfer}>
      {modes.map(([m, txt]) => (
        <button key={m} type="button" title={t.modes[m]} aria-pressed={modes.length > 1 ? m === chosen : undefined} disabled={!onGo || modes.length < 2} onClick={() => onGo(m)}>
          <ModeIcon mode={m} size={16} /> {txt}
        </button>
      ))}
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
function ItemMenu({ t, lang, days, at, x, y, onMove, onRemove, onInsert, onClose }) {
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
    <div ref={ref} className="ctx" role="menu" style={{ left: Math.max(8, Math.min(x, window.innerWidth - 250)), top: Math.max(8, Math.min(y, window.innerHeight - 250 - days.length * 40)) }}>
      {at.i > 0 && <button role="menuitem" onClick={() => go({ d: at.d, i: at.i - 1 })}>{t.moveUp}</button>}
      {at.i < count - 1 && <button role="menuitem" onClick={() => go({ d: at.d, i: at.i + 2 })}>{t.moveDown}</button>}
      {days.map((d, k) => k !== at.d && (
        <button key={k} role="menuitem" onClick={() => go({ d: k, i: days[k].items.length })}>
          {t.moveToDay(k + 1)} <span className="muted">{fmtDate(lang, d.date)}</span>
        </button>
      ))}
      <p className="ctx-head">{t.addAfter}</p>
      {t.breaks.map(b => <button key={b} role="menuitem" className="ctx-add" onClick={() => { onInsert(at, b); onClose() }}><ForkKnifeIcon size={14} aria-hidden /> {b}</button>)}
      <button role="menuitem" className="ctx-danger" onClick={() => { onRemove(at); onClose() }}>{t.removeFromDay}</button>
    </div>
  )
}

// Menu of a place in Luoghi (or one just found): add it to a day, or remove it.
function PlaceMenu({ t, lang, days, inkOf, x, y, onAdd, onRemove, onClose }) {
  const ref = useRef(null)
  useEffect(() => {
    ref.current?.querySelector('button')?.focus()
    const close = e => { if (!ref.current?.contains(e.target)) onClose() }
    const esc = e => e.key === 'Escape' && onClose()
    document.addEventListener('pointerdown', close)
    document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('pointerdown', close); document.removeEventListener('keydown', esc) }
  }, [onClose])
  return (
    <div ref={ref} className="ctx" role="menu" style={{ left: Math.max(8, Math.min(x, window.innerWidth - 250)), top: Math.max(8, Math.min(y, window.innerHeight - 90 - days.length * 40)) }}>
      <p className="ctx-head ctx-head-first">{t.addToItinerary}</p>
      {days.map((d, k) => (
        <button key={k} role="menuitem" onClick={() => { onAdd(k); onClose() }}>
          <span><span className="ctx-swatch" style={{ background: inkOf(k).bg }} aria-hidden /> {t.addToDayN(k + 1)}</span>
          <span className="muted">{fmtDate(lang, d.date)}</span>
        </button>
      ))}
      {onRemove && <button role="menuitem" className="ctx-danger" onClick={() => { onRemove(); onClose() }}>{t.removePlace}</button>}
    </div>
  )
}

// The trip's ⋮ menu in the stop head: add a stop, re-plan this one, remove it, delete the trip.
// The last three ask first, inside the menu; removing the only stop deletes the trip, and says so.
function StopMenu({ t, city, single, x, y, busy, onAdd, onReplan, onRemoveStop, onDeleteTrip, onClose }) {
  const ref = useRef(null)
  const [ask, setAsk] = useState(null) // 'replan' | 'stop' | 'trip'
  useEffect(() => {
    ref.current?.querySelector('button')?.focus()
    const close = e => { if (!ref.current?.contains(e.target)) onClose() }
    const esc = e => e.key === 'Escape' && onClose()
    document.addEventListener('pointerdown', close)
    document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('pointerdown', close); document.removeEventListener('keydown', esc) }
  }, [onClose, ask])
  const wipes = ask === 'trip' || (ask === 'stop' && single)
  const confirm = {
    replan: [t.replanText(city), t.replanConfirm, onReplan],
    stop: single ? [t.lastStopText(city), t.confirmDelete, onDeleteTrip] : [t.removeStopText(city), t.confirmRemoveStop(city), onRemoveStop],
    trip: [t.deleteTripText, t.confirmDelete, onDeleteTrip],
  }[ask]
  return (
    <div ref={ref} className="ctx stop-menu" role="menu" style={{ left: Math.max(8, Math.min(x, window.innerWidth - 270)), top: Math.max(8, Math.min(y, window.innerHeight - 240)) }}>
      {confirm ? (
        <>
          <p className="ctx-note">{confirm[0]}</p>
          <button role="menuitem" className={wipes || ask === 'stop' ? 'ctx-danger' : 'ctx-strong'} onClick={() => { confirm[2](); onClose() }}>{confirm[1]}</button>
          <button role="menuitem" onClick={() => setAsk(null)}>{t.cancel}</button>
        </>
      ) : (
        <>
          <button role="menuitem" className="ctx-add" onClick={() => { onAdd(); onClose() }}><PlusIcon size={16} aria-hidden /> {t.addStop}</button>
          <button role="menuitem" className="ctx-add" disabled={busy} onClick={() => setAsk('replan')}><ArrowClockwiseIcon size={16} aria-hidden /> {t.replanStop}</button>
          <button role="menuitem" className="ctx-danger ctx-add" onClick={() => setAsk('stop')}><XIcon size={16} aria-hidden /> {t.removeStopShort}</button>
          <button role="menuitem" className="ctx-danger ctx-add" onClick={() => setAsk('trip')}><TrashIcon size={16} aria-hidden /> {t.deleteTrip}</button>
        </>
      )}
    </div>
  )
}

const menuAt = e => {
  if (e.type === 'contextmenu') return { x: e.clientX || 24, y: e.clientY || 24 }
  const r = e.currentTarget.getBoundingClientRect()
  return { x: r.left - 180, y: r.bottom }
}

// Length of a visit or break: click it and type the minutes.
function Stay({ t, minutes, onSet }) {
  const [edit, setEdit] = useState(false)
  const [v, setV] = useState('')
  const save = () => {
    const n = Math.round(Number(v) / 5) * 5
    if (n >= 5 && n <= 720) onSet(n)
    setEdit(false)
  }
  if (edit) {
    return (
      <span className="stay-edit">
        <HourglassIcon size={14} aria-hidden />
        <input
          type="number" min="5" max="720" step="5" value={v} autoFocus aria-label={t.visitTime}
          onChange={e => setV(e.target.value)} onBlur={save}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); save() } if (e.key === 'Escape') setEdit(false) }}
        /> {t.minutesShort}
      </span>
    )
  }
  return (
    <button type="button" className="stay" title={t.visitEdit} onClick={() => { setV(String(minutes)); setEdit(true) }}>
      <HourglassIcon size={14} aria-hidden /> {t.visitFor(t.min(minutes))}
    </button>
  )
}

function Days({ t, stop, lang, picked, onPick, onMove, onRemove, onInsert, onVenue, onGo, onStart, onStay, onTime, inkOf, day, setDay }) {
  const { places: tags, venues: venueTags } = dayNumbers(stop)
  const [editing, setEditing] = useState(null) // `${day}:${item}` whose venue is being chosen
  const drag = useRef(null) // {d, i} of the item being dragged
  const [drop, setDrop] = useState(null) // {d, i} insert position under the pointer
  const [menu, setMenu] = useState(null) // {at: {d, i}, x, y}

  // Another day: its list starts from the top, right under the sticky day chips (only if we had scrolled past it).
  useEffect(() => {
    const list = document.getElementById('day-panel'), chips = document.querySelector('.day-tabs'), panel = list?.closest('.panel')
    const off = list && chips && list.getBoundingClientRect().top - chips.getBoundingClientRect().bottom
    if (panel && off < 0) panel.scrollBy({ top: off })
  }, [day])

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
      {/* One tab per day, in the day's colour; dropping an item on a tab moves it to the end of that day. */}
      <div className="day-tabs" role="tablist" aria-label={t.tabDays}>
        {stop.days.map((d, i) => (
          <button
            key={i} role="tab" aria-selected={i === day} aria-controls="day-panel"
            aria-label={`${t.day} ${i + 1}, ${fmtDate(lang, d.date, { weekday: 'long', day: 'numeric', month: 'long' })}`}
            className={'chip day-tab' + (i === day ? ' is-active' : '') + (drop?.d === i && i !== day ? ' is-drop' : '')}
            style={{ '--ink': inkOf(i).bg, '--on-ink': inkOf(i).fg }}
            onClick={() => setDay(i)}
            onDragOver={e => { if (drag.current && drag.current.d !== i) { e.preventDefault(); if (drop?.d !== i) setDrop({ d: i, i: d.items.length }) } }}
            onDragLeave={() => setDrop(x => (x?.d === i ? null : x))}
            onDrop={e => { finish(e); setDay(i) }}
          >
            <span className="chip-num" aria-hidden>{i + 1}</span>
            <span className="chip-city" aria-hidden>{fmtDate(lang, d.date, { weekday: 'short', day: 'numeric' })}</span>
          </button>
        ))}
      </div>
      <ol className="days" id="day-panel" role="tabpanel">
        {stop.days.map((d, i) => {
          if (i !== day) return null
          // The day's times always follow from its start: legs with the chosen mode + visit and break lengths,
          // so adding, removing or moving anything re-times the whole day.
          const clock = dayTimes(stop, d, dayStart(d))
          // With the hotel on the map, the day leaves from it and comes back to it (first and last route legs).
          const home = stop.hotel?.lat != null && d.items.some(it => (stop.places[placeIndex(stop, it)] || it.venue)?.lat != null) ? stop.hotel : null
          let last = home // last point of the day with coordinates
          let leg = -1 // index into d.route.legs: one leg between each pair of located places
          return (
            <li key={i} className="day">
              <div className="day-head">
                <h3><span className="day-swatch" style={{ background: inkOf(i).bg }} aria-hidden /><span className="day-n">{t.day} {i + 1}</span></h3>
                <label className="day-start">
                  <span>{t.startAt}</span>
                  <input type="time" step="300" value={dayStart(d).padStart(5, '0')} onChange={e => e.target.value && onStart(i, e.target.value)} />
                </label>
              </div>
              <ol
                className={'timeline' + (drop?.d === i && drop.i === d.items.length ? ' drop-end' : '')}
                onDragOver={e => { if (drag.current && e.target === e.currentTarget) { e.preventDefault(); setDrop({ d: i, i: d.items.length }) } }}
                onDrop={finish}
              >
                {home && <HotelRow t={t} name={home.name} time={dayStart(d)} />}
                {d.items.flatMap((it, j) => {
                  const idx = placeIndex(stop, it)
                  const p = idx != null ? stop.places[idx] : null
                  const point = p || it.venue // a meal at a chosen venue is a stop of the walk too
                  const located = point?.lat != null
                  const prev = last
                  if (located && last) leg++
                  const walk = located && last ? (d.route?.legs?.[leg] ?? walkMinutes(last, point)) : null
                  if (located) last = point
                  const key = `${i}:${j}`
                  const cls = [
                    idx == null && 'is-break', // lunch, dinner, coffee…: not a sight, drawn softer
                    (idx != null ? idx === picked : key === picked) && 'is-picked',
                    drop?.d === i && drop.i === j && 'drop-before',
                    drag.current?.d === i && drag.current.i === j && 'is-dragging',
                  ].filter(Boolean).join(' ')
                  const row = (
                    <li
                      key={j} data-place={idx ?? (it.venue ? key : undefined)} className={cls || undefined}
                      draggable={editing !== key} onDragStart={e => { drag.current = { d: i, i: j }; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', it.place) }}
                      onDragOver={e => overRow(e, i, j)} onDragEnd={end}
                      onContextMenu={e => { e.preventDefault(); setMenu({ at: { d: i, i: j }, x: e.clientX || 24, y: e.clientY || e.currentTarget.getBoundingClientRect().bottom }) }}
                      title={t.dragHint}
                    >
                      <div className="tl-when">
                        {/* the time is editable: set when you really get there, the rest of the day re-times from it */}
                        <input
                          type="time" step="300" className={'tl-time' + (it.at ? ' is-fixed' : '')} draggable={false}
                          aria-label={t.timeOf(it.place)} title={t.timeEdit} value={(clock?.times[j] ?? it.time ?? '').padStart(5, '0')}
                          onChange={e => e.target.value && onTime(i, j, e.target.value)}
                        />
                        {it.at && <button type="button" className="tl-auto" aria-label={t.timeAutoHint} title={t.timeAutoHint} onClick={() => onTime(i, j, null)}><ArrowCounterClockwiseIcon size={15} weight="bold" aria-hidden /></button>}
                      </div>
                      <div>
                        {idx != null ? (
                          <button className="tl-place" aria-pressed={idx === picked} onClick={() => onPick(idx)}>
                            <span className="pin pin-inline" style={{ '--ink': inkOf(i).bg, '--on-ink': inkOf(i).fg }} aria-hidden>{tags[idx]?.n}</span>
                            <strong>{it.place}</strong>
                          </button>
                        ) : (
                          <>
                            <strong>{it.place}</strong>
                            <Venue
                              t={t} venue={it.venue} n={venueTags[key]?.n} ink={inkOf(i)} picked={picked === key} onPick={() => onPick(key)} near={prev || stop} editing={editing === key}
                              onEdit={on => setEditing(on ? key : null)} onSet={v => { setEditing(null); onVenue(i, j, v) }}
                            />
                          </>
                        )}
                        {it.note && <p>{it.note}</p>}
                        <p className="meta">
                          <Stay t={t} minutes={stayMinutes(stop, it)} onSet={m => onStay(i, j, m)} />
                          {p?.url && <a href={p.url} target="_blank" rel="noreferrer" draggable={false}>{t.readMore} <ArrowSquareOutIcon size={13} aria-hidden /></a>}
                        </p>
                      </div>
                      {p?.img && <img src={p.img} alt="" loading="lazy" draggable={false} />}
                      <button
                        type="button" className="icon-btn row-menu" aria-label={t.moveMenu(it.place)} title={t.moveMenu(it.place)}
                        onClick={e => { const r = e.currentTarget.getBoundingClientRect(); setMenu({ at: { d: i, i: j }, x: r.left - 180, y: r.bottom }) }}
                      >
                        <DotsThreeVerticalIcon size={20} weight="bold" aria-hidden />
                      </button>
                    </li>
                  )
                  return j > 0 || walk != null ? [<Transfer key={`t${j}`} t={t} walk={walk} tr={it.transfer} drive={walk != null ? d.route?.drives?.[leg] : null} go={it.go} onGo={m => onGo(i, j, m)} />, row] : [row]
                })}
                {home && last !== home && [
                  <Transfer key="back" t={t} walk={d.route?.legs?.[leg + 1] ?? walkMinutes(last, home)} drive={d.route?.drives?.[leg + 1]} go={d.backGo} onGo={m => onGo(i, 'back', m)} />,
                  <HotelRow key="hotel-end" t={t} name={home.name} back time={clock?.back} />,
                ]}
              </ol>
            </li>
          )
        })}
      </ol>
      {menu && <ItemMenu t={t} lang={lang} days={stop.days} {...menu} onMove={onMove} onRemove={onRemove} onInsert={(at, b) => { onInsert(at, b); setEditing(`${at.d}:${at.i + 1}`) }} onClose={() => setMenu(null)} />}
    </>
  )
}

// The hotel is place 0 of every day: where it starts and where it ends.
// Where a meal or break happens: none until the traveller picks a restaurant, café or bar near the previous stop.
function Venue({ t, venue, n, ink, picked, onPick, near, editing, onEdit, onSet }) {
  // Keyed on the coordinates: the stop object changes on every update and would restart the debounce.
  const lat = near?.lat, lng = near?.lng
  const search = useCallback(q => (q.trim().length < 2 ? [] : searchFood(q, { lat, lng })), [lat, lng])
  if (editing) {
    return (
      <Combobox
        label={t.venueAsk} placeholder={t.venuePh} emptyText={t.noVenue} autoFocus delay={300}
        value={null} display={v => v.name} onChange={async v => onSet(await resolvePlace(v))} search={search} onDismiss={() => onEdit(false)}
        renderOption={v => <><b>{v.name}</b> <span className="muted">{v.addr}</span>{v.gid && <span className="by-google">Google Maps</span>}</>}
      />
    )
  }
  if (!venue) return <button className="link venue-add" onClick={() => onEdit(true)}><ForkKnifeIcon size={14} aria-hidden /> {t.chooseVenue}</button>
  return (
    <div className="venue">
      <p>
        <button className="tl-place" aria-pressed={picked} onClick={onPick} disabled={venue.lat == null}>
          {n && <span className="pin pin-inline" style={{ '--ink': ink.bg, '--on-ink': ink.fg }} aria-hidden>{n}</span>}
          <ForkKnifeIcon size={14} aria-hidden /> <b>{venue.name}</b>
        </button>
      </p>
      <p className="venue-sub">
        {venue.addr && <span>{venue.addr}</span>}
        <button className="link" onClick={() => onEdit(true)}>{t.change}</button>
        <button className="link" onClick={() => onSet(null)}>{t.remove}</button>
      </p>
    </div>
  )
}

function HotelRow({ t, name, back, time }) {
  return (
    <li className="tl-hotel">
      <span className="tl-hotel-icon"><BedIcon size={18} aria-hidden /></span>
      <div>
        <span className="tl-place"><span className="pin pin-inline" aria-hidden>0</span><strong>{name}</strong></span>
        <p>{back ? t.hotelBack : t.hotelLeave}{time && <> · <b>{time}</b></>}</p>
      </div>
    </li>
  )
}

// Where the traveller sleeps in this stop: typed in, never suggested. Saving it recomputes the walking times.
function HotelBox({ t, stop, onSave }) {
  const saved = stop.hotel?.name || ''
  const [editing, setEditing] = useState(!saved)
  const { lat, lng, city, country } = stop // stop changes on every update: key the search on these
  const search = useCallback(q => (q.trim().length < 2 ? [] : searchHotels(q, { lat, lng, city, country })), [lat, lng, city, country])

  if (!editing) {
    return (
      <div className="hotel-box">
        <p className="hotel-saved"><BedIcon size={18} aria-hidden /> <strong>{saved}</strong>
          <button className="link" onClick={() => setEditing(true)}>{t.change}</button>
        </p>
        {stop.hotel.lat == null && <p className="note">{t.hotelNotFound}</p>}
      </div>
    )
  }
  return (
    <div className="hotel-box">
      <Combobox
        label={t.hotelAsk(stop.city)} placeholder={t.hotelPh} emptyText={t.noHotel} delay={300} autoFocus={!!saved}
        value={stop.hotel?.lat != null ? stop.hotel : null} display={h => h.name} search={search}
        onChange={async h => { setEditing(false); onSave(await resolvePlace(h)) }} onDismiss={saved ? () => setEditing(false) : undefined}
        renderOption={h => <><b>{h.name}</b> <span className="muted">{h.addr}</span>{h.gid && <span className="by-google">Google Maps</span>}</>}
      />
      <p className="hint">{t.hotelHint}</p>
      {saved && <button className="link" onClick={() => { onSave(null); setEditing(true) }}>{t.hotelRemove}</button>}
    </div>
  )
}

// Only the places the itinerary does not visit yet: they have no number until a day visits them.
// "I have heard of it": find a sight the AI did not suggest, preview it, add it to a day (or keep it under Luoghi).
function FindPlace({ t, stop, lang, inkOf, onAdd }) {
  const [found, setFound] = useState(null) // { name, addr, lat, lng, wiki? }
  const [menu, setMenu] = useState(null) // {x, y}
  const [loading, setLoading] = useState(false)
  const search = useCallback(q => searchSights(q, stop), [stop])
  const pick = async p => {
    setLoading(true)
    setFound({ ...p })
    try {
      const full = await resolvePlace(p)
      const wiki = await wikiFor(lang, full.name, full.lat, full.lng).catch(() => null)
      setFound({ ...full, wiki })
    } finally {
      setLoading(false)
    }
  }
  const add = d => {
    const w = found.wiki
    onAdd({
      name: found.name, why: found.addr || t.addedByYou, minutes: 60, mine: true,
      lat: found.lat ?? w?.lat ?? null, lng: found.lng ?? w?.lng ?? null,
      ...(w && { img: w.img, extract: w.extract, url: w.url }),
    }, d)
    setFound(null)
  }
  return (
    <section className="find-place">
      <Combobox
        label={t.findPlace} placeholder={t.findPlacePh} emptyText={t.noPlace} delay={300}
        value={null} display={p => p?.name || ''} onChange={pick} search={search}
        renderOption={p => <><b>{p.name}</b> <span className="muted">{p.addr}</span></>}
      />
      {found && (
        <div className="find-card" aria-busy={loading}>
          {found.wiki?.img && <img src={found.wiki.img} alt="" />}
          <div>
            <h3>{found.name}</h3>
            {found.addr && <p className="muted">{found.addr}</p>}
            {found.wiki?.extract && <p className="place-extract">{found.wiki.extract}</p>}
            {!loading && found.lat == null && <p className="note">{t.notOnMap}</p>}
          </div>
          <div className="find-days">
            <button className="btn btn-ink" onClick={e => setMenu(menuAt(e))} disabled={loading} aria-haspopup="menu">
              <DotsThreeVerticalIcon size={18} weight="bold" aria-hidden /> {t.addToItinerary}
            </button>
            <button className="btn btn-quiet" onClick={() => add(null)} disabled={loading}>{t.keepInPlaces}</button>
            <button className="btn btn-quiet" onClick={() => setFound(null)}>{t.cancel}</button>
          </div>
        </div>
      )}
      {menu && found && <PlaceMenu t={t} lang={lang} days={stop.days} inkOf={inkOf} {...menu} onAdd={add} onClose={() => setMenu(null)} />}
    </section>
  )
}

function Places({ t, stop, lang, picked, onPick, inkOf, onAddPlace, onSchedule, onDropPlace }) {
  const [menu, setMenu] = useState(null) // {i, x, y}
  const used = new Set(stop.days.flatMap(d => d.items.map(it => placeIndex(stop, it))))
  const rest = stop.places.map((p, i) => [p, i]).filter(([, i]) => !used.has(i))
  return (
    <>
    <FindPlace t={t} stop={stop} lang={lang} inkOf={inkOf} onAdd={onAddPlace} />
    {!rest.length ? <p className="muted">{t.allInItinerary}</p> : <>
    <p className="hint">{t.placesNote}</p>
    <ol className="places">
      {rest.map(([p, i]) => (
        <li key={p.name} data-place={i} className={'place' + (i === picked ? ' is-picked' : '')} onContextMenu={e => { e.preventDefault(); setMenu({ i, ...menuAt(e) }) }}>
          <div className="place-img">
            {p.img ? <img src={p.img} alt={p.name} loading="lazy" /> : <span className="place-noimg" aria-hidden>•</span>}
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
          <button type="button" className="icon-btn row-menu place-menu" aria-label={t.placeMenu(p.name)} title={t.placeMenu(p.name)} aria-haspopup="menu"
            onClick={e => setMenu({ i, ...menuAt(e) })}>
            <DotsThreeVerticalIcon size={20} weight="bold" aria-hidden />
          </button>
        </li>
      ))}
    </ol>
    </>}
    {menu && <PlaceMenu t={t} lang={lang} days={stop.days} inkOf={inkOf} x={menu.x} y={menu.y}
      onAdd={k => onSchedule(menu.i, k)} onRemove={() => onDropPlace(menu.i)} onClose={() => setMenu(null)} />}
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

// A stop added to a trip already made: where, how many days, before or after the stop on screen.
function AddStop({ t, current, onAdd, onCancel }) {
  const [f, setF] = useState({ city: '', country: current.country || '', nights: 1, before: false })
  const set = patch => setF(x => ({ ...x, ...patch }))
  return (
    <form className="add-stop" onSubmit={e => { e.preventDefault(); if (f.city.trim()) onAdd({ ...f, city: f.city.trim(), country: f.country.trim() }) }}>
      <h3>{t.newStop}</h3>
      <div className="add-stop-row">
        <label className="field"><span>{t.formCity}</span><input value={f.city} onChange={e => set({ city: e.target.value })} required autoFocus /></label>
        <label className="field"><span>{t.formCountry}</span><input value={f.country} onChange={e => set({ country: e.target.value })} /></label>
        <label className="field field-num"><span>{t.formNights}</span><input type="number" min="1" max="30" value={f.nights} onChange={e => set({ nights: Math.max(1, +e.target.value || 1) })} /></label>
      </div>
      <div className="seg" role="radiogroup" aria-label={t.newStop}>
        <button type="button" role="radio" aria-checked={!f.before} onClick={() => set({ before: false })}>{t.afterStop(current.city)}</button>
        <button type="button" role="radio" aria-checked={f.before} onClick={() => set({ before: true })}>{t.beforeStop(current.city)}</button>
      </div>
      <div className="row">
        <button className="btn btn-primary" disabled={!f.city.trim()}>{t.addAndPlan}</button>
        <button type="button" className="btn btn-quiet" onClick={onCancel}>{t.cancel}</button>
      </div>
    </form>
  )
}

export default function StopPanel({ t, trip, active, onSelect, inks, tab, setTab, day, setDay, picked, onPick, onAddPlace, onSchedule, onDropPlace, onStart, onStay, onTime, onMove, onRemove, onInsert, onVenue, onGo, busy, errors, settings, run, onSaveHotel, onDelete, onDates, onAddStop, onRemoveStop }) {
  const stop = trip.stops[active]
  const lang = trip.lang
  const from = addDays(trip.startDate, stopOffsets(trip)[active])
  const to = addDays(from, stop.nights - 1) // last day of the stop
  const k = job => `${stop.id}:${job}`
  const tabs = [['days', t.tabDays], ['places', t.tabPlaces], ['moves', t.tabMoves]]
  const noSearch = !canSearch(settings) ? t.noSearch : null
  const [tripMenu, setTripMenu] = useState(null) // {x, y} of the open ⋮ menu
  const [adding, setAdding] = useState(false) // the new-stop form is open

  // A place picked on the map scrolls into view in whichever list is showing.
  useEffect(() => {
    if (picked == null) return
    document.querySelector(`.tabpanel [data-place="${picked}"]`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [picked, tab])

  // Heights of the sticky stop head and tab bar, so the layers below them stick right under (phone layout).
  const root = useRef(null)
  useLayoutEffect(() => {
    const el = root.current, head = el.querySelector('.stop-head'), bar = el.querySelector('.tabs')
    const ro = new ResizeObserver(() => { el.style.setProperty('--head-h', `${head.getBoundingClientRect().height}px`); el.style.setProperty('--tabs-h', `${bar.getBoundingClientRect().height}px`) })
    ro.observe(head); ro.observe(bar)
    return () => ro.disconnect()
  }, [])

  return (
    <div className="stop-panel" ref={root}>
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
          <h1>{stop.city}{trip.stops.length > 1 && <CaretDownIcon className="stop-caret" size={22} weight="bold" aria-hidden />}</h1>
          {/* first day and number of days are editable (native pickers under the text); the last day follows */}
          <p className="stop-dates">
            <label className="stop-edit">
              <span>{fmtDate(lang, from, { day: 'numeric', month: 'short' })}</span>
              <input type="date" aria-label={t.arrival} value={from} onClick={e => e.currentTarget.showPicker?.()} onChange={e => e.target.value && onDates({ start: e.target.value })} />
            </label>
            {' – '}{fmtDate(lang, to, { day: 'numeric', month: 'short' })}{' · '}
            <label className="stop-edit">
              <span>{t.nights(stop.nights)}</span>
              <select aria-label={t.formNights} value={stop.nights} onChange={e => onDates({ nights: +e.target.value })}>
                {Array.from({ length: 30 }, (_, i) => i + 1).map(n => <option key={n} value={n}>{t.nights(n)}</option>)}
              </select>
            </label>
          </p>
        </div>
        {/* phone: the head is the stop switcher (the stop chips are hidden there); a native picker over it */}
        {trip.stops.length > 1 && (
          <select className="stop-pick" aria-label={t.formWhere} value={active} onChange={e => onSelect(+e.target.value)}>
            {trip.stops.map((s, i) => <option key={s.id} value={i}>{String(i + 1).padStart(2, '0')} · {s.city}</option>)}
          </select>
        )}
        <button className="icon-btn icon-btn-ink" aria-label={t.stopMenu} title={t.stopMenu} aria-haspopup="menu" aria-expanded={!!tripMenu} onClick={e => { const r = e.currentTarget.getBoundingClientRect(); setTripMenu({ x: r.right - 260, y: r.bottom + 6 }) }}>
          <DotsThreeVerticalIcon size={22} weight="bold" aria-hidden />
        </button>
      </header>
      {tripMenu && (
        <StopMenu
          t={t} city={stop.city} single={trip.stops.length === 1} {...tripMenu} busy={busy[k('plan')]}
          onAdd={() => setAdding(true)} onReplan={() => run('plan')} onRemoveStop={onRemoveStop} onDeleteTrip={onDelete} onClose={() => setTripMenu(null)}
        />
      )}
      {adding && <AddStop t={t} current={stop} onCancel={() => setAdding(false)} onAdd={x => { setAdding(false); onAddStop(x) }} />}
      {stop.summary && <p className="stop-summary">{stop.summary}</p>}
      {stop.planned && tab === 'days' && <HotelBox key={stop.id} t={t} stop={stop} onSave={onSaveHotel} />}

      <div className="tabs" role="tablist">
        {tabs.map(([id, label]) => (
          <button key={id} role="tab" id={`tab-${id}`} aria-selected={tab === id} aria-controls="tabpanel" onClick={() => setTab(id)}>{label}</button>
        ))}
      </div>

      <div className="tabpanel" role="tabpanel" id="tabpanel" aria-labelledby={`tab-${tab}`}>
        <h2 className="sr-only">{tabs.find(([id]) => id === tab)?.[1]}</h2>
        {(tab === 'days' || tab === 'places') && (
          busy[k('plan')] ? <><p className="muted">{t.planningStop(stop.city)}</p><Skeleton rows={8} /></>
          : errors[k('plan')] ? <div className="fetch"><p className="error" role="alert">{errors[k('plan')]}</p><button className="btn btn-ink" onClick={() => run('plan')}>{t.retry}</button></div>
          : !stop.planned ? <div className="fetch"><button className="btn btn-ink" onClick={() => run('plan')}>{t.replan}</button></div>
          : tab === 'days' ? <Days t={t} stop={stop} lang={lang} picked={picked} onPick={onPick} onMove={onMove} onRemove={onRemove} onInsert={onInsert} onVenue={onVenue} onGo={onGo} onStart={onStart} onStay={onStay} onTime={onTime} inkOf={d => dayTone(inks[0], d, stop.days.length)} day={Math.min(day, stop.days.length - 1)} setDay={setDay} /> : <Places t={t} stop={stop} lang={lang} picked={picked} onPick={onPick} inkOf={d => dayTone(inks[0], d, stop.days.length)} onAddPlace={onAddPlace} onSchedule={onSchedule} onDropPlace={onDropPlace} />
        )}

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

    </div>
  )
}
