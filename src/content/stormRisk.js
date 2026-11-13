// Storm Risk Estimator data. Every value is from a cited source (keys in sources.js).
// Anything not yet sourced is null and shows "Data needed" in the app; fill it in here,
// with its source, when the evidence is available. Never guess a number.

import { GLOBAL_STORMS } from './dustHistory.js'

export const STORM_DISCLAIMER =
  "Based on past observations from 8 Mars years. Dust storms can't be predicted reliably; this is for training, not mission planning."

/** Mars Dust Activity Database (Battalio & Wang 2021): seasons of non-global dust storms. */
export const MDAD = {
  total: 14974,
  span: 'MY 24 (Ls 150°) to MY 32 (Ls 171°)',
  main: [140, 250], // primary season, both hemispheres
  secondaryNorth: [300, 360],
  secondarySouth: [10, 70],
  source: 'mdad',
}

/** The two planet-wide storms this tool explains (onsets from dustHistory.js). */
export const FEATURED = ['2001', '2018'].map((year) => {
  const g = GLOBAL_STORMS.find((s) => s.earth === year)
  return { year, my: g.my, Ls: g.Ls, source: g.source }
})

/**
 * Cataloged MDAD storms near each site, per Mars month (12 numbers, month 1 = Ls 0–30°).
 * null = Data needed: the per-site counts have not been extracted from the MDAD catalog yet.
 */
export const SITE_COUNTS = {
  jezero: null,
  gale: null,
  deuteronilus: null,
  protonilus: null,
  mawrth: null,
}

/** What each global storm did at each site. Only sourced statements; null = Data needed. */
export const SITE_EVENTS = {
  '2001': {
    // MER landed in 2004 and Pathfinder fell silent in 1997: no lander was working in 2001.
    all: { text: 'No lander was working on Mars in 2001. The storm was tracked from orbit by Mars Global Surveyor.', source: 'dustStorms' },
  },
  '2018': {
    gale: { text: 'Curiosity measured a haze opacity (tau) above 8.0 at Gale, the highest of its mission. It runs on a plutonium generator, not sunlight, so it kept working.', source: 'curiosity2018' },
    jezero: { text: 'No spacecraft was on the ground here yet: Perseverance landed in 2021. Elsewhere, solar-powered Opportunity fell silent on 10 June 2018.', source: 'opportunityEnd' },
    deuteronilus: null,
    protonilus: null,
    mawrth: null,
  },
}

const overlap = (a0, a1, [b0, b1]) => a0 < b1 && a1 > b0

/** Historical risk for a site latitude and a Mars month (1–12, 30° of Ls each). */
export function stormRisk(lat, month) {
  const a0 = (month - 1) * 30
  const a1 = month * 30
  const main = overlap(a0, a1, MDAD.main)
  const hemi = typeof lat === 'number' ? (lat >= 0 ? 'north' : 'south') : null
  const secondary = hemi ? overlap(a0, a1, hemi === 'north' ? MDAD.secondaryNorth : MDAD.secondarySouth) : null
  const near = FEATURED.filter((g) => g.Ls >= a0 - 15 && g.Ls < a1 + 15)
  const level = main && near.length ? 'high' : main || secondary ? 'moderate' : 'low'
  const range = `Ls ${a0}–${a1}°`
  const why =
    level === 'high'
      ? `${range} is in the main storm season (Ls ${MDAD.main.join('–')}°) and the ${near.map((g) => g.year).join(' and ')} global storm${near.length > 1 ? 's' : ''} began within 15° of it.`
      : main
        ? `${range} is in the main storm season (Ls ${MDAD.main.join('–')}°), but neither global storm began within 15° of it.`
        : secondary
          ? `${range} is in the ${hemi}ern hemisphere's secondary storm season.`
          : `${range} is outside the main storm season and this hemisphere's secondary season.`
  return { level, why, main, secondary, hemi, near, a0, a1 }
}

export const SEASON_NAMES = ['Spring', 'Spring', 'Spring', 'Summer', 'Summer', 'Summer', 'Autumn', 'Autumn', 'Autumn', 'Winter', 'Winter', 'Winter']
