/* ==========================================================================
   GLSL for the hero scene. Everything renders in display (sRGB-referred)
   space with no tone mapping, so sampled reference hexes map 1:1.
   ========================================================================== */

/* ---------- Noise (simplex: Ashima Arts / Gustavson, MIT) ---------------- */
export const NOISE = /* glsl */ `
vec3 mod289(vec3 x){ return x - floor(x * (1.0/289.0)) * 289.0; }
vec4 mod289(vec4 x){ return x - floor(x * (1.0/289.0)) * 289.0; }
vec4 permute(vec4 x){ return mod289(((x*34.0)+1.0)*x); }
vec4 taylorInvSqrt(vec4 r){ return 1.79284291400159 - 0.85373472095314 * r; }
float snoise(vec3 v){
  const vec2 C = vec2(1.0/6.0, 1.0/3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
  vec3 i  = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);
  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;
  i = mod289(i);
  vec4 p = permute(permute(permute(
            i.z + vec4(0.0, i1.z, i2.z, 1.0))
          + i.y + vec4(0.0, i1.y, i2.y, 1.0))
          + i.x + vec4(0.0, i1.x, i2.x, 1.0));
  float n_ = 0.142857142857;
  vec3 ns = n_ * D.wyz - D.xzx;
  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);
  vec4 x = x_ * ns.x + ns.yyyy;
  vec4 y = y_ * ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);
  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);
  vec4 s0 = floor(b0) * 2.0 + 1.0;
  vec4 s1 = floor(b1) * 2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));
  vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);
  vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
  p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
  vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
  m = m * m;
  return 42.0 * dot(m*m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
}
float fbm(vec3 p, int oct){
  float a = 0.5, s = 0.0, n = 0.0;
  for (int i = 0; i < 8; i++){
    if (i >= oct) break;
    s += a * snoise(p); n += a;
    p = p * 2.03 + vec3(1.7, 9.2, 3.1);
    a *= 0.5;
  }
  return s / n;
}
vec3 hash33(vec3 p){
  p = fract(p * vec3(0.1031, 0.1030, 0.0973));
  p += dot(p, p.yxz + 33.33);
  return fract((p.xxy + p.yxx) * p.zyx);
}
// x: F1 distance, yzw: per-cell random
vec4 worley(vec3 p){
  vec3 ip = floor(p), fp = fract(p);
  float d1 = 8.0; vec3 id = vec3(0.0);
  for (int z = -1; z <= 1; z++)
  for (int y = -1; y <= 1; y++)
  for (int x = -1; x <= 1; x++){
    vec3 o = vec3(float(x), float(y), float(z));
    vec3 r = o + hash33(ip + o) - fp;
    float d = dot(r, r);
    if (d < d1){ d1 = d; id = ip + o; }
  }
  return vec4(sqrt(d1), hash33(id + 17.17));
}
`;

/* ---------- Equirect bake helpers ---------------------------------------- */
const BAKE_COMMON = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform float uSeed;
${NOISE}
vec3 llDir(float lat, float lon){
  float phi = radians(lon + 180.0);
  float cl = cos(radians(lat));
  return vec3(-cos(phi) * cl, sin(radians(lat)), sin(phi) * cl);
}
// Soft elliptical province in lat/lon (rLon in great-circle degrees).
float region(float lat, float lon, float clat, float clon, float rlat, float rlon, float warp){
  float dlon = (mod(lon - clon + 540.0, 360.0) - 180.0) * cos(radians(lat));
  vec2 q = vec2((lat - clat) / rlat, dlon / rlon);
  return 1.0 - smoothstep(0.55, 1.05, length(q) + warp);
}
float cap(vec3 p, float lat, float lon, float r, float warp){
  float a = degrees(acos(clamp(dot(p, llDir(lat, lon)), -1.0, 1.0)));
  return 1.0 - smoothstep(r * 0.7, r, a + warp);
}
float peak(vec3 p, float lat, float lon, float r){
  float a = degrees(acos(clamp(dot(p, llDir(lat, lon)), -1.0, 1.0)));
  return exp(-(a * a) / (r * r));
}
float crater(float d){
  float bowl = d < 1.0 ? (d * d - 1.0) : 0.0;
  float rim = exp(-pow((d - 1.0) / 0.2, 2.0)) * 0.4;
  return bowl * 0.85 + rim;
}
float craterField(vec3 p, float freq, float density, float seed){
  vec4 w = worley(p * freq + seed);
  float r = mix(0.18, 0.42, w.y);
  return w.z < density ? crater(w.x / r) : 0.0;
}
`;

export const BAKE_VERTEX = /* glsl */ `
varying vec2 vUv;
void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

/* Mars: rgb = albedo, a = relative height. Albedo provinces placed at their
   real lat/lon (Syrtis Major, Acidalia, Hellas…) — still ILLUSTRATIVE. */
