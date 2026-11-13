import { dustOutlook } from '../../content/dustHistory.js'
import { useCallback, useMemo } from 'react'
import { Link } from 'react-router'
import { Badge, HonestyDot, Pop, Source, Slider, Verdict } from '../Atoms.jsx'
import { DATA } from '../../content/sources.js'
import { WALK } from '../../data/index.js'
import { ICE_NOTE } from '../../content/layers.js'
import { ADVISOR_LABEL } from '../../lib/advisor.js'
import { fmtH, pct } from '../../compute/walk.js'
import { fmtHours } from '../../lib/mars24.js'
import { startWindow } from '../../lib/startWindow.js'
import { useCountUp } from '../../lib/hooks.js'
import { SbDisclosure } from '../Sidebar.jsx'

const dataById = Object.fromEntries(DATA.map((d) => [d.id, d]))

/* ---------------- layers ---------------- */
export function LayerPanel({ groups, state, onToggle, onOpacity, iceNote = ICE_NOTE }) {
  return (
    <div className="lp">
      {groups.map((g) => (
        <section key={g.id} className="lp-group" aria-labelledby={`lp-${g.id}`}>
          <h3 id={`lp-${g.id}`} className="micro">{g.name}</h3>
          {g.layers.map((l) => {
            const st = state[l.id]
            const src = dataById[l.source]
            return (
              <div key={l.id} className={`lp-row ${st.on ? 'on' : ''}`}>
                <div className="lp-line">
                  <label className="lp-toggle">
                    <input type="checkbox" checked={st.on} onChange={(e) => onToggle(l.id, e.target.checked)} />
                    <span className="lp-switch" aria-hidden="true" />
                    <span className="lp-text">
                      <span className="lp-name"><HonestyDot kind={l.badge} />{l.name}</span>
                      <span className="lp-meta-line">{l.instrument} · {l.res}</span>
                    </span>
                  </label>
                  <Pop label={`About ${l.name}`} icon="i">
                    <b>{l.name}.</b> {l.plain}.<br />
                    {l.mission} · {l.instrument} · {l.res}
                    {src && <><br />{src.product}. {src.by}. {src.licence}.</>}
                    <span className="pop-badge" style={{ marginTop: 8 }}><Badge kind={l.badge} /></span>
                  </Pop>
                </div>
                {st.on && l.kind !== 'stops' && l.kind !== 'radius' && (
                  <input className="lp-opacity" type="range" min="0" max="1" step="0.05" value={st.opacity} style={{ '--pct': `${st.opacity * 100}%` }} aria-label={`${l.name} opacity`} onChange={(e) => onOpacity(l.id, Number(e.target.value))} />
                )}
              </div>
            )
          })}
        </section>
      ))}
      {iceNote && (
        <section className="lp-group">
          <h3 className="micro">Water and ice</h3>
          <p className="lp-note">{iceNote}</p>
        </section>
      )}
    </div>
  )
}

/* ---------------- verdict ---------------- */
function Count({ value, format }) {
  const ref = useCountUp(value, format)
  return <span ref={ref}>{format(value)}</span>
}
const f1 = (x) => x.toFixed(1)
const f0 = (x) => Math.round(x).toLocaleString()
const fp = (x) => `${Math.round(x * 100)}`

/** Space weather now: the Sun's last week from NASA DONKI (NOAA GOES protons as a backup), and how
 *  far around the Sun Mars sits from Earth, since both feeds are measured on Earth's side. */
