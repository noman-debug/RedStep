// Interactive pieces of the survival guide. Each one turns a fact into something you can try.
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router'
import { Badge, Slider, Source } from '../Atoms.jsx'
import { FACTS } from '../../data/index.js'
import { CHECKLIST, EMERGENCIES, PRIORITY, PRIORITY_LABEL, STEPS } from '../../content/survival.js'
import { earthMars } from '../../lib/ephem.js'
import { yearOfSun } from '../../lib/insolation.js'
import { SITES } from '../../content/sites.js'
import { prefersReducedMotion, useStored } from '../../lib/hooks.js'
import { FarmCalc, OxygenCalc, ShelterCalc, useBase } from './Base.jsx'
import StormRisk from './StormRisk.jsx'
import './widgets.css'

/* 1. How thin is the air? */
function Pressure() {
  // Earth's air thins roughly exponentially with height (scale height ~7.6 km): an approximation.
  const H = 7.6
  const [km, setKm] = useState(0)
  const p = 1013 * Math.exp(-km / H)
  const marsKm = H * Math.log(1013 / 6)
  const marks = [[0, 'Sea level'], [8.8, 'Top of Everest'], [11, 'Airliners fly'], [marsKm, 'Same as Mars']]
  const [held, setHeld] = useState(null)
  useEffect(() => {
    if (held === null) return
    const t = setInterval(() => setHeld((h) => (h <= 0 ? null : h - 1)), 1000)
    return () => clearInterval(t)
  }, [held])
  return (
    <div className="w-pressure">
      <div className="wp-gauge" aria-hidden="true">
        <div className="wp-col"><span className="micro">Earth now</span><div className="wp-bar"><i style={{ height: `${(p / 1013) * 100}%` }} /></div><b>{Math.round(p)} hPa</b></div>
        <div className="wp-col"><span className="micro">Mars surface</span><div className="wp-bar wp-mars"><i style={{ height: `${(6 / 1013) * 100}%` }} /></div><b>6 hPa</b></div>
      </div>
      <div className="wp-side">
        <Slider compact id="wp-km" label="Climb above Earth" value={km} min={0} max={45} step={0.5} unit="km" onChange={setKm} badge="illustrative" note="Earth's air pressure from a simple exponential rule. Good enough to compare." />
        <ul className="wp-marks">
          {marks.map(([k, label]) => (
            <li key={label}><button type="button" onClick={() => setKm(Math.round(k * 2) / 2)} className={Math.abs(km - k) < 0.8 ? 'on' : ''}>{label}</button><span className="mono">{k.toFixed(1)} km</span></li>
          ))}
        </ul>
        <p className="wp-say">
          {km >= marsKm - 1 ? <>Up here, Earth&rsquo;s air is as thin as Mars&rsquo;s. Without a pressure suit your body cannot work.</> : km > 11 ? <>Already deadly without a pressure suit. Mars is thinner still.</> : <>Mars air is about <b>{Math.round(p / 6)} times</b> thinner than this.</>}
        </p>
        <div className="wp-hold">
          <button type="button" className="btn btn-small" onClick={() => setHeld(15)} disabled={held !== null}>{held === null ? 'Feel 15 seconds' : `${held} s`}</button>
          <span>That is about how long a person stays conscious in Mars air. <Source k="marsFacts" badge="nasa" /></span>
        </div>
      </div>
    </div>
  )
}

