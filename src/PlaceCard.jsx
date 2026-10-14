import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { XIcon, ArrowSquareOutIcon, HourglassIcon } from '@phosphor-icons/react'
import { wikiIntro } from './wiki.js'

// Opened from a pin on the map: the place's photo, why it is in the plan and the longer Wikipedia introduction.
// Rendered on <body>: on a phone it is a sheet over the panel, which the map's own layer could never reach.
export default function PlaceCard({ t, place: p, tag, ink, onClose }) {
  const [intro, setIntro] = useState(null) // null while loading
  useEffect(() => {
    let live = true
    setIntro(null)
    wikiIntro(p.url).then(x => live && setIntro(x), () => live && setIntro(''))
    return () => { live = false }
  }, [p.url])
  useEffect(() => {
    const esc = e => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', esc)
    return () => document.removeEventListener('keydown', esc)
  }, [onClose])

  const text = intro || p.extract // the short extract is the fallback while loading or offline
  return createPortal(
    <aside className="place-card" aria-label={p.name} style={{ '--ink': ink.bg, '--on-ink': ink.fg }}>
      {p.img && <img src={p.img} alt="" />}
      <button className="icon-btn place-card-close" aria-label={t.close} onClick={onClose}><XIcon size={18} weight="bold" aria-hidden /></button>
      <div className="place-card-body">
        <h2>{tag && <span className="pin pin-inline" aria-hidden>{tag.n}</span>} {p.name}</h2>
        {tag && <p className="muted">{t.day} {tag.day + 1}</p>}
        {p.why && <p className="place-why">{p.why}</p>}
        {text ? text.split('\n').filter(Boolean).map((para, i) => <p key={i}>{para}</p>) : intro === null && <div className="skeleton" aria-hidden><span style={{ '--w': '92%' }} /><span style={{ '--w': '80%' }} /><span style={{ '--w': '86%' }} /></div>}
        <p className="meta">
          {p.minutes ? <span><HourglassIcon size={14} aria-hidden /> {t.visitFor(t.min(p.minutes))}</span> : null}
          {p.url && <a href={p.url} target="_blank" rel="noreferrer">{t.readMore} <ArrowSquareOutIcon size={13} aria-hidden /></a>}
        </p>
      </div>
    </aside>,
    document.body,
  )
}