export function SpaceWeatherPanel({ weather: w }) {
  const fmtDay = (ms) => new Date(ms).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
  const checked = w.checkedAt ? new Date(w.checkedAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }) : null
  const label = !w.known ? (w.loading ? 'Checking…' : 'No reading') : w.storm ? 'Particle storm' : w.level === 'active' ? 'Active Sun' : 'Quiet'
  const side = w.apart < 60 ? 'on the same side of the Sun as Earth, so Earth-side readings are a fair guide' : w.apart > 120 ? 'nearly behind the Sun from Earth, so a storm could reach Mars without Earth seeing it' : 'well around the Sun from Earth, so Earth-side readings are only a rough guide'
  return (
    <section className={`swx swx-${w.known ? w.level : 'unknown'}`} aria-labelledby="swx-title">
      <div className="sw-head">
        <h3 id="swx-title">Space weather now</h3>
        <span className="swx-pill">{label}</span>
      </div>
      {w.known ? (
        <ul className="swx-list">
          {w.flares !== null && (
            <li>
              <span>Solar flares, last 7 days</span>
              <b>{w.flares}{w.strongest ? ` · strongest ${w.strongest.cls}, ${fmtDay(w.strongest.at)}` : ''}</b>
            </li>
          )}
          {w.seps !== null && <li><span>Solar particle events, last 7 days</span><b>{w.seps}</b></li>}
          {w.flux !== null && <li><span>Fast protons at Earth now (≥10 MeV)</span><b>{w.flux < 1 ? w.flux.toFixed(2) : w.flux.toFixed(1)} pfu</b></li>}
        </ul>
      ) : (
        <p className="sw-say">{w.loading ? 'Asking NASA’s space weather database…' : 'Could not reach NASA’s space weather database. Check again before the hatch opens.'}</p>
      )}
      <p className="sw-say">
        Mars is {Math.round(w.apart)}° around the Sun from Earth: {side}.
        {' '}<Source k="meeus" note="Angle between Earth and Mars as seen from the Sun, from Mars24 and Meeus orbit formulas." badge="derived" />
      </p>
      <p className={`swx-advice ${w.storm ? 'warn' : ''}`}>
        {w.storm
          ? 'A solar particle storm is under way. Postpone long walks and stay within reach of shelter until it ends.'
          : w.known ? 'No particle storm reported. Walk as planned, and check again before the hatch opens.' : 'Treat space weather as unknown: keep the walk short and close to shelter.'}
      </p>
      <p className="swx-src">
        {w.known ? `Checked ${checked}${w.stale ? ' (saved copy)' : ''} · ` : ''}
        {w.donki ? 'NASA DONKI' : w.flux !== null ? 'NOAA GOES (NASA DONKI unreachable)' : 'NASA DONKI'}
        {' '}<Source k="donki" badge="nasa" />
      </p>
    </section>
  )
}

/** When to leave: the start times that keep the sun above the safe limit for this whole walk,
 *  and the one with the kindest light. Worked out from the same Mars24 sun model as the verdict. */
export function StartWindowPanel({ analysis: a, settings: s, site, dateMs, onApply }) {
  const w = useMemo(
    () => (a ? startWindow({ dateMs, lat: site.lat, lon: site.lon, hours: a.hours, minSun: s.minSun, from: WALK.startHour.min, to: WALK.startHour.max, step: WALK.startHour.step }) : null),
    [a, dateMs, site.lat, site.lon, s.minSun],
  )
  if (!a) return null
  const now = s.startHour
  const inside = w && now >= w.earliest - 1e-6 && now <= w.latest + 1e-6
  return (
    <section className="sw" aria-labelledby="sw-title">
      <div className="sw-head">
        <h3 id="sw-title">Best time to leave</h3>
        <Source k="mars24" note="Sun height along the walk from NASA GISS's Mars24 algorithm, for this sol and place." badge="derived" />
      </div>
      {w ? (
        <>
          <p className="sw-range">
            <b>{fmtHours(w.earliest)}</b>
            <span aria-hidden="true">–</span>
            <b>{fmtHours(w.latest)}</b>
            <small>Mars time</small>
          </p>
          <p className="sw-say">
            Leave in this window and the sun stays above {s.minSun}° for the whole {fmtH(a.hours)} walk.
            {' '}
            {inside ? `Your start, ${fmtHours(now)}, is inside it.` : `Your start, ${fmtHours(now)}, is outside it.`}
          </p>
          {Math.abs(w.best - now) > 1e-6 ? (
            <button type="button" className="btn btn-small sw-apply" onClick={() => onApply(w.best)}>
              Leave at {fmtHours(w.best)}, sun never below {Math.floor(w.bestMin)}°
            </button>
          ) : (
            <p className="sw-best">You already leave at the time with the highest sun.</p>
          )}
        </>
      ) : (
        <p className="sw-say">
          No start time on this sol keeps the sun above {s.minSun}° for the whole {fmtH(a.hours)} walk. Make the walk shorter, or lower the sun limit in Settings.
        </p>
      )}
    </section>
  )
}

