import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import MarsGlobeHero from './MarsGlobeHero.jsx';
import Badge from './Badge.jsx';
import { deviceTier } from '../lib/quality.js';
import { createMotionEngine, windowed, smoothstep } from './motionEngine.js';
import { marsTime, localSolarTime, solarElevation, earthMarsLightTime, formatHM } from './mars24.js';
import { FOOTER_NAV } from '../content/site.js';
import { HOME, SITE, LANDING_SITES, DEFAULT_SITE_ID, SOURCES, CONSTANTS, SLOPE_THRESHOLDS, EVA_DEFAULTS, getSite } from './content.js';
import './boundary.css';
import './home.css';

const CHAPTER_WINDOWS = {
  hero: [-1, -0.5, 0.07, 0.14],
  layers: [0.15, 0.21, 0.33, 0.39],
  cruise: [0.4, 0.46, 0.56, 0.62],
  arrive: [0.63, 0.68, 0.76, 0.82],
  choose: [0.84, 0.91, 2, 3],
};
const RAIL = [0, 0.27, 0.51, 0.95];
// The end of the story is the real Mars map: the same component as the /map page.
const Explorer = lazy(() => import('../components/Explorer.jsx'));

export default function HomePage() {
  const [engine] = useState(() => createMotionEngine());
  const rootRef = useRef(null);
  const trackRef = useRef(null);
  const heroRef = useRef(null);
  const tele = useRef({});
  // mapOn: the Mars map is loaded (from the cruise on, so it is ready on arrival)
  // atMars: the rocket has arrived and the map is showing; mapReady: its first frame is drawn
  const [mapOn, setMapOn] = useState(false);
  const [atMars, setAtMars] = useState(false);
  const [mapReady, setMapReady] = useState(false);

  /* Engine → CSS variables (no React renders per frame) */
  useEffect(() => {
    const root = rootRef.current;
    engine.attach(trackRef.current);
    if (import.meta.env.DEV) window.__marswalk = engine;

    // Every visit opens with the launch: the page holds still at the top until the rocket is
    // away, then the headline and the ways in appear. (Reduced motion skips straight to the end.)
    // (and stop the browser restoring an old scroll position after we reset it)
    const restore = history.scrollRestoration;
    history.scrollRestoration = 'manual';
    window.scrollTo(0, 0);
    document.documentElement.classList.add('intro-lock');
    engine.playIntro();

    let lastChoose = null;
    let lastIntroDone = null;
    let lastRail = -1;
    const railItems = root.querySelectorAll('[data-rail]');
    const chapterEls = [...root.querySelectorAll('[data-chapter]')].map((el) => ({ el, key: el.dataset.chapter, on: null }));
    const unsub = engine.subscribe((s) => {
      const p = s.progress;
      const st = root.style;
      st.setProperty('--p', p.toFixed(4));
      st.setProperty('--intro', s.intro.toFixed(4));
      const w = {};
      for (const key of Object.keys(CHAPTER_WINDOWS)) {
        w[key] = windowed(p, ...CHAPTER_WINDOWS[key]);
        st.setProperty(`--w-${key}`, w[key].toFixed(4));
      }
      for (const c of chapterEls) {
        const on = w[c.key] > 0.3;
        if (on !== c.on) {
          c.el.dataset.on = on ? 'true' : 'false';
          c.on = on;
        }
      }
      if (p > 0.6) setMapOn(true);
      st.setProperty('--thrust', smoothstep(0.42, 0.66, s.intro).toFixed(3));

      const choose = p > 0.88;
      if (choose !== lastChoose) {
        root.dataset.choose = choose ? 'true' : 'false';
        lastChoose = choose;
        // arriving: land on the default site first, then hand over to the map
        if (choose) heroRef.current?.land(DEFAULT_SITE_ID, () => setAtMars(true));
        else {
          heroRef.current?.cancelLanding();
          setAtMars(false);
        }
      }
      const introDone = s.intro >= 1;
      if (introDone !== lastIntroDone) {
        root.dataset.introDone = introDone ? 'true' : 'false';
        lastIntroDone = introDone;
        if (introDone) document.documentElement.classList.remove('intro-lock');
        if (introDone) {
          try {
            sessionStorage.setItem('mw:intro', '1');
          } catch {
            /* storage unavailable */
          }
        }
      }
      let rail = 0;
      for (let i = 0; i < RAIL.length; i++) if (p >= RAIL[i] - 0.06) rail = i;
      if (rail !== lastRail) {
        railItems.forEach((el, i) => (el.dataset.state = i < rail ? 'done' : i === rail ? 'current' : 'next'));
        lastRail = rail;
      }
    });
    return () => {
      unsub();
      engine.destroy();
      document.documentElement.classList.remove('intro-lock');
      history.scrollRestoration = restore;
    };
  }, [engine]);

  /* Mars24 telemetry: plain text writes once per second */
  useEffect(() => {
    const t = tele.current;
    const write = (key, text) => {
      const el = t[key];
      if (el && el.textContent !== text) el.textContent = text;
    };
    const tick = () => {
      const m = marsTime();
      const lt = earthMarsLightTime();
      const site = getSite(DEFAULT_SITE_ID);
      write('season', m.season);
      write('light', `${lt.minutes.toFixed(1)} min`);
      write('lightBig', lt.minutes.toFixed(1));
      write('lightBand', lt.minutes.toFixed(1));
      write('siteName', site.name.split(' ·')[0]);
      write('ltst', formatHM(localSolarTime(m, site.lon)));
      const el = solarElevation(m, site.lat, site.lon);
      write('daynight', el > 0 ? 'Daylight' : el > -6 ? 'Twilight' : 'Night');
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  // Once the pinned story scrolls away, the nav turns solid.
  useEffect(() => {
    let raf = 0;
    const read = () => {
      raf = 0;
      // Once the pinned story starts scrolling away, the nav turns solid (home.css) so the map
      // and the sections below don't slide under a see-through bar.
      const past = trackRef.current ? trackRef.current.getBoundingClientRect().bottom < window.innerHeight - 1 : false;
      if (rootRef.current) rootRef.current.dataset.past = past ? 'true' : 'false';
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(read); };
    read();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => { window.removeEventListener('scroll', onScroll); window.removeEventListener('resize', onScroll); cancelAnimationFrame(raf); };
  }, []);

  // While the map covers the 3D scene, the scene stops drawing.
  useEffect(() => {
    heroRef.current?.setPaused(atMars && mapReady);
  }, [atMars, mapReady]);

  // Fetch the Mars map and planner code in the background while the intro plays (not on weak
  // devices: holding the map code next to the 3D scene costs memory they don't have).
  useEffect(() => {
    if (deviceTier() === 'low') return undefined;
    // ...but only once the page has fully loaded and settled, and not on slow or metered
    // connections: fetched early it competed with the scene's own code and planet images
    const conn = navigator.connection;
    if (conn?.saveData || /(^|-)2g|3g/.test(conn?.effectiveType || '')) return undefined;
    let id = 0;
    const go = () => {
      const idle = window.requestIdleCallback || ((f) => setTimeout(f, 1));
      id = setTimeout(() => idle(() => {
        import('../pages/MapPage.jsx').catch(() => {});
        import('../components/Explorer.jsx').catch(() => {});
        import('../pages/Site.jsx').catch(() => {});
      }), 3500);
    };
    if (document.readyState === 'complete') go();
    else window.addEventListener('load', go, { once: true });
    return () => { clearTimeout(id); window.removeEventListener('load', go); };
  }, []);

  const goChoose = () => engine.scrollToProgress(0.97);
  const ref = (k) => (el) => {
    tele.current[k] = el;
  };

  return (
    <div className="mw-home" ref={rootRef} data-choose="false" data-intro-done="false">
      <section className="story" ref={trackRef} aria-label="Redstep introduction">
        <div className="stage">
          <MarsGlobeHero ref={heroRef} engine={engine} sites={LANDING_SITES} />
          <div className="stage-veil" aria-hidden="true" />

          {/* ---- Hero: the title, one line of what it does, two ways in ---- */}
          <div className="hero2 chapter" data-chapter="hero" style={{ '--w': 'var(--w-hero)' }}>
            <p className="hero2__over reveal" style={{ '--at': 0.08 }}>{HOME.kicker}</p>
            <h1 className="hero2__title">
              <span className="reveal-line" style={{ '--at': 0.1 }}>The first</span>
              <span className="reveal-line" style={{ '--at': 0.13 }}>walk on</span>
              <span className="reveal-line hero2__mars" style={{ '--at': 0.16 }}><em>Mars.</em></span>
            </h1>
            <p className="hero2__lead reveal" style={{ '--at': 0.2 }}>{HOME.lead}</p>
            <div className="cta-row reveal" style={{ '--at': 0.24 }}>
              <button type="button" className="btn btn-primary" onClick={goChoose}>
                {HOME.ctaPrimary}
                <span aria-hidden="true">↓</span>
              </button>
              <Link to="/site/jezero" className="btn" aria-label={HOME.ctaWalk}>
                <span className="cta-long">{HOME.ctaWalk}</span>
                <span className="cta-short">{HOME.ctaWalkShort}</span>
                <span aria-hidden="true">→</span>
              </Link>
            </div>
          </div>

          {/* ---- Live strip: Mars right now, worked out in the browser ---- */}
          <aside className="strip reveal" data-chapter="hero" style={{ '--at': 0.3 }} aria-label="Mars right now, computed in your browser">
            <div className="strip__head">
              <span className="strip__live"><i aria-hidden="true" />Mars right now</span>
              <Badge kind="derived" source="mars24" align="end" note={HOME.telemetryNote} />
            </div>
            <dl className="strip__grid">
              <div><dt>Season</dt><dd ref={ref('season')}>—</dd></div>
              <div><dt>Message to Earth</dt><dd ref={ref('light')}>—</dd></div>
              <div><dt ref={ref('siteName')}>—</dt><dd><span ref={ref('ltst')}>—</span> · <span ref={ref('daynight')}>—</span></dd></div>
            </dl>
          </aside>

          {/* ---- 01 · Layers ---- */}
          <div className="chapter chapter--left" data-chapter="layers" style={{ '--w': 'var(--w-layers)' }}>
            <p className="eyebrow">{HOME.story.layers.eyebrow}</p>
            <h2 className="h2">{rich(HOME.story.layers.title)}</h2>
            <p className="body">{HOME.story.layers.body}</p>
            <ul className="chips">
              {HOME.story.layers.chips.map((id) => {
                const s = SOURCES[id];
                return (
                  <li key={id} className="chip">
                    <span className="chip__mission">{s.mission}</span>
                    <span className="chip__inst">{s.instrument}</span>
                    <span className="chip__res">{s.resolution.split(' ·')[0]}</span>
                  </li>
                );
              })}
            </ul>
            <Badge kind="nasa" source="mola" note="Each layer in the planner names its mission, instrument and resolution." />
          </div>

          {/* ---- 02 · Cruise ---- */}
          <div className="chapter chapter--left" data-chapter="cruise" style={{ '--w': 'var(--w-cruise)' }}>
            <p className="eyebrow">{HOME.story.cruise.eyebrow}</p>
            <h2 className="h2">{rich(HOME.story.cruise.title)}</h2>
            <p className="body">{HOME.story.cruise.body}</p>
            <div className="stats">
              <Stat value={CONSTANTS.radCruise.value} unit={CONSTANTS.radCruise.unit} label="Dose in cruise · RAD" badge={<Badge kind="nasa" source="rad" />} />
              <Stat value={CONSTANTS.radSurface.value} unit={CONSTANTS.radSurface.unit} label="Dose on the surface · RAD" badge={<Badge kind="nasa" source="rad" />} />
              <Stat
                valueRef={ref('lightBig')}
                unit="min"
                label="Light time to Earth, now"
                badge={<Badge kind="derived" source="ephemeris" note={`Range over a synodic cycle: ${CONSTANTS.lightTimeRange.value} min.`} />}
              />
            </div>
          </div>

          {/* ---- 03 · Arrive ---- */}
          <div className="chapter chapter--left" data-chapter="arrive" style={{ '--w': 'var(--w-arrive)' }}>
            <p className="eyebrow">{HOME.story.arrive.eyebrow}</p>
            <h2 className="h2">{rich(HOME.story.arrive.title)}</h2>
            <p className="body">{HOME.story.arrive.body}</p>
            <ul className="slope-legend" aria-label="Default slope thresholds">
              <li className="slope slope--go">
                <i aria-hidden="true" />
                <b>&lt; {SLOPE_THRESHOLDS.go}°</b>
                <span>GO</span>
              </li>
              <li className="slope slope--caution">
                <i aria-hidden="true" />
                <b>
                  {SLOPE_THRESHOLDS.go}–{SLOPE_THRESHOLDS.caution}°
                </b>
                <span>CAUTION</span>
              </li>
              <li className="slope slope--nogo">
                <i aria-hidden="true" />
                <b>&gt; {SLOPE_THRESHOLDS.caution}°</b>
                <span>NO-GO</span>
              </li>
            </ul>
            <p className="fine">
              Walk-back radius {EVA_DEFAULTS.walkBackRadiusKm} km · reserve {Math.round(EVA_DEFAULTS.reserveFraction * 100)} % · all
              editable <Badge kind="illustrative" source="assumption" note="Thresholds and suit budgets are engineering assumptions you can change in the planner." />
            </p>
          </div>

          {/* ---- 04 · Arrival: the real Mars map takes over (the same one as /map) ---- */}
          {mapOn && (
            <div className={`home-map ${atMars ? 'on' : ''}`} inert={!atMars} aria-hidden={!atMars}>
              <Suspense fallback={null}>
                <Explorer visible={atMars} embedded onReady={() => setMapReady(true)} />
              </Suspense>
            </div>
          )}

          {/* ---- Progress rail ---- */}
          <nav className="rail" aria-label="Story chapters">
            {HOME.chapters.map((c, i) => (
              <button key={c.id} type="button" className="rail__item" data-rail data-state="next" onClick={() => engine.scrollToProgress(RAIL[i] + (i === 3 ? 0.02 : 0))}>
                                <span className="rail__label">{c.label}</span>
              </button>
            ))}
          </nav>

          <p className="scroll-cue micro" aria-hidden="true">
            <span className="scroll-cue__line" />
            {HOME.scrollCue}
          </p>


        </div>
      </section>



    </div>
  );
}

/** Headline copy marks its one emphasised phrase with *stars*; it renders in the serif italic. */
function rich(text) {
  return text.split(/\*([^*]+)\*/).map((part, i) => (i % 2 ? <em key={i}>{part}</em> : part));
}

function Stat({ value, valueRef, unit, label, badge }) {
  return (
    <div className="stat">
      <p className="stat__value">
        <span ref={valueRef}>{value ?? '—'}</span>
        <small>{unit}</small>
      </p>
      <p className="stat__label">{label}</p>
      {badge}
    </div>
  );
}
