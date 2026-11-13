/* ==========================================================================
   Rocket rig
   A solid white heavy-lift rocket (core stage, black interstage band, nose
   fairing, two side boosters, three engine bells) drawn in one mesh with a
   painted shader with self-shadowing, a turbulent flame mesh per engine, soft smoke behind the
   flames and a glow at each nozzle.
   Local units: rocket length = 1, engines at y = 0, nose at y = 1.
   ========================================================================== */

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { ROCKET_VERTEX, ROCKET_FRAGMENT, FLAME_VERTEX, FLAME_FRAGMENT, SMOKE_VERTEX, SMOKE_FRAGMENT, GLOW_VERTEX, GLOW_FRAGMENT } from './shaders.js';

const CORE_R = 0.05;
const BOOST_R = 0.031;
const BOOST_X = CORE_R + BOOST_R + 0.006;

// Radius profiles (null = no hull at this height)
function coreProfile(y) {
  if (y < 0.045) return null;
  if (y < 0.86) return CORE_R;
  const t = (y - 0.86) / 0.14;
  return CORE_R * 1.03 * Math.pow(Math.max(0, 1 - Math.pow(t, 2.1)), 0.56);
}
function boosterProfile(y) {
  if (y < 0.05 || y > 0.6) return null;
  if (y < 0.5) return BOOST_R;
  const t = (y - 0.5) / 0.1;
  return BOOST_R * Math.pow(Math.max(0, 1 - Math.pow(t, 1.8)), 0.6);
}
function bellProfile(y, top, bottomR, topR) {
  if (y > top || y < 0) return null;
  return topR + (bottomR - topR) * (1 - y / top);
}

/** Surface of revolution from a radius profile, closed at the bottom, tagged with its part. */
function lathe(profile, y0, y1, step, segments, cx, part, { closeBottom = true } = {}) {
  const pts = [];
  if (closeBottom) pts.push(new THREE.Vector2(0, y0));
  for (let y = y0; y <= y1 + 1e-6; y += step) {
    const r = profile(y);
    if (r != null) pts.push(new THREE.Vector2(Math.max(0, r), y));
  }
  const g = new THREE.LatheGeometry(pts, segments);
  g.translate(cx, 0, 0);
  return tag(g, part);
}

function tag(g, part) {
  g.setAttribute('aPart', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count).fill(part), 1));
  return g;
}

/** "REDSTEP" lettering, drawn once into a small texture (redrawn when the font arrives). */
function letteringTexture() {
  const c = document.createElement('canvas');
  c.width = 2048;
  c.height = 256;
  const tex = new THREE.CanvasTexture(c);
  tex.anisotropy = 8;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  const draw = () => {
    const ctx = c.getContext('2d');
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.fillStyle = '#000';
    ctx.font = '700 168px "Syne", "Helvetica Neue", Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if ('letterSpacing' in ctx) ctx.letterSpacing = '28px';
    ctx.fillText('REDSTEP', c.width / 2, c.height / 2 + 4);
    tex.needsUpdate = true;
  };
  draw();
  document.fonts?.load('700 84px "Syne"').then(draw, () => {});
  return tex;
}

