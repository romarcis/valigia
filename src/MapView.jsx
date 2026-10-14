import { useEffect, useRef } from 'react'
import * as maplibregl from 'maplibre-gl'
import { dayTone } from './util.js'
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url'

maplibregl.setWorkerUrl(workerUrl)

// Free vector tiles, no key. Tinted below to the app's paper/ink palette.
const STYLE = 'https://tiles.openfreemap.org/styles/positron'

// Repaint the stock style in the app's inks: paper land, ink-blue water, navy type.
function tint(map) {
  for (const l of map.getStyle().layers) {
    try {
      const id = l.id
      if (l.type === 'background') map.setPaintProperty(id, 'background-color', '#e6e9ed')
      else if (l.type === 'fill' && id.includes('water')) map.setPaintProperty(id, 'fill-color', '#b4c6db')
      else if (l.type === 'fill' && /park|wood|grass|landcover/.test(id)) map.setPaintProperty(id, 'fill-color', '#d6dfd4')
      else if (l.type === 'fill' && /building/.test(id)) map.setPaintProperty(id, 'fill-color', '#dcdfe4')
      else if (l.type === 'line' && /road|highway|street|bridge|tunnel/.test(id) && !/casing/.test(id)) map.setPaintProperty(id, 'line-color', '#fbfbfc')
      else if (l.type === 'line' && /casing/.test(id)) map.setPaintProperty(id, 'line-color', '#c4cbd5')
      else if (l.type === 'line' && /water|river/.test(id)) map.setPaintProperty(id, 'line-color', '#b4c6db')
      else if (l.type === 'symbol' && l.layout?.['text-field']) {
        map.setPaintProperty(id, 'text-color', /water/.test(id) ? '#3d5a80' : '#2c3654')
        map.setPaintProperty(id, 'text-halo-color', '#eef0f2')
        const font = map.getLayoutProperty(id, 'text-font')
        if (Array.isArray(font) && font.some(f => typeof f === 'string' && f.includes('Italic'))) map.setLayoutProperty(id, 'text-font', ['Noto Sans Regular'])
      }
    } catch { /* layer without that property */ }
  }
}

// Phosphor's ForkKnife (bold): map markers are plain DOM, not React.
const FORK_KNIFE = '<svg viewBox="0 0 256 256" width="14" height="14" fill="currentColor" aria-hidden="true"><path d="M68,88V40a12,12,0,0,1,24,0V88a12,12,0,0,1-24,0ZM220,40V224a12,12,0,0,1-24,0V180H152a12,12,0,0,1-12-12,273.23,273.23,0,0,1,7.33-57.82C157.42,68.42,176.76,40.33,203.27,29A12,12,0,0,1,220,40ZM196,62.92C182.6,77,175,98,170.77,115.38A254.41,254.41,0,0,0,164.55,156H196ZM128,39A12,12,0,0,0,104,41l4,47.46a28,28,0,0,1-56,0L56,41A12,12,0,1,0,32,39L28,87c0,.34,0,.67,0,1a52.1,52.1,0,0,0,40,50.59V224a12,12,0,0,0,24,0V138.59A52.1,52.1,0,0,0,132,88c0-.33,0-.66,0-1Z"/></svg>'

