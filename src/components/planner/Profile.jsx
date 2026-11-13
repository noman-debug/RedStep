import { useMemo, useRef, useState } from 'react'

const W = 1000, H = 150, PAD = { l: 44, r: 12, t: 14, b: 22 }

/** Height along the walk. Amber/red bands mark steep ground; hover syncs a marker on the map. */
export default function Profile({ analysis, stops = [], onHover, limits = { greenSlope: 10, redSlope: 15 } }) {
  const svg = useRef(null)
  const [hover, setHover] = useState(null)
  const g = useMemo(() => {
    if (!analysis) return null
    const p = analysis.profile
    const dMax = p[p.length - 1][0] || 1
    let zMin = Infinity, zMax = -Infinity
    for (const q of p) { zMin = Math.min(zMin, q[1]); zMax = Math.max(zMax, q[1]) }
    const span = Math.max(20, zMax - zMin)
    zMin -= span * 0.15; zMax += span * 0.1
    const x = (d) => PAD.l + (d / dMax) * (W - PAD.l - PAD.r)
    const y = (z) => PAD.t + (1 - (z - zMin) / (zMax - zMin)) * (H - PAD.t - PAD.b)
    const top = p.map((q) => `${x(q[0]).toFixed(1)},${y(q[1]).toFixed(1)}`).join(' L')
    const area = `M${x(0)},${H - PAD.b} L${top} L${x(dMax)},${H - PAD.b} Z`
    const ticks = []
    const step = [100, 200, 250, 500, 1000, 2000, 5000].find((s) => dMax / s <= 8) || 5000
    for (let d = 0; d <= dMax; d += step) ticks.push(d)
    const zt = [zMin + (zMax - zMin) * 0.2, zMin + (zMax - zMin) * 0.8]
    return { p, dMax, x, y, top, area, ticks, zt }
  }, [analysis])

  if (!g) return <div className="profile profile-empty"><p className="micro">Height along the walk appears here</p></div>

  const move = (e) => {
    const r = svg.current.getBoundingClientRect()
    const fx = ((e.clientX - r.left) / r.width) * W
    const d = ((fx - PAD.l) / (W - PAD.l - PAD.r)) * g.dMax
    if (d < 0 || d > g.dMax) return leave()
    let i = 0
    while (i < g.p.length - 1 && g.p[i + 1][0] < d) i++
    setHover(i)
    onHover?.(g.p[i])
  }
  const leave = () => { setHover(null); onHover?.(null) }
  const h = hover !== null ? g.p[hover] : null
  const km = (d) => (g.dMax > 2000 ? `${(d / 1000).toFixed(d % 1000 ? 1 : 0)} km` : `${Math.round(d)} m`)

  return (
    <figure className="profile">
      <figcaption className="sr-only">Height profile of the walk: {Math.round(analysis.gain)} m up, {Math.round(analysis.loss)} m down over {(analysis.distance / 1000).toFixed(1)} km. Steepest point {analysis.maxSlope.toFixed(0)} degrees.</figcaption>
      <svg ref={svg} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" onPointerMove={move} onPointerLeave={leave} role="img" aria-hidden="true">
        <defs>
          <linearGradient id="pf-fill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="#d0602f" stopOpacity=".45" />
            <stop offset="1" stopColor="#d0602f" stopOpacity="0" />
          </linearGradient>
        </defs>
        {analysis.bands.map((b, i) => (
          <rect key={i} x={g.x(b.from)} width={Math.max(1.5, g.x(b.to) - g.x(b.from))} y={PAD.t} height={H - PAD.t - PAD.b} fill={b.level === 'red' ? '#ff8d7a' : '#ffd37a'} opacity={b.level === 'red' ? 0.32 : 0.16} />
        ))}
        {g.ticks.map((d) => (
          <g key={d}>
            <line x1={g.x(d)} x2={g.x(d)} y1={PAD.t} y2={H - PAD.b} stroke="#fff" strokeOpacity=".06" vectorEffect="non-scaling-stroke" />
            <text x={g.x(d)} y={H - 6} className="pf-tick" textAnchor="middle">{km(d)}</text>
          </g>
        ))}
        {g.zt.map((z) => (
          <text key={z} x={PAD.l - 8} y={g.y(z) + 3} className="pf-tick" textAnchor="end">{Math.round(z)} m</text>
        ))}
        <path key={`a${g.dMax}`} d={g.area} fill="url(#pf-fill)" className="pf-area" />
        <path key={g.top.length + g.dMax} d={`M${g.top}`} fill="none" stroke="#e3895a" strokeWidth="1.6" vectorEffect="non-scaling-stroke" className="pf-line" pathLength="1" />
        {!analysis.turnBack.atEnd && (
          <g>
            <line x1={g.x(analysis.turnBack.d)} x2={g.x(analysis.turnBack.d)} y1={PAD.t - 4} y2={H - PAD.b} stroke="#ff8d7a" strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />
            <text x={g.x(analysis.turnBack.d) + 6} y={PAD.t + 6} className="pf-label pf-turn">Turn back</text>
          </g>
        )}
        {analysis.visited.map((v) => {
          const s = stops.find((x) => x.id === v.id)
          return (
            <g key={v.id}>
              <line x1={g.x(v.d)} x2={g.x(v.d)} y1={PAD.t} y2={H - PAD.b} stroke="#7fe0a8" strokeOpacity=".6" vectorEffect="non-scaling-stroke" />
              <circle cx={g.x(v.d)} cy={PAD.t} r="3" fill="#7fe0a8" />
              {s && <title>{s.name}</title>}
            </g>
          )
        })}
        {h && (
          <g>
            <line x1={g.x(h[0])} x2={g.x(h[0])} y1={PAD.t} y2={H - PAD.b} stroke="#00e5ff" vectorEffect="non-scaling-stroke" />
            <circle cx={g.x(h[0])} cy={g.y(h[1])} r="3.5" fill="#00e5ff" />
          </g>
        )}
      </svg>
      <div className="pf-readout mono" aria-live="off">
        {h ? (
          <>
            <span>{km(h[0])}</span>
            <span>{Math.round(h[1])} m</span>
            <span className={h[2] > limits.redSlope ? 'v-nogo' : h[2] > limits.greenSlope ? 'v-caution' : ''}>{h[2].toFixed(1)}° slope</span>
            <span>+{Math.floor(h[5])}:{String(Math.round((h[5] % 1) * 60)).padStart(2, '0')} h</span>
          </>
        ) : (
          <>
            <span>↑ {Math.round(analysis.gain)} m</span>
            <span>↓ {Math.round(analysis.loss)} m</span>
            <span>steepest {analysis.maxSlope.toFixed(0)}°</span>
            <span className="pf-legend"><i className="pf-amber" />careful <i className="pf-red" />too steep <i className="pf-stop" />science stop</span>
          </>
        )}
      </div>
    </figure>
  )
}