export const BAKE_MARS = /* glsl */ `
${BAKE_COMMON}
void main(){
  float lat = (vUv.y - 0.5) * 180.0;
  float lon = vUv.x * 360.0 - 180.0;
  vec3 p = llDir(lat, lon);
  float w  = fbm(p * 2.6 + uSeed, 5) * 0.42;
  float w2 = fbm(p * 9.0 - uSeed, 4) * 0.2;
  float ww = w + w2;

  float dark = 0.0;
  dark = max(dark, region(lat, lon,   8.0,   69.0, 17.0, 11.0, ww));        // Syrtis Major
  dark = max(dark, region(lat, lon,  46.0,  -25.0, 13.0, 26.0, ww) * 0.8);  // Acidalia
  dark = max(dark, region(lat, lon, -24.0,  -30.0, 11.0, 28.0, ww) * 0.85); // Mare Erythraeum
  dark = max(dark, region(lat, lon,  -3.0,    2.0,  5.5, 16.0, ww) * 0.85); // Sinus Meridiani
  dark = max(dark, region(lat, lon,  -9.0,   30.0,  7.0, 24.0, ww) * 0.8);  // Sinus Sabaeus
  dark = max(dark, region(lat, lon, -18.0,  105.0, 11.0, 22.0, ww) * 0.85); // Mare Tyrrhenum
  dark = max(dark, region(lat, lon, -24.0,  145.0, 11.0, 24.0, ww) * 0.85); // Mare Cimmerium
  dark = max(dark, region(lat, lon, -32.0, -150.0, 11.0, 22.0, ww) * 0.8);  // Mare Sirenum
  dark = max(dark, region(lat, lon, -26.0,  -87.0,  4.5,  6.5, w * 0.5) * 0.8); // Solis Lacus
  dark = max(dark, region(lat, lon,  45.0,  110.0, 13.0, 28.0, ww) * 0.35); // Utopia
  dark = max(dark, region(lat, lon,  64.0,    0.0,  5.0, 80.0, ww) * 0.55); // polar collar

  float bright = 0.0;
  bright = max(bright, region(lat, lon,  20.0,   10.0, 17.0, 28.0, w) * 0.6);  // Arabia
  bright = max(bright, region(lat, lon,   5.0, -110.0, 25.0, 30.0, w) * 0.75); // Tharsis
  bright = max(bright, region(lat, lon,  15.0, -160.0, 15.0, 20.0, w) * 0.6);  // Amazonis
  bright = max(bright, region(lat, lon,  25.0,  147.0, 11.0, 15.0, w) * 0.5);  // Elysium
  bright = max(bright, region(lat, lon, -42.0,   70.0, 12.0, 17.0, w * 0.6) * 0.85); // Hellas
  bright = max(bright, region(lat, lon, -50.0,  -43.0,  7.0,  9.0, w * 0.6) * 0.6);  // Argyre

  // Valles Marineris centre-line
  float vlat = -7.0 - 6.0 * smoothstep(-100.0, -70.0, lon) + 5.0 * smoothstep(-60.0, -38.0, lon);
  float vm = (1.0 - smoothstep(0.4, 1.7, abs(lat - vlat) + w2 * 4.0))
           * smoothstep(-104.0, -96.0, lon) * (1.0 - smoothstep(-42.0, -35.0, lon));

  float h = 0.5;
  h += region(lat, lon, 2.0, -110.0, 30.0, 36.0, w * 0.5) * 0.10;     // Tharsis rise
  h += peak(p,  18.65, -133.8, 3.2) * 0.26;                            // Olympus Mons
  h -= peak(p,  18.65, -133.8, 0.5) * 0.08;                            // caldera
  h += peak(p,  11.8, -104.5, 1.8) * 0.15;                             // Ascraeus
  h += peak(p,   0.8, -113.4, 1.8) * 0.14;                             // Pavonis
  h += peak(p,  -8.3, -120.1, 1.9) * 0.15;                             // Arsia
  h += peak(p,  24.8,  146.9, 1.8) * 0.09;                             // Elysium Mons
  h -= region(lat, lon, -42.0, 70.0, 14.0, 19.0, w * 0.3) * 0.17;      // Hellas basin
  h -= region(lat, lon, -50.0, -43.0, 7.0, 9.0, w * 0.3) * 0.08;       // Argyre basin
  h -= smoothstep(5.0, 45.0, lat + w * 18.0) * 0.06;                   // northern lowlands
  h -= vm * 0.12;

  float south = smoothstep(15.0, -25.0, lat + w * 20.0);
  float cr = craterField(p, 9.0,  mix(0.25, 0.55, south), uSeed) * 0.055
           + craterField(p, 24.0, mix(0.3, 0.7, south), uSeed + 3.1) * 0.03
           + craterField(p, 70.0, mix(0.25, 0.6, south), uSeed + 7.7) * 0.012;
  h += cr;

  float n = fbm(p * 5.5 + 2.0, 6);
  float fine = fbm(p * 40.0, 3);
  vec3 cBright = vec3(0.82, 0.54, 0.36);
  vec3 cMid    = vec3(0.66, 0.38, 0.23);
  vec3 cDark   = vec3(0.30, 0.19, 0.14);
  vec3 col = mix(cMid, cBright, clamp(0.45 + n * 0.55 + bright * 0.55, 0.0, 1.0));
  col = mix(col, cDark, clamp(dark * (0.75 + 0.3 * n) + vm * 0.45, 0.0, 1.0));
  col *= 0.93 + fine * 0.1 + cr * 1.6;

  float trough = sin(atan(p.z, p.x) * 3.0 + lat * 0.9) * 0.5 + 0.5;
  float capN = smoothstep(78.0, 83.0, lat + w * 6.0) * mix(0.75, 1.0, trough);
  float capS = cap(p, -87.0, -45.0, 6.0, w * 3.0);
  col = mix(col, vec3(0.93, 0.91, 0.88), clamp(max(capN, capS), 0.0, 1.0));

  gl_FragColor = vec4(col, clamp(h, 0.0, 1.0));
}
`;

/* Earth day: rgb = albedo, a = ocean mask. Continents are coarse lat/lon
   approximations so the planet reads as Earth at hero scale. */
