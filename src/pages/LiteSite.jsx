// Map preview for sites without a detailed height map: real NASA layers, no walk planning.
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import * as maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { corners, marsMetresPerPixel } from '../lib/marsmap.js'
import { siteMeta, siteTraverse, sitePanoramas } from '../data/index.js'
import StreetView from '../components/StreetView.jsx'
import { LayerPanel } from '../components/planner/Panels.jsx'
import { Badge, Source } from '../components/Atoms.jsx'
import './site.css'


const LITE_GROUPS = [
  { id: 'photos', name: 'Maps from orbit', layers: [
    { id: 'viking', name: 'Colour view', plain: 'Mars in colour', mission: 'Viking 1 & 2', instrument: 'VIS cameras', res: '232 m', badge: 'nasa', source: 'viking', on: true, opacity: 1 },
    { id: 'relief', name: 'Height colours', plain: 'Blue low, red and white high', mission: 'MGS + Mars Express', instrument: 'MOLA + HRSC', res: '200 m', badge: 'nasa', source: 'hrsc', on: false, opacity: 0.85 },
  ] },
  { id: 'ground', name: 'Ground type', layers: [
    { id: 'themis-night', name: 'Rock or dust?', plain: 'Bright = rock · dark = dust or sand', mission: 'Mars Odyssey', instrument: 'THEMIS night infrared', res: '100 m', badge: 'nasa', source: 'themisNight', on: false, opacity: 0.8 },
    { id: 'themis-day', name: 'Daytime heat', plain: 'Shows the shape of the land', mission: 'Mars Odyssey', instrument: 'THEMIS day infrared', res: '100 m', badge: 'nasa', source: 'themisDay', on: false, opacity: 0.8 },
  ] },
]

const NOTES = {
  gale: { title: 'Where our radiation numbers come from', text: 'Curiosity’s RAD instrument has measured radiation at the surface here since 2012: about 0.64 mSv per day. Its path climbs Mount Sharp, a 5 km tall mound of layered rock.', source: 'rad' },
  deuteronilus: { title: 'Buried glaciers', text: 'Radar on MRO (SHARAD) found ice under a thin cover of rock and dust here. The SWIM project ranks this area among the best for shallow ice: water, oxygen and rocket fuel for a crew.', source: 'ezWorkshop' },
  protonilus: { title: 'Ice-filled valleys', text: 'Proposed at NASA’s 2015 landing site workshop for its ice-rich valley fills and mesas on the line between Mars’s low north and high south.', source: 'ezWorkshop' },
  mawrth: { title: 'Clay layers', text: 'Thick layers of clay-rich rock formed in water billions of years ago. Clays are good at keeping traces of life.', source: 'ezWorkshop' },
}

