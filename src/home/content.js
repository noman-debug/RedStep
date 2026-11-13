// Copy and data for the cinematic homepage (src/home). Numbers and sites come from the
// app's own content files, so the homepage always agrees with the map and the planner.
import { SITE, BADGES as APP_BADGES } from '../content/site.js'
import { SITES } from '../content/sites.js'
import { WALK, FACTS } from '../content/assumptions.js'

export { SITE }

// Same three honesty labels as the rest of the app, in the homepage's chip style.
export const BADGES = Object.fromEntries(
  Object.entries(APP_BADGES).map(([key, b]) => [key, { key, label: b.label.toUpperCase(), long: b.long }]),
)

// Source details shown in badge tooltips on the homepage.
export const SOURCES = {
  mola: { mission: 'MGS', instrument: 'MOLA', product: 'Laser altimeter elevation', resolution: '≈463 m/px' },
  tes: { mission: 'MGS', instrument: 'TES', product: 'Dust cover index', resolution: '≈3.5 km' },
  hirise: { mission: 'MRO', instrument: 'HiRISE', product: 'Orthoimagery near the landing site', resolution: '25 cm/px' },
  ctx: { mission: 'MRO', instrument: 'CTX', product: 'Imagery and stereo height map', resolution: '6 m/px' },
  themis: { mission: 'Odyssey', instrument: 'THEMIS', product: 'Day and night infrared (rock vs dust)', resolution: '100 m/px' },
  mdim: { mission: 'Viking', instrument: 'VIS', product: 'Global colour mosaic', resolution: '232 m/px' },
  mmgis: { mission: 'Mars 2020', instrument: 'JPL MMGIS', product: 'Perseverance’s real path and samples', resolution: 'metres' },
  rad: { mission: 'Curiosity', instrument: 'RAD', product: 'Cruise and surface dose rate', resolution: 'Point measurement', citation: 'Hassler et al. (2014); Zeitlin et al. (2013)' },
  mars24: { mission: 'NASA GISS', instrument: 'Mars24 algorithm', product: 'Mars time, season, sun position', resolution: 'Analytic', citation: 'Allison & McEwen (2000)' },
  ephemeris: { mission: 'Analytic ephemeris', instrument: 'Earth + Mars orbits', product: 'Earth–Mars distance and light time', resolution: '≈±0.3 min' },
  sites: { mission: 'Redstep', instrument: 'Curated sites', product: 'Rover landing points and NASA 2015 human landing-zone workshop sites', resolution: 'Point coordinates', citation: 'Each site lists its coordinate source on the map.' },
  assumption: { mission: 'Redstep', instrument: 'Planning assumption', product: 'Editable in the walk settings', resolution: 'Set by you' },
  schematic: { mission: 'Redstep', instrument: 'Hero scene', product: 'Orbital schematic drawn in your browser', resolution: 'Not to scale', citation: 'Planet maps: Viking (Mars), Blue Marble (Earth); distances and lighting composed for legibility.' },
}

export const CONSTANTS = {
  radCruise: FACTS.cruiseDose,
  radSurface: FACTS.surfaceDose,
  lightTimeRange: { value: '3.0–22.3', unit: 'min' },
}

export const SLOPE_THRESHOLDS = { go: WALK.greenSlope.value, caution: WALK.redSlope.value }
export const EVA_DEFAULTS = { walkBackRadiusKm: WALK.walkBack.value, reserveFraction: WALK.reserve.value / 100 }

export const LANDING_SITES = SITES.map((s) => ({
  id: s.id,
  name: s.name,
  lat: s.lat,
  lon: s.lon,
  planner: s.planner,
  science: s.short,
  context: s.why,
  missions: [s.kind, s.mission],
}))
export const DEFAULT_SITE_ID = 'jezero'
export const getSite = (id) => LANDING_SITES.find((s) => s.id === id)

export const HOME = {
  kicker: 'Student entry · NASA Space Apps Challenge 2026',
  titleLines: ['Plan the first', 'walk on '],
  titleAccent: 'Mars.',
  lead: 'Plan it with real NASA mission data, and get a straight answer: GO or NO-GO, and why.',
  ctaPrimary: 'Choose a landing site',
  ctaWalk: 'Plan a walk at Jezero',
  ctaWalkShort: 'Plan a walk',
  skipIntro: 'Skip intro',
  scrollCue: 'Scroll to fly',
  telemetryTitle: 'Mars · now',
  telemetryNote: 'Computed in your browser — not live telemetry.',
  chapters: [
    { id: 'launch', n: '01', label: 'Leave Earth' },
    { id: 'cruise', n: '02', label: 'Cruise' },
    { id: 'arrive', n: '03', label: 'Arrive' },
    { id: 'choose', n: '04', label: 'Mars map' },
  ],
  story: {
    layers: {
      eyebrow: 'Layered + integrated',
      title: 'Five missions. *One map.*',
      body: 'Height, photos, dust and rover tracks, stacked on one map.',
      chips: ['mola', 'hirise', 'ctx', 'themis', 'tes', 'mdim', 'mmgis'],
    },
    cruise: {
      eyebrow: 'The trip is the first hazard',
      title: 'Every number shows its *source.*',
      body: 'Radiation is real and Earth is minutes away. Plan before the hatch opens.',
    },
    arrive: {
      eyebrow: 'Plan a successful Marswalk',
      title: 'Walk out. Do science. *Walk back.*',
      body: 'Slope, suit air and sunlight in. GO, CAUTION or NO-GO out.',
    },
    choose: {
      eyebrow: 'New science along the way',
      title: 'Choose your *landing site.*',
      body: 'Drag the globe or pick a site.',
    },
  },
  walkthrough: [
    { title: 'Pick a place on Mars', body: 'One map stacks five missions: height, photos, rock or dust. Tap a crater to see what is there.', link: '/map', cta: 'Open the Mars map', img: '/home/map.webp', alt: 'The Mars map: a globe with landing sites and a list of places' },
    { title: 'Ask for a safe walk', body: 'At Jezero Crater the planner reads slope, suit air and sunlight, and draws a route past the science.', link: '/site/jezero', cta: 'Plan a walk', img: '/home/planner-before.webp', alt: 'The walk planner at Jezero Crater before a route is drawn' },
    { title: 'Get a straight answer', body: 'GO, CAUTION or NO-GO, with the reasons. Every number says where it came from.', link: '/sources', cta: 'See the sources', img: '/home/planner-after.webp', alt: 'The planner with a route drawn and a GO verdict' },
    { title: 'Walk it in the helmet', body: 'Fly the route over real 3D ground with the suit display: heading, air left, sun, the next stop and when to turn back. Here: Curiosity’s boxwork on Mount Sharp.', link: '/site/gale', cta: 'Walk to the boxwork', img: '/home/visor.webp', alt: 'Helmet view at Gale Crater: a 3D route to the boxwork with the suit display' },
  ],

}
