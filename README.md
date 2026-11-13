# Marswalk Planner

**Plan a walk on another world.** Explore Mars through a layered planetary map, then plan a walk around Jezero Crater. Draw a route and get a data-backed **GO**, **CAUTION** or **NO-GO** verdict, with the reasons, safety limits and science stops along the way.

NASA Space Apps Challenge 2026 · *Interplanetary Survival Guide: Martian Map* · a Loadstone project.

> Independent student project for the NASA Space Apps Challenge 2026. Not affiliated with or endorsed by NASA.

## The 60-second demo

1. **Start at Earth.** The home page opens on Earth's night side, with NASA Black Marble city lights, a thin blue-lit rim and the planet slowly turning. Scroll through the cinematic journey from Earth to Mars.
2. **Explore Mars** (also at `/map`). Switch between globe and flat map views, inspect Colour / Height / Dust layers, search official IAU place names, check local Mars time and zoom into Jezero Crater.
3. **Choose a landing site.** Open Jezero Crater and select **Plan a walk here**.
4. **Suggest a safe route.** The planner searches the terrain for a route to real Perseverance sample sites and reports the safety verdict and turn-back point.
5. **Compare risk and science.** Try a bolder route to reach more science stops, then compare its verdict with the safer option.
6. **Test a route yourself.** Draw a line toward a destination such as Cheyava Falls, inspect the hazards and use **Fix: follow safe paths** when available.
7. **Review the mission.** Fly along the route in 3D, then open **Mission brief** to print or export a PNG.

## How it answers the challenge

| Challenge asks | What we built |
|---|---|
| Layered, integrated view | A multi-layer Mars map with opacity controls and mission, instrument and resolution context |
| Data from multiple NASA missions | MRO HiRISE + CTX, MGS MOLA + TES, Mars Odyssey THEMIS, Viking, Mars Express HRSC (blend), Curiosity RAD, Perseverance traverse + samples, LRO and Earth Observatory imagery for the intro |
| Plan a successful Marswalk | Slope limits, safe-path search (A*/Dijkstra), suit-air budget and turn-back point, walk-back range, sun position, radiation estimate and Earth light time |
| New science along the way | Science stops at real sample sites, with explanations of why each matters and which data supports it |
| Survival guide | Interactive guidance covering pressure, landing, air, water and food, shelter and radiation, Mars time, emergencies and a checklist, plus a habitat/base calculator |

## Honesty rules

Every number is labelled as **NASA data** (measured), **Derived** (computed here from NASA data; method on `/sources`) or **Illustrative** (an editable assumption). Nothing is live telemetry. The advisor is a deterministic rule engine, labelled *Local rule engine — not a live AI model*. Lava tubes are never called confirmed, and Mars soil is never described as safe to farm.

## Data pipeline

`npm run bake` downloads public NASA/USGS products and writes the app's prepared data into `public/data/`. The bake includes planetary textures and Jezero terrain/map data; the roughness step also prepares planning grids for Jezero and Gale.

- **Jezero terrain:** USGS Mars 2020 landing-system CTX digital terrain model and orthomosaic.
- **Imagery and map layers:** NASA Mars Trek products including Viking MDIM, MOLA/HRSC, THEMIS and TES; HiRISE imagery for close-up terrain.
- **Rover data:** Perseverance traverse and waypoints, plus Curiosity traverse data from JPL MMGIS.
- **Planetary views:** NASA Earth Observatory Blue Marble / Black Marble, NASA Moon Trek LRO WAC and Mars surface imagery.

The map uses Web Mercator through MapLibre. Source imagery is prepared for the map projection during the bake. Distances and terrain calculations use Mars-specific dimensions; 3D terrain is generated in the browser from the prepared elevation data.

Useful standalone scripts:

- `node scripts/make-og.mjs` rebuilds the social/share image.
- `node scripts/try-suggest.mjs` prints planner results against the real Jezero grid.
- `node scripts/bake-roughness.mjs jezero` rebuilds the Jezero roughness grid.
- `node scripts/bake-roughness.mjs gale` rebuilds the Gale roughness grid.

## Run locally

**Requirements:** Node.js 20.19 or newer and npm.

```bash
git clone https://github.com/noman-debug/RedStep.git
cd RedStep
npm install
npm run dev
```

Vite prints the local development URL in the terminal.

To prepare the NASA data locally, run:

```bash
npm run bake
```

To build and test the project:

```bash
npm run build
npm test
```

## Tech stack

- **Vite** and **React 19** for the application.
- **React Router 7** for page routing and lazy-loaded pages.
- **Three.js** for the cinematic Earth/Mars introduction, planetary globe and rocket.
- **MapLibre GL** for the interactive Mars map and 3D terrain.
- **Web Workers** for route search and terrain calculations.
- **Vitest** for automated tests.
- **html-to-image** for exporting the mission brief as a PNG.

## Project structure

```
src/
  components/   shared layout, navigation, map explorer and planner UI
  compute/      terrain grid, slope, pathfinding, walk analysis and worker
  content/      map layers, sites, science stops, assumptions, guide and sources
  data/         data adapters and schemas
  home/         home page, cinematic scene, motion engine and Three.js scene
  lib/          Mars time, ephemeris, advisor, map helpers, quality and utilities
  pages/        map, site planner, guide, habitat, sources, about and mission brief
  styles/       global styles, tokens, fonts and platform/touch styles
scripts/        NASA data baking and project asset utilities
public/         static assets and prepared data
```

## Deployment

The project is configured for **Vercel**. The Vercel configuration builds with `npm run build`, serves the `dist` directory and rewrites application routes to the SPA entry point.

## Team

Add or update team details in `src/content/site.js` (`SITE.team`).
