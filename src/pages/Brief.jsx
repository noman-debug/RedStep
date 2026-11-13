import { useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { SITE } from '../content/site.js'
import { siteById, sitePlaces, WALK } from '../data/index.js'
import { DATA } from '../content/sources.js'
import { PRIORITY, PRIORITY_LABEL } from '../content/survival.js'
import { fmtH, pct } from '../compute/walk.js'
import { fmtHours } from '../lib/mars24.js'
import { cuffCard } from '../lib/cuff.js'
import { advise, ADVISOR_LABEL } from '../lib/advisor.js'
import { store } from '../lib/hooks.js'
import { Verdict } from '../components/Atoms.jsx'
import Orbits from '../components/Orbits.jsx'
import './brief.css'

// The saved plan is only used if it has everything the sheet draws; anything else (an old
// format, a hand edit) shows the "no walk yet" screen instead of breaking.
function load() {
  try {
    const b = JSON.parse(sessionStorage.getItem('mw-brief'))
    const a = b?.result?.analysis
    const ok = b && siteById(b.site) && a && Array.isArray(a.profile) && a.profile.length > 1 && Number.isFinite(a.distance) && a.distance > 0 &&
      Array.isArray(a.reasons) && b.settings && typeof b.settings === 'object' && Array.isArray(b.stopIds) && Number.isFinite(b.startMs)
    return ok ? b : null
  } catch { return null }
}

export default function Brief() {
  const b = useMemo(load, [])
  const sheet = useRef(null)
  const navigate = useNavigate()
  const [saving, setSaving] = useState(false)
  if (!b) {
    return (
      <div className="brief-empty">
        <Orbits className="brief-empty-orbits" />
        <h1>No walk to brief yet.</h1>
        <p>Plan a walk first, then press Mission brief.</p>
        <Link to="/site/jezero" className="btn btn-primary">Plan a walk <span className="arrow">→</span></Link>
      </div>
    )
  }
  const site = siteById(b.site)
  const a = b.result.analysis
  const s = b.settings
  const allStops = sitePlaces(b.site).stops
  const stops = allStops.filter((p) => b.stopIds.includes(p.id))
  const tips = advise(a, { settings: s, stops: allStops, startMs: b.startMs, site, visitedIds: b.stopIds })
  const cuff = cuffCard(a, { stops, settings: s })
  // The cuff keeps its own copy (no map picture) in local storage, so it reopens offline.
  const openCuff = () => { store.set('mw-cuff-v1', { ...b, snapshot: null }); navigate('/cuff') }
  const printCuff = () => {
    document.body.classList.add('print-cuff')
    const done = () => { document.body.classList.remove('print-cuff'); window.removeEventListener('afterprint', done) }
    window.addEventListener('afterprint', done)
    window.print()
  }
  const checklist = store.get('mw-checklist', [])
  const ready = checklist.filter(Boolean).length

  const download = async () => {
    setSaving(true)
    try {
      const { toPng } = await import('html-to-image')
      const url = await toPng(sheet.current, { pixelRatio: 2, backgroundColor: '#000', cacheBust: true })
      const link = document.createElement('a')
      link.download = `marswalk-brief-${b.site}-${b.date}.png`
      link.href = url
      link.click()
    } finally { setSaving(false) }
  }

  const p = a.profile
  const zMin = Math.min(...p.map((q) => q[1])), zMax = Math.max(...p.map((q) => q[1]))
  const span = Math.max(20, zMax - zMin)
  const W = 600, H = 120
  const x = (d) => (d / a.distance) * W
  const y = (z) => H - 8 - ((z - zMin) / span) * (H - 24)
  const path = p.map((q, i) => `${i ? 'L' : 'M'}${x(q[0]).toFixed(1)},${y(q[1]).toFixed(1)}`).join('')

  return (
    <div className="brief-page">
      <div className="brief-tools">
        <Link to={`/site/${b.site}?${new URL(b.url).searchParams}`} className="btn btn-small">← Back to the map</Link>
        <span className="brief-tools-gap" />
        <button type="button" className="btn btn-small" onClick={openCuff}>Open on cuff</button>
        <button type="button" className="btn btn-small" onClick={printCuff}>Print wrist card</button>
        <button type="button" className="btn btn-small" onClick={() => window.print()}>Print or save PDF</button>
        <button type="button" className="btn btn-small btn-primary" onClick={download} disabled={saving}>{saving ? 'Saving…' : 'Download PNG'}</button>
      </div>

      <article className="brief" ref={sheet} aria-label="Marswalk mission brief">
        <header className="br-head">
          <div>
            <p className="micro">Marswalk brief · {site.name} · {b.date} · Mars sol {a.mars.sol.toLocaleString()}</p>
            <h1>{site.name} <em>walk</em></h1>
            <p className="br-sub">{(a.tripDistance / 1000).toFixed(1)} km {a.loop ? 'loop' : 'out and back'} · {fmtH(a.hours)} · leave {fmtHours(a.sun.start.ltst)} Mars time · back {fmtHours(a.sun.end.ltst)}</p>
          </div>
          <div className="br-verdict">
            <Verdict status={a.status} size="l" />
            <p className="micro">Computed from NASA data · {new Date(b.made).toISOString().slice(0, 10)}</p>
          </div>
        </header>

        <div className="br-grid">
          <figure className="br-map">
            {b.snapshot ? <img src={b.snapshot} alt={`Map of the planned walk at ${site.name}`} /> : <div className="br-map-empty"><Orbits /></div>}
            <figcaption className="micro">MRO orbital photos, {site.dem}, {site.rover}{'\u2019'}s real path (JPL MMGIS). ● habitat {a.drive ? '● rover ' : ''}● turn-back ● science stop</figcaption>
          </figure>

          <section className="br-why">
            <h2 className="micro">Why this verdict</h2>
            <ul>
              {(a.reasons.filter((r) => r.level !== 'note').length ? a.reasons.filter((r) => r.level !== 'note') : a.good.map((g) => ({ code: g, title: g, level: 'go' }))).slice(0, 4).map((r) => (
                <li key={r.code} className={`br-${r.level}`}><b>{r.title}</b>{r.detail && <span> — {r.detail}</span>}</li>
              ))}
            </ul>
            <dl className="br-nums">
              <div><dt>Turn-back point</dt><dd>{a.turnBack.atEnd ? 'far end' : `${(a.turnBack.d / 1000).toFixed(2)} km`}</dd></div>
              <div><dt>Suit air used</dt><dd>{pct(a.airUsed)}</dd></div>
              <div><dt>Air left at home</dt><dd>{a.airLeft > 0 ? pct(a.airLeft) : 'none'}</dd></div>
              <div><dt>Steepest ground</dt><dd>{a.maxSlope.toFixed(0)}°</dd></div>
              <div><dt>Climb</dt><dd>↑{Math.round(a.gain)} m ↓{Math.round(a.loss)} m</dd></div>
              <div><dt>Sun height</dt><dd>{a.sun.start.elevation.toFixed(0)}° → {a.sun.end.elevation.toFixed(0)}°</dd></div>
              <div><dt>Radiation</dt><dd>{a.dose.toFixed(2)} mSv</dd></div>
              <div><dt>Earth delay</dt><dd>{a.comms.lightMin.toFixed(1)} min</dd></div>
            </dl>
          </section>

          <section className="br-profile">
            <h2 className="micro">Height along the walk</h2>
            <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
              {a.bands.map((bd, i) => <rect key={i} x={x(bd.from)} width={Math.max(1, x(bd.to) - x(bd.from))} y="0" height={H} fill={bd.level === 'red' ? '#ff8d7a' : '#ffd37a'} opacity={bd.level === 'red' ? 0.3 : 0.14} />)}
              <path d={`${path}L${W},${H}L0,${H}Z`} fill="rgba(236,125,69,.25)" />
              <path d={path} fill="none" stroke="#e3895a" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
              {a.visited.map((v) => <line key={v.id} x1={x(v.d)} x2={x(v.d)} y1="0" y2={H} stroke="#7fe0a8" strokeOpacity=".7" vectorEffect="non-scaling-stroke" />)}
            </svg>
            <p className="micro br-axis"><span>habitat · {Math.round(p[0][1])} m</span><span>{(a.distance / 1000).toFixed(2)} km · {Math.round(p[p.length - 1][1])} m</span></p>
          </section>

          <section className="br-science">
            <h2 className="micro">Science stops · {stops.length}</h2>
            {stops.length === 0 && <p className="br-muted">No science stops on this walk.</p>}
            <ol>
              {stops.map((st) => (
                <li key={st.id}>
                  <b>{st.name}</b>
                  <span>{st.why}</span>
                  <span className="micro">{st.evidence} · {st.minutes} min · bring {st.bring.toLowerCase()}</span>
                </li>
              ))}
            </ol>
          </section>

          <section className="br-advice">
            <h2 className="micro">Advisor · {ADVISOR_LABEL}</h2>
            <ol>{tips.map((t) => <li key={t.id}>{t.text}</li>)}</ol>
          </section>

          <section className="br-emergency">
            <h2 className="micro">If something goes wrong</h2>
            <ol className="br-order">
              {PRIORITY.map((k, i) => <li key={k}><span className="mono">{i + 1}</span><b>{PRIORITY_LABEL[k].word}</b></li>)}
            </ol>
            <p className="br-muted">Pre-walk checklist: {ready} of 12 ticked.</p>
          </section>

          <section className="br-assumptions">
            <h2 className="micro">Assumptions (illustrative, editable)</h2>
            <ul>
              {['flatPace', 'suitHours', 'reserve', 'climbCost', 'greenSlope', 'redSlope', 'walkBack', 'minSun'].map((k) => (
                <li key={k}><span>{WALK[k].label}</span><b>{s[k]} {WALK[k].unit}</b></li>
              ))}
            </ul>
          </section>
        </div>

        <footer className="br-foot">
          <p className="micro">Data: {DATA.filter((d) => (b.site === 'gale' ? ['galeDem', 'galeHirise', 'mslTraverse', 'mslStops', 'themisNight'] : ['ctxDem', 'ctxPhoto', 'hirise', 'traverse', 'samples', 'themisNight']).includes(d.id)).map((d) => `${d.mission} ${d.instrument}`).join(' · ')} · Curiosity RAD · NASA GISS Mars24</p>
          <p className="micro">{SITE.name} · {SITE.by} · {SITE.disclaimer}</p>
        </footer>
      </article>

      <section className="cuff" aria-label="Wrist checklist">
        <header className="cuff-head">
          <p className="micro">Wrist card · {site.name} · {b.date}</p>
          <Verdict status={a.status} />
        </header>
        <ol className="cuff-steps">
          {cuff.steps.map((st, i) => (
            <li key={i} className={st.key ? 'cuff-key' : ''}>
              <span className="cuff-box" aria-hidden="true" />
              <time className="mono">{fmtHours(st.t)}</time>
              <span className="cuff-what"><b>{st.what}</b>{st.note && <small>{st.note}</small>}</span>
              {st.air != null && <span className="cuff-air mono" title="Suit air used by then">{pct(st.air)}</span>}
            </li>
          ))}
        </ol>
        <ul className="cuff-rules">{cuff.rules.map((x) => <li key={x}>{x}</li>)}</ul>
        <p className="micro cuff-foot">Mars local time (a Mars hour is 2.7% longer than an Earth hour; stop times are Earth minutes) · air = share of suit air used by then · {a.crew?.length > 1 ? 'two astronauts' : 'one astronaut'}{a.drive ? ' · rover drop-off' : ''}</p>
      </section>
    </div>
  )
}