export const BAKE_EARTH = /* glsl */ `
${BAKE_COMMON}
float landField(float lat, float lon, float w){
  float l = 0.0;
  l = max(l, region(lat, lon, -10.0,  -60.0, 20.0, 17.0, w)); // S. America
  l = max(l, region(lat, lon, -34.0,  -65.0, 15.0,  7.0, w));
  l = max(l, region(lat, lon,  47.0, -100.0, 17.0, 28.0, w)); // N. America
  l = max(l, region(lat, lon,  63.0, -115.0, 11.0, 26.0, w));
  l = max(l, region(lat, lon,  20.0, -101.0,  8.0,  9.0, w));
  l = max(l, region(lat, lon,  72.0,  -42.0,  9.0,  9.0, w)); // Greenland
  l = max(l, region(lat, lon,   9.0,   18.0, 17.0, 26.0, w)); // Africa
  l = max(l, region(lat, lon, -16.0,   25.0, 17.0, 13.0, w));
  l = max(l, region(lat, lon,  50.0,   15.0, 10.0, 17.0, w)); // Europe
  l = max(l, region(lat, lon,  53.0,   92.0, 15.0, 48.0, w)); // Asia
  l = max(l, region(lat, lon,  23.0,   79.0,  9.0, 10.0, w)); // India
  l = max(l, region(lat, lon,  31.0,  108.0, 13.0, 18.0, w)); // China
  l = max(l, region(lat, lon,  24.0,   45.0,  9.0, 12.0, w)); // Arabia
  l = max(l, region(lat, lon, -25.0,  134.0, 10.0, 16.0, w)); // Australia
  l = max(l, smoothstep(-64.0, -71.0, lat + w * 6.0));        // Antarctica
  return l;
}
void main(){
  float lat = (vUv.y - 0.5) * 180.0;
  float lon = vUv.x * 360.0 - 180.0;
  vec3 p = llDir(lat, lon);
  float w = fbm(p * 3.0 + uSeed, 5) * 0.5 + fbm(p * 12.0, 3) * 0.12;
  float land = smoothstep(0.42, 0.52, landField(lat, lon, w));
  float alat = abs(lat);
  float n = fbm(p * 7.0 + 4.0, 5);
  vec3 desert = vec3(0.44, 0.39, 0.3);
  vec3 green  = vec3(0.17, 0.21, 0.15);
  vec3 boreal = vec3(0.13, 0.16, 0.13);
  float dry = smoothstep(12.0, 22.0, alat) * (1.0 - smoothstep(32.0, 40.0, alat));
  vec3 lc = mix(green, desert, clamp(dry + n * 0.35, 0.0, 1.0));
  lc = mix(lc, boreal, smoothstep(48.0, 60.0, alat));
  lc = mix(lc, vec3(0.9, 0.92, 0.95), smoothstep(64.0, 70.0, alat + n * 6.0));
  float coast = smoothstep(0.3, 0.45, landField(lat, lon, w)) * (1.0 - land);
  vec3 oc = mix(vec3(0.03, 0.09, 0.18), vec3(0.06, 0.2, 0.34), coast * 0.8 + n * 0.1);
  gl_FragColor = vec4(mix(oc, lc, land), 1.0 - land);
}
`;

/* Earth aux: r = city lights, g = clouds. */
export const BAKE_EARTH_AUX = /* glsl */ `
${BAKE_COMMON}
float landField(float lat, float lon, float w){
  float l = 0.0;
  l = max(l, region(lat, lon, -10.0,  -60.0, 20.0, 17.0, w));
  l = max(l, region(lat, lon, -34.0,  -65.0, 15.0,  7.0, w));
  l = max(l, region(lat, lon,  47.0, -100.0, 17.0, 28.0, w));
  l = max(l, region(lat, lon,  20.0, -101.0,  8.0,  9.0, w));
  l = max(l, region(lat, lon,   9.0,   18.0, 17.0, 26.0, w));
  l = max(l, region(lat, lon, -16.0,   25.0, 17.0, 13.0, w));
  l = max(l, region(lat, lon,  50.0,   15.0, 10.0, 17.0, w));
  l = max(l, region(lat, lon,  53.0,   92.0, 15.0, 48.0, w) * 0.6);
  l = max(l, region(lat, lon,  23.0,   79.0,  9.0, 10.0, w));
  l = max(l, region(lat, lon,  31.0,  108.0, 13.0, 18.0, w));
  l = max(l, region(lat, lon,  24.0,   45.0,  9.0, 12.0, w));
  l = max(l, region(lat, lon, -25.0,  134.0, 10.0, 16.0, w) * 0.5);
  return l;
}
void main(){
  float lat = (vUv.y - 0.5) * 180.0;
  float lon = vUv.x * 360.0 - 180.0;
  vec3 p = llDir(lat, lon);
  float w = fbm(p * 3.0 + uSeed, 5) * 0.5 + fbm(p * 12.0, 3) * 0.12;
  float land = smoothstep(0.45, 0.6, landField(lat, lon, w));
  float coast = smoothstep(0.42, 0.5, landField(lat, lon, w)) * (1.0 - smoothstep(0.6, 0.75, landField(lat, lon, w)));
  float cluster = smoothstep(0.15, 0.6, fbm(p * 18.0 + 9.0, 4));
  float spark = pow(max(fbm(p * 140.0, 2) * 0.5 + 0.5, 0.0), 7.0) * 6.0;
  float lights = land * (cluster * 0.6 + coast * 0.8) * spark * (1.0 - smoothstep(55.0, 68.0, abs(lat)));

  vec3 q = p * 3.0 + vec3(fbm(p * 2.4 + 11.0, 5), fbm(p * 2.4 + 23.0, 5), fbm(p * 2.4 + 37.0, 5)) * 1.1;
  float c = fbm(q, 7);
  float streaks = fbm(vec3(p.x * 4.0, p.y * 14.0, p.z * 4.0) + q, 4);
  float bands = 0.55 + 0.25 * cos(radians(lat) * 6.0) + 0.2 * smoothstep(40.0, 60.0, abs(lat));
  float clouds = smoothstep(0.0, 0.5, c * 0.85 + streaks * 0.35 + bands * 0.35 - 0.1);
  clouds *= 0.55 + 0.45 * smoothstep(-0.1, 0.5, fbm(p * 22.0 + q, 4) + 0.3);
  gl_FragColor = vec4(clamp(lights, 0.0, 1.0), clouds, 0.0, 1.0);
}
`;

