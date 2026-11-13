# Redstep — Marswalk Planner

<p align="center">
  <img src="public/icons/mark.svg" alt="Redstep mark" width="88" />
</p>

<h3 align="center">Plan a walk on another world.</h3>

<p align="center">
  Explore Mars. Read its terrain. Plan a route. Understand the risks.
</p>

<p align="center">
  <a href="https://redstep.vercel.app/"><strong>Open the live experience →</strong></a>
  ·
  <a href="https://github.com/noman-debug/RedStep"><strong>Source code</strong></a>
</p>

<p align="center">
  <img src="public/og.png" alt="Redstep — Marswalk Planner" width="720" />
</p>

**Redstep** is an interactive Mars exploration and walk-planning project built for the **NASA Space Apps Challenge 2026 — “Interplanetary Survival Guide: Martian Map.”** Explore a global view of Mars, inspect mission-derived map layers, and plan a rover-supported surface walk with terrain-aware routing, science stops and a clear safety assessment.

> **Project status:** This is an independent student project and research/educational prototype. It is not affiliated with, endorsed by, or certified by NASA. Its route verdicts and survival guidance are simulations based on documented data and editable assumptions — not operational mission advice.

---

## Contents

- [What Redstep does](#what-redstep-does)
- [Explore the experience](#explore-the-experience)
- [Feature guide](#feature-guide)
- [How route planning works](#how-route-planning-works)
- [Data, science and limitations](#data-science-and-limitations)
- [Technology](#technology)
- [Run locally](#run-locally)
- [Commands](#commands)
- [Project structure](#project-structure)
- [Architecture notes](#architecture-notes)
- [Offline and installation support](#offline-and-installation-support)
- [Contributing](#contributing)
- [Roadmap](#roadmap)
- [Team and acknowledgements](#team-and-acknowledgements)
- [License](#license)

---

## What Redstep does

A Mars map is useful for seeing where things are. A Marswalk planner needs to answer a harder question:

**Could a crew walk from a habitat to a destination, do useful science, and still get home within the limits of its suit, terrain and daylight?**

Redstep brings several pieces of that question into one experience:

1. **Explore** the planet through a 3D introduction, a planetary globe and an interactive map.
2. **Inspect** terrain, imagery, surface properties, rover activity and named locations.
3. **Plan** a route manually or ask the planner to suggest one.
4. **Evaluate** slope, ground texture, walking time, suit-air use, return requirements and sunlight.
5. **Learn** what makes a location scientifically interesting and where real rover work has taken place.

Walk planning is currently supported by detailed local terrain datasets for **Jezero Crater** and **Gale Crater**. The global map and other curated locations provide broader exploration context; they do not all have the same route-planning coverage.

## Explore the experience

The screenshots below are project captures included in the repository.

| Experience | Preview |
|---|---|
| Interactive Mars map | ![Mars map](public/home/map.webp) |
| Route planner — before planning | ![Planner before](public/home/planner-before.webp) |
| Route planner — after planning | ![Planner after](public/home/planner-after.webp) |
| Route verdict | ![Route verdict](public/home/verdict.webp) |
| 3D route visor | ![3D route visor](public/home/visor.webp) |

**Try it:** [redstep.vercel.app](https://redstep.vercel.app/)

### Main areas of the app

| Page | What it is for |
|---|---|
| **Home** `/` | Cinematic introduction and entry points into the experience |
| **Mars map** `/map` | Explore Mars in globe and map views, switch map layers and search named features |
| **Site planner** `/site/jezero` | Plan a walk at Jezero Crater |
| **Survival guide** `/guide` | Learn about environmental hazards, mission systems and emergency scenarios |
| **Habitat** `/habitat` | Explore habitat and base-planning assumptions |
| **Data & sources** `/sources` | Review datasets, mission sources and scientific references |
| **About** `/about` | Project background and credits |
| **Mission brief** `/brief` | Review and export a mission plan |
| **CUFF** `/cuff` | Open the CUFF project interface |

The application also includes site-specific pages under `/site/:id`, guide sections under `/guide/:step`, and a not-found page for unknown routes.

---

## Feature guide

### 1. Planetary exploration

- 3D planetary scenes and a cinematic Earth-to-Mars introduction.
- Interactive Mars globe and flat map.
- Colour, elevation, dust and thermal map layers where coverage is available.
- Search across official planetary feature names.
- Map navigation, zooming, pin inspection and site context.
- Mars local-time and day/night information.

### 2. Terrain and rover context

- Detailed terrain products for Jezero and Gale.
- Elevation and derived slope grids for route analysis.
- Surface information derived from thermal imagery.
- A terrain-texture measure used to represent rocky-looking ground.
- Rover traverse paths, waypoints and selected science locations.
- Ground-level panorama views where source imagery is available.

### 3. Marswalk planning

- Suggest a route or draw a route using map waypoints.
- Snap route segments to a lower-cost path through walkable terrain.
- Compare route options and science stops.
- Inspect a **GO**, **CAUTION** or **NO-GO** assessment with its contributing reasons.
- Estimate walking time and suit-air use, including the return journey.
- Account for daylight and a walk-back distance limit.
- Inspect the planned route in a 3D view.
- Export a mission brief.

### 4. Survival and habitat learning

- Interactive guide content about pressure, air, heat, power and other mission concerns.
- Emergency scenario guidance for educational discussion.
- Editable habitat and mission assumptions.
- A habitat/base calculator for exploring planning trade-offs.

**Important:** Survival procedures in this project are educational suggestions, not validated operational procedures. Do not use them as real emergency instructions.

---

## How route planning works

The route planner is designed to make its reasoning inspectable rather than return a route with no explanation.

### Terrain-aware path search

1. The planner loads a site's prepared elevation and ground-property grids.
2. It derives local slope from the elevation grid.
3. Cells beyond the configured maximum slope are treated as non-walkable.
4. Remaining cells receive a movement cost influenced by slope, loose-ground information and the rocky-ground texture measure.
5. A* is used to connect manually selected waypoints; Dijkstra-based searches support route suggestions and repeated path-cost calculations.
6. Diagonal movement is restricted where it would cut across blocked corner cells.

The pathfinder is a planning model. A low-cost grid path does not prove that a real vehicle or astronaut could safely cross every point.

### Mission and walk assessment

The analysis considers configured inputs such as:

- Crew and suit assumptions.
- Walking pace and terrain grade.
- Suit-air consumption and a protected reserve.
- Time spent at science stops.
- Return travel along the route.
- Daylight and minimum solar-elevation constraints.
- Distance from the habitat / walk-back range.
- Rover transfer assumptions where configured.

### Understanding the verdict

| Verdict | Meaning in this prototype |
|---|---|
| **GO** | The route fits the configured checks and assumptions. |
| **CAUTION** | The route may fit, but one or more risk margins or warnings need attention. |
| **NO-GO** | One or more configured limits are exceeded. |

The verdict is only as reliable as its source data, resolution, assumptions and simplified model. It is not a guarantee of safety and must not be interpreted as a NASA mission approval.

### Data labels

Redstep distinguishes three kinds of values in the interface:

- **NASA data** — a value measured or published by a mission or source dataset.
- **Derived** — a value calculated by Redstep from source data.
- **Illustrative** — an editable assumption used to explore a possible mission.

This distinction matters: a computed estimate is not the same thing as a direct measurement.

---

## Data, science and limitations

The app's **Data & sources** page is the authoritative in-product source list. The following is a high-level overview of the data pipeline and source families.

| Source / mission | How it is used |
|---|---|
| USGS Astrogeology Mars 2020 CTX terrain products | Jezero elevation and orthographic imagery |
| Mars Reconnaissance Orbiter — CTX and HiRISE | Regional and close-up surface imagery; terrain context |
| Mars Global Surveyor — MOLA | Global elevation context |
| Mars Global Surveyor — TES | Global dust information |
| Mars Odyssey — THEMIS | Day/night thermal context |
| Viking orbiters | Global colour imagery |
| ESA Mars Express — HRSC | Regional elevation / shaded-relief context in blended products |
| NASA JPL MMGIS — Perseverance and Curiosity | Rover traverses and waypoints |
| NASA Earth Observatory — Blue Marble / Black Marble | Earth imagery in the introduction |
| Lunar Reconnaissance Orbiter — LROC WAC | Moon imagery in the introduction |
| IAU / USGS planetary nomenclature | Named planetary features |

### Data preparation

Prepared datasets are served from `public/data/`. The scripts in `scripts/` build and transform source products for use by the app.

- `scripts/bake-site.mjs` prepares planetary textures and site/map datasets.
- `scripts/bake-roughness.mjs` derives a terrain-texture roughness grid for a supported site.
- `scripts/make-lite.mjs` and the other asset scripts support generated project assets.

The normal development workflow uses the prepared data already present in the repository. Re-running the bake pipeline is only necessary when rebuilding or updating those prepared datasets.

### Scientific limitations

- Global layers and local high-resolution datasets have different resolutions and coverage.
- The planner works on gridded terrain; small hazards may be absent or averaged out.
- The roughness layer is a texture/contrast measure, **not a direct boulder detector**.
- Thermal and dust layers are proxies for surface properties, not a complete real-time weather report.
- Radiation, daylight, walking and suit-life calculations use simplified models and assumptions.
- The app does not receive live rover telemetry or live mission-control data.
- A suggested path is a computational result, not a certified route.

For dataset-specific product names, resolutions, attribution and scientific references, use the in-app [Data & sources page](https://redstep.vercel.app/sources) and the source definitions in `src/content/sources.js`.

---

## Technology

| Technology | Role |
|---|---|
| [React 19](https://react.dev/) | Component-based user interface |
| [Vite](https://vite.dev/) | Development server and production build |
| [React Router](https://reactrouter.com/) | Client-side page routing and lazy-loaded pages |
| [Three.js](https://threejs.org/) | 3D planetary scenes and visualisation |
| [MapLibre GL](https://maplibre.org/) | Interactive map rendering |
| Web Workers | Run terrain preparation and route calculations away from the main UI thread |
| [Vitest](https://vitest.dev/) | Automated unit tests |
| [Sharp](https://sharp.pixelplumbing.com/) | Image processing in data/asset preparation scripts |
| [GeoTIFF](https://geotiffjs.github.io/) | Reading source elevation rasters during data preparation |
| [html-to-image](https://github.com/bubkoo/html-to-image) | Mission-brief image export |

The project uses JavaScript ES modules and JSX. Its source code is under `src/`; static files and prepared data are under `public/`.

---

## Run locally

### Requirements

- **Node.js 20.19 or newer** (as declared in `package.json`).
- npm.
- Git.
- A modern browser with WebGL support for the full 3D experience.

### 1. Clone the repository

```bash
git clone https://github.com/noman-debug/RedStep.git
cd RedStep
```

If you already have your fork cloned:

```bash
git pull origin main
```

### 2. Install dependencies

```bash
npm install
```

### 3. Start the development server

```bash
npm run dev
```

Open the local URL printed by Vite in your terminal (normally `http://localhost:5173`).

### 4. Create a production build

```bash
npm run build
```

The production files are written to `dist/`.

### 5. Preview the production build

```bash
npm run preview
```

### 6. Run the test suite

```bash
npm test
```

No environment file is required for the default baked-data setup.

### Optional: rebuild prepared map data

The repository includes prepared data under `public/data/`, so you do **not** need to run this just to start the app.

To rebuild the data products:

```bash
npm run bake
```

This runs the site-data bake and roughness preparation for Jezero and Gale. It uses external NASA/USGS source products and may take time and require an internet connection. Keep the generated files and their source attribution in sync when changing the data pipeline.

---

## Commands

| Command | Description |
|---|---|
| `npm run dev` | Start the Vite development server |
| `npm run build` | Build the production app into `dist/` |
| `npm run preview` | Preview the production build locally |
| `npm test` | Run Vitest tests once |
| `npm run bake` | Rebuild prepared site data and roughness grids |
| `npm run deploy` | Run the repository's configured Vercel CLI deployment command |

**Deployment note:** The `deploy` script contains a project-specific Vercel scope and project name. For a different Vercel account or project, configure deployment in your own Vercel project rather than assuming that command will work unchanged.

---

## Project structure

A guide to the main source folders:

```text
RedStep/
├── public/
│   ├── data/                 # Prepared Mars, Earth, Moon and site datasets
│   ├── home/                 # README/homepage preview images
│   ├── icons/                # App icons and mark
│   └── og.png                # Social preview image
├── scripts/
│   ├── bake-site.mjs         # Prepare planetary and site data
│   ├── bake-roughness.mjs    # Derive rocky-ground texture grid
│   └── ...                   # Image, asset and development utilities
├── src/
│   ├── components/           # Shared UI, map explorer and planner panels
│   ├── compute/              # Terrain grid, pathfinding and walk analysis
│   ├── content/              # Site copy, guide content, assumptions and sources
│   ├── data/                 # Data adapters, loading and schema validation
│   ├── home/                 # Landing page, motion engine and Three.js scene
│   │   └── three/            # Planetary scene, shaders, baking and rocket rig
│   ├── lib/                  # Mars time, ephemeris, quality and shared utilities
│   ├── pages/                # Map, site, guide, habitat, sources and other pages
│   └── styles/               # Design tokens, base styles and platform styles
├── docs/                     # Data schema and project notes
├── index.html                # HTML entry point and metadata
├── package.json              # Dependencies and npm scripts
├── vite.config.js            # Vite and offline service-worker build
└── vercel.json               # Vercel build and SPA routing configuration
```

### Where to start reading the code

| If you want to change… | Start here |
|---|---|
| Site name, tagline, team credits and navigation | `src/content/site.js` |
| Home page story and layout | `src/home/HomePage.jsx` and `src/home/home.css` |
| 3D home scene and rocket | `src/home/three/` |
| Map layers and site content | `src/content/layers.js`, `src/content/sites.js`, `src/content/places.js` |
| Data loading and validation | `src/data/index.js`, `src/data/schema.js` |
| Terrain calculations | `src/compute/grid.js` |
| Route search | `src/compute/pathfind.js`, `src/compute/planner.js` |
| Walking and mission analysis | `src/compute/walk.js` |
| Background route worker | `src/compute/worker.js` |
| Scientific sources | `src/content/sources.js` |
| Device quality selection | `src/lib/quality.js` |

For the data adapter contract, see [docs/data-schema.md](docs/data-schema.md).

---

## Architecture notes

At a high level, the app follows this flow:

```text
NASA / USGS source products
          │
          ▼
 scripts/ data preparation
          │
          ▼
     public/data/
          │
          ▼
 src/data/ adapter + schema validation
          │
          ├──────────────► Map and 3D visualisation
          │
          ▼
   Terrain grid in Web Worker
          │
          ▼
 Slope + ground-cost calculations
          │
          ▼
    A* / Dijkstra path search
          │
          ▼
 Walk, daylight and suit-air analysis
          │
          ▼
 Route verdict + mission brief
```

The data layer is intentionally separated from the UI. Pages access terrain, sites, places, hazards and rover paths through `src/data/index.js`, which uses the baked data adapter and validates returned shapes against the schemas.

The route worker loads the site's terrain, derives slope and creates the planner. Route requests are then handled in the worker so expensive searches do not block normal map interaction.

---

## Offline and installation support

The production build generates a service worker. It precaches the app shell and a selected set of core assets and Jezero data, then caches additional supported resources as they are used.

A few practical notes:

- Open the deployed app once while online before expecting offline use.
- Offline availability depends on which pages and datasets have already been cached.
- Large imagery and some site datasets may be fetched the first time they are opened.
- Development mode does not register the production service worker.
- Clearing browser storage or site data removes the local cache.

The app also includes a web app manifest and icons for supported install-to-home-screen flows.

---

## Contributing

Contributions, bug reports and thoughtful suggestions are welcome.

### A useful contribution workflow

1. Fork the repository.
2. Create a branch for your change.
3. Install dependencies with `npm install`.
4. Make a focused change.
5. Run `npm test` and `npm run build`.
6. Include screenshots or a short recording for visible UI changes.
7. Open a pull request describing the problem, the solution and how you tested it.

Example:

```bash
git checkout -b feat/describe-your-change
npm install
npm test
npm run build
git add .
git commit -m "Describe the change"
git push -u origin feat/describe-your-change
```

### Contribution guidelines

- Keep scientific claims traceable to a source.
- Distinguish measured data, derived calculations and illustrative assumptions.
- Do not present model estimates as live telemetry or certified safety guidance.
- Preserve attribution and licensing notes for datasets and media.
- Avoid committing `node_modules/`, `dist/`, raw source downloads or local secrets.
- Do not commit API keys, tokens or private credentials.
- For performance changes, test on both a capable device and a lower-powered device when possible.
- For route-planning changes, add or update tests for the relevant calculations and edge cases.

If you are unsure whether a change belongs in the project, open an issue or discussion before doing extensive work.

---

## Roadmap

This is a direction-of-work list, not a promise that every item is already implemented or scheduled.

- [ ] Expand and document route-planning coverage beyond the currently supported detailed sites.
- [ ] Improve route-model validation against rover traverse data and publish clearer evaluation results.
- [ ] Add more automated tests around terrain edge cases and mission assumptions.
- [ ] Improve low-end-device rendering and adaptive visual quality.
- [ ] Expand documentation for data preparation, scientific methods and model limitations.
- [ ] Improve accessibility, keyboard navigation and reduced-motion support.
- [ ] Add clearer in-app explanations for uncertainty and data resolution.

Completed items should be moved into release notes or project history rather than left as unchecked roadmap promises.

---

## Team and acknowledgements

Redstep is a **Loadstone project** created for the NASA Space Apps Challenge 2026.

Team names and roles are maintained in `src/content/site.js` (`SITE.team`) and displayed by the About page when entries are provided. This README intentionally does not invent contributor names or roles.

We acknowledge the public scientific datasets and mission products from NASA, USGS, ESA, DLR, the University of Arizona, Arizona State University and the teams who maintain the planetary mapping resources used by the project. Please see `src/content/sources.js` and the in-app Sources page for detailed product-level attribution.

## License

There is currently **no `LICENSE` file in this repository**. Until the project maintainers add one, do not assume that the Redstep source code is available for unrestricted reuse, modification or redistribution.

Individual NASA and USGS source products may have their own public-domain status, while third-party products can carry separate terms. Refer to the attribution and licence information for each source before reusing its data or media.

---

<p align="center">
  <strong>Redstep</strong><br />
  <em>Plan a walk on another world.</em><br />
  <a href="https://redstep.vercel.app/">Explore the live project</a>
</p>