/* 2. Seven minutes of landing */
const EDL = [
  ['Entry', 'The capsule hits the top of the air at about 19,500 km/h. The heat shield glows as air friction slows it.'],
  ['Parachute', 'A huge supersonic parachute opens. Still too fast to land.'],
  ['Heat shield off', 'The heat shield drops away. Radar and cameras look at the ground and pick a safe spot.'],
  ['Rockets', 'The lander drops off the parachute and fires its engines to slow down.'],
  ['Touchdown', 'It sets down gently. Earth hears about it many minutes later.'],
]
function Edl() {
  const [t, setT] = useState(0)
  const [play, setPlay] = useState(false)
  const raf = useRef(0)
  useEffect(() => {
    if (!play) return
    if (prefersReducedMotion()) { setT(1); setPlay(false); return }
    const t0 = performance.now() - t * 9000
    const tick = (now) => {
      const k = Math.min(1, (now - t0) / 9000)
      setT(k)
      if (k < 1) raf.current = requestAnimationFrame(tick)
      else setPlay(false)
    }
    raf.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf.current)
  }, [play]) // eslint-disable-line react-hooks/exhaustive-deps
  const i = Math.min(EDL.length - 1, Math.floor(t * EDL.length))
  const sec = Math.round(t * 420)
  return (
    <div className="w-edl">
      <div className="we-clock mono" aria-live="off">{Math.floor(sec / 60)}:{String(sec % 60).padStart(2, '0')}<span> / 7:00</span></div>
      <div className="we-track">
        <svg viewBox="0 0 600 160" aria-hidden="true" preserveAspectRatio="none">
          <path d="M10 20 C 200 30, 380 70, 590 150" stroke="rgba(255,255,255,.15)" fill="none" strokeDasharray="3 5" />
          <path d="M10 20 C 200 30, 380 70, 590 150" stroke="var(--ember)" strokeWidth="1.6" strokeLinecap="round" fill="none" pathLength="1" strokeDasharray="1" strokeDashoffset={1 - t} style={{ transition: 'stroke-dashoffset 240ms var(--ease)' }} />
        </svg>
        <ol className="we-steps">
          {EDL.map(([name], k) => (
            <li key={name}><button type="button" className={k === i ? 'on' : k < i ? 'done' : ''} onClick={() => { setPlay(false); setT((k + 0.5) / EDL.length) }}>{name}</button></li>
          ))}
        </ol>
      </div>
      <p className="we-text" aria-live="polite">{EDL[i][1]}</p>
      <div className="we-tools">
        <button type="button" className="btn btn-small btn-primary" onClick={() => { if (t >= 1) setT(0); setPlay((p) => !p) }}>{play ? 'Pause' : t >= 1 ? 'Replay' : 'Play the landing'}</button>
        <span className="micro">Timeline shortened to 9 s · stages after NASA JPL <Source k="edl" badge="nasa" /></span>
      </div>
    </div>
  )
}

/* 3. Radiation budget for a whole mission */
function Dose({ walkDose }) {
  const [out, setOut] = useState(210)
  const [surf, setSurf] = useState(500)
  const cruise = out * 2 * FACTS.cruiseDose.value
  const surface = surf * FACTS.surfaceDose.value
  const total = cruise + surface
  const limit = FACTS.careerLimit.value
  return (
    <div className="w-dose">
      <div className="wd-controls">
        <Slider compact id="wd-out" label="Flight to Mars (each way)" value={out} min={150} max={300} step={10} unit="days" onChange={setOut} badge="illustrative" />
        <Slider compact id="wd-surf" label="Days living on Mars" value={surf} min={30} max={600} step={10} unit="days" onChange={setSurf} badge="illustrative" />
        <p className="calc-note">Dose rates are measured by Curiosity&rsquo;s RAD: {FACTS.cruiseDose.value} mSv/day in flight and {FACTS.surfaceDose.value} mSv/day on the surface, without a shelter. <Source k="rad" badge="nasa" /></p>
      </div>
      <div className="wd-out">
        <div className="wd-bar" role="img" aria-label={`Total ${Math.round(total)} mSv against a ${limit} mSv career limit`}>
          <i className="wd-cruise" style={{ width: `${Math.min(100, (cruise / Math.max(total, limit)) * 100)}%` }} />
          <i className="wd-surface" style={{ width: `${Math.min(100, (surface / Math.max(total, limit)) * 100)}%` }} />
          <span className="wd-limit" style={{ left: `${(limit / Math.max(total, limit)) * 100}%` }}><span className="micro">career limit {limit}</span></span>
        </div>
        <div className="calc-row">
          <div className="big"><span className="micro">Flight</span><b>{Math.round(cruise)}</b><small>mSv</small></div>
          <div className="big"><span className="micro">On Mars</span><b>{Math.round(surface)}</b><small>mSv</small></div>
          <div className="big"><span className="micro">Total</span><b className={total > limit ? 'v-nogo' : 'v-caution'}>{Math.round(total)}</b><small>{Math.round((total / limit) * 100)}% of limit <Source k="nasaStd" badge="nasa" /></small></div>
        </div>
        <p className="calc-note">{walkDose != null ? <>Your planned Marswalk adds about <b>{walkDose.toFixed(2)} mSv</b>, tiny next to the flight.</> : <>One 5-hour walk adds about 0.13 mSv. The flight is the big dose.</>} Sleeping under soil, and short flights, matter most.</p>
      </div>
    </div>
  )
}

