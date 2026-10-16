import { useCallback, useEffect, useState } from 'react'
import { PlusIcon, MinusIcon, XIcon, ArrowLeftIcon, ArrowRightIcon, SparkleIcon } from '@phosphor-icons/react'
import { suggestStops, suggestDestinations } from './planner.js'
import { errorText } from './i18n.js'
import { addDays } from './util.js'
import Combobox from './Combobox.jsx'
import { searchDestinations, searchHotels, resolvePlace } from './search.js'

const today = () => new Date().toISOString().slice(0, 10)
const blankStop = () => ({ city: '', country: '', nights: 2 })
const PACE = { slow: 'relaxed', mid: 'balanced', fast: 'packed' }
const STEPS = ['what', 'when', 'where', 'who', 'stops', 'sleep']

function Stepper({ label, value, min, max, onChange, unit }) {
  const n = Number(value) || min
  return (
    <div className="stepper" role="group" aria-label={label}>
      <button type="button" className="icon-btn" aria-label={`${label} −`} onClick={() => onChange(Math.max(min, n - 1))} disabled={n <= min}><MinusIcon size={20} aria-hidden /></button>
      <output aria-live="polite"><b>{n}</b> {unit(n)}</output>
      <button type="button" className="icon-btn" aria-label={`${label} +`} onClick={() => onChange(Math.min(max, n + 1))} disabled={n >= max}><PlusIcon size={20} aria-hidden /></button>
    </div>
  )
}

