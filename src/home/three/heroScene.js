/* ==========================================================================
   Hero scene — Earth → Moon → Mars cinematic + interactive Mars globe.
   One renderer, one camera, driven by the shared motion engine state.
   Per-frame work is transforms, uniform writes and DOM style writes only.
   ========================================================================== */

import * as THREE from 'three';
import { createRocketRig } from './rocketRig.js';
import { bake } from './bake.js';
import { frameWatch } from '../../lib/quality.js';
import {
  BAKE_MARS,
  BAKE_EARTH,
  BAKE_EARTH_AUX,
  BAKE_MOON,
  BAKE_SKY,
  PLANET_VERTEX,
  PLANET_FRAGMENT,
  ATMO_VERTEX,
  ATMO_FRAGMENT,
  SKY_VERTEX,
  SKY_FRAGMENT,
  STAR_VERTEX,
  STAR_FRAGMENT,
  ORBIT_VERTEX,
  ORBIT_FRAGMENT,
} from './shaders.js';
import { marsTime, latLonToVec3 } from '../mars24.js';
import { smoothstep, smooth } from '../motionEngine.js';

const FOV = 35;
const TAN = Math.tan(((FOV / 2) * Math.PI) / 180);
const CAM0 = new THREE.Vector3(0, 0, 10);

/* Reference composition, measured from the 1706×922 reference:
   x/y in NDC, r = projected radius as a fraction of viewport height,
   d = camera distance (sets parallax depth), rocket len as fraction of height. */
const ANCHORS = {
  wide: {
    earth: { x: -1.06, y: -0.49, r: 0.78, d: 16 }, // perspective-fitted to the limb, 3 px RMS
    // positions measured from the reference frame (1706 × 922)
    moon: { x: -0.3, y: 0.52, r: 0.05, d: 20 },
    mars: { x: 0.84, y: 0.48, r: 0.056, d: 30 },
    rocket: { x: 0.1, y: -0.02, len: 0.52, tilt: 22, d: 8 }, // centre stage, between Earth and the copy
    end: { x: 0.3, y: -0.02, r: 0.36 },
  },
  mid: {
    earth: { x: -1.14, y: -0.64, r: 0.6, d: 16 },
    moon: { x: -0.42, y: 0.66, r: 0.055, d: 20 },
    mars: { x: 0.86, y: 0.5, r: 0.05, d: 30 },
    rocket: { x: 0.0, y: -0.04, len: 0.46, tilt: 20, d: 8 }, // clear of Earth and the copy, as in the reference
    end: { x: 0.28, y: -0.02, r: 0.33 },
  },
  // Portrait: copy owns the top ~45 %, telemetry the bottom ~15 %; the scene lives between.
  tall: {
    earth: { x: -1.3, y: -0.98, r: 0.44, d: 16 },
    moon: { x: -0.56, y: -0.02, r: 0.03, d: 20 },
    mars: { x: 0.64, y: -0.1, r: 0.034, d: 30 },
    rocket: { x: 0.3, y: -0.46, len: 0.27, tilt: 22, d: 8 },
    end: { x: 0, y: 0.42, r: 0.155 },
  },
};

// Presentation sun directions (world space). In the reference all three bodies are
// key-lit from the right (Earth: day upper-right / night lower-left; Moon and Mars
// half-lit on their right limbs). Per-body vectors fine-tune that single key light;
// Mars can switch to the true Mars24 terminator.
// Reference: the sun is up and behind Earth, so only the top limb is in daylight and most of
// the disc facing us is night, with city lights and a bright blue rim.
const SUN_EARTH = new THREE.Vector3(0.45, 0.45, -0.77).normalize();
const SUN_MOON = new THREE.Vector3(0.9, 0.32, 0.12).normalize();
// Parking orbit radius (Mars radii) and angular speed (rad/s): about one lap every 30 s.
const PARK_R = 1.24;
const LAND_T = 2.75; // seconds from 'land here' to the site page
const ORBIT_W = 0.5; // about one lap every 12 s: clearly moving

const BOUNCE_EARTH = new THREE.Color(0.07, 0.1, 0.16);
const BOUNCE_MARS = new THREE.Color(0.16, 0.08, 0.045);
const rocketSun = new THREE.Vector3();
const rocketBounce = new THREE.Color();
const SUN_MARS_REF = new THREE.Vector3(0.5, 0.42, 0.76).normalize();
const SUN_MARS_DAY = new THREE.Vector3(-0.42, 0.42, 0.8).normalize();

const lerp = (a, b, t) => a + (b - a) * t;
const clamp01 = (v) => Math.max(0, Math.min(1, v));
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

const prefersStill = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

function anchorsFor(aspect) {
  const mix = (a, b, t) => {
    const o = {};
    for (const k in a) o[k] = typeof a[k] === 'number' ? lerp(a[k], b[k], t) : mix(a[k], b[k], t);
    return o;
  };
  // tall (portrait) → mid (4:3) → wide (reference 1.85:1)
  if (aspect <= 1.33) return mix(ANCHORS.tall, ANCHORS.mid, smoothstep(0.72, 1.33, aspect));
  return mix(ANCHORS.mid, ANCHORS.wide, smoothstep(1.33, 1.8, aspect));
}

/** World point for an NDC anchor at camera distance d (camera at CAM0 looking −z). */
function unproject(x, y, d, aspect) {
  return new THREE.Vector3(x * d * TAN * aspect, y * d * TAN, CAM0.z - d);
}

/** Sphere radius whose silhouette spans r (fraction of viewport height) at distance d. */
function radiusFor(r, d) {
  const t = r * 2 * TAN;
  return (d * t) / Math.sqrt(1 + t * t);
}

