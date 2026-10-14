// Airports with scheduled passenger service and an IATA code, from OurAirports (public domain).
// Loaded lazily: ~240 KB. Row: [iata, name, city, countryCode, lat, lng, size 1=large 2=medium]
let rows = null
export async function loadAirports() {
  rows ??= (await import('./data/airports.json')).default.map(([iata, name, city, cc, lat, lng, size]) => ({ iata, name, city, cc, lat, lng, size }))
  return rows
}

const norm = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
const words = a => norm(`${a.iata} ${a.name} ${a.city}`).split(/[^a-z0-9]+/).filter(Boolean)

// Typed text -> airports. A word matches when it starts with the query, or (for 4+ letters)
// when the query starts with it: "milano" still finds "Milan Malpensa".
export function searchAirports(list, q, limit = 8) {
  const qs = norm(q).split(/\s+/).filter(Boolean)
  if (!qs.length) return []
  const hits = []
  for (const a of list) {
    const ws = words(a)
    if (!qs.every(x => ws.some(w => w.startsWith(x) || (w.length >= 4 && x.startsWith(w))))) continue
    const exact = a.iata.toLowerCase() === qs[0] ? 0 : 1
    hits.push([exact, a.size, a])
  }
  return hits.sort((x, y) => x[0] - y[0] || x[1] - y[1]).slice(0, limit).map(h => h[2])
}

export function km(a, b) {
  const R = 6371, r = d => (d * Math.PI) / 180
  const h = Math.sin(r(b.lat - a.lat) / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(r(b.lng - a.lng) / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

// Airports closest to a point, big hubs first when distances are comparable (a medium
// airport counts as 1.6x farther). Each result carries its distance in km.
export function nearestAirports(list, p, n = 5, maxKm = 250) {
  return list
    .map(a => ({ ...a, km: Math.round(km(p, a)) }))
    .filter(a => a.km <= maxKm)
    .sort((x, y) => x.km * (x.size === 2 ? 1.6 : 1) - y.km * (y.size === 2 ? 1.6 : 1))
    .slice(0, n)
}
