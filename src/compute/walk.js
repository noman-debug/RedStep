// Analyse one Marswalk: profile, time, suit air, turn-back point, sunlight, radiation, comms,
// and the GO / CAUTION / NO-GO verdict with the reasons that drive it.
// Every assumption comes in through `settings` (see src/content/assumptions.js).
import { distance, elevAt, slopeAt, roughAt, inside } from './grid.js'
import { marsTime, sunAt } from '../lib/mars24.js'
import { earthMars } from '../lib/ephem.js'
import { dustOutlook } from '../content/dustHistory.js'

const STEP_M = 20
const TOBLER_FLAT = Math.exp(-3.5 * 0.05)

/** Tobler's hiking function, scaled so flat ground gives `flat` km/h. grade = rise / run. */
export const pace = (flat, grade) => (flat * Math.exp(-3.5 * Math.abs(grade + 0.05))) / TOBLER_FLAT

/** Extra effort from carried gear: walking cost grows with the total mass moved (Pandolf et al.
 *  1977, first-order term), so air use scales by (you + suit + gear) / (you + suit). */
export const loadFactor = (s) => 1 + Math.max(0, s.load || 0) / Math.max(1, s.suitedMass || 150)

/** Suit air used per hour while walking, as a fraction of a full suit. */
export const airPerHour = (s, grade) => (loadFactor(s) / s.suitHours) * (1 + (s.climbCost / 100) * (Math.max(0, grade) / 0.1))

/** Resample a polyline every STEP_M metres along the ground. */
export function resample(g, line) {
  const out = [{ lon: line[0][0], lat: line[0][1], d: 0, seg: 0 }]
  let d = 0
  for (let k = 0; k < line.length - 1; k++) {
    const a = line[k], b = line[k + 1]
    const L = distance(g, a, b)
    const n = Math.max(1, Math.ceil(L / STEP_M))
    for (let i = 1; i <= n; i++) {
      const t = i / n
      out.push({ lon: a[0] + (b[0] - a[0]) * t, lat: a[1] + (b[1] - a[1]) * t, d: d + L * t, seg: k })
    }
    d += L
  }
  return out
}

/** Walk the samples in order, adding stop time at given sample indices. */
function walkLeg(pts, s, stopAt = new Map()) {
  const n = pts.length
  const t = new Float64Array(n), air = new Float64Array(n)
  for (let k = 1; k < n; k++) {
    const ds = pts[k].d - pts[k - 1].d
    const grade = ds > 0 ? (pts[k].z - pts[k - 1].z) / ds : 0
    const dt = ds / 1000 / pace(s.flatPace, grade)
    t[k] = t[k - 1] + dt
    air[k] = air[k - 1] + airPerHour(s, grade) * dt
    const stop = stopAt.get(k)
    if (stop) { t[k] += stop / 60; air[k] += (stop / 60) / s.suitHours }
  }
  return { t, air }
}

/** Who walks: one astronaut, or two with their own gear. Pace does not depend on load in this
 *  model, so the pair walks together and only air use differs between the two suits. */
export function crewOf(s) {
  const you = { who: 'You', load: Math.max(0, s.load || 0) }
  return (s.crew || 1) >= 2 ? [you, { who: 'Buddy', load: Math.max(0, s.buddyLoad || 0) }] : [you]
}

/**
 * @param drive optional rover drop-off: { m, straight } metres driven from the habitat to where
 *   the walk starts (along the safe path, and as the crow flies). The suits are full when the
 *   walk starts; the drive adds time before and after the walk (sunlight, radiation).
 * @param base the habitat, when the walk starts somewhere else (rover drop-off)
 */
