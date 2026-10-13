import { getJson, openExternal, log } from './net.js'

const AI_TIMEOUT = 180000 // long answers with web search can take a couple of minutes

export const OPENROUTER_MODELS = [
  { id: 'anthropic/claude-opus-5.5', label: 'Claude Opus 5.5' },
  { id: 'anthropic/claude-sonnet-5.5', label: 'Claude Sonnet 5.5' },
  { id: 'openai/gpt-5.5', label: 'GPT-5.5' },
  { id: 'google/gemini-3.8-flash', label: 'Gemini 3.8 Flash' },
  { id: 'deepseek/deepseek-v4-flash', label: 'DeepSeek V4 Flash' },
]
// Free-tier Gemini models (2026-10). freeSearch: Google Search grounding works on a free key (500/day, shared by both 2.5 models);
// on 3.x it needs a paid-tier key (5,000 free searches/month there).
export const GEMINI_MODELS = [
  { id: 'gemini-3.8-flash', label: 'Gemini 3.8 Flash' },
  { id: 'gemini-3.6-flash', label: 'Gemini 3.6 Flash' },
  { id: 'gemini-3.5-flash-lite', label: 'Gemini 3.5 Flash-Lite' },
  { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash', freeSearch: true },
  { id: 'gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash-Lite', freeSearch: true },
]

// ---- OpenRouter "Sign in" (OAuth PKCE, headless: the user pastes the code back) ----

const b64url = bytes => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

export async function startOpenRouterLogin() {
  const verifier = b64url(crypto.getRandomValues(new Uint8Array(48)))
  const challenge = b64url(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)))
  sessionStorage.setItem('or_verifier', verifier)
  await openExternal(`https://openrouter.ai/auth?code_challenge=${challenge}&code_challenge_method=S256&key_label=Valigia`)
}

export async function finishOpenRouterLogin(code) {
  const verifier = sessionStorage.getItem('or_verifier')
  if (!verifier) throw new Error('login-expired')
  const { key } = await getJson('https://openrouter.ai/api/v1/auth/keys', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code: code.trim(), code_verifier: verifier, code_challenge_method: 'S256' }),
  })
  sessionStorage.removeItem('or_verifier')
  return key
}

// ---- One call shape for both providers: returns { text, sources: [{url, title}] } ----

// Custom = any OpenAI-compatible endpoint (OmniRoute, Ollama, LM Studio…). It has no web search, so sourced data stays unverified.
export const canSearch = s => s.provider !== 'custom' && s.provider !== 'deepseek'

export const DEEPSEEK_MODELS = [
  { id: 'deepseek-flash', label: 'DeepSeek Flash' },
  { id: 'deepseek-v4-pro', label: 'DeepSeek V4 Pro' },
]

export async function ask(settings, { system, prompt, search = false }) {
  if (settings.provider === 'gemini') return askGemini(settings, system, prompt, search)
  if (settings.provider === 'deepseek') {
    if (!settings.deepseekKey) throw new Error('no-key')
    return askChat('https://api.deepseek.com', settings.deepseekKey, settings.deepseekModel || DEEPSEEK_MODELS[0].id, system, prompt, false)
  }
  if (settings.provider === 'custom') {
    if (!settings.customUrl || !settings.customModel) throw new Error('no-key')
    return askChat(settings.customUrl.replace(/\/+$/, ''), settings.customKey, settings.customModel, system, prompt, false)
  }
  if (!settings.openrouterKey) throw new Error('no-key')
  return askChat('https://openrouter.ai/api/v1', settings.openrouterKey, settings.openrouterModel || OPENROUTER_MODELS[0].id, system, prompt, search)
}

async function askChat(base, key, model, system, prompt, search) {
  log('info', `AI ${model}${search ? ' + ricerca web' : ''}`)
  const data = await getJson(`${base}/chat/completions`, {
    timeout: AI_TIMEOUT,
    retries: 3,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(key && { Authorization: `Bearer ${key}` }),
      'X-Title': 'Valigia',
    },
    body: JSON.stringify({
      model,
      messages: [{ role: 'system', content: system }, { role: 'user', content: prompt }],
      ...(search && { plugins: [{ id: 'web', max_results: 8 }] }),
    }),
  })
  const msg = data.choices?.[0]?.message
  if (!msg) throw new Error(data.error?.message || 'empty-response')
  const sources = (msg.annotations || [])
    .filter(a => a.type === 'url_citation')
    .map(a => ({ url: a.url_citation.url, title: a.url_citation.title || a.url_citation.url }))
  return { text: msg.content || '', sources: dedupe(sources), searched: search }
}

// Key+model pairs whose google_search was refused this session: skip the tool so we don't burn a request each time.
const noSearchKeys = new Set()

async function askGemini(s, system, prompt, search) {
  if (!s.geminiKey) throw new Error('no-key')
  const model = s.geminiModel || GEMINI_MODELS[0].id
  const keyModel = `${s.geminiKey}:${model}`
  if (search && noSearchKeys.has(keyModel)) search = false
  try {
    return await callGemini(s, model, system, prompt, search)
  } catch (e) {
    // Free-tier keys reject the google_search tool: answer without it, flagged as unsearched.
    if (!search || (e.status !== 400 && e.status !== 403)) throw e
    noSearchKeys.add(keyModel)
    log('info', 'Ricerca Google rifiutata per questa chiave: proseguo senza ricerca (dati non verificati)')
    return callGemini(s, model, system, prompt, false)
  }
}

async function callGemini(s, model, system, prompt, search) {
  log('info', `AI ${model}${search ? ' + ricerca Google' : ''}`)
  const data = await getJson(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    timeout: AI_TIMEOUT,
    retries: 3,
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': s.geminiKey },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      ...(search && { tools: [{ google_search: {} }] }),
      generationConfig: {
        // 3.x thinks at "medium" by default, which makes a long JSON answer take minutes.
        ...(model.startsWith('gemini-3') && { thinkingConfig: { thinkingLevel: 'low' } }),
        // JSON mode can't be combined with tools, so only when not searching.
        ...(!search && { responseMimeType: 'application/json' }),
      },
    }),
  })
  const cand = data.candidates?.[0]
  const text = (cand?.content?.parts || []).map(p => p.text || '').join('')
  if (!text) throw new Error(cand?.finishReason || 'empty-response')
  const sources = (cand.groundingMetadata?.groundingChunks || [])
    .filter(c => c.web)
    .map(c => ({ url: c.web.uri, title: c.web.title || c.web.uri }))
  return { text, sources: dedupe(sources), searched: search }
}

const dedupe = list => [...new Map(list.map(x => [x.url, x])).values()]

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