/* Moon: rgb = albedo, a = height. Maria at their selenographic positions. */
export const BAKE_MOON = /* glsl */ `
${BAKE_COMMON}
void main(){
  float lat = (vUv.y - 0.5) * 180.0;
  float lon = vUv.x * 360.0 - 180.0;
  vec3 p = llDir(lat, lon);
  float w = fbm(p * 3.0 + uSeed, 5) * 0.35;
  float m = 0.0;
  m = max(m, region(lat, lon,  33.0, -16.0, 14.0, 15.0, w)); // Imbrium
  m = max(m, region(lat, lon,  28.0,  17.0,  8.0,  9.0, w)); // Serenitatis
  m = max(m, region(lat, lon,   8.5,  31.0,  9.0, 11.0, w)); // Tranquillitatis
  m = max(m, region(lat, lon,  -8.0,  51.0,  7.0,  7.0, w)); // Fecunditatis
  m = max(m, region(lat, lon,  17.0,  59.0,  5.0,  5.0, w)); // Crisium
  m = max(m, region(lat, lon, -21.0, -17.0,  8.0,  9.0, w)); // Nubium
  m = max(m, region(lat, lon,  15.0, -57.0, 20.0, 14.0, w)); // Procellarum
  m = smoothstep(0.0, 1.0, m) * (0.75 + 0.25 * fbm(p * 8.0, 4));
  float h = 0.5 - m * 0.06;
  float cr = craterField(p, 8.0, 0.7, uSeed) * 0.06 + craterField(p, 22.0, 0.8, uSeed + 2.0) * 0.03
           + craterField(p, 60.0, 0.8, uSeed + 5.0) * 0.012;
  h += cr;
  float n = fbm(p * 6.0, 5);
  vec3 hi = vec3(0.6, 0.595, 0.59);
  vec3 lo = vec3(0.4, 0.4, 0.405);
  vec3 col = mix(hi, lo, clamp(m * 0.75, 0.0, 1.0));
  col *= 0.9 + n * 0.1 + cr * 0.6;
  float tycho = peak(p, -43.3, -11.2, 1.2) + peak(p, -43.3, -11.2, 9.0) * 0.12 * (0.5 + 0.5 * snoise(p * 40.0));
  col += vec3(0.25) * tycho;
  gl_FragColor = vec4(col, clamp(h, 0.0, 1.0));
}
`;

/* Sky haze: faint Milky Way band (sampled #0e1923 peak) on a direction sphere. */
export const BAKE_SKY = /* glsl */ `
${BAKE_COMMON}
uniform vec3 uBandNormal;
uniform vec3 uBandCentre;
void main(){
  float lat = (vUv.y - 0.5) * 180.0;
  float lon = vUv.x * 360.0 - 180.0;
  vec3 p = llDir(lat, lon);
  float b = dot(p, uBandNormal);
  float along = dot(p, uBandCentre);
  float local = smoothstep(0.82, 0.99, along);           // concentrate near the reference patch
  float band = exp(-(b * b) / (0.13 * 0.13)) * (0.25 + 0.75 * local);
  float core = exp(-(b * b) / (0.05 * 0.05));
  float detail = fbm(p * 4.0 + uSeed, 6) * 0.5 + 0.5;
  float lanes = smoothstep(0.05, 0.55, fbm(p * 10.0 - uSeed, 5));
  vec3 haze = vec3(0.055, 0.098, 0.137);
  vec3 col = haze * band * (0.45 + 0.75 * detail) * (1.0 - 0.55 * lanes * core);
  col += vec3(0.03, 0.022, 0.05) * band * smoothstep(0.2, 0.8, fbm(p * 2.0 + 40.0, 4) + 0.3);
  col += vec3(0.0, 0.013, 0.027) * (0.75 + 0.25 * fbm(p * 1.5, 3)); // #000408 floor
  gl_FragColor = vec4(col, 1.0);
}
`;

/* ---------- Planet surface ------------------------------------------------ */
export const PLANET_VERTEX = /* glsl */ `
varying vec2 vUv;
varying vec3 vPos;
void main(){
  vUv = uv;
  vPos = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

export const PLANET_FRAGMENT = /* glsl */ `
precision highp float;
uniform sampler2D uMap;
uniform sampler2D uAux;
uniform sampler2D uOverride;
uniform float uUseOverride;
uniform vec3 uSunObj;
uniform vec3 uCamObj;
uniform vec3 uRimColor;
uniform float uRimStrength;
uniform float uBump;
uniform vec2 uTexel;
uniform float uAmbient;
uniform float uExposure;
uniform float uCloudShift;
uniform vec3 uCityColor;
uniform sampler2D uNight;
uniform float uUseNight;
uniform float uFade;
varying vec2 vUv;
varying vec3 vPos;

// Exact equirectangular UV per pixel (matches THREE.SphereGeometry), so the poles don't
// pinch into the triangle fan. Filtering uses whichever of two seam-shifted UVs has the
// smaller screen derivative, so there is no seam line at the date line either.
vec2 gUv;
vec2 gDx;
vec2 gDy;
void sphereUv(vec3 n){
  gUv = vec2(fract(atan(n.z, -n.x) / 6.2831853), 1.0 - acos(clamp(n.y, -1.0, 1.0)) / 3.14159265);
  vec2 a = gUv;
  vec2 b = vec2(fract(gUv.x + 0.5), gUv.y);
  vec2 ax = dFdx(a), ay = dFdy(a), bx = dFdx(b), by = dFdy(b);
  bool useB = abs(bx.x) + abs(by.x) < abs(ax.x) + abs(ay.x);
  gDx = useB ? bx : ax;
  gDy = useB ? by : ay;
}
vec4 tex(sampler2D t, vec2 uv){ return textureGrad(t, uv, gDx, gDy); }

