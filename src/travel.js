import { geocode } from './geo.js'
import { driveRoute } from './routing.js'
import { log } from './net.js'
import { loadAirports } from './airports.js'

// Curved line between two {lat,lng} so a flight reads as a flight, not a road.
export function arc(a, b, n = 48) {
  const dx = b.lng - a.lng, dy = b.lat - a.lat
  const bend = 0.18 // sideways bulge, as a share of the distance
  return Array.from({ length: n + 1 }, (_, i) => {
    const t = i / n, s = Math.sin(Math.PI * t) * bend
    return [a.lng + dx * t - dy * s, a.lat + dy * t + dx * s]
  })
}

// Fills in what the map needs once the stops are located: airport positions for flights,
// the driving route for car and motorbike. Returns the updated travel, or null when nothing to do yet.
export async function prepareTravel(trip) {
  const tv = trip.travel
  const first = trip.stops[0], last = trip.stops.at(-1)
  if (!tv) return null

  if (tv.mode === 'flight') {
    const todo = ['out', 'in'].filter(d => tv[d] && !tv[d].pts)
    if (!todo.length) return null
    const next = { ...tv }
    for (const d of todo) {
      const f = tv[d], a = f.legs[0].from, b = f.legs.at(-1).to
      const list = await loadAirports()
      const at = code => list.find(x => x.iata === code)
      const pa = at(a.id) || await geocode(`${a.id} airport`)
      const pb = at(b.id) || await geocode(`${b.id} airport`)
      next[d] = { ...f, pts: pa && pb ? [{ ...pa, label: a.id }, { ...pb, label: b.id }] : [] }
      if (!(pa && pb)) log('error', `Aeroporti non localizzati: ${a.id}, ${b.id}`)
    }
    return next
  }

  // car / moto
  if (tv.out || first?.lat == null || last?.lat == null) return null
  try {
    const home = tv.home || await geocode(tv.from) // older trips stored only the name
    if (!home) throw new Error(`"${tv.from}" non trovato`)
    const out = await driveRoute(home, first)
    const back = await driveRoute(last, home)
    return { ...tv, home, out: { ...out, from: tv.from, to: first.city }, in: { ...back, from: last.city, to: tv.from } }
  } catch (e) {
    log('error', `Percorso stradale non disponibile: ${e.message}`)
    return { ...tv, out: { failed: true }, in: { failed: true } }
  }
}

// Lines and end pins for the map.
export function travelLines(tv) {
  if (!tv) return []
  return ['out', 'in'].flatMap(d => {
    const x = tv[d]
    if (!x || x.failed) return []
    if (tv.mode === 'flight') return x.pts?.length === 2 ? [{ id: d, coords: arc(x.pts[0], x.pts[1]), pins: x.pts }] : []
    return x.coords ? [{ id: d, coords: x.coords, pins: d === 'out' ? [{ ...tv.home, label: tv.from }] : [] }] : []
  })
}
