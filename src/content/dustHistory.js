// Past Martian dust storms, used to give astronauts a historical dust outlook for a walk date.
// This is NOT a forecast: dust storms cannot be predicted reliably. It says how often big storms
// have started at this time of the Mars year in past observations, and labels that Low/Moderate/High.

/** Planet-encircling (global) dust storms and the season they began (Ls, degrees).
 *  Ls values are approximate onset seasons from the cited papers. */
export const GLOBAL_STORMS = [
  { my: 9, earth: '1971', Ls: 260, seenBy: 'Mariner 9', source: 'dustFacts' },
  { my: 12, earth: '1977 (a)', Ls: 204, seenBy: 'Viking orbiters and landers', source: 'dustFacts' },
  { my: 12, earth: '1977 (b)', Ls: 268, seenBy: 'Viking orbiters and landers', source: 'dustFacts' },
  { my: 15, earth: '1982', Ls: 208, seenBy: 'Viking 1 lander', source: 'dustFacts' },
  { my: 25, earth: '2001', Ls: 185, seenBy: 'Mars Global Surveyor', source: 'dustStorms' },
  { my: 28, earth: '2007', Ls: 265, seenBy: 'Mars Reconnaissance Orbiter, Spirit and Opportunity', source: 'dustStorms' },
  { my: 34, earth: '2018', Ls: 186, seenBy: 'MRO, Curiosity; ended the Opportunity rover', source: 'dustOnset2018' },
]

/** Years with continuous orbital dust watching (MGS from MY 24 onward). Update as years complete. */
export const WATCHED = { from: 24, to: 38 }

/** Regional storms recur in similar windows every year (Kass et al. 2016, MCS climatology). */
export const REGIONAL = [
  { name: 'A storms', from: 210, to: 240, note: 'Southern spring regional storms, often from the north crossing the equator.' },
  { name: 'B storms', from: 250, to: 310, note: 'Southern summer storms near the south polar cap edge.' },
  { name: 'C storms', from: 310, to: 330, note: 'Late-summer regional storms, often the strongest of the year.' },
]

export const DUST_DISCLAIMER =
  'Based on past observations only. Dust storms cannot be predicted reliably; this outlook is for training, not mission planning. Check current orbiter weather reports before every walk.'

const WINDOW = 20 // degrees of Ls either side of the walk date counted as "the same season"
const wrap = (d) => Math.abs(((d + 540) % 360) - 180)

/** Historical dust outlook for a Mars season. Returns the level and the evidence behind it. */
export function dustOutlook(Ls) {
  const near = GLOBAL_STORMS.filter((s) => wrap(s.Ls - Ls) <= WINDOW)
  const regional = REGIONAL.filter((r) => Ls >= r.from - 5 && Ls <= r.to + 5)
  const dusty = Ls >= 180
  const watchedYears = WATCHED.to - WATCHED.from + 1
  const watchedGlobal = GLOBAL_STORMS.filter((s) => s.my >= WATCHED.from).length
  let level = 'low'
  if (near.length >= 2 || (near.length && regional.length)) level = 'high'
  else if (dusty) level = 'moderate'
  const why =
    level === 'high'
      ? `${near.length} of ${GLOBAL_STORMS.length} recorded global storms began within ${WINDOW}° of this season${regional.length ? `, and ${regional.map((r) => r.name).join(' and ')} recur now` : ''}.`
      : level === 'moderate'
        ? `Dusty half of the year (Ls 180°–360°), but no recorded global storm began within ${WINDOW}° of this season.`
        : `Ls 0°–180°: no recorded global storm has begun in this half of the year.`
  return {
    level, why, near, regional, dusty,
    rate: `${watchedGlobal} global storms in ${watchedYears} continuously watched Mars years (MY ${WATCHED.from}–${WATCHED.to})`,
    disclaimer: DUST_DISCLAIMER,
  }
}