void main(){
  vec3 N = normalize(vPos);
  sphereUv(N);
  vec2 uv = gUv;
  vec4 base = tex(uMap, uv);
  vec3 albedo = mix(base.rgb, tex(uOverride, uv).rgb, uUseOverride);

  float hE = tex(uMap, uv + vec2(uTexel.x, 0.0)).a - tex(uMap, uv - vec2(uTexel.x, 0.0)).a;
  float hN = tex(uMap, uv + vec2(0.0, uTexel.y)).a - tex(uMap, uv - vec2(0.0, uTexel.y)).a;
  float phi = uv.x * 6.2831853;
  vec3 Te = normalize(vec3(sin(phi), 0.0, cos(phi)));
  vec3 Tn = normalize(cross(N, Te));
  float cl = max(cos((uv.y - 0.5) * 3.14159265), 0.35); // weaker bump near the poles
  vec3 Nb = normalize(N - uBump * (1.0 - uUseOverride) * (hE / cl * Te + hN * Tn));

  float ndlG = dot(N, uSunObj);
  float ndl = dot(Nb, uSunObj);
  float lit = max(ndl, 0.0) * smoothstep(-0.12, 0.12, ndlG);
  vec3 V = normalize(uCamObj - vPos);
  float NdV = max(dot(N, V), 0.0);
  float fres = pow(1.0 - NdV, 2.6);

#if defined(MARS)
  // Dusty regolith scatters broadly: flatten the Lambert falloff a touch.
  float diff = pow(lit, 0.82);
  vec3 col = albedo * diff * uExposure + albedo * uAmbient;
  // Warm terminator band + faint dusty limb (Mars' atmosphere is thin).
  float term = exp(-pow(ndlG / 0.12, 2.0)) * 0.12;
  col += vec3(0.9, 0.45, 0.25) * term * albedo;
  col += uRimColor * fres * smoothstep(-0.2, 0.5, ndlG) * uRimStrength;
#elif defined(EARTH)
  vec4 aux = tex(uAux, uv);
  float clouds = tex(uAux, uv + vec2(uCloudShift, 0.0)).g;
  // With the NASA day map, find the oceans in that map (blue-dominant, dark) so the sun
  // glint follows the real coastlines instead of the drawn fallback's continents.
  float realOcean = smoothstep(0.0, 0.05, albedo.b - max(albedo.r, albedo.g)) * (1.0 - smoothstep(0.35, 0.6, albedo.b));
  float ocean = mix(base.a, realOcean, uUseOverride);
  // soft daylight wrap and a little earthshine-free sky fill: no hard black terminator
  float wrapLit = clamp((ndl + 0.08) / 1.08, 0.0, 1.0) * smoothstep(-0.18, 0.1, ndlG);
  vec3 col = albedo * mix(lit, wrapLit, 0.5) * uExposure;
  vec3 H = normalize(uSunObj + V);
  col += vec3(1.0, 0.92, 0.8) * pow(max(dot(N, H), 0.0), 70.0) * ocean * 0.55 * step(0.0, ndlG) * (1.0 - clouds);
  // thinner drawn clouds so the real NASA day map shows through; night-side clouds stay dark
  col = mix(col, vec3(0.97, 0.98, 1.0) * (lit * 1.08 + 0.004), clouds * 0.6);
  float night = 1.0 - smoothstep(-0.14, 0.06, ndlG);
  vec3 nightTex = tex(uNight, uv).rgb;
  float city = mix(aux.r, smoothstep(0.03, 0.45, dot(nightTex, vec3(0.3, 0.5, 0.2))), uUseNight);
  col += uCityColor * city * night * (1.0 - clouds * 0.5) * 3.2;
  float sunRim = mix(0.1, 1.0, smoothstep(-0.3, 0.55, ndlG)); // no grey film over the night side
  col = mix(col, uRimColor * (0.35 + lit * 0.65), clamp(fres * sunRim * 0.85, 0.0, 1.0));
  col += uRimColor * pow(1.0 - NdV, 6.0) * sunRim * uRimStrength;
  col += albedo * uAmbient;
#else
  vec3 col = albedo * pow(lit, 0.9) * uExposure + albedo * uAmbient;
#endif

  gl_FragColor = vec4(col * uFade, 1.0);
}
`;

/* ---------- Atmosphere shell (BackSide, additive) ------------------------ */
export const ATMO_VERTEX = /* glsl */ `
varying vec3 vN;
varying vec3 vViewDir;
varying vec3 vWN;
void main(){
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vN = normalize(normalMatrix * normal);
  vViewDir = normalize(-mv.xyz);
  vWN = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * mv;
}
`;

export const ATMO_FRAGMENT = /* glsl */ `
precision highp float;
uniform vec3 uColor;
uniform vec3 uSunWorld;
uniform float uLimb;
uniform float uPower;
uniform float uIntensity;
varying vec3 vN;
varying vec3 vViewDir;
varying vec3 vWN;
void main(){
  float x = -dot(normalize(vN), normalize(vViewDir));
  float g = pow(smoothstep(0.0, uLimb, x), uPower);
  // Forward-scattered limb light survives onto the night side (reference: rim wraps the whole limb).
  float s = mix(0.5, 1.0, smoothstep(-0.35, 0.6, dot(normalize(vWN), uSunWorld)));
  gl_FragColor = vec4(uColor * g * s * uIntensity, 1.0);
}
`;

/* ---------- Sky sphere ---------------------------------------------------- */
export const SKY_VERTEX = /* glsl */ `
varying vec2 vUv;
void main(){
  vUv = uv;
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p.xyww;
}
`;

export const SKY_FRAGMENT = /* glsl */ `
precision highp float;
uniform sampler2D uMap;
uniform float uFade;
varying vec2 vUv;
void main(){ gl_FragColor = vec4(texture2D(uMap, vUv).rgb * uFade, 1.0); }
`;

/* ---------- Stars --------------------------------------------------------- */
export const STAR_VERTEX = /* glsl */ `
attribute float aSize;
attribute float aTw;
attribute vec3 aColor;
uniform float uTime;
uniform float uDpr;
varying vec3 vColor;
varying float vA;
void main(){
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p.xyww;
  float tw = 0.75 + 0.25 * sin(uTime * (0.6 + aTw * 2.2) + aTw * 40.0);
  vA = tw;
  vColor = aColor;
  gl_PointSize = aSize * uDpr;
}
`;

export const STAR_FRAGMENT = /* glsl */ `
precision highp float;
uniform float uFade;
varying vec3 vColor;
varying float vA;
void main(){
  float d = length(gl_PointCoord - 0.5);
  float a = smoothstep(0.5, 0.0, d);
  a *= a;
  gl_FragColor = vec4(vColor * a * vA * uFade, 1.0);
}
`;

/* ---------- Rocket: solid painted vehicle -------------------------------- */
// Painted metal lit by the scene's sun, with real self-shadowing: the boosters and the core
// stage cast soft shadows on each other (rays traced against their cylinders in object space),
// ambient occlusion where they meet, Fresnel reflections of the dark sky and blue earthshine,
// and the flame's warm light on the lower body.
// aPart: 0 core stage, 1 booster, 2 engine bell, 3 strut, 4 landing leg (no self-shadow).
export const ROCKET_VERTEX = /* glsl */ `
attribute float aPart;
varying vec3 vN;
varying vec3 vV;
varying vec3 vObj;
varying vec3 vObjN;
varying float vPart;
void main(){
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vN = normalize(normalMatrix * normal);
  vV = normalize(-mv.xyz);
  vObj = position;
  vObjN = normal;
  vPart = aPart;
  gl_Position = projectionMatrix * mv;
}
`;

export const ROCKET_FRAGMENT = /* glsl */ `
precision highp float;
uniform vec3 uSunView;
uniform vec3 uSunObj;
uniform float uFade;
uniform float uThrust;
uniform sampler2D uText;
uniform float uCoreR;
uniform float uBoostX;
uniform float uBoostR;
uniform vec3 uBounce; // light bounced off the nearest planet: blue near Earth, rust near Mars
varying vec3 vN;
varying vec3 vV;
varying vec3 vObj;
varying vec3 vObjN;
varying float vPart;

