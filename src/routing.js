import { getJson, log } from './net.js'
import { joinLegs } from './util.js'

// Walking route along streets through points [{lat,lng}], via the FOSSGIS OSRM foot router (free, fair use).
// Returns { coords: [[lng,lat]...], cuts: [index in coords where each leg ends], legs: [minutes between consecutive points] };
// straight lines if routing fails.
export async function walkRoute(points) {
  if (points.length < 2) return { coords: [], cuts: [], legs: [] }
  const path = points.map(p => `${p.lng.toFixed(5)},${p.lat.toFixed(5)}`).join(';')
  try {
    const data = await getJson(`https://routing.openstreetmap.de/routed-foot/route/v1/foot/${path}?overview=false&steps=true&geometries=geojson`, { timeout: 20000, retries: 1 })
    const r = data.routes?.[0]
    if (data.code !== 'Ok' || !r) throw new Error(data.code || 'no route')
    return { ...joinLegs(r.legs), legs: r.legs.map(l => Math.max(1, Math.round(l.duration / 60))), streets: true }
  } catch (e) {
    log('error', `Percorso a piedi non disponibile (${e.message}): uso linee dritte`)
    return { coords: points.map(p => [p.lng, p.lat]), cuts: points.slice(1).map((_, k) => k + 1), legs: [], streets: false }
  }
}

// Driving distance and time of every leg through points [{lat,lng}], in one request to the FOSSGIS OSRM car
// router: [{ km, min }] with one entry per pair of consecutive points, like walkRoute's legs.
export async function driveLegs(points) {
  if (points.length < 2) return []
  const path = points.map(p => `${p.lng.toFixed(5)},${p.lat.toFixed(5)}`).join(';')
  const data = await getJson(`https://routing.openstreetmap.de/routed-car/route/v1/driving/${path}?overview=false`, { timeout: 20000, retries: 1 })
  const r = data.routes?.[0]
  if (data.code !== 'Ok' || !r) throw new Error(data.code || 'no route')
  return r.legs.map(l => ({ km: Math.round(l.distance / 100) / 10, min: Math.max(1, Math.round(l.duration / 60)) }))
}
