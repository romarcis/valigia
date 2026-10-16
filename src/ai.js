import { getJson, log } from './net.js'
import { aiToken } from './cloud.js'

const AI_TIMEOUT = 180000 // long answers can take a couple of minutes
// Valigia's AI proxy (worker/): it holds the key and checks the Firebase login. Overridable for `wrangler dev`.
const PROXY = import.meta.env.VITE_AI_PROXY || 'https://valigia-ai.romarcis.workers.dev'

// The model has no web search: sourced data is marked unverified.
export const canSearch = () => false

// Returns { text, sources, searched }.
export async function ask(_settings, { system, prompt }) {
  log('info', 'AI')
  const { text } = await getJson(PROXY, {
    timeout: AI_TIMEOUT,
    retries: 3,
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await aiToken()}` },
    body: JSON.stringify({ system, prompt }),
  })
  return { text: text || '', sources: [], searched: false }
}

// Models wrap JSON in prose or fences; take the outermost object.
export function parseJson(text) {
  const a = text.indexOf('{'), b = text.lastIndexOf('}')
  try {
    if (a < 0 || b < a) throw new Error('bad-json')
    return JSON.parse(text.slice(a, b + 1))
  } catch (e) {
    log('error', `Risposta AI non leggibile come JSON (${text.length} caratteri). Inizio: ${text.slice(0, 300)}`)
    throw e
  }
}
