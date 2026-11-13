// Base-planning calculators, shared by the survival guide and the Base calculator page.
// Every assumption is a visible, editable slider with its honesty label.
import { useMemo, useState } from 'react'
import { BASE, SHELTERS } from '../../content/habitat.js'
import { Badge, Slider, Source } from '../Atoms.jsx'
import './base.css'

const val = (k, v) => ({ compact: true, id: `base-${k}`, label: BASE[k].label, min: BASE[k].min, max: BASE[k].max, step: BASE[k].step, unit: BASE[k].unit, badge: BASE[k].badge, note: BASE[k].note, value: v })

export function useBase() {
  const [b, setB] = useState(() => Object.fromEntries(Object.entries(BASE).map(([k, v]) => [k, v.value])))
  const set = (k) => (v) => setB((x) => ({ ...x, [k]: v }))
  return [b, set]
}

export function OxygenCalc({ b, set, compact }) {
  const need = b.crew * b.o2 // kg/day
  const perUnit = (b.moxie * 24.66) / 1000 // kg per sol, running every hour of the sol
  const units = Math.ceil(need / perUnit)
  const reserve7 = need * 7
  return (
    <div className="calc">
      <div className="calc-controls">
        <Slider {...val('crew', b.crew)} onChange={set('crew')} />
        {!compact && <Slider {...val('o2', b.o2)} onChange={set('o2')} />}
        {!compact && <Slider {...val('moxie', b.moxie)} onChange={set('moxie')} />}
      </div>
      <div className="calc-out">
        <div className="big"><span className="micro">Crew breathes</span><b>{need.toFixed(1)}</b><small>kg O₂ per sol</small></div>
        <div className="big"><span className="micro">MOXIE-size units needed</span><b>{units}</b><small>running non-stop <Badge kind="derived" /></small></div>
        <div className="big"><span className="micro">7-sol reserve to store</span><b>{reserve7.toFixed(0)}</b><small>kg O₂</small></div>
        <div className="calc-units" aria-hidden="true">{Array.from({ length: Math.min(units, 120) }, (_, i) => <i key={i} />)}</div>
        <p className="calc-note">MOXIE was a toaster-sized test. These units are a thought experiment to show the scale: a real base would need a far bigger plant. <Source k="moxie" badge="nasa" /></p>
      </div>
    </div>
  )
}

export function FarmCalc({ b, set }) {
  const [node, setNode] = useState('hydro')
  const kcal = b.crew * b.kcal
  const target = Math.ceil(kcal / b.yield)
  const share = Math.min(999, Math.round(((b.farmArea * b.yield) / kcal) * 100))
  const water = b.farmArea * b.farmWater
  const makeup = b.crew * b.water * (1 - b.recycle / 100)
  const ice = makeup / (b.iceShare / 100)
  const NODES = {
    water: ['Water', `${makeup.toFixed(0)} L of new water per sol after recycling ${b.recycle}%. Everything else is cleaned and reused.`],
    nutrients: ['Nutrients', 'Minerals are dissolved into the water. Soil is not used, because Mars soil carries toxic perchlorate.'],
    hydro: ['Hydroponics', `Plants grow with roots in water under lamps. Beds need about ${water.toFixed(0)} L of water a day (most of it is recycled).`],
    food: ['Food', `The beds make about ${share}% of the crew's ${kcal.toLocaleString()} kcal a day. Stored food covers the rest.`],
    crew: ['Crew', `${b.crew} people. Fresh food helps mood as much as diet on long missions.`],
  }
  return (
    <div className="calc">
      <div className="calc-controls">
        <Slider {...val('crew', b.crew)} onChange={set('crew')} />
        <Slider {...val('farmArea', b.farmArea)} onChange={set('farmArea')} />
        <Slider {...val('yield', b.yield)} onChange={set('yield')} />
        <Slider {...val('recycle', b.recycle)} onChange={set('recycle')} />
        <Slider {...val('iceShare', b.iceShare)} onChange={set('iceShare')} />
      </div>
      <div className="calc-out">
        <ol className="flow" aria-label="How food is grown">
          {Object.entries(NODES).map(([k, [name]], i) => (
            <li key={k}>
              {i > 0 && <span className="flow-arrow" aria-hidden="true" />}
              <button type="button" className={node === k ? 'on' : ''} aria-pressed={node === k} onClick={() => setNode(k)}>{name}</button>
            </li>
          ))}
        </ol>
        <p className="flow-text" aria-live="polite">{NODES[node][1]}</p>
        <div className="calc-row">
          <div className="big"><span className="micro">Food grown</span><b className={share < 100 ? 'v-caution' : 'v-go'}>{share}%</b><small>of daily need</small></div>
          <div className="big"><span className="micro">Area for 100%</span><b>{target.toLocaleString()}</b><small>m² of beds</small></div>
          <div className="big"><span className="micro">Ice ground to dig</span><b>{Math.round(ice).toLocaleString()}</b><small>kg per sol <Badge kind="illustrative" /></small></div>
        </div>
        <p className="calc-warn">Perchlorate: <b>untreated</b>. Mars soil must be tested and cleaned before it can grow anything. <Source k="perchlorate" badge="nasa" /></p>
      </div>
    </div>
  )
}

