// Valigia AI proxy: the DeepSeek key lives here (secret DEEPSEEK_KEY), never in the app.
// Only Firebase users get through (signed-in, or anonymous for guests), each with a daily quota.
import { DurableObject } from 'cloudflare:workers'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (status, body, extra = {}) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json', ...extra } })
const fail = (status, message, extra) => json(status, { error: { message } }, extra)

// ---- Firebase ID token check (RS256, Google's public keys, cached as long as Google allows)

let jwks = null
async function googleKeys() {
  if (jwks && jwks.until > Date.now()) return jwks.keys
  const res = await fetch('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com')
  const age = Number(/max-age=(\d+)/.exec(res.headers.get('cache-control') || '')?.[1] || 3600)
  jwks = { keys: (await res.json()).keys, until: Date.now() + age * 1000 }
  return jwks.keys
}

const unb64 = s => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0))
const part = s => JSON.parse(new TextDecoder().decode(unb64(s)))

async function verify(token, project) {
  const [h, p, sig] = token.split('.')
  if (!sig) throw new Error('bad-token')
  const head = part(h), claims = part(p)
  const jwk = (await googleKeys()).find(k => k.kid === head.kid)
  if (head.alg !== 'RS256' || !jwk) throw new Error('bad-key')
  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify'])
  const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, unb64(sig), new TextEncoder().encode(`${h}.${p}`))
  const now = Date.now() / 1000
  if (!ok || claims.aud !== project || claims.iss !== `https://securetoken.google.com/${project}` || !claims.sub || claims.exp < now || claims.iat > now + 300)
    throw new Error('bad-claims')
  return { uid: claims.sub, anon: claims.firebase?.sign_in_provider === 'anonymous' }
}

// ---- Daily counters: one per user and one for everyone, in a single Durable Object.
// ponytail: one object serialises every request; shard by uid if traffic ever makes it a bottleneck.

export class Quota extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env)
    ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS n (day TEXT, who TEXT, c INTEGER, PRIMARY KEY (day, who))')
  }

  // Counts one request for `who` (and for '*', everyone): false when either is already at its limit.
  take(day, who, limit, all) {
    const sql = this.ctx.storage.sql
    const count = w => sql.exec('SELECT c FROM n WHERE day = ? AND who = ?', day, w).toArray()[0]?.c ?? 0
    if (count(who) >= limit || count('*') >= all) return false
    for (const w of [who, '*']) sql.exec('INSERT INTO n VALUES (?, ?, 1) ON CONFLICT (day, who) DO UPDATE SET c = c + 1', day, w)
    sql.exec('DELETE FROM n WHERE day < ?', day)
    return true
  }
}

export default {
  async fetch(req, env) {
    if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })
    if (req.method !== 'POST') return fail(405, 'method')

    let who
    try {
      who = await verify((req.headers.get('Authorization') || '').replace(/^Bearer /, ''), env.FIREBASE_PROJECT)
    } catch {
      return fail(401, 'auth')
    }

    const { system, prompt } = await req.json().catch(() => ({}))
    if (typeof system !== 'string' || typeof prompt !== 'string' || system.length + prompt.length > Number(env.MAX_CHARS))
      return fail(400, 'bad-request')

    const now = new Date(), day = now.toISOString().slice(0, 10)
    const limit = Number(who.anon ? env.GUEST_DAY : env.USER_DAY)
    if (!(await env.QUOTA.get(env.QUOTA.idFromName('all')).take(day, who.uid, limit, Number(env.ALL_DAY)))) {
      const toMidnight = Math.ceil((Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1) - now) / 1000)
      return fail(429, 'daily-limit', { 'Retry-After': String(toMidnight) })
    }

    const res = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.DEEPSEEK_KEY}` },
      body: JSON.stringify({ model: env.MODEL, messages: [{ role: 'system', content: system }, { role: 'user', content: prompt }] }),
    })
    const data = await res.json().catch(() => null)
    const text = data?.choices?.[0]?.message?.content
    if (!res.ok || typeof text !== 'string') {
      console.log('deepseek', res.status, JSON.stringify(data?.error || data).slice(0, 300))
      return fail(res.status === 429 ? 429 : 502, `upstream ${res.status}`)
    }
    return json(200, { text })
  },
}
