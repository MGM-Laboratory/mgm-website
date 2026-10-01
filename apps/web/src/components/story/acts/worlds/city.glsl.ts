import { GLSL_COMMON } from "./common";

/**
 * Signal City's shaders (World 03). Linear colours in, `linearToOutputTexel`
 * out, `toneMapped: false`, the freeze grade in every one.
 *
 * The towers are one instanced draw of a unit box (base at y = 0). Their
 * windows are a procedural grid (2.2 x 3.2 m cells, a hash per window), so
 * the city has thousands of lit rooms for the price of a few hundred boxes.
 * Far away the grid melts into its own average (no shimmer).
 *
 * "Every window is somebody's idea": the vertex shader finds when she passed
 * each tower (the closest of the course samples she has flown by, `uPath`),
 * and from that moment the windows near her height light up and the light
 * spreads up and down the facade. It is a pure function of the course time,
 * so scrolling back puts the lights out again. The cursor wakes windows
 * under it; a tap sends a signal ring through the city.
 */

export const PATH_SAMPLES = 48;

export const TOWER_VERTEX = /* glsl */ `
attribute vec4 aTower;
uniform vec4 uPath[${PATH_SAMPLES}];
uniform int uPathCount;
uniform float uT;
varying vec3 vLocal;
varying vec3 vSize;
varying vec3 vNormalL;
varying vec3 vWorld;
varying vec4 vTower;
varying vec3 vPass;
void main() {
  vec3 size = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));
  vec4 world = modelMatrix * instanceMatrix * vec4(position, 1.0);
  vLocal = position * size;
  vSize = size;
  vNormalL = normal;
  vWorld = world.xyz;
  vTower = aTower;
  // When did she pass this tower, and how close, and at what height?
  vec3 c = (instanceMatrix * vec4(0.0, 0.5, 0.0, 1.0)).xyz;
  float half0 = 0.5 * max(size.x, size.z);
  float best = 1e6;
  float tPass = -1e3;
  float yPass = 0.0;
  for (int k = 0; k < ${PATH_SAMPLES}; k++) {
    if (k >= uPathCount) break;
    vec4 q = uPath[k];
    if (q.w > uT) break;
    float d = max(0.0, length(q.xz - c.xz) - half0);
    if (d < best) { best = d; tPass = q.w; yPass = q.y; }
  }
  vPass = vec3(smoothstep(30.0, 6.0, best), yPass, uT - tPass);
  gl_Position = projectionMatrix * viewMatrix * world;
}
`;