float seam(float y, float h, float w){ return 1.0 - smoothstep(0.0, w, abs(y - h)); }

// Soft shadow from a vertical cylinder (axis at x = cx, z = 0) on a point p lit along L.
float cylShadow(vec3 p, vec3 L, float cx, float R, float y0, float y1){
  vec2 o = p.xz - vec2(cx, 0.0);
  vec2 d = L.xz;
  float a = dot(d, d);
  if (a < 1e-6) return 0.0;
  float t = -dot(o, d) / a;
  if (t <= 0.0) return 0.0;
  float dist = length(o + d * t);
  float yy = p.y + L.y * t;
  float inY = smoothstep(y0 - 0.01, y0 + 0.01, yy) * (1.0 - smoothstep(y1 - 0.01, y1 + 0.01, yy));
  return (1.0 - smoothstep(R * 0.7, R * 1.25, dist)) * inY;
}

void main(){
  vec3 n = normalize(gl_FrontFacing ? vN : -vN);
  vec3 V = normalize(vV);
  vec3 p = vObj;
  float y = p.y;
  int part = int(vPart + 0.5);

  vec3 white = vec3(0.86, 0.855, 0.84);
  vec3 black = vec3(0.035, 0.038, 0.045);
  vec3 albedo = white;
  float rough = 0.42, metal = 0.0;
  float heat = 0.0;

  if (part == 0) {
    if (y < 0.075) { albedo = vec3(0.13, 0.13, 0.14); rough = 0.55; metal = 0.6; }
    if (y > 0.70 && y < 0.765) { albedo = black; rough = 0.3; }
    // stringers: fine vertical ribs on the interstage and the engine section
    float ang0 = atan(p.z, p.x);
    if ((y > 0.70 && y < 0.765) || y < 0.075) albedo *= 0.88 + 0.12 * smoothstep(0.2, 0.9, abs(sin(ang0 * 36.0)));
    albedo *= 1.0 - 0.18 * (seam(y, 0.3, 0.0022) + seam(y, 0.52, 0.0022) + seam(y, 0.86, 0.002));
    albedo = mix(albedo, vec3(1.0, 0.55, 0.25), seam(y, 0.775, 0.003) * 0.9);
    float ang = ang0 - 1.5707963;
    ang = atan(sin(ang), cos(ang));
    float s = ang * uCoreR;
    if (y > 0.31 && y < 0.66 && abs(s) < 0.024) {
      vec2 uv = vec2((y - 0.31) / 0.35, 0.5 + s / 0.048);
      albedo = mix(albedo, black, texture2D(uText, uv).a);
    }
    // soot from the boosters' exhaust on the lower core
    albedo *= 1.0 - 0.35 * smoothstep(0.2, 0.06, y);
  } else if (part == 1) {
    if (y < 0.2) { albedo = black; rough = 0.35; }
    albedo *= 1.0 - 0.16 * (seam(y, 0.33, 0.0022) + seam(y, 0.46, 0.0022));
    albedo *= 1.0 - 0.3 * smoothstep(0.12, 0.05, y);
  } else if (part == 2) {
    heat = smoothstep(0.045, 0.0, y);
    albedo = vec3(0.32, 0.24, 0.18);
    rough = 0.32; metal = 1.0;
  } else {
    albedo = vec3(0.3);
    metal = 0.5;
  }

  /* ---- shadows and occlusion between core and boosters ---- */
  vec3 Lo = normalize(uSunObj);
  float sh = 0.0;
  float ao = 1.0;
  if (part == 0 || part == 3) {
    sh = max(cylShadow(p, Lo, uBoostX, uBoostR, 0.05, 0.6), cylShadow(p, Lo, -uBoostX, uBoostR, 0.05, 0.6));
    // the strip of core facing a booster sits in its shade
    float face = max(abs(normalize(vObjN.xz).x), 0.0);
    ao -= 0.45 * smoothstep(0.75, 1.0, face) * step(0.05, y) * (1.0 - step(0.6, y));
  } else if (part == 1) {
    float side = sign(p.x);
    sh = max(cylShadow(p, Lo, 0.0, uCoreR, 0.045, 0.86), cylShadow(p, Lo, -side * uBoostX, uBoostR, 0.05, 0.6));
    float inward = max(-side * vObjN.x, 0.0);
    ao -= 0.45 * smoothstep(0.6, 1.0, inward);
  }
  sh = clamp(sh, 0.0, 1.0);

  /* ---- light ---- */
  float ndl = dot(n, uSunView);
  float wrap = max((ndl + 0.08) / 1.08, 0.0);
  float lit = wrap * (1.0 - 0.9 * sh);

  vec3 H = normalize(uSunView + V);
  float a2 = rough * rough;
  float ndh = max(dot(n, H), 0.0);
  float dd = ndh * ndh * (a2 * a2 - 1.0) + 1.0;
  float D = (a2 * a2) / (3.14159 * dd * dd);
  vec3 F0 = mix(vec3(0.04), albedo, metal);
  float vdh = max(dot(V, H), 0.0);
  vec3 F = F0 + (1.0 - F0) * pow(1.0 - vdh, 5.0);
  vec3 spec = D * F * 0.25 * step(0.0, ndl) * (1.0 - sh);

  // earthshine from below-left, a faint cold sky above, the dark of space everywhere else
  vec3 R = reflect(-V, n);
  vec3 sky = mix(vec3(0.012, 0.016, 0.026), vec3(0.10, 0.17, 0.30), smoothstep(0.2, -0.8, R.y) * smoothstep(0.4, -0.6, R.x));
  float fres = pow(1.0 - max(dot(n, V), 0.0), 5.0);
  vec3 envSpec = sky * mix(0.04 + 0.96 * fres, 1.0, metal) * (1.0 - rough * 0.6);
  vec3 bounce = uBounce * max(-n.y * 0.5 + 0.5, 0.0) * max(0.0, 0.6 - 0.4 * n.x);

  vec3 diffuse = albedo * (1.0 - metal);
  vec3 col = diffuse * (lit * vec3(1.0, 0.97, 0.92) * 1.25 + bounce * 1.6 + 0.035) * ao
           + spec * vec3(1.0, 0.97, 0.92) * 2.2 * ao
           + envSpec * ao;

  // the flame lights the bottom of the vehicle
  col += albedo * vec3(1.0, 0.55, 0.22) * uThrust * 0.75 * smoothstep(0.26, 0.0, y);
  if (part == 2) col += vec3(1.0, 0.5, 0.16) * heat * uThrust * (gl_FrontFacing ? 0.7 : 1.6);
  if (!gl_FrontFacing && part != 2) col *= 0.2;

  // gentle filmic curve so highlights roll off like a photograph
  col = col / (col + vec3(0.62)) * 1.62;
  gl_FragColor = vec4(col * uFade, uFade);
}
`;

/* ---------- Engine flame (a mesh per nozzle) ----------------------------- */
// An open cone hanging from each nozzle. The fragment shader draws turbulent fire with scrolling
// noise: white-hot and slightly blue at the throat, yellow then orange then deep red down the
// plume, brightest where the cone is seen face-on (the thick middle), fading at the tail.
export const FLAME_VERTEX = /* glsl */ `
uniform float uTime;
uniform float uThrust;
uniform float uLen;
varying vec3 vN;
varying vec3 vV;
varying float vT;
varying float vAng;
void main(){
  // t: 0 at the nozzle, 1 at the tail (the cone runs from y = 0 down to y = -1)
  float t = clamp(-position.y, 0.0, 1.0);
  vec3 pos = position;
  // the plume breathes and wavers
  float w = sin(uTime * 23.0 + t * 9.0) * 0.06 + sin(uTime * 37.0 + t * 15.0) * 0.04;
  pos.xz *= 1.0 + w * t;
  pos.y *= uLen * (0.75 + 0.25 * uThrust);
  vec4 mv = modelViewMatrix * vec4(pos, 1.0);
  vN = normalize(normalMatrix * normal);
  vV = normalize(-mv.xyz);
  vT = t;
  vAng = atan(position.z, position.x);
  gl_Position = projectionMatrix * mv;
}
`;

export const FLAME_FRAGMENT = /* glsl */ `
precision highp float;
uniform float uTime;
uniform float uThrust;
uniform float uHot;   // 1 for the inner core, 0 for the outer flame
uniform float uSeed;
varying vec3 vN;
varying vec3 vV;
varying float vT;
varying float vAng;

