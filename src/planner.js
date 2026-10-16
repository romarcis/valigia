import { ask, parseJson } from './ai.js'
import { wikiLookup, nearbyPages } from './wiki.js'
import { findCity } from './search.js'
import { log } from './net.js'
import { toAmount } from './util.js'
import { addDays, stopOffsets, cleanDays, renumber } from './util.js'

const LANG_NAME = { it: 'Italian', en: 'English' }

const system = lang => `You are a meticulous travel planner. Write every human-readable string in ${LANG_NAME[lang]}.
Reply with ONE JSON object only, no prose, no markdown fences. Never invent ratings, prices or review counts: if you cannot find a value, use null.`

const tripBrief = t =>
  `Travellers: ${t.travelers}. Pace: ${t.pace}. Interests: ${t.interests || 'general sightseeing'}.`

export async function suggestStops(settings, { region, days, lang, pace, interests }) {
  const { text } = await ask(settings, {
    system: system(lang),
    prompt: `Plan where to stay for "${region}" over ${days} nights. Pace: ${pace}. Interests: ${interests || 'general'}.
- If "${region}" is a single city or town, return exactly ONE stop: that place, with all ${days} nights. Do not add other cities, not even day trips.
- If it is a region, island or country, choose a few cities in it, each close to the previous one (at most about 2 hours by train or car), in an order that never doubles back. Prefer fewer, longer stops: usually 2 nights or more each, more on a relaxed pace.
Return {"stops":[{"city":string,"country":string,"nights":integer>=1}]} in travel order; nights must sum to ${days}.`,
  })
  const raw = parseJson(text).stops
  if (!Array.isArray(raw) || !raw.length) throw new Error('bad-json')
  const stops = raw.map(s => ({ city: s.city, country: s.country, nights: Math.max(1, s.nights | 0) }))
  // The AI sometimes miscounts: the last stop absorbs the difference so the trip keeps its length.
  const last = stops.at(-1)
  last.nights = Math.max(1, last.nights + days - stops.reduce((n, s) => n + s.nights, 0))
  return stops
}

// For travellers who do not know where to go yet: a few destinations that fit their interests and season.
export async function suggestDestinations(settings, { interests, month, nights, lang }) {
  const { text } = await ask(settings, {
    system: system(lang),
    prompt: `Suggest 4 varied destinations (a region, island or city) for a ${nights}-night trip starting in ${month}. Interests: ${interests || 'general'}. They must suit that season.
Return {"ideas":[{"name":string,"country":string,"why":string (one short sentence)}]}.`,
  })
  const { ideas } = parseJson(text)
  if (!Array.isArray(ideas) || !ideas.length) throw new Error('bad-json')
  return ideas.slice(0, 4)
}

export async function planStop(settings, trip, idx) {
  const stop = trip.stops[idx]
  const from = addDays(trip.startDate, stopOffsets(trip)[idx])
  const lang = trip.lang
  // Real places first: the Wikipedia pages around the city. Without them the AI fills small towns with
  // plausible names that do not exist (and so can never be put on the map).
  let nearby = []
  try {
    const at = stop.lat != null ? stop : await findCity(stop.city, stop.country)
    if (at) nearby = await nearbyPages(lang, at.lat, at.lng)
  } catch (e) {
    log('error', `${stop.city}: pagine Wikipedia vicine non disponibili (${e.message})`)
  }
  const { text } = await ask(settings, {
    system: system(lang),
    prompt: `Trip stop ${idx + 1} of ${trip.stops.length}: ${stop.city}, ${stop.country}. ${stop.nights} night(s), arriving ${from}.
Previous stop: ${trip.stops[idx - 1]?.city || 'none (trip start)'}. Next stop: ${trip.stops[idx + 1]?.city || 'none (trip end)'}.
${tripBrief(trip)}
Return:
{"city_wiki":string (exact ${lang}.wikipedia.org title of the city),
 "summary":string (2 sentences, why this stop matters),
 "places":[{"name":string,"wiki":string (exact ${lang}.wikipedia.org title),"wiki_en":string (exact en.wikipedia.org title),"why":string (1 sentence),"minutes":integer}] (up to 12 places, real and visitable),
 "days":[{"title":string,"items":[{"time":"HH:MM","place_index":integer|null (1-based index into places; null for meals and breaks),"place":string,"note":string,
   "transfer":null|{"metro":{"line":string,"min":integer}|null,"tram":{"line":string,"min":integer}|null,"bus":{"line":string,"min":integer}|null,"car_min":integer|null}}]}]
 (exactly ${stop.nights} days)}
Rules:
${nearby.length ? `- Real ${lang}.wikipedia.org pages with coordinates near ${stop.city}, nearest first: ${nearby.join(' | ')}
- Choose places from that list whenever it has enough worth visiting (in a small town also nearby villages, nature and landmarks from it), using the title exactly as "wiki". In a big city you may add other famous sights, but only ones with their own ${lang}.wikipedia.org page. Fewer real places are better than invented ones: never make up a church, palace or museum.
` : `- Only real places with their own ${lang}.wikipedia.org page. Fewer real places are better than invented ones.
`}- "places" are sights only: never airports, stations, hotels or meals.
- The travellers are already in ${stop.city}: plan only what they do there. Every day starts from and ends at their hotel${stop.hotel?.name ? ` (${stop.hotel.name})` : ''}, which the app shows on its own.
- Items are sights from "places" and meals or breaks only: NEVER an item for airports, stations, arrivals, departures, check-in, check-out or any hotel. Never name or suggest a hotel.
- Every place appears in AT MOST ONE day. Never repeat a place on another day; spread the places across the days.
- Order each day's items so consecutive places are close together.
- "transfer" is how to get from the PREVIOUS item of the same day to this one: null on the first item of each day. Give your best estimate for metro, tram and bus (with the line name) only where that mode really serves the route, otherwise null; car_min is driving time. Walking time is computed by the app.`,
  })
  const plan = parseJson(text)
  if (!Array.isArray(plan.places) || !Array.isArray(plan.days)) throw new Error('bad-json')
  log('info', `${stop.city}: ${plan.places?.length ?? 0} luoghi e ${plan.days?.length ?? 0} giorni ricevuti, cerco su Wikipedia`)

  const wiki = await wikiLookup(lang, [plan.city_wiki, ...plan.places.map(p => p.wiki)])
  const missing = plan.places.filter(p => !wiki.has(p.wiki) && p.wiki_en)
  const wikiEn = missing.length && lang !== 'en' ? await wikiLookup('en', missing.map(p => p.wiki_en)) : new Map()
  const city = wiki.get(plan.city_wiki)
  const found = plan.places.filter(p => wiki.has(p.wiki) || wikiEn.has(p.wiki_en)).length
  log(city ? 'ok' : 'error', `${stop.city}: Wikipedia ha trovato ${found}/${plan.places.length} luoghi${city ? '' : ' (città non trovata: niente posizione sulla mappa)'}`)

  const cleaned = cleanDays(plan.days.slice(0, stop.nights), plan.places.length)
  if (cleaned.dropped) log('info', `${stop.city}: tolti ${cleaned.dropped} luoghi ripetuti in più giorni`)

  return {
    ...stop,
    lat: city?.lat ?? stop.lat ?? null,
    lng: city?.lng ?? stop.lng ?? null,
    summary: plan.summary,
    ...renumber(plan.places.map(p => {
      const w = wiki.get(p.wiki) || wikiEn.get(p.wiki_en)
      return { name: p.name, why: p.why, minutes: p.minutes, wiki_en: p.wiki_en, ...(w && { img: w.img, extract: w.extract, url: w.url, lat: w.lat, lng: w.lng }) }
    }), cleaned.days.map((d, i) => ({ ...d, date: addDays(from, i) }))),
    planned: true,
  }
}

