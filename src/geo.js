import { getJson, log } from './net.js'

const sleep = ms => new Promise(r => setTimeout(r, ms))

// Wikipedia page URL -> { lang, title }
function pageOf(url) {
  const m = /^https:\/\/(\w+)\.wikipedia\.org\/wiki\/(.+)$/.exec(url || '')
  return m ? { lang: m[1], title: decodeURIComponent(m[2]).replace(/_/g, ' ') } : null
}

// Coordinates (P625) of Wikidata items for the given Wikipedia pages: Map(title -> {lat,lng}).
async function wikidataCoords(lang, titles) {
  const q = new URLSearchParams({ action: 'query', format: 'json', formatversion: '2', origin: '*', redirects: '1', prop: 'pageprops', ppprop: 'wikibase_item', titles: titles.join('|') })
  const res = (await getJson(`https://${lang}.wikipedia.org/w/api.php?${q}`)).query || {}
  // map resolved titles back to what we asked for (normalisation and redirects)
  const asked = new Map()
  for (const n of [...(res.normalized || []), ...(res.redirects || [])]) asked.set(n.to, asked.get(n.from) || n.from)
  const qid = new Map((res.pages || []).filter(p => p.pageprops?.wikibase_item).map(p => [asked.get(p.title) || p.title, p.pageprops.wikibase_item]))
  if (!qid.size) return new Map()
  const ents = (await getJson(`https://www.wikidata.org/w/api.php?action=wbgetentities&format=json&origin=*&props=claims&ids=${[...qid.values()].join('|')}`)).entities || {}
  const out = new Map()
  for (const [title, id] of qid) {
    const v = ents[id]?.claims?.P625?.[0]?.mainsnak?.datavalue?.value
    if (v) out.set(title, { lat: v.latitude, lng: v.longitude })
  }
  return out
}

// OpenStreetMap search, bounded to ~25 km around the city so namesakes elsewhere don't match.
async function nominatim(name, stop) {
  const q = new URLSearchParams({ q: `${name}, ${stop.city}`, format: 'jsonv2', limit: '1' })
  if (stop.lat != null) {
    const d = 0.25
    q.set('viewbox', `${stop.lng - d},${stop.lat + d},${stop.lng + d},${stop.lat - d}`)
    q.set('bounded', '1')
  }
  const [hit] = await getJson(`https://nominatim.openstreetmap.org/search?${q}`, { headers: { 'User-Agent': 'Valigia/0.1 (trip planner)' } })
  return hit ? { lat: Number(hit.lat), lng: Number(hit.lon) } : null
}

// Fills in coordinates for places Wikipedia left without them: Wikidata first (from the page we
// already link, and its English page), then OpenStreetMap. Returns a new places array.
export async function locatePlaces(places, stop) {
  const out = places.map(p => ({ ...p }))
  const missing = () => out.filter(p => p.lat == null)
  if (!missing().length) return out

  try {
    for (const pass of ['page', 'en']) {
      const byLang = new Map()
      for (const p of missing()) {
        const pg = pass === 'page' ? pageOf(p.url) : p.wiki_en && { lang: 'en', title: p.wiki_en }
        if (!pg) continue
        byLang.set(pg.lang, [...(byLang.get(pg.lang) || []), [p, pg.title]])
      }
      for (const [lang, list] of byLang) {
        const found = await wikidataCoords(lang, list.map(([, title]) => title))
        for (const [p, title] of list) Object.assign(p, found.get(title) || {})
      }
    }
  } catch (e) {
    log('error', `Wikidata non disponibile: ${e.message}`)
  }

  // Nominatim usage policy: at most one request per second.
  for (const p of missing()) {
    try {
      Object.assign(p, (await nominatim(p.name, stop)) || {})
    } catch (e) {
      log('error', `OpenStreetMap: ${p.name}: ${e.message}`)
    }
    await sleep(1100)
  }

  const still = missing().map(p => p.name)
  log(still.length ? 'error' : 'ok', `${stop.city}: posizione trovata per ${places.length - still.length}/${places.length} luoghi${still.length ? ` (mancano: ${still.join(', ')})` : ''}`)
  return out
}

// Free-text place -> {lat, lng} via OpenStreetMap (homes, airports). null when nothing matches.
export async function geocode(q) {
  const [hit] = await getJson(`https://nominatim.openstreetmap.org/search?${new URLSearchParams({ q, format: 'jsonv2', limit: '1' })}`, { headers: { 'User-Agent': 'Valigia/0.1 (trip planner)' } })
  return hit ? { lat: Number(hit.lat), lng: Number(hit.lon) } : null
}
