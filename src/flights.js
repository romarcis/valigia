import { getJson, log } from './net.js'

const BASE = 'https://serpapi.com/search.json'

// Local cache so repeated lookups don't spend the user's monthly SerpApi searches:
// flight results are kept for a few hours.
const FLIGHT_TTL = 4 * 3600e3

async function serp(key, params, ttl) {
  if (!key) throw new Error('no-flight-key')
  const ck = `valigia.serp.${new URLSearchParams(params)}`
  try {
    const hit = JSON.parse(localStorage.getItem(ck))
    if (hit && Date.now() - hit.at < ttl) { log('ok', `SerpApi: risultato in cache (${params.engine})`); return hit.data }
  } catch { /* no cache */ }
  const data = await getJson(`${BASE}?${new URLSearchParams({ ...params, api_key: key })}`, { timeout: 60000, retries: 1 })
  if (!data.error) try { localStorage.setItem(ck, JSON.stringify({ at: Date.now(), data })) } catch { /* storage full */ }
  return data
}

// Google Flights search page prefilled, for booking or when SerpApi searches run out.
export const googleFlightsLink = (from, to, date) =>
  `https://www.google.com/travel/flights?q=${encodeURIComponent(`Flights from ${from} to ${to} on ${date} one way`)}`

const hhmm = s => (s || '').slice(11, 16)

function offer(o, best, url) {
  return {
    id: (o.flights || []).map(f => `${f.flight_number}@${f.departure_airport.time}`).join('|'),
    best,
    url,
    price: o.price ?? null,
    totalMin: o.total_duration,
    co2: o.carbon_emissions?.this_flight ?? null,
    logo: o.airline_logo || o.flights?.[0]?.airline_logo,
    legs: (o.flights || []).map(f => ({
      airline: f.airline, logo: f.airline_logo, number: f.flight_number, plane: f.airplane, min: f.duration,
      from: { id: f.departure_airport.id, name: f.departure_airport.name, date: f.departure_airport.time.slice(0, 10), time: hhmm(f.departure_airport.time) },
      to: { id: f.arrival_airport.id, name: f.arrival_airport.name, date: f.arrival_airport.time.slice(0, 10), time: hhmm(f.arrival_airport.time) },
    })),
    layovers: (o.layovers || []).map(l => ({ id: l.id, name: l.name, min: l.duration, overnight: !!l.overnight })),
  }
}

// One-way search (two of these make a round trip, also open-jaw: arrive in one city, leave from another).
export async function searchFlights(key, { from, to, date, adults, hl }) {
  const data = await serp(key, {
    engine: 'google_flights', type: '2', departure_id: from, arrival_id: to, outbound_date: date,
    adults: String(adults || 1), currency: 'EUR', hl,
  }, FLIGHT_TTL)
  if (data.error) {
    if (/no results|hasn't returned any results/i.test(data.error)) return []
    throw new Error(data.error)
  }
  const url = data.search_metadata?.google_flights_url || null
  return [...(data.best_flights || []).map(o => offer(o, true, url)), ...(data.other_flights || []).map(o => offer(o, false, url))]
}

// Ranked copy: "best" keeps Google's order (best first), "price" and "duration" sort ascending.
export function rankFlights(list, by) {
  if (by === 'best') return list
  const k = by === 'price' ? f => f.price ?? Infinity : f => f.totalMin ?? Infinity
  return [...list].sort((a, b) => k(a) - k(b) || 0)
}
