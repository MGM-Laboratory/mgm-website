import { GLSL_COMMON } from "./common";
import { SPACE_GLSL } from "./space.glsl";

/**
 * The Edge's sky: a Gargantua-like black hole drawn by a full-screen shader
 * (research/inspiration.md 3.3, our own code from textbook relativity).
 *
 * Units: the Schwarzschild radius is 1. A light ray around a non-spinning
 * hole stays in one plane, and in that plane u = 1 / r obeys
 * u'' + u = 1.5 u^2 (the Binet equation for light, primes in the angle phi).
 * Each pixel's ray is marched in its own plane with velocity Verlet: the
 * horizon (u > 1) is black, every crossing of the disk plane (y = 0 in the
 * hole's frame) inside the disk adds the disk's light (it is thin and only
 * partly opaque, so the images behind it show through), and a ray that gets
 * far enough away samples the starfield in the direction it leaves in. The
 * far side of the disk lensed over the top and under the bottom, the photon
 * ring and the bent stars all come out of the same march.
 *
 * Steps adapt: a ray heading out takes steps proportional to its distance,
 * so most of the screen costs a few steps and only rays that pass the hole
 * take the full count (`uSteps`, by tier).
 *
 * The cursor carries a small lens of its own (`uLens`): a point mass in
 * front of the camera, so starlight, the disk and the shadow bend into an
 * Einstein ring around it. A tap sends a ripple of light out through the
 * disk (`uRipple`).
 */
