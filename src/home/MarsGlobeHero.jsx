import { useEffect, useImperativeHandle, useRef, useState } from 'react';
import { createHeroScene } from './three/heroScene.js';
import { globeTexture } from '../data/index.js';
import { deviceTier } from '../lib/quality.js';

/**
 * WebGL stage: Earth → Moon → Mars cinematic with the rocket and orbital hairlines. When the
 * rocket reaches Mars the home page hands over to the real Mars map (the same one as /map),
 * so this scene stops drawing while the map covers it (setPaused).
 * The engine drives it; this component renders once and never re-renders per frame.
 */
export default function MarsGlobeHero({ engine, sites, ref }) {
  const wrapRef = useRef(null);
  const canvasRef = useRef(null);
  const sceneRef = useRef(null);
  const paused = useRef(false);
  const labels = { earth: useRef(null), moon: useRef(null), mars: useRef(null) };
  const [failed, setFailed] = useState(false);

  useImperativeHandle(ref, () => ({
    setPaused: (on) => {
      paused.current = on;
      if (!on) engine.requestFrame();
    },
    land: (id, done) => {
      if (!sceneRef.current) return done?.();
      sceneRef.current.land(id, done);
      engine.requestFrame();
    },
    cancelLanding: () => sceneRef.current?.cancelLanding(),
  }));

  useEffect(() => {
    const wrap = wrapRef.current;
    // Weaker devices (or ones whose frames run slow) get solid panels instead of live blur.
    const root = wrap.closest('.mw-home');
    const setQuality = (q) => root && (root.dataset.quality = q);
    const quality = deviceTier();
    setQuality(quality);
    let scene;
    try {
      scene = createHeroScene(canvasRef.current, {
        sites,
        dom: { labels: { earth: labels.earth.current, moon: labels.moon.current, mars: labels.mars.current } },
        quality,
        onQuality: setQuality,
        // Real NASA planet maps from the app's data folder; the procedural ones stay as fallback.
        textures: { mars: globeTexture('mars-viking-2k.jpg'), earth: globeTexture('earth-day-2k.jpg'), earthNight: globeTexture('earth-night-2k.jpg'), moon: globeTexture('moon-lro-2k.jpg') },
      });
    } catch (err) {
      console.warn('[MarsGlobeHero] WebGL unavailable, using static poster.', err);
      setFailed(true);
      return undefined;
    }
    sceneRef.current = scene;
    if (import.meta.env.DEV) window.__marswalkScene = scene;

    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      scene.resize(width, height);
      engine.requestFrame();
    });
    ro.observe(wrap);

    let visible = true;
    const io = new IntersectionObserver(
      ([entry]) => {
        visible = entry.isIntersecting;
        engine.setActive(visible);
      },
      { threshold: 0 },
    );
    io.observe(wrap);

    const unsub = engine.subscribe((state) => {
      if (visible && !paused.current) scene.update(state);
    });

    return () => {
      unsub();
      io.disconnect();
      ro.disconnect();
      scene.dispose();
      sceneRef.current = null;
    };
    // The scene is created once; sites are static content.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine]);

  return (
    <div className="hero-stage" ref={wrapRef} data-failed={failed ? 'true' : 'false'}>
      <canvas
        ref={canvasRef}
        className="hero-canvas"
        aria-label="Animated schematic, not to scale: a rocket leaves Earth, passes the Moon's orbit and arrives at Mars."
        role="img"
      />
      {failed && <div className="hero-poster" aria-hidden="true" />}

      <div className="hero-labels" aria-hidden="true">
        <span className="body-label" ref={labels.earth}>
          <i />
          <b>Earth</b>
          <em>Departure</em>
        </span>
        <span className="body-label" ref={labels.moon}>
          <i />
          <b>Moon</b>
          <em>384 400 km</em>
        </span>
        <span className="body-label body-label--left" ref={labels.mars}>
          <i />
          <b>Mars</b>
          <em>Destination</em>
        </span>
      </div>
    </div>
  );
}
