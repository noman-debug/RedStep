// The Mars explorer: a Google-Maps-style map of the whole planet. Globe view when zoomed out,
// flat map when zoomed in. Search the official place names, tap anywhere to see what is there,
// switch base maps, and zoom into mission sites for sharper orbital photos.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import * as maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { corners, marsMetresPerPixel, R_MARS } from '../lib/marsmap.js'
import { marsTime, sunAt, fmtHours } from '../lib/mars24.js'
import { earthMars } from '../lib/ephem.js'
import { SITES, siteMeta, siteTraverse, placeNames, basemapTiles } from '../data/index.js'
import { FAMOUS, famousByName } from '../content/places.js'
import { SITE } from '../content/site.js'
import { Sidebar, SbSection, SbRow, SbDisclosure } from './Sidebar.jsx'
import { Badge, Source } from './Atoms.jsx'
import { prefersReducedMotion, useNarrow } from '../lib/hooks.js'
import { deviceTier } from '../lib/quality.js'
import './explorer.css'

const thumb = (id) => basemapTiles(id).replace('{z}/{x}/{y}', '0/0/0')
const D = Math.PI / 180
const BASEMAPS = [
  { id: 'viking', name: 'Colour', by: 'Viking orbiters', maxzoom: 5 },
  { id: 'mola', name: 'Height', by: 'MGS MOLA laser', maxzoom: 4 },
  { id: 'dust', name: 'Dust', by: 'MGS TES', maxzoom: 2 },
]

const gc = (a, b) => {
  const la1 = a[1] * D, la2 = b[1] * D, dl = (b[0] - a[0]) * D
  const x = Math.sin((la2 - la1) / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dl / 2) ** 2
  return 2 * R_MARS * Math.asin(Math.min(1, Math.sqrt(x)))
}
/** The point `deg` degrees of arc from `p` ([lon, lat]) heading along compass bearing `brg`. */
const dest = (p, deg, brg) => {
  const la1 = p[1] * D, lo1 = p[0] * D, d = deg * D, b = brg * D
  const la2 = Math.asin(Math.sin(la1) * Math.cos(d) + Math.cos(la1) * Math.sin(d) * Math.cos(b))
  const lo2 = lo1 + Math.atan2(Math.sin(b) * Math.sin(d) * Math.cos(la1), Math.cos(d) - Math.sin(la1) * Math.sin(la2))
  return [((lo2 / D + 540) % 360) - 180, la2 / D]
}
const fmtLat = (v) => `${Math.abs(v).toFixed(2)}°${v >= 0 ? 'N' : 'S'}`
const fmtLon = (v) => `${Math.abs(v).toFixed(2)}°${v >= 0 ? 'E' : 'W'}`
const season = (Ls) => ['Northern spring', 'Northern summer', 'Northern autumn', 'Northern winter'][Math.floor((((Ls % 360) + 360) % 360) / 90)]
const partOfDay = (h) => (h < 5 ? 'night' : h < 11 ? 'morning' : h < 14 ? 'midday' : h < 19 ? 'afternoon' : 'night')
const km = (m) => (m >= 100000 ? `${Math.round(m / 1000).toLocaleString()} km` : `${(m / 1000).toFixed(1)} km`)

/** Day/night shading tiles drawn in the browser from the real subsolar point (Mars24). */
function registerNight(name) {
  maplibregl.removeProtocol?.(name)
  maplibregl.addProtocol(name, async (params) => {
    const [z, x, y] = params.url.replace(`${name}://`, '').split('/').map((v) => parseInt(v, 10))
    const t = marsTime(Date.now())
    const sd = t.dec * D, sl = t.subLonE * D
    const size = 128
    const c = new OffscreenCanvas(size, size)
    const ctx = c.getContext('2d')
    const img = ctx.createImageData(size, size)
    const n = 2 ** z
    for (let j = 0; j < size; j++) {
      const lat = Math.atan(Math.sinh(Math.PI * (1 - (2 * (y + (j + 0.5) / size)) / n)))
      for (let i = 0; i < size; i++) {
        const lon = (((x + (i + 0.5) / size) / n) * 360 - 180) * D
        const cz = Math.sin(sd) * Math.sin(lat) + Math.cos(sd) * Math.cos(lat) * Math.cos(lon - sl)
        const e = Math.asin(Math.max(-1, Math.min(1, cz))) / D // sun elevation
        const dark = Math.max(0, Math.min(1, (3 - e) / 12)) // soft twilight band
        const k = (j * size + i) * 4
        img.data[k] = 2; img.data[k + 1] = 4; img.data[k + 2] = 18; img.data[k + 3] = 228 * dark
      }
    }
    ctx.putImageData(img, 0, 0)
    return { data: await (await c.convertToBlob({ type: 'image/png' })).arrayBuffer() }
  })
}

