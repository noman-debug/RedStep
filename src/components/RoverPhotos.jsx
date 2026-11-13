// The latest raw photos from a rover, live from NASA's public raw-image feeds.
import { useEffect, useState } from 'react'

const FEEDS = {
  // Perseverance (Mars 2020) at Jezero Crater
  m2020: {
    url: 'https://mars.nasa.gov/rss/api/?feed=raw_images&category=mars2020&feedtype=json&num=40&page=0&order=sol+desc',
    page: 'https://mars.nasa.gov/mars2020/multimedia/raw-images/',
    rover: 'Perseverance',
    read: (d) => (d.images || [])
      .filter((i) => i.sample_type === 'Full' && i.image_files?.small)
      .map((i) => ({ id: i.imageid, src: i.image_files.small, big: i.image_files.large || i.image_files.medium, sol: i.sol, cam: i.camera?.instrument, when: i.date_taken_utc, link: i.link })),
  },
  // Curiosity (MSL) at Gale Crater
  msl: {
    url: 'https://mars.nasa.gov/api/v1/raw_image_items/?order=sol%20desc,date_taken%20desc&per_page=150&page=0&condition_1=msl:mission',
    page: 'https://mars.nasa.gov/msl/multimedia/raw-images/',
    rover: 'Curiosity',
    read: (d) => (d.items || [])
      // this feed leaves sample_type empty; skip only what it marks as thumbnails
      .filter((i) => (i.https_url || i.url) && !/thumb/i.test(i.sample_type || ''))
      .map((i) => ({ id: i.imageid || i.id, src: i.https_url || i.url, big: i.https_url || i.url, sol: i.sol, cam: i.instrument, when: i.date_taken, link: i.link })),
  },
}

const CAM = (c = '') => c.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (m) => m.toUpperCase())
const day = (iso) => (iso ? new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '')

export default function RoverPhotos({ mission }) {
  const feed = FEEDS[mission]
  const [state, setState] = useState({ items: null, error: false })

  useEffect(() => {
    if (!feed) return undefined
    const ctl = new AbortController()
    setState({ items: null, error: false })
    fetch(feed.url, { signal: ctl.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(r.status))))
      .then((d) => {
        // a spread of cameras, newest first, rather than 8 frames from one camera
        const perCam = new Map(), items = []
        for (const i of feed.read(d)) {
          const n = perCam.get(i.cam) || 0
          if (n >= 2 || items.length >= 8) continue
          perCam.set(i.cam, n + 1)
          items.push(i)
        }
        setState({ items, error: !items.length })
      })
      .catch((e) => { if (e.name !== 'AbortError') setState({ items: [], error: true }) })
    return () => ctl.abort()
  }, [feed])

  if (!feed) return null
  const { items, error } = state
  const latest = items?.[0]
  return (
    <section className="rp" aria-label={`Latest raw photos from ${feed.rover}`}>
      <p className="rp-head">
        <b>Latest from {feed.rover}</b>
        {latest && <span>Sol {latest.sol} · {day(latest.when)}</span>}
      </p>
      {error && <p className="rp-note">NASA's photo feed did not answer. <a href={feed.page} target="_blank" rel="noreferrer">See the photos on NASA's site ↗</a></p>}
      {!items && !error && <div className="rp-grid" aria-busy="true">{Array.from({ length: 6 }, (_, k) => <i key={k} className="rp-ph" />)}</div>}
      {items?.length > 0 && (
        <ul className="rp-grid">
          {items.map((i) => (
            <li key={i.id}>
              <a href={i.big} target="_blank" rel="noreferrer" title={`${CAM(i.cam)}, sol ${i.sol}`}>
                <img src={i.src} alt={`${feed.rover} raw photo, ${CAM(i.cam)}, sol ${i.sol}`} loading="lazy" decoding="async" />
                <span>{CAM(i.cam)}</span>
              </a>
            </li>
          ))}
        </ul>
      )}
      <p className="rp-note">Raw, unprocessed images, shown as NASA publishes them. Credit: NASA/JPL-Caltech. <a href={feed.page} target="_blank" rel="noreferrer">All raw images ↗</a></p>
    </section>
  )
}

/** NASA's map of Curiosity's planned route up Mount Sharp (PIA23179). */
export function CuriosityRoute() {
  return (
    <figure className="rp-route">
      <img
        src="https://assets.science.nasa.gov/content/dam/science/psd/mars/resources/detail_files/2/22472_PIA23179-combo-rev_main.gif/jcr:content/renditions/cq5dam.web.1280.1280.gif"
        alt="Animated NASA map of Curiosity's proposed route up lower Mount Sharp, labelling the regions scientists want to explore"
        loading="lazy"
        width="1041"
        height="586"
      />
      <figcaption>Curiosity's proposed route up Mount Sharp. NASA/JPL-Caltech/ESA/Univ. of Arizona (PIA23179). <a href="https://science.nasa.gov/resource/curiositys-proposed-path-up-mount-sharp/" target="_blank" rel="noreferrer">Source ↗</a></figcaption>
    </figure>
  )
}