export const TOWER_FRAGMENT = /* glsl */ `
uniform float uTime;
uniform float uFreeze;
uniform vec3 uCamPos;
uniform vec3 uFog;
uniform float uFogDensity;
uniform vec3 uWarm;
uniform vec3 uCool;
uniform vec3 uRed;
uniform vec3 uFrame;
uniform vec3 uSkyLow;
uniform vec3 uPointer;
uniform vec4 uTap;
uniform float uTapSpeed;
varying vec3 vLocal;
varying vec3 vSize;
varying vec3 vNormalL;
varying vec3 vWorld;
varying vec4 vTower;
varying vec3 vPass;
${GLSL_COMMON}
void main() {
  vec3 n = normalize(vNormalL);
  float seed = vTower.x;
  vec3 view = vWorld - uCamPos;
  float dist = length(view);
  vec3 col;
  if (n.y > 0.5) {
    // The roof: dark, with a red beacon blinking on the tall ones.
    vec2 q = vLocal.xz;
    col = uFrame * 0.7;
    vec2 corner = (vSize.xz * 0.5 - 1.2) * vec2(seed > 0.5 ? 1.0 : -1.0, 1.0);
    float beacon = exp(-dot(q - corner, q - corner) * 2.5) * step(55.0, vSize.y);
    float blink = step(0.55, fract(uTime * 0.6 + seed * 7.0));
    col += uRed * beacon * blink * 4.0;
    // A light trim round some roofs (a strip of LEDs), so the city glitters from above.
    vec2 halfXZ = vSize.xz * 0.5;
    float inset = min(halfXZ.x - abs(q.x), halfXZ.y - abs(q.y));
    float trim = (1.0 - smoothstep(0.04, 0.16, inset)) * step(0.55, fract(seed * 3.3));
    vec3 trimTint = fract(seed * 7.7) > 0.66 ? uRed : fract(seed * 7.7) > 0.33 ? uCool : vec3(1.0, 0.92, 0.75);
    float run = 0.75 + 0.25 * sin((q.x + q.y) * 0.8 - uTime * 3.0 + seed * 20.0);
    col += trimTint * trim * run * 1.3;
  } else {
    // A facade: across (u) and up (v), metres; the face's half width for its edges.
    bool xFace = abs(n.x) > 0.5;
    float across = xFace ? vLocal.z * sign(n.x) : -vLocal.x * sign(n.z);
    float halfW = xFace ? 0.5 * vSize.z : 0.5 * vSize.x;
    float face = xFace ? (n.x > 0.0 ? 1.0 : 2.0) : (n.z > 0.0 ? 3.0 : 4.0);
    vec2 cell = vec2(2.2, 3.2);
    vec2 g = vec2(across, vLocal.y) / cell;
    vec2 id = floor(g);
    vec2 fr = fract(g);
    vec2 fw = fwidth(g);
    // A window: a soft rectangle inside its cell, filtered by its pixel footprint.
    vec2 lo = smoothstep(vec2(0.2, 0.26) - fw, vec2(0.2, 0.26) + fw, fr);
    vec2 hi = 1.0 - smoothstep(vec2(0.8, 0.74) - fw, vec2(0.8, 0.74) + fw, fr);
    float glass = lo.x * lo.y * hi.x * hi.y;
    vec3 h = hash33(vec3(id, face * 13.0 + seed * 997.0));
    // The base city: a fifth to a third of the rooms lit, some toggling now and then.
    float share = 0.18 + 0.16 * vTower.y;
    float toggle = step(0.975, hash21(id + floor(uTime * 0.25 + h.z * 8.0) + seed * 31.0));
    float lit = abs(step(1.0 - share, h.x) - toggle);
    // Her wake: from the moment she passed, rooms near her height switch on one by one, spreading.
    float since = vPass.z - h.z * 0.18;
    float band = 3.0 + max(since, 0.0) * 40.0;
    float wake = vPass.x * step(0.0, since) * (1.0 - smoothstep(band - 5.0, band, abs(vWorld.y - vPass.y)));
    float woke = step(1.0 - wake * 0.85, h.y);
    lit = max(lit, woke);
    // The signal: a band of light climbing some towers, on the clock.
    float climb = fract(uTime * (0.05 + 0.05 * vTower.z) + seed * 5.0) * vSize.y * 1.3;
    float signal = step(0.62, vTower.z) * exp(-pow((vLocal.y - climb) * 0.35, 2.0));
    // The cursor wakes the rooms under it; a tap's ring runs through the city.
    float pd = length(gl_FragCoord.xy - uPointer.xy);
    float hover = uPointer.z * (1.0 - smoothstep(30.0, 150.0, pd));
    lit = max(lit, step(1.0 - hover, h.z));
    float ring = uTap.w >= 0.0 ? exp(-pow(length(vWorld - uTap.xyz) - uTap.w * uTapSpeed, 2.0) * 0.02) * exp(-uTap.w * 0.7) : 0.0;
    // Inside a lit room: a ceiling light (brighter at the top), sometimes a curtain half drawn.
    vec3 tint = h.y > 0.93 ? uCool : h.y > 0.89 ? uRed : mix(uWarm, vec3(1.0, 0.93, 0.8), h.z * 0.7);
    tint = mix(tint, vec3(1.0, 0.96, 0.9), woke * 0.45);
    float ceiling = 0.55 + 0.45 * smoothstep(0.26, 0.74, fr.y);
    float curtain = step(0.6, fract(h.x * 7.1)) * step(fract(h.z * 3.7) * 0.6 + 0.2, (fr.x - 0.2) / 0.6);
    vec3 room = tint * lit * ceiling * (1.0 - 0.65 * curtain) * (0.75 + 0.9 * woke + 1.0 * hover);
    room += uWarm * signal * 1.6 * glass + mix(uCool, vec3(1.0), 0.5) * ring * 2.4;
    vec3 dark = uFrame * 1.4 + uSkyLow * 0.04;
    vec3 frame = uFrame * (0.5 + 0.5 * smoothstep(0.0, vSize.y, vLocal.y));
    vec3 litWindow = mix(dark, room, step(0.001, lit));
    // Far away, the grid becomes its own average.
    float far = smoothstep(0.35, 0.9, max(fw.x, fw.y));
    vec3 avg = frame + uWarm * share * 0.3 * 0.7 + uWarm * signal * 0.3 + mix(uCool, vec3(1.0), 0.5) * ring * 0.6;
    col = mix(mix(frame, litWindow, glass), avg, far);
    // A cool rim of sky light down the corners of the building.
    float edge = smoothstep(halfW - 0.5, halfW, abs(across));
    col += uSkyLow * edge * 0.12;
  }
  col = fogMix(col, uFog, dist, uFogDensity);
  col = freezeGrade(col, uFreeze);
  gl_FragColor = linearToOutputTexel(vec4(col, 1.0));
}
`;