// embedded: shown inside a scrolling page (the end of the home story). The page keeps
// scrolling; zooming needs ⌘/Ctrl + scroll, and panning on a phone needs two fingers.
export default function Explorer({ onReady, initial = 'jezero', visible = true, embedded = false }) {
  const el = useRef(null)
  const map = useRef(null)
  const labelsEl = useRef(null)
  const coordEl = useRef(null)
  const scaleEl = useRef(null)
  const navigate = useNavigate()
  const narrow = useNarrow()
  const [ready, setReady] = useState(false)
  const [names, setNames] = useState([])
  const [basemap, setBasemap] = useState('viking')
  const basemapRef = useRef(basemap)
  basemapRef.current = basemap
  const [overlays, setOverlays] = useState({ night: true, rovers: true, labels: true })
  const [layersOpen, setLayersOpen] = useState(false)
  const [sbOpen, setSbOpen] = useState(() => typeof window === 'undefined' || window.innerWidth > 820)
  const [query, setQuery] = useState('')
  const [sel, setSel] = useState(null) // { kind: 'site'|'name'|'pin', ... }
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 30000); return () => clearInterval(t) }, [])
  useEffect(() => { placeNames().then(setNames).catch(() => {}) }, [])

  // ---------- map ----------
  useEffect(() => {
    registerNight('marsnight')
    const start = SITES.find((s) => s.id === initial) || SITES[0]
    const m = new maplibregl.Map({
      container: el.current,
      style: {
        version: 8,
        projection: { type: 'globe' },
        sky: { 'sky-color': '#000000', 'horizon-color': '#c98a5b', 'fog-color': '#000000', 'atmosphere-blend': ['interpolate', ['linear'], ['zoom'], 0, 0.85, 4, 0.4, 6, 0] },
        sources: {},
        layers: [{ id: 'bg', type: 'background', paint: { 'background-color': '#000000' } }],
      },
      center: [start.lon, start.lat],
      zoom: narrow ? 1.25 : 2.15,
      minZoom: 0.4,
      maxZoom: 15,
      attributionControl: false,
      renderWorldCopies: false,
      fadeDuration: 0,
      cooperativeGestures: embedded,
      // weaker devices draw the globe at normal (not retina) resolution
      pixelRatio: Math.min(window.devicePixelRatio || 1, deviceTier() === 'low' ? 1 : 2),
      maxTileCacheSize: deviceTier() === 'low' ? 60 : 200,
    })
    map.current = m
    if (import.meta.env.DEV) window.__xmap = m
    m.addControl(new maplibregl.AttributionControl({ compact: true, customAttribution: 'NASA · JPL-Caltech · USGS · ASU · ESA/DLR/FU Berlin · IAU' }), 'bottom-right')

    m.on('load', async () => {
      for (const b of BASEMAPS) {
        m.addSource(`base-${b.id}`, { type: 'raster', tiles: [basemapTiles(b.id)], tileSize: 256, maxzoom: b.maxzoom })
        m.addLayer({ id: `base-${b.id}`, type: 'raster', source: `base-${b.id}`, paint: { 'raster-fade-duration': 0, 'raster-resampling': 'linear' }, layout: { visibility: b.id === 'viking' ? 'visible' : 'none' } })
      }
      // Sharper regional maps at the mission sites load only when you zoom in near one
      // (ensureDetails, on every move), not all at once when the map opens.
      m.addSource('night', { type: 'raster', tiles: ['marsnight://{z}/{x}/{y}'], tileSize: 256, maxzoom: 3 })
      m.addLayer({ id: 'night', type: 'raster', source: 'night', paint: { 'raster-fade-duration': 0, 'raster-opacity': 0.9 } })

      m.addSource('rovers', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
      m.addLayer({ id: 'rovers', type: 'line', source: 'rovers', minzoom: 6, paint: { 'line-color': '#e3895a', 'line-width': ['interpolate', ['linear'], ['zoom'], 6, 1, 12, 2.4], 'line-opacity': 0.9 }, layout: { 'line-join': 'round', 'line-cap': 'round' } })
      m.addSource('sites', { type: 'geojson', promoteId: 'id', data: { type: 'FeatureCollection', features: SITES.map((s) => ({ type: 'Feature', properties: { id: s.id, planner: s.planner }, geometry: { type: 'Point', coordinates: [s.lon, s.lat] } })) } })
      m.addLayer({ id: 'sites-halo', type: 'circle', source: 'sites', paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 0, 9, 8, 16], 'circle-color': '#e3895a', 'circle-opacity': ['case', ['boolean', ['feature-state', 'rim'], false], 0, 0.18], 'circle-pitch-alignment': 'map' } })
      m.addLayer({ id: 'sites', type: 'circle', source: 'sites', paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 0, 4, 8, 6], 'circle-color': ['case', ['get', 'planner'], '#e3895a', '#f5f7fb'], 'circle-stroke-color': '#000', 'circle-stroke-width': 1.5, 'circle-opacity': ['case', ['boolean', ['feature-state', 'rim'], false], 0, 1], 'circle-stroke-opacity': ['case', ['boolean', ['feature-state', 'rim'], false], 0, 1] } })
      m.addSource('pin', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
      m.addLayer({ id: 'pin', type: 'circle', source: 'pin', paint: { 'circle-radius': 7, 'circle-color': '#00e5ff', 'circle-stroke-color': '#000', 'circle-stroke-width': 2 } })


      m.on('click', 'sites', (e) => { e.preventDefault(); const s = SITES.find((x) => x.id === e.features[0].properties.id); if (s) selectSite(s) })
      m.on('mouseenter', 'sites', () => { m.getCanvas().style.cursor = 'pointer' })
      m.on('mouseleave', 'sites', () => { m.getCanvas().style.cursor = '' })
      m.on('click', (e) => {
        if (e.defaultPrevented) return
        dropPin([e.lngLat.lng, e.lngLat.lat])
      })
      setReady(true)
      onReady?.()
      ensureDetails()
    })

    const detailsAdded = new Set()
    let roversLoaded = false
    const near = (s, b, pad) => s.lon > b.getWest() - pad && s.lon < b.getEast() + pad && s.lat > b.getSouth() - pad && s.lat < b.getNorth() + pad
    const vis = (on) => ({ visibility: on ? 'visible' : 'none' })
    const ensureDetails = async () => {
      if (!m.getLayer('night')) return
      const z = m.getZoom()
      if (z < 4) return
      if (!roversLoaded && z >= 5.5) {
        // rover paths (drawn from zoom 6)
        roversLoaded = true
        Promise.all(SITES.map((s) => siteTraverse(s.id).then((t) => t?.line).catch(() => null))).then((lines) => {
          const feats = lines.filter(Boolean).map((c) => ({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: c } }))
          m.getSource('rovers')?.setData({ type: 'FeatureCollection', features: feats })
        })
      }
      const b = m.getBounds()
      const base = basemapRef.current
      for (const s of SITES) {
        if (!near(s, b, 8)) continue
        try {
          if (!detailsAdded.has(s.id)) {
            detailsAdded.add(s.id)
            const L = (await siteMeta(s.id)).layers
            if (L.viking) {
              m.addSource(`det-viking-${s.id}`, { type: 'image', url: L.viking.url, coordinates: corners(L.viking.bbox) })
              m.addLayer({ id: `det-viking-${s.id}`, type: 'raster', source: `det-viking-${s.id}`, minzoom: 5, paint: { 'raster-fade-duration': 0, 'raster-opacity': ['interpolate', ['linear'], ['zoom'], 5, 0, 6, 1] }, layout: vis(base === 'viking') }, 'base-mola')
            }
            if (L.relief) {
              m.addSource(`det-mola-${s.id}`, { type: 'image', url: L.relief.url, coordinates: corners(L.relief.bbox) })
              m.addLayer({ id: `det-mola-${s.id}`, type: 'raster', source: `det-mola-${s.id}`, minzoom: 5, paint: { 'raster-fade-duration': 0, 'raster-opacity': ['interpolate', ['linear'], ['zoom'], 5, 0, 6, 1] }, layout: vis(base === 'mola') }, 'night')
            }
          }
          // Planning sites' big orbital photos (about 1 MB each) wait for a closer zoom still.
          if (s.planner && z >= 7.5 && !detailsAdded.has(`${s.id}-photos`) && near(s, b, 1)) {
            detailsAdded.add(`${s.id}-photos`)
            const meta = await siteMeta(s.id)
            m.addSource(`det-ctx-${s.id}`, { type: 'image', url: meta.photo.url, coordinates: corners(meta.photo.bbox) })
            m.addLayer({ id: `det-ctx-${s.id}`, type: 'raster', source: `det-ctx-${s.id}`, minzoom: 8.5, paint: { 'raster-fade-duration': 0, 'raster-opacity': ['interpolate', ['linear'], ['zoom'], 8.5, 0, 9.5, 1] }, layout: vis(base !== 'dust') }, 'night')
            m.addSource(`det-hirise-${s.id}`, { type: 'image', url: meta.layers.hirise.url, coordinates: corners(meta.layers.hirise.bbox) })
            m.addLayer({ id: `det-hirise-${s.id}`, type: 'raster', source: `det-hirise-${s.id}`, minzoom: 11, paint: { 'raster-fade-duration': 0, 'raster-opacity': ['interpolate', ['linear'], ['zoom'], 11, 0, 12, 1] }, layout: vis(base !== 'dust') }, 'night')
          }
        } catch { /* site data missing: the global map still works */ }
      }
    }

    const move = () => { scheduleLabels(); updateScale() }
    m.on('move', move)
    m.on('moveend', ensureDetails)
    m.on('mousemove', (e) => { if (coordEl.current) coordEl.current.textContent = `${fmtLat(e.lngLat.lat)}  ${fmtLon(e.lngLat.lng)}` })
    return () => { m.remove(); map.current = null }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ---------- labels: DOM, priority + collision, written directly on move ----------
  const namesRef = useRef([])
  namesRef.current = names
  const overlaysRef = useRef(overlays)
  overlaysRef.current = overlays
  const rafRef = useRef(0)
  const scheduleLabels = useCallback(() => {
    if (rafRef.current) return
    rafRef.current = requestAnimationFrame(() => { rafRef.current = 0; drawRef.current() })
  }, [])
  const drawLabels = () => {
    const m = map.current, box = labelsEl.current
    if (!m || !box) return
    if (!overlaysRef.current.labels) { box.textContent = ''; return }
    const z = m.getZoom(), c = m.getCenter(), center = [c.lng, c.lat]
    const W = box.clientWidth, H = box.clientHeight
    const minRank = z < 3.2 ? 0 : z < 5 ? 2 : 3 // 0 = only mission sites and famous places
    const horizon = 80 // degrees from the centre: beyond this, points are on the far side of the globe
    const boxes = []
    const hit = (b) => boxes.some((o) => b[0] < o[2] && b[2] > o[0] && b[1] < o[3] && b[3] > o[1])
    // The globe camera has perspective, so its visible edge sits well inside 90° and the last
    // 20° or so are squeezed into a thin, mostly night-dark rim: labels there look like they
    // float in space. On the whole-planet view, keep points inside 95% of the disk on screen.
    let limb = null
    if (z < 4) {
      const pc = m.project(center)
      let r = 0
      for (const brg of [90, 270]) for (let a = 50; a <= 90; a += 4) {
        const q = m.project(dest(center, a, brg))
        r = Math.max(r, Math.hypot(q.x - pc.x, q.y - pc.y))
      }
      limb = { x: pc.x, y: pc.y, r }
    }
    const onDisk = (p) => !limb || Math.hypot(p.x - limb.x, p.y - limb.y) <= limb.r * 0.95
    // the mission-site dots are drawn by the map: labels must not cover them, and on the rim
    // they fade out with their labels
    for (const s of SITES) {
      const behind = gc(center, [s.lon, s.lat]) / R_MARS / D > horizon
      const p = m.project([s.lon, s.lat])
      const rim = !behind && !onDisk(p)
      if (m.getSource('sites')) m.setFeatureState({ source: 'sites', id: s.id }, { rim })
      if (!behind && !rim) boxes.push([p.x - 5, p.y - 5, p.x + 5, p.y + 5])
    }
    const out = []
    for (const s of SITES) out.push([s.name, s.lon, s.lat, 'site', 0])
    for (const n of namesRef.current) {
      if (minRank === 0 ? !famousByName[n[0]] : n[4] > minRank) continue
      out.push(n)
    }
    const frag = document.createDocumentFragment()
    let count = 0
    for (const n of out) {
      if (count > 90) break
      if (gc(center, [n[1], n[2]]) / R_MARS / D > horizon) continue
      let p = m.project([n[1], n[2]])
      if (!onDisk(p)) {
        // the big regions (Hellas, Planum Boreum…) are wide enough to label just inside the rim
        if (n[4] !== 1) continue
        const k = (limb.r * 0.9) / Math.hypot(p.x - limb.x, p.y - limb.y)
        p = { x: limb.x + (p.x - limb.x) * k, y: limb.y + (p.y - limb.y) * k }
      }
      if (p.x < -40 || p.y < -20 || p.x > W + 40 || p.y > H + 20) continue
      // approximate label box (site labels sit to the right of their dot)
      const w = n[0].length * (n[4] === 1 ? 9.5 : 6.6) + 12, h = 18
      const x0 = n[4] === 0 ? p.x + 6 : p.x - w / 2
      let box = [x0, p.y - h / 2, x0 + w, p.y + h / 2]
      // a site label whose right side is taken tries the left of its dot
      const left = n[4] === 0 && hit(box)
      if (left) box = [p.x - 6 - w, p.y - h / 2, p.x - 6, p.y + h / 2]
      if (hit(box)) continue
      // and a site label must not run off the planet either
      if (n[4] === 0 && limb && Math.hypot((left ? box[0] : box[2]) - limb.x, p.y - limb.y) > limb.r) continue
      boxes.push(box)
      const d = document.createElement('span')
      d.className = `xl xl-r${n[4]}${left ? ' xl-left' : ''}`
      d.textContent = n[0]
      d.dataset.name = n[0]
      d.style.transform = `translate3d(${p.x}px, ${p.y}px, 0)`
      frag.appendChild(d)
      count++
    }
    box.replaceChildren(frag)
  }
  const drawRef = useRef(drawLabels)
  drawRef.current = drawLabels
  useEffect(() => { if (ready) drawLabels() }, [ready, names, overlays.labels]) // eslint-disable-line react-hooks/exhaustive-deps

  const updateScale = () => {
    const m = map.current, s = scaleEl.current
    if (!m || !s) return
    const mpp = marsMetresPerPixel(m.getZoom(), m.getCenter().lat)
    const nice = [100, 200, 500, 1000, 2000, 5000, 10000, 20000, 50000, 100000, 200000, 500000, 1000000].reduce((a, b) => (Math.abs(b - 90 * mpp) < Math.abs(a - 90 * mpp) ? b : a))
    s.style.width = `${Math.min(160, nice / mpp)}px`
    s.dataset.label = nice >= 1000 ? `${nice / 1000} km` : `${nice} m`
  }

  // Keep the map centred in the space the sidebar leaves free.
  useEffect(() => {
    const m = map.current
    if (!m) return
    const left = sbOpen && !narrow ? 352 : 0
    m.easeTo({ padding: { left, top: 0, right: 0, bottom: 0 }, duration: prefersReducedMotion() ? 0 : 700 })
  }, [sbOpen, narrow, ready])

  // ---------- basemap + overlays ----------
  useEffect(() => {
    const m = map.current
    if (!ready || !m) return
    for (const b of BASEMAPS) m.setLayoutProperty(`base-${b.id}`, 'visibility', b.id === basemap ? 'visible' : 'none')
    for (const s of SITES) {
      if (m.getLayer(`det-viking-${s.id}`)) m.setLayoutProperty(`det-viking-${s.id}`, 'visibility', basemap === 'viking' ? 'visible' : 'none')
      if (m.getLayer(`det-mola-${s.id}`)) m.setLayoutProperty(`det-mola-${s.id}`, 'visibility', basemap === 'mola' ? 'visible' : 'none')
    }
    for (const id of SITES.filter((x) => x.planner).flatMap((x) => [`det-ctx-${x.id}`, `det-hirise-${x.id}`])) if (m.getLayer(id)) m.setLayoutProperty(id, 'visibility', basemap === 'dust' ? 'none' : 'visible')
    m.setLayoutProperty('night', 'visibility', overlays.night ? 'visible' : 'none')
    m.setLayoutProperty('rovers', 'visibility', overlays.rovers ? 'visible' : 'none')
  }, [ready, basemap, overlays])

  // ---------- selection ----------
  const fly = (lon, lat, zoom) => map.current?.flyTo({ center: [lon, lat], zoom, duration: prefersReducedMotion() ? 0 : 2600, curve: 1.5, essential: true })
  const setPin = (p) => map.current?.getSource('pin')?.setData({ type: 'FeatureCollection', features: p ? [{ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: p } }] : [] })
  const selectSite = (s) => { setSel({ kind: 'site', site: s, lon: s.lon, lat: s.lat }); setPin(null); fly(s.lon, s.lat, s.id === 'jezero' ? 9.2 : 7); if (!narrow) setSbOpen(true) }
  const selectName = (n) => { setSel({ kind: 'name', name: n[0], type: n[3], lon: n[1], lat: n[2] }); setPin([n[1], n[2]]); fly(n[1], n[2], n[4] === 1 ? 3.6 : n[4] === 2 ? 5 : 7); setQuery(''); setSbOpen(true) }
  const dropPin = (p) => {
    setPin(p)
    setSel({ kind: 'pin', lon: p[0], lat: p[1] })
    setSbOpen(true)
  }

  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (q.length < 2) return []
    const siteHits = SITES.filter((s) => s.name.toLowerCase().includes(q)).map((s) => ({ kind: 'site', s }))
    const score = (n) => {
      const t = n[0].toLowerCase()
      return (famousByName[n[0]] ? 0 : 10) + (t.startsWith(q) ? 0 : t.split(' ').some((w) => w.startsWith(q)) ? 2 : 4) + n[4]
    }
    const nameHits = names.filter((n) => n[0].toLowerCase().includes(q))
      .sort((a, b) => score(a) - score(b) || a[0].localeCompare(b[0]))
      .slice(0, 8).map((n) => ({ kind: 'name', n }))
    return [...siteHits, ...nameHits].slice(0, 9)
  }, [query, names])

  const famous = useMemo(() => FAMOUS.map((f) => names.find((n) => n[0] === f.name)).filter(Boolean), [names])

  // ---------- place card data ----------
  const info = useMemo(() => {
    if (!sel) return null
    const t = marsTime(now)
    const s = sunAt(now, sel.lat, sel.lon, t)
    const jez = SITES[0]
    const nearest = sel.kind === 'pin' && names.length
      ? names.reduce((best, n) => { const d = gc([sel.lon, sel.lat], [n[1], n[2]]); return d < best.d ? { n, d } : best }, { n: null, d: Infinity })
      : null
    return { s, t, fromJezero: gc([sel.lon, sel.lat], [jez.lon, jez.lat]), nearest }
  }, [sel, now, names])

  const clock = useMemo(() => {
    const t = marsTime(now)
    return { t, em: earthMars(now) }
  }, [now])

  const card = sel && info && (
    <div className="xp-card">
      <button type="button" className="xp-back" onClick={() => { setSel(null); setPin(null) }}>‹ All places</button>
      <p className="xp-kind">{sel.kind === 'site' ? sel.site.short : sel.kind === 'name' ? (famousByName[sel.name]?.short || sel.type) : 'Dropped pin'}</p>
      <h2 className="xp-name">{sel.kind === 'site' ? sel.site.name : sel.kind === 'name' ? sel.name : `${fmtLat(sel.lat)}, ${fmtLon(sel.lon)}`}</h2>
      {sel.kind === 'site' && <p className="xp-text">{sel.site.why}</p>}
      {sel.kind === 'name' && famousByName[sel.name] && <p className="xp-text">{famousByName[sel.name].fact} <Source k={famousByName[sel.name].source} badge="nasa" /></p>}
      {sel.kind === 'pin' && info.nearest?.n && (
        <p className="xp-text">Nearest named place: <button type="button" className="xp-link" onClick={() => selectName(info.nearest.n)}>{info.nearest.n[0]}</button> ({info.nearest.n[3].toLowerCase()}), {km(info.nearest.d)} away.</p>
      )}

      {sel.kind === 'site' && (
        <div className="xp-actions">
          <button type="button" className="btn btn-primary" onClick={() => navigate(`/site/${sel.site.id}`)}>{sel.site.planner ? 'Plan a walk here' : 'Open site map'} <span className="arrow">→</span></button>
        </div>
      )}

      <dl className="xp-facts">
        <div><dt>Position</dt><dd className="mono">{fmtLat(sel.lat)} · {fmtLon(sel.lon)}</dd></div>
        <div><dt>Right now</dt><dd>{info.s.elevation > 0 ? `Sun is up · ${partOfDay(info.s.ltst)}` : 'Night · sun is down'} ({fmtHours(info.s.ltst)} Mars time)</dd></div>
        <div><dt>Distance from Jezero</dt><dd>{info.fromJezero < 1000 ? 'You are here' : km(info.fromJezero)}</dd></div>
        {sel.kind === 'site' && <div><dt>Mission</dt><dd>{sel.site.mission}</dd></div>}
      </dl>
      <button type="button" className="xp-copy" onClick={() => navigator.clipboard?.writeText(`${sel.lat.toFixed(4)}, ${sel.lon.toFixed(4)}`)}>Copy coordinates</button>

      <SbDisclosure title="References">
        <ul>
          <li>{sel.kind === 'site' ? sel.site.coordSource : sel.kind === 'name' ? 'Name and position: IAU/USGS Gazetteer of Planetary Nomenclature, via NASA Mars Trek.' : 'Position from the map you tapped.'}</li>
          <li>Local time and sun height: NASA GISS Mars24 algorithm, computed in your browser. <Badge kind="derived" /></li>
          <li>Distances on a sphere of Mars radius 3,396 km.</li>
        </ul>
      </SbDisclosure>
    </div>
  )

  return (
    <div className={`xp ${visible ? 'xp-in' : ''} ${ready ? 'xp-ready' : ''}`}>
      <div ref={el} className="xp-map" />
      {!ready && <p className="xp-loading" role="status"><i className="spinner" aria-hidden="true" />Loading Mars imagery…</p>}
      <div ref={labelsEl} className="xp-labels" aria-hidden="true" onClick={(e) => {
        const nm = e.target.dataset?.name
        if (!nm) return
        const site = SITES.find((x) => x.name === nm)
        if (site) return selectSite(site)
        const n = names.find((x) => x[0] === nm)
        if (n) selectName(n)
      }} />

      <Sidebar
        open={sbOpen}
        onToggle={() => setSbOpen((o) => !o)}
        title="Mars"
        label="Places on Mars"
        header={(
          <div className="xp-search">
            <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><circle cx="7" cy="7" r="5" fill="none" stroke="currentColor" strokeWidth="1.6" /><line x1="10.8" y1="10.8" x2="14.5" y2="14.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
            <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search Mars" aria-label="Search places on Mars"
              onKeyDown={(e) => { if (e.key === 'Enter' && results[0]) { results[0].kind === 'site' ? selectSite(results[0].s) : selectName(results[0].n) } if (e.key === 'Escape') setQuery('') }} />
          </div>
        )}
        footer={<>{SITE.disclaimer}</>}
      >
        {query.trim().length >= 2 ? (
          <SbSection title={results.length ? 'Results' : 'No matches'}>
            {results.map((r) => r.kind === 'site'
              ? <SbRow key={r.s.id} icon="●" title={r.s.name} sub={r.s.kind} onClick={() => { selectSite(r.s); setQuery('') }} />
              : <SbRow key={r.n[0]} icon="⌖" tone="ice" title={r.n[0]} sub={`${r.n[3]} · ${fmtLat(r.n[2])} ${fmtLon(r.n[1])}`} onClick={() => selectName(r.n)} />)}
          </SbSection>
        ) : card || (
          <>
            <p className="xp-welcome">Tap a place to learn about it. <span className="xp-star">★</span> marks where you can plan a walk.</p>
            <SbSection title="Mission sites">
              {SITES.map((s) => <SbRow key={s.id} icon={s.planner ? '★' : '●'} tone={s.planner ? 'rust' : 'grey'} title={s.name} sub={s.short} onClick={() => selectSite(s)} />)}
            </SbSection>
            <SbSection title="Famous places">
              {famous.map((n) => <SbRow key={n[0]} icon="⌖" tone="ice" title={n[0]} sub={famousByName[n[0]]?.short || n[3]} onClick={() => selectName(n)} />)}
            </SbSection>
          </>
        )}
      </Sidebar>

      {!sbOpen && narrow && (
        <button type="button" className="xp-searchpill" onClick={() => setSbOpen(true)}>
          <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><circle cx="7" cy="7" r="5" fill="none" stroke="currentColor" strokeWidth="1.6" /><line x1="10.8" y1="10.8" x2="14.5" y2="14.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
          Search Mars
        </button>
      )}

      <div className="xp-clock" title="Worked out in your browser from the planets' orbits (NASA GISS Mars24). Not live data.">
        <span>On Mars now: <b>{season(clock.t.Ls)}</b></span>
        <span className="xp-clock-msg">Message to Earth <b>{clock.em.lightMin.toFixed(0)} min</b></span>
      </div>

      <div className={`xp-layers ${layersOpen ? 'open' : ''}`}>
        <button type="button" className="xp-layers-btn" aria-expanded={layersOpen} onClick={() => setLayersOpen((o) => !o)}>
          <img src={thumb(basemap === 'viking' ? 'mola' : 'viking')} alt="" />
          <span>Layers</span>
        </button>
        {layersOpen && (
          <div className="xp-layers-pop" role="dialog" aria-label="Map layers">
            <p className="xp-pop-title">Map type</p>
            <div className="xp-types">
              {BASEMAPS.map((b) => (
                <button key={b.id} type="button" className={basemap === b.id ? 'on' : ''} aria-pressed={basemap === b.id} onClick={() => setBasemap(b.id)}>
                  <img src={thumb(b.id)} alt="" />
                  <span>{b.name}</span>
                  <small>{b.by}</small>
                </button>
              ))}
            </div>
            <p className="xp-pop-title">Show</p>
            {[['night', 'Day and night (now)'], ['rovers', 'Rover paths'], ['labels', 'Place names']].map(([k, label]) => (
              <label key={k} className="xp-check">
                <input type="checkbox" checked={overlays[k]} onChange={(e) => setOverlays((o) => ({ ...o, [k]: e.target.checked }))} />
                <span>{label}</span>
              </label>
            ))}
          </div>
        )}
      </div>

      <div className="xp-zoom" role="group" aria-label="Map controls">
        <button type="button" aria-label="Zoom in" onClick={() => map.current?.zoomIn()}>+</button>
        <button type="button" aria-label="Zoom out" onClick={() => map.current?.zoomOut()}>−</button>
        <button type="button" aria-label="Whole planet" title="Whole planet" onClick={() => map.current?.flyTo({ zoom: narrow ? 1.25 : 2.15, pitch: 0, bearing: 0, duration: prefersReducedMotion() ? 0 : 1800 })}>
          <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><circle cx="8" cy="8" r="6.2" fill="none" stroke="currentColor" strokeWidth="1.3" /><ellipse cx="8" cy="8" rx="2.6" ry="6.2" fill="none" stroke="currentColor" strokeWidth="1.1" /><line x1="1.8" y1="8" x2="14.2" y2="8" stroke="currentColor" strokeWidth="1.1" /></svg>
        </button>
      </div>

      <div className="xp-status mono" aria-hidden="true">
        <span className="xp-scale" ref={scaleEl} />
      </div>
    </div>
  )
}