export default function MapView({ stops, active, places, tags = [], venues = [], hotel, routes = [], dayCount = 1, inks, overview, selected, onPick, onStop }) {
  const box = useRef(null)
  const map = useRef(null)
  const markers = useRef([])
  const pins = useRef({}) // place index or venue key -> pin element
  const popup = useRef(null)
  const pending = useRef(null) // latest draw requested before the style loaded

  useEffect(() => {
    const m = new maplibregl.Map({ container: box.current, style: STYLE, center: [12.5, 45], zoom: 3.4, attributionControl: { compact: true } })
    m.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right')
    m.on('load', () => {
      tint(m)
      m.addSource('route', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
      m.addLayer({ id: 'route', type: 'line', source: 'route', paint: { 'line-color': '#16213f', 'line-width': 2.5, 'line-dasharray': [2, 1.6] } })
      m.addSource('days', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
      // Every day in a tone of the stop's ink, edged in the full ink so light tones stay visible on the paper map.
      const opacity = ['case', ['get', 'dim'], 0.35, 0.95]
      const round = { 'line-cap': 'round', 'line-join': 'round' }
      m.addLayer({ id: 'days-edge', type: 'line', source: 'days', layout: round, paint: { 'line-color': ['get', 'edge'], 'line-opacity': opacity, 'line-width': ['case', ['get', 'hot'], 7, 5.5] } })
      m.addLayer({ id: 'days', type: 'line', source: 'days', layout: round, paint: { 'line-color': ['get', 'ink'], 'line-opacity': opacity, 'line-width': ['case', ['get', 'hot'], 4.5, 3] } })
      const draw = pending.current
      pending.current = 'ready'
      if (typeof draw === 'function') draw()
    })
    map.current = m
    // The container changes size with the panel and on phones; keep the canvas filling it.
    const ro = new ResizeObserver(() => m.resize())
    ro.observe(box.current)
    return () => { ro.disconnect(); m.remove() }
  }, [])

  useEffect(() => {
    const m = map.current
    const draw = () => {
      markers.current.forEach(mk => mk.remove())
      markers.current = []
      const located = stops.map((s, i) => ({ ...s, i })).filter(s => s.lat != null)

      m.getSource('route')?.setData({
        type: 'Feature',
        geometry: { type: 'LineString', coordinates: located.map(s => [s.lng, s.lat]) },
      })

      // Overview: every stop as its luggage label; the active one is stamped. Inside a stop its places speak instead.
      if (overview) {
        for (const s of located) {
          const ink = inks[s.i % inks.length]
          // MapLibre positions the marker element with its own transform: the label tilts inside it.
          const el = document.createElement('div')
          const label = document.createElement('button')
          label.className = 'label' + (s.i === active ? ' is-active' : '')
          label.style.setProperty('--ink', ink.bg)
          label.style.setProperty('--on-ink', ink.fg)
          label.innerHTML = `<b>${String(s.i + 1).padStart(2, '0')}</b><span></span>`
          label.querySelector('span').textContent = s.city
          label.setAttribute('aria-label', `${s.i + 1}. ${s.city}`)
          label.addEventListener('click', e => { e.stopPropagation(); onStop?.(s.i) })
          el.append(label)
          if (s.i === active) el.style.zIndex = 2
          markers.current.push(new maplibregl.Marker({ element: el }).setLngLat([s.lng, s.lat]).addTo(m))
        }
      }

      const ink = inks[active % inks.length]
      const tone = d => dayTone(ink, d, dayCount)
      const anyHot = routes.some(r => r.hot)
      m.getSource('days')?.setData({
        type: 'FeatureCollection',
        features: routes.filter(r => r.coords.length > 1).map(r => ({
          type: 'Feature',
          properties: { day: r.day, ink: tone(r.day).bg, edge: ink.bg, hot: r.hot, dim: anyHot && !r.hot },
          geometry: { type: 'LineString', coordinates: r.coords },
        })),
      })
      pins.current = {}
      places.forEach((p, n) => {
        if (p.lat == null) return
        const el = document.createElement('button')
        el.className = 'pin' + (n === selected ? ' is-selected' : '')
        const tag = tags[n] // places outside the itinerary have no number
        const pinInk = tag ? tone(tag.day) : ink
        el.style.setProperty('--ink', pinInk.bg)
        el.style.setProperty('--on-ink', pinInk.fg)
        el.textContent = tag ? tag.n : '•'
        el.title = p.name
        el.setAttribute('aria-label', tag ? `${tag.n}. ${p.name}` : p.name)
        el.addEventListener('click', e => { e.stopPropagation(); onPick(n) })
        pins.current[n] = el
        markers.current.push(new maplibregl.Marker({ element: el }).setLngLat([p.lng, p.lat]).addTo(m))
      })

      // Meal venues: the next number of their day, like the places (a knife and fork if unnumbered).
      for (const v of venues) {
        const el = document.createElement('button')
        el.className = (v.n ? 'pin' : 'pin pin-meal') + (v.key === selected ? ' is-selected' : '')
        const vInk = tone(v.day)
        el.style.setProperty('--ink', vInk.bg)
        el.style.setProperty('--on-ink', vInk.fg)
        el.title = v.name
        if (v.n) { el.textContent = v.n; el.setAttribute('aria-label', `${v.n}. ${v.name}`) } else el.innerHTML = FORK_KNIFE
        el.addEventListener('click', e => { e.stopPropagation(); onPick(v.key) })
        pins.current[v.key] = el
        markers.current.push(new maplibregl.Marker({ element: el }).setLngLat([v.lng, v.lat]).addTo(m))
      }

      if (hotel?.lat != null) {
        const el = document.createElement('div')
        el.className = 'pin pin-hotel' // place 0 of every day
        el.style.setProperty('--ink', ink.bg)
        el.style.setProperty('--on-ink', ink.fg)
        el.textContent = '0'
        el.title = hotel.name
        markers.current.push(new maplibregl.Marker({ element: el }).setLngLat([hotel.lng, hotel.lat]).addTo(m))
      }

      const focus = [...places, ...(hotel ? [hotel] : [])].filter(p => p.lat != null)
      const here = stops[active]?.lat != null ? [stops[active]] : []
      // Overview frames the whole route; a stop frames its places, or its city when it has none yet.
      const pts = overview ? located : focus.length ? focus : here.length ? here : located
      if (!pts.length) return
      const b = new maplibregl.LngLatBounds()
      pts.forEach(p => b.extend([p.lng, p.lat]))
      m.fitBounds(b, { padding: 72, maxZoom: pts.length === 1 ? 11 : 14, duration: 900 })
    }
    if (pending.current === 'ready') draw()
    else pending.current = draw
    // selected is read inside draw for the initial class only; the effect below owns selection changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stops, active, places, tags, venues, hotel, routes, dayCount, inks, onPick, onStop, overview])

  // Highlight the picked place: stamp its pin, name it, and bring it into view without re-fitting the stop.
  useEffect(() => {
    const m = map.current
    for (const [k, el] of Object.entries(pins.current)) el.classList.toggle('is-selected', k === String(selected))
    popup.current?.remove()
    const p = selected == null ? null : typeof selected === 'string' ? venues.find(v => v.key === selected) : places[selected]
    if (p?.lat == null || pending.current !== 'ready') return
    popup.current = new maplibregl.Popup({ offset: 18, closeButton: false, closeOnClick: false }).setLngLat([p.lng, p.lat]).setText(p.name).addTo(m)
    m.easeTo({ center: [p.lng, p.lat], zoom: Math.max(m.getZoom(), 15), duration: 700 })
  }, [selected, places, venues])

  return <div ref={box} className="map" role="region" aria-label="Map" />
}
