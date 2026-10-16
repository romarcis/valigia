import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { XIcon, ArrowSquareOutIcon, HourglassIcon, TicketIcon, ArrowClockwiseIcon, StarIcon, StarHalfIcon, MapPinIcon } from '@phosphor-icons/react'
import { convert, loadRates, money as fmtMoney } from './currency.js'
import { wikiIntro } from './wiki.js'
import { venueInfo } from './search.js'

// Opened from a pin on the map: the place's photo, why it is in the plan and the longer Wikipedia introduction.
// Rendered on <body>: on a phone it is a sheet over the panel, which the map's own layer could never reach.
const host = url => { try { return new URL(url).hostname.replace(/^www\./, '') } catch { return url } }

// Entrance ticket: searched on the web when the card opens, then kept with the place.
// One price in the traveller's currency: converted (marked ≈, with the local price beside it) when the site sells in another one.
function Price({ t, lang, x, cur, rates }) {
  const amount = x.amount ?? x.eur // tickets saved before currencies carried `eur`
  const from = x.currency || 'EUR'
  if (amount == null) return <b>{x.text}</b>
  if (amount === 0) return <b>{t.free}</b>
  if (from === cur) return <b>{fmtMoney(amount, cur, lang)}</b>
  const v = convert(amount, from, cur, rates)
  return v == null
    ? <b>{fmtMoney(amount, from, lang)}</b>
    : <span className="price-conv"><b>≈ {fmtMoney(v, cur, lang)}</b><small>{fmtMoney(amount, from, lang)}</small></span>
}

function Ticket({ t, lang, ticket: k, loading, error, kept, onRetry, cur }) {
  const [rates, setRates] = useState(null)
  useEffect(() => { let live = true; loadRates().then(r => live && setRates(r)); return () => { live = false } }, [])
  if (loading) return (
    <section className="ticket" aria-busy="true">
      <h3><TicketIcon size={18} aria-hidden /> {t.ticket}</h3>
      <p className="muted">{t.ticketSearching}</p>
      <div className="skeleton" aria-hidden><span style={{ '--w': '70%' }} /><span style={{ '--w': '50%' }} /></div>
    </section>
  )
  if (error && !k) return (
    <section className="ticket">
      <h3><TicketIcon size={18} aria-hidden /> {t.ticket}</h3>
      <p className="error">{error}</p>
      <button className="btn btn-quiet" onClick={onRetry}>{t.retry}</button>
    </section>
  )
  if (!k) return null
  const prices = k.prices.filter(x => (x.amount ?? x.eur) != null || x.text)
  const converted = prices.some(x => (x.amount ?? x.eur) && (x.currency || 'EUR') !== cur)
  return (
    <section className="ticket">
      <h3><TicketIcon size={18} aria-hidden /> {t.ticket}</h3>
      {k.needed === false ? <p className="ticket-free">{t.ticketFree}</p>
        : prices.length ? (
          <ul className="ticket-prices">
            {prices.map((x, i) => <li key={i}><span>{x.label}</span><Price t={t} lang={lang} x={x} cur={cur} rates={rates} /></li>)}
          </ul>
        ) : <p className="muted">{k.needed ? t.ticketNoPrice : t.ticketUnknown}</p>}
      {k.booking && k.booking !== 'not_needed' && <p className={'tag ' + (k.booking === 'required' ? 'tag-ink' : 'tag-warn')}>{k.booking === 'required' ? t.bookingRequired : t.bookingRecommended}</p>}
      {k.notes && <p className="ticket-notes">{k.notes}</p>}
      <div className="row">
        {k.book_url && <a className="btn btn-ink" href={k.book_url} target="_blank" rel="noreferrer">{t.bookTicket} <ArrowSquareOutIcon size={15} aria-hidden /></a>}
        {k.official_url && k.official_url !== k.book_url && <a className="link" href={k.official_url} target="_blank" rel="noreferrer">{t.officialSite} · {host(k.official_url)} <ArrowSquareOutIcon size={13} aria-hidden /></a>}
      </div>
      {error && <p className="error">{error}</p>}
      {kept && <p className="note">{t.ticketKept(new Date(k.at).toLocaleDateString(lang, { day: 'numeric', month: 'short' }))}</p>}
      {converted && <p className="hint">{t.priceConverted(cur)}</p>}
      <div className="ticket-foot">
        <span className="hint">{t.checkedOn(new Date(k.at).toLocaleDateString(lang, { day: 'numeric', month: 'short', year: 'numeric' }))} · {t.ticketNote}</span>
        <button className="btn btn-quiet" onClick={onRetry}><ArrowClockwiseIcon size={15} aria-hidden /> {t.refreshPrices}</button>
      </div>
    </section>
  )
}