export function createRocketRig({ quality = 'high' } = {}) {
  const low = quality === 'low';
  const group = new THREE.Group();
  group.name = 'rocket';
  const body = new THREE.Group(); // rolls about its long axis
  body.position.y = -0.5; // pivot at mid-length
  group.add(body);

  /* ---- Vehicle ---- */
  // Keep the rocket hull smooth on every device. This is a small mesh, so the extra
  // radial detail has negligible cost compared with the full-screen planet shaders.
  const SEG = 72;
  const parts = [
    lathe(coreProfile, 0.045, 1.0, 0.004, SEG, 0, 0),
    lathe(boosterProfile, 0.05, 0.6, 0.004, Math.round(SEG * 0.75), BOOST_X, 1),
    lathe(boosterProfile, 0.05, 0.6, 0.004, Math.round(SEG * 0.75), -BOOST_X, 1),
    lathe((y) => bellProfile(y, 0.045, CORE_R * 0.78, CORE_R * 0.42), 0, 0.045, 0.003, SEG, 0, 2, { closeBottom: false }),
    lathe((y) => bellProfile(y, 0.05, BOOST_R * 0.82, BOOST_R * 0.45), 0, 0.05, 0.003, Math.round(SEG * 0.6), BOOST_X, 2, { closeBottom: false }),
    lathe((y) => bellProfile(y, 0.05, BOOST_R * 0.82, BOOST_R * 0.45), 0, 0.05, 0.003, Math.round(SEG * 0.6), -BOOST_X, 2, { closeBottom: false }),
  ];
  // booster attach struts
  for (const sx of [1, -1]) {
    for (const y of [0.16, 0.46]) {
      const len = BOOST_X - BOOST_R - CORE_R + 0.004;
      const g = new THREE.CylinderGeometry(0.0032, 0.0032, len, 8);
      g.rotateZ(Math.PI / 2);
      g.translate(sx * (CORE_R + len / 2 - 0.002), y, 0);
      parts.push(tag(g, 3));
    }
  }
  for (const g of parts) g.deleteAttribute('uv');
  const vehicleGeo = mergeGeometries(parts.map((g) => (g.index ? g.toNonIndexed() : g)));
  for (const g of parts) g.dispose();

  const text = letteringTexture();
  const vehicleMat = new THREE.ShaderMaterial({
    vertexShader: ROCKET_VERTEX,
    fragmentShader: ROCKET_FRAGMENT,
    uniforms: {
      uSunView: { value: new THREE.Vector3(0.6, 0.4, 0.7).normalize() },
      uSunObj: { value: new THREE.Vector3(0.6, 0.4, 0.7).normalize() },
      uBoostR: { value: BOOST_R },
      uFade: { value: 1 },
      uThrust: { value: 1 },
      uText: { value: text },
      uCoreR: { value: CORE_R },
      uBoostX: { value: BOOST_X },
    },
    side: THREE.DoubleSide, // the bells are open cones
  });
  const vehicle = new THREE.Mesh(vehicleGeo, vehicleMat);
  vehicle.frustumCulled = false;
  body.add(vehicle);

  /* ---- Flames: an inner white-hot core and an outer turbulent flame per engine ---- */
  const nozzles = [new THREE.Vector3(0, 0, 0), new THREE.Vector3(BOOST_X, 0, 0), new THREE.Vector3(-BOOST_X, 0, 0)];
  const exitR = [CORE_R * 0.74, BOOST_R * 0.8, BOOST_R * 0.8];
  const flames = [];
  const flameMats = [];
  const RAD = low ? 18 : 36;
  const HSEG = low ? 12 : 28;
  nozzles.forEach((n, k) => {
    for (const hot of [0, 1]) {
      // a cone from the nozzle (y = 0) down to y = -1; length is scaled in the shader
      const r0 = exitR[k] * (hot ? 0.62 : 0.95);
      const r1 = exitR[k] * (hot ? 0.35 : 2.6);
      const g = new THREE.CylinderGeometry(r0, r1, 1, RAD, HSEG, true);
      g.translate(0, -0.5, 0);
      const m = new THREE.ShaderMaterial({
        vertexShader: FLAME_VERTEX,
        fragmentShader: FLAME_FRAGMENT,
        uniforms: {
          uTime: { value: 0 },
          uThrust: { value: 1 },
          uLen: { value: (k === 0 ? 0.42 : 0.34) * (hot ? 0.45 : 1) },
          uHot: { value: hot },
          uSeed: { value: k * 3.1 + hot * 1.7 },
        },
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
      });
      const mesh = new THREE.Mesh(g, m);
      mesh.position.copy(n);
      mesh.frustumCulled = false;
      mesh.renderOrder = 3;
      body.add(mesh);
      flames.push(mesh);
      flameMats.push(m);
    }
  });

  /* ---- Smoke: soft puffs that billow out where the flames thin ---- */
  const COUNT = low ? 700 : 1500;
  const aNozzle = new Float32Array(COUNT);
  const aSeed = new Float32Array(COUNT * 4);
  const pos = new Float32Array(COUNT * 3);
  let s = 1337;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < COUNT; i++) {
    const r = rnd();
    aNozzle[i] = r < 0.46 ? 0 : r < 0.73 ? 1 : 2;
    aSeed[i * 4] = rnd();
    aSeed[i * 4 + 1] = rnd();
    aSeed[i * 4 + 2] = rnd();
    aSeed[i * 4 + 3] = rnd();
  }
  const plumeGeo = new THREE.BufferGeometry();
  plumeGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  plumeGeo.setAttribute('aNozzle', new THREE.BufferAttribute(aNozzle, 1));
  plumeGeo.setAttribute('aSeed', new THREE.BufferAttribute(aSeed, 4));
  const plumeMat = new THREE.ShaderMaterial({
    vertexShader: SMOKE_VERTEX,
    fragmentShader: SMOKE_FRAGMENT,
    uniforms: {
      uTime: { value: 0 },
      uThrust: { value: 1 },
      uLen: { value: 1.05 },
      uPx: { value: 1000 },
      uNozzle: { value: nozzles },
      uNozzleR: { value: exitR },
    },
    transparent: true,
    depthWrite: false,
    blending: THREE.NormalBlending,
  });
  const plume = new THREE.Points(plumeGeo, plumeMat);
  plume.frustumCulled = false;
  plume.renderOrder = 1; // smoke first, the flames glow over it
  body.add(plume); // plume rolls with the body, matching nozzle positions

  const glowGeo = new THREE.BufferGeometry();
  glowGeo.setAttribute(
    'position',
    new THREE.Float32BufferAttribute([0, -0.01, 0, BOOST_X, -0.008, 0, -BOOST_X, -0.008, 0], 3),
  );
  glowGeo.setAttribute('aSize', new THREE.Float32BufferAttribute([0.2, 0.13, 0.13], 1));
  const glowMat = new THREE.ShaderMaterial({
    vertexShader: GLOW_VERTEX,
    fragmentShader: GLOW_FRAGMENT,
    uniforms: { uPx: { value: 1000 }, uThrust: { value: 1 }, uTime: { value: 0 } },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const glow = new THREE.Points(glowGeo, glowMat);
  glow.frustumCulled = false;
  glow.renderOrder = 2;
  body.add(glow);

  const tmpV = new THREE.Vector3();
  const tmpM = new THREE.Matrix3();
  const tmpInv = new THREE.Matrix4();

  return {
    group,
    body,
    stats: { triangles: vehicleGeo.attributes.position.count / 3, particles: COUNT, flames: flames.length },
    /** Per-frame uniform writes only. */
    update({ time, thrust, px, fade, sunWorld, camera }) {
      plumeMat.uniforms.uTime.value = time;
      plumeMat.uniforms.uThrust.value = Math.min(1, thrust) * fade;
      plumeMat.uniforms.uPx.value = px;
      for (const m of flameMats) {
        m.uniforms.uTime.value = time;
        m.uniforms.uThrust.value = thrust * fade;
      }
      for (const f of flames) f.visible = thrust * fade > 0.01;
      glowMat.uniforms.uTime.value = time;
      glowMat.uniforms.uThrust.value = thrust;
      glowMat.uniforms.uPx.value = px;
      vehicleMat.uniforms.uFade.value = fade;
      vehicleMat.uniforms.uThrust.value = thrust;
      // opaque once fully in; blended only while fading in or out
      vehicleMat.transparent = fade < 0.999;
      // sun in view space for the paint shading
      tmpM.setFromMatrix4(camera.matrixWorldInverse);
      vehicleMat.uniforms.uSunView.value.copy(tmpV.copy(sunWorld).applyMatrix3(tmpM).normalize());
      // and in the vehicle's own frame, for the shadows it casts on itself
      tmpInv.copy(vehicle.matrixWorld).invert();
      vehicleMat.uniforms.uSunObj.value.copy(sunWorld).transformDirection(tmpInv);
    },
    dispose() {
      vehicleGeo.dispose();
      vehicleMat.dispose();
      text.dispose();
      plumeGeo.dispose();
      glowGeo.dispose();
      plumeMat.dispose();
      for (const f of flames) f.geometry.dispose();
      for (const m of flameMats) m.dispose();
      glowMat.dispose();
    },
  };
}