const _m = new THREE.Matrix4();
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Vector3();
/** Quaternion rotating object vector `objDir` onto `worldDir` with object north toward `worldUp`. */
function orient(objDir, worldDir, worldUp = new THREE.Vector3(0, 1, 0), out = new THREE.Quaternion()) {
  const z0 = _a.copy(objDir).normalize();
  const n0 = _b.set(0, 1, 0).addScaledVector(z0, -z0.y);
  if (n0.lengthSq() < 1e-6) n0.set(0, 0, 1);
  n0.normalize();
  const x0 = _c.crossVectors(n0, z0);
  const objBasis = new THREE.Matrix4().makeBasis(x0, n0, z0);

  const z1 = worldDir.clone().normalize();
  const n1 = worldUp.clone().addScaledVector(z1, -worldUp.dot(z1));
  if (n1.lengthSq() < 1e-6) n1.set(0, 0, 1);
  n1.normalize();
  const x1 = new THREE.Vector3().crossVectors(n1, z1);
  const worldBasis = new THREE.Matrix4().makeBasis(x1, n1, z1);

  _m.copy(worldBasis).multiply(objBasis.transpose());
  return out.setFromRotationMatrix(_m);
}

const llVec = (lat, lon) => new THREE.Vector3(...latLonToVec3(lat, lon));

function planetMaterial(define, { map, aux, rim, rimStrength = 0, bump = 0, exposure = 1, ambient = 0, size }) {
  return new THREE.ShaderMaterial({
    defines: define ? { [define]: '' } : {},
    vertexShader: PLANET_VERTEX,
    fragmentShader: PLANET_FRAGMENT,
    uniforms: {
      uMap: { value: map },
      uAux: { value: aux ?? map },
      uOverride: { value: map },
      uUseOverride: { value: 0 },
      uSunObj: { value: new THREE.Vector3(1, 0, 0) },
      uCamObj: { value: new THREE.Vector3(0, 0, 5) },
      uRimColor: { value: new THREE.Color(rim ?? '#000000') },
      uRimStrength: { value: rimStrength },
      uBump: { value: bump },
      uTexel: { value: new THREE.Vector2(1 / size[0], 1 / size[1]) },
      uAmbient: { value: ambient },
      uExposure: { value: exposure },
      uCloudShift: { value: 0 },
      uCityColor: { value: new THREE.Color('#e5c79e') },
      uNight: { value: map },
      uUseNight: { value: 0 },
      uFade: { value: 1 },
    },
  });
}

