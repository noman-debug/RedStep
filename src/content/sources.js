// Every data product and fact source used in the app. Shown on /sources and in tooltips.
// licence: NASA/USGS products are US Government works, not copyrighted (NASA media guidelines).
const PD = 'Public domain (US Government work)'

export const DATA = [
  {
    id: 'ctxDem', group: 'Maps', name: 'Jezero height map (20 m)', plain: 'How high the ground is, every 20 m',
    mission: 'Mars Reconnaissance Orbiter', instrument: 'CTX stereo, controlled to MOLA', resolution: '20 m/pixel (we use 40 m)',
    product: 'JEZ_ctx_B_soc_008_DTM_MOLAtopography_DeltaGeoid_20m', by: 'USGS Astrogeology for the Mars 2020 landing system (Fergason et al. 2020)',
    url: 'https://astrogeology.usgs.gov/search/map/mars_2020_terrain_relative_navigation_ctx_dtm_mosaic', licence: PD, badge: 'nasa',
  },
  {
    id: 'ctxPhoto', group: 'Maps', name: 'Jezero photo map (6 m)', plain: 'Black-and-white photo of the ground from orbit',
    mission: 'Mars Reconnaissance Orbiter', instrument: 'CTX', resolution: '6 m/pixel (shown at about 8 m)',
    product: 'JEZ_ctx_B_soc_008_orthoMosaic_6m', by: 'USGS Astrogeology', url: 'https://astrogeology.usgs.gov/search/map/mars_2020_terrain_relative_navigation_ctx_orthorectified_image_mosaic', licence: PD, badge: 'nasa',
  },
  {
    id: 'hirise', group: 'Maps', name: 'Jezero close-up photo', plain: 'The sharpest view: rocks, ripples and tracks',
    mission: 'Mars Reconnaissance Orbiter', instrument: 'HiRISE', resolution: '25 cm/pixel (shown at about 1.3 m)',
    product: 'JEZ_hirise_soc_006_orthoMosaic_25cm', by: 'USGS Astrogeology / University of Arizona, via NASA Mars Trek', url: 'https://trek.nasa.gov/mars/', licence: PD, badge: 'nasa',
  },
  {
    id: 'viking', group: 'Maps', name: 'Global colour map', plain: 'What Mars looks like from orbit',
    mission: 'Viking 1 and 2 orbiters', instrument: 'Visual Imaging Subsystem', resolution: '232 m/pixel',
    product: 'Mars_Viking_MDIM21_ClrMosaic_global_232m', by: 'USGS, via NASA Mars Trek', url: 'https://trek.nasa.gov/mars/', licence: PD, badge: 'nasa',
  },
  {
    id: 'mola', group: 'Maps', name: 'Global height colours', plain: 'Low ground blue, high ground red and white',
    mission: 'Mars Global Surveyor', instrument: 'MOLA laser altimeter', resolution: '463 m/pixel',
    product: 'Mars_MGS_MOLA_ClrShade_merge_global_463m', by: 'NASA GSFC / USGS, via NASA Mars Trek', url: 'https://trek.nasa.gov/mars/', licence: PD, badge: 'nasa',
  },
  {
    id: 'hrsc', group: 'Maps', name: 'Regional shaded relief', plain: 'Hills and craters around Jezero',
    mission: 'Mars Global Surveyor + ESA Mars Express', instrument: 'MOLA + HRSC blended heights', resolution: '200 m/pixel',
    product: 'Mars_MOLA_blend200ppx_HRSC_ClrShade_clon0dd_200mpp', by: 'USGS / ESA / DLR / FU Berlin, via NASA Mars Trek', url: 'https://trek.nasa.gov/mars/', licence: 'NASA/USGS public domain; HRSC data ESA/DLR/FU Berlin (CC BY-SA 3.0 IGO)', badge: 'nasa',
  },
  {
    id: 'themisNight', group: 'Ground type', name: 'Night heat map', plain: 'Warm at night = solid rock. Cold at night = loose dust and sand',
    mission: 'Mars Odyssey', instrument: 'THEMIS night infrared', resolution: '100 m/pixel',
    product: 'THEMIS_NightIR_ControlledMosaics_100m_v2_oct2018', by: 'Arizona State University / NASA, via Mars Trek', url: 'https://trek.nasa.gov/mars/', licence: PD, badge: 'nasa',
  },
  {
    id: 'themisDay', group: 'Ground type', name: 'Day heat map', plain: 'Sunny slopes warm, shaded slopes cool; good for seeing shape',
    mission: 'Mars Odyssey', instrument: 'THEMIS day infrared', resolution: '100 m/pixel',
    product: 'THEMIS_DayIR_ControlledMosaics_100m_v2_oct2018', by: 'Arizona State University / NASA, via Mars Trek', url: 'https://trek.nasa.gov/mars/', licence: PD, badge: 'nasa',
  },
  {
    id: 'tesDust', group: 'Ground type', name: 'Global dust map', plain: 'Where Mars is covered in fine dust',
    mission: 'Mars Global Surveyor', instrument: 'TES', resolution: 'about 7 km/pixel', product: 'TES_Dust (dust cover index)',
    by: 'NASA / Arizona State University, via Mars Trek', url: 'https://trek.nasa.gov/mars/', licence: PD, badge: 'nasa',
  },
  {
    id: 'traverse', group: 'Rovers', name: 'Perseverance’s real path', plain: 'Every drive the rover has made',
    mission: 'Mars 2020 Perseverance', instrument: 'Rover localisation', resolution: 'metres',
    product: 'M20_traverse.json + M20_waypoints.json', by: 'NASA JPL MMGIS', url: 'https://mars.nasa.gov/maps/location/?mission=M20', licence: PD, badge: 'nasa',
  },
  {
    id: 'samples', group: 'Rovers', name: 'Perseverance rock samples', plain: 'Which rocks were collected, where and when',
    mission: 'Mars 2020 Perseverance', instrument: 'Sampling system', resolution: '—',
    product: 'Mars rock samples list', by: 'NASA', url: 'https://science.nasa.gov/mission/mars-2020-perseverance/mars-rock-samples/', licence: PD, badge: 'nasa',
  },
  {
    id: 'galeDem', group: 'Maps', name: 'Gale height map (1 m)', plain: 'How high the ground is on Mount Sharp, from HiRISE stereo photos',
    mission: 'Mars Reconnaissance Orbiter', instrument: 'HiRISE stereo', resolution: '1 m/pixel (we read the 8 m overview and use 40 m)',
    product: 'MSL_Gale_DEM_Mosaic_1m_v3', by: 'USGS Astrogeology for the Curiosity mission (Calef and Parker 2016)', url: 'https://astrogeology.usgs.gov/search/map/msl_gale_crater_digital_elevation_model_mosaic', licence: PD, badge: 'nasa',
  },
  {
    id: 'galeHirise', group: 'Maps', name: 'Gale photo map', plain: 'Black-and-white photo of Curiosity\u2019s area from orbit',
    mission: 'Mars Reconnaissance Orbiter', instrument: 'HiRISE', resolution: '25 cm/pixel (shown at about 10 m, and 1.3 m near the boxwork)',
    product: 'curiosity_hirise_mosaic', by: 'USGS Astrogeology / University of Arizona, via NASA Mars Trek', url: 'https://trek.nasa.gov/mars/', licence: PD, badge: 'nasa',
  },
  {
    id: 'mslTraverse', group: 'Rovers', name: 'Curiosity\u2019s real path', plain: 'Every drive the rover has made since 2012',
    mission: 'Mars Science Laboratory (Curiosity)', instrument: 'Rover localisation', resolution: 'metres',
    product: 'MSL_traverse.json + MSL_waypoints.json', by: 'NASA JPL MMGIS', url: 'https://mars.nasa.gov/maps/location/?mission=MSL', licence: PD, badge: 'nasa',
  },
  {
    id: 'mslStops', group: 'Rovers', name: 'Curiosity science stops', plain: 'Where Curiosity drilled and studied rocks on Mount Sharp',
    mission: 'Mars Science Laboratory (Curiosity)', instrument: 'Mastcam, APXS, drill', resolution: '\u2014',
    product: 'JPL news, NASA Photojournal and the Curiosity team blog', by: 'NASA / JPL', url: 'https://science.nasa.gov/mission/msl-curiosity/', licence: PD, badge: 'nasa',
  },
  {
    id: 'globeEarth', group: 'Home page', name: 'Earth day and night', plain: 'Earth pictures in the opening scene',
    mission: 'Terra MODIS; Suomi NPP VIIRS', instrument: 'Blue Marble; Black Marble 2016', resolution: 'resampled to 2048 px',
    product: 'land_shallow_topo_2048, BlackMarble_2016_01deg', by: 'NASA Earth Observatory', url: 'https://earthobservatory.nasa.gov/features/NightLights', licence: PD, badge: 'nasa',
  },
  {
    id: 'globeMoon', group: 'Home page', name: 'Moon map', plain: 'Moon picture in the opening scene',
    mission: 'Lunar Reconnaissance Orbiter', instrument: 'LROC Wide Angle Camera', resolution: 'resampled to 2048 px',
    product: 'LRO_WAC_Mosaic_Global_303ppd_v02', by: 'NASA / ASU, via Moon Trek', url: 'https://trek.nasa.gov/moon/', licence: PD, badge: 'nasa',
  },
]

