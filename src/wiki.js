import { getJson } from './net.js'
import { sameName } from './util.js'

// Batch lookup on Wikipedia: image, short extract, coordinates, page url.
// Returns a Map keyed by the requested title (redirects/normalisation resolved).
export async function wikiLookup(lang, titles) {
  const out = new Map()
  const wanted = [...new Set(titles.filter(Boolean))]
  for (let i = 0; i < wanted.length; i += 20) {
    const batch = wanted.slice(i, i + 20)
    const q = new URLSearchParams({
      action: 'query', format: 'json', formatversion: '2', origin: '*', redirects: '1',
      prop: 'pageimages|extracts|coordinates|info', inprop: 'url',
      exintro: '1', explaintext: '1', exsentences: '3', exlimit: '20',
      piprop: 'thumbnail', pithumbsize: '720', titles: batch.join('|'),
    })
    const data = await getJson(`https://${lang}.wikipedia.org/w/api.php?${q}`)
    const alias = new Map()
    for (const n of data.query?.normalized || []) alias.set(n.to, n.from)
    for (const r of data.query?.redirects || []) alias.set(r.to, alias.get(r.from) || r.from)
    for (const p of data.query?.pages || []) {
      if (p.missing) continue
      const info = {
        title: p.title,
        url: p.fullurl,
        extract: p.extract || '',
        img: p.thumbnail?.source || null,
        lat: p.coordinates?.[0]?.lat ?? null,
        lng: p.coordinates?.[0]?.lon ?? null,
      }
      out.set(p.title, info)
      if (alias.has(p.title)) out.set(alias.get(p.title), info)
    }
  }
  return out
}

// Full introduction of a Wikipedia page (all the lead paragraphs), from its URL; cached per page.
const intros = new Map()
export function wikiIntro(url) {
  const m = /^https:\/\/(\w+)\.wikipedia\.org\/wiki\/(.+)$/.exec(url || '')
  if (!m) return Promise.resolve('')
  if (!intros.has(url)) {
    const q = new URLSearchParams({ action: 'query', format: 'json', formatversion: '2', origin: '*', redirects: '1', prop: 'extracts', exintro: '1', explaintext: '1', titles: decodeURIComponent(m[2]).replace(/_/g, ' ') })
    intros.set(url, getJson(`https://${m[1]}.wikipedia.org/w/api.php?${q}`).then(d => d.query?.pages?.[0]?.extract || '').catch(e => { intros.delete(url); throw e }))
  }
  return intros.get(url)
}

// Titles of the Wikipedia pages with coordinates closest to a point (up to 100, within 10 km):
// real, mappable candidates for the AI to choose places from.
export async function nearbyPages(lang, lat, lng) {
  const q = new URLSearchParams({ action: 'query', format: 'json', formatversion: '2', origin: '*', list: 'geosearch', gscoord: `${lat}|${lng}`, gsradius: '10000', gslimit: '100' })
  return ((await getJson(`https://${lang}.wikipedia.org/w/api.php?${q}`)).query?.geosearch || []).map(g => g.title)
}

// Wikipedia page for a place the user found on the map: the page near its position whose title
// matches its name (a wrong article is worse than none), else the page with exactly that title if
// it sits within 2 km. null when nothing fits.
export async function wikiFor(lang, name, lat, lng) {
  const near = (w, km) => lat == null || w.lat == null || Math.hypot(w.lat - lat, (w.lng - lng) * Math.cos(lat * Math.PI / 180)) * 111 <= km
  if (lat != null) {
    const titles = (await nearbyPagesWithin(lang, lat, lng, 600)).filter(title => sameName(name, title))
    if (titles.length) return (await wikiLookup(lang, [titles[0]])).get(titles[0]) || null
  }
  const exact = (await wikiLookup(lang, [name])).get(name)
  return exact && near(exact, 2) ? exact : null
}

async function nearbyPagesWithin(lang, lat, lng, metres) {
  const q = new URLSearchParams({ action: 'query', format: 'json', formatversion: '2', origin: '*', list: 'geosearch', gscoord: `${lat}|${lng}`, gsradius: String(metres), gslimit: '30' })
  return ((await getJson(`https://${lang}.wikipedia.org/w/api.php?${q}`)).query?.geosearch || []).map(g => g.title)
}