export function VerdictPanel({ analysis: a, settings: s, busy, onFix, onEmergency, visitedCount, snap }) {
  if (!a) {
    return (
      <div className="vp vp-empty">
        <p className="vp-empty-title">Plan a walk on Mars</p>
        <ol className="vp-steps">
          <li><b>Press “Suggest a safe walk”.</b> We find a safe path to real rock-sample sites.</li>
          <li><b>Read the answer.</b> GO means safe. The reasons are listed in plain words.</li>
          <li><b>Fly along in 3D</b>, or save the plan.</li>
        </ol>
      </div>
    )
  }
  const shown = a.reasons.filter((r) => r.level !== 'note').slice(0, 3)
  const notes = a.reasons.filter((r) => r.level === 'note')
  const airBar = Math.min(1, a.airUsed)
  const turnPct = a.turnBack.atEnd ? null : a.turnBack.d / a.distance
  return (
    <div className={`vp vp-${a.status} ${busy ? 'busy' : ''}`} aria-live="polite">
      <div className="vp-head">
        <Verdict status={a.status} size="l" />
        <p className="vp-plain">{a.status === 'go' ? 'This walk looks safe.' : a.status === 'caution' ? 'Possible, but be careful.' : 'Do not go on this walk.'}</p>
      </div>
      {shown.length > 0 ? (
        <ul className="vp-reasons">
          {shown.map((r) => (
            <li key={r.code} className={`vp-reason vp-${r.level}`}>
              <b>{r.title}</b>
              <span>{r.code === 'steep' && snap ? `Even the safest path reaches ${a.maxSlope.toFixed(0)}° here, so the point you chose sits on steep ground. Move it a little, or stop short of it.` : r.detail}</span>
              <span className="vp-reason-actions">
                {r.code === 'steep' && !snap && <button type="button" className="btn btn-small" onClick={() => onFix('snap')}>Fix it: go around the steep part</button>}
                {r.code === 'air' && <button type="button" className="btn btn-small" onClick={() => onFix('trim')}>Fix it: make the walk shorter</button>}
                {r.code === 'dark' && <button type="button" className="btn btn-small" onClick={() => onFix('early')}>Fix it: leave earlier</button>}
                {r.protocol && <button type="button" className="vp-proto" onClick={() => onEmergency(r.protocol === 'power' ? 'dark' : 'suit')}>What if it goes wrong?</button>}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <ul className="vp-good">
          {a.good.map((g) => <li key={g}>{g}</li>)}
        </ul>
      )}

      <div className="vp-air">
        <div className="vp-air-top">
          <span className="micro">Suit air used</span>
          <span className="mono"><Count value={a.airUsed} format={fp} />% of {s.suitHours} h</span>
        </div>
        <div className="vp-bar" role="img" aria-label={`Uses ${pct(a.airUsed)} of suit air. Allowed ${pct(a.budget)}; reserve ${s.reserve}%.`}>
          <span className="vp-bar-fill" style={{ width: `${airBar * 100}%` }} />
          <span className="vp-bar-reserve" style={{ left: `${a.budget * 100}%` }} />
        </div>
        <div className="vp-air-legend micro">
          <span>0</span>
          <span style={{ left: `${a.budget * 100}%` }} className="vp-res-label">reserve {s.reserve}%</span>
        </div>
        <p className="vp-turn">
          <i className="vp-turn-dot" aria-hidden="true" />
          {a.turnBack.atEnd
            ? <>Turn around at the end of the route, <b>{(a.distance / 1000).toFixed(1)} km</b> from {a.drive ? 'the rover' : 'home'}.</>
            : <>You must turn around after <b>{(a.turnBack.d / 1000).toFixed(1)} km</b> ({Math.round(turnPct * 100)}% of the way) to keep your safety reserve.</>}
          <Source note="Turn-back point: the furthest point where the air you have used plus the air to walk home the same way still leaves your reserve untouched. Air use rises when climbing (setting: extra air when climbing)." badge="derived" />
        </p>
      </div>

      <dl className="vp-stats vp-key">
        <div><dt>Walk</dt><dd><Count value={a.tripDistance / 1000} format={f1} /><small>km</small></dd></div>
        <div><dt>Time outside</dt><dd>{fmtH(a.hours)}</dd></div>
        <div><dt>{a.drive ? 'Air left at the rover' : 'Air left at home'}</dt><dd className={a.airLeft < 1 - a.budget ? 'v-nogo' : ''}>{a.airLeft > 0 ? pct(a.airLeft) : 'none'}</dd></div>
        <div><dt>Home by</dt><dd>{fmtHours(a.sun.end.ltst)}<small>Mars time</small></dd></div>
      </dl>

      <details className="vp-more">
        <summary>More details</summary>
        <dl className="vp-stats">
          <div><dt className="micro">Steepest ground</dt><dd className={a.maxSlope > s.redSlope ? 'v-nogo' : a.maxSlope > s.greenSlope ? 'v-caution' : ''}><Count value={a.maxSlope} format={f0} /><small>°</small></dd><span className="vp-sub">your limit {s.redSlope}° <Badge kind="derived" /></span></div>
          <div><dt className="micro">Climb</dt><dd>↑<Count value={a.gain} format={f0} /><small>m</small></dd><span className="vp-sub">↓{Math.round(a.loss)} m on the way out</span></div>
          <div><dt className="micro">Sun height</dt><dd>{a.sun.start.elevation.toFixed(0)}°<small>→ {a.sun.end.elevation.toFixed(0)}°</small></dd><span className="vp-sub">leave {fmtHours(a.sun.start.ltst)} <Source k="mars24" note="Sun height from NASA GISS's Mars24 algorithm for this day and place." badge="derived" /></span></div>
          <div><dt className="micro">Radiation</dt><dd>{a.dose.toFixed(2)}<small>mSv</small></dd><span className="vp-sub">about {Math.max(1, Math.round(a.dose / 0.1))} chest X-ray <Source k="rad" note="0.64 mSv per day measured by Curiosity's RAD at Gale Crater, applied to the hours outside." badge="nasa" /></span></div>
          <div><dt className="micro">{a.drive ? 'Farthest from the rover' : 'Farthest from home'}</dt><dd className={a.farthest > s.walkBack * 1000 ? 'v-caution' : ''}>{(a.farthest / 1000).toFixed(1)}<small>km</small></dd><span className="vp-sub">safe circle {s.walkBack} km</span></div>
          {a.crew?.length > 1 && <div><dt className="micro">Air used, each suit</dt><dd>{a.crew.map((c) => pct(c.air)).join(' · ')}</dd><span className="vp-sub">{a.crew.map((c) => `${c.who.toLowerCase()} ${c.load} kg`).join(', ')} <Source k="spacewalks" note="Two astronauts walk together. The suit that uses air fastest decides when both turn back." badge="illustrative" /></span></div>}
          {a.drive && <div><dt className="micro">Rover drive</dt><dd>{(a.drive.m / 1000).toFixed(1)}<small>km each way</small></dd><span className="vp-sub">{fmtH(a.drive.hours)} each way <Source k="lrv" note="Driving time at your rover speed setting along the planner's safe path. Apollo 15 drove its Moon rover 27.8 km in about 3 hours." badge="illustrative" /></span></div>}
        </dl>
        {notes.length > 0 && (
          <ul className="vp-notes">
            {notes.map((r) => <li key={r.code}><b>{r.title}.</b> {r.detail}</li>)}
          </ul>
        )}
      </details>
      {visitedCount > 0 && <p className="vp-science micro">Science stops on this walk: <b>{visitedCount}</b></p>}
    </div>
  )
}

/* ---------------- science ---------------- */
export function SciencePanel({ stops, visited, onAdd, onFocus, score, focus }) {
  return (
    <div className="sp">
      <div className="sp-score">
        <div>
          <p className="micro">Science value of this walk</p>
          <p className="sp-score-num"><b>{score.got}</b><span>/ {score.total}</span></p>
        </div>
        <details className="sp-score-more"><summary>How is this scored?</summary><p className="sp-score-note">Each stop has a science priority from 1 to 5 (our judgement, explained on each card). Safer walks reach fewer stops. That trade-off is the point.</p></details>
      </div>
      <ol className="sp-list">
        {stops.map((s) => {
          const on = visited.includes(s.id)
          return (
            <li key={s.id} className={`sp-card ${on ? 'on' : ''} ${focus === s.id ? 'focus' : ''}`}>
              <button type="button" className="sp-head" onClick={() => onFocus(s.id)} aria-expanded={focus === s.id}>
                <span className="sp-name">{s.name}</span>
                <span className="sp-value" aria-label={`Priority ${s.value} of 5`}>{'●'.repeat(s.value)}<span>{'●'.repeat(5 - s.value)}</span></span>
              </button>
              <p className="micro sp-region">{s.region}</p>
              {focus === s.id && (
                <div className="sp-body">
                  <p><b>What:</b> {s.what}</p>
                  <p><b>Why it matters:</b> {s.why}</p>
                  <p className="sp-evidence"><Badge kind="nasa" /> {s.evidence}</p>
                  <p><b>Bring:</b> {s.bring} · <b>Time:</b> {s.minutes} min</p>
                </div>
              )}
              <button type="button" className={`btn btn-small sp-add ${on ? 'on' : ''}`} onClick={() => onAdd(s.id, !on)}>{on ? 'On the walk ✓' : 'Add to walk'}</button>
            </li>
          )
        })}
      </ol>
    </div>
  )
}

/* ---------------- advisor ---------------- */
export function AdvisorPanel({ tips, onAction }) {
  return (
    <div className="ap">
      <p className="ap-label micro"><i aria-hidden="true" />{ADVISOR_LABEL}</p>
      {tips.length === 0 && <p className="ap-empty">Plan a walk to get advice.</p>}
      <ol className="ap-list">
        {tips.map((t) => (
          <li key={t.id}>
            <p>{t.text}</p>
            <p className="micro ap-rule">Rule: {t.rule}</p>
            {t.action === 'snap' && <button type="button" className="btn btn-small" onClick={() => onAction('snap')}>Do it</button>}
            {t.stop && <button type="button" className="btn btn-small" onClick={() => onAction('add', t.stop)}>Add stop</button>}
          </li>
        ))}
      </ol>
    </div>
  )
}

/* ---------------- settings ---------------- */
export function SettingsPanel({ settings, onChange, date, onDate, sol, snap, onSnap }) {
  const set = useCallback((k) => (v) => onChange({ ...settings, [k]: v }), [settings, onChange])
  return (
    <div className="stp">
      <label className="stp-snap">
        <input type="checkbox" checked={snap} onChange={(e) => onSnap(e.target.checked)} />
        <span><b>Go around steep ground</b> when I draw my own walk</span>
      </label>
      <div className="stp-date">
        <label htmlFor="walk-date">Walk date (Earth calendar)</label>
        <input id="walk-date" type="date" value={date} min="2026-01-01" max="2035-12-31" onChange={(e) => e.target.value && onDate(e.target.value)} />
        <p className="micro">Mars day {sol.sol.toLocaleString()}{sol.Ls >= 180 ? ' · dust storm season' : ''}</p>
        {(() => { const d = dustOutlook(sol.Ls); return <p className="micro" role="note"><b>Dust history: {d.level[0].toUpperCase() + d.level.slice(1)}.</b> {d.why} {d.disclaimer}</p> })()}
      </div>
      {Object.entries(WALK).map(([k, w]) => (
        <Slider compact key={k} id={`set-${k}`} label={w.label} value={settings[k]} min={w.min} max={w.max} step={w.step} unit={k === 'startHour' ? '' : w.unit} badge={w.badge} note={w.note} format={k === 'startHour' ? fmtHours : undefined} onChange={set(k)} />
      ))}
    </div>
  )
}

/* ---------------- manual ---------------- */
export function ManualPanel({ items }) {
  return (
    <div className="mp">
      {items.map((m, i) => (
        <SbDisclosure key={m.title} title={m.title} defaultOpen={i === 0}>
          {m.body.map((b) => <p key={b}>{b}</p>)}
        </SbDisclosure>
      ))}
      <p className="mp-more">Every dataset, method and limit: <Link to="/sources">Data &amp; sources</Link></p>
    </div>
  )
}
