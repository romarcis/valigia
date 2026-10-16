import { XIcon } from '@phosphor-icons/react'
import LogPanel from './LogPanel.jsx'
import { CURRENCIES, userCurrency } from './currency.js'

export default function Settings({ t, settings, setSettings, cloud, onClose }) {
  const set = patch => setSettings(s => ({ ...s, ...patch }))
  return (
    <div className="pane">
      <div className="pane-head">
        <h1>{t.settings}</h1>
        <div className="seg" role="radiogroup" aria-label={t.language}>
          {['it', 'en'].map(l => (
            <button key={l} role="radio" aria-checked={settings.lang === l} onClick={() => set({ lang: l })}>{l.toUpperCase()}</button>
          ))}
        </div>
        <button className="icon-btn icon-btn-quiet settings-close" aria-label={t.close} title={t.close} onClick={onClose}><XIcon size={18} weight="bold" aria-hidden /></button>
      </div>
      {cloud?.enabled && (
        <section className="provider is-on account" aria-labelledby="p-account">
          <header className="provider-head"><h2 id="p-account">{t.account}</h2></header>
          {cloud.user ? (
            <>
              <p>{t.signedInAs} <b>{cloud.user.email}</b></p>
              <button className="btn btn-quiet" onClick={cloud.signOut}>{t.signOut}</button>
              <p className="hint">{t.signOutHint}</p>
            </>
          ) : (
            <>
              <p className="muted">{t.guestBody}</p>
              <button className="btn btn-primary" onClick={cloud.leaveGuest}>{t.signInOrUp}</button>
            </>
          )}
        </section>
      )}
      <label className="field currency-field">
        <span>{t.currency}</span>
        <select value={settings.currency || 'auto'} onChange={e => set({ currency: e.target.value })}>
          <option value="auto">{t.currencyAuto(userCurrency({}))}</option>
          {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </label>
      <LogPanel t={t} />
    </div>
  )
}
