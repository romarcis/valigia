export const addDays = (iso, n) => {
  const d = new Date(iso + 'T12:00:00')
  d.setDate(d.getDate() + n)
  return d.toISOString().slice(0, 10)
}

// Day offset of each stop from trip start.
// Day offset of each stop from the trip start. A stop's `nights` field holds its number of DAYS (the name is
// kept for saved trips): stops follow one another, the next one starting the day after the last day of this one.
export const stopOffsets = trip => trip.stops.reduce((acc, s, i) => [...acc, i ? acc[i - 1] + trip.stops[i - 1].nights : 0], [])

// Walking minutes between two {lat,lng}: straight-line distance x1.3 for street detours, at 4.8 km/h.
// ponytail: crow-flies estimate, swap for a routing API if users need door-to-door accuracy.
export function walkMinutes(a, b) {
  if (a?.lat == null || b?.lat == null) return null
  const R = 6371, rad = d => (d * Math.PI) / 180
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2
  const km = 2 * R * Math.asin(Math.sqrt(h))
  return Math.max(1, Math.round(((km * 1.3) / 4.8) * 60))
}

// Normalises the AI's day plan: 0-based placeIdx on each item, no place visited on two days
// (later repeats are dropped), and no transfer on a day's first item.
export function cleanDays(days, placeCount) {
  const seen = new Set()
  let dropped = 0
  const out = days.map(d => {
    const items = []
    for (const it of d.items || []) {
      const i = Number.isInteger(it.place_index) && it.place_index >= 1 && it.place_index <= placeCount ? it.place_index - 1 : null
      if (i != null && seen.has(i)) { dropped++; continue }
      if (i != null) seen.add(i)
      const { place_index, ...rest } = it
      items.push({ ...rest, placeIdx: i, transfer: items.length ? it.transfer || null : null })
    }
    return { ...d, items }
  })
  return { days: out, dropped }
}

// Numbers places in the order the itinerary visits them (places on no day go last), so pins read
// 1, 2, 3… down the days. Returns { places, days } with every placeIdx remapped to the new order.
export function renumber(places, days) {
  const idxOf = it => it.placeIdx ?? (i => (i < 0 ? null : i))(places.findIndex(p => p.name === it.place)) // old plans: by name
  const order = []
  for (const d of days) for (const it of d.items) { const i = idxOf(it); if (i != null && !order.includes(i)) order.push(i) }
  places.forEach((_, i) => order.includes(i) || order.push(i))
  const to = new Map(order.map((old, n) => [old, n]))
  return {
    places: order.map(i => places[i]),
    days: days.map(d => ({ ...d, items: d.items.map(it => { const i = idxOf(it); return { ...it, placeIdx: i == null ? null : to.get(i) } }) })),
  }
}

// Joins OSRM legs into one line, remembering where each leg ends: cuts[k] is the index in coords
// of waypoint k + 1 (waypoint 0 is coords[0]).
export function joinLegs(legs) {
  const coords = [], cuts = []
  for (const leg of legs) {
    for (const s of leg.steps) coords.push(...s.geometry.coordinates)
    cuts.push(coords.length - 1)
  }
  return { coords, cuts }
}

// The stretch of a day's route from its start to waypoint w (nothing for w = 0).
export const routeUpTo = (route, w) => (w > 0 ? route.coords.slice(0, route.cuts[w - 1] + 1) : [])

// Numbers of the itinerary, restarting from 1 every day (the hotel is 0): places and chosen meal venues share
// the day's sequence. places[placeIndex] = { day, n } (undefined for places no day visits);
// venues[`${day}:${item}`] = { day, n }.
export function dayNumbers(stop) {
  const places = [], venues = {}
  stop.days?.forEach((d, day) => {
    let n = 0
    d.items.forEach((it, j) => {
      const i = it.placeIdx ?? stop.places.findIndex(p => p.name === it.place)
      if (i >= 0) { if (!places[i]) places[i] = { day, n: ++n } }
      else if (it.venue) venues[`${day}:${j}`] = { day, n: ++n }
    })
  })
  return { places, venues }
}
export const placeTags = stop => dayNumbers(stop).places