/* 4. Living on Mars time + message to Earth */
function MarsTimeWidget() {
  const [days, setDays] = useState(10)
  const drift = days * 39.6 // minutes (sol is 24 h 39 m 35 s)
  const hours = Math.floor(drift / 60), mins = Math.round(drift % 60)
  const em = useMemo(() => earthMars(Date.now()), [])
  const [msg, setMsg] = useState('')
  const [queue, setQueue] = useState([])
  const [speed, setSpeed] = useState(60)
  const [, force] = useState(0)
  useEffect(() => { const t = setInterval(() => force((x) => x + 1), 250); return () => clearInterval(t) }, [])
  const now = Date.now()
  const send = (e) => {
    e.preventDefault()
    if (!msg.trim()) return
    setQueue((q) => [...q, { text: msg.trim(), t0: Date.now(), ms: (em.lightMin * 60000) / speed }].slice(-4))
    setMsg('')
  }
  const angle = (drift / 1440) * 360
  return (
    <div className="w-time">
      <div className="wt-clocks">
        <div className="wt-clock">
          <svg viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="46" /><line x1="50" y1="50" x2="50" y2="12" className="wt-earth" /><line x1="50" y1="50" x2={50 + 38 * Math.sin((angle * Math.PI) / 180)} y2={50 - 38 * Math.cos((angle * Math.PI) / 180)} className="wt-mars" /></svg>
          <p className="micro">Earth clock vs Mars sun after {days} sols</p>
        </div>
        <div>
          <Slider compact id="wt-days" label="Sols lived on Mars" value={days} min={0} max={36} step={1} unit="sols" onChange={setDays} />
          <p className="wt-say">Your body clock has drifted <b>{hours} h {mins} min</b> from Earth time. {days >= 36 ? 'A full day: sunrise is back where it started.' : ''}</p>
          <p className="calc-note">One sol = 24 h 39 m 35 s. <Source k="marsFacts" badge="nasa" /></p>
        </div>
      </div>
      <form className="wt-msg" onSubmit={send}>
        <label htmlFor="wt-text">Send a message to Earth <span className="micro">· real delay today: {em.lightMin.toFixed(1)} min one way <Badge kind="derived" /></span></label>
        <div className="wt-row">
          <input id="wt-text" value={msg} maxLength={120} onChange={(e) => setMsg(e.target.value)} placeholder="Landed safely. All crew OK." />
          <select aria-label="Playback speed" value={speed} onChange={(e) => setSpeed(Number(e.target.value))}>
            <option value={60}>60× faster</option>
            <option value={10}>10× faster</option>
            <option value={1}>Real time</option>
          </select>
          <button type="submit" className="btn btn-small btn-primary">Send</button>
        </div>
        <ul className="wt-queue" aria-live="polite">
          {queue.map((q, k) => {
            const f = Math.min(1, (now - q.t0) / q.ms)
            return (
              <li key={k} className={f >= 1 ? 'done' : ''}>
                <span className="wt-q-text">“{q.text}”</span>
                <span className="wt-q-bar"><i style={{ width: `${f * 100}%` }} /></span>
                <span className="micro">{f >= 1 ? 'Arrived at Earth' : `In space · ${Math.ceil(((1 - f) * q.ms) / 1000)} s`}</span>
              </li>
            )
          })}
        </ul>
        <p className="calc-note">A simulation, not a real link. Earth&rsquo;s reply takes just as long, so you decide alone in an emergency.</p>
      </form>
    </div>
  )
}

