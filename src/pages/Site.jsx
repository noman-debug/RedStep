import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router'
import { siteById, sitePlaces, siteMeta, siteTraverse, siteHazards, sitePanoramas, WALK, FACTS } from '../data/index.js'
import { LAYER_GROUPS, layerGroupsFor, iceNoteFor } from '../content/layers.js'
import { instantAtLocalTime, marsTime, sunAt } from '../lib/mars24.js'
import { paintElevation, paintRough, paintSlope } from '../lib/marsmap.js'
import { advise } from '../lib/advisor.js'
import { useNarrow, prefersReducedMotion, store } from '../lib/hooks.js'
import { useEmergency } from '../components/Layout.jsx'
import MarsMap from '../components/planner/MarsMap.jsx'
import Profile from '../components/planner/Profile.jsx'
import Minimap from '../components/planner/Minimap.jsx'
import Visor from '../components/planner/Visor.jsx'
import StreetView from '../components/StreetView.jsx'
import StreetPicker from '../components/StreetPicker.jsx'
import Ambient from '../components/Ambient.jsx'
import { AdvisorPanel, LayerPanel, ManualPanel, SciencePanel, SettingsPanel, SpaceWeatherPanel, StartWindowPanel, VerdictPanel } from '../components/planner/Panels.jsx'
import { useSpaceWeather } from '../lib/spaceWeather.js'
import { Sidebar } from '../components/Sidebar.jsx'
import { MANUAL } from '../content/manual.js'
import { Verdict } from '../components/Atoms.jsx'
import { fmtH, pct } from '../compute/walk.js'
import LiteSite from './LiteSite.jsx'
import NotFound from './NotFound.jsx'
import './site.css'

const DEFAULTS = Object.fromEntries(Object.entries(WALK).map(([k, v]) => [k, v.value]))
const FACT_VALUES = Object.fromEntries(Object.entries(FACTS).map(([k, v]) => [k, v.value]))
const ALL_LAYERS = LAYER_GROUPS.flatMap((g) => g.layers)
const today = () => new Date().toISOString().slice(0, 10)
const APPETITE = [
  { id: 'careful', label: 'Short', value: 0.6, note: 'A short, careful walk: uses at most 60% of the usable suit air' },
  { id: 'balanced', label: 'Medium', value: 0.85, note: 'Uses at most 85% of the usable suit air' },
  { id: 'bold', label: 'Long', value: 1, note: 'Uses all the usable suit air (the safety reserve is always kept)' },
]

// URL state: ?w=lon,lat;lon,lat&snap=1&stops=a,b&d=2026-10-24&t=9
const encodePts = (pts) => pts.map((p) => `${p[0].toFixed(5)},${p[1].toFixed(5)}`).join(';')
const decodePts = (s) => (s ? s.split(';').map((q) => q.split(',').map(Number)).filter((p) => p.length === 2 && p.every(Number.isFinite)) : null)
const MAX_POINTS = 40

// Everything from a link or from saved settings is checked before use, so a hand-edited link
// or an old saved value can't crash the planner or push a limit outside its range.
const clampNum = (v, lo, hi, fallback) => {
  const n = typeof v === 'string' && v.trim() === '' ? NaN : Number(v)
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : fallback
}
const cleanSettings = (s) => {
  const out = { ...DEFAULTS }
  for (const [k, w] of Object.entries(WALK)) out[k] = clampNum(s?.[k], w.min ?? -Infinity, w.max ?? Infinity, w.value)
  // "too steep" must stay above "careful"
  if (out.redSlope <= out.greenSlope) out.redSlope = Math.min(WALK.redSlope.max, out.greenSlope + 1)
  if (out.redSlope <= out.greenSlope) out.greenSlope = out.redSlope - 1
  return out
}
const DATE_MIN = '2026-01-01', DATE_MAX = '2035-12-31'
const cleanDate = (d) => (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d) && Number.isFinite(Date.parse(`${d}T12:00:00Z`)) && d >= DATE_MIN && d <= DATE_MAX ? d : today())
// A walk always starts at the habitat, has at most MAX_POINTS points and stays near the site.
const cleanPoints = (pts, home) => {
  if (!pts?.length) return [home]
  const out = [home]
  for (const p of pts.slice(1)) {
    const last = out[out.length - 1]
    const repeat = Math.abs(p[0] - last[0]) < 1e-4 && Math.abs(p[1] - last[1]) < 1e-4 // within ~6 m
    if (!repeat && Math.abs(p[0] - home[0]) < 1 && Math.abs(p[1] - home[1]) < 1) out.push(p)
  }
  return out.slice(0, MAX_POINTS)
}

export default function Site() {
  const { id } = useParams()
  const site = siteById(id)
  if (!site) return <NotFound />
  if (!site.planner) return <LiteSite site={site} />
  return <Planner site={site} />
}

