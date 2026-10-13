import { ask, parseJson } from './ai.js'
import { wikiLookup } from './wiki.js'
import { log } from './net.js'
import { addDays, stopOffsets, cleanDays } from './util.js'

const LANG_NAME = { it: 'Italian', en: 'English' }

const system = lang => `You are a meticulous travel planner. Write every human-readable string in ${LANG_NAME[lang]}.
Reply with ONE JSON object only, no prose, no markdown fences. Never invent ratings, prices or review counts: if you cannot find a value, use null.`

const tripBrief = t =>
  `Travellers: ${t.travelers}. Budget per night for lodging: ${t.budget ? `${t.budget} EUR` : 'not set'}. Pace: ${t.pace}. Interests: ${t.interests || 'general sightseeing'}.`

export async function suggestStops(settings, { region, days, lang, pace, interests }) {
  const { text } = await ask(settings, {
    system: system(lang),
    prompt: `Propose a multi-stop route for "${region}" over ${days} nights. Pace: ${pace}. Interests: ${interests || 'general'}.
Return {"stops":[{"city":string,"country":string,"nights":integer>=1}]} in travel order; nights must sum to ${days}.`,
  })
  return parseJson(text).stops.map(s => ({ city: s.city, country: s.country, nights: Math.max(1, s.nights | 0) }))
}

export async function planStop(settings, trip, idx) {
  const stop = trip.stops[idx]
  const from = addDays(trip.startDate, stopOffsets(trip)[idx])
  const lang = trip.lang
  const { text } = await ask(settings, {
    system: system(lang),
    prompt: `Trip stop ${idx + 1} of ${trip.stops.length}: ${stop.city}, ${stop.country}. ${stop.nights} night(s), arriving ${from}.
Previous stop: ${trip.stops[idx - 1]?.city || 'none (trip start)'}. Next stop: ${trip.stops[idx + 1]?.city || 'none (trip end)'}.
${tripBrief(trip)}
Return:
{"city_wiki":string (exact ${lang}.wikipedia.org title of the city),
 "summary":string (2 sentences, why this stop matters),
 "places":[{"name":string,"wiki":string (exact ${lang}.wikipedia.org title),"wiki_en":string (exact en.wikipedia.org title),"why":string (1 sentence),"minutes":integer}] (8 to 12 places, real and visitable),
 "days":[{"title":string,"items":[{"time":"HH:MM","place_index":integer|null (1-based index into places; null for meals and breaks),"place":string,"note":string,
   "transfer":null|{"metro":{"line":string,"min":integer}|null,"tram":{"line":string,"min":integer}|null,"bus":{"line":string,"min":integer}|null,"car_min":integer|null}}]}]
 (exactly ${stop.nights} days)}
Rules:
- "places" are sights only: never airports, stations, hotels or meals.
- Day 1 starts with the arrival (${idx === 0 ? 'airport or station' : `coming from ${trip.stops[idx - 1].city}`}) and check-in. EVERY FOLLOWING DAY STARTS FROM THE HOTEL: never put the airport or station on day 2 or later${idx < trip.stops.length - 1 ? `, except the last day may end with the departure to ${trip.stops[idx + 1].city}` : ''}.
- Every place appears in AT MOST ONE day. Never repeat a place on another day; spread the places across the days.
- Order each day's items so consecutive places are close together.
- "transfer" is how to get from the PREVIOUS item of the same day to this one: null on the first item of each day. Give your best estimate for metro, tram and bus (with the line name) only where that mode really serves the route, otherwise null; car_min is driving time. Walking time is computed by the app.`,
  })
  const plan = parseJson(text)
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
    places: plan.places.map(p => {
      const w = wiki.get(p.wiki) || wikiEn.get(p.wiki_en)
      return { name: p.name, why: p.why, minutes: p.minutes, wiki_en: p.wiki_en, ...(w && { img: w.img, extract: w.extract, url: w.url, lat: w.lat, lng: w.lng }) }
    }),
    days: cleaned.days.map((d, i) => ({ ...d, date: addDays(from, i) })),
    planned: true,
  }
}

export async function findHotels(settings, trip, idx) {
  const stop = trip.stops[idx]
  const checkIn = addDays(trip.startDate, stopOffsets(trip)[idx])
  const { text, sources, searched } = await ask(settings, {
    search: true,
    system: system(trip.lang),
    prompt: `Search the web for hotels in ${stop.city}, ${stop.country} for ${trip.travelers} traveller(s), check-in ${checkIn}, ${stop.nights} night(s). ${tripBrief(trip)}
Use real review scores from booking sites or Google/Tripadvisor and real nightly prices you find. Prefer well-located options near: ${(stop.places || []).slice(0, 5).map(p => p.name).join(', ') || 'the centre'}.
Return {"hotels":[{"name":string,"area":string,"price_per_night_eur":number|null,"price_note":string|null (e.g. "from", date checked),"rating":number|null,"rating_scale":number|null (e.g. 10 or 5),"reviews":integer|null,"rating_source":string|null (site name),"url":string|null (page where you read rating or price),"why":string}]} with 6 to 8 hotels across price levels.`,
  })
  // Without a real web search any URL is a guess: drop it so the row reads as unverified.
  const items = (parseJson(text).hotels || []).map(h => (searched ? h : { ...h, url: null }))
  return { items, sources, unverified: !searched, at: new Date().toISOString() }
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
