// Space weather for walk planning: what the Sun has done in the last week, from NASA's Space
// Weather Database Of Notifications, Knowledge, Information (DONKI), with NOAA's live GOES proton
// reading as a backup. Both are measured on Earth's side of the Sun, so the card also says how far
// around the Sun Mars is: a storm seen from Earth may miss Mars, and one behind the Sun can hit
// Mars unseen.
import { useEffect, useState } from 'react'
import { earthMars } from './ephem.js'

const DAY = 8.64e7
const CACHE_KEY = 'mw-space-weather-v1'
const FRESH_MS = 30 * 60 * 1000
/** NOAA S1 "minor radiation storm" begins at 10 pfu of >=10 MeV protons. */
export const S1_PFU = 10

const ymd = (ms) => new Date(ms).toISOString().slice(0, 10)

async function getJson(url, ms = 12000) {
  const c = new AbortController()
  const t = setTimeout(() => c.abort(), ms)
  try {
    const r = await fetch(url, { signal: c.signal })
    if (!r.ok) throw new Error(String(r.status))
    const text = await r.text()
    return text.trim() ? JSON.parse(text) : []
  } finally {
    clearTimeout(t)
  }
}

/**
 * DONKI from NASA's CCMC (no key needed). There is no api.nasa.gov fallback any more: its
 * shared DEMO_KEY allows only 10 calls an hour per network, so visitors saw 429 errors.
 * If CCMC is down, flares come from NOAA's GOES feed and particle storms from GOES protons.
 */
async function donki(kind, start, end) {
  return getJson(`https://kauai.ccmc.gsfc.nasa.gov/DONKI/WS/get/${kind}?startDate=${start}&endDate=${end}`, 8000)
}

/** Flares of the last 7 days from NOAA SWPC's GOES X-ray feed (no key), DONKI's format. */
async function noaaFlares() {
  const rows = await getJson('https://services.swpc.noaa.gov/json/goes/primary/xray-flares-7-day.json')
  return rows.filter((r) => r.max_class).map((r) => ({ classType: r.max_class, peakTime: r.max_time, beginTime: r.begin_time }))
}

/** Latest >=10 MeV integral proton flux at GOES (pfu), or null. */
async function goesProtons() {
  const rows = await getJson('https://services.swpc.noaa.gov/json/goes/primary/integral-protons-1-day.json')
  const ten = rows.filter((r) => r.energy === '>=10 MeV' && Number.isFinite(r.flux))
  const last = ten[ten.length - 1]
  return last ? { flux: last.flux, at: Date.parse(last.time_tag) } : null
}

/** Collect the raw readings. Each source may fail on its own; whatever arrives is kept. */
export async function fetchSpaceWeather(now = Date.now()) {
  const start = ymd(now - 7 * DAY)
  const end = ymd(now)
  let flaresFrom = 'donki'
  const [flr, sep, goes] = await Promise.allSettled([donki('FLR', start, end).catch(() => { flaresFrom = 'noaa'; return noaaFlares() }), donki('SEP', start, end), goesProtons()])
  return {
    checkedAt: now,
    // DONKI answered only if SEP did, or flares came from it rather than from NOAA
    donki: sep.status === 'fulfilled' || (flr.status === 'fulfilled' && flaresFrom === 'donki'),
    flares: flr.status === 'fulfilled' ? flr.value.map((f) => ({ cls: f.classType, at: Date.parse(f.peakTime || f.beginTime) })).filter((f) => f.cls) : null,
    seps: sep.status === 'fulfilled' ? sep.value.map((e) => ({ at: Date.parse(e.eventTime) })) : null,
    goes: goes.status === 'fulfilled' ? goes.value : null,
  }
}

const FLARE_RANK = { A: 0, B: 1, C: 2, M: 3, X: 4 }
const flareScore = (cls) => (FLARE_RANK[cls?.[0]] ?? -1) * 100 + (parseFloat(cls?.slice(1)) || 0)

/** Turn readings into what a crew needs: is a particle storm on, what happened, how sure we are. */
export function classify(raw, now = Date.now()) {
  if (!raw || (!raw.donki && !raw.goes)) return { known: false }
  const recentSep = (raw.seps || []).filter((e) => now - e.at < 3 * DAY)
  const flares = raw.flares || []
  const strongest = flares.reduce((best, f) => (!best || flareScore(f.cls) > flareScore(best.cls) ? f : best), null)
  const fluxStorm = raw.goes ? raw.goes.flux >= S1_PFU : false
  const storm = fluxStorm || recentSep.length > 0
  const big = flares.filter((f) => /^[MX]/.test(f.cls)).length
  return {
    known: true,
    storm,
    level: storm ? 'storm' : big > 0 ? 'active' : 'quiet',
    flares: raw.flares ? flares.length : null,
    strongest,
    seps: raw.seps ? raw.seps.length : null,
    recentSeps: recentSep.length,
    flux: raw.goes?.flux ?? null,
    donki: raw.donki,
    checkedAt: raw.checkedAt,
  }
}

/** React hook: cached for 30 minutes, refreshed in the background, stale copy kept on failure. */
export function useSpaceWeather() {
  const [state, setState] = useState(() => {
    try {
      const c = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null')
      return c ? { raw: c, stale: Date.now() - c.checkedAt > FRESH_MS, loading: false } : { raw: null, stale: false, loading: true }
    } catch {
      return { raw: null, stale: false, loading: true }
    }
  })
  useEffect(() => {
    if (state.raw && !state.stale) return undefined
    let gone = false
    fetchSpaceWeather().then((raw) => {
      if (gone) return
      if (raw.donki || raw.goes) {
        try { localStorage.setItem(CACHE_KEY, JSON.stringify(raw)) } catch { /* storage full or blocked */ }
        setState({ raw, stale: false, loading: false })
      } else setState((s) => ({ ...s, loading: false, failed: true }))
    })
    return () => { gone = true }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  const now = Date.now()
  return { ...classify(state.raw, now), loading: state.loading, stale: state.stale, failed: state.failed, apart: earthMars(now).apart }
}
