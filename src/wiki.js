import { getJson } from './net.js'

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