// Removes the places still without coordinates (and their itinerary items), keeping every placeIdx right.
// Returns { places, days, dropped: [names] }; the same arrays when nothing is missing.
export function dropUnlocated(places, days) {
  const gone = new Set(places.flatMap((p, i) => (p.lat == null ? [i] : [])))
  if (!gone.size) return { places, days, dropped: [] }
  const kept = days.map(d => {
    const items = d.items.filter(it => !gone.has(it.placeIdx))
    return { ...d, items: items.map((it, k) => (k ? it : { ...it, transfer: null })) } // a new first item has no transfer
  })
  const r = renumber(places, kept) // dropped places are visited by no day: they end up last
  return { places: r.places.filter(p => p.lat != null), days: r.days, dropped: [...gone].map(i => places[i].name) }
}

// Do two names of a sight share a meaningful word? Generic words (church, palace, saint…) and accents
// are ignored: "Chiesa di San Michele Arcangelo" matches "Chiesa di San Michele", not "Chiesa di San Pietro".
// ponytail: Italian/English generic words only; extend GENERIC if other languages give false matches.
const GENERIC = new Set(['chiesa', 'del', 'della', 'dei', 'degli', 'delle', 'san', 'santo', 'santa', 'santi', 'sant', 'palazzo', 'museo', 'piazza', 'parrocchiale', 'basilica', 'castello', 'torre', 'villa', 'church', 'saint', 'the', 'palace', 'museum', 'square'])
const words = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').split(/[^a-z0-9]+/).filter(w => w.length > 2 && !GENERIC.has(w))
export const sameName = (a, b) => { const wb = new Set(words(b)); return words(a).some(w => wb.has(w)) }

// Day d (0-based) of a stop with n days, as a tone of the stop's ink: day 1 is the ink itself, later days
// mix it with the paper (down to 35%), so days stay told apart without borrowing another stop's ink.
// Text on the tone is white or navy, whichever contrasts more.
const mix = (a, b, t) => '#' + [1, 3, 5].map(i => Math.round(parseInt(a.slice(i, i + 2), 16) * t + parseInt(b.slice(i, i + 2), 16) * (1 - t)).toString(16).padStart(2, '0')).join('')
const lum = hex => {
  const c = [1, 3, 5].map(i => { const v = parseInt(hex.slice(i, i + 2), 16) / 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4 })
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]
}
export const contrast = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05) }
// Time for a new item at the end of a day: 90 minutes after the last one, or 10:00 on an empty day.
export function nextSlot(items) {
  const last = [...items].reverse().map(it => /^(\d{1,2}):(\d{2})$/.exec(it.time || '')).find(Boolean)
  if (!last) return '10:00'
  const m = Math.min(23 * 60, +last[1] * 60 + +last[2] + 90)
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
}

// Lithographic label inks, one per stop in travel order (also used for the days of a stop).
export const INKS = [
  { bg: '#c8402a', fg: '#ffffff' },
  { bg: '#e3a72b', fg: '#16213f' },
  { bg: '#2a47a0', fg: '#ffffff' },
  { bg: '#1f6b4c', fg: '#ffffff' },
  { bg: '#b8506f', fg: '#ffffff' },
  { bg: '#1d6f78', fg: '#ffffff' },
]

// Colour of day d of a stop: day 1 is the stop's ink, the next days take the following inks of the
// palette, so every day is a different colour. Past the sixth day the inks repeat, lighter.
export function dayTone(ink, d) {
  if (!d) return ink
  const start = Math.max(0, INKS.findIndex(x => x.bg === ink.bg))
  const base = INKS[(start + d) % INKS.length]
  const round = Math.floor(d / INKS.length)
  if (!round) return base
  const bg = mix(base.bg, '#eef0f2', 0.6)
  return { bg, fg: contrast(bg, '#ffffff') >= contrast(bg, '#16213f') ? '#ffffff' : '#16213f' }
}

// Removes itinerary item at = {d, i}. The item that now follows the gap loses its AI transit estimate and
// its mode choice (both described the leg from the removed item), and the day loses its street route.
export function removeItem(days, at) {
  return days.map((d, k) => {
    if (k !== at.d) return d
    const { route, ...rest } = d
    const items = d.items.filter((_, i) => i !== at.i)
    return { ...rest, items: items.map((it, i) => (i === at.i || i === 0 ? { ...it, transfer: null, go: undefined } : it)) }
  })
}

