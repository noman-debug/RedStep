// A small north-up map for the immersive views (Fly along, Street view): you, the route coloured
// by steepness, home, the turn-back point, science stops and hazards, with a legend. It is a plain
// canvas (no second map engine), collapses to a button, and opens as a larger pop-up.
// The parent moves "you" through the ref: setPlayer(lon, lat, bearing) — no re-render per frame.
import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import { store } from '../../lib/hooks.js'
import './minimap.css'

const R = 3396190
const D = Math.PI / 180
const COL = { you: '#ffffff', easy: '#e3895a', careful: '#ffd37a', steep: '#ff8d7a', home: '#f5f5f7', stop: '#a1a1a6', visited: '#7fe0a8', grid: 'rgba(255, 255, 255, 0.05)', text: 'rgba(245, 245, 247, 0.78)' }
const nice = (m) => [50, 100, 200, 250, 500, 1000, 2000, 5000].find((s) => s >= m) || 5000

// ---- shapes, shared by the canvas and the legend ----
function shape(ctx, kind, x, y, s = 1) {
  ctx.save()
  ctx.translate(x, y)
  ctx.scale(s, s)
  ctx.lineWidth = 1.5
  ctx.strokeStyle = '#000'
  if (kind === 'home') { ctx.fillStyle = COL.home; ctx.fillRect(-5, -5, 10, 10); ctx.strokeRect(-5, -5, 10, 10) }
  if (kind === 'turn') { ctx.fillStyle = COL.steep; ctx.beginPath(); ctx.moveTo(0, -6.5); ctx.lineTo(6.5, 0); ctx.lineTo(0, 6.5); ctx.lineTo(-6.5, 0); ctx.closePath(); ctx.fill(); ctx.stroke() }
  if (kind === 'end') { ctx.strokeStyle = COL.home; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, 5, 0, 7); ctx.stroke(); ctx.fillStyle = COL.home; ctx.beginPath(); ctx.arc(0, 0, 1.6, 0, 7); ctx.fill() }
  if (kind === 'stop' || kind === 'visited') { ctx.fillStyle = COL[kind]; ctx.beginPath(); ctx.arc(0, 0, 4.5, 0, 7); ctx.fill(); ctx.stroke() }
  if (kind === 'steepest' || kind === 'hazard') {
    ctx.fillStyle = kind === 'hazard' ? COL.steep : COL.careful
    ctx.beginPath(); ctx.moveTo(0, -6.5); ctx.lineTo(6.5, 5); ctx.lineTo(-6.5, 5); ctx.closePath(); ctx.fill(); ctx.stroke()
    ctx.fillStyle = '#000'; ctx.fillRect(-0.8, -2.5, 1.6, 4); ctx.fillRect(-0.8, 2.6, 1.6, 1.4)
  }
  if (kind === 'here') {
    ctx.fillStyle = 'rgba(255, 255, 255, 0.2)'; ctx.beginPath(); ctx.arc(0, 0, 11, 0, 7); ctx.fill()
    ctx.fillStyle = COL.you; ctx.beginPath(); ctx.arc(0, 0, 5.5, 0, 7); ctx.fill(); ctx.stroke()
  }
  if (kind === 'you') {
    ctx.fillStyle = 'rgba(255, 255, 255, 0.2)'; ctx.beginPath(); ctx.arc(0, 0, 11, 0, 7); ctx.fill()
    ctx.fillStyle = COL.you; ctx.beginPath(); ctx.moveTo(0, -8); ctx.lineTo(5.5, 6); ctx.lineTo(0, 3); ctx.lineTo(-5.5, 6); ctx.closePath(); ctx.fill(); ctx.stroke()
  }
  ctx.restore()
}

function Glyph({ kind }) {
  const ref = useRef(null)
  useEffect(() => {
    const c = ref.current
    const k = window.devicePixelRatio || 1
    c.width = 28 * k; c.height = 16 * k
    const ctx = c.getContext('2d')
    ctx.scale(k, k)
    if (kind.startsWith('route-')) {
      const lvl = kind.slice(6)
      ctx.strokeStyle = COL[lvl]; ctx.lineWidth = lvl === 'steep' ? 4 : 3; ctx.lineCap = 'round'
      ctx.setLineDash(lvl === 'careful' ? [4, 3] : [])
      ctx.beginPath(); ctx.moveTo(3, 8); ctx.lineTo(25, 8); ctx.stroke()
    } else shape(ctx, kind, 14, 8, 0.95)
  }, [kind])
  return <canvas ref={ref} className="mm-glyph" aria-hidden="true" />
}

/** Group the profile into runs of easy / careful / too-steep ground. */
function runs(profile, green, red) {
  const out = []
  for (const p of profile) {
    const lvl = p[2] > red ? 'steep' : p[2] > green ? 'careful' : 'easy'
    const last = out[out.length - 1]
    if (last && last.lvl === lvl) last.pts.push(p)
    else out.push({ lvl, pts: last ? [last.pts[last.pts.length - 1], p] : [p] })
  }
  return out
}