export function analyze(g, { line, stops = [], settings: s, startMs, site, habitat, facts, drive = null, base = null }) {
  const pts = resample(g, line)
  for (const p of pts) { p.z = elevAt(g, p.lon, p.lat); p.slope = slopeAt(g, p.lon, p.lat); p.rough = roughAt(g, p.lon, p.lat) }
  // Rocky-looking ground from HiRISE texture (upper quarter of the scale): slower, riskier footing
  let rockyM = 0
  for (let k = 1; k < pts.length; k++) if (pts[k].rough >= 190) rockyM += pts[k].d - pts[k - 1].d
  const n = pts.length

  // Ground with no height data: outside the detailed map (lookups there only repeat the edge)
  // or on a gap in it. Its slope is unknown, so it can never count as safe: it becomes a
  // NO-GO below. Gaps take the nearest known height so time and air stay real numbers.
  let unknownM = 0, unknownAt = null, lastZ = null
  for (let k = 0; k < n; k++) {
    const p = pts[k]
    p.unknown = !inside(g, p.lon, p.lat) || !Number.isFinite(p.z) || !Number.isFinite(p.slope)
    if (p.unknown) {
      if (unknownAt === null) unknownAt = p.d
      if (k) unknownM += p.d - pts[k - 1].d
    }
    if (Number.isFinite(p.z)) lastZ = p.z
    else p.z = lastZ
    if (!Number.isFinite(p.slope)) p.slope = 90
  }
  const firstZ = pts.find((p) => Number.isFinite(p.z))?.z ?? 0
  for (const p of pts) if (p.z === null) p.z = firstZ
  const loop = distance(g, line[0], line[line.length - 1]) < 80

  // Stops sit at the nearest sample on the route.
  const stopAt = new Map()
  const visited = []
  for (const st of stops) {
    let best = -1, bd = Infinity
    for (let k = 0; k < n; k++) {
      const dd = distance(g, [pts[k].lon, pts[k].lat], [st.lon, st.lat])
      if (dd < bd) { bd = dd; best = k }
    }
    if (bd <= 120) {
      const minutes = st.minutes ?? s.stopMinutes
      stopAt.set(best, (stopAt.get(best) || 0) + minutes)
      visited.push({ id: st.id, index: best, d: pts[best].d, minutes })
    }
  }

  // Going home the same way: the same samples walked backwards (no stops on the way back).
  const rev = pts.map((p) => ({ ...p })).reverse()
  const total = pts[n - 1].d
  rev.forEach((p) => { p.d = total - p.d })
  const loopEnd = distance(g, line[0], line[line.length - 1]) < 80
  // Air for the whole walk with a given load (outbound, plus walking home the same way).
  const tripAir = (load) => {
    const ss = { ...s, load }
    const o = walkLeg(pts, ss, stopAt)
    return o.air[n - 1] + (loopEnd ? 0 : walkLeg(rev, ss).air[n - 1])
  }
  // The pair turns back together, so the suit that breathes hardest (most gear) sets the plan.
  const crew = crewOf(s)
  const lead = crew.reduce((a, b) => (b.load > a.load ? b : a))
  const sl = { ...s, load: lead.load }
  const out = walkLeg(pts, sl, stopAt)
  const back = walkLeg(rev, sl)
  // backAir[i]: air needed from sample i (outbound index) back to the start.
  const backAir = new Float64Array(n), backT = new Float64Array(n)
  for (let i = 0; i < n; i++) { backAir[i] = back.air[n - 1] - back.air[n - 1 - i]; backT[i] = back.t[n - 1] - back.t[n - 1 - i] }

  const budget = 1 - s.reserve / 100
  const tailAir = (i) => out.air[n - 1] - out.air[i]
  const homeAir = (i) => (loop ? Math.min(tailAir(i), backAir[i]) : backAir[i])
  let turn = 0
  for (let i = 0; i < n; i++) if (out.air[i] + homeAir(i) <= budget) turn = i

  const outHours = out.t[n - 1]
  const retHours = loop ? 0 : backT[n - 1]
  const hours = outHours + retHours
  const airUsed = out.air[n - 1] + (loop ? 0 : backAir[n - 1])
  const airLeft = 1 - airUsed

  // Elevation and slope.
  let gain = 0, loss = 0, maxSlope = 0, maxSlopeAt = 0, zMin = Infinity, zMax = -Infinity
  const bands = []
  for (let k = 0; k < n; k++) {
    const p = pts[k]
    if (k) { const dz = p.z - pts[k - 1].z; if (dz > 0) gain += dz; else loss -= dz }
    if (p.slope > maxSlope) { maxSlope = p.slope; maxSlopeAt = k }
    zMin = Math.min(zMin, p.z); zMax = Math.max(zMax, p.z)
    const level = p.slope > s.redSlope ? 'red' : p.slope > s.greenSlope ? 'amber' : null
    const last = bands[bands.length - 1]
    if (level && last && last.level === level && last.to >= pts[k - 1].d - 1) last.to = p.d
    else if (level) bands.push({ level, from: k ? pts[k - 1].d : 0, to: p.d })
  }
  const redBands = bands.filter((b) => b.level === 'red')

  // Distance from the habitat.
  let farthest = 0, farIdx = 0
  for (let k = 0; k < n; k++) {
    const dd = distance(g, habitat, [pts[k].lon, pts[k].lat])
    if (dd > farthest) { farthest = dd; farIdx = k }
  }

  // Sunlight through the whole walk, every 5 minutes.
  const sunTrack = []
  let minSun = Infinity, darkAt = null, lowAt = null
  const driveH = drive ? drive.m / 1000 / Math.max(0.5, s.roverSpeed || 6) : 0
  const tripHours = hours + 2 * driveH // drive out, walk, drive home
  const totalMs = tripHours * 3.6e6
  // An impossible walk (say, up a sheer wall) can take "forever"; it is NO-GO on air long
  // before that, so the sun is only tracked for the first two sols.
  const trackMs = Number.isFinite(totalMs) ? Math.min(totalMs, 2 * 88775e3) : 2 * 88775e3
  for (let ms = 0; ms <= trackMs + 1; ms += 5 * 60000) {
    const e = sunAt(startMs + ms, site.lat, site.lon).elevation
    sunTrack.push([ms / 3.6e6, e])
    if (e < minSun) minSun = e
    if (e < 0 && darkAt === null) darkAt = ms / 3.6e6
    if (e < s.minSun && lowAt === null) lowAt = ms / 3.6e6
  }
  const startSun = sunAt(startMs, site.lat, site.lon)
  const endSun = sunAt(startMs + trackMs, site.lat, site.lon)

  const mt = marsTime(startMs)
  const comms = earthMars(startMs)
  const dose = tripHours * (facts.surfaceDose / 24) // the rover is not counted as a shelter
  const dusty = mt.Ls >= 180

  // ---- verdict ----
  const reasons = []
  const km = (m) => (m / 1000).toFixed(1)
  if (unknownAt !== null) {
    reasons.push({ level: 'nogo', code: 'nodata', title: `No height data at ${km(unknownAt)} km`, detail: `${Math.max(20, Math.round(unknownM))} m of the walk is outside the detailed height map or on a gap in it, so its slope is unknown. Keep the walk inside the dashed edge.`, protocol: 'suit' })
  }
  if (redBands.length) {
    const b = redBands[0]
    reasons.push({ level: 'nogo', code: 'steep', title: `Too steep at ${km(b.from)} km`, detail: `The ground reaches ${maxSlope.toFixed(0)}°. Your limit is ${s.redSlope}°. Use a safe path to go around it.`, protocol: 'suit' })
  }
  if (airUsed > budget) {
    reasons.push({ level: 'nogo', code: 'air', title: 'Not enough suit air', detail: `This walk needs ${pct(airUsed)} of the suit's air, but ${pct(budget)} is the most you may use (the rest is your ${s.reserve}% reserve). Turn back at ${km(pts[turn].d)} km.`, protocol: 'suit' })
  }
  if (darkAt !== null) {
    reasons.push({ level: 'nogo', code: 'dark', title: 'You would be out after sunset', detail: `The sun sets ${fmtH(darkAt)} after you leave${drive ? ' the habitat' : ''}. Nights on Mars are far below freezing and you cannot see hazards.`, protocol: 'power' })
  } else if (lowAt !== null) {
    reasons.push({ level: 'caution', code: 'lowsun', title: 'Sun gets low', detail: `The sun drops below ${s.minSun}° ${fmtH(lowAt)} into the walk. Long shadows hide holes and rocks.`, protocol: 'power' })
  }
  if (farthest > s.walkBack * 1000) reasons.push({ level: 'caution', code: 'radius', title: 'Outside the walk-back circle', detail: `You go ${km(farthest)} km from the habitat. Your circle is ${s.walkBack} km. Bring a rover or a second crew.`, protocol: 'suit' })
  // ---- crew ----
  const crewAir = crew.map((c) => ({ ...c, air: c === lead ? airUsed : tripAir(c.load) }))
  if (crew.length === 1) {
    reasons.push({ level: 'caution', code: 'solo', title: 'Walking alone', detail: 'Nobody can help if you fall or your suit fails. Space station spacewalks are done by two astronauts together. Add a buddy in Settings.', protocol: 'suit' })
  } else {
    const light = crewAir.reduce((a, b) => (b.air < a.air ? b : a))
    const even = (crew[0].load + crew[1].load) / 2
    if (airUsed > budget && light.air <= budget) {
      const fits = tripAir(even) <= budget
      reasons.push({ level: 'nogo', code: 'split', title: 'Only one of you has the air', detail: `${lead.who === 'You' ? 'Your suit' : 'Your buddy\u2019s suit'} runs short, but the other could finish. Do not split up: one astronaut alone, out of reach, is the danger. Turn back together at ${km(pts[turn].d)} km${fits ? `, or share the gear evenly (${Math.round(even)} kg each), which makes the walk fit` : ''}.`, protocol: 'suit' })
      const air = reasons.findIndex((x) => x.code === 'air')
      if (air >= 0) reasons.splice(air, 1) // the split warning says the same, more usefully
    } else if (Math.abs(crew[0].load - crew[1].load) >= 10 && airUsed <= budget) {
      reasons.push({ level: 'note', code: 'buddy', title: `${lead.who === 'You' ? 'You use' : 'Your buddy uses'} air faster`, detail: `${lead.who === 'You' ? 'You carry' : 'Your buddy carries'} ${lead.load} kg against ${light.load} kg, so that suit sets the turn-back point for both of you. Sharing the gear evenly gives you more margin.` })
    }
  }

  // ---- rover drop-off ----
  if (drive) {
    reasons.push({ level: 'note', code: 'rover', title: `Rover drive: ${km(drive.m)} km each way`, detail: `About ${fmtH(driveH)} each way at ${s.roverSpeed} km/h. Suits start full at the rover, and the walk-back circle is centred on it.` })
    if (drive.straight > s.walkBack * 1000) {
      reasons.push({ level: 'caution', code: 'roverfar', title: 'Too far to walk home if the rover breaks', detail: `The rover parks ${km(drive.straight)} km from the habitat, beyond your ${s.walkBack} km walk-back circle. NASA\u2019s Mars plans send pressurised rovers in pairs so one can rescue the other.`, protocol: 'suit' })
    }
  }

  const amberM = bands.filter((b) => b.level === 'amber').reduce((m, b) => m + b.to - b.from, 0)
  if (amberM > s.steepAllowance && !redBands.length) {
    reasons.push({ level: 'caution', code: 'amber', title: 'Long stretches of steep ground', detail: `${Math.round(amberM)} m of the walk is between ${s.greenSlope}° and ${s.redSlope}°. Use walking poles and go slowly.` })
  } else if (amberM > 0 && !redBands.length) {
    reasons.push({ level: 'note', code: 'amber', title: 'A few short steep steps', detail: `${Math.round(amberM)} m of the walk is between ${s.greenSlope}° and ${s.redSlope}°. Walking poles help.` })
  }
  if (rockyM > 300) {
    reasons.push({ level: 'caution', code: 'rocky', title: 'Rocky ground', detail: `About ${Math.round(rockyM / 10) * 10} m of the walk crosses rough, rocky-looking ground in the HiRISE photo. Slow down, watch your footing, and keep your buddy close.`, protocol: 'suit' })
  } else if (rockyM > 0) {
    reasons.push({ level: 'note', code: 'rocky', title: 'Some rocky ground', detail: `About ${Math.round(rockyM / 10) * 10} m of the walk crosses rough, rocky-looking ground in the HiRISE photo.` })
  }
  if (airUsed <= budget && airUsed > budget - 0.08) {
    reasons.push({ level: 'caution', code: 'margin', title: 'Thin air margin', detail: `You get home with ${pct(airLeft)} air, only just above your ${s.reserve}% reserve.`, protocol: 'suit' })
  }
  if (comms.sunAngle < 3) {
    reasons.push({ level: 'note', code: 'conjunction', title: 'No radio contact with Earth', detail: 'Mars is behind the Sun as seen from Earth (solar conjunction). Earth cannot help for about two weeks.' })
  }
  const dust = dustOutlook(mt.Ls)
  if (dust.level !== 'low') {
    reasons.push({ level: dust.level === 'high' ? 'caution' : 'note', code: 'dust', title: `Dust storm history: ${dust.level === 'high' ? 'High' : 'Moderate'}`, detail: `Mars season Ls ${mt.Ls.toFixed(0)}°. ${dust.why} ${dust.rate}. ${dust.disclaimer}`, protocol: 'power' })
  }
  const order = { nogo: 0, caution: 1, note: 2 }
  reasons.sort((a, b) => order[a.level] - order[b.level])
  const status = reasons.some((r) => r.level === 'nogo') ? 'nogo' : reasons.some((r) => r.level === 'caution') ? 'caution' : 'go'

  const good = []
  if (!redBands.length && unknownAt === null) good.push(`No ground steeper than ${s.redSlope}°`)
  if (airUsed <= budget) good.push(`Home with ${pct(airLeft)} of the suit's air`)
  if (darkAt === null && lowAt === null) good.push(`Sun stays above ${s.minSun}° the whole time`)

  // ---- profile (thinned to <= 400 points for drawing) ----
  const stride = Math.max(1, Math.ceil(n / 400))
  const profile = []
  for (let k = 0; k < n; k += stride) profile.push([pts[k].d, pts[k].z, pts[k].slope, pts[k].lon, pts[k].lat, out.t[k], out.air[k]])
  if ((n - 1) % stride) profile.push([pts[n - 1].d, pts[n - 1].z, pts[n - 1].slope, pts[n - 1].lon, pts[n - 1].lat, out.t[n - 1], out.air[n - 1]])

  return {
    status, reasons, good, loop,
    distance: total, tripDistance: loop ? total : total * 2,
    gain, loss, zMin, zMax, maxSlope, maxSlopeAt: [pts[maxSlopeAt].lon, pts[maxSlopeAt].lat, pts[maxSlopeAt].d],
    hours, outHours, retHours, tripHours,
    crew: crewAir.map(({ who, load, air }) => ({ who, load, air })),
    drive: drive ? { ...drive, hours: driveH, base } : null,
    airUsed, airLeft, budget,
    turnBack: { lon: pts[turn].lon, lat: pts[turn].lat, d: pts[turn].d, atEnd: turn === n - 1, airThere: out.air[turn] },
    farthest, farthestAt: [pts[farIdx].lon, pts[farIdx].lat],
    sun: { start: startSun, end: endSun, min: minSun, track: sunTrack, darkAt, lowAt },
    dose, comms, mars: { sol: mt.sol, Ls: mt.Ls, dusty, msd: mt.msd }, dust,
    bands, amberM, rockyM, profile, visited, unknownM,
  }
}

export const pct = (f) => `${Math.round(f * 100)}%`
export const fmtH = (h) => {
  const m = Math.round(h * 60)
  return m >= 60 ? `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')} min` : `${m} min`
}
