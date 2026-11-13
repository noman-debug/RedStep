// Storm Risk Estimator: pick a landing site and a Mars month; see how often big dust storms
// have hit then (MDAD seasons, the 2001 and 2018 global storms) and what happened at that site.
import { useId, useMemo } from 'react'
import { Source } from '../Atoms.jsx'
import { SITES } from '../../content/sites.js'
import { FEATURED, MDAD, SEASON_NAMES, SITE_COUNTS, SITE_EVENTS, STORM_DISCLAIMER, stormRisk } from '../../content/stormRisk.js'
import { useStored } from '../../lib/hooks.js'
import './stormrisk.css'

const LEVEL = { low: 'Low', moderate: 'Moderate', high: 'High' }
const OPPOSITE = { Spring: 'Autumn', Summer: 'Winter', Autumn: 'Spring', Winter: 'Summer' }
const season = (m, hemi) => (hemi === 'south' ? OPPOSITE[SEASON_NAMES[m - 1]] : SEASON_NAMES[m - 1])

function NeedData({ children }) {
  return <span className="sr-need"><b>Data needed</b> {children}</span>
}

/** Arrow keys move through a radio group (and select), like native radios. */
function arrowNav(e, count, current, set) {
  const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key]
  let next = null
  if (step) next = (current + step + count) % count
  else if (e.key === 'Home') next = 0
  else if (e.key === 'End') next = count - 1
  if (next === null) return
  e.preventDefault()
  set(next)
  e.currentTarget.parentElement.children[next]?.focus()
}

export default function StormRisk() {
  const [siteId, setSiteId] = useStored('mw-storm-site', 'jezero')
  const [month, setMonth] = useStored('mw-storm-month', 7)
  const site = SITES.find((s) => s.id === siteId) || SITES[0]
  const r = stormRisk(site.lat, month)
  const year = useMemo(() => Array.from({ length: 12 }, (_, i) => stormRisk(site.lat, i + 1).level), [site.lat])
  const counts = SITE_COUNTS[site.id]
  const n = Array.isArray(counts) && typeof counts[month - 1] === 'number' ? counts[month - 1] : null
  const ids = useId()
  const siteIdx = SITES.indexOf(site)

  return (
    <div className="sr" data-level={r.level}>
      <div className="sr-pick">
        <p className="micro" id={`${ids}-site`}>Landing site</p>
        <div className="sr-sites" role="radiogroup" aria-labelledby={`${ids}-site`}>
          {SITES.map((s, i) => (
            <button
              key={s.id}
              type="button"
              role="radio"
              aria-checked={s.id === site.id}
              tabIndex={s.id === site.id ? 0 : -1}
              className="sr-site"
              onClick={() => setSiteId(s.id)}
              onKeyDown={(e) => arrowNav(e, SITES.length, siteIdx, (k) => setSiteId(SITES[k].id))}
            >
              <b>{s.name}</b>
              <span>{Math.abs(s.lat).toFixed(1)}° {s.lat >= 0 ? 'N' : 'S'}</span>
            </button>
          ))}
        </div>

        <p className="micro" id={`${ids}-month`}>Mars month <span className="sr-hint">· tap a month, or use the arrow keys</span></p>
        <div className="sr-year" role="radiogroup" aria-labelledby={`${ids}-month`}>
          {year.map((lvl, i) => {
            const m = i + 1
            return (
              <button
                key={m}
                type="button"
                role="radio"
                aria-checked={m === month}
                aria-label={`Month ${m}, Ls ${i * 30} to ${m * 30} degrees, ${site.lat >= 0 ? 'northern' : 'southern'} ${season(m, r.hemi).toLowerCase()}: ${LEVEL[lvl]} risk`}
                tabIndex={m === month ? 0 : -1}
                className={`sr-m sr-${lvl}`}
                onClick={() => setMonth(m)}
                onKeyDown={(e) => arrowNav(e, 12, month - 1, (k) => setMonth(k + 1))}
              >
                <span className="sr-m-n">{m}</span>
                {FEATURED.some((g) => g.Ls >= i * 30 && g.Ls < m * 30) && <i className="sr-m-global" aria-hidden="true" />}
              </button>
            )
          })}
        </div>
        <div className="sr-axis" aria-hidden="true">
          <span>Ls 0°</span><span>90°</span><span>180°</span><span>270°</span><span>360°</span>
        </div>
        <ul className="sr-key" aria-hidden="true">
          <li><i className="sr-low" />Low</li>
          <li><i className="sr-moderate" />Moderate</li>
          <li><i className="sr-high" />High</li>
          <li><i className="sr-key-global" />A global storm began</li>
        </ul>
      </div>

      <div className="sr-cards">
        <section className="sr-card sr-verdict" aria-live="polite" aria-labelledby={`${ids}-v`}>
          <h3 className="micro" id={`${ids}-v`}>Historical risk · month {month} ({season(month, r.hemi).toLowerCase()} at {site.name})</h3>
          <p className="sr-level">
            <span className="sr-meter" aria-hidden="true"><i /><i /><i /></span>
            {LEVEL[r.level]}
          </p>
          <p className="sr-why">{r.why} <Source k={MDAD.source} badge="nasa" /></p>
        </section>

        <section className="sr-card" aria-labelledby={`${ids}-c`}>
          <h3 className="micro" id={`${ids}-c`}>Storms seen near {site.name}</h3>
          {n === null
            ? <p><NeedData>The catalog holds {MDAD.total.toLocaleString('en-US')} storms ({MDAD.span}), but counts near each site have not been added yet.</NeedData></p>
            : <p className="sr-count"><b>{n.toLocaleString('en-US')}</b> of {MDAD.total.toLocaleString('en-US')} cataloged storms, in this month <Source k={MDAD.source} badge="nasa" /></p>}
        </section>

        <section className="sr-card" aria-labelledby={`${ids}-g`}>
          <h3 className="micro" id={`${ids}-g`}>The 2001 and 2018 global storms</h3>
          <ol className="sr-events">
            {FEATURED.map((g) => {
              const ev = SITE_EVENTS[g.year]?.[site.id] ?? SITE_EVENTS[g.year]?.all ?? null
              const inMonth = g.Ls >= r.a0 && g.Ls < r.a1
              return (
                <li key={g.year}>
                  <p className="sr-ev-head">
                    <b>{g.year}</b> · began near Ls {g.Ls}°{inMonth ? ', in this month' : ''} <Source k={g.source} badge="nasa" />
                  </p>
                  {ev ? <p>{ev.text} <Source k={ev.source} badge="nasa" /></p> : <p><NeedData>What this storm did at {site.name} has not been sourced yet.</NeedData></p>}
                </li>
              )
            })}
          </ol>
        </section>
      </div>

      <p className="sr-disclaimer">{STORM_DISCLAIMER}</p>

      <details className="sr-how">
        <summary>How to read this</summary>
        <ul>
          <li>Each box is one Mars month: 30° of the planet's orbit (Ls), starting at the northern spring equinox.</li>
          <li><b>High</b>: the month is in the main storm season (Ls {MDAD.main.join('–')}°) and a global storm began within 15° of it. <b>Moderate</b>: main season, or this hemisphere's secondary season. <b>Low</b>: neither.</li>
          <li>A dot marks the month a global storm began.</li>
          <li>"Data needed" means there is no verified number yet. It is never filled with a guess.</li>
        </ul>
      </details>
    </div>
  )
}
