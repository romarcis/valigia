import { useEffect, useRef, useState } from 'react'
import { CopyIcon } from '@phosphor-icons/react'
import { subscribeLog } from './net.js'

export function useLog() {
  const [entries, setEntries] = useState([])
  useEffect(() => subscribeLog(setEntries), [])
  return entries
}

const time = d => d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })

// Activity log, shown in Settings for now (temporary: to be removed). Follows the newest entry inside its own box.
export default function LogPanel({ t }) {
  const entries = useLog()
  const list = useRef(null)
  useEffect(() => { if (list.current) list.current.scrollTop = list.current.scrollHeight }, [entries])
  const copy = () => navigator.clipboard?.writeText(entries.map(e => `${time(e.at)} ${e.level.toUpperCase()} ${e.msg}`).join('\n'))

  return (
    <section className="log" aria-label={t.log}>
      <header className="log-head">
        <h2>{t.log}</h2>
        <button className="icon-btn" aria-label={t.copyLog} title={t.copyLog} onClick={copy}><CopyIcon size={18} aria-hidden /></button>
      </header>
      {entries.length ? (
        <ol className="log-list" aria-live="polite" ref={list}>
          {entries.map(e => (
            <li key={e.id} className={`log-${e.level}`}>
              <time>{time(e.at)}</time>
              <span>{e.msg}</span>
            </li>
          ))}
        </ol>
      ) : <p className="log-empty">{t.logEmpty}</p>}
    </section>
  )
}