export const EDGE_HOLE_FRAGMENT = /* glsl */ `
uniform float uTime;
uniform float uFreeze;
uniform mat3 uCamRot;
uniform vec2 uTan;
uniform vec3 uCamPos;
uniform mat3 uToHole;
uniform vec3 uHolePos;
uniform float uHoleScale;
uniform int uSteps;
uniform float uStep;
uniform vec3 uSpace;
uniform vec3 uSpaceBand;
uniform vec3 uDiskHot;
uniform vec3 uDiskBody;
uniform vec3 uDiskEdge;
uniform float uDiskIn;
uniform float uDiskOut;
uniform float uDiskGain;
uniform vec4 uLens;
uniform float uLensPulse;
uniform vec4 uRipple;
uniform float uRing;
uniform vec3 uFilament;
varying vec2 vUv;
${GLSL_COMMON}
${SPACE_GLSL}

const float TAU = 6.2831853;

vec3 gCamHole;

// The disk at a point p (hole frame, on y = 0, radius r): premultiplied colour and opacity.
vec4 disk(vec3 p, float r) {
  float x = (r - uDiskIn) / (uDiskOut - uDiskIn);
  if (x <= 0.0 || x >= 1.0) return vec4(0.0);
  float ri = uDiskIn / r;
  // The thin disk's shape: bright inside, zero at the inner edge, fading out.
  float profile = ri * ri * (1.0 - sqrt(ri)) * 12.5;
  profile *= smoothstep(0.0, 0.035, x) * (1.0 - smoothstep(0.55, 1.0, x));
  // Keplerian streaming: the inner rings turn faster (omega ~ r^-1.5).
  float phi = atan(p.z, p.x);
  float spin = uTime * 2.2 * pow(r / uDiskIn, -1.5);
  float a = phi + spin;
  vec3 q = vec3(cos(a) * r, sin(a) * r, r * 1.7);
  float n = vnoise3(q * 0.55) * 0.55 + vnoise3(q * 1.6 + 7.0) * 0.3 + vnoise3(q * 4.1 + 3.0) * 0.15;
  float lanes = 0.7 + 0.3 * sin(r * 5.3 + n * 3.0) * sin(r * 1.9 + 1.0);
  float streak = 0.55 + 0.9 * n * n;
  float heat = clamp(profile * streak * lanes, 0.0, 2.5);
  // Temperature ramp: white at the hot inner edge, brand yellow, brand red at the rim.
  vec3 col = mix(uDiskEdge, uDiskBody, smoothstep(0.05, 0.5, heat));
  col = mix(col, uDiskHot, smoothstep(0.62, 1.35, heat));
  // A touch of beaming: the side that turns toward us is brighter (the film left it out; we keep a hint).
  vec3 vel = normalize(vec3(p.z, 0.0, -p.x));
  float toward = dot(vel, normalize(gCamHole - p));
  heat *= 1.0 + 0.34 * toward;
  // A tap's ripple: a ring of light running outward through the disk.
  float ripple = uRipple.z * exp(-pow((r - uRipple.x) * 1.6, 2.0)) * exp(-uRipple.y * 1.4);
  vec3 light = col * heat * uDiskGain + uDiskHot * ripple * 1.4;
  float alpha = clamp(heat * 0.75 + ripple * 0.3, 0.0, 0.9);
  return vec4(light, alpha);
}

vec3 sky(vec3 d) {
  return nebula(d, uSpace, uSpaceBand, uFilament) + stars(d);
}

void main() {
  vec2 ndc = vUv * 2.0 - 1.0;
  vec3 view = normalize(uCamRot * vec3(ndc.x * uTan.x, ndc.y * uTan.y, -1.0));
  // The cursor's lens (a point mass in front of the camera): the image at angle th
  // from its centre shows the light from angle th - E^2 / th (inside the ring, the far side).
  if (uLens.w > 0.0) {
    vec3 L = uLens.xyz;
    float c = clamp(dot(view, L), -1.0, 1.0);
    float th = acos(c);
    vec3 side = view - L * c;
    float sl = length(side);
    if (sl > 1e-5 && th < 0.6) {
      side /= sl;
      float E = (0.026 + 0.03 * uLensPulse) * uLens.w;
      float beta = th - E * E / max(th, 1e-4);
      view = normalize(L * cos(beta) + side * sin(beta));
    }
  }
  // Into the hole's frame and units.
  vec3 c = uToHole * ((uCamPos - uHolePos) / uHoleScale);
  gCamHole = c;
  vec3 d = normalize(uToHole * view);
  float rc = length(c);
  vec3 e1 = c / rc;
  vec3 perp = d - e1 * dot(d, e1);
  float pl = length(perp);
  vec3 col = vec3(0.0);
  float alpha = 0.0;
  vec3 outDir = d;
  bool captured = false;
  float b = rc * pl;
  if (pl < 1e-5) {
    captured = dot(d, e1) < 0.0;
  } else {
    vec3 e2 = perp / pl;
    // u = 1/r, w = du/dphi at the camera.
    float u = 1.0 / rc;
    float w = -dot(d, e1) / (rc * pl);
    float cp = 1.0;
    float sp = 0.0;
    float sPrev = e1.y;
    float uPrev = u;
    float uFar = 0.25 / rc;
    for (int i = 0; i < 240; i++) {
      if (i >= uSteps) break;
      // Outward rays step in proportion to their distance (u / |w|); the rest take the full step.
      float h = w < 0.0 ? clamp(0.4 * u / max(-w, 1e-4), 0.004, uStep) : uStep;
      float f0 = 1.5 * u * u - u;
      float un = u + w * h + 0.5 * f0 * h * h;
      float f1 = 1.5 * un * un - un;
      w += 0.5 * (f0 + f1) * h;
      uPrev = u;
      u = un;
      float ch = cos(h);
      float sh = sin(h);
      float cn = cp * ch - sp * sh;
      sp = sp * ch + cp * sh;
      cp = cn;
      if (u >= 1.0) {
        captured = true;
        break;
      }
      // A crossing of the disk plane between the last step and this one.
      float sNow = cp * e1.y + sp * e2.y;
      if (sNow * sPrev < 0.0 && alpha < 0.98) {
        float k = sPrev / (sPrev - sNow);
        float ux = mix(uPrev, u, k);
        if (ux > 0.0) {
          float r = 1.0 / ux;
          // The crossing point, from the angle (interpolated between the two steps).
          vec2 csx = normalize(mix(vec2(cp * ch + sp * sh, sp * ch - cp * sh), vec2(cp, sp), k));
          vec3 p = (csx.x * e1 + csx.y * e2) * r;
          vec4 dk = disk(p, r);
          col += (1.0 - alpha) * dk.rgb;
          alpha += (1.0 - alpha) * dk.a;
        }
      }
      sPrev = sNow;
      if (u <= uFar && w < 0.0) break;
      if (u <= 0.0) break;
    }
    // The direction it leaves in: the path's tangent at the last step.
    outDir = normalize(u * (-sp * e1 + cp * e2) - w * (cp * e1 + sp * e2));
  }
  if (!captured && alpha < 0.999) col += (1.0 - alpha) * sky(outDir * uToHole);
  // The photon ring: a thin line of light at the shadow's edge (b = 3 sqrt(3) / 2).
  float ring = exp(-abs(b - 2.598) * 48.0) * uRing;
  col += uDiskHot * ring * (0.9 + 0.1 * sin(uTime * 1.3));
  col = freezeGrade(col, uFreeze);
  gl_FragColor = linearToOutputTexel(vec4(col, 1.0));
}
`;