// Entrance ticket of one place, from a web search: is it needed, prices, booking, the official booking page.
// Without a real web search the links are dropped (a guessed URL is worse than none) and it reads as unverified.
export async function findTicket(settings, trip, stopIdx, place) {
  const stop = trip.stops[stopIdx]
  const date = addDays(trip.startDate, stopOffsets(trip)[stopIdx])
  const { text, sources, searched } = await ask(settings, {
    search: true,
    system: system(trip.lang),
    prompt: `Search the web for the entrance ticket of "${place.name}" in ${stop.city}, ${stop.country}${place.url ? ` (Wikipedia: ${place.url})` : ''}, for a visit around ${date}.
Use the official website when it exists. If any entrance price is published anywhere (official site, official reseller, recent travel guides), report it: at least the standard adult ticket. Use null only when no price can be found at all. Return:
{"needed": true | false (free entry, or an outdoor place you simply walk into) | null (unknown),
 "prices": [{"label": string (e.g. full, reduced, under 18, free on Sundays), "amount": number | null (in the local currency the site sells in), "currency": string (ISO 4217 code, e.g. EUR, GBP, TRY), "text": string | null (only when it is not a plain amount)}],
 "booking": "required" | "recommended" | "not_needed" | null,
 "book_url": string | null (the page where the ticket is bought or booked, official if possible),
 "official_url": string | null,
 "notes": string | null (one short sentence: closing days, timed entry, combined tickets)}`,
  })
  const d = parseJson(text)
  if (!searched) { d.book_url = null; d.official_url = null }
  const prices = (d.prices || []).map(x => ({ label: x.label, amount: toAmount(x.amount ?? x.eur), currency: (x.currency || 'EUR').toUpperCase(), text: x.text || null }))
  return { needed: d.needed ?? null, prices, booking: d.booking || null, book_url: d.book_url || null, official_url: d.official_url || null, notes: d.notes || null, sources, unverified: !searched, at: new Date().toISOString() }
}

export async function findTransport(settings, trip, idx) {
  const stop = trip.stops[idx]
  const next = trip.stops[idx + 1]
  const date = addDays(trip.startDate, stopOffsets(trip)[idx] + stop.nights)
  const { text, sources, searched } = await ask(settings, {
    search: true,
    system: system(trip.lang),
    prompt: `Search the web for current transport information.
A) Getting around ${stop.city}, ${stop.country} for ${trip.travelers} traveller(s), pace ${trip.pace}, visiting: ${(stop.places || []).map(p => p.name).join(', ')}.
${next ? `B) Travelling from ${stop.city} to ${next.city}, ${next.country} on ${date}.` : 'B) No next stop: return null for "to_next".'}
Modes allowed: walk, metro, bus, tram, train, car, ferry, flight, taxi.
Return {"local":{"best":mode,"why":string,"options":[{"mode":mode,"how":string,"cost":string|null,"tip":string|null}]},
"to_next":null|{"best":mode,"why":string,"options":[{"mode":mode,"duration_min":integer|null,"cost_eur":number|null,"how":string,"url":string|null}]}}`,
  })
  const data = parseJson(text)
  if (!searched && data.to_next) data.to_next.options = data.to_next.options.map(o => ({ ...o, url: null }))
  return { local: data.local, toNext: data.to_next, sources, unverified: !searched, at: new Date().toISOString() }
}