function Planner({ site }) {
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  const narrow = useNarrow()
  const emergency = useEmergency()
  const mapRef = useRef(null)
  const worker = useRef(null)
  const reqId = useRef(0)
  const places = useMemo(() => sitePlaces(site.id), [site.id])
  const siteGroups = useMemo(() => layerGroupsFor(site.id), [site.id])
  const siteLayers = useMemo(() => siteGroups.flatMap((g) => g.layers), [siteGroups])
  const habitat = useMemo(() => [places.home.lon, places.home.lat], [places])
  const stops = places.stops

  // The height chart folds to a one-line summary so the map gets the room; open by default only
  // on tall screens, and remembered once you choose.
  const [profileOpen, setProfileOpen] = useState(() => store.get('mw:profile-open', typeof window !== 'undefined' && window.innerHeight >= 1000))
  const toggleProfile = () => setProfileOpen((o) => { store.set('mw:profile-open', !o); return !o })
  const [meta, setMeta] = useState(null)
  const [grid, setGrid] = useState(null)
  const [mapReady, setMapReady] = useState(false)
  const [error, setError] = useState(null) // fatal: terrain could not load
  const [loadPct, setLoadPct] = useState(0)
  const [loadStage, setLoadStage] = useState('download')
  const [slowLoad, setSlowLoad] = useState(false)
  const [layers, setLayers] = useState(() => Object.fromEntries(ALL_LAYERS.map((l) => [l.id, { on: l.on, opacity: l.opacity }])))
  const [settings, setRawSettings] = useState(() => cleanSettings({ ...store.get('mw-settings-v2', {}), ...(params.get('t') ? { startHour: params.get('t') } : {}) }))
  const setSettings = useCallback((u) => setRawSettings((s) => cleanSettings(typeof u === 'function' ? u(s) : u)), [])
  const [date, setRawDate] = useState(() => cleanDate(params.get('d')))
  const setDate = useCallback((d) => setRawDate(cleanDate(d)), [])
  // Rover drop-off: a pressurised rover drives the crew out and waits; the walk starts there.
  const [rover, setRover] = useState(() => {
    const p = decodePts(params.get('r'))?.[0]
    return p && Math.abs(p[0] - habitat[0]) < 1 && Math.abs(p[1] - habitat[1]) < 1 ? p : null
  })
  const start = useMemo(() => rover || habitat, [rover, habitat])
  const base = rover ? habitat : null
  const [waypoints, setWaypoints] = useState(() => cleanPoints(decodePts(params.get('w')), rover || habitat))
  const [snap, setSnap] = useState(params.get('snap') === '1')
  const [stopIds, setStopIds] = useState(() => (params.get('stops') || '').split(',').filter((sid) => stops.some((x) => x.id === sid)).slice(0, 30))
  const [drawing, setDrawing] = useState(false)
  const [appetite, setAppetite] = useState('balanced')
  const [result, setResult] = useState(null)
  const [busy, setBusy] = useState(false)
  const [rightTab, setRightTab] = useState('verdict')
  const [leftTab, setLeftTab] = useState('layers')
  const [sbOpen, setSbOpen] = useState(false)
  const [hint, setHint] = useState(false)
  const [sheet, setSheet] = useState('verdict')
  const [sheetOpen, setSheetOpen] = useState(() => typeof window === 'undefined' || window.innerWidth > 820)
  const [focusStop, setFocusStop] = useState(null)
  const [following, setFollowing] = useState(false)
  const [suggestNote, setSuggestNote] = useState(null)
  const [suggestWhy, setSuggestWhy] = useState(null) // how the planner chose the suggested walk
  const rank = useRef(0)
  const hud = useRef(null)
  const minimap = useRef(null)
  const stopFollow = useRef(null)
  const [hazards, setHazards] = useState([])
  const panoramas = useMemo(() => sitePanoramas(site.id), [site.id])
  const [picking, setPicking] = useState(false)
  const [street, setStreet] = useState(null) // { pano } for real photos, { demo: place } for the orbital demo
  const ground = useRef(null)
  useEffect(() => { siteHazards(site.id).then(setHazards).catch(() => setHazards([])) }, [site.id])

  // On phones the zoom buttons, scale and draw hint sit just under the action bar, whose height
  // changes as its buttons wrap, so its bottom edge is kept in --ab-bottom on the planner.
  const abObserver = useRef(null)
  const actionbarRef = useCallback((ab) => {
    abObserver.current?.disconnect()
    if (!ab || typeof ResizeObserver === 'undefined') return
    const root = ab.parentElement
    abObserver.current = new ResizeObserver(() => root.style.setProperty('--ab-bottom', `${Math.round(ab.getBoundingClientRect().bottom - root.getBoundingClientRect().top)}px`))
    abObserver.current.observe(ab)
  }, [])

  useEffect(() => {
    if (!drawing) return
    setHint(true)
    const t = setTimeout(() => setHint(false), 4500)
    return () => clearTimeout(t)
  }, [drawing])

  const startMs = useMemo(() => instantAtLocalTime(Date.parse(`${date}T12:00:00Z`), site.lon, settings.startHour), [date, settings.startHour, site.lon])
  const sol = useMemo(() => marsTime(startMs), [startMs])
  useEffect(() => { store.set('mw-settings-v2', settings) }, [settings])

  useEffect(() => {
    if (grid) return
    const t = setTimeout(() => setSlowLoad(true), 6000)
    return () => clearTimeout(t)
  }, [grid])

  // ---- worker ----
  useEffect(() => {
    const w = new Worker(new URL('../compute/worker.js', import.meta.url), { type: 'module' })
    worker.current = w
    w.onmessage = ({ data }) => {
      if (data.type === 'ready') { setMeta((m) => m || data.meta); setGrid({ w: data.w, h: data.h, slope: data.slope, elev: data.elev, rough: data.rough, dx: data.dx, dy: data.dy }) }
      else if (data.type === 'progress') { setLoadPct(data.pct); if (data.stage) setLoadStage(data.stage) }
      else if (data.type === 'error') {
        setBusy(false)
        if (data.init) setError(`Couldn\u2019t load the terrain: ${data.message}.`)
        else setSuggestNote(`Something went wrong while planning (${data.message}). Try again.`)
      }
      else if (data.id === reqId.current) handleResult(data)
    }
    w.onerror = (e) => setError(`Couldn\u2019t start the route calculator${e.message ? `: ${e.message}` : ''}.`)
    w.postMessage({ type: 'init', site: site.id })
    siteMeta(site.id).then((d) => setMeta((m) => m || d)).catch(() => setError('Couldn\u2019t load the map data. Check your connection and try again.'))
    return () => w.terminate()
  }, [site.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleResult = useCallback((data) => {
    setBusy(false)
    if (data.type === 'suggest') {
      if (!data.line) { setSuggestNote('No stop fits the air and daylight with these settings. Try "Long", an earlier start, or a smaller reserve in Settings.'); return }
      setSuggestNote(null)
      setSuggestWhy(data)
      setStopIds(data.chosen)
      setSnap(true)
      setWaypoints(data.waypoints)
      setResult({ line: data.line, analysis: data.analysis, driveLine: data.driveLine })
      animateRoute(data.line, data.waypoints)
      mapRef.current?.fitRoute(data.line)
    } else if (data.type === 'risky') {
      setSnap(false)
      setStopIds(data.stopId ? [data.stopId] : [])
      setWaypoints(data.line)
      setResult({ line: data.line, analysis: data.analysis })
      setSuggestNote(data.why === 'steep'
        ? 'Risky walk: a straight line that the planner did not route. It crosses ground steeper than your limit, so the answer is NO-GO. Press “Fix it” to see the safe way.'
        : 'Risky walk: a straight line to the farthest stop. It needs more suit air than you may use, so the answer is NO-GO.')
      animateRoute(data.line, data.line)
      mapRef.current?.fitRoute(data.line)
    } else {
      setResult({ line: data.line, analysis: data.analysis, driveLine: data.driveLine })
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const waypointsRef = useRef(waypoints)
  waypointsRef.current = waypoints
  const skipPlan = useRef(false)

  // Draw the route on progressively (rAF + direct source writes, no re-renders).
  const animateRoute = useCallback((line, wps) => {
    const m = mapRef.current
    if (!m) return
    if (prefersReducedMotion()) { m.setRoute(line, wps); return }
    skipPlan.current = true
    animating.current = true
    const t0 = performance.now(), ms = 2000
    const step = (t) => {
      const k = Math.min(1, (t - t0) / ms)
      const e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2 // ease in-out: slow start, slow finish
      const n = Math.max(2, Math.ceil(line.length * e))
      m.setRoute(line.slice(0, n), k === 1 ? wps : wps.slice(0, 1))
      if (k < 1) requestAnimationFrame(step)
      else animating.current = false
    }
    requestAnimationFrame(step)
  }, [])
  const animating = useRef(false)

  // Keep the drawn route in step with the latest result (after the map is ready).
  useEffect(() => {
    if (!mapReady || animating.current) return
    mapRef.current?.setRoute(result?.line || null, waypoints)
    mapRef.current?.setHazards(result?.profile || null, settings.greenSlope, settings.redSlope)
  }, [mapReady, result, waypoints, settings.greenSlope, settings.redSlope])

  // ---- plan whenever inputs change ----
  const planStops = useMemo(() => stops.filter((s) => stopIds.includes(s.id)), [stops, stopIds])
  useEffect(() => {
    if (!grid) return
    if (skipPlan.current) { skipPlan.current = false; return }
    if (waypoints.length < 2) { setResult(null); mapRef.current?.setRoute(null, waypoints); return }
    const id = ++reqId.current
    setBusy(true)
    worker.current.postMessage({
      type: 'plan', id, waypoints, snap: waypoints.slice(1).map(() => snap), stops: planStops,
      settings, startMs, site, habitat: start, base, facts: FACT_VALUES,
    })
  }, [grid, waypoints, snap, planStops, settings, startMs, site, start, base])

  // ---- URL ----
  useEffect(() => {
    const p = new URLSearchParams()
    if (waypoints.length > 1) p.set('w', encodePts(waypoints))
    if (snap) p.set('snap', '1')
    if (stopIds.length) p.set('stops', stopIds.join(','))
    if (rover) p.set('r', encodePts([rover]))
    if (date !== today()) p.set('d', date)
    if (settings.startHour !== DEFAULTS.startHour) p.set('t', String(settings.startHour))
    setParams(p, { replace: true })
  }, [waypoints, snap, stopIds, date, settings.startHour, rover, setParams])

  // ---- paint derived layers once the grid arrives / thresholds change ----
  useEffect(() => {
    if (!grid || !meta || !mapReady) return
    let gone = false, url
    paintElevation(grid, meta.grid.min, meta.grid.max).then((u) => { if (gone) return URL.revokeObjectURL(u); url = u; mapRef.current?.setImage('elevation', u) })
    return () => { gone = true; if (url) setTimeout(() => URL.revokeObjectURL(url), 2000) }
  }, [grid, meta, mapReady])
  useEffect(() => {
    if (!grid || !mapReady) return
    let gone = false, url
    paintSlope(grid, settings.greenSlope, settings.redSlope).then((u) => { if (gone) return URL.revokeObjectURL(u); url = u; mapRef.current?.setImage('slope', u) })
    return () => { gone = true; if (url) setTimeout(() => URL.revokeObjectURL(url), 2000) }
  }, [grid, mapReady, settings.greenSlope, settings.redSlope])
  useEffect(() => {
    if (!grid?.rough || !mapReady) return
    let gone = false, url
    paintRough(grid).then((u) => { if (gone) return URL.revokeObjectURL(u); url = u; mapRef.current?.setImage('rough', u) })
    return () => { gone = true; if (url) setTimeout(() => URL.revokeObjectURL(url), 2000) }
  }, [grid, mapReady])

  // static overlays
  useEffect(() => {
    if (!mapReady) return
    siteTraverse(site.id).then((t) => t && mapRef.current?.setTraverse(t.line)).catch(() => {})
  }, [mapReady, site.id])
  const visited = result?.analysis?.visited.map((v) => v.id) || []
  const visitedStops = stops.filter((st) => visited.includes(st.id))
  useEffect(() => { if (mapReady) mapRef.current.setStops(stops, visited) }, [mapReady, stops, visited.join(',')]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (mapReady) mapRef.current.setRadius(start[0], start[1], settings.walkBack * 1000) }, [mapReady, start, settings.walkBack])
  useEffect(() => { if (mapReady) mapRef.current.setDrive(rover ? result?.driveLine || [habitat, rover] : null) }, [mapReady, rover, habitat, result])
  useEffect(() => {
    if (!mapReady) return
    const a = result?.analysis
    mapRef.current.setMarkers({ habitat, rover, turnBack: a ? [a.turnBack.lon, a.turnBack.lat] : null, maxSlope: a && a.maxSlope > settings.greenSlope ? a.maxSlopeAt : null })
  }, [mapReady, result, habitat, rover, settings.greenSlope])
  useEffect(() => {
    if (!mapReady) return
    for (const [lid, st] of Object.entries(layers)) mapRef.current.setLayer(lid, st.on, st.opacity)
  }, [mapReady, layers])

  // ---- actions ----
  const suggest = useCallback((which = appetite, next = false) => {
    if (!grid) return
    rank.current = next ? rank.current + 1 : 0 // 'another walk' steps to the next-best option
    setDrawing(false)
    const id = ++reqId.current
    setBusy(true)
    worker.current.postMessage({ type: 'suggest', id, habitat: start, base, stops, settings, startMs, site, facts: FACT_VALUES, appetite: APPETITE.find((a) => a.id === which).value, rank: rank.current })
  }, [grid, appetite, start, base, stops, settings, startMs, site])

  const tryRisky = useCallback(() => {
    if (!grid) return
    setDrawing(false)
    const id = ++reqId.current
    setBusy(true)
    worker.current.postMessage({ type: 'risky', id, habitat: start, stops, settings, startMs, site, facts: FACT_VALUES })
  }, [grid, start, stops, settings, startMs, site])

  // Rover on: park it at the middle of the science stops (drag it anywhere), then suggest a walk
  // from there. Rover off: back to walking from the habitat.
  const roverChanged = useRef(false)
  const toggleRover = useCallback(() => {
    let next = null
    if (!rover) {
      const pool = stops.length ? stops : [{ lon: habitat[0], lat: habitat[1] }]
      next = [pool.reduce((t, p) => t + p.lon, 0) / pool.length, pool.reduce((t, p) => t + p.lat, 0) / pool.length]
    }
    roverChanged.current = true
    setRover(next)
    setWaypoints([next || habitat]); setStopIds([]); setResult(null); setSuggestNote(next ? 'Rover drop-off: drag the rover marker to where it should park.' : null)
  }, [rover, stops, habitat])
  useEffect(() => {
    if (!roverChanged.current || !grid) return
    roverChanged.current = false
    suggest()
  }, [start, grid, suggest])

  // First visit without a walk in the URL: show the Medium suggestion straight away,
  // so the answer card is visible without pressing anything.
  const autoRan = useRef(!!params.get('w'))
  useEffect(() => {
    if (!grid || autoRan.current) return
    autoRan.current = true
    suggest('balanced')
  }, [grid, suggest])

  const onMapClick = useCallback((p, stopId) => {
    if (!drawing) return
    const s = stopId && stops.find((x) => x.id === stopId)
    const q = s ? [s.lon, s.lat] : p
    // Only inside the detailed height map: outside it the planner cannot judge the ground.
    const [bw, bs, be, bn] = meta?.grid.bbox || [-Infinity, -Infinity, Infinity, Infinity]
    if (!(q[0] > bw && q[0] < be && q[1] > bs && q[1] < bn)) { setSuggestNote('No height data there, so the planner cannot judge that ground. Stay inside the dashed edge.'); return }
    if (waypoints.length >= MAX_POINTS) { setSuggestNote(`That is the most points one walk can have (${MAX_POINTS}).`); return }
    setSuggestNote(null)
    setWaypoints((w) => [...w, q])
    if (s) setStopIds((ids) => (ids.includes(s.id) ? ids : [...ids, s.id]))
  }, [drawing, stops, meta, waypoints.length])

  const onWaypointDrag = useCallback((i, p) => {
    if (i === 0) setRover((r) => (r ? p : r))
    setWaypoints((w) => w.map((q, k) => (k === i ? p : q)))
  }, [])

  const toggleStop = useCallback((sid, on) => {
    const s = stops.find((x) => x.id === sid)
    if (!s) return
    if (on) {
      setStopIds((ids) => [...ids, sid])
      setWaypoints((w) => [...w, [s.lon, s.lat]])
    } else {
      setStopIds((ids) => ids.filter((x) => x !== sid))
      setWaypoints((w) => w.filter((q, k) => k === 0 || Math.hypot(q[0] - s.lon, q[1] - s.lat) > 1e-5))
    }
  }, [stops])

  const clear = () => { setWaypoints([start]); setStopIds([]); setResult(null); setSuggestNote(null); mapRef.current?.setRoute(null, [start]) }
  const undo = () => setWaypoints((w) => (w.length > 1 ? w.slice(0, -1) : w))

  const onFix = (what) => {
    setSuggestNote(null)
    if (what === 'snap') setSnap(true)
    if (what === 'early') setSettings((s) => ({ ...s, startHour: 8 }))
    if (what === 'trim' && result) {
      const a = result.analysis
      const tb = [a.turnBack.lon, a.turnBack.lat]
      // keep waypoints before the turn-back distance, then end at the turn-back point
      const keep = [waypoints[0]]
      let d = 0
      for (let k = 1; k < waypoints.length; k++) {
        const q = a.profile.reduce((best, p) => (Math.hypot(p[3] - waypoints[k][0], p[4] - waypoints[k][1]) < Math.hypot(best[3] - waypoints[k][0], best[4] - waypoints[k][1]) ? p : best))
        d = q[0]
        if (d < a.turnBack.d) keep.push(waypoints[k])
      }
      keep.push(tb)
      setWaypoints(keep)
      setStopIds((ids) => ids.filter((sid) => keep.some((q) => { const s = stops.find((x) => x.id === sid); return s && Math.hypot(q[0] - s.lon, q[1] - s.lat) < 1e-5 })))
    }
  }

  const follow = () => {
    if (!result?.analysis || following) return
    setFollowing(true)
    setSheetOpen(false)
    mapRef.current.setLayer('slope', layers.slope.on, Math.min(layers.slope.opacity, 0.22))
    const an = result.analysis
    const prof = an.profile
    const walkStart = startMs + (an.drive?.hours || 0) * 3.6e6
    const ahead = [...an.visited].sort((x, y) => x.d - y.d).map((v) => ({ ...v, name: stops.find((st) => st.id === v.id)?.name || 'Science stop' }))
    const R = 3396190, D = Math.PI / 180
    const fromStart = (lon, lat) => {
      const dLat = (lat - start[1]) * D, dLon = (lon - start[0]) * D
      const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat * D) * Math.cos(start[1] * D) * Math.sin(dLon / 2) ** 2
      return 2 * R * Math.asin(Math.sqrt(h))
    }
    stopFollow.current = mapRef.current.follow(prof, (i, d, pos) => {
      minimap.current?.setPlayer(pos.lon, pos.lat, pos.bearing)
      const p = prof[i]
      const sun = sunAt(walkStart + p[5] * 3.6e6, site.lat, site.lon)
      const next = ahead.find((v) => v.d > d - 15)
      hud.current?.update({
        heading: pos.bearing, d, air: p[6], slope: p[2], sun: sun.elevation, ltst: sun.ltst,
        next: next ? { name: next.name, m: Math.max(0, next.d - d) } : null,
        turn: an.turnBack.atEnd ? null : { m: an.turnBack.d - d },
        home: fromStart(pos.lon, pos.lat),
      })
    }, () => setTimeout(endFollow, 1200))
  }
  const endFollow = () => { stopFollow.current?.(); stopFollow.current = null; setFollowing(false); mapRef.current?.setLayer('slope', layers.slope.on, layers.slope.opacity); if (result) mapRef.current?.fitRoute(result.line) }
  useEffect(() => () => stopFollow.current?.(), [])

  // ---- street view ----
  const openStreet = (pick) => {
    setPicking(false)
    setSheetOpen(false)
    if (pick.pano) return setStreet({ pano: pick.pano })
    setStreet({ demo: pick.place })
    ground.current = mapRef.current?.groundView(pick.place.lon, pick.place.lat, (b) => minimap.current?.setPlayer(pick.place.lon, pick.place.lat, b))
  }
  const closeStreet = useCallback(() => {
    ground.current?.stop(); ground.current = null
    setStreet(null)
    if (result) mapRef.current?.fitRoute(result.line)
  }, [result])
  useEffect(() => {
    if (!street) return
    const t = setTimeout(() => {
      if (street.pano) minimap.current?.setPlayer(street.pano.lon, street.pano.lat, null)
      else minimap.current?.setPlayer(street.demo.lon, street.demo.lat, ground.current?.bearing() ?? 0)
    }, 0)
    return () => clearTimeout(t)
  }, [street])
  useEffect(() => {
    if (!street?.demo) return
    const key = (e) => { if (e.key === 'Escape') closeStreet() }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [street, closeStreet])
  useEffect(() => () => ground.current?.stop(), [])

  const exportBrief = async () => {
    if (!result) return
    const snapshot = await mapRef.current?.snapshot(result.line)
    const payload = { site: site.id, result, waypoints, settings, date, startMs, stopIds: visited, snapshot, url: location.href, made: Date.now() }
    try { sessionStorage.setItem('mw-brief', JSON.stringify(payload)) } catch { /* too big: brief falls back to no map image */ try { sessionStorage.setItem('mw-brief', JSON.stringify({ ...payload, snapshot: null })) } catch { /* ignore */ } }
    navigate('/brief')
  }

  const score = useMemo(() => {
    const total = stops.reduce((s, p) => s + p.value, 0)
    const got = stops.filter((p) => visited.includes(p.id)).reduce((s, p) => s + p.value, 0)
    return { total, got }
  }, [stops, visited])
  const weather = useSpaceWeather()
  const tips = useMemo(() => advise(result?.analysis, { settings, stops, startMs, site, visitedIds: visited, snap, weather }), [result, settings, stops, startMs, site, visited, snap, weather])

  const onAdvisor = (what, sid) => { if (what === 'snap') setSnap(true); if (what === 'add') toggleStop(sid, true) }
  const onHover = useCallback((p) => mapRef.current?.setHover(p ? [p[3], p[4]] : null), [])

  if (error) {
    return (
      <div className="site-error">
        <p className="micro">Map data</p>
        <h1>{error}</h1>
        <div className="site-error-actions">
          <button type="button" className="btn btn-primary" onClick={() => location.reload()}>Try again</button>
          <Link to="/map" className="btn">Back to the Mars map</Link>
        </div>
      </div>
    )
  }

  const a = result?.analysis
  const verdict = (
    <>
      <VerdictPanel analysis={a} settings={settings} snap={snap} busy={busy} onFix={onFix} onEmergency={(f) => emergency.open(f)} visitedCount={visited.length} />
      <StartWindowPanel analysis={a} settings={settings} site={site} dateMs={Date.parse(`${date}T12:00:00Z`)} onApply={(h) => setSettings((x) => ({ ...x, startHour: h }))} />
      <SpaceWeatherPanel weather={weather} />
    </>
  )
  const science = <SciencePanel stops={stops} visited={visited} onAdd={toggleStop} onFocus={(sid) => setFocusStop((f) => (f === sid ? null : sid))} focus={focusStop} score={score} />
  const advisor = <AdvisorPanel tips={tips} onAction={onAdvisor} />
  const layerPanel = <LayerPanel groups={siteGroups} iceNote={iceNoteFor(site.id)} state={layers} onToggle={(lid, on) => setLayers((L) => ({ ...L, [lid]: { ...L[lid], on } }))} onOpacity={(lid, o) => setLayers((L) => ({ ...L, [lid]: { ...L[lid], opacity: o } }))} />
  const settingsPanel = <SettingsPanel settings={settings} onChange={setSettings} date={date} onDate={setDate} sol={sol} snap={snap} onSnap={setSnap} />

  return (
    <div className={`planner ${following ? 'following' : ''} ${street?.demo ? 'demo' : ''} ${drawing ? 'drawing' : ''} ${sbOpen || narrow ? '' : 'sb-closed'}`}>
      {meta && <MarsMap ref={mapRef} roverMode={!!rover} meta={meta} grid={grid} layers={siteLayers} drawing={drawing} onReady={() => setMapReady(true)} onMapClick={onMapClick} onWaypointDrag={onWaypointDrag} onStopClick={(sid) => { setFocusStop(sid); narrow ? (setSheet('science'), setSheetOpen(true)) : setRightTab('science') }} />}
      {!grid && (
        <div className="planner-loading" role="status" aria-live="polite">
          <Ambient className="ambient-fill" />
          <span><i className="spinner" aria-hidden="true" />{loadStage === 'slopes' ? 'Working out slopes…' : `Loading terrain… ${loadPct}%`}{slowLoad && <small>Slow connection: the {site.name} height map is about {site.demSize}.</small>}</span>
        </div>
      )}

      {/* action bar */}
      <div ref={actionbarRef} className="actionbar glass" role="toolbar" aria-label="Walk tools">
        <button type="button" className="btn btn-primary ab-main" onClick={() => suggest(appetite, !!a)} disabled={!grid || busy} aria-busy={!grid || busy}>
          {(!grid || busy) && <i className="spinner spinner-dark" aria-hidden="true" />}
          {!grid ? 'Loading terrain…' : busy ? 'Finding a safe path…' : a ? 'Suggest another walk' : 'Suggest a safe walk'}
        </button>
        {/* the rest of the tools: inline on wide screens, their own swipeable row on phones */}
        <div className="ab-more">
        <div className="ab-appetite" role="radiogroup" aria-label="Walk length">
          {APPETITE.map((x) => (
            <button key={x.id} type="button" role="radio" aria-checked={appetite === x.id} title={x.note} onClick={() => { setAppetite(x.id); if (result) suggest(x.id) }}>{x.label}</button>
          ))}
        </div>
        <button type="button" className={`btn btn-small ${drawing ? 'on' : ''}`} aria-pressed={drawing} disabled={!grid} onClick={() => setDrawing((d) => !d)}>{drawing ? 'Done drawing' : 'Draw my own'}</button>
        {(drawing || waypoints.length > 1) && (
          <>
            <button type="button" className="btn btn-small ab-icon" onClick={undo} disabled={waypoints.length < 2} aria-label="Undo last point" title="Undo last point"><svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true"><path d="M7.5 5 3.5 9l4 4M4 9h7.5a4.5 4.5 0 0 1 0 9H9" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg></button>
            <button type="button" className="btn btn-small ab-icon" onClick={clear} disabled={waypoints.length < 2} aria-label="Start over" title="Start over"><svg viewBox="0 0 20 20" width="14" height="14" aria-hidden="true"><path d="M5 5l10 10M15 5 5 15" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg></button>
          </>
        )}
        <span className="ab-spacer" aria-hidden="true" />
        <MoreMenu
          items={[
            { label: rover ? 'Walk from the habitat' : 'Rover drop-off', hint: rover ? 'Turn the rover off and start on foot' : 'A rover drives you out; walk from where it parks', onClick: toggleRover, disabled: !grid || busy },
            { label: 'Street view', hint: 'Look around from where the rovers stood', onClick: () => setPicking(true), disabled: !mapReady },
            { label: 'Helmet view', hint: 'Walk the route in 3D with the suit display', onClick: follow, disabled: !a },
            { label: 'Try a risky walk', hint: 'See a NO-GO and the reasons for it', onClick: tryRisky, disabled: !grid || busy },
            { label: 'Download the route', hint: 'GeoJSON with heights, for GIS tools', onClick: () => downloadRoute(site, a, visitedStops), disabled: !a },
            { label: 'Download the walk profile', hint: 'CSV: distance, height, slope, time, air', onClick: () => downloadProfile(site, a), disabled: !a },
          ]}
        />
        {a && <button type="button" className="btn btn-small ab-brief" onClick={exportBrief}>Save the plan <span className="arrow">→</span></button>}
        </div>
      </div>
      {drawing && hint && <p className="draw-hint" role="status">Tap the map to add stops on your walk</p>}
      {suggestNote && <p className="draw-hint draw-warn">{suggestNote}</p>}
      {!suggestNote && suggestWhy?.checked > 0 && a && !drawing && (
        <p className="draw-hint suggest-why" role="status">
          <b>Option {suggestWhy.option} of {suggestWhy.of}</b> · {suggestWhy.checked} stop combinations analysed, {suggestWhy.fits} fit your air and daylight · science {suggestWhy.science}/{suggestWhy.scienceMax}
        </p>
      )}

      {!narrow ? (
        <>
          <Sidebar
            open={sbOpen}
            onToggle={() => setSbOpen((o) => !o)}
            title={site.name}
            label="Map layers, settings and manual"
            className="planner-sb"
            header={(
              <div className="seg-ctl" role="tablist" aria-label="Sidebar">
                {[['layers', 'Map layers'], ['settings', 'Settings'], ['manual', 'Help']].map(([k, l]) => (
                  <button key={k} role="tab" aria-selected={leftTab === k} onClick={() => setLeftTab(k)}>{l}</button>
                ))}
              </div>
            )}
          >
            {leftTab === 'layers' ? layerPanel : leftTab === 'settings' ? settingsPanel : <ManualPanel items={MANUAL.planner} />}
          </Sidebar>
          <aside className="side side-right glass" aria-label="Walk verdict, science and advice">
            <div className="tabs" role="tablist">
              <button role="tab" aria-selected={rightTab === 'verdict'} onClick={() => setRightTab('verdict')}>Answer</button>
              <button role="tab" aria-selected={rightTab === 'science'} onClick={() => setRightTab('science')}>Science <span className="tab-count">{visited.length}</span></button>
              <button role="tab" aria-selected={rightTab === 'advisor'} onClick={() => setRightTab('advisor')}>Tips</button>
            </div>
            <div className="side-body">{rightTab === 'verdict' ? verdict : rightTab === 'science' ? science : advisor}</div>
          </aside>
          {a && (
            <div className={`profile-dock glass ${profileOpen ? 'open' : ''}`}>
              <button type="button" className="pf-toggle" aria-expanded={profileOpen} onClick={toggleProfile}>
                <span className="pf-title">Up and down along the walk</span>
                {!profileOpen && <span className="pf-sum">↑ {Math.round(a.gain)} m · ↓ {Math.round(a.loss)} m · steepest {a.maxSlope.toFixed(0)}°</span>}
                <span className="pf-chev" aria-hidden="true">{profileOpen ? '▾' : '▸'}</span>
                <span className="sr-only">{profileOpen ? 'Hide the height chart' : 'Show the height chart'}</span>
              </button>
              {profileOpen && <Profile analysis={a} stops={stops} onHover={onHover} limits={settings} />}
            </div>
          )}
        </>
      ) : (
        <div className={`sheet ${sheetOpen ? 'open' : ''}`}>
          <button type="button" className="sheet-grip" aria-expanded={sheetOpen} onClick={() => setSheetOpen((o) => !o)}>
            <span aria-hidden="true" />
            {a ? <><Verdict status={a.status} /> <span className="micro">{(a.tripDistance / 1000).toFixed(1)} km · {fmtH(a.hours)}</span></> : <span className="sheet-label">Your walk</span>}
          </button>
          <div className="tabs" role="tablist">
            {[['verdict', 'Answer'], ['science', 'Science'], ['profile', 'Hills'], ['advisor', 'Tips'], ['more', 'More']].map(([k, l]) => (
              <button key={k} role="tab" aria-selected={sheet === k} onClick={() => { setSheet(k); setSheetOpen(true) }}>{l}</button>
            ))}
          </div>
          <div className="sheet-body">
            {sheet === 'verdict' && verdict}
            {sheet === 'science' && science}
            {sheet === 'profile' && <Profile analysis={a} stops={stops} onHover={onHover} limits={settings} />}
            {sheet === 'advisor' && advisor}
            {sheet === 'more' && (
              <>
                <div className="seg-ctl sheet-seg" role="tablist" aria-label="More">
                  {[['layers', 'Map layers'], ['settings', 'Settings'], ['manual', 'Help']].map(([k, l]) => (
                    <button key={k} role="tab" aria-selected={leftTab === k} onClick={() => setLeftTab(k)}>{l}</button>
                  ))}
                </div>
                {leftTab === 'layers' ? layerPanel : leftTab === 'settings' ? settingsPanel : <ManualPanel items={MANUAL.planner} />}
              </>
            )}
          </div>
        </div>
      )}

      {picking && <StreetPicker panoramas={panoramas} stops={stops} visited={visited} home={places.home} canDemo={!!grid} onPick={openStreet} onClose={() => setPicking(false)} />}
      {street?.pano && (
        <StreetView pano={street.pano} onClose={closeStreet}>
          <Minimap site={site} ref={minimap} className="mm-sv" title="Location" heading={false} profile={a?.profile} analysis={a} stops={stops} visited={visited} home={habitat} hazards={hazards} limits={{ green: settings.greenSlope, red: settings.redSlope }} />
        </StreetView>
      )}
      {street?.demo && (
        <>
          <div className="sv-demo" role="region" aria-label="Demo street view">
            <p className="sv-demo-tag">DEMO · NOT ROVER PHOTOS</p>
            <p><b>{street.demo.name}</b>: no rover panorama here, so this is a 3D view built from orbit (orbital photos from MRO, HiRISE where it covers, on the {site.dem.replace('MRO ', '')} at true scale). The 3D shape comes from a 40 m height map, so boulders and small ledges are flat here.</p>
            <div className="sv-demo-row">
              <button type="button" className="btn btn-small" onClick={() => ground.current?.turn(-45)} aria-label="Turn left">←</button>
              <button type="button" className="btn btn-small" onClick={() => ground.current?.turn(45)} aria-label="Turn right">→</button>
              <button type="button" className="btn btn-small" onClick={closeStreet}>Close demo view</button>
            </div>
          </div>
          <Minimap site={site} ref={minimap} title="Location" profile={a?.profile} analysis={a} stops={stops} visited={visited} home={habitat} hazards={hazards} limits={{ green: settings.greenSlope, red: settings.redSlope }} />
        </>
      )}
      {following && a && (
        <Minimap ref={minimap} profile={a.profile} analysis={a} stops={stops} visited={visited} home={habitat} hazards={hazards} limits={{ green: settings.greenSlope, red: settings.redSlope }} />
      )}
      {following && a && (
        <Visor ref={hud} title="Helmet display during the walk" onExit={endFollow}>
          <p className="micro vz-note">Helmet display · heights ×2 for clarity · 3D terrain from the {site.dem}</p>
        </Visor>
      )}
    </div>
  )
}

/* ---------------------------------------------------------------------------------------- */

/** The toolbar's overflow menu. It opens below its button, outside the bar (which may scroll
 *  sideways on phones), and works from the keyboard: arrows move, Escape closes. */
function MoreMenu({ items }) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState(null)
  const btn = useRef(null)
  const menu = useRef(null)
  useEffect(() => {
    if (!open) return undefined
    const r = btn.current.getBoundingClientRect()
    setPos({ top: r.bottom + 8, right: Math.max(8, window.innerWidth - r.right) })
    const off = (e) => { if (!menu.current?.contains(e.target) && !btn.current?.contains(e.target)) setOpen(false) }
    const key = (e) => {
      if (e.key === 'Escape') { setOpen(false); btn.current?.focus(); return }
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
      const list = [...(menu.current?.querySelectorAll('button:not(:disabled)') || [])]
      if (!list.length) return
      e.preventDefault()
      const i = list.indexOf(document.activeElement)
      list[(i + (e.key === 'ArrowDown' ? 1 : -1) + list.length) % list.length].focus()
    }
    const close = () => setOpen(false)
    document.addEventListener('pointerdown', off)
    document.addEventListener('keydown', key)
    window.addEventListener('resize', close)
    const id = requestAnimationFrame(() => menu.current?.querySelector('button:not(:disabled)')?.focus())
    return () => {
      document.removeEventListener('pointerdown', off)
      document.removeEventListener('keydown', key)
      window.removeEventListener('resize', close)
      cancelAnimationFrame(id)
    }
  }, [open])
  return (
    <>
      <button ref={btn} type="button" className="btn btn-small ab-moreb" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        More <span aria-hidden="true">⋯</span>
      </button>
      {open && pos && createPortal(
        <div ref={menu} className="ab-menu" role="menu" aria-label="More walk tools" style={{ top: pos.top, right: pos.right }}>
          {items.map((it) => (
            <button key={it.label} type="button" role="menuitem" disabled={it.disabled} onClick={() => { setOpen(false); it.onClick() }}>
              <span>{it.label}</span>
              {it.hint && <small>{it.hint}</small>}
            </button>
          ))}
        </div>,
        document.body,
      )}
    </>
  )
}

/** Save a file the browser builds, without a server. */
function saveFile(name, type, text) {
  const url = URL.createObjectURL(new Blob([text], { type }))
  const link = document.createElement('a')
  link.href = url
  link.download = name
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** The walk as GeoJSON: the path with heights, and the science stops it visits. */
function downloadRoute(site, a, stops) {
  if (!a) return
  const line = a.profile.map((p) => [+p[3].toFixed(6), +p[4].toFixed(6), +p[1].toFixed(1)])
  const geo = {
    type: 'FeatureCollection',
    properties: { body: 'Mars', site: site.name, coordinates: 'longitude east, latitude (degrees), height (m)', made: new Date().toISOString(), by: 'Redstep' },
    features: [
      { type: 'Feature', geometry: { type: 'LineString', coordinates: line }, properties: { name: `${site.name} walk`, verdict: a.status.toUpperCase(), distance_m: Math.round(a.distance), hours: +a.hours.toFixed(2) } },
      ...stops.map((st) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [st.lon, st.lat] }, properties: { name: st.name, kind: 'science stop' } })),
    ],
  }
  saveFile(`redstep-${site.id}-walk.geojson`, 'application/geo+json', JSON.stringify(geo, null, 2))
}

/** The walk profile as CSV, one row per sample along the path. */
function downloadProfile(site, a) {
  if (!a) return
  const head = 'distance_m,height_m,slope_deg,longitude_e,latitude,hours_out,suit_air_used_share'
  const rows = a.profile.map((p) => [p[0].toFixed(0), p[1].toFixed(1), p[2].toFixed(1), p[3].toFixed(6), p[4].toFixed(6), p[5].toFixed(3), p[6].toFixed(3)].join(','))
  saveFile(`redstep-${site.id}-profile.csv`, 'text/csv', [head, ...rows].join('\n') + '\n')
}
