import { useEffect, useId, useRef, useState } from 'react'

// Text field that only accepts a value picked from its list (ARIA combobox pattern).
// `search(q)` may be sync or async; `delay` debounces it (ms after the last keystroke).
export default function Combobox({ label, value, display, onChange, search, renderOption, delay = 0, placeholder, emptyText, required }) {
  const id = useId()
  const [q, setQ] = useState(value ? display(value) : '')
  const [open, setOpen] = useState(false)
  const [opts, setOpts] = useState([])
  const [hi, setHi] = useState(0)
  const [loading, setLoading] = useState(false)
  const typed = useRef(false) // search only after the user types, not when a value is shown

  useEffect(() => { if (!typed.current) setQ(value ? display(value) : '') }, [value, display])

  useEffect(() => {
    if (!typed.current) return
    if (!q.trim()) { setOpts([]); return }
    let off = false
    const timer = setTimeout(async () => {
      setLoading(true)
      try {
        const r = await search(q)
        if (!off) { setOpts(r); setHi(0); setOpen(true) }
      } catch { if (!off) setOpts([]) } finally { if (!off) setLoading(false) }
    }, delay)
    return () => { off = true; clearTimeout(timer) }
  }, [q, search, delay])

  const pick = o => {
    typed.current = false
    onChange(o)
    setQ(display(o))
    setOpen(false)
  }

  const key = e => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setHi(h => Math.min(h + 1, opts.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHi(h => Math.max(h - 1, 0)) }
    else if (e.key === 'Enter' && open && opts[hi]) { e.preventDefault(); pick(opts[hi]) }
    else if (e.key === 'Escape') setOpen(false)
  }

  // Leaving the field without picking restores the last valid value: free text is never kept.
  const blur = () => setTimeout(() => { setOpen(false); if (typed.current) { typed.current = false; setQ(value ? display(value) : '') } }, 150)

  return (
    <div className="field combo">
      <label htmlFor={id}>{label}</label>
      <input
        id={id} role="combobox" aria-expanded={open} aria-controls={`${id}-list`} aria-autocomplete="list"
        aria-activedescendant={open && opts[hi] ? `${id}-${hi}` : undefined}
        value={q} placeholder={placeholder} autoComplete="off" spellCheck="false" required={required && !value}
        onChange={e => { typed.current = true; setQ(e.target.value) }} onKeyDown={key} onBlur={blur}
        onFocus={e => e.target.select()} aria-busy={loading}
      />
      {open && (
        <ul id={`${id}-list`} role="listbox" className="combo-list">
          {opts.length ? opts.map((o, i) => (
            <li key={i} id={`${id}-${i}`} role="option" aria-selected={i === hi} onMouseDown={e => { e.preventDefault(); pick(o) }} onMouseEnter={() => setHi(i)}>
              {renderOption(o)}
            </li>
          )) : <li className="combo-empty">{emptyText}</li>}
        </ul>
      )}
    </div>
  )
}
