import { fetch as tauriFetch } from '@tauri-apps/plugin-http'
import { openUrl } from '@tauri-apps/plugin-opener'

const inTauri = '__TAURI_INTERNALS__' in window

// Tauri's fetch skips browser CORS; plain fetch keeps `npm run dev` usable in a browser.
export const http = inTauri ? tauriFetch : window.fetch.bind(window)

export const openExternal = url => (inTauri ? openUrl(url) : window.open(url, '_blank', 'noopener'))

// ---- Activity log: what the app is doing, visible in the UI (last 200 entries) ----

const entries = []
const listeners = new Set()
export function log(level, msg) {
  entries.push({ id: entries.length ? entries.at(-1).id + 1 : 1, at: new Date(), level, msg })
  if (entries.length > 200) entries.shift()
  ;(level === 'error' ? console.error : console.log)(`[valigia] ${msg}`)
  listeners.forEach(fn => fn([...entries]))
}
export function subscribeLog(fn) {
  listeners.add(fn)
  fn([...entries])
  return () => listeners.delete(fn)
}

const label = url => { const u = new URL(url); return u.hostname + u.pathname.replace(/\/v1beta\/models\//, ' ').slice(0, 60) }

// Seconds the server asks us to wait on a 429 (Retry-After header, Google RetryInfo, or "retry in Ns" text).
function retryDelay(res, body, msg) {
  const h = Number(res.headers.get('retry-after'))
  if (h > 0) return h
  const info = body?.error?.details?.find(d => d.retryDelay)?.retryDelay
  if (info) return parseFloat(info)
  const m = /retry in ([\d.]+)s/i.exec(msg)
  return m ? parseFloat(m[1]) : null
}

const sleep = ms => new Promise(r => setTimeout(r, ms))

const TRANSIENT = new Set([429, 500, 502, 503, 504])
const BACKOFF = [5, 15, 30] // seconds, when the server doesn't say how long to wait

// retries: how many times to wait-and-retry a rate limit or overloaded server before giving up.
export async function getJson(url, { retries = 0, ...opts } = {}) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await request(url, opts)
    } catch (e) {
      if (!TRANSIENT.has(e.status) || attempt >= retries) throw e
      const asked = e.retryAfter
      if (asked > 90) throw e // e.g. daily quota: waiting won't help
      const wait = asked != null ? Math.ceil(asked) + 1 : BACKOFF[Math.min(attempt, BACKOFF.length - 1)]
      const why = e.status === 429 ? 'Limite di richieste raggiunto' : 'Server AI sovraccarico'
      log('info', `${why}: attendo ${wait}s e riprovo (${attempt + 1}/${retries})`)
      await sleep(wait * 1000)
    }
  }
}

async function request(url, { timeout = 60000, ...opts } = {}) {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeout)
  const t0 = performance.now()
  const name = label(url)
  log('info', `→ ${name}`)
  const beat = setInterval(() => log('info', `… ${name}: ancora in attesa (${Math.round((performance.now() - t0) / 1000)}s)`), 20000)
  let res, text
  try {
    res = await http(url, { ...opts, signal: ctrl.signal })
    text = await res.text()
  } catch (e) {
    const err = ctrl.signal.aborted ? Object.assign(new Error('timeout'), { status: 0 }) : e
    log('error', `✕ ${name}: ${ctrl.signal.aborted ? `nessuna risposta dopo ${timeout / 1000}s` : e.message || e}`)
    throw err
  } finally {
    clearTimeout(timer)
    clearInterval(beat)
  }
  const secs = ((performance.now() - t0) / 1000).toFixed(1)
  let body
  try { body = JSON.parse(text) } catch { body = null }
  if (!res.ok) {
    const msg = body?.error?.message || body?.error || text.slice(0, 300)
    const err = new Error(typeof msg === 'string' ? msg : JSON.stringify(msg))
    err.status = res.status
    if (TRANSIENT.has(res.status)) err.retryAfter = retryDelay(res, body, err.message)
    log('error', `✕ ${name}: HTTP ${res.status} in ${secs}s — ${err.message}`)
    throw err
  }
  log('ok', `✓ ${name}: ${res.status} in ${secs}s`)
  return body
}
