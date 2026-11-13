/* ==========================================================================
   Motion engine — one passive scroll listener + one pointer listener feeding
   a single requestAnimationFrame loop. Subscribers receive a shared, mutable
   state object and write straight to the DOM / GPU uniforms. React never
   re-renders during scroll, intro or flight.
   ========================================================================== */

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

// Reduced-motion: the story snaps to static frames at these progress anchors.
const REDUCED_ANCHORS = [
  { until: 0.13, p: 0 },
  { until: 0.39, p: 0.27 },
  { until: 0.63, p: 0.51 },
  { until: 0.82, p: 0.73 },
  { until: 1.01, p: 1 },
];

export function prefersReducedMotion() {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function createMotionEngine({ smoothing = 5.5, introDuration = 2.2 } = {}) {
  const subs = new Set();
  const state = {
    time: 0,
    dt: 0,
    frame: 0,
    raw: 0,
    progress: 0,
    velocity: 0,
    pointer: { x: 0, y: 0, sx: 0, sy: 0 },
    intro: 0,
    introPlaying: false,
    reduced: prefersReducedMotion(),
    width: typeof window !== 'undefined' ? window.innerWidth : 1,
    height: typeof window !== 'undefined' ? window.innerHeight : 1,
  };

  let track = null;
  let rangeStart = 0;
  let rangeLen = 1;
  let active = true;
  let raf = 0;
  let last = 0;
  let scrollDirty = true;
  let attached = false;
  let mq = null;

  const measure = () => {
    state.width = window.innerWidth;
    state.height = window.innerHeight;
    if (!track) return;
    const rect = track.getBoundingClientRect();
    rangeStart = rect.top + window.scrollY;
    rangeLen = Math.max(1, track.offsetHeight - window.innerHeight);
  };

  const readScroll = () => {
    state.raw = clamp01((window.scrollY - rangeStart) / rangeLen);
    scrollDirty = false;
  };

  const snap = (p) => REDUCED_ANCHORS.find((a) => p < a.until).p;

  const tick = (now) => {
    raf = 0;
    const t = now / 1000;
    const raw = last ? t - last : 1 / 60;
    const dt = Math.min(0.1, raw);
    last = t;
    state.dt = dt;
    state.time += dt;
    state.frame++;

    if (scrollDirty) readScroll();

    if (state.reduced) {
      state.progress = snap(state.raw);
      state.velocity = 0;
      state.intro = 1;
      state.pointer.sx = 0;
      state.pointer.sy = 0;
    } else {
      const k = 1 - Math.exp(-dt * smoothing);
      const prev = state.progress;
      state.progress += (state.raw - state.progress) * k;
      if (Math.abs(state.raw - state.progress) < 1e-5) state.progress = state.raw;
      const v = (state.progress - prev) / dt;
      state.velocity += (v - state.velocity) * Math.min(1, dt * 8);

      const kp = 1 - Math.exp(-dt * 3.5);
      state.pointer.sx += (state.pointer.x - state.pointer.sx) * kp;
      state.pointer.sy += (state.pointer.y - state.pointer.sy) * kp;

      if (state.introPlaying) {
        // real time (up to 0.3 s per frame), so a slow device doesn't stretch the launch
        state.intro = Math.min(1, state.intro + Math.min(0.3, raw) / introDuration);
        if (state.intro >= 1) state.introPlaying = false;
      }
    }

    for (const fn of subs) fn(state);

    // Reduced motion renders on demand only; otherwise keep looping while visible.
    // The intro always runs to the end, even if the stage is briefly off-screen.
    if ((active || state.introPlaying) && !state.reduced && !document.hidden) raf = requestAnimationFrame(tick);
  };

  const kick = () => {
    if (!raf) raf = requestAnimationFrame(tick);
  };

  const onScroll = () => {
    scrollDirty = true;
    if (state.reduced) kick();
  };

  const onPointer = (e) => {
    state.pointer.x = (e.clientX / state.width) * 2 - 1;
    state.pointer.y = -((e.clientY / state.height) * 2 - 1);
  };

  const onResize = () => {
    measure();
    scrollDirty = true;
    kick();
  };

  const onVisibility = () => {
    if (!document.hidden) {
      last = 0;
      kick();
    }
  };

  const onKey = (e) => {
    // the intro always plays to the end: the page waits for the rocket
  };

  const onReducedChange = () => {
    state.reduced = mq.matches;
    if (state.reduced) skipIntro();
    last = 0;
    kick();
  };

  function skipIntro() {
    state.intro = 1;
    state.introPlaying = false;
    kick();
  }

  return {
    state,
    attach(el) {
      track = el;
      if (!attached) {
        attached = true;
        window.addEventListener('scroll', onScroll, { passive: true });
        window.addEventListener('pointermove', onPointer, { passive: true });
        window.addEventListener('resize', onResize, { passive: true });
        window.addEventListener('keydown', onKey);
        document.addEventListener('visibilitychange', onVisibility);
        mq = window.matchMedia('(prefers-reduced-motion: reduce)');
        mq.addEventListener('change', onReducedChange);
      }
      measure();
      readScroll();
      state.progress = state.reduced ? snap(state.raw) : state.raw;
      kick();
    },
    subscribe(fn) {
      subs.add(fn);
      kick();
      return () => subs.delete(fn);
    },
    setActive(on) {
      active = on;
      if (on) {
        last = 0;
        kick();
      }
    },
    playIntro() {
      if (state.reduced) return skipIntro();
      state.intro = 0;
      state.introPlaying = true;
      kick();
    },
    skipIntro,
    /** Smooth-scroll the page so the story lands at progress p. */
    scrollToProgress(p) {
      measure();
      window.scrollTo({ top: rangeStart + p * rangeLen, behavior: state.reduced ? 'auto' : 'smooth' });
    },
    /** Jump instantly (no smoothing) — used for deep links and QA. */
    jump(p) {
      measure();
      window.scrollTo({ top: rangeStart + p * rangeLen, behavior: 'auto' });
      readScroll();
      state.progress = state.reduced ? snap(state.raw) : state.raw;
      state.velocity = 0;
      kick();
    },
    requestFrame: kick,
    measure: onResize,
    destroy() {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      subs.clear();
      if (!attached) return;
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('pointermove', onPointer);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('visibilitychange', onVisibility);
      mq?.removeEventListener('change', onReducedChange);
      attached = false;
    },
  };
}

/** Trapezoid window: 0 before a, ramps to 1 by b, holds, ramps to 0 from c to d. */
export function windowed(p, a, b, c, d) {
  if (p <= a || p >= d) return 0;
  if (p < b) return smooth((p - a) / (b - a));
  if (p <= c) return 1;
  return 1 - smooth((p - c) / (d - c));
}

export function smooth(t) {
  t = clamp01(t);
  return t * t * (3 - 2 * t);
}

export function smoothstep(a, b, x) {
  return smooth((x - a) / (b - a));
}
