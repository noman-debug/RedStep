// NASA and USGS tools people can open to look further, linked from the Mars map and the
// Data & sources page. Each says what you will find there.

export const NASA_TOOLS = {
  trek: { name: 'NASA Mars Trek', what: 'Fly over Mars in 3D, measure distances and heights, and switch between dozens of mission maps.', url: 'https://trek.nasa.gov/mars/' },
  usgs: { name: 'USGS Mars interactive maps', what: 'Geologic maps, landing-site studies and mosaics from the USGS Astrogeology team.', url: 'https://astrogeology-usgs.hub.arcgis.com/pages/interactive-maps-mars' },
  m2020raw: { name: 'Perseverance raw images', what: 'Every picture the rover sends back, usually within days of it being taken at Jezero.', url: 'https://mars.nasa.gov/mars2020/multimedia/raw-images/' },
  curiosityPath: { name: "Curiosity's path up Mount Sharp", what: "NASA's map of the route Curiosity planned up the mountain in Gale Crater.", url: 'https://science.nasa.gov/resource/curiositys-proposed-path-up-mount-sharp/' },
  worldview: { name: 'NASA Worldview (Earth)', what: 'Daily satellite views of Earth: compare a dust storm at home with the ones on Mars.', url: 'https://worldview.earthdata.nasa.gov/' },
}

/** The tools worth opening for a site (by site id), most specific first. */
export function toolsFor(siteId) {
  const extra = { jezero: ['m2020raw'], gale: ['curiosityPath'] }[siteId] || []
  return [...extra, 'trek', 'usgs'].map((k) => NASA_TOOLS[k])
}