/* 5. Emergency drill */
function Drill() {
  const [k, setK] = useState(0)
  const [picked, setPicked] = useState([])
  const e = EMERGENCIES[k]
  const shuffled = useMemo(() => [...PRIORITY].sort((a, b) => ((a.charCodeAt(1) * (k + 3)) % 7) - ((b.charCodeAt(1) * (k + 3)) % 7)), [k])
  const done = picked.length === 4
  const right = PRIORITY.every((p, i) => picked[i] === p)
  const pick = (p) => { if (!picked.includes(p)) setPicked((x) => [...x, p]) }
  return (
    <div className="w-drill">
      <div className="wdr-scn">
        <p className="micro">Scenario {k + 1} of {EMERGENCIES.length}</p>
        <h4>{e.name}</h4>
        <p className="calc-note">{e.science} <Source k={e.source} badge="nasa" /></p>
      </div>
      <p className="wdr-ask">Tap what you check, in order:</p>
      <div className="wdr-opts">
        {shuffled.map((p) => {
          const i = picked.indexOf(p)
          return (
            <button key={p} type="button" className={`wdr-opt ${i >= 0 ? (done ? (PRIORITY[i] === p ? 'ok' : 'bad') : 'sel') : ''}`} onClick={() => pick(p)} disabled={i >= 0}>
              {i >= 0 && <span className="mono">{i + 1}</span>}
              <b>{PRIORITY_LABEL[p].word}</b>
            </button>
          )
        })}
      </div>
      {done && (
        <div className={`wdr-result ${right ? 'ok' : 'bad'}`} aria-live="polite">
          <p><b>{right ? 'Right order.' : 'Not quite.'}</b> Air, then pressure, then heat, then power. Without air you have seconds. The other problems give you a little more time, but only while you can still breathe.</p>
          <p className="micro">Then: {e.steps.join(' → ')}</p>
          <div className="wdr-tools">
            <button type="button" className="btn btn-small" onClick={() => setPicked([])}>Try again</button>
            <button type="button" className="btn btn-small btn-primary" onClick={() => { setK((k + 1) % EMERGENCIES.length); setPicked([]) }}>Next scenario</button>
          </div>
        </div>
      )}
    </div>
  )
}

/* 6. Readiness checklist */
function Checklist({ goTo }) {
  const [chk, setChk] = useStored('mw-checklist', CHECKLIST.map(() => false))
  const n = chk.filter(Boolean).length
  return (
    <div className="w-check">
      <div className="wc-head">
        <div className="wc-ring" style={{ '--p': n / CHECKLIST.length }} aria-hidden="true"><span>{n}</span></div>
        <div>
          <p className="wc-count"><b>{n} of {CHECKLIST.length}</b> ready</p>
          <p className="calc-note">Saved on this device. All items are proposed procedures.</p>
        </div>
      </div>
      <ul className="wc-list">
        {CHECKLIST.map(([text, step], i) => (
          <li key={text}>
            <label>
              <input type="checkbox" checked={!!chk[i]} onChange={(e) => setChk((c) => c.map((v, k) => (k === i ? e.target.checked : v)))} />
              <span className="wc-box" aria-hidden="true" />
              <span>{text}</span>
            </label>
            <button type="button" className="wc-review" onClick={() => goTo(step)}>Review: {STEPS.find((s) => s.id === step)?.title}</button>
          </li>
        ))}
      </ul>
      {n === CHECKLIST.length && (
        <div className="wc-done">
          <p><b>You are ready to plan a walk.</b></p>
          <Link to="/site/jezero" className="btn btn-primary">Plan a Marswalk <span className="arrow">→</span></Link>
        </div>
      )}
    </div>
  )
}

function OxygenStep() { const [b, set] = useBase(); return <OxygenCalc b={b} set={set} /> }
function FarmStep() { const [b, set] = useBase(); return <FarmCalc b={b} set={set} /> }
function ShelterStep({ walkDose }) {
  const [b, set] = useBase()
  return (
    <div className="w-stack">
      <ShelterCalc b={b} set={set} />
      <hr className="rule" />
      <Dose walkDose={walkDose} />
    </div>
  )
}

/* Farmable land: what each landing site gives a sealed greenhouse */
// Water at each site, from the site's own sources. "ice" = buried water ice, "minerals" = water
// held in the ground that has to be baked out.
const SITE_WATER = {
  jezero: { kind: 'minerals', text: 'Clay and carbonate minerals in the old river delta hold water that would have to be baked out.', source: 'goudge' },
  gale: { kind: 'minerals', text: 'Heat the soil: when Curiosity did, about 2% of its weight came off as water.', source: 'leshin' },
  deuteronilus: { kind: 'ice', text: 'Buried glacier ice, found by radar on MRO. Dig, melt, filter.', source: 'ezWorkshop' },
  protonilus: { kind: 'ice', text: 'Ice-rich valley fills, with water ice close to the surface.', source: 'ezWorkshop' },
  mawrth: { kind: 'minerals', text: 'The largest exposed clay-rich rock on Mars; the clays hold water that would have to be baked out.', source: 'ezWorkshop' },
}

