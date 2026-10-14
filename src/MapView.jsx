import { useEffect, useRef } from 'react'
import * as maplibregl from 'maplibre-gl'
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

export default function MapView({ stops, active, places, routes = [], legs = [], legFocus, inks, overview, selected, onPick }) {
  const box = useRef(null)
  const map = useRef(null)
  const markers = useRef([])
  const pins = useRef([]) // place index -> pin element
  const popup = useRef(null)
  const pending = useRef(null) // latest draw requested before the style loaded

  useEffect(() => {
    const m = new maplibregl.Map({ container: box.current, style: STYLE, center: [12.5, 45], zoom: 3.4, attributionControl: { compact: true } })
    m.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right')
    m.on('load', () => {
      tint(m)
      m.addSource('route', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
      m.addLayer({ id: 'route', type: 'line', source: 'route', paint: { 'line-color': '#16213f', 'line-width': 2.5, 'line-dasharray': [2, 1.6] } })
      m.addSource('legs', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
      m.addLayer({ id: 'legs', type: 'line', source: 'legs', layout: { 'line-cap': 'round' }, paint: { 'line-color': '#16213f', 'line-width': ['case', ['get', 'hot'], 4, 2.5], 'line-opacity': ['case', ['get', 'hot'], 1, 0.7], 'line-dasharray': [1, 1.6] } })
      m.addSource('days', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
      const daysPaint = { 'line-color': ['get', 'ink'], 'line-opacity': ['case', ['get', 'dim'], 0.35, 0.9], 'line-width': ['case', ['get', 'hot'], 5, 3.5] }
      // Day 1 solid, later days dashed, so overlapping days stay readable.
      m.addLayer({ id: 'days-solid', type: 'line', source: 'days', filter: ['==', ['get', 'day'], 0], layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: daysPaint })
      m.addLayer({ id: 'days-dashed', type: 'line', source: 'days', filter: ['>', ['get', 'day'], 0], layout: { 'line-join': 'round' }, paint: { ...daysPaint, 'line-dasharray': [1.6, 1.2] } })
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

      // Stops have no map marker: they are chosen from the rail in the side panel.

      const ink = inks[active % inks.length]
      const anyHot = routes.some(r => r.hot)
      m.getSource('days')?.setData({
        type: 'FeatureCollection',
        features: routes.filter(r => r.coords.length > 1).map(r => ({
          type: 'Feature',
          properties: { day: r.day, ink: ink.bg, hot: r.hot, dim: anyHot && !r.hot },
          geometry: { type: 'LineString', coordinates: r.coords },
        })),
      })
      m.getSource('legs')?.setData({
        type: 'FeatureCollection',
        features: legs.filter(l => (overview || l.hot) && l.coords.length > 1).map(l => ({ type: 'Feature', properties: { hot: !!l.hot }, geometry: { type: 'LineString', coordinates: l.coords } })),
      })
      for (const l of legs.filter(l => overview || l.hot)) {
        for (const p of l.pins || []) {
          if (p?.lat == null) continue
          const el = document.createElement('div')
          el.className = 'leg-pin'
          el.textContent = p.label
          markers.current.push(new maplibregl.Marker({ element: el }).setLngLat([p.lng, p.lat]).addTo(m))
        }
      }
      pins.current = []
      places.forEach((p, n) => {
        if (p.lat == null) return
        const el = document.createElement('button')
        el.className = 'pin' + (n === selected ? ' is-selected' : '')
        el.style.setProperty('--ink', ink.bg)
        el.style.setProperty('--on-ink', ink.fg)
        el.textContent = n + 1
        el.title = p.name
        el.setAttribute('aria-label', `${n + 1}. ${p.name}`)
        el.addEventListener('click', e => { e.stopPropagation(); onPick(n) })
        pins.current[n] = el
        markers.current.push(new maplibregl.Marker({ element: el }).setLngLat([p.lng, p.lat]).addTo(m))
      })

      const focus = places.filter(p => p.lat != null)
      const here = stops[active]?.lat != null ? [stops[active]] : []
      // Overview frames the whole route; a stop frames its places, or its city when it has none yet.
      const hotLeg = legs.find(l => l.hot)
      const legPts = legs.flatMap(l => l.coords.length ? [l.coords[0], l.coords.at(-1)] : []).map(([lng, lat]) => ({ lat, lng }))
      const pts = legFocus && hotLeg ? hotLeg.coords.map(([lng, lat]) => ({ lat, lng }))
        : overview ? [...located, ...legPts] : focus.length ? focus : here.length ? here : located
      if (!pts.length) return
      const b = new maplibregl.LngLatBounds()
      pts.forEach(p => b.extend([p.lng, p.lat]))
      m.fitBounds(b, { padding: 72, maxZoom: pts.length === 1 ? 11 : 14, duration: 900 })
    }
    if (pending.current === 'ready') draw()
    else pending.current = draw
    // selected is read inside draw for the initial class only; the effect below owns selection changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stops, active, places, routes, legs, legFocus, inks, onPick, overview])

  // Highlight the picked place: stamp its pin, name it, and bring it into view without re-fitting the stop.
  useEffect(() => {
    const m = map.current
    pins.current.forEach((el, i) => el?.classList.toggle('is-selected', i === selected))
    popup.current?.remove()
    const p = selected == null ? null : places[selected]
    if (p?.lat == null || pending.current !== 'ready') return
    popup.current = new maplibregl.Popup({ offset: 18, closeButton: false, closeOnClick: false }).setLngLat([p.lng, p.lat]).setText(p.name).addTo(m)
    m.easeTo({ center: [p.lng, p.lat], zoom: Math.max(m.getZoom(), 15), duration: 700 })
  }, [selected, places])

  return <div ref={box} className="map" role="region" aria-label="Map" />
}
