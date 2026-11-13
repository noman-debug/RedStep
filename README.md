# Marswalk Planner

**Plan a walk on another world.** A layered Mars map of the whole planet, with a walk planner at Jezero Crater: draw a Marswalk and get an instant, data-backed verdict — GO, CAUTION or NO-GO, and why — plus the science you will do on the way. Built from real NASA mission data.

NASA Space Apps Challenge 2026 · *Interplanetary Survival Guide: Martian Map* · a Loadstone project.

> Independent student project for the NASA Space Apps Challenge 2026. Not affiliated with or endorsed by NASA.

## The 60-second demo

1. **Land** on the home page: Earth's night side (NASA Black Marble city lights), the Moon (LRO), hairline orbits. Press **Begin descent** (or scroll): the Marswalk rocket lifts off, drops its boosters, flies the transfer arc and swings into orbit around Mars.
2. **Mars map** (also at `/map`): a Google-Maps-style explorer. Globe view when zoomed out, flat map when zoomed in, real day and night shading (Mars24), 1,779 official IAU place names to search, tap anywhere for local Mars time and the nearest named place, switch Colour / Height / Dust, zoom into Jezero down to HiRISE detail.
3. Pick **Jezero Crater** in the sidebar → **Plan a walk here**.
4. Press **Suggest safe route**. The planner searches the height map for safe paths to real Perseverance sample sites and returns **GO** with the turn-back point.
5. Try **Bold**: it reaches the delta and Wildcat Ridge (organic molecules) but drops to CAUTION. That is the safety-versus-science trade-off.
6. **Draw** a straight line to Cheyava Falls → **NO-GO** (21° slope, not enough air, out after sunset). Press **Fix: follow safe paths**.
7. **Fly along** in 3D, then **Mission brief** → print or download a PNG.

## How it answers the challenge

| Challenge asks | What we built |
|---|---|
| Layered, integrated view | 11 layers on one map with opacity sliders, each labelled with mission, instrument and detail |
| Data from multiple NASA missions | MRO HiRISE + CTX, MGS MOLA + TES, Mars Odyssey THEMIS, Viking, Mars Express HRSC (blend), Curiosity RAD, Perseverance traverse + samples, LRO and Earth Observatory for the intro |
| Plan a successful Marswalk | Slope limits, safe paths (A*/Dijkstra), suit air with turn-back point, walk-back circle, sun height (NASA GISS Mars24), radiation dose, Earth light time, GO/CAUTION/NO-GO with reasons |
| New science along the way | 9 science stops at real sample sites with *why it matters* and *which data says so*; a science score that trades openly against safety |
| Survival guide | 8-step interactive guide (pressure, landing, air, water & food, shelter & radiation, Mars time, emergency drill, checklist) and a base calculator |

## Honesty rules

Every number carries one of three labels: **NASA data** (measured), **Derived** (computed here from NASA data, method on /sources) or **Illustrative** (an editable assumption). Nothing is live telemetry. The advisor is a deterministic rule engine, labelled *Local rule engine — not a live AI model*. Lava tubes are never called confirmed; Mars soil is never called safe to farm.

## Data pipeline

`npm run bake` downloads public NASA/USGS products once and writes everything the app needs into `public/data/` (about 11 MB), so the site runs offline:

- **Jezero height map**: USGS Mars 2020 landing-system CTX DTM (20 m), averaged to a 40 m grid (`elevation.i16`, decimetres).
- **Photos**: CTX orthomosaic (6 m), HiRISE close-up of the walking area (Trek tiles, ~1.3 m), Viking colour.
- **Ground type**: THEMIS day and night infrared (Mars Odyssey); night IR is also sampled onto the grid as a loose-ground penalty.
- **Rover data**: Perseverance traverse and waypoints, Curiosity traverse (JPL MMGIS).
- **World map**: Web Mercator tile pyramids cut from Viking MDIM 2.1 (zoom 0–5), MOLA colour (0–4) and TES dust (0–2); IAU/USGS place names via Mars Trek (`names.json`).
- **Intro**: Viking MDIM 2.1, MOLA/HRSC relief, LRO WAC Moon, NASA Blue Marble and Black Marble.

The map draws in Web Mercator (MapLibre), so the bake warps every image row by row from equirectangular. All distances use the Mars radius. 3D terrain tiles are generated in the browser from the grid (a `marsdem://` protocol), with heights scaled so 1× is true to scale.

`node scripts/make-og.mjs` rebuilds the share image. `node scripts/try-suggest.mjs` prints planner results on the real Jezero grid.

## Tech

Vite + React 19 + React Router 7. `three` for the intro, the rocket and the globe (plain three.js, no wrapper, for full control and a smaller bundle). `maplibre-gl` for the map and 3D terrain. `html-to-image` for the brief PNG. Route search and slope run in a Web Worker. Charts are hand-written SVG. Scroll and number animations use requestAnimationFrame with direct style writes. Fonts: Montserrat, Space Mono, Instrument Serif (all self-hosted).

```
src/content/   all copy and datasets: sites, science stops, assumptions, survival guide, sources
src/compute/   grid, slope, path finding, walk analysis, worker (pure, tested)
src/lib/       Mars24, ephemeris, advisor rules, map helpers, hooks
src/three/     intro scene (space.js) and the Marswalk rocket (rocket.js)
src/pages/     Home, MapPage (/map), Site (planner), Guide, Habitat, Sources, About, Brief
scripts/       bake-site.mjs, make-og.mjs, try-suggest.mjs
```

Deploy: Vercel (SPA rewrite in `vercel.json`).

## Team

Add names in `src/content/site.js` (`SITE.team`).