function FarmLand() {
  const rows = useMemo(() => SITES.map((site) => ({ site, sun: yearOfSun(site.lat), water: SITE_WATER[site.id] })), [])
  const [pick, setPick] = useState('deuteronilus')
  const r = rows.find((x) => x.site.id === pick) || rows[0]
  const maxSun = Math.max(...rows.map((x) => x.sun.max))
  const byMean = [...rows].sort((a, b) => b.sun.mean - a.sun.mean)
  const rank = byMean.findIndex((x) => x.site.id === r.site.id)
  const ice = r.water?.kind === 'ice'
  const lat = `${Math.abs(r.site.lat).toFixed(1)}°${r.site.lat >= 0 ? 'N' : 'S'}`
  const sunWord = rank === 0 ? 'The most sunlight of the five sites.' : rank === rows.length - 1 ? 'The least sunlight of the five sites.' : `Ranks ${rank + 1} of ${rows.length} for sunlight.`
  const verdict = ice
    ? `${sunWord} Water is the easy part here: there is ice to dig. Plan for lamps and stored power through the darkest season.`
    : `${sunWord} Light is easier, water is harder: it has to be baked out of the ground, which takes power.`
  return (
    <div className="w-land">
      <div className="wl-sites" role="radiogroup" aria-label="Landing site">
        {rows.map(({ site, water }) => (
          <button key={site.id} type="button" role="radio" aria-checked={site.id === pick} className="wl-site" onClick={() => setPick(site.id)}>
            <b>{site.name}</b>
            <span>{water?.kind === 'ice' ? 'Buried ice' : 'Water in minerals'}</span>
          </button>
        ))}
      </div>

      <div className="wl-detail" aria-live="polite">
        <div className="wl-head">
          <h4>{r.site.name}</h4>
          <span className="wl-lat">{lat}</span>
        </div>
        <p className="wl-why">{r.site.why}</p>

        <div className="wl-grid">
          <section className="wl-cell">
            <p className="micro">Sunlight above the air <Source k="nssdc" badge="derived" note="Daily-mean sunlight on flat ground at this latitude, from Mars's real orbit (Mars24 declination and distance) and NASA's mean irradiance at Mars. Dust and air cut what reaches the ground." /></p>
            <p className="wl-big">{Math.round(r.sun.mean)}<small>W/m² a year on average</small></p>
            <div className="wl-bar" aria-hidden="true">
              <i style={{ left: `${(r.sun.min / maxSun) * 100}%`, width: `${((r.sun.max - r.sun.min) / maxSun) * 100}%` }} />
              <b style={{ left: `${(r.sun.mean / maxSun) * 100}%` }} />
            </div>
            <p className="wl-sub">Darkest season {Math.round(r.sun.min)} W/m² · brightest {Math.round(r.sun.max)} W/m²</p>
          </section>

          <section className="wl-cell">
            <p className="micro">Water <Source k={r.water.source} badge="nasa" /></p>
            <p className="wl-big wl-word">{ice ? 'Buried ice' : 'In minerals'}</p>
            <p className="wl-sub">{r.water.text}</p>
          </section>

          <section className="wl-cell">
            <p className="micro">Soil <Source k="perchlorate" badge="nasa" /></p>
            <p className="wl-big wl-word">Wash first</p>
            <p className="wl-sub">Like everywhere on Mars, the soil carries perchlorate, a toxic salt. Wash it out, or grow plants in water.</p>
          </section>
        </div>

        <p className="wl-verdict">{verdict}</p>
        <div className="wl-links">
          <Link to="/map" className="btn btn-small">See it on the Mars map</Link>
          {r.site.planner && <Link to={`/site/${r.site.id}`} className="btn btn-small btn-primary">Plan a walk here <span className="arrow">→</span></Link>}
        </div>
      </div>

      <div className="wl-compare" aria-label="Sunlight at the five sites, yearly mean">
        {byMean.map((x) => (
          <button key={x.site.id} type="button" className={`wl-row ${x.site.id === pick ? 'on' : ''}`} onClick={() => setPick(x.site.id)}>
            <span>{x.site.name}</span>
            <span className="wl-track"><i style={{ width: `${(x.sun.mean / maxSun) * 100}%` }} /></span>
            <b>{Math.round(x.sun.mean)}</b>
          </button>
        ))}
      </div>
    </div>
  )
}

export const WIDGETS = {
  pressure: Pressure,
  edl: Edl,
  oxygen: OxygenStep,
  farm: FarmStep,
  land: FarmLand,
  dose: ShelterStep,
  time: MarsTimeWidget,
  storms: StormRisk,
  drill: Drill,
  checklist: Checklist,
}

