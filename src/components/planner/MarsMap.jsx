import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'
import * as maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { circle, corners, marsMetresPerPixel, registerDem } from '../../lib/marsmap.js'
import { prefersReducedMotion } from '../../lib/hooks.js'
import { deviceTier } from '../../lib/quality.js'

const EMPTY = { type: 'FeatureCollection', features: [] }
const fc = (features) => ({ type: 'FeatureCollection', features })
const pt = (lon, lat, props = {}) => ({ type: 'Feature', properties: props, geometry: { type: 'Point', coordinates: [lon, lat] } })
const line = (coords, props = {}) => ({ type: 'Feature', properties: props, geometry: { type: 'LineString', coordinates: coords } })

/** Padding that frames a route in the part of the map the nav, tool bar and panels leave clear,
 *  measured from the page as it is (sidebar open or shut, phone sheet up or down). */
function clearArea(m) {
  const root = m.getContainer().closest('.planner') || m.getContainer()
  const R = root.getBoundingClientRect()
  const box = (el) => {
    if (!el) return null
    const r = el.getBoundingClientRect()
    return r.width && r.height && getComputedStyle(el).visibility !== 'hidden' ? r : null
  }
  const gap = 24
  let top = R.top + gap, bottom = R.bottom - gap, left = R.left + gap, right = R.right - gap
  for (const r of [box(document.querySelector('.nav')), box(root.querySelector('.actionbar'))]) if (r) top = Math.max(top, r.bottom + gap)
  for (const r of [box(root.querySelector('.sheet')), box(root.querySelector('.profile-dock'))]) if (r && r.top > R.top + R.height / 3) bottom = Math.min(bottom, r.top - gap)
  const sb = box(root.querySelector('.sb-left.sb-open'))
  if (sb && sb.right > R.left && sb.right < R.left + R.width / 2) left = Math.max(left, sb.right + gap)
  const side = box(root.querySelector('.side-right'))
  if (side && side.left > R.left + R.width / 2) right = Math.min(right, side.left - gap)
  // too little room left (a tall phone sheet, a tiny window): keep a fair share of the map
  if (bottom - top < 160) bottom = Math.max(top + 160, R.top + R.height * 0.55)
  if (right - left < 160) { left = R.left + gap; right = R.right - gap }
  return { top: top - R.top, bottom: Math.max(gap, R.bottom - bottom), left: left - R.left, right: R.right - right }
}

/**
 * The layered Mars map. Parent drives it through the ref:
 *   setLayer(id, on, opacity) · setImage(id, url) · setRoute(line, waypoints) · setStops(stops, visited)
 *   setMarkers({ habitat, turnBack }) · setRadius(lon, lat, m) · setHover(lon, lat) · follow(profile, hud)
 *   groundView(lon, lat, onTurn) · snapshot()
 */
