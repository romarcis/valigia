import { invoke } from '@tauri-apps/api/core'
import { getJson, inTauri, log } from './net.js'
import { sameName } from './util.js'

// Search-as-you-type sources. Both cache by query: retyping or going back never repeats a request.
const cached = (cache, key, run) => {
  if (!cache.has(key)) cache.set(key, run().catch(e => { cache.delete(key); throw e }))
  return cache.get(key)
}

// Trip destinations from Wikidata, in the app language: cities, towns, regions, countries, islands and
// areas such as a coast or a mountain range. Wikidata knows "Lisbona" or "Costa Azzurra"; OpenStreetMap
// search engines only know local, English, German and French names.
// Kept: items with coordinates and a population or an area, or whose class is a kind of zone.
const ZONES = new Set(['Q82794', 'Q93352', 'Q23442', 'Q33837', 'Q39816', 'Q46831', 'Q1620908', 'Q1210950', 'Q15284', 'Q8502'])
const wikidata = p => getJson(`https://www.wikidata.org/w/api.php?${new URLSearchParams({ format: 'json', origin: '*', ...p })}`)
const destCache = new Map()
const plain = s => (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
const starts = (label, q) => Number(plain(label).startsWith(plain(q.trim())))
export function searchDestinations(q, lang) {
  return cached(destCache, `${lang}:${q.trim().toLowerCase()}`, async () => {
    const hits = (await wikidata({ action: 'wbsearchentities', language: lang, uselang: lang, type: 'item', limit: '15', search: q.trim() })).search || []
    if (!hits.length) return []
    const ents = (await wikidata({ action: 'wbgetentities', ids: hits.map(h => h.id).join('|'), props: 'claims' })).entities || {}
    return hits.filter(h => {
      const c = ents[h.id]?.claims || {}
      return c.P625 && (c.P1082 || c.P2046 || (c.P31 || []).some(x => ZONES.has(x.mainsnak.datavalue?.value.id)))
    }).sort((a, b) => starts(b.label, q) - starts(a.label, q)) // "Andalus": Andalusia before Sumatra
      .slice(0, 6).map(h => ({ name: h.label, desc: h.description || '' }))
  })
}

// OpenStreetMap places of some kinds inside a box around a point, via Photon (built for autocomplete).
// A box, not just a location bias: with bias alone "alfonso" in Seville returns hotels in other countries.
const poiCache = new Map()
function searchPoi(q, at, km, tags) {
  if (at?.lat == null) return Promise.resolve([])
  const d = km / 111 // degrees, roughly
  const bbox = [at.lng - d, at.lat - d, at.lng + d, at.lat + d].map(x => x.toFixed(3)).join(',')
  return cached(poiCache, JSON.stringify([q.trim().toLowerCase(), bbox, tags]), async () => {
    const p = new URLSearchParams({ q: q.trim(), limit: '8', bbox })
    for (const tag of tags) p.append('osm_tag', tag)
    const { features = [] } = await getJson(`https://photon.komoot.io/api/?${p}`)
    return features.map(f => ({
      name: f.properties.name,
      addr: [f.properties.street && `${f.properties.street}${f.properties.housenumber ? ` ${f.properties.housenumber}` : ''}`, f.properties.city].filter(Boolean).join(', '),
      lat: f.geometry.coordinates[1], lng: f.geometry.coordinates[0],
    }))
  })
}

// ---- Google Places: hotels and restaurants OpenStreetMap does not know (a small B&B often is not there) ----
// Only in the desktop/mobile app built with a key (see src-tauri/src/places.rs); the key never reaches this code.
// Results carry `gid` and no position: resolvePlace() fetches it once one is picked.
let google // Promise<boolean>
const hasGoogle = () => (google ??= inTauri ? invoke('places_available').catch(() => false) : Promise.resolve(false))
let session = null // one per search: Google bills typing + the final details call together
const lang = () => document.documentElement.lang || 'en'

async function searchGoogle(q, at, km) {
  session ??= crypto.randomUUID()
  const list = await invoke('places_autocomplete', { input: q.trim(), lat: at.lat, lng: at.lng, radius: km * 1000, lang: lang(), session })
  return list.map(s => ({ gid: s.id, name: s.name, addr: s.addr }))
}

// Google first when available, OpenStreetMap when not or when Google fails.
async function searchBoth(q, at, km, tags) {
  if (at?.lat != null && await hasGoogle()) {
    try {
      return await cached(poiCache, JSON.stringify(['google', q.trim().toLowerCase(), at.lat.toFixed(3), at.lng.toFixed(3), km]), () => searchGoogle(q, at, km))
    } catch (e) {
      log('error', `Google Places: ${e}`)
    }
  }
  return searchPoi(q, at, km, tags)
}

// A picked result with its position: OpenStreetMap results already have it, Google ones are looked up now.
export async function resolvePlace(p) {
  if (!p?.gid || p.lat != null) return p
  try {
    const d = await invoke('places_details', { id: p.gid, lang: lang(), session: session ?? crypto.randomUUID() })
    return { gid: d.id, name: d.name || p.name, addr: d.addr || p.addr, lat: d.lat, lng: d.lng }
  } catch (e) {
    log('error', `Google Places: posizione di «${p.name}» non disponibile (${e})`)
    return p // saved by name; the app says it is not on the map
  } finally {
    session = null
  }
}

// Restaurants, cafés and bars within walking reach (~5 km) of a point.
export const searchFood = (q, near) => searchBoth(q, near, 5, ['restaurant', 'cafe', 'fast_food', 'bar', 'pub', 'ice_cream'].map(x => `amenity:${x}`))

// Hotels, B&Bs, hostels and apartments around a stop (~13 km). Before planning the stop has no position yet: look up its city.
const cityCache = new Map()
export async function searchHotels(q, stop) {
  const at = stop.lat != null ? stop : await cached(cityCache, `${stop.city}|${stop.country}`, () => findCity(stop.city, stop.country))
  return searchBoth(q, at, 13, ['hotel', 'guest_house', 'hostel', 'apartment', 'motel'].map(x => `tourism:${x}`))
}

// A city, town or village -> {lat, lng}, to look around it before planning. null when not found.
// Nominatim, not Photon: stop names come in the app language ("Siviglia") and Photon only knows "Sevilla".
// One request per city (callers cache it), so within Nominatim's no-autocomplete policy.
export async function findCity(city, country) {
  const q = new URLSearchParams({ q: [city, country].filter(Boolean).join(', '), format: 'jsonv2', limit: '1', featureType: 'settlement' })
  const [hit] = await getJson(`https://nominatim.openstreetmap.org/search?${q}`, { headers: { 'User-Agent': 'Valigia/0.1 (trip planner)' } })
  return hit ? { lat: Number(hit.lat), lng: Number(hit.lon) } : null
}

// A sight by name within ~4 km of the stop, tolerant of naming differences ("Chiesa di San Michele
// Arcangelo" finds OpenStreetMap's "Chiesa di San Michele"). Strict on purpose: a wrong church in the
// next village is worse than no position.
export async function findNear(name, stop) {
  if (stop.lat == null) return null
  const d = 0.04
  const p = new URLSearchParams({ q: name, limit: '5', bbox: [stop.lng - d, stop.lat - d, stop.lng + d, stop.lat + d].join(',') })
  // Same municipality and a shared meaningful word: Photon matches loosely and the box alone still
  // reaches the churches of the next village.
  const same = x => x?.toLowerCase() === stop.city.toLowerCase()
  const f = ((await getJson(`https://photon.komoot.io/api/?${p}`)).features || []).find(x => same(x.properties.city) && sameName(name, x.properties.name || ''))
  return f ? { lat: f.geometry.coordinates[1], lng: f.geometry.coordinates[0] } : null
}
