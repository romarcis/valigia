export const addDays = (iso, n) => {
  const d = new Date(iso + 'T12:00:00')
  d.setDate(d.getDate() + n)
  return d.toISOString().slice(0, 10)
}

// Day offset of each stop from trip start.
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
export function dayTone(ink, d, n) {
  if (!d) return ink
  const bg = mix(ink.bg, '#eef0f2', 1 - d * Math.min(0.4, 0.65 / Math.max(1, n - 1)))
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