// Inserts a break (coffee, lunch, dinner: no place, a venue can be chosen later) right after item at = {d, i}.
// Its time sits halfway to the next item, or an hour after the last one. The walk is unchanged: a break
// without a venue is not a stop of the route.
const toMin = hhmm => { const [h, m] = (hhmm || '').split(':').map(Number); return Number.isFinite(h) ? h * 60 + (m || 0) : null }
const toHHMM = min => `${String(Math.floor(min / 60) % 24).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`
export function insertBreak(days, at, place) {
  return days.map((d, k) => {
    if (k !== at.d) return d
    const now = toMin(d.items[at.i]?.time), next = toMin(d.items[at.i + 1]?.time)
    const time = now == null ? '' : toHHMM(next != null && next > now ? Math.round((now + next) / 2 / 5) * 5 : now + 60)
    const items = [...d.items]
    items.splice(at.i + 1, 0, { time, place, placeIdx: null, note: '', transfer: null })
    return { ...d, items }
  })
}

// Moves an itinerary item. from = {d, i}; to = {d, i} where to.i is the insert position among the
// target day's current items (before removal). Time slots stay with their positions: places move
// through them. Touched days lose their street route (recomputed later); items whose predecessor
// changed lose the AI transit estimate, which described the old leg.
export function moveItem(days, from, to) {
  const out = days.map(d => ({ ...d, items: [...d.items] }))
  const slots = out.map(d => d.items.map(it => it.time))
  const [item] = out[from.d].items.splice(from.i, 1)
  let at = to.i
  if (from.d === to.d && to.i > from.i) at--
  if (from.d === to.d && at === from.i) return days
  out[to.d].items.splice(at, 0, item)
  if (from.d !== to.d) {
    slots[from.d].splice(from.i, 1)
    slots[to.d] = [...slots[to.d], item.time].sort()
  }
  for (const d of new Set([from.d, to.d])) {
    const before = days[d].items
    out[d].items = out[d].items.map((it, k) => {
      const prevNow = out[d].items[k - 1]
      const prevBefore = before[before.indexOf(it) - 1]
      const same = before.includes(it) && prevNow === prevBefore
      return { ...it, time: slots[d][k] ?? it.time, transfer: k && same ? it.transfer : null }
    })
    delete out[d].route
  }
  return out
}

// ---- Day timetable from a chosen start time --------------------------------------------------
// Breaks without a place: typical length, and meals never start before their usual hour.
function breakRule(name) {
  const n = (name || '').toLowerCase()
  // "tè" / "tea" as a whole word (\b ignores accented letters), so "Teatro" is not a tea break
  if (/caff|coffee|aperitiv|snack|merend|(^|[^a-zà-ù])(t[eè]|tea)($|[^a-zà-ù])/.test(n)) return { min: 20 }
  if (/colazion|breakfast/.test(n)) return { min: 30 }
  if (/pranz|lunch/.test(n)) return { min: 60, from: 12 * 60 + 30 }
  if (/\bcen|dinner/.test(n)) return { min: 90, from: 19 * 60 + 30 }
  return { min: 45 }
}

// How long the traveller stays at an item: the visit length of a place, or a break's (own or typical) length.
export function stayMinutes(stop, it) {
  const p = stop.places[it.placeIdx ?? stop.places.findIndex(x => x.name === it.place)]
  return p ? p.minutes || 60 : it.minutes || breakRule(it.place).min
}

// Minutes of one leg with the mode the traveller picked (`go`), like the transfer row shows it:
// the chosen mode when it has a time, else walking, else whatever is known.
export function legMinutes({ walk, drive, tr, go }) {
  const by = { walk, car: drive?.min ?? tr?.car_min, metro: tr?.metro?.min, tram: tr?.tram?.min, bus: tr?.bus?.min }
  return by[go] ?? walk ?? drive?.min ?? tr?.car_min ?? 0
}

