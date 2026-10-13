import { getJson, log } from './net.js'

// Walking route along streets through points [{lat,lng}], via the FOSSGIS OSRM foot router (free, fair use).
// Returns { coords: [[lng,lat]...], legs: [minutes between consecutive points] }; straight lines if routing fails.
export async function walkRoute(points) {
  if (points.length < 2) return { coords: [], legs: [] }
  const path = points.map(p => `${p.lng.toFixed(5)},${p.lat.toFixed(5)}`).join(';')
  try {
    const data = await getJson(`https://routing.openstreetmap.de/routed-foot/route/v1/foot/${path}?overview=simplified&geometries=geojson`, { timeout: 20000, retries: 1 })
    const r = data.routes?.[0]
    if (data.code !== 'Ok' || !r) throw new Error(data.code || 'no route')
    return { coords: r.geometry.coordinates, legs: r.legs.map(l => Math.max(1, Math.round(l.duration / 60))), streets: true }
  } catch (e) {
    log('error', `Percorso a piedi non disponibile (${e.message}): uso linee dritte`)
    return { coords: points.map(p => [p.lng, p.lat]), legs: [], streets: false }
  }
}