export default function LiteSite({ site }) {
  const el = useRef(null)
  const map = useRef(null)
  const scale = useRef(null)
  const [meta, setMeta] = useState(null)
  const [ready, setReady] = useState(false)
  const [pano, setPano] = useState(null)
  const [layers, setLayers] = useState(() => Object.fromEntries(LITE_GROUPS.flatMap((g) => g.layers).map((l) => [l.id, { on: l.on, opacity: l.opacity }])))

  useEffect(() => { siteMeta(site.id).then(setMeta).catch(() => setMeta(false)) }, [site.id])

  useEffect(() => {
    if (!meta) return
    const [w, s, e, n] = meta.bbox
    const m = new maplibregl.Map({
      container: el.current,
      style: { version: 8, sources: {}, layers: [{ id: 'bg', type: 'background', paint: { 'background-color': '#050403' } }] },
      bounds: [[w + 0.3, s + 0.2], [e - 0.3, n - 0.2]],
      maxBounds: [[w - 0.2, s - 0.2], [e + 0.2, n + 0.2]],
      minZoom: 7, maxZoom: 12.5, attributionControl: false, renderWorldCopies: false,
    })
    map.current = m
    m.addControl(new maplibregl.NavigationControl(), 'bottom-right')
    m.addControl(new maplibregl.AttributionControl({ compact: true, customAttribution: 'NASA · JPL-Caltech · USGS · ASU · ESA/DLR/FU Berlin' }), 'bottom-left')
    m.on('load', async () => {
      for (const id of ['viking', 'relief', 'themis-day', 'themis-night']) {
        const L = meta.layers[id]
        m.addSource(`src-${id}`, { type: 'image', url: L.url, coordinates: corners(L.bbox) })
        m.addLayer({ id, type: 'raster', source: `src-${id}`, paint: { 'raster-opacity': layers[id].opacity, 'raster-fade-duration': 0 }, layout: { visibility: layers[id].on ? 'visible' : 'none' } })
      }
      const trav = await siteTraverse(site.id).catch(() => null)
      if (trav) {
        const line = trav.line
        m.addSource('trav', { type: 'geojson', data: { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: line } } })
        m.addLayer({ id: 'trav', type: 'line', source: 'trav', paint: { 'line-color': '#e3895a', 'line-width': 2 } })
      }
      m.addSource('pin', { type: 'geojson', data: { type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: meta.center } } })
      m.addLayer({ id: 'pin-halo', type: 'circle', source: 'pin', paint: { 'circle-radius': 16, 'circle-color': '#e3895a', 'circle-opacity': 0.15 } })
      m.addLayer({ id: 'pin', type: 'circle', source: 'pin', paint: { 'circle-radius': 5, 'circle-color': '#e3895a', 'circle-stroke-color': '#000', 'circle-stroke-width': 1.5 } })
      setReady(true)
    })
    const upd = () => {
      if (!scale.current) return
      const mpp = marsMetresPerPixel(m.getZoom(), m.getCenter().lat)
      const nice = [1000, 2000, 5000, 10000, 20000, 50000].reduce((a, b) => (Math.abs(b - 110 * mpp) < Math.abs(a - 110 * mpp) ? b : a))
      scale.current.style.width = `${nice / mpp}px`
      scale.current.dataset.label = `${nice / 1000} km`
    }
    m.on('move', upd); m.on('load', upd)
    return () => m.remove()
  }, [meta, site.id]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const m = map.current
    if (!ready || !m) return
    for (const [id, st] of Object.entries(layers)) {
      m.setLayoutProperty(id, 'visibility', st.on ? 'visible' : 'none')
      m.setPaintProperty(id, 'raster-opacity', st.opacity)
    }
  }, [layers, ready])

  const note = NOTES[site.id]
  const panoramas = sitePanoramas(site.id)
  return (
    <div className="planner lite">
      <div className="mars-map">
        <div ref={el} className="mars-map-canvas" />
        <div className="mars-scale" aria-hidden="true"><span ref={scale} /></div>
      </div>
      {meta === false && <div className="planner-loading"><span className="micro">Map data missing. Run npm run bake.</span></div>}
      <aside className="side side-left glass" aria-label="Map layers">
        <div className="tabs" role="tablist"><button role="tab" aria-selected="true">Layers</button></div>
        <div className="side-body"><LayerPanel groups={LITE_GROUPS} iceNote={null} state={layers} onToggle={(id, on) => setLayers((L) => ({ ...L, [id]: { ...L[id], on } }))} onOpacity={(id, o) => setLayers((L) => ({ ...L, [id]: { ...L[id], opacity: o } }))} /></div>
      </aside>
      <aside className="side side-right glass lite-card" aria-label={`About ${site.name}`}>
        <div className="side-body">
          <p className="micro lite-kind">{site.kind} · {site.mission}</p>
          <h1 className="lite-title">{site.name}</h1>
          <p className="lite-why">{site.why}</p>
          {note && (
            <div className="lite-note">
              <p className="micro">{note.title} <Source k={note.source} badge="nasa" /></p>
              <p>{note.text}</p>
            </div>
          )}
          {panoramas.length > 0 && (
            <div className="lite-street">
              <p className="micro">Street view · real rover photos <Badge kind="nasa" /></p>
              {panoramas.map((p) => (
                <button key={p.id} type="button" className="btn btn-small" onClick={() => setPano(p)}>Look around {p.name} <span className="arrow">→</span></button>
              ))}
              <p className="lite-street-meta">{panoramas.map((p) => `${p.rover}, sol ${p.sol} · ${p.pia}`).join(' · ')}</p>
            </div>
          )}
          <p className="micro lite-coord">{Math.abs(site.lat).toFixed(2)}°{site.lat >= 0 ? 'N' : 'S'} · {Math.abs(site.lon).toFixed(2)}°{site.lon >= 0 ? 'E' : 'W'} <Badge kind="nasa" /></p>
          <div className="lite-plan">
            <p><b>Walk planning needs a detailed height map.</b> We prepared one for Jezero for this demo. Adding a site means running the bake script on its CTX or HiRISE height map.</p>
            <Link to="/site/jezero" className="btn btn-primary">Plan a walk at Jezero <span className="arrow">→</span></Link>
            <Link to="/map" className="btn">Back to the globe</Link>
          </div>
        </div>
      </aside>
      {pano && <StreetView pano={pano} onClose={() => setPano(null)} />}
    </div>
  )
}