export const FACT_SOURCES = {
  rad: { title: 'Hassler et al. 2014, Mars’ surface radiation environment measured with the Mars Science Laboratory’s Curiosity rover, Science 343', url: 'https://doi.org/10.1126/science.1244797' },
  radCruise: { title: 'Zeitlin et al. 2013, Measurements of energetic particle radiation in transit to Mars, Science 340', url: 'https://doi.org/10.1126/science.1235989' },
  nasaStd: { title: 'NASA OCHMO technical brief on NASA-STD-3001 radiation protection: 600 mSv career limit', url: 'https://www.nasa.gov/wp-content/uploads/2023/03/radiation-protection-technical-brief-ochmo.pdf' },
  marsFacts: { title: 'NASA Science: Mars facts', url: 'https://science.nasa.gov/mars/facts/' },
  nssdc: { title: 'NASA NSSDC Mars fact sheet', url: 'https://nssdc.gsfc.nasa.gov/planetary/factsheet/marsfact.html' },
  dustStorms: { title: 'NASA NTRS: Similarities and differences of global dust storms in MY 25, 28 and 34 (dusty "perihelion season" Ls 180–360)', url: 'https://ntrs.nasa.gov/citations/20210012819' },
  dustFacts: { title: 'NASA: The fact and fiction of Martian dust storms', url: 'https://www.nasa.gov/solar-system/the-fact-and-fiction-of-martian-dust-storms/' },
  dustOnset2018: { title: 'Sánchez-Lavega et al. 2019, The onset and growth of the 2018 Martian global dust storm (onset Ls ~185°–190°)', url: 'https://arxiv.org/abs/1906.00963' },
  mdad: { title: 'Battalio & Wang 2021, The Mars Dust Activity Database (MDAD), Icarus 354, 114059: 14,974 storms, MY 24 Ls 150° to MY 32 Ls 171°', url: 'https://people.earth.yale.edu/sites/default/files/battalio_wang_2021_the_mars_dust_activity_database_mdad.pdf' },
  curiosity2018: { title: 'NASA: Martian dust storm grows global; Curiosity captures photos of thickening haze (tau above 8.0 at Gale)', url: 'https://www.nasa.gov/missions/martian-dust-storm-grows-global-curiosity-captures-photos-of-thickening-haze/' },
  opportunityEnd: { title: "NASA: NASA's Opportunity rover mission on Mars comes to end (last signal 10 June 2018)", url: 'https://science.nasa.gov/missions/mer/nasas-opportunity-rover-mission-on-mars-comes-to-end/' },
  dustRegional: { title: 'Kass et al. 2016, Interannual similarity in the Martian atmosphere during the dust storm season (A/B/C regional storms)', url: 'https://doi.org/10.1002/2016GL068978' },
  mars24: { title: 'NASA GISS Mars24 algorithm (Allison & McEwen 2000)', url: 'https://www.giss.nasa.gov/tools/mars24/help/algorithm.html' },
  meeus: { title: 'Meeus, Astronomical Algorithms (2nd ed.), ch. 25: Earth’s position', url: 'https://www.willbell.com/math/mc1.htm' },
  donki: { title: 'NASA CCMC Space Weather Database Of Notifications, Knowledge, Information (DONKI)', url: 'https://kauai.ccmc.gsfc.nasa.gov/DONKI/' },
  spacewalks: { title: 'NASA: Space station spacewalks log (two astronauts per spacewalk)', url: 'https://www.nasa.gov/international-space-station/space-station-spacewalks/' },
  dra5: { title: 'NASA SP-2009-566, Human Exploration of Mars Design Reference Architecture 5.0 (pressurised rovers used in pairs for mutual rescue)', url: 'https://www.nasa.gov/wp-content/uploads/2015/09/373665main_nasa-sp-2009-566.pdf' },
  lrv: { title: 'NASA NSSDCA: Apollo Lunar Roving Vehicle (drive distances, times and range from the lander)', url: 'https://nssdc.gsfc.nasa.gov/planetary/lunar/apollo_lrv.html' },
  pandolf: { title: 'Pandolf, Givoni & Goldman 1977, Predicting energy expenditure with loads while standing or walking very slowly, J Appl Physiol 43', url: 'https://doi.org/10.1152/jappl.1977.43.4.577' },
  tobler: { title: 'Tobler 1993, Three presentations on geographical analysis and modeling (hiking function)', url: 'https://escholarship.org/uc/item/05r820mz' },
  ezWorkshop: { title: 'NASA First Landing Site / Exploration Zone Workshop for Human Missions to Mars, Oct 2015 (abstracts)', url: 'https://www.nasa.gov/wp-content/uploads/2015/06/mars-c-abstracts_in_order_of_presentation10242015_0.pdf' },
  moxie: { title: 'NASA: MOXIE completes its mission (Sept 2023), up to 12 g of oxygen per hour', url: 'https://www.nasa.gov/missions/mars-2020-perseverance/perseverance-rover/nasas-oxygen-generating-experiment-moxie-completes-mars-mission/' },
  issWater: { title: 'NASA: ISS achieves 98% water recovery (2023)', url: 'https://www.nasa.gov/missions/station/iss-research/nasa-achieves-water-recovery-milestone-on-international-space-station/' },
  o2Need: { title: 'NASA Life Support Baseline Values and Assumptions Document (BVAD), 2022: ~0.82–0.84 kg O₂ per crew member per day', url: 'https://ntrs.nasa.gov/citations/20210024855' },
  perchlorate: { title: 'Hecht et al. 2009, Detection of perchlorate at the Phoenix lander site, Science 325', url: 'https://doi.org/10.1126/science.1172466' },
  leshin: { title: 'Leshin et al. 2013, Volatile, isotope, and organic analysis of martian fines with the Mars Curiosity rover, Science 341 (about 2% water by mass)', url: 'https://doi.org/10.1126/science.1238937' },
  goudge: { title: 'Goudge et al. 2015, Assessing the mineralogy of the watershed and fan deposits of the Jezero crater paleolake system, JGR Planets 120', url: 'https://doi.org/10.1002/2014JE004782' },
  xray: { title: 'RadiologyInfo (ACR/RSNA): chest X-ray about 0.1 mSv', url: 'https://www.radiologyinfo.org/en/info/safety-xray' },
  emu: { title: 'NASA Office of Inspector General IG-17-018: the ISS suit backpack supplies oxygen for up to 7 hours', url: 'https://oig.nasa.gov/docs/IG-17-018.pdf' },
  soyuz: { title: 'NASA ISS blog, 30 Aug 2018: crew finds and seals a small leak in Soyuz MS-09', url: 'https://www.nasa.gov/blogs/spacestation/2018/08/30/international-space-station-status-3/' },
  apollo13: { title: 'NASA: Apollo 13 mission overview', url: 'https://www.nasa.gov/mission/apollo-13/' },
  eva23: { title: 'NASA: US EVA 23 water-in-helmet mishap investigation (2013)', url: 'https://ntrs.nasa.gov/citations/20140013323' },
  mir: { title: 'NASA History: 25 years ago, fire aboard space station Mir', url: 'https://www.nasa.gov/history/25-years-ago-fire-aboard-space-station-mir/' },
  bone: { title: 'NASA: risk of spaceflight-induced bone changes (about 1–1.5% density loss per month)', url: 'https://www.nasa.gov/reference/risk-of-spaceflight-induced-bone-changes/' },
  analog: { title: 'HI-SEAS and Mars-500 isolation studies', url: 'https://hi-seas.org/' },
  edl: { title: 'NASA JPL: Perseverance entry, descent and landing (about 7 minutes; enters at about 19,500 km/h)', url: 'https://science.nasa.gov/mission/mars-2020-perseverance/' },
}

export const factSource = (k) => FACT_SOURCES[k]
