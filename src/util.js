export const addDays = (iso, n) => {
  const d = new Date(iso + 'T12:00:00')
  d.setDate(d.getDate() + n)
  return d.toISOString().slice(0, 10)
}

// Day offset of each stop from trip start.
export const stopOffsets = trip => trip.stops.reduce((acc, s, i) => [...acc, i ? acc[i - 1] + trip.stops[i - 1].nights : 0], [])

// Hotels ranked by the chosen key. "value" = rating (0-10) per euro; unknown values sort last.
export function rankHotels(items, by) {
  const score = h => (h.rating && h.rating_scale ? (h.rating / h.rating_scale) * 10 : null)
  const key = {
    price: h => h.price_per_night_eur ?? Infinity,
    rating: h => -(score(h) ?? -Infinity),
    value: h => (score(h) && h.price_per_night_eur ? -(score(h) / h.price_per_night_eur) : Infinity),
  }[by]
  return [...items].sort((a, b) => key(a) - key(b) || 0).map(h => ({ ...h, score10: score(h) }))
}

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