/** The streets: dark asphalt, glowing lane lines on the city grid, pools of light, the sky in the wet. */
export const GROUND_VERTEX = /* glsl */ `
varying vec3 vWorld;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}
`;

export const GROUND_FRAGMENT = /* glsl */ `
uniform float uTime;
uniform float uFreeze;
uniform vec3 uCamPos;
uniform vec3 uFog;
uniform float uFogDensity;
uniform vec3 uWarm;
uniform vec3 uCool;
uniform vec3 uRed;
uniform vec3 uFrame;
uniform float uGrid;
uniform vec2 uGridOffset;
varying vec3 vWorld;
${GLSL_COMMON}
void main() {
  vec2 p = (vWorld.xz - uGridOffset) / uGrid;
  vec2 f = abs(fract(p) - 0.5) * uGrid;
  vec2 fw = fwidth(vWorld.xz);
  float lane = (1.0 - smoothstep(0.08, 0.08 + fw.x * 1.5, abs(f.x - 0.9))) + (1.0 - smoothstep(0.08, 0.08 + fw.y * 1.5, abs(f.y - 0.9)));
  float dash = step(0.5, fract((vWorld.x + vWorld.z) * 0.25));
  float pools = exp(-dot(f - 0.9, f - 0.9) * 0.08);
  vec3 col = uFrame * 0.45;
  col += uWarm * pools * 0.16;
  col += mix(uCool, uRed, step(0.5, fract(floor(p.x) * 0.5))) * lane * dash * 0.22 * (1.0 - smoothstep(0.0, 1.0, max(fw.x, fw.y) * 2.0));
  float dist = length(vWorld - uCamPos);
  col = fogMix(col, uFog, dist, uFogDensity);
  col = freezeGrade(col, uFreeze);
  gl_FragColor = linearToOutputTexel(vec4(col, 1.0));
}
`;

/**
 * Traffic: short streaks of light running along the street grid at street
 * level and in the sky lanes above, white and blue one way, red the other.
 * One instanced quad each, camera facing about its lane, on the clock.
 */
export const TRAFFIC_VERTEX = /* glsl */ `
attribute vec2 aCorner;
attribute vec4 aLane;
attribute vec4 aCar;
uniform float uTime;
uniform vec3 uCamPos;
uniform vec2 uSpan;
varying vec2 vQuad;
varying vec3 vColour;
varying float vFade;
uniform vec3 uWarm;
uniform vec3 uCool;
uniform vec3 uRed;
void main() {
  // aLane: x axis (0 along x, 1 along z), y offset across, z height, w direction (+1 or -1).
  // aCar: x phase, y speed m/s, z length m, w colour pick.
  vec3 axis = aLane.x < 0.5 ? vec3(1.0, 0.0, 0.0) : vec3(0.0, 0.0, 1.0);
  vec3 across = aLane.x < 0.5 ? vec3(0.0, 0.0, 1.0) : vec3(1.0, 0.0, 0.0);
  float spanLo = aLane.x < 0.5 ? uSpan.x : uSpan.y;
  float len = 520.0;
  float s = fract(aCar.x + uTime * aCar.y * aLane.w / len) * len - len * 0.5;
  vec3 centre = across * aLane.y + vec3(0.0, aLane.z, 0.0) + axis * (s + spanLo);
  vec3 toCam = normalize(uCamPos - centre);
  vec3 side = normalize(cross(axis, toCam) + 1e-5);
  float width = 0.22 + 0.2 * step(10.0, aLane.z);
  vec3 p = centre + axis * aCorner.x * aCar.z + side * aCorner.y * width;
  vQuad = aCorner;
  vColour = aLane.w > 0.0 ? (aCar.w > 0.5 ? uCool : vec3(1.0, 0.95, 0.88)) : uRed;
  vFade = 1.0 - smoothstep(len * 0.38, len * 0.5, abs(s));
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
}
`;

