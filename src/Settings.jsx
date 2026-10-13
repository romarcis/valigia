import { useState } from 'react'
import { ArrowSquareOutIcon, CheckCircleIcon } from '@phosphor-icons/react'
import { OPENROUTER_MODELS, GEMINI_MODELS, DEEPSEEK_MODELS, startOpenRouterLogin, finishOpenRouterLogin } from './ai.js'
import { openExternal } from './net.js'
import { errorText } from './i18n.js'

export const isConnected = s =>
  (s.provider === 'openrouter' && !!s.openrouterKey) ||
  (s.provider === 'gemini' && !!s.geminiKey) ||
  (s.provider === 'deepseek' && !!s.deepseekKey) ||
  (s.provider === 'custom' && !!s.customUrl && !!s.customModel)

function Provider({ id, title, body, settings, setSettings, t, children }) {
  const on = settings.provider === id
  return (
    <section className={'provider' + (on ? ' is-on' : '')} aria-labelledby={`p-${id}`}>
      <header className="provider-head">
        <h2 id={`p-${id}`}>{title}</h2>
        {on
          ? <span className="tag tag-on"><CheckCircleIcon size={16} weight="fill" aria-hidden /> {t.active}</span>
          : <button className="btn btn-quiet" onClick={() => setSettings(s => ({ ...s, provider: id }))}>{t.useThis}</button>}
      </header>
      <p className="muted">{body}</p>
      {children}
    </section>
  )
}