export function ShelterCalc({ b, set }) {
  const [kind, setKind] = useState('buried')
  const depth = b.cover
  const y = 46 + depth * 18
  return (
    <div className="calc">
      <div className="calc-controls">
        <div className="seg" role="radiogroup" aria-label="Shelter type">
          {SHELTERS.map((s) => <button key={s.id} type="button" role="radio" aria-checked={kind === s.id} onClick={() => setKind(s.id)}>{s.name}</button>)}
        </div>
        <p className="calc-note">{SHELTERS.find((s) => s.id === kind).line}</p>
        {kind === 'buried' && <Slider {...val('cover', b.cover)} onChange={set('cover')} />}
      </div>
      <div className="calc-out">
        <svg className="section" viewBox="0 0 420 220" role="img" aria-label={kind === 'buried' ? `Habitat buried under ${depth} metres of soil` : 'Habitat inside a hypothetical lava tube'}>
          <defs>
            <linearGradient id="soil" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#6e2f17" /><stop offset="1" stopColor="#2a130b" /></linearGradient>
          </defs>
          <rect width="420" height="46" fill="#050505" />
          {Array.from({ length: 14 }, (_, i) => <line key={i} x1={20 + i * 29} x2={10 + i * 29} y1="4" y2="38" stroke="#7fb0ff" strokeOpacity=".22" />)}
          <text x="12" y="20" className="sec-label">space radiation</text>
          <rect y="46" width="420" height="174" fill="url(#soil)" />
          {kind === 'tube' ? (
            <>
              <ellipse cx="220" cy="150" rx="170" ry="44" fill="#120804" stroke="#e3895a" strokeDasharray="5 5" />
              <rect x="140" y="140" width="160" height="30" rx="6" fill="#0b1830" stroke="#7fb0ff" />
              <text x="160" y="160" className="sec-text">habitat</text>
              <text x="150" y="98" className="sec-warn">hypothetical lava tube</text>
            </>
          ) : (
            <>
              <rect x="110" y="46" width="210" height={y - 46} fill="#8c4a2a" opacity=".55" />
              <line x1="110" x2="320" y1={y} y2={y} stroke="#e3895a" strokeDasharray="4 4" />
              <text x="328" y={46 + (y - 46) / 2 + 4} className="sec-text">{depth} m soil</text>
              <rect x="110" y={y} width="210" height="38" rx="6" fill="#0b1830" stroke="#7fb0ff" />
              <rect x="82" y={y} width="28" height="38" fill="#0b1830" stroke="#7fb0ff" opacity=".7" />
              <text x="130" y={y + 23} className="sec-text">crew living area</text>
              <text x="84" y={y + 52} className="sec-small">airlock</text>
            </>
          )}
        </svg>
        <p className="calc-note">Rock and soil over your head block radiation. How much depends on the material; we show depth only and do not invent a reduction number. Digging and holding up soil safely is the hard part.</p>
      </div>
    </div>
  )
}

export function useBaseTotals(b) {
  return useMemo(() => {
    const o2 = b.crew * b.o2
    const water = b.crew * b.water * (1 - b.recycle / 100)
    const kcal = b.crew * b.kcal
    return { o2, water, kcal, farmShare: (b.farmArea * b.yield) / kcal }
  }, [b])
}