export const TRAFFIC_FRAGMENT = /* glsl */ `
uniform float uFreeze;
uniform vec3 uCamPos;
uniform vec3 uFog;
uniform float uFogDensity;
varying vec2 vQuad;
varying vec3 vColour;
varying float vFade;
${GLSL_COMMON}
void main() {
  // A streak: bright at its head, fading along its tail, soft across.
  float along = vQuad.x + 0.5;
  float a = pow(along, 2.2) * (1.0 - smoothstep(0.3, 1.0, abs(vQuad.y) * 2.0)) * vFade;
  vec3 col = freezeGrade(vColour, uFreeze) * a * 2.6;
  gl_FragColor = vec4(linearToOutputTexel(vec4(col, 1.0)).rgb, 0.0);
}
`;

/**
 * Light ribbons: long ribbons of light winding over and between the towers
 * (the story's lines, in neon), dashes flowing along them on the treadmill.
 * One merged strip geometry; `aAlong` is metres along the ribbon.
 */
export const RIBBON_VERTEX = /* glsl */ `
attribute float aAlong;
attribute float aSide;
attribute vec3 aTangent;
attribute vec3 aColour;
uniform vec3 uCamPos;
uniform float uWidth;
varying float vAlong;
varying float vSide;
varying vec3 vColour;
varying float vDist;
void main() {
  vec3 toCam = normalize(uCamPos - position);
  vec3 side = normalize(cross(aTangent, toCam) + 1e-5);
  vec3 p = position + side * aSide * uWidth;
  vAlong = aAlong;
  vSide = aSide;
  vColour = aColour;
  vDist = length(uCamPos - p);
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
}
`;

export const RIBBON_FRAGMENT = /* glsl */ `
uniform float uFlow;
uniform float uFreeze;
uniform vec3 uFog;
uniform float uFogDensity;
varying float vAlong;
varying float vSide;
varying vec3 vColour;
varying float vDist;
${GLSL_COMMON}
void main() {
  float core = exp(-vSide * vSide * 9.0);
  float dash = smoothstep(0.0, 0.25, fract(vAlong * 0.018 - uFlow * 0.35)) * (1.0 - smoothstep(0.55, 1.0, fract(vAlong * 0.018 - uFlow * 0.35)));
  float a = core * (0.35 + 0.65 * dash);
  float fog = exp(-vDist * uFogDensity * 0.7);
  vec3 col = freezeGrade(vColour, uFreeze) * a * 1.5 * fog;
  gl_FragColor = vec4(linearToOutputTexel(vec4(col, 1.0)).rgb, 0.0);
}
`;

/** Searchlights sweeping the sky from the rooftops: soft additive beams, on the clock. */
export const BEAM_VERTEX = /* glsl */ `
attribute vec2 aCorner;
attribute vec4 aBeam;
uniform float uTime;
uniform vec3 uCamPos;
varying vec2 vQuad;
varying float vTone;
void main() {
  // aBeam: xyz base, w seed.
  float t = uTime * (0.12 + 0.1 * fract(aBeam.w * 7.0)) + aBeam.w * 20.0;
  vec3 dir = normalize(vec3(sin(t) * 0.55, 1.0, cos(t * 0.7) * 0.45));
  vec3 base = aBeam.xyz;
  vec3 mid = base + dir * 160.0;
  vec3 toCam = normalize(uCamPos - mid);
  vec3 side = normalize(cross(dir, toCam) + 1e-5);
  float along = aCorner.x + 0.5;
  vec3 p = base + dir * along * 320.0 + side * aCorner.y * (1.5 + along * 26.0);
  vQuad = vec2(along, aCorner.y);
  vTone = aBeam.w;
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
}
`;

export const BEAM_FRAGMENT = /* glsl */ `
uniform float uFreeze;
uniform vec3 uCool;
uniform vec3 uWarm;
varying vec2 vQuad;
varying float vTone;
${GLSL_COMMON}
void main() {
  float a = exp(-vQuad.y * vQuad.y * 7.0) * pow(1.0 - vQuad.x, 1.6) * smoothstep(0.0, 0.04, vQuad.x) * 0.09;
  vec3 tint = vTone > 0.5 ? uCool : mix(uWarm, vec3(1.0), 0.5);
  vec3 col = freezeGrade(tint, uFreeze) * a;
  gl_FragColor = vec4(linearToOutputTexel(vec4(col, 1.0)).rgb, 0.0);
}
`;

