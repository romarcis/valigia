import { getJson, log } from './net.js'
import { regionCurrency } from './util.js'
export { convert, CURRENCIES } from './util.js'

export const userCurrency = settings =>
  settings.currency && settings.currency !== 'auto' ? settings.currency : regionCurrency(globalThis.navigator?.language || 'it-IT')

// Daily exchange rates (open.er-api.com, free, no key), kept for 12 hours.
const KEY = 'valigia.rates'
let pending = null
export function loadRates() {
  try {
    const hit = JSON.parse(localStorage.getItem(KEY))
    if (hit && Date.now() - hit.at < 12 * 3600e3) return Promise.resolve(hit.rates)
  } catch { /* no cache */ }
  pending ??= getJson('https://open.er-api.com/v6/latest/EUR')
    .then(d => {
      if (d.result !== 'success') throw new Error(d['error-type'] || 'rates')
      try { localStorage.setItem(KEY, JSON.stringify({ at: Date.now(), rates: d.rates })) } catch { /* full */ }
      return d.rates
    })
    .catch(e => { log('error', `Cambi valuta non disponibili (${e.message})`); return null })
    .finally(() => { pending = null })
  return pending
}

export const money = (n, cur, lang) =>
  new Intl.NumberFormat(lang, { style: 'currency', currency: cur, maximumFractionDigits: n % 1 && n < 100 ? 2 : 0 }).format(n)