// A restaurant or café's Google rating and latest reviews (with the authors, as Google requires).
function Reviews({ t, lang, info }) {
  const fmt = n => n.toLocaleString(lang, { maximumFractionDigits: 1 })
  return (
    <section className="reviews">
      {info.rating != null && (
        <p className="reviews-score">
          <b>{fmt(info.rating)}</b>
          <span className="stars" aria-label={t.ratingOf(fmt(info.rating))}>
            {[1, 2, 3, 4, 5].map(i => (info.rating >= i - 0.25 ? <StarIcon key={i} weight="fill" /> : info.rating >= i - 0.75 ? <StarHalfIcon key={i} weight="fill" /> : <StarIcon key={i} />))}
          </span>
          <span className="muted">{t.reviewsCount(info.count || 0)} · Google</span>
        </p>
      )}
      {info.reviews.filter(r => r.text).map((r, i) => (
        <blockquote key={i}>
          <p>{r.text.length > 320 ? r.text.slice(0, 300).trimEnd() + '…' : r.text}</p>
          <footer>{r.rating != null && <><StarIcon size={12} weight="fill" aria-hidden /> {r.rating} · </>}{r.author}{r.when && ` · ${r.when}`}</footer>
        </blockquote>
      ))}
      {info.url && <a href={info.url} target="_blank" rel="noreferrer">{t.onGoogleMaps} <ArrowSquareOutIcon size={13} aria-hidden /></a>}
    </section>
  )
}

export default function PlaceCard({ t, lang, place: p, venue, tag, ink, onClose, ticketLoading, ticketError, ticketKept, onTicketRetry, currency }) {
  const [info, setInfo] = useState(undefined) // venue's Google data: undefined while loading, null when none
  useEffect(() => {
    if (!venue) return
    let live = true
    setInfo(undefined)
    venueInfo(p).then(x => live && setInfo(x))
    return () => { live = false }
  }, [venue, p])
  const [intro, setIntro] = useState(null) // null while loading
  useEffect(() => {
    let live = true
    setIntro(null)
    wikiIntro(p.url).then(x => live && setIntro(x), () => live && setIntro(''))
    return () => { live = false }
  }, [p.url])
  // Back (Android button or gesture, browser back) closes the card: it gets its own history entry.
  useEffect(() => {
    history.pushState({ card: true }, '')
    const back = () => onClose()
    addEventListener('popstate', back)
    return () => { removeEventListener('popstate', back); if (history.state?.card) history.back() }
  }, [onClose])
  useEffect(() => {
    const esc = e => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', esc)
    return () => document.removeEventListener('keydown', esc)
  }, [onClose])

  const text = intro || p.extract // the short extract is the fallback while loading or offline
  return createPortal(
    <aside className="place-card" aria-label={p.name} style={{ '--ink': ink.bg, '--on-ink': ink.fg }}>
      {(p.img || info?.photo) && <img src={p.img || info.photo} alt="" onError={e => { e.currentTarget.style.display = 'none' }} />}
      {!p.img && info?.photo && info.photo_by && <small className="photo-by">{t.photoBy(info.photo_by)}</small>}
      <button className="icon-btn place-card-close" aria-label={t.close} onClick={onClose}><XIcon size={18} weight="bold" aria-hidden /></button>
      <div className="place-card-body">
        <h2>{tag && <span className="pin pin-inline" aria-hidden>{tag.n}</span>} {p.name}</h2>
        {tag && <p className="muted">{t.day} {tag.day + 1}</p>}
        {p.why && <p className="place-why">{p.why}</p>}
        {venue && p.addr && <p className="muted"><MapPinIcon size={14} aria-hidden /> {p.addr}</p>}
        {venue && info === undefined && <div className="skeleton" aria-hidden><span style={{ '--w': '60%' }} /><span style={{ '--w': '90%' }} /><span style={{ '--w': '84%' }} /></div>}
        {venue && info && <Reviews t={t} lang={lang} info={info} />}
        {venue ? null : text ? text.split('\n').filter(Boolean).map((para, i) => <p key={i}>{para}</p>) : intro === null && <div className="skeleton" aria-hidden><span style={{ '--w': '92%' }} /><span style={{ '--w': '80%' }} /><span style={{ '--w': '86%' }} /></div>}
        <Ticket t={t} lang={lang} ticket={p.ticket} loading={ticketLoading} error={ticketError} kept={ticketKept} onRetry={onTicketRetry} cur={currency} />
        <p className="meta">
          {p.minutes ? <span><HourglassIcon size={14} aria-hidden /> {t.visitFor(t.min(p.minutes))}</span> : null}
          {p.site && <a href={p.site} target="_blank" rel="noreferrer">{t.officialSite} · {host(p.site)} <ArrowSquareOutIcon size={13} aria-hidden /></a>}
          {p.url && <a href={p.url} target="_blank" rel="noreferrer">{t.readMore} <ArrowSquareOutIcon size={13} aria-hidden /></a>}
        </p>
      </div>
    </aside>,
    document.body,
  )
}