/** The night: ink overhead, deep navy at the horizon with the city's glow in it, a few stars. */
export const CITY_SKY = /* glsl */ `
uniform vec3 uZenith;
uniform vec3 uHorizon;
uniform vec3 uGlow;
uniform vec3 uGlowRed;
uniform float uFreeze;
uniform float uTime;
${GLSL_COMMON}
uniform vec3 uFarFog;
uniform vec3 uFarWarm;
vec3 skyColour(vec3 d) {
  float y = d.y;
  vec3 col = mix(uHorizon, uZenith, smoothstep(-0.02, 0.55, y));
  float glow = exp(-max(y, 0.0) * 9.0);
  float az = atan(d.x, -d.z);
  col += mix(uGlow, uGlowRed, 0.5 + 0.5 * sin(az * 1.3 + 0.4)) * glow * 0.35;
  // A few stars above the haze.
  vec2 g = vec2(az * 60.0, y * 60.0);
  vec2 id = floor(g);
  vec3 h = hash33(vec3(id, 7.0));
  float star = step(0.985, h.z) * exp(-dot(fract(g) - h.xy, fract(g) - h.xy) * 90.0) * smoothstep(0.12, 0.4, y);
  col += vec3(0.8, 0.85, 1.0) * star * (0.6 + 0.4 * sin(uTime * 2.0 + h.x * 30.0));
  // Beyond the towers the city goes on: a carpet of lights on the ground below the horizon...
  if (y < 0.0) {
    float t = max(uCamPos.y, 1.0) / max(-y, 1e-3);
    vec2 xz = uCamPos.xz + d.xz * t;
    vec2 cg = xz / 9.0;
    vec3 ch = hash33(vec3(floor(cg), 3.0));
    float dotLight = step(0.8, ch.z) * exp(-dot(fract(cg) - ch.xy, fract(cg) - ch.xy) * 40.0);
    float haze = 1.0 - exp(-t * 0.0022);
    vec3 ground = uFarFog * 0.7 + uFarWarm * dotLight * 0.9 * (1.0 - haze);
    col = mix(ground, uFarFog, clamp(haze * 1.1, 0.0, 1.0));
  }
  // ...and a skyline of far towers along it, their windows a few warm dots.
  float k = floor(az * 150.0);
  float tall = 0.004 + 0.034 * pow(hash11(k * 1.7 + 11.0), 2.2) * (0.6 + 0.4 * sin(az * 3.1 + 1.0));
  if (y > -0.02 && y < tall) {
    vec2 wg = vec2(az * 1500.0, y * 1500.0);
    vec3 wh = hash33(vec3(floor(wg), 5.0));
    float win = step(0.84, wh.z) * step(0.3, fract(wg.x)) * step(0.3, fract(wg.y));
    vec3 tower = mix(uFarFog * 1.05, uFarFog * 0.75, smoothstep(0.0, 0.03, y)) + uFarWarm * win * 0.55;
    col = mix(col, tower, smoothstep(-0.02, -0.005, y) * (1.0 - smoothstep(tall - 0.0015, tall, y)) + step(y, -0.005));
  }
  return freezeGrade(col, uFreeze);
}
`;

/** Sparks off her hand along the wall: a pure function of index, her hand and the clock. */
export const SPARK_VERTEX = /* glsl */ `
attribute float aSeed;
uniform float uTime;
uniform vec3 uHand;
uniform vec3 uBack;
uniform vec3 uOff;
uniform float uAmount;
uniform float uScale;
varying float vAlpha;
${GLSL_COMMON}
void main() {
  vec3 h = hash33(vec3(aSeed * 31.0, 9.0, 2.0));
  float life = 0.35 + 0.35 * h.x;
  float age = fract(uTime / life + h.y) * life;
  vec3 v = uBack * (6.0 + 10.0 * h.z) + uOff * (2.0 + 5.0 * h.x) + vec3(0.0, 3.0 * (h.y - 0.3), 0.0);
  vec3 p = uHand + v * age + vec3(0.0, -6.0 * age * age, 0.0);
  vec4 mv = viewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  float k = age / life;
  vAlpha = (1.0 - k) * uAmount;
  gl_PointSize = uScale * (0.02 + 0.03 * h.y) / max(-mv.z, 0.1);
}
`;

export const SPARK_FRAGMENT = /* glsl */ `
uniform vec3 uWarm;
uniform float uFreeze;
varying float vAlpha;
${GLSL_COMMON}
void main() {
  vec2 q = gl_PointCoord * 2.0 - 1.0;
  float a = exp(-dot(q, q) * 4.0) * vAlpha;
  vec3 col = freezeGrade(mix(uWarm, vec3(1.0), 0.6), uFreeze) * a * 2.0;
  gl_FragColor = vec4(linearToOutputTexel(vec4(col, 1.0)).rgb, 0.0);
}
`;
