import { getJson } from './net.js'

// Towns and cities as you type, via the Open-Meteo geocoding API (GeoNames data, ~100 ms,
// localised names, free for non-commercial use up to 10k calls/day). Only populated places.
// (Nominatim's usage policy forbids autocomplete; Photon took 3-4 s per keystroke.)
export async function searchPlaces(q, limit = 6, lang = document.documentElement.lang || 'it') {
  const p = new URLSearchParams({ name: q, count: String(limit + 4), language: lang, format: 'json' })
  const data = await getJson(`https://geocoding-api.open-meteo.com/v1/search?${p}`, { timeout: 8000 })
  return (data.results || [])
    .filter(r => r.feature_code?.startsWith('PPL'))
    .slice(0, limit)
    .map(r => ({ name: r.name, region: [r.admin1, r.country].filter(Boolean).join(', '), lat: r.latitude, lng: r.longitude }))
}

// Position of a trip stop. AI-suggested stops can read "Istanbul - Centro storico": if the whole
// name finds nothing, retry with the part before the first dash, comma or bracket.
export async function cityPoint(stop) {
  const tries = [stop.city.trim(), stop.city.split(/\s[-–]\s|[(,]/)[0].trim()]
  for (const q of [...new Set(tries)]) {
    const hits = await searchPlaces(q, 5)
    const inCountry = stop.country && hits.find(h => h.region.toLowerCase().includes(stop.country.toLowerCase()))
    if (hits.length) return inCountry || hits[0]
  }
  return null
}