function atmosphere(color, scale, intensity, power) {
  const mat = new THREE.ShaderMaterial({
    vertexShader: ATMO_VERTEX,
    fragmentShader: ATMO_FRAGMENT,
    uniforms: {
      uColor: { value: new THREE.Color(color) },
      uSunWorld: { value: new THREE.Vector3(1, 0, 0) },
      uLimb: { value: Math.sqrt(1 - 1 / (scale * scale)) },
      uPower: { value: power },
      uIntensity: { value: intensity },
    },
    side: THREE.BackSide,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(scale, 96, 48), mat);
  return mesh;
}

function orbitLine(points, { done = '#e3895a', todo = '#f4f1ec', dashes = 60, alphaDone = 0.7, alphaTodo = 0.22 }) {
  const geo = new THREE.BufferGeometry().setFromPoints(points);
  const t = new Float32Array(points.length);
  for (let i = 0; i < points.length; i++) t[i] = i / (points.length - 1);
  geo.setAttribute('aT', new THREE.BufferAttribute(t, 1));
  const mat = new THREE.ShaderMaterial({
    vertexShader: ORBIT_VERTEX,
    fragmentShader: ORBIT_FRAGMENT,
    uniforms: {
      uDone: { value: new THREE.Color(done) },
      uTodo: { value: new THREE.Color(todo) },
      uProgress: { value: 0 },
      uDashes: { value: dashes },
      uAlphaDone: { value: alphaDone },
      uAlphaTodo: { value: alphaTodo },
      uFade: { value: 1 },
    },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const line = new THREE.Line(geo, mat);
  line.frustumCulled = false;
  return line;
}

function ringPoints(center, radius, normal, seg = 256, startDir = null) {
  const n = normal.clone().normalize();
  const u = (startDir ? startDir.clone() : new THREE.Vector3(1, 0, 0)).addScaledVector(n, -(startDir ?? new THREE.Vector3(1, 0, 0)).dot(n)).normalize();
  const v = new THREE.Vector3().crossVectors(n, u);
  const pts = [];
  for (let i = 0; i <= seg; i++) {
    const a = (i / seg) * Math.PI * 2;
    pts.push(center.clone().addScaledVector(u, Math.cos(a) * radius).addScaledVector(v, Math.sin(a) * radius));
  }
  return { pts, u, v, n };
}

/* ========================================================================== */

export function createHeroScene(canvas, { sites, dom, onArrive, textures = {}, quality = 'high', onQuality }) {
  const low = quality === 'low';
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: false,
    powerPreference: 'high-performance',
  });
  renderer.outputColorSpace = THREE.LinearSRGBColorSpace; // shaders write display values directly
  renderer.setClearColor('#000408', 1);
  renderer.autoClear = true;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(FOV, 1, 0.05, 2000);
  camera.position.copy(CAM0);

  /* ---- Baked textures ---- */
  // Mars and the Moon use NASA maps; their drawn-in-the-browser versions are only a fallback,
  // made if a map fails to load. Earth keeps its baked map for the ocean glint and clouds.
  // Weaker devices bake at half size.
  const B = low ? 1024 : 2048;
  const placeholder = (hex) => {
    const c = new THREE.Color(hex);
    const t = new THREE.DataTexture(new Uint8Array([c.r * 255, c.g * 255, c.b * 255, 128]), 1, 1);
    t.needsUpdate = true;
    return { texture: t, dispose: () => t.dispose() };
  };
  const marsRT = textures.mars ? placeholder('#8a4f36') : bake(renderer, BAKE_MARS, B, B / 2, { uSeed: { value: 4.21 } });
  const earthRT = bake(renderer, BAKE_EARTH, B, B / 2, { uSeed: { value: 1.3 } });
  const earthAuxRT = bake(renderer, BAKE_EARTH_AUX, B, B / 2, { uSeed: { value: 1.3 } });
  const moonRT = textures.moon ? placeholder('#5c5b5a') : bake(renderer, BAKE_MOON, 1024, 512, { uSeed: { value: 7.7 } });
  // Milky Way haze passes through the reference's upper-right (≈1300, 200 px).
  const bandD = new THREE.Vector3(0.29, 0.17, -0.94).normalize();
  const bandT = new THREE.Vector3(0.78, 0.62, 0.12).normalize(); // runs up-right toward (1500, 40)
  const skyRT = bake(renderer, BAKE_SKY, B, B / 2, {
    uSeed: { value: 2.2 },
    uBandNormal: { value: new THREE.Vector3().crossVectors(bandD, bandT).normalize() },
    uBandCentre: { value: bandD },
  });

  /* ---- Sky + stars (follow the camera: at infinity) ---- */
  const skyMat = new THREE.ShaderMaterial({
    vertexShader: SKY_VERTEX,
    fragmentShader: SKY_FRAGMENT,
    uniforms: { uMap: { value: skyRT.texture }, uFade: { value: 1 } },
    side: THREE.BackSide,
    depthWrite: false,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(900, 64, 32), skyMat);
  sky.renderOrder = -10;
  sky.frustumCulled = false;
  scene.add(sky);

  // a deep field: many faint stars and a few bright ones (fewer on weaker devices)
  const STARS = low ? 3000 : 7000;
  const sp = new Float32Array(STARS * 3);
  const ss = new Float32Array(STARS);
  const st = new Float32Array(STARS);
  const sc = new Float32Array(STARS * 3);
  let seed = 99;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < STARS; i++) {
    const u = rnd() * 2 - 1;
    const th = rnd() * Math.PI * 2;
    const r = Math.sqrt(1 - u * u);
    sp.set([r * Math.cos(th) * 800, u * 800, r * Math.sin(th) * 800], i * 3);
    const bright = Math.pow(rnd(), 9);
    ss[i] = (i % 3 === 0 ? 0.6 : 0.9) + bright * 3.2;
    st[i] = rnd();
    const blue = rnd() < 0.35;
    const k = 0.35 + bright * 0.65 + rnd() * 0.15;
    sc.set(blue ? [0.62 * k, 0.77 * k, 1.0 * k] : [0.96 * k, 0.96 * k, 1.0 * k], i * 3);
  }
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute('position', new THREE.BufferAttribute(sp, 3));
  starGeo.setAttribute('aSize', new THREE.BufferAttribute(ss, 1));
  starGeo.setAttribute('aTw', new THREE.BufferAttribute(st, 1));
  starGeo.setAttribute('aColor', new THREE.BufferAttribute(sc, 3));
  const starMat = new THREE.ShaderMaterial({
    vertexShader: STAR_VERTEX,
    fragmentShader: STAR_FRAGMENT,
    uniforms: { uTime: { value: 0 }, uDpr: { value: 1 }, uFade: { value: 1 } },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const stars = new THREE.Points(starGeo, starMat);
  stars.renderOrder = -9;
  stars.frustumCulled = false;
  scene.add(stars);

  /* ---- Bodies ---- */
  const sphere = low ? new THREE.SphereGeometry(1, 96, 48) : new THREE.SphereGeometry(1, 160, 80);
  const earthMat = planetMaterial('EARTH', {
    map: earthRT.texture,
    aux: earthAuxRT.texture,
    rim: '#a8d9fc',
    rimStrength: 0.9,
    exposure: 1.3,
    size: [2048, 1024],
  });
  const earth = new THREE.Mesh(sphere, earthMat);
  const earthAtmo = atmosphere('#a8d9fc', 1.03, 1.25, 2.2);
  earth.add(earthAtmo);
  scene.add(earth);

  const moonMat = planetMaterial('MOON', { map: moonRT.texture, bump: 2.2, exposure: 1.18, ambient: 0.012, size: [1024, 512] });
  const moon = new THREE.Mesh(new THREE.SphereGeometry(1, 96, 48), moonMat);
  scene.add(moon);

  const marsMat = planetMaterial('MARS', {
    map: marsRT.texture,
    rim: '#e7a07a',
    rimStrength: 0.28,
    bump: 3.2,
    exposure: 1.28,
    ambient: 0.03,
    size: [2048, 1024],
  });
  const mars = new THREE.Mesh(sphere, marsMat);
  const marsAtmo = atmosphere('#ff9a6b', 1.018, 0.45, 2.6);
  mars.add(marsAtmo);
  scene.add(mars);

  // Optional NASA planet maps (equirectangular, lon −180→180). Missing files fall back silently.
  const loader = new THREE.TextureLoader();
  // Weaker devices draw the 2048 px maps into a 1024 px canvas first: a quarter of the
  // graphics memory, and the full-size picture is dropped as soon as it is copied.
  const imageLoader = new THREE.ImageLoader();
  const loadMap = (url, onLoad, _, onError) => {
    if (!low) return loader.load(url, onLoad, undefined, onError);
    imageLoader.load(
      url,
      (im) => {
        const c = document.createElement('canvas');
        c.width = Math.min(1024, im.naturalWidth || im.width);
        c.height = Math.round(c.width / 2);
        c.getContext('2d').drawImage(im, 0, 0, c.width, c.height);
        im.src = '';
        onLoad(new THREE.CanvasTexture(c));
      },
      undefined,
      onError,
    );
  };
  const loaded = [];
  const tryOverride = (url, mat, fallback) =>
    loadMap(
      url,
      (tex) => {
        tex.wrapS = THREE.RepeatWrapping;
        tex.anisotropy = Math.min(low ? 4 : 8, renderer.capabilities.getMaxAnisotropy());
        loaded.push(tex);
        mat.uniforms.uOverride.value = tex;
        mat.uniforms.uUseOverride.value = 1;
      },
      undefined,
      () => {
        if (!fallback) return;
        const rt = fallback();
        loaded.push(rt);
        mat.uniforms.uMap.value = rt.texture;
        mat.uniforms.uOverride.value = rt.texture;
      },
    );
  if (textures.mars) tryOverride(textures.mars, marsMat, () => bake(renderer, BAKE_MARS, B, B / 2, { uSeed: { value: 4.21 } }));
  if (textures.earth) tryOverride(textures.earth, earthMat);
  // NASA Black Marble city lights replace the drawn ones once loaded
  if (textures.earthNight)
    loadMap(textures.earthNight, (tex) => {
      tex.wrapS = THREE.RepeatWrapping;
      loaded.push(tex);
      earthMat.uniforms.uNight.value = tex;
      earthMat.uniforms.uUseNight.value = 1;
    });
  if (textures.moon) tryOverride(textures.moon, moonMat, () => bake(renderer, BAKE_MOON, 1024, 512, { uSeed: { value: 7.7 } }));

  /* ---- Rocket ---- */
  const rig = createRocketRig({ quality });
  scene.add(rig.group);

  /* ---- Layout-dependent pieces (rebuilt on resize) ---- */
  const L = {
    aspect: 1,
    earthR: 1,
    moonR: 1,
    marsR: 1,
    rocketLen: 1,
    rocketPos0: new THREE.Vector3(),
    marsPos: new THREE.Vector3(),
    endTarget: new THREE.Vector3(),
    endDist: 5,
    curve: null,
    u0: 0.25,
    parking: null,
  };
  let transfer = null;
  let lunarRing = null;
  let marsRing = null;
  const qEarthBase = new THREE.Quaternion();
  const qMoon = new THREE.Quaternion();

  function layout(aspect) {
    L.aspect = aspect;
    const A = anchorsFor(aspect);
    // Where the camera keeps the rocket while following it: right of centre on wide screens
    // (the story panels sit on the left), in the upper half on tall ones (panels at the bottom),
    // so the panels never cover the rocket.
    L.chase = aspect > 1 ? new THREE.Vector3(-0.7, 0.25, 0) : new THREE.Vector3(0.5, -1.3, 0);
    const e = A.earth;
    const mo = A.moon;
    const ma = A.mars;
    const ro = A.rocket;

    earth.position.copy(unproject(e.x, e.y, e.d, aspect));
    L.earthR = radiusFor(e.r, e.d);
    earth.scale.setScalar(L.earthR);

    moon.position.copy(unproject(mo.x, mo.y, mo.d, aspect));
    L.moonR = radiusFor(mo.r, mo.d);
    moon.scale.setScalar(L.moonR);

    L.marsPos.copy(unproject(ma.x, ma.y, ma.d, aspect));
    mars.position.copy(L.marsPos);
    L.marsR = radiusFor(ma.r, ma.d);
    mars.scale.setScalar(L.marsR);

    L.rocketPos0.copy(unproject(ro.x, ro.y, ro.d, aspect));
    L.rocketLen = ro.len * 2 * ro.d * TAN;

    // Earth faces the camera with the Atlantic just inside the lit limb.
    const toCamE = CAM0.clone().sub(earth.position).normalize();
    orient(llVec(30, -88), toCamE.clone().lerp(SUN_EARTH, 0.55).normalize(), new THREE.Vector3(0.28, 1, 0.05), qEarthBase);
    const toCamM = CAM0.clone().sub(moon.position).normalize();
    orient(llVec(5, -10), toCamM, new THREE.Vector3(0.15, 1, 0), qMoon);
    moon.quaternion.copy(qMoon);

    // Closing frame on Mars
    L.endDist = L.marsR * Math.sqrt(1 + 1 / (A.end.r * 2 * TAN) ** 2);
    L.endTarget.set(
      L.marsPos.x - A.end.x * L.endDist * TAN * aspect,
      L.marsPos.y - A.end.y * L.endDist * TAN,
      L.marsPos.z,
    );

    // Flight path: reference pose → climb → cruise → Mars parking orbit
    const tilt = (ro.tilt * Math.PI) / 180;
    const dir = new THREE.Vector3(Math.sin(tilt), Math.cos(tilt), -0.25).normalize();
    L.heroDir = dir.clone();
    // Parking orbit: tilted to face the camera, so the whole circle stays clear of the
    // planet's disk (never behind it, never cutting across it) and inside the frame.
    const parkR = L.marsR * PARK_R;
    // (normal points away from the camera so the rocket circles clockwise; it joins at the
    // upper left, climbing, clear of the top bar)
    const parkN = new THREE.Vector3(-0.1, -0.3, -1).normalize();
    const park = ringPoints(L.marsPos, parkR, parkN, 256, new THREE.Vector3(-1, 0.8, 0));
    L.parking = park;
    const entry = park.pts[0];
    // the rocket lifts off from Earth: the path starts on Earth's surface facing the rocket
    const p0 = earth.position.clone().add(L.rocketPos0.clone().sub(earth.position).normalize().multiplyScalar(L.earthR * 1.01));
    const p1 = L.rocketPos0.clone();
    const p2 = L.rocketPos0.clone().addScaledVector(dir, L.rocketLen * 1.6).add(new THREE.Vector3(0.6, 0.2, -1.2));
    const p3 = p1.clone().lerp(entry, 0.55).add(new THREE.Vector3(-0.4, 2.2, 0));
    // the last stretch runs along the orbit, so the rocket arrives already heading the way it
    // will circle
    const p4 = entry.clone().addScaledVector(park.v, -parkR * 1.1);
    const pts = [p0, p1, p2, p3, p4, entry];
    L.curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
    L.u0 = 1 / (pts.length - 1); // the reference pose, p1

    for (const line of [transfer, lunarRing, marsRing]) {
      if (!line) continue;
      scene.remove(line);
      line.geometry.dispose();
      line.material.dispose();
    }
    transfer = orbitLine(L.curve.getPoints(400), { dashes: 90 });
    transfer.visible = false; // no drawn flight path: the rocket and its trail show the way
    scene.add(transfer);

    const em = moon.position.clone().sub(earth.position);
    const lunarN = new THREE.Vector3(0.12, 1, 0.5).normalize();
    lunarN.addScaledVector(em.clone().normalize(), -lunarN.dot(em.clone().normalize())).normalize();
    const lr = ringPoints(earth.position, em.length(), lunarN, 384, em);
    L.lunar = { c: earth.position.clone(), r: em.length(), u: lr.u, v: lr.v };
    lunarRing = orbitLine(lr.pts, {
      todo: '#b9d4ff',
      dashes: 140,
      alphaTodo: 0.2,
    });
    scene.add(lunarRing);

    marsRing = orbitLine(park.pts, { todo: '#f0b48f', dashes: 80, alphaTodo: 0.3 });
    scene.add(marsRing);
  }

  /* ---- Mars orientation ---- */
  let m24 = marsTime();
  let m24At = performance.now();
  const sunObjNow = new THREE.Vector3();
  const updateSunNow = () => {
    m24 = marsTime();
    sunObjNow.copy(llVec(m24.decl, m24.subsolarLonE)).normalize();
  };
  updateSunNow();

  const qMarsRef = new THREE.Quaternion();
  orient(sunObjNow, SUN_MARS_REF, new THREE.Vector3(0, 1, 0), qMarsRef);
  const qSite = new Map(sites.map((s) => [s.id, orient(llVec(s.lat, s.lon), new THREE.Vector3(0, 0.08, 1), new THREE.Vector3(0, 1, 0))]));
  const siteVec = new Map(sites.map((s) => [s.id, llVec(s.lat, s.lon)]));
  const qCur = new THREE.Quaternion().copy(qMarsRef);
  const qTarget = new THREE.Quaternion().copy(qMarsRef);
  const qGoal = new THREE.Quaternion();
  let selected = sites[0].id;
  let interactive = false;
  let lighting = 'day'; // 'day' (presentation) | 'now' (Mars24 terminator)
  let lightMix = 0;

  /* ---- Drag rotation (choose chapter only) ---- */
  const drag = { on: false, x: 0, y: 0, vx: 0, vy: 0, id: null };
  const qTmp = new THREE.Quaternion();
  const AX_Y = new THREE.Vector3(0, 1, 0);
  const AX_X = new THREE.Vector3(1, 0, 0);
  const spin = (dx, dy) => {
    qTarget.premultiply(qTmp.setFromAxisAngle(AX_Y, dx));
    qTarget.premultiply(qTmp.setFromAxisAngle(AX_X, dy));
  };
  const onDown = (e) => {
    if (!interactive || flight) return;
    drag.on = true;
    drag.id = e.pointerId;
    drag.x = e.clientX;
    drag.y = e.clientY;
    drag.vx = drag.vy = 0;
    canvas.setPointerCapture?.(e.pointerId);
    canvas.style.cursor = 'grabbing';
  };
  const onMove = (e) => {
    if (!drag.on || e.pointerId !== drag.id) return;
    const k = 3.2 / Math.max(320, canvas.clientHeight);
    const dx = (e.clientX - drag.x) * k;
    const dy = (e.clientY - drag.y) * k;
    drag.x = e.clientX;
    drag.y = e.clientY;
    drag.vx = dx;
    drag.vy = dy;
    spin(dx, dy);
  };
  const onUp = (e) => {
    if (e.pointerId !== drag.id) return;
    drag.on = false;
    canvas.style.cursor = interactive ? 'grab' : '';
  };
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', onUp);

  /* ---- Fly-to (pin / card commit) ---- */
  let flight = null;
  let landDone = null;

  /* ---- Sizing ---- */
  let W = 1;
  let H = 1;
  let dpr = 1;
  let pxBase = 1000;
  // Render resolution steps down when frames run slow (see frameWatch below).
  // Never below the screen's own pixels at 1x (that looked blurry and blocky). With motion
  // turned off the scene is a still frame, so it is always drawn at full sharpness.
  const DPR_STEPS = [2, 1.5, 1.25, 1];
  let dprStep = low ? 1 : 0;
  function resize(w, h) {
    W = Math.max(1, w);
    H = Math.max(1, h);
    dpr = Math.min(window.devicePixelRatio || 1, prefersStill() ? 2 : DPR_STEPS[dprStep]);
    renderer.setPixelRatio(dpr);
    renderer.setSize(W, H, false);
    camera.aspect = W / H;
    camera.updateProjectionMatrix();
    pxBase = (H * dpr * 0.5) / TAN;
    starMat.uniforms.uDpr.value = dpr;
    layout(W / H);
  }

  /* ---- Per-frame scratch ---- */
  const tgt = new THREE.Vector3();
  const camDir = new THREE.Vector3();
  const rocketPos = new THREE.Vector3();
  const toMars = new THREE.Vector3();
  const tangent = new THREE.Vector3();
  const orbitPos = new THREE.Vector3();
  const orbitTan = new THREE.Vector3();
  const v = new THREE.Vector3();
  const w3 = new THREE.Vector3();
  const qA = new THREE.Quaternion();
  const qB = new THREE.Quaternion();
  const landN = new THREE.Vector3();
  const landP = new THREE.Vector3();
  const hover = new THREE.Vector3();
  const landEnd = new THREE.Vector3();
  const basis = new THREE.Matrix4();
  const bx = new THREE.Vector3();
  const bz = new THREE.Vector3();
  const Z_AXIS = new THREE.Vector3(0, 0, 1);
  const X_AXIS = new THREE.Vector3(1, 0, 0);
  // Rotation that points the rocket's nose (local +Y) along `dir`, with its side kept square
  // to `ref`: unlike a shortest-arc turn it never flips when the heading swings round.
  const alignTo = (dir, ref, out) => {
    bx.crossVectors(dir, ref);
    if (bx.lengthSq() < 1e-8) bx.crossVectors(dir, Math.abs(dir.x) < 0.9 ? X_AXIS : Z_AXIS);
    bx.normalize();
    bz.crossVectors(bx, dir).normalize();
    basis.makeBasis(bx, dir, bz);
    return out.setFromRotationMatrix(basis);
  };
  let orbitA = 0;
  let orbitV = 0;
  const qRoll = new THREE.Quaternion();
  const qDrift = new THREE.Quaternion();
  const qSpin = new THREE.Quaternion();
  const sunWorld = new THREE.Vector3();
  const inv = new THREE.Quaternion();
  const right = new THREE.Vector3();
  const up = new THREE.Vector3();
  const toCamV = new THREE.Vector3();
  const Y = new THREE.Vector3(0, 1, 0);

  const project = (world, el, opacity, extra = '') => {
    if (!el) return;
    v.copy(world).project(camera);
    const vis = v.z < 1 && opacity > 0.01;
    const x = (v.x * 0.5 + 0.5) * W;
    const y = (-v.y * 0.5 + 0.5) * H;
    el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)${extra}`;
    el.style.opacity = vis ? opacity.toFixed(3) : '0';
    el.style.visibility = vis ? 'visible' : 'hidden';
  };

  function bodyUniforms(mesh, mat, sunW) {
    inv.copy(mesh.quaternion).invert();
    mat.uniforms.uSunObj.value.copy(sunW).applyQuaternion(inv).normalize();
    mat.uniforms.uCamObj.value.copy(camera.position).sub(mesh.position).divideScalar(mesh.scale.x).applyQuaternion(inv);
  }

  resize(canvas.clientWidth || window.innerWidth, canvas.clientHeight || window.innerHeight);

  const watch = frameWatch({
    onSlow() {
      if (dprStep >= DPR_STEPS.length - 1) return;
      dprStep++;
      resize(W, H);
      onQuality?.(dprStep >= 2 ? 'low' : 'high');
    },
  });
  let skip = 0;

  function update(state) {
    if (!L.curve) return;
    watch.tick();
    // Weaker devices, on the site globe with nothing moving: draw every other frame (the slow
    // spin, orbit and twinkle still read as smooth, at half the work).
    const idle = interactive && !drag.on && !flight && Math.abs(drag.vx) + Math.abs(drag.vy) < 1e-5 && Math.abs(state.velocity) < 1e-3;
    if (idle && (low || dprStep >= 2) && skip++ % 2) return;
    const reduced = state.reduced;
    const time = reduced ? 1.234 : state.time;
    const p = state.progress;
    const intro = state.intro;
    const dt = state.dt;

    if (performance.now() - m24At > 10000) {
      updateSunNow();
      m24At = performance.now();
    }

    /* intro fades */
    const fSky = smoothstep(0.0, 0.22, intro);
    const fEarth = smoothstep(0.0, 0.25, intro);
    const fFar = smoothstep(0.1, 0.4, intro);
    const fRocket = smoothstep(0.02, 0.12, intro);
    const ignite = smoothstep(0.0, 0.1, intro);
    // launch: Earth's surface → the hero pose while the intro plays
    const launch = 1 - Math.pow(1 - smoothstep(0.0, 1.0, intro), 3);
    skyMat.uniforms.uFade.value = fSky;
    starMat.uniforms.uFade.value = fSky;
    starMat.uniforms.uTime.value = time;
    earthMat.uniforms.uFade.value = fEarth;
    earthAtmo.material.uniforms.uIntensity.value = 1.25 * fEarth;
    moonMat.uniforms.uFade.value = fFar;
    marsMat.uniforms.uFade.value = fFar;
    marsAtmo.material.uniforms.uIntensity.value = 0.45 * fFar;

    /* chapter weights */
    const arrive = smoothstep(0.58, 0.86, p);
    const choose = smoothstep(0.84, 0.93, p);
    const wasInteractive = interactive;
    interactive = choose > 0.98;
    if (interactive && !wasInteractive) {
      canvas.style.cursor = 'grab';
      qTarget.copy(qSite.get(selected));
    }
    if (!interactive && wasInteractive) {
      canvas.style.cursor = '';
      drag.on = false;
    }

    /* ---- Rocket along the transfer path, then into a steady parking orbit ---- */
    const fp = easeInOut(clamp01(p / 0.9));
    const u = L.u0 * launch + (1 - L.u0) * fp;
    L.curve.getPoint(u, rocketPos);
    L.curve.getTangent(u, tangent);
    // in the opening frame the rocket stands at the reference angle, not along the curve
    // from Earth (which leaned it over to ~50°); it eases onto the path as you scroll
    if (L.heroDir) tangent.lerp(L.heroDir, launch * (1 - smoothstep(0.02, 0.16, p))).normalize();
    const park = smoothstep(0.8, 0.9, p);
    // Orbit angle: 0 is where the flight path ends. Once in orbit the rocket glides up to a
    // steady speed; scrolling back winds it home along the circle (never across the planet).
    if (park >= 0.999 && !reduced) {
      orbitV += (ORBIT_W - orbitV) * Math.min(1, dt * 0.8);
      orbitA += orbitV * dt;
    } else {
      orbitV = 0;
      const w = Math.atan2(Math.sin(orbitA), Math.cos(orbitA));
      orbitA = w - Math.sign(w) * Math.min(Math.abs(w), dt * 3);
    }
    let qFlight = alignTo(tangent, Z_AXIS, qA);
    if (park > 0) {
      const pr = L.marsR * PARK_R;
      orbitPos.copy(L.marsPos).addScaledVector(L.parking.u, Math.cos(orbitA) * pr).addScaledVector(L.parking.v, Math.sin(orbitA) * pr);
      orbitTan.copy(L.parking.u).multiplyScalar(-Math.sin(orbitA)).addScaledVector(L.parking.v, Math.cos(orbitA)).normalize();
      rocketPos.lerp(orbitPos, park);
      // turn smoothly between the flight heading and the orbit heading (no flips)
      qFlight = qA.slerp(alignTo(orbitTan, L.parking.n, qB), park);
    }
    toMars.copy(rocketPos).sub(L.marsPos);
    const minR = L.marsR * 1.15;
    if (toMars.lengthSq() < minR * minR) rocketPos.copy(L.marsPos).addScaledVector(toMars.normalize(), minR);
    let rScale = L.rocketLen * lerp(1, 0.17, smoothstep(0.25, 0.82, p)) * lerp(1, 0.6, park);
    rig.group.quaternion.copy(qFlight);

    /* ---- Landing on the chosen site: de-orbit, flip tail-first, braking burn, touchdown ---- */
    let landThrust = null;
    if (flight) {
      flight.t += reduced ? LAND_T : dt;
      const T = flight.t;
      if (!flight.from) {
        flight.from = rocketPos.clone();
        flight.s0 = rScale;
        flight.q0 = rig.group.quaternion.clone();
      }
      // the site's surface normal, with Mars as it is turning to face the camera
      landN.copy(siteVec.get(flight.id)).applyQuaternion(qCur).normalize();
      landP.copy(landN).multiplyScalar(L.marsR).add(L.marsPos);
      flight.site = landP;
      const s1 = L.marsR * 0.14;
      const desc = clamp01((T - 0.35) / 1.75);
      const e = 1 - Math.pow(1 - desc, 3); // fast from orbit, slow over the ground
      hover.copy(landP).addScaledVector(landN, L.marsR * 0.45);
      landEnd.copy(landP).addScaledVector(landN, s1 * 0.5);
      rocketPos.copy(flight.from).multiplyScalar((1 - e) * (1 - e))
        .addScaledVector(hover, 2 * (1 - e) * e)
        .addScaledVector(landEnd, e * e);
      rScale = lerp(flight.s0, s1, smooth(clamp01(desc * 1.4)));
      // flip: nose away from the ground, engines down
      rig.group.quaternion.copy(flight.q0).slerp(alignTo(landN, Z_AXIS, qB), smooth(clamp01(T / 0.7)));
      // braking burn, throttling down as it touches down
      landThrust = smoothstep(0.15, 0.45, T) * lerp(0.9, 0.35, desc) * (1 - smoothstep(2.0, 2.15, T));
    }
    rig.group.scale.setScalar(rScale);
    rig.group.position.copy(rocketPos);
    qRoll.setFromAxisAngle(Y, reduced ? 0.6 : time * 0.15);
    rig.body.quaternion.copy(qRoll);

    // engines cut off as it settles into orbit
    const vel = Math.min(1, Math.abs(state.velocity) * 4);
    const flicker = reduced ? 0 : Math.sin(time * 23) * 0.015;
    const thrust = landThrust ?? ignite * (1 + vel * 0.35 + flicker) * (1 - park);

    /* ---- Camera ---- */
    const chase = smoothstep(0.03, 0.42, p);
    tgt.set(0, 0, 0).lerp(w3.copy(rocketPos).add(L.chase), chase * 0.85);
    camDir.set(0, 0, 1).lerp(v.set(0.42, 0.14, 1), smoothstep(0.08, 0.5, p) * (1 - arrive)).normalize();
    let dist = lerp(10, 7, smoothstep(0, 0.35, p));
    tgt.lerp(L.endTarget, arrive);
    camDir.lerp(v.set(0, 0, 1), arrive).normalize();
    dist = lerp(dist, L.endDist, arrive);

    // fly-in to a site
    let exit = 0;
    const flyFade = 1; // the rocket stays in view all the way down
    if (flight) {
      const T = flight.t;
      const rot = clamp01(T / 0.85);
      const zoom = smooth(clamp01((T - 0.1) / 1.4));
      exit = smooth(clamp01((T - 2.3) / 0.4));
      if (rot < 1) qTarget.copy(qSite.get(flight.id));
      // follow the rocket down to a low, side-on view with the horizon in frame
      tgt.lerp(flight.site, zoom);
      // camera low over the ground, 'south' of the site, so the rocket stands upright on screen
      // with the curved horizon behind it
      camDir.lerp(v.copy(landN).multiplyScalar(0.62).addScaledVector(Y, -0.75).add(w3.set(0.22, 0, 0)).normalize(), zoom).normalize();
      dist = lerp(dist, L.marsR * 0.62, zoom);
      if (T > LAND_T || reduced) {
        const id = flight.id;
        flight = null;
        onArrive?.(id);
        const cb = landDone;
        landDone = null;
        cb?.(id);
      }
    }

    camera.position.copy(tgt).addScaledVector(camDir, dist);
    const par = (reduced ? 0 : 1) * (1 - 0.7 * arrive);
    camera.lookAt(tgt);
    camera.updateMatrixWorld();
    right.setFromMatrixColumn(camera.matrixWorld, 0);
    up.setFromMatrixColumn(camera.matrixWorld, 1);
    camera.position.addScaledVector(right, state.pointer.sx * 0.32 * par).addScaledVector(up, state.pointer.sy * 0.2 * par);
    camera.lookAt(tgt);
    camera.updateMatrixWorld();

    sky.position.copy(camera.position);
    stars.position.copy(camera.position);

    /* ---- Bodies ---- */
    // a visible turn; starts with Europe, Africa and Asia lit up on the night side
    qSpin.setFromAxisAngle(Y, 1.6 + (reduced ? 0 : time * 0.09));
    earth.quaternion.copy(qEarthBase).multiply(qSpin);
    earthMat.uniforms.uCloudShift.value = reduced ? 0 : time * 0.004;
    bodyUniforms(earth, earthMat, SUN_EARTH);
    earthAtmo.material.uniforms.uSunWorld.value.copy(SUN_EARTH);
    if (L.lunar) {
      // drift along a short arc of its orbit around the reference spot: a full lap took it
      // behind Earth and off the frame
      const a = reduced ? 0 : 0.42 * Math.sin(time * 0.3);
      moon.position.copy(L.lunar.c).addScaledVector(L.lunar.u, Math.cos(a) * L.lunar.r).addScaledVector(L.lunar.v, Math.sin(a) * L.lunar.r);
    }
    bodyUniforms(moon, moonMat, SUN_MOON);

    // Mars: reference pose → site-facing pose; interactive drag in the last chapter
    if (interactive && !drag.on && !reduced) {
      if (Math.abs(drag.vx) + Math.abs(drag.vy) > 1e-5) {
        spin(drag.vx, drag.vy);
        drag.vx *= Math.exp(-dt * 4);
        drag.vy *= Math.exp(-dt * 4);
      }
    }
    if (interactive || flight) qGoal.copy(qTarget);
    else {
      qB.copy(qMarsRef).multiply(qTmp.setFromAxisAngle(Y, reduced ? 0 : time * 0.12));
      qGoal.copy(qB).slerp(qSite.get(selected), smoothstep(0.55, 0.88, p));
      qTarget.copy(qGoal);
    }
    if (reduced) qCur.copy(qGoal);
    else qCur.slerp(qGoal, 1 - Math.exp(-dt * (drag.on ? 18 : 5)));
    mars.quaternion.copy(qCur);

    lightMix += ((lighting === 'now' ? 1 : 0) - lightMix) * (reduced ? 1 : 1 - Math.exp(-dt * 4));
    const presentation = v.copy(SUN_MARS_REF).lerp(SUN_MARS_DAY, arrive).normalize();
    const now = w3.copy(sunObjNow).applyQuaternion(qCur);
    sunWorld.copy(presentation).lerp(now, lightMix).normalize();
    bodyUniforms(mars, marsMat, sunWorld);
    marsMat.uniforms.uAmbient.value = 0.03 + 0.11 * lightMix * choose;
    marsAtmo.material.uniforms.uSunWorld.value.copy(sunWorld);

    /* ---- Rocket uniforms ---- */
    const nearMars = flight ? 1 : smoothstep(0.45, 0.8, p);
    rig.update({
      time,
      thrust,
      px: pxBase * rScale,
      fade: fRocket * flyFade,
      // the rocket is lit by the sun it is flying under: Earth's key light early on, Mars's
      // sun (and its rust-coloured bounce light) on approach and during the landing
      sunWorld: rocketSun.copy(SUN_EARTH).lerp(sunWorld, nearMars).normalize(),
      bounce: rocketBounce.copy(BOUNCE_EARTH).lerp(BOUNCE_MARS, nearMars),
      legs: flight ? smoothstep(1.15, 1.75, flight.t) : 0,
      camera,
      // smoke only in air: thick at launch from Earth, gone in space; a thin dust cloud in
      // Mars's air in the last metres of the landing
      smoke: flight ? 0.45 * smoothstep(1.3, 1.9, flight.t) : 1 - smoothstep(0.08, 0.3, p),
    });

    /* ---- Hairlines ---- */
    transfer.material.uniforms.uProgress.value = u;
    transfer.material.uniforms.uFade.value = fRocket * (1 - choose * 0.85);
    lunarRing.material.uniforms.uFade.value = fFar * (1 - smoothstep(0.3, 0.55, p));
    marsRing.material.uniforms.uFade.value = fFar * (0.35 + 0.65 * smoothstep(0.55, 0.85, p)) * (1 - choose * 0.4);

    renderer.render(scene, camera);

    /* ---- DOM overlays (labels + pins) ---- */
    if (dom) {
      const labelsOn = smoothstep(0.55, 0.85, intro) * (1 - smoothstep(0.05, 0.14, p));
      project(w3.copy(earth.position).addScaledVector(right, L.earthR * 0.66).addScaledVector(up, L.earthR * 0.84), dom.labels?.earth, labelsOn);
      project(w3.copy(moon.position).addScaledVector(right, L.moonR * 1.1).addScaledVector(up, L.moonR * 0.6), dom.labels?.moon, labelsOn);
      project(w3.copy(mars.position).addScaledVector(right, -L.marsR * 1.05).addScaledVector(up, L.marsR * 1.3), dom.labels?.mars, labelsOn * (1 - arrive));

      const pinsOn = choose * (1 - exit);
      for (const s of sites) {
        const el = dom.pins?.get(s.id);
        if (!el) continue;
        const n = w3.copy(siteVec.get(s.id)).applyQuaternion(qCur);
        const world = v.copy(n).multiplyScalar(L.marsR).add(mars.position);
        const toCam = toCamV.copy(camera.position).sub(world).normalize();
        const facing = n.dot(toCam);
        const op = pinsOn * smoothstep(0.05, 0.35, facing);
        project(world, el, op);
        el.dataset.active = s.id === selected ? 'true' : 'false';
        el.tabIndex = op > 0.2 ? 0 : -1;
      }
      if (dom.exit) dom.exit.style.opacity = exit.toFixed(3);
    }
  }

  return {
    renderer,
    stats: rig.stats,
    resize,
    update,
    setSelected(id) {
      if (!qSite.has(id)) return;
      selected = id;
      if (interactive) qTarget.copy(qSite.get(id));
    },
    flyTo(id) {
      if (!qSite.has(id) || flight) return;
      selected = id;
      qTarget.copy(qSite.get(id));
      flight = { id, t: 0 };
    },
    /** Play the landing on a site; `done` runs at touchdown. */
    land(id, done) {
      if (!qSite.has(id)) return done?.();
      if (flight) return;
      landDone = done;
      selected = id;
      qTarget.copy(qSite.get(id));
      flight = { id, t: 0 };
    },
    cancelLanding() {
      flight = null;
      landDone = null;
    },
    setLighting(mode) {
      lighting = mode === 'now' ? 'now' : 'day';
    },
    isInteractive: () => interactive,
    dispose() {
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onUp);
      rig.dispose();
      for (const rt of [marsRT, earthRT, earthAuxRT, moonRT, skyRT, ...loaded]) rt.dispose();
      scene.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) o.material.dispose();
      });
      renderer.dispose();
    },
  };
}