// When a day starts: the time the traveller chose, else the earliest time the AI planned (stable when items are reordered).
export function dayStart(d) {
  if (d.start) return d.start
  const ts = d.items.map(it => it.time).filter(x => /^\d{1,2}:\d{2}$/.test(x || '')).sort((a, b) => toMin(a) - toMin(b))
  return ts[0] || '09:00'
}

// Times of a day's items when it starts at `start` ('HH:MM'): leave the hotel (if any), travel each leg
// with the chosen mode, stay the visit length, and so on. Returns { times: ['HH:MM' per item], back }.
// The walk legs follow the same order the day's route was computed with: the located items, from the hotel.
export function dayTimes(stop, d, start) {
  if (!/^\d{1,2}:\d{2}$/.test(start || '')) return null
  let cursor = toMin(start)
  const placeOf = it => stop.places[it.placeIdx ?? stop.places.findIndex(p => p.name === it.place)]
  const home = stop.hotel?.lat != null && d.items.some(it => (placeOf(it) || it.venue)?.lat != null) ? stop.hotel : null
  let last = home, leg = -1
  const times = d.items.map(it => {
    const p = placeOf(it)
    const point = p || it.venue
    if (point?.lat != null && last) {
      leg++
      cursor += legMinutes({ walk: d.route?.legs?.[leg] ?? walkMinutes(last, point), drive: d.route?.drives?.[leg], tr: it.transfer, go: it.go })
    }
    const rule = p ? { min: p.minutes || 60 } : { ...breakRule(it.place), ...(it.minutes && { min: it.minutes }) }
    if (rule.from && cursor < rule.from) cursor = rule.from
    cursor = Math.ceil(cursor / 5) * 5
    // a time the traveller set on the spot (running late, or early): this item starts then, the rest follows
    if (/^\d{1,2}:\d{2}$/.test(it.at || '')) cursor = toMin(it.at)
    const at = cursor
    cursor += rule.min
    if (point?.lat != null) last = point
    return toHHMM(at)
  })
  let back = null
  if (home && last && last !== home) {
    const min = legMinutes({ walk: d.route?.legs?.[leg + 1] ?? walkMinutes(last, home), drive: d.route?.drives?.[leg + 1], go: d.backGo })
    back = toHHMM(Math.ceil((cursor + min) / 5) * 5)
  }
  return { times, back }
}

// ---- Currencies ----
// Currency of the traveller: chosen in Settings, else the one of the device's region (it-IT -> EUR, en-GB -> GBP).
const EURO = 'AT BE HR CY EE FI FR DE GR IE IT LV LT LU MT NL PT SK SI ES AD MC SM VA ME XK'.split(' ')
const BY_REGION = {
  GB: 'GBP', US: 'USD', CH: 'CHF', LI: 'CHF', CA: 'CAD', AU: 'AUD', NZ: 'NZD', JP: 'JPY', CN: 'CNY', HK: 'HKD', TW: 'TWD',
  KR: 'KRW', IN: 'INR', SG: 'SGD', TH: 'THB', MY: 'MYR', ID: 'IDR', PH: 'PHP', VN: 'VND', AE: 'AED', SA: 'SAR', IL: 'ILS',
  TR: 'TRY', EG: 'EGP', MA: 'MAD', ZA: 'ZAR', BR: 'BRL', AR: 'ARS', MX: 'MXN', CL: 'CLP', CO: 'COP', PE: 'PEN',
  NO: 'NOK', SE: 'SEK', DK: 'DKK', IS: 'ISK', PL: 'PLN', CZ: 'CZK', HU: 'HUF', RO: 'RON', BG: 'BGN', RS: 'RSD', BA: 'BAM',
  AL: 'ALL', MK: 'MKD', UA: 'UAH', GE: 'GEL', AM: 'AMD', AZ: 'AZN', KZ: 'KZT', JO: 'JOD', QA: 'QAR', KW: 'KWD', TN: 'TND',
}
export const CURRENCIES = ['EUR', 'GBP', 'USD', 'CHF', 'JPY', 'CAD', 'AUD', 'SEK', 'NOK', 'DKK', 'PLN', 'CZK', 'HUF', 'TRY', 'BRL', 'INR', 'CNY']

