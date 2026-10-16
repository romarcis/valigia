import { useState } from 'react'
import { GoogleLogoIcon } from '@phosphor-icons/react'
import { register, login, resetPassword, authError, googleAvailable, signInGoogle } from './cloud.js'

// First screen when accounts are on and nobody is signed in: sign in, sign up, reset, or go on as a guest.
export default function AuthScreen({ t, onGuest }) {
  const [mode, setMode] = useState('login') // 'login' | 'register' | 'reset'
  const [f, setF] = useState({ email: '', pw: '', pw2: '' })
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null) // { kind: 'error'|'ok', text }
  const set = patch => setF(x => ({ ...x, ...patch }))

  const google = async () => {
    setMsg(window.__TAURI_INTERNALS__ ? { kind: 'ok', text: t.googleInBrowser } : null)
    setBusy(true)
    try { await signInGoogle() } catch (err) { setMsg({ kind: 'error', text: t[authError(err)] }) } finally { setBusy(false) }
  }

  const submit = async e => {
    e.preventDefault()
    setMsg(null)
    if (mode === 'register' && f.pw !== f.pw2) { setMsg({ kind: 'error', text: t.errPwMatch }); return }
    setBusy(true)
    try {
      if (mode === 'login') await login(f.email.trim(), f.pw)
      if (mode === 'register') await register(f.email.trim(), f.pw)
      if (mode === 'reset') { await resetPassword(f.email.trim()); setMsg({ kind: 'ok', text: t.resetSent }); setMode('login') }
    } catch (err) {
      setMsg({ kind: 'error', text: t[authError(err)] })
    } finally {
      setBusy(false)
    }
  }

  const title = { login: t.signIn, register: t.signUp, reset: t.resetTitle }[mode]
  return (
    <form className="pane auth" onSubmit={submit}>
      <div className="pane-head"><h1>{title}</h1></div>
      <p>{t.authBody}</p>

      {googleAvailable && mode !== 'reset' && (
        <>
          <button type="button" className="btn btn-google btn-wide" onClick={google} disabled={busy}>
            <GoogleLogoIcon size={20} weight="bold" aria-hidden /> {t.withGoogle}
          </button>
          <p className="auth-or" aria-hidden><span>{t.orEmail}</span></p>
        </>
      )}

      <label className="field"><span>{t.email}</span>
        <input type="email" autoComplete="email" value={f.email} onChange={e => set({ email: e.target.value })} required />
      </label>
      {mode !== 'reset' && (
        <label className="field"><span>{t.password}</span>
          <input type="password" autoComplete={mode === 'register' ? 'new-password' : 'current-password'} minLength={mode === 'register' ? 8 : undefined}
            value={f.pw} onChange={e => set({ pw: e.target.value })} required />
        </label>
      )}
      {mode === 'register' && (
        <label className="field"><span>{t.passwordAgain}</span>
          <input type="password" autoComplete="new-password" value={f.pw2} onChange={e => set({ pw2: e.target.value })} required />
        </label>
      )}
      {mode === 'register' && <p className="hint">{t.pwHint}</p>}
      {msg && <p className={msg.kind === 'error' ? 'error' : 'note'} role={msg.kind === 'error' ? 'alert' : 'status'}>{msg.text}</p>}

      <button className="btn btn-primary btn-wide" disabled={busy} aria-busy={busy}>{busy ? '…' : title}</button>

      <div className="auth-switch">
        {mode === 'login' && <>
          <button type="button" className="link" onClick={() => { setMode('register'); setMsg(null) }}>{t.noAccount}</button>
          <button type="button" className="link" onClick={() => { setMode('reset'); setMsg(null) }}>{t.forgotPw}</button>
        </>}
        {mode !== 'login' && <button type="button" className="link" onClick={() => { setMode('login'); setMsg(null) }}>{t.haveAccount}</button>}
      </div>

      <div className="auth-guest">
        <button type="button" className="btn btn-quiet btn-wide" onClick={onGuest}>{t.asGuest}</button>
        <p className="hint">{t.guestHint}</p>
      </div>
    </form>
  )
}