const MarsMap = forwardRef(function MarsMap({ meta, grid, layers, onMapClick, onWaypointDrag, onStopClick, onReady, drawing, roverMode = false }, ref) {
  const el = useRef(null)
  const map = useRef(null)
  const ready = useRef(false)
  const scale = useRef(null)
  const wps = useRef([])
  const deferred = useRef(new Map()) // layer id -> image not loaded yet
  const cb = useRef({})
  cb.current = { onMapClick, onWaypointDrag, onStopClick, drawing, roverMode }

  useEffect(() => {
    const [w, s, e, n] = meta.grid.bbox
    const ctx = meta.layers.viking?.bbox || meta.grid.bbox
    const m = new maplibregl.Map({
      container: el.current,
      style: { version: 8, sources: {}, layers: [{ id: 'bg', type: 'background', paint: { 'background-color': '#050403' } }] },
      bounds: [[w + (e - w) * 0.08, s + (n - s) * 0.2], [e - (e - w) * 0.25, n - (n - s) * 0.12]],
      maxBounds: [[ctx[0] - 0.3, ctx[1] - 0.3], [ctx[2] + 0.3, ctx[3] + 0.3]],
      minZoom: 8.5,
      maxZoom: 15.2,
      attributionControl: false,
      renderWorldCopies: false,
      fadeDuration: 0,
      pitchWithRotate: true,
      maxPitch: 78,
      // No preserved drawing buffer (it slows every frame); snapshot() reads right after a draw.
      canvasContextAttributes: { antialias: deviceTier() !== 'low' },
      pixelRatio: Math.min(window.devicePixelRatio || 1, deviceTier() === 'low' ? 1 : 2),
    })
    map.current = m
    if (import.meta.env.DEV) window.__map = m
    m.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'bottom-right')
    m.addControl(new maplibregl.AttributionControl({ compact: true, customAttribution: 'NASA · JPL-Caltech · USGS · ASU · ESA/DLR/FU Berlin' }), 'bottom-left')
    m.dragRotate.enable()
    m.touchZoomRotate.enableRotation()

    m.on('load', () => {
      const img = (id, url, bbox) => m.addSource(id, { type: 'image', url, coordinates: corners(bbox) })
      // placeholders until the worker sends the grid
      const blank = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='
      // Photos for layers that start switched off load the first time they are switched on,
      // so they cost no download or memory until someone asks for them.
      deferred.current = new Map()
      const startOn = Object.fromEntries(layers.map((l) => [l.id, l.on]))
      for (const [id, L] of Object.entries(meta.layers)) {
        if (startOn[id] === false) { deferred.current.set(id, L); img(`src-${id}`, blank, L.bbox) }
        else img(`src-${id}`, L.url, L.bbox)
      }
      img('src-photo', meta.photo.url, meta.photo.bbox)
      img('src-elevation', blank, meta.grid.bbox)
      img('src-slope', blank, meta.grid.bbox)
      img('src-rough', blank, meta.grid.bbox)

      const raster = (id, src, opacity, visible) => m.addLayer({ id, type: 'raster', source: src, paint: { 'raster-opacity': opacity, 'raster-fade-duration': 0, 'raster-resampling': 'linear' }, layout: { visibility: visible ? 'visible' : 'none' } })
      const L = Object.fromEntries(layers.map((l) => [l.id, l]))
      raster('viking', 'src-viking', L.viking.opacity, L.viking.on)
      raster('relief', 'src-relief', L.relief.opacity, L.relief.on)
      raster('photo', 'src-photo', L.photo.opacity, L.photo.on)
      if (m.getSource('src-hirise')) raster('hirise', 'src-hirise', L.hirise.opacity, L.hirise.on)
      raster('elevation', 'src-elevation', L.elevation.opacity, L.elevation.on)
      raster('themis-day', 'src-themis-day', L['themis-day'].opacity, L['themis-day'].on)
      raster('themis-night', 'src-themis-night', L['themis-night'].opacity, L['themis-night'].on)
      raster('slope', 'src-slope', L.slope.opacity, L.slope.on)
      if (L.rough) raster('rough', 'src-rough', L.rough.opacity, L.rough.on)
      // DEM edge: a hairline around the area with a detailed height map
      m.addSource('dem-edge', { type: 'geojson', data: { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [[...corners(meta.grid.bbox), corners(meta.grid.bbox)[0]]] } } })
      m.addLayer({ id: 'dem-edge', type: 'line', source: 'dem-edge', layout: { visibility: 'none' }, paint: { 'line-color': '#ffffff', 'line-opacity': 0.25, 'line-width': 1, 'line-dasharray': [3, 3] } })

      for (const id of ['radius', 'traverse', 'drive', 'route', 'hazard', 'dragline', 'waypoints', 'stops', 'marks', 'hover']) m.addSource(id, { type: 'geojson', data: EMPTY })
      m.addLayer({ id: 'radius-fill', type: 'fill', source: 'radius', paint: { 'fill-color': '#7fb0ff', 'fill-opacity': 0.035 } })
      m.addLayer({ id: 'radius', type: 'line', source: 'radius', paint: { 'line-color': '#7fb0ff', 'line-opacity': 0.7, 'line-width': 1.2, 'line-dasharray': [2, 3] } })
      m.addLayer({ id: 'traverse', type: 'line', source: 'traverse', paint: { 'line-color': '#dfe8ff', 'line-opacity': L.traverse.opacity, 'line-width': ['interpolate', ['linear'], ['zoom'], 10, 0.8, 14, 1.6], 'line-dasharray': [2, 2] }, layout: { 'line-join': 'round', 'line-cap': 'round' } })
      m.addLayer({ id: 'drive', type: 'line', source: 'drive', paint: { 'line-color': '#ffffff', 'line-opacity': 0.75, 'line-width': 2, 'line-dasharray': [0.6, 1.8] }, layout: { 'line-join': 'round', 'line-cap': 'round' } })
      m.addLayer({ id: 'route-glow', type: 'line', source: 'route', paint: { 'line-color': '#d0602f', 'line-opacity': 0.35, 'line-width': 10, 'line-blur': 6 }, layout: { 'line-join': 'round', 'line-cap': 'round' } })
      m.addLayer({ id: 'route', type: 'line', source: 'route', paint: { 'line-color': '#e3895a', 'line-width': 3 }, layout: { 'line-join': 'round', 'line-cap': 'round' } })
      // steep stretches drawn over the route in the verdict colours, so the risk reads at a glance
      m.addLayer({ id: 'hazard', type: 'line', source: 'hazard', paint: { 'line-color': ['match', ['get', 'level'], 'red', '#ff8d7a', '#ffd37a'], 'line-width': ['interpolate', ['linear'], ['zoom'], 10, 3, 15, 5] }, layout: { 'line-join': 'round', 'line-cap': 'round' } })
      m.addLayer({ id: 'stops-ring', type: 'circle', source: 'stops', paint: { 'circle-radius': ['case', ['get', 'visited'], 11, 8], 'circle-color': 'rgba(0,0,0,0)', 'circle-stroke-color': ['case', ['get', 'visited'], '#7fe0a8', '#7fb0ff'], 'circle-stroke-width': 1.5 } })
      m.addLayer({ id: 'stops', type: 'circle', source: 'stops', paint: { 'circle-radius': 4, 'circle-color': ['case', ['get', 'visited'], '#7fe0a8', '#7fb0ff'] } })
      // while a point is dragged: a dashed preview of the new legs, and a wide invisible grab
      // area under every handle so it is easy to catch with a finger
      m.addLayer({ id: 'dragline', type: 'line', source: 'dragline', paint: { 'line-color': '#ffffff', 'line-opacity': 0.8, 'line-width': 2, 'line-dasharray': [1.5, 1.5] }, layout: { 'line-join': 'round', 'line-cap': 'round' } })
      m.addLayer({ id: 'waypoints-hit', type: 'circle', source: 'waypoints', paint: { 'circle-radius': ['case', ['get', 'first'], ['case', ['get', 'rover'], 26, 0], 24], 'circle-color': '#ffffff', 'circle-opacity': ['case', ['get', 'held'], 0.16, 0] } })
      m.addLayer({ id: 'waypoints', type: 'circle', source: 'waypoints', paint: { 'circle-radius': ['case', ['get', 'rover'], 12, ['get', 'first'], 0, ['get', 'held'], 12, 9], 'circle-color': ['case', ['get', 'rover'], 'rgba(0,0,0,0)', '#0b0704'], 'circle-stroke-opacity': ['case', ['get', 'rover'], 0, 1], 'circle-stroke-color': '#e3895a', 'circle-stroke-width': 2 } })
      m.addLayer({ id: 'marks-halo', type: 'circle', source: 'marks', paint: { 'circle-radius': ['match', ['get', 'kind'], 'habitat', 14, 'turn', 13, 'rover', 15, 6], 'circle-color': ['match', ['get', 'kind'], 'habitat', '#f5f7fb', 'turn', '#ff8d7a', 'rover', '#d0602f', '#fff'], 'circle-opacity': 0.14 } })
      m.addLayer({ id: 'marks', type: 'circle', source: 'marks', paint: { 'circle-radius': ['match', ['get', 'kind'], 'habitat', 6, 'turn', 6, 'rover', 7, 4], 'circle-color': ['match', ['get', 'kind'], 'habitat', '#f5f7fb', 'turn', '#ff8d7a', 'max', '#ffd37a', 'rover', '#d0602f', '#fff'], 'circle-stroke-color': ['match', ['get', 'kind'], 'rover', '#fff', '#000'], 'circle-stroke-width': 1.5 } })
      m.addLayer({ id: 'hover', type: 'circle', source: 'hover', paint: { 'circle-radius': 6, 'circle-color': '#00e5ff', 'circle-stroke-color': '#000', 'circle-stroke-width': 2 } })

      // waypoint dragging
      let drag = null
      m.on('mouseenter', 'waypoints-hit', () => { if (drag === null) m.getCanvas().style.cursor = 'grab' })
      m.on('mouseleave', 'waypoints-hit', () => { if (drag !== null) return; m.getCanvas().style.cursor = cb.current.drawing ? 'crosshair' : '' })
      m.on('mouseleave', 'waypoints', () => { m.getCanvas().style.cursor = cb.current.drawing ? 'crosshair' : '' })
      m.on('mouseenter', 'stops', () => { m.getCanvas().style.cursor = 'pointer' })
      m.on('mouseleave', 'stops', () => { m.getCanvas().style.cursor = cb.current.drawing ? 'crosshair' : '' })
      const startDrag = (e) => {
        const f = e.features?.[0]
        if (!f || (f.properties.first && !f.properties.rover)) return
        e.preventDefault()
        drag = f.properties.index
        lastLL = [e.lngLat.lng, e.lngLat.lat]
        m.getCanvas().style.cursor = 'grabbing'
        moveDrag(e)
      }
      let lastLL = null
      const moveDrag = (e) => {
        if (drag === null) return
        lastLL = [e.lngLat.lng, e.lngLat.lat]
        const next = wps.current.map((p, i) => (i === drag ? lastLL : p))
        m.getSource('waypoints').setData(fc(next.map((p, i) => pt(p[0], p[1], { index: i, first: i === 0, rover: i === 0 && cb.current.roverMode, held: i === drag }))))
        // preview only the legs that touch the dragged point
        m.getSource('dragline').setData(line(next.slice(Math.max(0, drag - 1), drag + 2)))
      }
      m.on('mousedown', 'waypoints-hit', startDrag)
      m.on('touchstart', 'waypoints-hit', startDrag)
      m.on('mousemove', moveDrag)
      m.on('touchmove', moveDrag)
      const endDrag = (e) => {
        if (drag === null) return
        const i = drag
        drag = null
        m.getCanvas().style.cursor = ''
        m.getSource('dragline').setData(EMPTY)
        cb.current.onWaypointDrag?.(i, e?.lngLat ? [e.lngLat.lng, e.lngLat.lat] : lastLL)
      }
      m.on('mouseup', endDrag)
      m.on('touchend', endDrag)
      m.on('touchcancel', endDrag)
      // released outside the map: still finish the drag where the point was last seen
      window.addEventListener('mouseup', () => endDrag(null))

      m.on('click', (e) => {
        const stop = m.queryRenderedFeatures(e.point, { layers: ['stops', 'stops-ring'] })[0]
        if (stop && !cb.current.drawing) { cb.current.onStopClick?.(stop.properties.id); return }
        cb.current.onMapClick?.([e.lngLat.lng, e.lngLat.lat], stop?.properties.id)
      })

      ready.current = true
      onReady?.()
    })

    // Mars-scale bar (MapLibre's own would measure Earth)
    const updateScale = () => {
      if (!scale.current) return
      const mpp = marsMetresPerPixel(m.getZoom(), m.getCenter().lat)
      const target = 110 * mpp
      const nice = [50, 100, 200, 250, 500, 1000, 2000, 2500, 5000, 10000, 20000].reduce((a, b) => (Math.abs(b - target) < Math.abs(a - target) ? b : a))
      scale.current.style.width = `${nice / mpp}px`
      scale.current.dataset.label = nice >= 1000 ? `${nice / 1000} km` : `${nice} m`
    }
    m.on('move', updateScale)
    m.on('load', updateScale)
    return () => { ready.current = false; m.remove(); map.current = null }
  }, [meta]) // eslint-disable-line react-hooks/exhaustive-deps

  // 3D terrain from the grid
  useEffect(() => {
    const m = map.current
    if (!grid || !m) return
    const add = () => {
      registerDem('marsdem', grid, meta.grid.bbox)
      if (!m.getSource('dem')) m.addSource('dem', { type: 'raster-dem', tiles: ['marsdem://{z}/{x}/{y}'], tileSize: 256, encoding: 'terrarium', maxzoom: 13 })
    }
    if (ready.current) add()
    else m.once('load', add)
  }, [grid, meta])

  useEffect(() => {
    const m = map.current
    if (!m) return
    m.getCanvas().style.cursor = drawing ? 'crosshair' : ''
    // while drawing, show where the detailed height map ends (points must stay inside)
    if (m.getLayer('dem-edge')) m.setLayoutProperty('dem-edge', 'visibility', drawing ? 'visible' : 'none')
  }, [drawing])

  useImperativeHandle(ref, () => ({
    get map() { return map.current },
    ready: () => ready.current,
    setLayer(id, on, opacity) {
      const m = map.current
      if (!m || !ready.current) return
      const later = on && deferred.current.get(id)
      if (later) {
        deferred.current.delete(id)
        m.getSource(`src-${id}`)?.updateImage({ url: later.url, coordinates: corners(later.bbox) })
      }
      const ids = id === 'stops' ? ['stops', 'stops-ring'] : id === 'radius' ? ['radius', 'radius-fill'] : [id]
      for (const L of ids) {
        if (!m.getLayer(L)) continue
        m.setLayoutProperty(L, 'visibility', on ? 'visible' : 'none')
        const t = m.getLayer(L).type
        const prop = t === 'raster' ? 'raster-opacity' : t === 'line' ? 'line-opacity' : t === 'fill' ? null : 'circle-opacity'
        if (prop && opacity != null && L !== 'radius' && L !== 'stops-ring') m.setPaintProperty(L, prop, opacity)
      }
    },
    setImage(id, url) {
      const src = map.current?.getSource(`src-${id}`)
      src?.updateImage({ url, coordinates: corners(meta.grid.bbox) })
    },
    setDrive(coords) { map.current?.getSource('drive')?.setData(coords?.length > 1 ? line(coords) : EMPTY) },
    setTraverse(coords) { map.current?.getSource('traverse')?.setData(line(coords)) },
    setRoute(coords, waypoints, kind = 'safe') {
      const m = map.current
      if (!m || !ready.current) return
      m.getSource('route').setData(coords?.length > 1 ? line(coords, { kind }) : EMPTY)
      wps.current = waypoints || []
      m.getSource('waypoints').setData(fc((waypoints || []).map((p, i) => pt(p[0], p[1], { index: i, first: i === 0, rover: i === 0 && cb.current.roverMode }))))
    },
    /** Colour the steep parts of the route: profile rows are [d, z, slope, lon, lat, …]. */
    setHazards(profile, greenSlope, redSlope) {
      const src = map.current?.getSource('hazard')
      if (!src) return
      const runs = []
      let cur = null
      for (let k = 1; k < (profile?.length || 0); k++) {
        const a = profile[k - 1], b = profile[k]
        const sl = Math.max(a[2], b[2])
        const level = sl > redSlope ? 'red' : sl > greenSlope ? 'amber' : null
        if (level && cur && cur.level === level) cur.coords.push([b[3], b[4]])
        else {
          cur = level ? { level, coords: [[a[3], a[4]], [b[3], b[4]]] } : null
          if (cur) runs.push(cur)
        }
      }
      src.setData(fc(runs.map((r) => ({ type: 'Feature', properties: { level: r.level }, geometry: { type: 'LineString', coordinates: r.coords } }))))
    },
    setStops(stops, visited = []) {
      map.current?.getSource('stops')?.setData(fc(stops.map((s) => pt(s.lon, s.lat, { id: s.id, name: s.name, visited: visited.includes(s.id) }))))
    },
    setMarkers({ habitat, rover, turnBack, maxSlope }) {
      const f = []
      if (habitat) f.push(pt(habitat[0], habitat[1], { kind: 'habitat' }))
      if (rover) f.push(pt(rover[0], rover[1], { kind: 'rover' }))
      if (turnBack) f.push(pt(turnBack[0], turnBack[1], { kind: 'turn' }))
      if (maxSlope) f.push(pt(maxSlope[0], maxSlope[1], { kind: 'max' }))
      map.current?.getSource('marks')?.setData(fc(f))
    },
    setRadius(lon, lat, m) { map.current?.getSource('radius')?.setData(circle(lon, lat, m)) },
    setHover(p) { map.current?.getSource('hover')?.setData(p ? pt(p[0], p[1]) : EMPTY) },
    project(lon, lat) { return map.current?.project([lon, lat]) },
    fitRoute(coords) {
      const m = map.current
      if (!m || !coords?.length) return
      const b = coords.reduce((bb, c) => bb.extend(c), new maplibregl.LngLatBounds(coords[0], coords[0]))
      m.fitBounds(b, { padding: clearArea(m), duration: prefersReducedMotion() ? 0 : 1400, maxZoom: 13.4 })
    },
    /**
     * Demo street view: a ground-level 3D look from orbital data (photo on the height map, true
     * scale). onTurn(bearing) fires as the view turns. Returns { turn(deg), bearing(), stop() }.
     */
    groundView(lon, lat, onTurn) {
      const m = map.current
      if (!m) return { turn() {}, stop() {} }
      if (m.getSource('dem')) m.setTerrain({ source: 'dem', exaggeration: 1 })
      const rot = () => onTurn?.(m.getBearing())
      m.on('rotate', rot)
      m.easeTo({ center: [lon, lat], zoom: 15.2, pitch: 76, bearing: m.getBearing(), duration: prefersReducedMotion() ? 0 : 1400 })
      rot()
      return {
        turn: (deg) => m.easeTo({ bearing: m.getBearing() + deg, duration: prefersReducedMotion() ? 0 : 500 }),
        bearing: () => m.getBearing(),
        stop: () => { m.off('rotate', rot); m.setTerrain(null); m.easeTo({ pitch: 0, bearing: 0, duration: prefersReducedMotion() ? 0 : 900 }) },
      }
    },
    /** Fly along the walk in 3D. hud(i, d, {lon, lat, bearing}) is called each frame. Returns a stop function. */
    follow(profile, hud, done) {
      const m = map.current
      if (!m || !profile?.length) return () => {}
      if (m.getSource('dem')) m.setTerrain({ source: 'dem', exaggeration: 2 })
      const total = profile[profile.length - 1][0]
      const ms = Math.min(26000, Math.max(9000, total * 3.5))
      const brg = (a, b) => (Math.atan2((b[3] - a[3]) * Math.cos(a[4] * Math.PI / 180), b[4] - a[4]) * 180) / Math.PI
      let raf, t0 = null, bearing = m.getBearing(), stopped = false
      const at = (d) => {
        let i = 0
        while (i < profile.length - 2 && profile[i + 1][0] < d) i++
        const a = profile[i], b = profile[i + 1] || a
        const k = b[0] > a[0] ? (d - a[0]) / (b[0] - a[0]) : 0
        return { i, lon: a[3] + (b[3] - a[3]) * k, lat: a[4] + (b[4] - a[4]) * k }
      }
      const tick = (now) => {
        if (stopped) return
        if (t0 === null) t0 = now
        const k = Math.min(1, (now - t0) / ms)
        const d = k * total
        const p = at(d)
        const ahead = at(Math.min(total, d + 250))
        const want = brg([0, 0, 0, p.lon, p.lat], [0, 0, 0, ahead.lon, ahead.lat])
        let diff = ((want - bearing + 540) % 360) - 180
        bearing += diff * 0.04
        m.jumpTo({ center: [p.lon, p.lat], bearing, pitch: 68, zoom: 14.6 })
        hud(p.i, d, { lon: p.lon, lat: p.lat, bearing })
        if (k < 1) raf = requestAnimationFrame(tick)
        else done?.()
      }
      m.easeTo({ center: [profile[0][3], profile[0][4]], zoom: 14.6, pitch: 68, duration: prefersReducedMotion() ? 0 : 1800 })
      setTimeout(() => { if (!stopped) raf = requestAnimationFrame(tick) }, prefersReducedMotion() ? 0 : 1850)
      return () => {
        stopped = true
        cancelAnimationFrame(raf)
        m.setTerrain(null)
        m.easeTo({ pitch: 0, bearing: 0, duration: 900 })
      }
    },
    /** JPEG of the map framed on the route (route and markers are map layers, so they are included). */
    snapshot(coords) {
      const m = map.current
      return new Promise((resolve) => {
        if (!m) return resolve(null)
        const view = { center: m.getCenter(), zoom: m.getZoom(), bearing: m.getBearing(), pitch: m.getPitch() }
        if (coords?.length) {
          const b = coords.reduce((bb, c) => bb.extend(c), new maplibregl.LngLatBounds(coords[0], coords[0]))
          const pad = 70
          const l = (parseFloat(getComputedStyle(m.getContainer().closest('.planner')).getPropertyValue('--side-w')) || 0) + 30
          const r = (parseFloat(getComputedStyle(m.getContainer().closest('.planner')).getPropertyValue('--right-w')) || 0) + 30
          m.fitBounds(b, { padding: { top: 200, bottom: 200, left: l + pad, right: r + pad }, duration: 0, maxZoom: 13.6, bearing: 0, pitch: 0 })
        }
        let done = false
        const grab = () => {
          if (done) return
          done = true
          const c = m.getCanvas()
          // crop to the part of the map between the side panels
          const dpr = c.width / c.clientWidth
          const l = ((parseFloat(getComputedStyle(m.getContainer().closest('.planner')).getPropertyValue('--side-w')) || 0) + 30) * dpr
          const r = ((parseFloat(getComputedStyle(m.getContainer().closest('.planner')).getPropertyValue('--right-w')) || 0) + 30) * dpr
          const w = c.width - l - r, h = Math.min(c.height, w * 0.75)
          const out = document.createElement('canvas')
          out.width = w; out.height = h
          out.getContext('2d').drawImage(c, l, (c.height - h) / 2, w, h, 0, 0, w, h)
          resolve(out.toDataURL('image/jpeg', 0.88))
          m.jumpTo(view)
        }
        // read the canvas inside a render event, while the frame just drawn is still there
        const grabAfterDraw = () => { m.once('render', grab); m.triggerRepaint() }
        m.once('idle', grabAfterDraw)
        setTimeout(grabAfterDraw, 2500)
      })
    },
  }), [meta])

  return (
    <div className="mars-map">
      <div ref={el} className="mars-map-canvas" />
      <div className="mars-scale" aria-hidden="true"><span ref={scale} /></div>
    </div>
  )
})

export default MarsMap
