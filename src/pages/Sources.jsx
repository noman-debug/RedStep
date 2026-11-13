import { useEffect, useState } from 'react'
import { Badge } from '../components/Atoms.jsx'
import { BADGES } from '../content/site.js'
import { DATA, FACT_SOURCES } from '../content/sources.js'
import { WALK, SITES, backtest, dataSource, sitePanoramas } from '../data/index.js'
import { BASE } from '../content/habitat.js'
import { NASA_TOOLS } from '../content/nasaTools.js'
import './page.css'

const groups = [...new Set(DATA.map((d) => d.group))]

export default function Sources() {
  return (
    <div className="page">
      <header className="page-head">
        <h1>Where every number <em>comes from.</em></h1>
        <p className="page-lead">Nothing about Mars here is live telemetry: maps and measurements come from NASA missions and are bundled with the app. The one live feed is space weather, measured near Earth. After your first visit, the walk planner and its Jezero data are saved in your browser, so they keep working without a connection; Gale and world-map close-ups are saved as you open them. We label every number with one of three tags:</p>
        <p className="src-data-source">Data source in use: <b>{dataSource.label}</b>.</p>
        <ul className="badge-key">
          {Object.entries(BADGES).map(([k, b]) => <li key={k}><Badge kind={k} /> <span>{b.long}</span></li>)}
        </ul>
      </header>

      {groups.map((g) => (
        <section key={g} className="src-group">
          <h2 className="micro">{g}</h2>
          <div className="src-table" role="table" aria-label={`${g} data`}>
            <div className="src-row src-th" role="row">
              <span role="columnheader">What it shows</span>
              <span role="columnheader">Mission · instrument</span>
              <span role="columnheader">Detail</span>
              <span role="columnheader">Product · licence</span>
            </div>
            {DATA.filter((d) => d.group === g).map((d) => (
              <div key={d.id} className="src-row" role="row">
                <span role="cell"><b>{d.name}</b><small>{d.plain}</small></span>
                <span role="cell">{d.mission}<small>{d.instrument}</small></span>
                <span role="cell" className="mono">{d.resolution}</span>
                <span role="cell"><a href={d.url} target="_blank" rel="noreferrer">{d.product} ↗</a><small>{d.by} · {d.licence}</small></span>
              </div>
            ))}
          </div>
        </section>
      ))}

      <section className="src-group">
        <h2 className="micro">Street view panoramas <Badge kind="nasa" /></h2>
        <ul className="src-facts">
          {SITES.flatMap((st) => sitePanoramas(st.id)).map((p) => (
            <li key={p.id}><a href={p.page} target="_blank" rel="noreferrer">{p.pia}: {p.title} ↗</a> · {p.rover} {p.instrument}, sol {p.sol} ({p.date}) · {p.credit}</li>
          ))}
        </ul>
        <p className="src-method-note">Shrunk to 6,000 px wide for the web by <code>scripts/bake-panoramas.mjs</code>. Rover positions from JPL MMGIS waypoints. Places without a rover panorama get a Demo view from orbit, labelled as not rover photos.</p>
      </section>

      <section className="src-group">
        <h2 className="micro">Explore further with NASA tools</h2>
        <ul className="src-facts">
          {Object.values(NASA_TOOLS).map((t) => <li key={t.url}><a href={t.url} target="_blank" rel="noreferrer">{t.name} ↗</a> {t.what}</li>)}
        </ul>
      </section>

      <section className="src-group">
        <h2 className="micro">Facts and methods</h2>
        <ul className="src-facts">
          {Object.entries(FACT_SOURCES).map(([k, f]) => <li key={k}><a href={f.url} target="_blank" rel="noreferrer">{f.title} ↗</a></li>)}
        </ul>
      </section>

      <section className="src-group">
        <h2 className="micro">What we calculate ourselves <Badge kind="derived" /></h2>
        <ul className="src-methods">
          <li><b>Steepness</b> using Horn&rsquo;s 3&times;3 method on a 40 m grid: at Jezero from the USGS CTX height map (20 m, averaged 2&times;2); at Gale from the USGS HiRISE height map (1 m, read from its 8 m overview and averaged 5&times;5). Gale heights agree with Curiosity&rsquo;s own logged heights within a few metres along its whole drive (checked in our tests).</li>
          <li><b>Rocky ground</b>: the fine-scale texture of the HiRISE photo (how much each pixel differs from a blurred copy), averaged per grid cell. Rough-looking cells cost more in the route search and show on the Rocky ground layer. A texture guess, not a boulder count.</li>
          <li><b>Safe paths</b> by searching the grid (A* and Dijkstra, 8 directions, no corner cutting). Ground above your &ldquo;too steep&rdquo; limit is blocked; amber ground and loose ground (dark in THEMIS night infrared) cost more.</li>
          <li><b>Walking time</b> from Tobler&rsquo;s hiking rule, scaled so flat ground matches your walking speed.</li>
          <li><b>Suit air</b>: hours of air at normal effort, used faster when climbing and when carrying gear (in proportion to the total mass moved, after Pandolf et al. 1977). With two astronauts, the suit carrying most sets the plan for both. The turn-back point is the last place where air used plus air to walk home the same way still leaves your reserve.</li>
          <li><b>Rover drop-off</b>: the drive follows the same safe-path search; drive time is distance over your rover speed. The walk-back circle moves to the rover.</li>
          <li><b>Space weather</b>: solar flares and particle events from NASA DONKI, with the NOAA GOES proton count as a fallback. A particle storm (10 pfu or more at 10 MeV, or an event in the last 3 days) means postpone. These are measured near Earth; the card says how far around the Sun Mars is.</li>
          <li><b>Sun height</b> with NASA GISS&rsquo;s Mars24 algorithm, checked against both worked examples on the Mars24 page.</li>
          <li><b>Earth delay</b> from the planets&rsquo; positions (Mars24 + Meeus), checked against the January 2025 close approach (0.642 AU).</li>
          <li><b>Radiation</b>: hours outside times Curiosity RAD&rsquo;s 0.64 mSv per day.</li>
          <li><b>Map projection</b>: the map draws in Web Mercator; all distances use Mars&rsquo;s radius. 3D heights are scaled so 1&times; is true to scale, then shown at 2&times;.</li>
        </ul>
      </section>

      <Backtest />

      <section className="src-group">
        <h2 className="micro">Assumptions you can change <Badge kind="illustrative" /></h2>
        <div className="src-assume">
          {[...Object.values(WALK), ...Object.values(BASE).filter((b) => b.badge === 'illustrative')].map((a) => (
            <div key={a.label}><b>{a.label}</b><span className="mono">{a.value} {a.unit}</span>{a.note && <small>{a.note}</small>}</div>
          ))}
        </div>
      </section>

      <section className="src-group">
        <h2 className="micro">Known limits</h2>
        <ul className="src-methods">
          <li>The height map is 40 m per cell. Boulders, small ledges and loose sand are not visible at that scale. A real crew would use HiRISE height maps (1 m) and look at the ground.</li>
          <li>Suit numbers are planning values, not the specification of any real Mars suit.</li>
          <li>Mars weather is not live. Perseverance&rsquo;s MEDA station measures it daily, but this demo does not download it. Space weather is live, but measured near Earth.</li>
          <li>No spectral (mineral) layer yet: the CRISM products on Mars Trek are not served as map tiles.</li>
          <li>Radiation uses Curiosity&rsquo;s Gale Crater average; solar storms can raise it sharply.</li>
          <li>Lava tubes on Mars are unconfirmed. Mars soil needs perchlorate removal before it can grow food.</li>
        </ul>
      </section>
    </div>
  )
}

