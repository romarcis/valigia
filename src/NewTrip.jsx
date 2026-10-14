import { useCallback, useEffect, useState } from 'react'
import { PlusIcon, XIcon, AirplaneTiltIcon, CarIcon, MotorcycleIcon } from '@phosphor-icons/react'
import { suggestStops } from './planner.js'
import { errorText } from './i18n.js'
import Combobox from './Combobox.jsx'
import { loadAirports, searchAirports } from './airports.js'
import { searchPlaces } from './places.js'

const airportLabel = a => `${a.iata} · ${a.name}`
const placeLabel = p => (p.region ? `${p.name} · ${p.region}` : p.name)
const countryName = (cc, lang) => { try { return new Intl.DisplayNames([lang], { type: 'region' }).of(cc) } catch { return cc } }

const today = () => new Date().toISOString().slice(0, 10)
const blankStop = () => ({ city: '', country: '', nights: 2 })

export default function NewTrip({ t, settings, onCreate, onCancel }) {
  const [f, setF] = useState({ title: '', startDate: today(), travelers: 2, budget: '', pace: 'mid', interests: '' })
  const [stops, setStops] = useState([blankStop()])
  const [mode, setMode] = useState(settings.homeMode || 'flight')
  const [airport, setAirport] = useState(settings.homeAirport || null)
  const [home, setHome] = useState(settings.homePlace || null)
  const [airports, setAirports] = useState([])
  useEffect(() => { loadAirports().then(setAirports) }, [])
  const findAirports = useCallback(q => searchAirports(airports, q), [airports])
  const origin = mode === 'flight' ? airport : home
  const [idea, setIdea] = useState({ region: '', days: 7 })
  const [suggesting, setSuggesting] = useState(false)
  const [err, setErr] = useState(null)

  const set = patch => setF(x => ({ ...x, ...patch }))
  const setStop = (i, patch) => setStops(ss => ss.map((s, j) => (j === i ? { ...s, ...patch } : s)))
  const valid = stops.filter(s => s.city.trim())
  const total = stops.reduce((n, s) => n + (Number(s.nights) || 0), 0)

  const suggest = async () => {
    setErr(null)
    setSuggesting(true)
    try {
      const pace = { slow: 'relaxed', mid: 'balanced', fast: 'packed' }[f.pace]
      setStops(await suggestStops(settings, { region: idea.region, days: idea.days, lang: settings.lang, pace, interests: f.interests }))
      if (!f.title) set({ title: idea.region })
    } catch (e) {
      setErr(errorText(t, e))
    } finally {
      setSuggesting(false)
    }
  }

  const submit = e => {
    e.preventDefault()
    onCreate({
      title: f.title.trim() || valid.map(s => s.city).join(' · '),
      startDate: f.startDate,
      travelers: Number(f.travelers) || 1,
      budget: Number(f.budget) || null,
      pace: { slow: 'relaxed', mid: 'balanced', fast: 'packed' }[f.pace],
      interests: f.interests.trim(),
      stops: valid.map(s => ({ city: s.city.trim(), country: s.country.trim(), nights: Math.max(1, Number(s.nights) || 1) })),
      travel: mode === 'flight'
        ? { mode, from: airport.name, airport }
        : { mode, from: home.name, home: { lat: home.lat, lng: home.lng } },
    })
  }

  return (
    <form className="pane" onSubmit={submit}>
      <div className="pane-head">
        <h1>{t.newTrip}</h1>
        {onCancel && <button type="button" className="btn btn-quiet" onClick={onCancel}>{t.cancel}</button>}
      </div>

      <fieldset>
        <legend>{t.howGet}</legend>
        <div className="seg seg-fill" role="radiogroup" aria-label={t.howGet}>
          {[['flight', t.byPlane, AirplaneTiltIcon], ['car', t.byCar, CarIcon], ['moto', t.byMoto, MotorcycleIcon]].map(([v, l, I]) => (
            <button type="button" key={v} role="radio" aria-checked={mode === v} onClick={() => setMode(v)}>
              <I size={18} aria-hidden /> {l}
            </button>
          ))}
        </div>
        {mode === 'flight' ? (
          <Combobox
            key="airport" label={t.fromAirport} placeholder={t.fromAirportPh} emptyText={t.noAirport} required
            value={airport} display={airportLabel} onChange={setAirport} search={findAirports}
            renderOption={a => <><b className="combo-code">{a.iata}</b> <span>{a.name}</span> <span className="muted">{a.city ? `${a.city}, ` : ''}{countryName(a.cc, settings.lang)}</span></>}
          />
        ) : (
          <Combobox
            key="place" label={t.fromCity} placeholder={t.fromCityPh} emptyText={t.noPlace} required delay={300}
            value={home} display={placeLabel} onChange={setHome} search={searchPlaces}
            renderOption={p => <><b>{p.name}</b> <span className="muted">{p.region}</span></>}
          />
        )}
        {mode === 'flight' && <p className="hint">{t.flightHint}</p>}
      </fieldset>

      <fieldset className="idea">
        <legend>{t.suggest}</legend>
        <div className="grid-2-1">
          <label className="field"><span>{t.suggestRegion}</span>
            <input value={idea.region} onChange={e => setIdea({ ...idea, region: e.target.value })} />
          </label>
          <label className="field"><span>{t.suggestDays}</span>
            <input type="number" min="1" max="60" value={idea.days} onChange={e => setIdea({ ...idea, days: e.target.value })} />
          </label>
        </div>
        <p className="hint">{idea.region.trim() ? t.suggestHint : t.needRegion}</p>
        <button type="button" className="btn btn-quiet" onClick={suggest} disabled={!idea.region.trim() || suggesting} aria-busy={suggesting}>
          {suggesting ? `${t.planning}…` : t.suggest}
        </button>
        {err && <p className="error" role="alert">{err}</p>}
      </fieldset>

      <fieldset>
        <legend>{t.formWhere} <span className="muted">· {t.nights(total)}</span></legend>
        <ol className="stop-rows">
          {stops.map((s, i) => (
            <li key={i} className="stop-row">
              <span className="stop-row-num" aria-hidden>{String(i + 1).padStart(2, '0')}</span>
              <label className="field"><span>{t.formCity}</span><input value={s.city} onChange={e => setStop(i, { city: e.target.value })} required={i === 0} /></label>
              <label className="field"><span>{t.formCountry}</span><input value={s.country} onChange={e => setStop(i, { country: e.target.value })} /></label>
              <label className="field field-num"><span>{t.formNights}</span><input type="number" min="1" max="30" value={s.nights} onChange={e => setStop(i, { nights: e.target.value })} /></label>
              <button type="button" className="icon-btn icon-btn-quiet" aria-label={`${t.remove} ${s.city}`} onClick={() => setStops(ss => ss.filter((_, j) => j !== i))} disabled={stops.length === 1}>
                <XIcon size={18} aria-hidden />
              </button>
            </li>
          ))}
        </ol>
        <button type="button" className="btn btn-quiet" onClick={() => setStops(ss => [...ss, blankStop()])}><PlusIcon size={16} aria-hidden /> {t.addStop}</button>
      </fieldset>

      <fieldset>
        <div className="grid-2">
          <label className="field"><span>{t.formStart}</span><input type="date" value={f.startDate} onChange={e => set({ startDate: e.target.value })} required /></label>
          <label className="field"><span>{t.formTravelers}</span><input type="number" min="1" max="20" value={f.travelers} onChange={e => set({ travelers: e.target.value })} /></label>
          <label className="field"><span>{t.formBudget}</span><input type="number" min="0" step="10" value={f.budget} onChange={e => set({ budget: e.target.value })} /></label>
        </div>
        <div className="field">
          <span id="pace">{t.formPace}</span>
          <div className="seg seg-fill" role="radiogroup" aria-labelledby="pace">
            {[['slow', t.paceSlow], ['mid', t.paceMid], ['fast', t.paceFast]].map(([v, l]) => (
              <button type="button" key={v} role="radio" aria-checked={f.pace === v} onClick={() => set({ pace: v })}>{l}</button>
            ))}
          </div>
        </div>
        <label className="field"><span>{t.formInterests}</span><input value={f.interests} placeholder={t.interestsPh} onChange={e => set({ interests: e.target.value })} /></label>
        <label className="field"><span>{t.formTitle}</span><input value={f.title} placeholder={valid.map(s => s.city).join(' · ')} onChange={e => set({ title: e.target.value })} /></label>
      </fieldset>

      {!valid.length && <p className="hint">{t.needCity}</p>}
      <button className="btn btn-primary btn-wide" disabled={!valid.length || !origin}>{mode === 'flight' ? t.nextFlights : t.create}</button>
    </form>
  )
}
