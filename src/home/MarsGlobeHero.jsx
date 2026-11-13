import { useEffect, useImperativeHandle, useRef, useState } from 'react';
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
    // Paint the page before downloading and compiling Three.js. The cinematic starts as soon
    // as the browser has had two frames to display the headline and controls.
    const root = wrap.closest('.mw-home');
    const setQuality = (q) => root && (root.dataset.quality = q);
    const quality = deviceTier();
    setQuality(quality);

    let disposed = false;
    let frame = 0;
    let scene;
    let cleanupScene = () => {};

    const startScene = async () => {
      try {
        const { createHeroScene } = await import('./three/heroScene.js');
        if (disposed) return;

        // Real NASA planet maps from the app's data folder; procedural maps remain as fallback.
        // WebP (about 40% smaller); the Moon is small on screen, so 1K is plenty.
        scene = createHeroScene(canvasRef.current, {
          sites,
          dom: { labels: { earth: labels.earth.current, moon: labels.moon.current, mars: labels.mars.current } },
          quality,
          onQuality: setQuality,
          textures: {
            mars: globeTexture('mars-viking-2k.webp'),
            earth: globeTexture('earth-day-2k.webp'),
            earthNight: globeTexture('earth-night-2k.webp'),
            moon: globeTexture('moon-lro-1k.webp'),
          },
        });
        if (disposed) {
          scene.dispose();
          return;
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

        cleanupScene = () => {
          unsub();
          io.disconnect();
          ro.disconnect();
          scene.dispose();
          sceneRef.current = null;
        };
      } catch (err) {
        if (!disposed) {
          console.warn('[MarsGlobeHero] WebGL unavailable, using static poster.', err);
          setFailed(true);
        }
      }
    };

    // Two animation frames let the browser commit the real page before the Three.js chunk is
    // requested. This is a perceived-load improvement; it does not remove or downgrade the scene.
    frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(startScene);
    });

    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      cleanupScene();
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