export function regionCurrency(locale) {
  let region
  try { region = new Intl.Locale(locale).maximize().region } catch { return 'EUR' }
  return EURO.includes(region) ? 'EUR' : BY_REGION[region] || 'EUR'
}

// amount in `from` -> `to`, with rates against a common base (EUR). null when a rate is missing.
export function convert(amount, from, to, rates) {
  if (amount == null || from === to) return amount
  const a = rates?.[from], b = rates?.[to]
  return a && b ? (amount / a) * b : null
}

// An amount the AI may write as a number or as text ("2.750 TRY", "€ 20,50", "1,250.00"): the number, or null.
export function toAmount(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  if (typeof v !== 'string') return null
  let s = v.replace(/[^\d.,]/g, '')
  if (!s) return null
  const lastDot = s.lastIndexOf('.'), lastComma = s.lastIndexOf(',')
  const dec = Math.max(lastDot, lastComma)
  // a separator followed by exactly 1-2 digits at the end is the decimal one; the others group thousands
  if (dec >= 0 && s.length - dec - 1 <= 2 && s.length - dec - 1 > 0) s = s.slice(0, dec).replace(/[.,]/g, '') + '.' + s.slice(dec + 1)
  else s = s.replace(/[.,]/g, '')
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

// A fresh ticket search replaces the saved one, unless it found no prices where the saved one had some.
export const keepTicket = (old, fresh) => !!old?.prices?.length && !fresh.prices.length && fresh.needed !== false

// A stop's arrival day or length changed: { start } moves the whole trip so this stop begins that day
// (stops follow one another); { nights } resizes the stop, adding empty days or dropping its last ones
// (their places go back to the unscheduled list), and the stops after it slide. Every day is re-dated.
export function reschedule(trip, idx, { start, nights }) {
  let t = trip
  if (start) t = { ...t, startDate: addDays(start, -stopOffsets(t)[idx]) }
  if (nights >= 1) {
    t = { ...t, stops: t.stops.map((s, i) => {
      if (i !== idx) return s
      const days = (s.days || []).slice(0, nights)
      while (s.days && days.length < nights) days.push({ title: '', items: [] })
      return { ...s, nights, days }
    }) }
  }
  return redate(t)
}

// Every day of every stop gets its date again from the trip start and the stops' lengths.
function redate(t) {
  const at = stopOffsets(t)
  return { ...t, stops: t.stops.map((s, i) => (s.days ? { ...s, days: s.days.map((d, k) => ({ ...d, date: addDays(t.startDate, at[i] + k) })) } : s)) }
}

// A new stop next to stop idx. The stops already planned keep their dates: one put before the first stop
// moves the trip start earlier, any other pushes only the stops after it later.
export function insertStop(trip, idx, stop, before) {
  const at = before ? idx : idx + 1
  const stops = [...trip.stops.slice(0, at), stop, ...trip.stops.slice(at)]
  return redate({ ...trip, startDate: at === 0 ? addDays(trip.startDate, -stop.nights) : trip.startDate, stops })
}

// Stop idx leaves the trip. The first one leaving moves the start to the next stop's first day (its dates stay);
// otherwise the stops after it move earlier to close the gap.
export function removeStop(trip, idx) {
  const startDate = idx === 0 ? addDays(trip.startDate, trip.stops[0].nights) : trip.startDate
  return redate({ ...trip, startDate, stops: trip.stops.filter((_, i) => i !== idx) })
}


// The trip's line through its stops as gentle arcs (a journey, not a road): a quadratic curve between each
// pair of [lng, lat] points, bowed to the left of the direction of travel by a fifth of the distance.
export function arcs(points, steps = 24) {
  if (points.length < 2) return points
  const out = [points[0]]
  for (let k = 1; k < points.length; k++) {
    const [x0, y0] = points[k - 1], [x1, y1] = points[k]
    const cx = (x0 + x1) / 2 - (y1 - y0) * 0.2, cy = (y0 + y1) / 2 + (x1 - x0) * 0.2
    for (let i = 1; i <= steps; i++) {
      const s = i / steps, u = 1 - s
      out.push([u * u * x0 + 2 * u * s * cx + s * s * x1, u * u * y0 + 2 * u * s * cy + s * s * y1])
    }
  }
  return out
}