export default function Settings({ t, settings, setSettings, onDone }) {
  const [code, setCode] = useState('')
  const [waiting, setWaiting] = useState(false)
  const [err, setErr] = useState(null)
  const [gem, setGem] = useState(settings.geminiKey || '')
  const [ds, setDs] = useState(settings.deepseekKey || '')
  const [cu, setCu] = useState({ url: settings.customUrl || 'http://localhost:20128/v1', key: settings.customKey || '', model: settings.customModel || '' })
  const set = patch => setSettings(s => ({ ...s, ...patch }))

  const login = async () => {
    setErr(null)
    await startOpenRouterLogin()
    setWaiting(true)
  }
  const confirm = async e => {
    e.preventDefault()
    setErr(null)
    try {
      set({ openrouterKey: await finishOpenRouterLogin(code), provider: 'openrouter' })
      setWaiting(false)
      setCode('')
    } catch (e2) {
      setErr(errorText(t, e2))
    }
  }

  return (
    <div className="pane">
      <div className="pane-head">
        <h1>{t.setupTitle}</h1>
        <div className="seg" role="radiogroup" aria-label={t.language}>
          {['it', 'en'].map(l => (
            <button key={l} role="radio" aria-checked={settings.lang === l} onClick={() => set({ lang: l })}>{l.toUpperCase()}</button>
          ))}
        </div>
      </div>
      <p>{t.setupBody}</p>
      <p className="note">{t.subsNote}</p>

      <Provider id="openrouter" title={t.orTitle} body={t.orBody} settings={settings} setSettings={setSettings} t={t}>
        {settings.openrouterKey ? (
          <div className="stack">
            <div className="row">
              <span className="tag tag-ok">{t.orConnected}</span>
              <button className="btn btn-quiet" onClick={() => set({ openrouterKey: null })}>{t.disconnect}</button>
            </div>
            <label className="field">
              <span>{t.model}</span>
              <select value={settings.openrouterModel || OPENROUTER_MODELS[0].id} onChange={e => set({ openrouterModel: e.target.value })}>
                {OPENROUTER_MODELS.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
              </select>
            </label>
          </div>
        ) : (
          <div className="stack">
            <button className="btn btn-primary" onClick={login}>{t.orLogin} <ArrowSquareOutIcon size={16} aria-hidden /></button>
            {waiting && (
              <form className="stack" onSubmit={confirm}>
                <p className="muted">{t.orHint}</p>
                <label className="field">
                  <span>{t.orPaste}</span>
                  <input value={code} onChange={e => setCode(e.target.value)} autoComplete="off" spellCheck="false" required />
                </label>
                <button className="btn btn-primary" disabled={!code.trim()}>{t.orConfirm}</button>
              </form>
            )}
            {err && <p className="error" role="alert">{err}</p>}
          </div>
        )}
      </Provider>

      <Provider id="gemini" title={t.gmTitle} body={t.gmBody} settings={settings} setSettings={setSettings} t={t}>
        <form className="stack" onSubmit={e => { e.preventDefault(); set({ geminiKey: gem.trim() || null }) }}>
          <button type="button" className="link" onClick={() => openExternal('https://aistudio.google.com/apikey')}>
            {t.gmGetKey} <ArrowSquareOutIcon size={14} aria-hidden />
          </button>
          <label className="field">
            <span>{t.gmKey}</span>
            <input type="password" value={gem} onChange={e => setGem(e.target.value)} autoComplete="off" spellCheck="false" />
          </label>
          <button className="btn btn-quiet" disabled={gem.trim() === (settings.geminiKey || '')}>
            {gem && gem === settings.geminiKey ? t.saved : t.save}
          </button>
          <label className="field">
            <span>{t.model}</span>
            <select value={settings.geminiModel || GEMINI_MODELS[0].id} onChange={e => set({ geminiModel: e.target.value })}>
              {GEMINI_MODELS.map(m => <option key={m.id} value={m.id}>{m.label}{m.freeSearch ? ` · ${t.freeSearch}` : ''}</option>)}
            </select>
          </label>
        </form>
      </Provider>

      <Provider id="deepseek" title={t.dsTitle} body={t.dsBody} settings={settings} setSettings={setSettings} t={t}>
        <form className="stack" onSubmit={e => { e.preventDefault(); set({ deepseekKey: ds.trim() || null }) }}>
          <button type="button" className="link" onClick={() => openExternal('https://platform.deepseek.com/api_keys')}>
            {t.gmGetKey} <ArrowSquareOutIcon size={14} aria-hidden />
          </button>
          <label className="field">
            <span>{t.dsKey}</span>
            <input type="password" value={ds} onChange={e => setDs(e.target.value)} autoComplete="off" spellCheck="false" />
          </label>
          <button className="btn btn-quiet" disabled={ds.trim() === (settings.deepseekKey || '')}>
            {ds && ds === settings.deepseekKey ? t.saved : t.save}
          </button>
          <label className="field">
            <span>{t.model}</span>
            <select value={settings.deepseekModel || DEEPSEEK_MODELS[0].id} onChange={e => set({ deepseekModel: e.target.value })}>
              {DEEPSEEK_MODELS.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
            </select>
          </label>
        </form>
      </Provider>

      <Provider id="custom" title={t.cuTitle} body={t.cuBody} settings={settings} setSettings={setSettings} t={t}>
        <form className="stack" onSubmit={e => { e.preventDefault(); set({ customUrl: cu.url.trim(), customKey: cu.key.trim() || null, customModel: cu.model.trim() }) }}>
          <label className="field"><span>{t.cuUrl}</span><input value={cu.url} onChange={e => setCu({ ...cu, url: e.target.value })} inputMode="url" spellCheck="false" /></label>
          <label className="field"><span>{t.cuKey}</span><input type="password" value={cu.key} onChange={e => setCu({ ...cu, key: e.target.value })} autoComplete="off" /></label>
          <label className="field"><span>{t.cuModel}</span><input value={cu.model} onChange={e => setCu({ ...cu, model: e.target.value })} spellCheck="false" /></label>
          <button className="btn btn-quiet">{t.save}</button>
        </form>
      </Provider>

      {isConnected(settings) && <button className="btn btn-primary btn-wide" onClick={onDone}>{t.newTrip}</button>}
    </div>
  )
}