/** Our rules run along Perseverance's real path (scripts/backtest.mjs → backtest.json). */
function Backtest() {
  const [b, setB] = useState(null)
  useEffect(() => { backtest('jezero').then(setB).catch(() => {}) }, [])
  if (!b) return null
  const st = b.steepness, t = b.tiltCheck, air = b.air
  return (
    <section className="src-group">
      <h2 className="micro">Checking the planner against Perseverance <Badge kind="derived" /></h2>
      <ul className="src-methods">
        <li><b>{st.passesPct}% of Perseverance’s real {st.pathKm} km path passes our steepness rule</b> (ground at or under {b.limits.redSlope}°). {st.pctTooSteep}% is flagged as too steep, in {st.flaggedStretches} stretches, all on the climb from the delta to the crater rim ({st.flagged.map((f) => `sols ${f.sols}`).slice(0, 3).join(', ')}…). A rover can drive slopes a walking crew should avoid, so these flags are expected, not errors.</li>
        <li><b>Our slope from orbit matches the rover’s own measured tilt:</b> at {t.waypoints} rover stops the correlation is {t.correlation}, with a median difference of {t.medianAbsDiff}°. Our 40 m map reads a little flatter than the ground under the rover (median {t.medianOurSlope}° vs {t.medianRoverTilt}°). Where the rover tilted more than {b.limits.redSlope}° ({t.roverTiltOver15} stops), we call {t.weCallTooSteep} too steep and {t.weCallCarefulOrSteep} at least “careful”.</li>
        <li><b>Air budget:</b> each of the {air.drives} logged drives, walked out and back with our default suit ({air.suit.suitHours} h, {air.suit.reservePct}% reserve), fits the usable air ({air.fitPct}%). Single drives are short (longest {air.longestDrive.m} m, sol {air.longestDrive.sol}), so this mainly shows the budget logic runs on real paths.</li>
        <li className="src-method-note">Method: path from NASA JPL MMGIS, sampled every 20 m on the MRO CTX height map (USGS, 20 m averaged to 40 m), default limits. Generated {b.generated} by <code>scripts/backtest.mjs</code>.</li>
      </ul>
    </section>
  )
}