float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
}
float fbm(vec2 p){
  float v = 0.0, a = 0.5;
  for (int k = 0; k < 4; k++) { v += a * noise(p); p *= 2.03; a *= 0.5; }
  return v;
}

void main(){
  float t = vT;
  // facing ratio: the middle of the cone is thick fire, the silhouette edge is thin
  float face = abs(dot(normalize(vN), normalize(vV)));
  float body = pow(face, mix(1.6, 0.9, uHot));

  vec2 q = vec2(vAng * 2.2 + uSeed, t * 5.0 - uTime * 7.0);
  float n = fbm(q + fbm(q * 1.7 + uTime * 0.6));
  float turb = mix(0.55, 1.35, n);

  // colour down the plume
  vec3 c0 = vec3(0.85, 0.92, 1.0);   // white-blue at the throat
  vec3 c1 = vec3(1.0, 0.93, 0.7);    // white-yellow
  vec3 c2 = vec3(1.0, 0.62, 0.2);    // orange
  vec3 c3 = vec3(0.75, 0.2, 0.05);   // deep red
  vec3 col = mix(c0, c1, smoothstep(0.0, 0.08, t));
  col = mix(col, c2, smoothstep(0.08, 0.4, t + (n - 0.5) * 0.2));
  col = mix(col, c3, smoothstep(0.4, 0.85, t + (n - 0.5) * 0.25));

  float fadeLen = mix(1.0 - smoothstep(0.35, 1.0, t), 1.0 - smoothstep(0.05, 0.45, t), uHot);
  float a = body * fadeLen * turb * uThrust;
  a *= mix(0.9, 1.6, uHot);
  // ragged tail: the noise eats the end of the flame
  a *= smoothstep(0.0, 0.25, n + 0.55 - t * 0.6);
  gl_FragColor = vec4(col * a, 1.0);
}
`;

/* ---------- Smoke behind the flame (soft billowing puffs) ----------------- */
export const SMOKE_VERTEX = /* glsl */ `
attribute float aNozzle;
attribute vec4 aSeed;
uniform float uTime;
uniform float uThrust;
uniform float uLen;
uniform float uPx;
uniform vec3 uNozzle[3];
uniform float uNozzleR[3];
varying float vAge;
varying float vA;
varying vec4 vSeed;
void main(){
  int i = int(aNozzle + 0.5);
  vec3 origin = uNozzle[i];
  float r0 = uNozzleR[i];
  float age = fract(uTime * (0.32 + aSeed.x * 0.22) + aSeed.w);
  float len = uLen * (i == 0 ? 1.0 : 0.85) * (0.8 + 0.4 * aSeed.y);
  vec2 dir = normalize(aSeed.yz * 2.0 - 1.0 + vec2(1e-3));
  float spread = r0 * (1.2 + pow(age, 0.8) * 9.0) * sqrt(aSeed.z);
  float start = 0.22; // smoke starts where the flame thins out
  vec3 pos = origin + vec3(dir.x * spread, -(start + age) * len * 0.75, dir.y * spread);
  // billowing: each puff curls outward and rolls as it slows down
  float t = uTime * 0.5 + aSeed.w * 40.0;
  pos.xz += vec2(sin(t + age * 5.0), cos(t * 0.9 + age * 4.0)) * 0.045 * age * age;
  pos.y += sin(t * 1.3 + aSeed.x * 20.0) * 0.02 * age;
  vec4 mv = modelViewMatrix * vec4(pos, 1.0);
  vAge = age;
  vSeed = aSeed;
  vA = smoothstep(0.0, 0.12, age) * (1.0 - smoothstep(0.55, 1.0, age)) * uThrust;
  float size = (0.05 + age * 0.3) * (0.6 + 0.8 * aSeed.x);
  gl_PointSize = max(2.0, size * uPx / -mv.z);
  gl_Position = projectionMatrix * mv;
}
`;

export const SMOKE_FRAGMENT = /* glsl */ `
precision highp float;
uniform float uTime;
varying float vAge;
varying float vA;
varying vec4 vSeed;
float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
}
void main(){
  vec2 uv = gl_PointCoord - 0.5;
  float d = length(uv) * 2.0;
  // a lumpy cloud, not a dot: soft falloff broken up by noise that turns slowly
  float ang = vSeed.w * 6.283 + uTime * 0.2;
  vec2 r = mat2(cos(ang), -sin(ang), sin(ang), cos(ang)) * uv * 3.0 + vSeed.xy * 10.0;
  // four octaves: big lumps with fine wisps at their edges
  float n = noise(r) * 0.5 + noise(r * 2.03) * 0.25 + noise(r * 4.1) * 0.15 + noise(r * 8.3) * 0.1;
  float a = smoothstep(1.0, 0.1, d + (n - 0.5) * 0.9);
  a *= smoothstep(0.15, 0.55, n + 0.25 * (1.0 - d)); // ragged, broken-up edges
  // fake volume: puffs are lit from the flame above and the sun upper-right, darker underneath
  float shade = 0.62 + 0.5 * clamp(-uv.y * 1.4 + uv.x * 0.6 + 0.5, 0.0, 1.0);
  vec3 hot = vec3(1.0, 0.7, 0.42);
  vec3 warm = vec3(0.86, 0.72, 0.6);
  vec3 grey = vec3(0.56, 0.56, 0.6);
  vec3 c = mix(hot, warm, smoothstep(0.0, 0.18, vAge));
  c = mix(c, grey, smoothstep(0.15, 0.6, vAge)) * shade * (0.8 + 0.3 * n);
  gl_FragColor = vec4(c, a * vA * 0.38);
}
`;

export const GLOW_VERTEX = /* glsl */ `
attribute float aSize;
uniform float uPx;
uniform float uThrust;
uniform float uTime;
varying float vA;
void main(){
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  float flick = 0.88 + 0.12 * sin(uTime * 37.0 + position.x * 90.0) * sin(uTime * 23.0);
  vA = uThrust * flick;
  gl_PointSize = aSize * uPx / -mv.z * (0.7 + 0.3 * uThrust) * flick;
  gl_Position = projectionMatrix * mv;
}
`;

export const GLOW_FRAGMENT = /* glsl */ `
precision highp float;
varying float vA;
void main(){
  float d = length(gl_PointCoord - 0.5) * 2.0;
  float a = exp(-d * d * 5.0);
  vec3 c = mix(vec3(1.0, 0.698, 0.357), vec3(1.0, 0.97, 0.9), exp(-d * d * 30.0));
  gl_FragColor = vec4(c * a * vA * 0.9, 1.0);
}
`;

/* ---------- Orbital hairlines (progress + dash in one pass) -------------- */
export const ORBIT_VERTEX = /* glsl */ `
attribute float aT;
varying float vT;
void main(){
  vT = aT;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

export const ORBIT_FRAGMENT = /* glsl */ `
precision highp float;
uniform vec3 uDone;
uniform vec3 uTodo;
uniform float uProgress;
uniform float uDashes;
uniform float uAlphaDone;
uniform float uAlphaTodo;
uniform float uFade;
varying float vT;
void main(){
  float done = step(vT, uProgress);
  float dash = step(0.5, fract(vT * uDashes));
  float a = mix(uAlphaTodo * dash, uAlphaDone, done);
  a *= smoothstep(0.0, 0.03, vT) * (1.0 - smoothstep(0.97, 1.0, vT));
  vec3 c = mix(uTodo, uDone, done);
  gl_FragColor = vec4(c * a * uFade, 1.0);
}
`;