// One question per screen: what kind of trip, when and how long, where, who, the stops, then the hotels.
export default function NewTrip({ t, settings, onCreate, onCancel }) {
  const [step, setStep] = useState(0)
  const [f, setF] = useState({ likes: [], more: '', startDate: today(), nights: 7, dest: null, travelers: 2, pace: 'mid' })
  const [ideas, setIdeas] = useState(null)
  const [stops, setStops] = useState([])
  const [stopsFor, setStopsFor] = useState(null) // the answers the current stops were proposed for
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)

  const set = patch => setF(x => ({ ...x, ...patch }))
  const setStop = (i, patch) => setStops(ss => ss.map((s, j) => (j === i ? { ...s, ...patch } : s)))
  const interests = [...f.likes, f.more.trim()].filter(Boolean).join(', ')
  const valid = stops.filter(s => s.city.trim())
  const total = stops.reduce((n, s) => n + (Number(s.nights) || 0), 0)
  // The destination is always picked from a list; its description ("comune italiano", "regione della Spagna") tells the AI which one.
  const destText = f.dest ? (f.dest.desc ? `${f.dest.name} (${f.dest.desc})` : f.dest.name) : ''
  const findDest = useCallback(q => (q.trim().length < 2 ? [] : searchDestinations(q, settings.lang)), [settings.lang])
  const key = JSON.stringify([destText, f.nights, f.pace, interests])
  const fmt = iso => new Intl.DateTimeFormat(settings.lang, { weekday: 'short', day: 'numeric', month: 'long' }).format(new Date(iso + 'T12:00:00'))

  const run = async job => {
    setErr(null)
    setBusy(true)
    try { await job() } catch (e) { setErr(errorText(t, e)) } finally { setBusy(false) }
  }

  const findIdeas = () => run(async () => {
    const month = new Intl.DateTimeFormat('en', { month: 'long' }).format(new Date(f.startDate + 'T12:00:00'))
    setIdeas(await suggestDestinations(settings, { interests, month, nights: f.nights, lang: settings.lang }))
  })

  const proposeStops = () => run(async () => {
    setStops(await suggestStops(settings, { region: destText, days: f.nights, lang: settings.lang, pace: PACE[f.pace], interests }))
    setStopsFor(key)
  })

  // Reaching the last step proposes the stops, again only if an answer changed since.
  useEffect(() => {
    if (STEPS[step] === 'stops' && stopsFor !== key && !busy) proposeStops()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step])

  const can = { what: true, when: !!f.startDate, where: !!f.dest, who: true, stops: valid.length > 0 && !busy, sleep: valid.length > 0 }[STEPS[step]]
  const last = step === STEPS.length - 1

  const submit = e => {
    e.preventDefault()
    if (!can) return
    if (!last) { setErr(null); setStep(s => s + 1); return }
    onCreate({
      title: f.dest?.name || valid.map(s => s.city).join(' · '),
      startDate: f.startDate,
      travelers: Number(f.travelers) || 1,
      pace: PACE[f.pace],
      interests,
      stops: valid.map(s => ({ city: s.city.trim(), country: s.country.trim(), nights: Math.max(1, Number(s.nights) || 1), ...(s.hotel && { hotel: s.hotel }) })),
    })
  }

  return (
    <form className="pane wiz" onSubmit={submit}>
      <div className="pane-head">
        <h1>{t.newTrip}</h1>
        {onCancel && <button type="button" className="btn btn-quiet" onClick={onCancel}>{t.cancel}</button>}
      </div>

      <div className="wiz-progress" role="progressbar" aria-valuemin={1} aria-valuemax={STEPS.length} aria-valuenow={step + 1} aria-label={t.stepOf(step + 1, STEPS.length)}>
        {STEPS.map((s, i) => <span key={s} className={i <= step ? 'is-done' : ''} />)}
      </div>
      <p className="wiz-count">{t.stepOf(step + 1, STEPS.length)}</p>

      {STEPS[step] === 'what' && (
        <section className="wiz-step">
          <h2 className="wiz-q">{t.qWhat}</h2>
          <p className="muted">{t.qWhatHint}</p>
          <div className="picks">
            {t.likes.map(l => {
              const on = f.likes.includes(l)
              return <button type="button" key={l} className="pick" aria-pressed={on} onClick={() => set({ likes: on ? f.likes.filter(x => x !== l) : [...f.likes, l] })}>{l}</button>
            })}
          </div>
          <label className="field"><span>{t.qWhatMore}</span><input value={f.more} placeholder={t.interestsPh} onChange={e => set({ more: e.target.value })} /></label>
        </section>
      )}

      {STEPS[step] === 'when' && (
        <section className="wiz-step">
          <h2 className="wiz-q">{t.qWhen}</h2>
          <label className="field"><span>{t.formStart}</span><input type="date" autoFocus value={f.startDate} min={today()} onChange={e => set({ startDate: e.target.value })} required /></label>
          <div className="field"><span>{t.qHowLong}</span>
            <Stepper label={t.qHowLong} value={f.nights} min={1} max={60} onChange={v => set({ nights: v })} unit={n => t.nights(n).replace(/^\d+\s*/, '')} />
          </div>
          {f.startDate && <p className="hint">{t.backOn(fmt(addDays(f.startDate, f.nights - 1)))}</p>}
        </section>
      )}

      {STEPS[step] === 'where' && (
        <section className="wiz-step">
          <h2 className="wiz-q">{t.qWhere}</h2>
          <Combobox
            label={t.qWhereLabel} placeholder={t.qWherePh} emptyText={t.noDest} autoFocus delay={400}
            value={f.dest} display={d => d.name} onChange={d => set({ dest: d })} search={findDest}
            renderOption={d => <><b>{d.name}</b> <span className="muted">{d.desc}</span></>}
          />
          {f.dest?.desc && <p className="wiz-picked">{f.dest.name}: {f.dest.desc}</p>}
          <div className="wiz-ideas">
            <p className="muted">{t.qWhereUnsure}</p>
            <button type="button" className="btn btn-quiet" onClick={findIdeas} disabled={busy} aria-busy={busy}>
              <SparkleIcon size={16} aria-hidden /> {busy ? t.thinking : ideas ? t.moreIdeas : t.giveIdeas}
            </button>
            {ideas && (
              <ul className="idea-cards">
                {ideas.map(d => {
                  const name = d.country && !d.name.includes(d.country) ? `${d.name}, ${d.country}` : d.name
                  return (
                    <li key={name}>
                      <button type="button" className="idea-card" aria-pressed={f.dest?.name === d.name} onClick={() => set({ dest: { name: d.name, desc: d.country } })}>
                        <b>{name}</b><span>{d.why}</span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </section>
      )}

      {STEPS[step] === 'who' && (
        <section className="wiz-step">
          <h2 className="wiz-q">{t.qWho}</h2>
          <div className="field"><span>{t.formTravelers}</span>
            <Stepper label={t.formTravelers} value={f.travelers} min={1} max={20} onChange={v => set({ travelers: v })} unit={t.people} />
          </div>
          <div className="field">
            <span id="pace">{t.qPace}</span>
            <div className="seg seg-fill" role="radiogroup" aria-labelledby="pace">
              {[['slow', t.paceSlow], ['mid', t.paceMid], ['fast', t.paceFast]].map(([v, l]) => (
                <button type="button" key={v} role="radio" aria-checked={f.pace === v} onClick={() => set({ pace: v })}>{l}</button>
              ))}
            </div>
          </div>
        </section>
      )}

      {STEPS[step] === 'stops' && (
        <section className="wiz-step">
          <h2 className="wiz-q">{t.qStops(f.dest?.name)}</h2>
          {busy ? <p className="wiz-wait" aria-live="polite">{t.thinkingStops}</p> : (
            <>
              <p className="muted">{t.qStopsHint} · {t.nights(total)}</p>
              <ol className="stop-rows">
                {stops.map((s, i) => (
                  <li key={i} className="stop-row">
                    <span className="stop-row-num" aria-hidden>{String(i + 1).padStart(2, '0')}</span>
                    <label className="field"><span>{t.formCity}</span><input value={s.city} onChange={e => setStop(i, { city: e.target.value })} /></label>
                    <label className="field"><span>{t.formCountry}</span><input value={s.country} onChange={e => setStop(i, { country: e.target.value })} /></label>
                    <label className="field field-num"><span>{t.formNights}</span><input type="number" min="1" max="30" value={s.nights} onChange={e => setStop(i, { nights: e.target.value })} /></label>
                    <button type="button" className="icon-btn icon-btn-quiet" aria-label={`${t.remove} ${s.city}`} onClick={() => setStops(ss => ss.filter((_, j) => j !== i))}>
                      <XIcon size={18} aria-hidden />
                    </button>
                  </li>
                ))}
              </ol>
              <div className="row">
                <button type="button" className="btn btn-quiet" onClick={() => setStops(ss => [...ss, blankStop()])}><PlusIcon size={16} aria-hidden /> {t.addStop}</button>
                <button type="button" className="btn btn-quiet" onClick={proposeStops}><SparkleIcon size={16} aria-hidden /> {t.reproposeStops}</button>
              </div>
            </>
          )}
        </section>
      )}

      {STEPS[step] === 'sleep' && (
        <section className="wiz-step">
          <h2 className="wiz-q">{t.qSleep}</h2>
          <p className="muted">{t.qSleepHint}</p>
          {stops.map((s, i) => s.city.trim() && (
            <Combobox
              key={`${i}:${s.city}`} label={`${s.city} · ${t.nights(Number(s.nights) || 1)}`} placeholder={t.hotelPh} emptyText={t.noHotel}
              autoFocus={i === 0} delay={300} value={s.hotel || null} display={h => h.name} onChange={async h => setStop(i, { hotel: await resolvePlace(h) })}
              search={q => (q.trim().length < 2 ? [] : searchHotels(q, { city: s.city, country: s.country }))}
              renderOption={h => <><b>{h.name}</b> <span className="muted">{h.addr}</span>{h.gid && <span className="by-google">Google Maps</span>}</>}
            />
          ))}
        </section>
      )}

      {err && <p className="error" role="alert">{err}</p>}

      <div className="wiz-nav">
        {step > 0 && <button type="button" className="btn btn-quiet" onClick={() => { setErr(null); setStep(s => s - 1) }}><ArrowLeftIcon size={16} aria-hidden /> {t.back}</button>}
        <button className="btn btn-primary" disabled={!can}>
          {last ? t.create : <>{STEPS[step] === 'what' && !interests ? t.skip : t.next} <ArrowRightIcon size={16} aria-hidden /></>}
        </button>
      </div>
    </form>
  )
}