/**
 * @param {object} props
 * @param {Array} props.profile  analysis.profile: [d, z, slope, lon, lat, t, air]
 * @param {object} props.analysis  walk analysis (turnBack, maxSlope, maxSlopeAt, loop)
 * @param {Array} props.stops  science stops at the site
 * @param {string[]} props.visited  ids of stops on this walk
 * @param {number[]} props.home  [lon, lat]
 * @param {Array} props.hazards  known hazards (src/data schema)
 * @param {{green: number, red: number}} props.limits  slope limits in degrees
 * @param {string} [props.title]
 */
const Minimap = forwardRef(function Minimap({ site, profile = [], analysis: a, stops, visited = [], home, hazards = [], limits, title = 'Minimap', className = '', heading = true }, ref) {
  const mini = useRef(null)
  const big = useRef(null)
  const dialog = useRef(null)
  const player = useRef(null)
  const [open, setOpen] = useState(() => store.get('mw-minimap-open', true))
  const [expanded, setExpanded] = useState(false)
  useEffect(() => { store.set('mw-minimap-open', open) }, [open])

  const route = useMemo(() => runs(profile, limits.green, limits.red), [profile, limits.green, limits.red])
  const showSteepest = a && a.maxSlope > limits.green
  const turnAtEnd = !a || a.turnBack.atEnd
  const end = profile[profile.length - 1]

  const draw = useCallback((canvas, mode) => {
    if (!canvas) return
    const w = canvas.clientWidth, h = canvas.clientHeight
    if (!w || !h) return
    const k = window.devicePixelRatio || 1
    if (canvas.width !== Math.round(w * k)) { canvas.width = Math.round(w * k); canvas.height = Math.round(h * k) }
    const ctx = canvas.getContext('2d')
    ctx.setTransform(k, 0, 0, k, 0, 0)
    ctx.clearRect(0, 0, w, h)

    // view: follow "you" in the small map, the whole walk in the big one
    const lat0 = home[1]
    const mx = (lon) => (lon - home[0]) * Math.cos(lat0 * D) * R * D
    const my = (lat) => (lat - home[1]) * R * D
    let cx, cy, scale
    const p = player.current
    if (mode === 'follow') {
      const at = p || { lon: home[0], lat: home[1] }
      cx = mx(at.lon); cy = my(at.lat)
      scale = Math.min(w, h) / 2 / 650 // about 650 m from the centre to the edge
    } else {
      const xs = [...profile.map((q) => mx(q[3])), mx(home[0])], ys = [...profile.map((q) => my(q[4])), my(home[1])]
      for (const s of stops) if (visited.includes(s.id)) { xs.push(mx(s.lon)); ys.push(my(s.lat)) }
      if (p) { xs.push(mx(p.lon)); ys.push(my(p.lat)) }
      const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)]
      cx = (x0 + x1) / 2; cy = (y0 + y1) / 2
      scale = Math.min((w * 0.84) / Math.max(x1 - x0, 200), (h * 0.8) / Math.max(y1 - y0, 200))
    }
    const sx = (lon) => w / 2 + (mx(lon) - cx) * scale
    const sy = (lat) => h / 2 - (my(lat) - cy) * scale

    // grid every "nice" step, about 60 px apart
    const step = nice(60 / scale)
    ctx.strokeStyle = COL.grid; ctx.lineWidth = 1
    ctx.beginPath()
    for (let gx = Math.floor((cx - w / 2 / scale) / step) * step; gx < cx + w / 2 / scale; gx += step) { const x = w / 2 + (gx - cx) * scale; ctx.moveTo(x, 0); ctx.lineTo(x, h) }
    for (let gy = Math.floor((cy - h / 2 / scale) / step) * step; gy < cy + h / 2 / scale; gy += step) { const y = h / 2 - (gy - cy) * scale; ctx.moveTo(0, y); ctx.lineTo(w, y) }
    ctx.stroke()

    // route
    ctx.lineCap = 'round'; ctx.lineJoin = 'round'
    for (const r of route) {
      ctx.strokeStyle = COL[r.lvl]; ctx.lineWidth = r.lvl === 'steep' ? 4.5 : 3
      ctx.setLineDash(r.lvl === 'careful' ? [5, 4] : [])
      ctx.beginPath()
      r.pts.forEach((q, i) => (i ? ctx.lineTo(sx(q[3]), sy(q[4])) : ctx.moveTo(sx(q[3]), sy(q[4]))))
      ctx.stroke()
    }
    ctx.setLineDash([])

    // places
    ctx.font = '600 10px "Switzer", system-ui, sans-serif'
    for (const s of stops) {
      const on = visited.includes(s.id)
      if (!on && mode === 'follow') continue
      shape(ctx, on ? 'visited' : 'stop', sx(s.lon), sy(s.lat))
      if (mode === 'fit' && on) { ctx.fillStyle = COL.text; ctx.fillText(s.name.split(' (')[0], sx(s.lon) + 9, sy(s.lat) + 3) }
    }
    for (const hz of hazards) shape(ctx, 'hazard', sx(hz.lon), sy(hz.lat))
    if (showSteepest) shape(ctx, 'steepest', sx(a.maxSlopeAt[0]), sy(a.maxSlopeAt[1]))
    if (!turnAtEnd) shape(ctx, 'turn', sx(a.turnBack.lon), sy(a.turnBack.lat))
    else if (end && !a?.loop) shape(ctx, 'end', sx(end[3]), sy(end[4]))
    shape(ctx, 'home', sx(home[0]), sy(home[1]))
    if (p && p.bearing == null) shape(ctx, 'here', sx(p.lon), sy(p.lat))
    else if (p) { ctx.save(); ctx.translate(sx(p.lon), sy(p.lat)); ctx.rotate(p.bearing * D); shape(ctx, 'you', 0, 0); ctx.restore() }

    // north and scale
    ctx.fillStyle = COL.text
    ctx.fillText('N ↑', w - 30, 16)
    const bar = step * scale
    ctx.fillRect(10, h - 12, bar, 2)
    ctx.fillText(step >= 1000 ? `${step / 1000} km` : `${step} m`, 10, h - 17)
  }, [profile, stops, visited, home, hazards, route, a, showSteepest, turnAtEnd, end])

  const redraw = useCallback(() => {
    if (open) draw(mini.current, 'follow')
    if (expanded) draw(big.current, 'fit')
  }, [draw, open, expanded])

  useImperativeHandle(ref, () => ({
    setPlayer(lon, lat, bearing) { player.current = { lon, lat, bearing }; redraw() },
  }), [redraw])

  useEffect(() => {
    redraw()
    const ro = new ResizeObserver(redraw)
    if (mini.current) ro.observe(mini.current)
    if (big.current) ro.observe(big.current)
    return () => ro.disconnect()
  }, [redraw])

  useEffect(() => {
    const d = dialog.current
    if (!d) return
    if (expanded && !d.open) d.showModal()
    if (!expanded && d.open) d.close()
  }, [expanded])

  const walk = profile.length > 1
  const legend = [
    heading ? ['you', 'You (arrow = heading)'] : ['here', 'You are here (direction not known)'],
    walk && ['route-easy', 'Route, easy ground'],
    walk && ['route-careful', `Careful: over ${limits.green}°`],
    walk && ['route-steep', `Too steep: over ${limits.red}°`],
    ['home', 'Home (start)'],
    !walk ? null : turnAtEnd ? (a?.loop ? null : ['end', 'End of walk']) : ['turn', 'Turn-back point'],
    ['visited', 'Science stop on this walk'],
    ['stop', 'Other science stop'],
    showSteepest ? ['steepest', `Steepest point (${a.maxSlope.toFixed(0)}°)`] : null,
    hazards.length ? ['hazard', 'Known hazard'] : null,
  ].filter(Boolean)
  const label = walk
    ? `${title}: north-up map of your walk with home, ${visited.length} science stop${visited.length === 1 ? '' : 's'}${showSteepest ? ', the steepest point' : ''}${turnAtEnd ? '' : ' and the turn-back point'}.`
    : `${title}: north-up map showing where you are, home and the science stops.`

  return (
    <>
      <section className={`mm ${open ? 'mm-open' : ''} ${className}`} aria-label={title}>
        <header className="mm-head">
          <button type="button" className="mm-toggle" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
            <span className="mm-title">{title}</span>
            <span aria-hidden="true">{open ? '–' : '+'}</span>
          </button>
          {open && <button type="button" className="mm-expand" onClick={() => setExpanded(true)} aria-label="Open larger map with legend">⤢</button>}
        </header>
        {open && <div className="mm-screen"><canvas ref={mini} className="mm-canvas" role="img" aria-label={label} /></div>}
        {open && (
          <ul className="mm-key" aria-hidden="true">
            {[[heading ? 'you' : 'here', 'You'], ['home', 'Home'], ['visited', 'Stop'], walk && ['route-steep', 'Steep']].filter(Boolean).map(([k, t]) => <li key={k}><Glyph kind={k} />{t}</li>)}
          </ul>
        )}
      </section>

      <dialog ref={dialog} className="mm-dialog" aria-label={`${title}, larger`} onClose={() => setExpanded(false)} onClick={(e) => { if (e.target === dialog.current) setExpanded(false) }}>
        <div className="mm-dialog-body">
          <header className="mm-dialog-head">
            <h2 className="mm-title">{title} · whole walk</h2>
            <button type="button" className="mm-close" onClick={() => setExpanded(false)} aria-label="Close larger map">×</button>
          </header>
          {expanded && <div className="mm-screen"><canvas ref={big} className="mm-canvas mm-canvas-big" role="img" aria-label={label} /></div>}
          <ul className="mm-legend">
            {legend.map(([k, t]) => <li key={k}><Glyph kind={k} />{t}</li>)}
          </ul>
          <p className="mm-note">North is up. Route and steepness from the {site?.dem || 'MRO height map'} (USGS); science stop positions from {site?.rover || 'the rover'}’s logged stops (NASA JPL).</p>
        </div>
      </dialog>
    </>
  )
})

export default Minimap
